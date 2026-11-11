-- 140_account_deletion_review_queue_image_manifest.sql
-- Review queue payloads retain imageUrl snapshots outside the pins table.
begin;

create or replace function public.materialize_account_deletion_storage_manifest(
  p_job_id uuid,
  p_claim_token uuid,
  p_supabase_url text
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
  if p_supabase_url is null
     or p_supabase_url !~ '^(https://[^/]+/?|http://(localhost|127\.0\.0\.1)(:[0-9]+)?/?)$' then
    raise exception 'invalid configured Supabase project URL';
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
    select public.managed_pin_image_object_path_for_project(pin.image_url,p_supabase_url) as object_path
      from public.pins pin
      join public.boards b on b.id = pin.board_id
      join public.projects p on p.id = b.project_id
     where p.user_id = v_user_id

    union

    select public.managed_pin_image_object_path_for_project(s.snapshot_image_url,p_supabase_url)
      from public.pin_schedules s
     where s.user_id = v_user_id::text

    union

    select public.managed_pin_image_object_path_for_project(t.storage_url,p_supabase_url)
      from public.pin_generation_tasks t
     where t.user_id = v_user_id::text

    union

    select public.managed_pin_image_object_path_for_project(g.storage_url,p_supabase_url)
      from public.pin_regeneration_requests g
     where g.user_id = v_user_id::text

    union

    select public.managed_pin_image_object_path_for_project(item.value ->> 'image_url',p_supabase_url)
      from public.pin_generation_requests r
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(r.pins) = 'array' then r.pins else '[]'::jsonb end
      ) as item(value)
     where r.user_id = v_user_id::text

    union

    select public.managed_pin_image_object_path_for_project(q.payload ->> 'imageUrl',p_supabase_url)
      from public.pin_review_queue q
     where q.user_id = v_user_id::text

    union

    select public.managed_pin_image_object_path_for_project(q.payload ->> 'image_url',p_supabase_url)
      from public.pin_review_queue q
     where q.user_id = v_user_id::text
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

revoke all on function public.materialize_account_deletion_storage_manifest(uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.materialize_account_deletion_storage_manifest(uuid,uuid,text)
  to service_role;

commit;
