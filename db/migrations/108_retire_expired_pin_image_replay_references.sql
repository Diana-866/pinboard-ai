-- 108_retire_expired_pin_image_replay_references.sql
-- Atomically erase expired replay URLs, then release only queue paths with no
-- remaining durable DB references. This migration does not call Storage.
create or replace function public.retire_expired_pin_image_replay_references(
  p_limit integer default 50
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_generation public.pin_generation_requests%rowtype;
  v_regeneration public.pin_regeneration_requests%rowtype;
  v_generation_count integer := 0;
  v_regeneration_count integer := 0;
  v_released_count integer := 0;
  v_remaining integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid replay retirement limit';
  end if;

  for v_generation in
    select r.* from public.pin_generation_requests r
     where r.status = 'completed' and r.replay_expired_at is not null
       and (r.pins is distinct from '[]'::jsonb or exists (\n         select 1 from public.pin_generation_tasks t\n          where t.generation_request_id = r.id and t.storage_url is not null\n       ))
     order by r.replay_expired_at, r.id
     limit p_limit for update skip locked
  loop
    -- The tombstone is checked before replay in begin_pin_generation_request;
    -- clearing these URLs therefore cannot change the response for this key.
    update public.pin_generation_tasks
       set storage_url = null, updated_at = clock_timestamp()
     where generation_request_id = v_generation.id and storage_url is not null;
    update public.pin_generation_requests
       set pins = '[]'::jsonb, updated_at = clock_timestamp()
     where id = v_generation.id and replay_expired_at is not null;
    v_generation_count := v_generation_count + 1;
  end loop;

  v_remaining := greatest(0, p_limit - v_generation_count);
  for v_regeneration in
    select r.* from public.pin_regeneration_requests r
     where r.status = 'completed' and r.replay_expired_at is not null
       and (r.storage_url is not null or r.result_pin is not null)
     order by r.replay_expired_at, r.id
     limit v_remaining for update skip locked
  loop
    update public.pin_regeneration_requests
       set storage_url = null, result_pin = null, updated_at = clock_timestamp()
     where id = v_regeneration.id and replay_expired_at is not null;
    v_regeneration_count := v_regeneration_count + 1;
  end loop;

  -- A path is eligible only after every reference has actually been retired.
  -- Keep active pins and non-cancelled schedules as permanent blockers, and
  -- include journals of every status (not just completed rows).
  with releasable as (
    select q.bucket_id, q.object_path
      from public.pin_image_retention_queue q
     where q.state = 'awaiting_reference_retirement'
       and not exists (
         select 1 from public.pins p
          where public.managed_pin_image_object_path(p.image_url) = q.object_path
       )
       and not exists (
         select 1 from public.pin_schedules s
          where s.status <> 'cancelled'
            and public.managed_pin_image_object_path(s.snapshot_image_url) = q.object_path
       )
       and not exists (
         select 1 from public.pin_generation_tasks t
          where public.managed_pin_image_object_path(t.storage_url) = q.object_path
       )
       and not exists (
         select 1 from public.pin_generation_requests r
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(r.pins) = 'array' then r.pins else '[]'::jsonb end
          ) item(value)
         where public.managed_pin_image_object_path(item.value ->> 'image_url') = q.object_path
       )
       and not exists (
         select 1 from public.pin_regeneration_requests r
          where public.managed_pin_image_object_path(r.storage_url) = q.object_path
             or public.managed_pin_image_object_path(r.result_pin ->> 'image_url') = q.object_path
       )
     order by q.created_at, q.object_path
     limit p_limit
  )
  update public.pin_image_retention_queue q
     set state = 'pending', next_attempt_at = clock_timestamp(),
         updated_at = clock_timestamp()
    from releasable r
   where q.bucket_id = r.bucket_id and q.object_path = r.object_path
     and q.state = 'awaiting_reference_retirement';
  get diagnostics v_released_count = row_count;

  return jsonb_build_object(
    'retired_generation_requests', v_generation_count,
    'retired_regeneration_requests', v_regeneration_count,
    'queue_paths_released', v_released_count,
    'storage_deletion_started', false
  );
end;
$function$;

revoke all on function public.retire_expired_pin_image_replay_references(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.retire_expired_pin_image_replay_references(integer)
  to service_role;
