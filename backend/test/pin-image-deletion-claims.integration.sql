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
       'public.begin_pin_image_upload(text,text,integer)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.begin_pin_image_upload(text,text,integer)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.finalize_pin_image_upload(text,text,uuid,boolean,text)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.finalize_pin_image_upload(text,text,uuid,boolean,text)', 'EXECUTE')
     or has_function_privilege('anon',
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
       'public.begin_pin_image_upload(text,text,integer)', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.finalize_pin_image_upload(text,text,uuid,boolean,text)', 'EXECUTE')
     or not has_function_privilege('service_role',
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
       'trg_pin_generation_tasks_image_reference_guard',
       'trg_pin_regeneration_requests_image_reference_guard'
     );
  if v_trigger_count <> 4 then
    raise exception 'expected 4 image reference guard triggers, found %', v_trigger_count;
  end if;
end;
$body$;


-- Upload reservations serialize byte writes with deletion claims and prevent
-- overwriting an object while any durable row references it.
do $body$
declare
  v_user_id uuid := gen_random_uuid();
  v_project_id uuid := gen_random_uuid();
  v_board_id uuid := gen_random_uuid();
  v_pin_id uuid := gen_random_uuid();
  v_path text := 'pins/1730000000002-ab12cd34.webp';
  v_url text := 'https://project.supabase.co/storage/v1/object/public/pin-images/pins/1730000000002-ab12cd34.webp';
  v_reservation jsonb;
  v_claim jsonb;
  v_upload_token uuid;
  v_delete_token uuid;
begin
  insert into public.users(id, email) values (v_user_id, v_user_id::text || '@pin-image-upload-test.invalid');
  insert into public.projects(id, user_id) values (v_project_id, v_user_id);
  insert into public.boards(id, project_id) values (v_board_id, v_project_id);

  v_reservation := public.begin_pin_image_upload('pin-images', v_path, 60);
  if coalesce((v_reservation ->> 'reserved')::boolean, false) is not true then
    raise exception 'initial upload reservation was not granted: %', v_reservation;
  end if;
  v_upload_token := (v_reservation ->> 'upload_token')::uuid;

  -- Expiry is diagnostic only: a remote upload may still complete late.
  update public.pin_image_object_lifecycle
     set claim_expires_at = now() - interval '1 second'
   where bucket_id = 'pin-images' and object_path = v_path;
  v_reservation := public.begin_pin_image_upload('pin-images', v_path, 60);
  if coalesce((v_reservation ->> 'reserved')::boolean, false) is not false
     or v_reservation ->> 'reason' <> 'upload_in_progress' then
    raise exception 'expired upload reservation was unsafely reopened: %', v_reservation;
  end if;

  v_claim := public.claim_pin_image_deletion('pin-images', v_path, 60);
  if coalesce((v_claim ->> 'claimed')::boolean, false) is not false
     or v_claim ->> 'reason' <> 'upload_in_progress' then
    raise exception 'deletion was not blocked by an active upload: %', v_claim;
  end if;

  insert into public.pins(id, board_id) values (v_pin_id, v_board_id);
  begin
    update public.pins set image_url = v_url where id = v_pin_id;
    raise exception 'reference write was accepted during upload';
  exception when sqlstate '55000' then
    null;
  end;

  if not public.finalize_pin_image_upload('pin-images', v_path, v_upload_token, true, null) then
    raise exception 'upload reservation could not be finalized';
  end if;

  update public.pins set image_url = v_url where id = v_pin_id;
  v_reservation := public.begin_pin_image_upload('pin-images', v_path, 60);
  if coalesce((v_reservation ->> 'reserved')::boolean, false) is not false
     or v_reservation ->> 'reason' <> 'referenced' then
    raise exception 'upload reservation allowed overwriting a referenced image: %', v_reservation;
  end if;

  update public.pins set image_url = null where id = v_pin_id;
  v_claim := public.claim_pin_image_deletion('pin-images', v_path, 60);
  if coalesce((v_claim ->> 'claimed')::boolean, false) is not true then
    raise exception 'image was not claimable after reference removal: %', v_claim;
  end if;
  v_delete_token := (v_claim ->> 'claim_token')::uuid;
  if not public.finalize_pin_image_deletion('pin-images', v_path, v_delete_token, true, null) then
    raise exception 'deletion claim could not be finalized after upload lifecycle test';
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


-- A managed pin URL is registered transactionally by the reference trigger.
do $body$
declare
  v_user_id uuid := gen_random_uuid();
  v_project_id uuid := gen_random_uuid();
  v_board_id uuid := gen_random_uuid();
  v_pin_id uuid := gen_random_uuid();
  v_path text := 'pins/1730000000000-ab12cd34.webp';
  v_url text := 'https://project.supabase.co/storage/v1/object/public/pin-images/pins/1730000000000-ab12cd34.webp';
  v_result jsonb;
  v_token uuid;
begin
  insert into public.users(id, email) values (v_user_id, v_user_id::text || '@pin-image-test.invalid');
  insert into public.projects(id, user_id) values (v_project_id, v_user_id);
  insert into public.boards(id, project_id) values (v_board_id, v_project_id);
  insert into public.pins(id, board_id, image_url) values (v_pin_id, v_board_id, v_url);

  if not exists (
    select 1 from public.pin_image_object_lifecycle
     where bucket_id = 'pin-images' and object_path = v_path and state = 'active'
  ) then
    raise exception 'pin reference trigger did not register the managed object';
  end if;

  v_result := public.claim_pin_image_deletion('pin-images', v_path, 60);
  if coalesce((v_result ->> 'claimed')::boolean, false) is not false
     or v_result ->> 'reason' <> 'referenced' then
    raise exception 'image deletion claim ignored an existing pin reference: %', v_result;
  end if;

  delete from public.pins where id = v_pin_id;
  v_result := public.claim_pin_image_deletion('pin-images', v_path, 60);
  if coalesce((v_result ->> 'claimed')::boolean, false) is not true then
    raise exception 'image deletion was not claimable after pin reference removal: %', v_result;
  end if;
  v_token := (v_result ->> 'claim_token')::uuid;

  if not public.finalize_pin_image_deletion('pin-images', v_path, v_token, true, null) then
    raise exception 'pin image deletion claim could not be finalized after reference removal';
  end if;
end;
$body$;


-- Schedule snapshots and generation journal URLs are durable references too.
do $body$
declare
  v_user_id uuid := gen_random_uuid();
  v_project_id uuid := gen_random_uuid();
  v_board_id uuid := gen_random_uuid();
  v_pin_id uuid := gen_random_uuid();
  v_request_id bigint;
  v_schedule_path text := 'pins/1730000000001-ab12cd34.webp';
  v_schedule_url text := 'https://project.supabase.co/storage/v1/object/public/pin-images/pins/1730000000001-ab12cd34.webp';
  v_task_path text := 'pins/generation-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png';
  v_task_url text := 'https://project.supabase.co/storage/v1/object/public/pin-images/pins/generation-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png';
  v_regen_path text := 'pins/generation-cccccccccccccccccccccccccccccccc.webp';
  v_regen_url text := 'https://project.supabase.co/storage/v1/object/public/pin-images/pins/generation-cccccccccccccccccccccccccccccccc.webp';
  v_result jsonb;
  v_token uuid;
begin
  insert into public.users(id, email) values (v_user_id, v_user_id::text || '@pin-image-schedule-test.invalid');
  insert into public.projects(id, user_id) values (v_project_id, v_user_id);
  insert into public.boards(id, project_id) values (v_board_id, v_project_id);
  insert into public.pins(id, board_id) values (v_pin_id, v_board_id);

  insert into public.pin_schedules(user_id, pin_id, scheduled_at, snapshot_image_url)
  values (v_user_id::text, v_pin_id, now() + interval '1 day', v_schedule_url);

  if not exists (
    select 1 from public.pin_image_object_lifecycle
     where bucket_id = 'pin-images' and object_path = v_schedule_path and state = 'active'
  ) then
    raise exception 'schedule snapshot trigger did not register the managed object';
  end if;

  v_result := public.claim_pin_image_deletion('pin-images', v_schedule_path, 60);
  if coalesce((v_result ->> 'claimed')::boolean, false) is not false
     or v_result ->> 'reason' <> 'referenced' then
    raise exception 'image deletion claim ignored an active schedule snapshot: %', v_result;
  end if;

  update public.pin_schedules set status = 'cancelled' where pin_id = v_pin_id;
  v_result := public.claim_pin_image_deletion('pin-images', v_schedule_path, 60);
  if coalesce((v_result ->> 'claimed')::boolean, false) is not true then
    raise exception 'cancelled schedule snapshot still blocked image deletion: %', v_result;
  end if;
  v_token := (v_result ->> 'claim_token')::uuid;
  if not public.finalize_pin_image_deletion('pin-images', v_schedule_path, v_token, true, null) then
    raise exception 'cancelled schedule image claim could not be finalized';
  end if;

  insert into public.pin_generation_requests(
    user_id, board_id, idempotency_key, status, request_fingerprint
  ) values (
    v_user_id::text, v_board_id, 'pin-image-claim-test-001', 'processing', 'test-fingerprint'
  ) returning id into v_request_id;

  insert into public.pin_generation_tasks(
    generation_request_id, user_id, board_id, task_index,
    title, prompt, model, aspect_ratio, storage_url
  ) values (
    v_request_id, v_user_id::text, v_board_id, 1,
    'Lifecycle test', 'Lifecycle test prompt', 'test-model', '2:3', v_task_url
  );

  update public.pin_generation_requests set status = 'completed' where id = v_request_id;
  v_result := public.claim_pin_image_deletion('pin-images', v_task_path, 60);
  if coalesce((v_result ->> 'claimed')::boolean, false) is not false
     or v_result ->> 'reason' <> 'referenced' then
    raise exception 'terminal generation journal did not retain its image reference: %', v_result;
  end if;

  delete from public.pin_generation_tasks where generation_request_id = v_request_id;
  v_result := public.claim_pin_image_deletion('pin-images', v_task_path, 60);
  if coalesce((v_result ->> 'claimed')::boolean, false) is not true then
    raise exception 'generation image was not claimable after journal row removal: %', v_result;
  end if;
  v_token := (v_result ->> 'claim_token')::uuid;
  if not public.finalize_pin_image_deletion('pin-images', v_task_path, v_token, true, null) then
    raise exception 'generation image claim could not be finalized after journal removal';
  end if;

  -- The single-pin regeneration journal is a separate durable recovery
  -- source and must prevent deletion even when the live pin is later removed.
  insert into public.pin_regeneration_requests(
    user_id, pin_id, idempotency_key, request_fingerprint,
    model, prompt, amount, storage_url
  ) values (
    v_user_id::text, v_pin_id, 'pin-image-regen-claim-test-001',
    repeat('a', 64), 'test-model', 'test prompt', 1, v_regen_url
  );

  if not exists (
    select 1 from public.pin_image_object_lifecycle
     where bucket_id = 'pin-images' and object_path = v_regen_path and state = 'active'
  ) then
    raise exception 'regeneration journal trigger did not register the managed object';
  end if;

  update public.pins set image_url = null where id = v_pin_id;
  v_result := public.claim_pin_image_deletion('pin-images', v_regen_path, 60);
  if coalesce((v_result ->> 'claimed')::boolean, false) is not false
     or v_result ->> 'reason' <> 'referenced' then
    raise exception 'image deletion claim ignored the regeneration journal reference: %', v_result;
  end if;

  delete from public.pin_regeneration_requests
   where idempotency_key = 'pin-image-regen-claim-test-001';
  v_result := public.claim_pin_image_deletion('pin-images', v_regen_path, 60);
  if coalesce((v_result ->> 'claimed')::boolean, false) is not true then
    raise exception 'regeneration image was not claimable after journal removal: %', v_result;
  end if;
  v_token := (v_result ->> 'claim_token')::uuid;
  if not public.finalize_pin_image_deletion('pin-images', v_regen_path, v_token, true, null) then
    raise exception 'regeneration image claim could not be finalized after journal removal';
  end if;
end;
$body$;
