-- Pin image deletion-claim schema contract. Run after migration 070.
do $body$
declare
  v_path text;
  v_trigger_count integer;
begin
  v_path := public.managed_pin_image_object_path(
    'https://project.supabase.co/storage/v1/object/public/pin-images/pins/1730000000000-ab12cd34.webp?cache=1'
  );
  if v_path is distinct from 'pins/1730000000000-ab12cd34.webp' then
    raise exception 'managed object path parser failed for a valid public URL';
  end if;

  if public.managed_pin_image_object_path(
    'https://project.supabase.co/storage/v1/object/public/pin-images/pins/../../secrets.webp'
  ) is not null then
    raise exception 'managed object path parser accepted traversal';
  end if;

  if public.managed_pin_image_object_path(
    'https://project.supabase.co/storage/v1/object/public/other/pins/1730000000000-ab12cd34.webp'
  ) is not null then
    raise exception 'managed object path parser accepted another bucket';
  end if;

  if has_function_privilege('anon',
       'public.claim_pin_image_deletion(text,text,integer)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.claim_pin_image_deletion(text,text,integer)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.finalize_pin_image_deletion(text,text,uuid,boolean,text)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.finalize_pin_image_deletion(text,text,uuid,boolean,text)', 'EXECUTE') then
    raise exception 'untrusted role can execute pin image lifecycle RPC';
  end if;

  if not has_function_privilege('service_role',
       'public.claim_pin_image_deletion(text,text,integer)', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.finalize_pin_image_deletion(text,text,uuid,boolean,text)', 'EXECUTE') then
    raise exception 'service_role is missing pin image lifecycle RPC permission';
  end if;

  if has_table_privilege('service_role', 'public.pin_image_object_lifecycle', 'SELECT')
     or has_table_privilege('service_role', 'public.pin_image_object_lifecycle', 'UPDATE') then
    raise exception 'service_role has direct lifecycle table access';
  end if;

  select count(*) into v_trigger_count
    from pg_trigger
   where not tgisinternal
     and tgname in (
       'trg_pins_image_reference_guard',
       'trg_pin_schedules_image_reference_guard',
       'trg_pin_generation_tasks_image_reference_guard'
     );
  if v_trigger_count <> 3 then
    raise exception 'expected 3 image reference guard triggers, found %', v_trigger_count;
  end if;
end;
$body$;


-- A live claim is exclusive. An expired claim can be retried with a new
-- fencing token only while no durable references exist.
do $body$
declare
  v_path text := 'pins/generation-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp';
  v_first_token uuid;
  v_second_token uuid;
  v_result jsonb;
begin
  v_result := public.claim_pin_image_deletion('pin-images', v_path, 60);
  if coalesce((v_result ->> 'claimed')::boolean, false) is not true then
    raise exception 'first deletion claim was not granted: %', v_result;
  end if;
  v_first_token := (v_result ->> 'claim_token')::uuid;

  v_result := public.claim_pin_image_deletion('pin-images', v_path, 60);
  if coalesce((v_result ->> 'claimed')::boolean, false) is not false
     or v_result ->> 'reason' <> 'already_claimed' then
    raise exception 'concurrent live claim was not rejected: %', v_result;
  end if;

  update public.pin_image_object_lifecycle
     set claim_expires_at = now() - interval '1 second'
   where bucket_id = 'pin-images' and object_path = v_path;

  v_result := public.claim_pin_image_deletion('pin-images', v_path, 60);
  if coalesce((v_result ->> 'claimed')::boolean, false) is not true then
    raise exception 'expired deletion claim was not safely retried: %', v_result;
  end if;
  v_second_token := (v_result ->> 'claim_token')::uuid;

  if v_second_token = v_first_token then
    raise exception 'expired claim retry did not rotate the fencing token';
  end if;

  if public.finalize_pin_image_deletion(
       'pin-images', v_path, v_first_token, true, null
     ) then
    raise exception 'stale worker unexpectedly finalized a newer claim';
  end if;

  if not public.finalize_pin_image_deletion(
       'pin-images', v_path, v_second_token, true, null
     ) then
    raise exception 'current claim could not be finalized';
  end if;

  v_result := public.claim_pin_image_deletion('pin-images', v_path, 60);
  if coalesce((v_result ->> 'claimed')::boolean, false) is not false
     or v_result ->> 'reason' <> 'already_deleted' then
    raise exception 'deleted object was claimable again: %', v_result;
  end if;
end;
$body$;
