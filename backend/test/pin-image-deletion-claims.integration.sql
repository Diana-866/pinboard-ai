-- Pin image deletion-claim schema contract. Run after migrations 070, 083, 090 and 098.
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
       'public.finalize_pin_image_deletion(text,text,uuid,boolean,text)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.list_stale_pin_image_uploads(integer,integer)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.list_stale_pin_image_uploads(integer,integer)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.quarantine_stale_pin_image_upload(text,text,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.quarantine_stale_pin_image_upload(text,text,uuid)', 'EXECUTE') then
    raise exception 'untrusted role can execute pin image lifecycle RPC';
  end if;

  if not has_function_privilege('service_role',
       'public.begin_pin_image_upload(text,text,integer)', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.finalize_pin_image_upload(text,text,uuid,boolean,text)', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.claim_pin_image_deletion(text,text,integer)', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.finalize_pin_image_deletion(text,text,uuid,boolean,text)', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.list_stale_pin_image_uploads(integer,integer)', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.quarantine_stale_pin_image_upload(text,text,uuid)', 'EXECUTE') then
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



-- Stale upload inventory is bounded and exposes only rows requiring review.
do $body$
declare
  v_path text := 'pins/generation-dddddddddddddddddddddddddddddddd.webp';
  v_token uuid := gen_random_uuid();
  v_count integer;
  v_result jsonb;
begin
  insert into public.pin_image_object_lifecycle(
    bucket_id, object_path, state, claim_token, claim_expires_at, attempts
  ) values (
    'pin-images', v_path, 'uploading', v_token, now() - interval '30 minutes', 1
  );

  select count(*) into v_count
    from public.list_stale_pin_image_uploads(900, 50) s
   where s.object_path = v_path and s.upload_token = v_token;
  if v_count <> 1 then
    raise exception 'stale upload inventory did not return the expected fenced object';
  end if;

  if public.quarantine_stale_pin_image_upload('pin-images', v_path, v_token) is not true then
    raise exception 'stale upload path was not quarantined';
  end if;

  if not exists (
    select 1 from public.pin_image_object_lifecycle
     where bucket_id = 'pin-images' and object_path = v_path
       and state = 'quarantined' and claim_token is null and claim_expires_at is null
  ) then
    raise exception 'quarantine did not permanently retire the stale upload path';
  end if;

  if public.finalize_pin_image_upload('pin-images', v_path, v_token, true, null) is not false then
    raise exception 'stale worker token finalized a quarantined upload';
  end if;

  v_result := public.begin_pin_image_upload('pin-images', v_path, 60);
  if coalesce((v_result ->> 'reserved')::boolean, false) is not false
     or v_result ->> 'reason' <> 'path_quarantined' then
    raise exception 'quarantined path was reused for another upload: %', v_result;
  end if;

  v_result := public.claim_pin_image_deletion('pin-images', v_path, 60);
  if coalesce((v_result ->> 'claimed')::boolean, false) is not false
     or v_result ->> 'reason' <> 'path_quarantined' then
    raise exception 'quarantined path was unexpectedly deleted: %', v_result;
  end if;

  begin
    perform * from public.list_stale_pin_image_uploads(60, 50);
    raise exception 'stale inventory accepted a too-short safety threshold';
  exception when raise_exception then
    if sqlerrm = 'stale inventory accepted a too-short safety threshold' then
      raise;
    end if;
  end;
end;
$body$;

-- A live claim is exclusive. An expired external deletion is permanently
-- quarantined because the original Storage request may still complete late.
do $body$
declare
  v_path text := 'pins/generation-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp';
  v_first_token uuid;
  v_result jsonb;
  v_state text;
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
  if coalesce((v_result ->> 'claimed')::boolean, false) is not false
     or v_result ->> 'reason' <> 'path_quarantined' then
    raise exception 'expired deletion claim was not permanently quarantined: %', v_result;
  end if;

  select state into v_state
    from public.pin_image_object_lifecycle
   where bucket_id = 'pin-images' and object_path = v_path;
  if v_state <> 'quarantined' then
    raise exception 'expired deletion path was not retired: %', v_state;
  end if;

  if public.finalize_pin_image_deletion(
       'pin-images', v_path, v_first_token, true, null
     ) then
    raise exception 'stale worker finalized a quarantined deletion';
  end if;

  v_result := public.begin_pin_image_upload('pin-images', v_path, 60);
  if coalesce((v_result ->> 'reserved')::boolean, false) is not false
     or v_result ->> 'reason' <> 'path_quarantined' then
    raise exception 'expired deletion path was reused for upload: %', v_result;
  end if;

  v_result := public.claim_pin_image_deletion('pin-images', v_path, 60);
  if coalesce((v_result ->> 'claimed')::boolean, false) is not false
     or v_result ->> 'reason' <> 'path_quarantined' then
    raise exception 'quarantined deletion path was claimed again: %', v_result;
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


-- A path that is being deleted, already deleted, or quarantined must never
-- become a new durable pin reference.
do $body$
declare
  v_user_id uuid := gen_random_uuid();
  v_project_id uuid := gen_random_uuid();
  v_board_id uuid := gen_random_uuid();
  v_pin_id uuid := gen_random_uuid();
  v_states text[] := array['deleting', 'deleted', 'quarantined'];
  v_state text;
  v_path text;
  v_url text;
  v_token uuid := gen_random_uuid();
  v_result jsonb;
begin
  insert into public.users(id, email)
  values (v_user_id, v_user_id::text || '@pin-image-fenced-reference-test.invalid');
  insert into public.projects(id, user_id) values (v_project_id, v_user_id);
  insert into public.boards(id, project_id) values (v_board_id, v_project_id);
  insert into public.pins(id, board_id) values (v_pin_id, v_board_id);

  foreach v_state in array v_states loop
    v_path := case v_state
      when 'deleting' then 'pins/generation-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png'
      when 'deleted' then 'pins/generation-ffffffffffffffffffffffffffffffff.png'
      else 'pins/generation-99999999999999999999999999999999.png'
    end;
    v_url := 'https://project.supabase.co/storage/v1/object/public/pin-images/' || v_path;

    insert into public.pin_image_object_lifecycle(
      bucket_id, object_path, state, claim_token, claim_expires_at
    ) values (
      'pin-images', v_path, v_state,
      case when v_state = 'deleting' then v_token else null end,
      case when v_state = 'deleting' then now() + interval '10 minutes' else null end
    );

    v_result := public.begin_pin_image_upload('pin-images', v_path, 60);
    if coalesce((v_result ->> 'reserved')::boolean, false) is not false then
      raise exception 'upload reservation unexpectedly reused a % image path', v_state;
    end if;
    if v_state = 'deleting' and v_result ->> 'reason' <> 'deletion_in_progress' then
      raise exception 'deleting image path returned unexpected upload reason: %', v_result;
    elsif v_state = 'deleted' and v_result ->> 'reason' <> 'already_deleted' then
      raise exception 'deleted image path was not permanently retired: %', v_result;
    elsif v_state = 'quarantined' and v_result ->> 'reason' <> 'path_quarantined' then
      raise exception 'quarantined image path returned unexpected upload reason: %', v_result;
    end if;

    begin
      update public.pins set image_url = v_url where id = v_pin_id;
      raise exception 'reference write unexpectedly accepted for lifecycle state %', v_state;
    exception when sqlstate '55000' then
      if sqlerrm like 'reference write unexpectedly accepted%' then
        raise;
      end if;
    end;
  end loop;
end;
$body$;

-- AUD-257: backend-generated 128-bit random paths must pass every SQL
-- parser/reservation/deletion guard, while legacy shorter paths remain valid.
do $body$
declare
  v_path text := 'pins/1730000000003-0123456789abcdef0123456789abcdef.webp';
  v_url text := 'https://project.supabase.co/storage/v1/object/public/pin-images/pins/1730000000003-0123456789abcdef0123456789abcdef.webp';
  v_reservation jsonb;
  v_upload_token uuid;
  v_claim jsonb;
  v_delete_token uuid;
begin
  if public.managed_pin_image_object_path(v_url) is distinct from v_path then
    raise exception '128-bit random managed path was not parsed by SQL';
  end if;

  v_reservation := public.begin_pin_image_upload('pin-images', v_path, 60);
  if coalesce((v_reservation ->> 'reserved')::boolean, false) is not true then
    raise exception '128-bit random path was rejected by upload reservation: %', v_reservation;
  end if;
  v_upload_token := (v_reservation ->> 'upload_token')::uuid;

  if not public.finalize_pin_image_upload('pin-images', v_path, v_upload_token, true, null) then
    raise exception '128-bit random path upload reservation did not finalize';
  end if;

  v_claim := public.claim_pin_image_deletion('pin-images', v_path, 60);
  if coalesce((v_claim ->> 'claimed')::boolean, false) is not true then
    raise exception '128-bit random path was rejected by deletion claim: %', v_claim;
  end if;
  v_delete_token := (v_claim ->> 'claim_token')::uuid;

  if not public.finalize_pin_image_deletion('pin-images', v_path, v_delete_token, true, null) then
    raise exception '128-bit random path deletion claim did not finalize';
  end if;
end;
$body$;
