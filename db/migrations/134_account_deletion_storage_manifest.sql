-- 134_account_deletion_storage_manifest.sql
-- Persist exact managed image paths before account-owned rows are erased.
-- This migration inventories only; it never deletes Storage objects or rows.
begin;

create table if not exists public.account_deletion_storage_objects (
  request_id uuid not null references public.account_deletion_requests(id) on delete restrict,
  bucket_id text not null check (bucket_id = 'pin-images'),
  object_path text not null
    check (object_path ~* '^pins/(?:[0-9]+-[a-z0-9]{1,16}|generation-[a-f0-9]{32})\.(?:png|jpe?g|webp|gif)$'),
  state text not null default 'pending'
    check (state in ('pending','deleted','blocked')),
  last_error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (request_id, bucket_id, object_path),
  check (last_error_code is null or length(last_error_code) <= 64)
);

create index if not exists account_deletion_storage_objects_pending_idx
  on public.account_deletion_storage_objects(request_id, state, created_at);

alter table public.account_deletion_storage_objects enable row level security;
revoke all on public.account_deletion_storage_objects from public, anon, authenticated, service_role;

create or replace function public.materialize_account_deletion_storage_manifest(
  p_job_id uuid,
  p_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid;
  v_request_id uuid;
  v_request_state text;
  v_account_status text;
  v_job public.account_deletion_jobs%rowtype;
  v_inserted integer := 0;
  v_total integer := 0;
begin
  if p_job_id is null or p_claim_token is null then
    raise exception 'invalid account deletion storage manifest claim';
  end if;

  select r.user_id, r.id into v_user_id, v_request_id
    from public.account_deletion_jobs j
    join public.account_deletion_requests r on r.id = j.request_id
   where j.id = p_job_id;
  if not found then return jsonb_build_object('recorded', false, 'reason', 'job_missing'); end if;

  -- Match the account-deletion worker's global lock order: owner -> request -> job.
  select u.account_status into v_account_status
    from public.users u where u.id = v_user_id for update;
  if not found or v_account_status <> 'deletion_pending' then
    return jsonb_build_object('recorded', false, 'reason', 'account_not_pending');
  end if;

  select r.state into v_request_state
    from public.account_deletion_requests r where r.id = v_request_id for update;
  if not found or v_request_state <> 'pending' then
    return jsonb_build_object('recorded', false, 'reason', 'request_not_pending');
  end if;

  select * into v_job from public.account_deletion_jobs
   where id = p_job_id for update;
  if not found or v_job.status <> 'running'
     or v_job.claim_token is distinct from p_claim_token
     or v_job.lease_expires_at <= clock_timestamp()
     or v_job.inventory_recorded_at is null then
    return jsonb_build_object('recorded', false, 'reason', 'claim_or_preflight_missing');
  end if;

  with candidate_paths as (
    select public.managed_pin_image_object_path(pin.image_url) as object_path
      from public.pins pin
      join public.boards b on b.id = pin.board_id
      join public.projects p on p.id = b.project_id
     where p.user_id = v_user_id

    union

    select public.managed_pin_image_object_path(s.snapshot_image_url)
      from public.pin_schedules s
     where s.user_id = v_user_id::text

    union

    select public.managed_pin_image_object_path(t.storage_url)
      from public.pin_generation_tasks t
     where t.user_id = v_user_id::text

    union

    select public.managed_pin_image_object_path(g.storage_url)
      from public.pin_regeneration_requests g
     where g.user_id = v_user_id::text

    union

    select public.managed_pin_image_object_path(item.value ->> 'image_url')
      from public.pin_generation_requests r
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(r.pins) = 'array' then r.pins else '[]'::jsonb end
      ) as item(value)
     where r.user_id = v_user_id::text
  )
  insert into public.account_deletion_storage_objects(request_id, bucket_id, object_path)
  select v_request_id, 'pin-images', object_path
    from candidate_paths
   where object_path is not null
  on conflict (request_id, bucket_id, object_path) do nothing;

  get diagnostics v_inserted = row_count;
  select count(*)::integer into v_total
    from public.account_deletion_storage_objects
   where request_id = v_request_id;

  return jsonb_build_object(
    'recorded', true,
    'inserted', v_inserted,
    'total', v_total
  );
end;
$function$;

revoke all on function public.materialize_account_deletion_storage_manifest(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.materialize_account_deletion_storage_manifest(uuid,uuid)
  to service_role;

commit;
