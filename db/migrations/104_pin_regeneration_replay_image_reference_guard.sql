-- 104_pin_regeneration_replay_image_reference_guard.sql
-- Regeneration replay payloads are durable references independently of the
-- storage_url column. Keep deletion and retention inventory aligned with both.
create or replace function public.claim_pin_image_deletion(
  p_bucket_id text,
  p_object_path text,
  p_claim_ttl_seconds integer default 600
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state text;
  v_claim_expires_at timestamptz;
  v_token uuid;
  v_has_reference boolean;
begin
  if p_bucket_id is distinct from 'pin-images'
     or p_object_path is null
     or p_object_path !~* '^pins/(?:[0-9]+-[a-z0-9]{1,32}|generation-[a-f0-9]{32})[.](?:png|jpe?g|webp|gif)$'
     or p_claim_ttl_seconds is null
     or p_claim_ttl_seconds < 60 or p_claim_ttl_seconds > 1800 then
    raise exception 'invalid pin image deletion claim';
  end if;

  insert into public.pin_image_object_lifecycle(bucket_id, object_path, state)
  values (p_bucket_id, p_object_path, 'active')
  on conflict (bucket_id, object_path) do nothing;

  select state, claim_expires_at into v_state, v_claim_expires_at
    from public.pin_image_object_lifecycle
   where bucket_id = p_bucket_id and object_path = p_object_path
   for update;

  if v_state = 'uploading' then
    return jsonb_build_object('claimed', false, 'reason', 'upload_in_progress');
  end if;

  if v_state = 'deleting' then
    if v_claim_expires_at > now() then
      return jsonb_build_object('claimed', false, 'reason', 'already_claimed');
    end if;
    update public.pin_image_object_lifecycle
       set state = 'quarantined', claim_token = null, claim_expires_at = null,
           last_error_code = 'stale_delete_quarantined', updated_at = now()
     where bucket_id = p_bucket_id and object_path = p_object_path
       and state = 'deleting'
       and (claim_expires_at is null or claim_expires_at <= now());
    return jsonb_build_object('claimed', false, 'reason', 'path_quarantined');
  end if;

  if v_state = 'deleted' then
    return jsonb_build_object('claimed', false, 'reason', 'already_deleted');
  end if;
  if v_state = 'quarantined' then
    return jsonb_build_object('claimed', false, 'reason', 'path_quarantined');
  end if;

  select
    exists (select 1 from public.pins p
             where public.managed_pin_image_object_path(p.image_url) = p_object_path)
    or exists (select 1 from public.pin_schedules s
                where s.status <> 'cancelled'
                  and public.managed_pin_image_object_path(s.snapshot_image_url) = p_object_path)
    or exists (select 1 from public.pin_generation_tasks t
                where public.managed_pin_image_object_path(t.storage_url) = p_object_path)
    or exists (select 1 from public.pin_regeneration_requests r
                where public.managed_pin_image_object_path(r.storage_url) = p_object_path)
    or exists (select 1 from public.pin_regeneration_requests r
                where public.managed_pin_image_object_path(r.result_pin ->> 'image_url') = p_object_path)
    into v_has_reference;

  if v_has_reference then
    update public.pin_image_object_lifecycle
       set state = 'active', updated_at = now()
     where bucket_id = p_bucket_id and object_path = p_object_path;
    return jsonb_build_object('claimed', false, 'reason', 'referenced');
  end if;

  v_token := gen_random_uuid();
  update public.pin_image_object_lifecycle
     set state = 'deleting',
         claim_token = v_token,
         claim_expires_at = now() + make_interval(secs => p_claim_ttl_seconds),
         attempts = attempts + 1,
         last_error_code = null,
         updated_at = now()
   where bucket_id = p_bucket_id and object_path = p_object_path;

  return jsonb_build_object(
    'claimed', true,
    'claim_token', v_token,
    'claim_expires_at', now() + make_interval(secs => p_claim_ttl_seconds)
  );
end;
$$;

revoke all on function public.claim_pin_image_deletion(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.claim_pin_image_deletion(text,text,integer)
  to service_role;

create or replace function public.list_pin_image_retention_candidates(
  p_retention_days integer default 90,
  p_limit integer default 100
)
returns table (
  bucket_id text,
  object_path text,
  reference_count bigint,
  source_types text[],
  oldest_reference_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_cutoff timestamptz;
begin
  if p_retention_days is null or p_retention_days < 30 or p_retention_days > 3650
     or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid pin image retention inventory bounds';
  end if;

  v_cutoff := now() - make_interval(days => p_retention_days);

  return query
  with journal_references as (
    select public.managed_pin_image_object_path(t.storage_url) as object_path,
           'generation_task'::text as source_type, t.created_at as referenced_at
      from public.pin_generation_tasks t
      join public.pin_generation_requests r on r.id = t.generation_request_id
     where r.status = 'completed' and r.updated_at <= v_cutoff and t.storage_url is not null

    union all

    select public.managed_pin_image_object_path(item.value ->> 'image_url'),
           'generation_result'::text, r.updated_at
      from public.pin_generation_requests r
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(r.pins) = 'array' then r.pins else '[]'::jsonb end
      ) as item(value)
     where r.status = 'completed' and r.updated_at <= v_cutoff
       and item.value ? 'image_url'

    union all

    select public.managed_pin_image_object_path(g.storage_url),
           'regeneration_result'::text, g.created_at
      from public.pin_regeneration_requests g
     where g.status = 'completed' and g.updated_at <= v_cutoff
       and g.storage_url is not null

    union all

    select public.managed_pin_image_object_path(g.result_pin ->> 'image_url'),
           'regeneration_replay'::text, g.updated_at
      from public.pin_regeneration_requests g
     where g.status = 'completed' and g.updated_at <= v_cutoff
       and jsonb_typeof(g.result_pin) = 'object'
       and g.result_pin ? 'image_url'
  ),
  grouped as (
    select jr.object_path, count(*) as reference_count,
           array_agg(distinct jr.source_type order by jr.source_type) as source_types,
           min(jr.referenced_at) as oldest_reference_at
      from journal_references jr
     where jr.object_path is not null
     group by jr.object_path
  )
  select 'pin-images'::text, grouped.object_path, grouped.reference_count,
         grouped.source_types, grouped.oldest_reference_at
    from grouped
    join public.pin_image_object_lifecycle lifecycle
      on lifecycle.bucket_id = 'pin-images'
     and lifecycle.object_path = grouped.object_path
     and lifecycle.state in ('active', 'delete_failed')
   where not exists (
      select 1 from public.pins p
       where public.managed_pin_image_object_path(p.image_url) = grouped.object_path
    )
     and not exists (
      select 1 from public.pin_schedules s
       where s.status <> 'cancelled'
         and public.managed_pin_image_object_path(s.snapshot_image_url) = grouped.object_path
    )
     and not exists (
      select 1 from public.pin_generation_tasks t
      join public.pin_generation_requests r on r.id = t.generation_request_id
       where public.managed_pin_image_object_path(t.storage_url) = grouped.object_path
         and (r.status <> 'completed' or r.updated_at > v_cutoff)
    )
     and not exists (
      select 1 from public.pin_regeneration_requests g
       where public.managed_pin_image_object_path(g.storage_url) = grouped.object_path
         and (g.status <> 'completed' or g.updated_at > v_cutoff)
    )
     and not exists (
      select 1 from public.pin_regeneration_requests g
       where public.managed_pin_image_object_path(g.result_pin ->> 'image_url') = grouped.object_path
         and (g.status <> 'completed' or g.updated_at > v_cutoff)
    )
     and not exists (
      select 1 from public.pin_generation_requests r
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(r.pins) = 'array' then r.pins else '[]'::jsonb end
      ) as item(value)
       where public.managed_pin_image_object_path(item.value ->> 'image_url') = grouped.object_path
         and (r.status <> 'completed' or r.updated_at > v_cutoff)
    )
   order by grouped.oldest_reference_at asc, grouped.object_path asc
   limit p_limit;
end;
$function$;

revoke all on function public.list_pin_image_retention_candidates(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_pin_image_retention_candidates(integer, integer)
  to service_role;
