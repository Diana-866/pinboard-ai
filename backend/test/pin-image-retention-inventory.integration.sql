-- Read-only inventory coverage for migration 103.
do $body$
declare
  v_user_id uuid := gen_random_uuid();
  v_project_id uuid := gen_random_uuid();
  v_board_id uuid := gen_random_uuid();
  v_pin_id uuid := gen_random_uuid();
  v_request_id bigint;
  v_old_path text := 'pins/generation-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png';
  v_old_url text := 'https://project.supabase.co/storage/v1/object/public/pin-images/pins/generation-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png';
  v_count integer;
  v_result record;
begin
  insert into public.users(id, email)
  values (v_user_id, v_user_id::text || '@pin-image-retention-test.invalid');
  insert into public.projects(id, user_id) values (v_project_id, v_user_id);
  insert into public.boards(id, project_id) values (v_board_id, v_project_id);
  insert into public.pins(id, board_id, image_url) values (v_pin_id, v_board_id, v_old_url);

  insert into public.pin_generation_requests(
    user_id, board_id, idempotency_key, status, request_fingerprint, pins, created_at, updated_at
  ) values (
    v_user_id::text, v_board_id, 'pin-retention-inventory-old-001',
    'completed', repeat('a', 64), jsonb_build_array(jsonb_build_object('image_url', v_old_url)),
    now() - interval '120 days', now() - interval '120 days'
  ) returning id into v_request_id;

  insert into public.pin_generation_tasks(
    generation_request_id, user_id, board_id, task_index, title, prompt, model, aspect_ratio,
    status, storage_url, created_at, updated_at
  ) values (
    v_request_id, v_user_id::text, v_board_id, 1, 'Old image', 'Old image prompt',
    'test-model', '2:3', 'succeeded', v_old_url,
    now() - interval '120 days', now() - interval '120 days'
  );

  -- A current pin reference must keep the old journal path out of the inventory.
  select count(*) into v_count
    from public.list_pin_image_retention_candidates(90, 100)
   where object_path = v_old_path;
  if v_count <> 0 then
    raise exception 'retention inventory included an image still referenced by a pin';
  end if;

  update public.pins set image_url = null where id = v_pin_id;
  select * into v_result
    from public.list_pin_image_retention_candidates(90, 100)
   where object_path = v_old_path;
  if not found then
    raise exception 'old unreferenced completed journal image was not inventoried';
  end if;
  if v_result.reference_count < 2
     or not ('generation_result' = any(v_result.source_types))
     or not ('generation_task' = any(v_result.source_types)) then
    raise exception 'retention inventory omitted generation journal reference sources: %', row_to_json(v_result);
  end if;

  -- A recent/in-progress journal reference to the same object must suppress it.
  insert into public.pin_regeneration_requests(
    user_id, pin_id, idempotency_key, request_fingerprint, model, prompt, amount,
    status, storage_url, created_at, updated_at
  ) values (
    v_user_id::text, v_pin_id, 'pin-retention-inventory-live-001',
    repeat('b', 64), 'test-model', 'Live recovery', 1,
    'processing', v_old_url, now() - interval '120 days', now()
  );
  select count(*) into v_count
    from public.list_pin_image_retention_candidates(90, 100)
   where object_path = v_old_path;
  if v_count <> 0 then
    raise exception 'retention inventory ignored a live regeneration reference';
  end if;

  insert into public.pin_generation_requests(
    user_id, board_id, idempotency_key, status, request_fingerprint, pins
  ) values (
    v_user_id::text, v_board_id, 'pin-retention-inventory-live-generation-001',
    'completed', repeat('c', 64), jsonb_build_array(jsonb_build_object('image_url', v_old_url))
  );
  select count(*) into v_count
    from public.list_pin_image_retention_candidates(90, 100)
   where object_path = v_old_path;
  if v_count <> 0 then
    raise exception 'retention inventory ignored a recent generation replay result';
  end if;

  if has_function_privilege('anon', 'public.list_pin_image_retention_candidates(integer,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.list_pin_image_retention_candidates(integer,integer)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.list_pin_image_retention_candidates(integer,integer)', 'EXECUTE') is false then
    raise exception 'retention inventory RPC privileges are incorrect';
  end if;

  begin
    perform * from public.list_pin_image_retention_candidates(1, 100);
    raise exception 'retention inventory accepted a window below 30 days';
  exception when others then
    if sqlerrm = 'retention inventory accepted a window below 30 days' then raise; end if;
  end;
  begin
    perform * from public.list_pin_image_retention_candidates(90, 101);
    raise exception 'retention inventory accepted a limit above 100';
  exception when others then
    if sqlerrm = 'retention inventory accepted a limit above 100' then raise; end if;
  end;
end;
$body$;
