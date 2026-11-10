-- 107_pin_image_upload_replay_reference_guard.sql
-- A reused managed path must not overwrite an object that remains reachable
-- through either generation or regeneration idempotency replay payload.
create or replace function public.begin_pin_image_upload(
  p_bucket_id text,
  p_object_path text,
  p_upload_ttl_seconds integer default 600
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_state text;
  v_token uuid;
  v_has_reference boolean;
begin
  if p_bucket_id is distinct from 'pin-images'
     or p_object_path is null
     or p_object_path !~* '^pins/(?:[0-9]+-[a-z0-9]{1,32}|generation-[a-f0-9]{32})[.](?:png|jpe?g|webp|gif)$'
     or p_upload_ttl_seconds is null
     or p_upload_ttl_seconds < 60 or p_upload_ttl_seconds > 1800 then
    raise exception 'invalid pin image upload reservation';
  end if;

  insert into public.pin_image_object_lifecycle(bucket_id, object_path, state)
  values (p_bucket_id, p_object_path, 'active')
  on conflict (bucket_id, object_path) do nothing;

  select state into v_state
    from public.pin_image_object_lifecycle
   where bucket_id = p_bucket_id and object_path = p_object_path
   for update;

  if v_state = 'uploading' then
    return jsonb_build_object('reserved', false, 'reason', 'upload_in_progress');
  end if;
  if v_state = 'deleting' then
    return jsonb_build_object('reserved', false, 'reason', 'deletion_in_progress');
  end if;
  if v_state = 'quarantined' then
    return jsonb_build_object('reserved', false, 'reason', 'path_quarantined');
  end if;
  if v_state = 'deleted' then
    return jsonb_build_object('reserved', false, 'reason', 'already_deleted');
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
    or exists (
      select 1
        from public.pin_generation_requests r
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(r.pins) = 'array' then r.pins else '[]'::jsonb end
        ) as item(value)
       where public.managed_pin_image_object_path(item.value ->> 'image_url') = p_object_path
    )
    into v_has_reference;

  if v_has_reference then
    return jsonb_build_object('reserved', false, 'reason', 'referenced');
  end if;

  v_token := gen_random_uuid();
  update public.pin_image_object_lifecycle
     set state = 'uploading',
         claim_token = v_token,
         claim_expires_at = now() + make_interval(secs => p_upload_ttl_seconds),
         attempts = attempts + 1,
         last_error_code = null,
         updated_at = now()
   where bucket_id = p_bucket_id and object_path = p_object_path;

  return jsonb_build_object('reserved', true, 'upload_token', v_token);
end;
$function$;

revoke all on function public.begin_pin_image_upload(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.begin_pin_image_upload(text,text,integer)
  to service_role;
