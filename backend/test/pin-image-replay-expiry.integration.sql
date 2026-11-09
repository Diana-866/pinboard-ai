-- Replay expiry tombstones and durable queue staging for migration 105.
-- This phase never clears journal payloads and never deletes Storage objects.
do $body$
declare
  v_user_id uuid := gen_random_uuid();
  v_project_id uuid := gen_random_uuid();
  v_board_id uuid := gen_random_uuid();
  v_pin_id uuid := gen_random_uuid();
  v_generation_id bigint;
  v_generation_key text := 'pin-expiry-generation-000001';
  v_regeneration_key text := 'pin-expiry-regeneration-0001';
  v_shared_path text := 'pins/generation-abcdefabcdefabcdefabcdefabcdefab.webp';
  v_shared_url text := 'https://project.supabase.co/storage/v1/object/public/pin-images/pins/generation-abcdefabcdefabcdefabcdefabcdefab.webp';
  v_state jsonb;
  v_queue_count integer;
  v_source_types text[];
begin
  insert into public.users(id, email)
  values (v_user_id, v_user_id::text || '@pin-image-expiry-test.invalid');
  insert into public.projects(id, user_id) values (v_project_id, v_user_id);
  insert into public.boards(id, project_id) values (v_board_id, v_project_id);
  insert into public.pins(id, board_id) values (v_pin_id, v_board_id);

  insert into public.pin_generation_requests(
    user_id, board_id, idempotency_key, status, request_fingerprint, pins,
    created_at, updated_at
  ) values (
    v_user_id::text, v_board_id, v_generation_key, 'completed', repeat('a',64),
    jsonb_build_array(jsonb_build_object('image_url',v_shared_url)),
    now()-interval '120 days', now()-interval '120 days'
  ) returning id into v_generation_id;

  insert into public.pin_generation_tasks(
    generation_request_id, user_id, board_id, task_index, title, prompt, model,
    aspect_ratio, status, storage_url, created_at, updated_at
  ) values (
    v_generation_id, v_user_id::text, v_board_id, 1, 'Expired image',
    'Expired image prompt', 'test-model', '2:3', 'succeeded', v_shared_url,
    now()-interval '120 days', now()-interval '120 days'
  );

  insert into public.pin_regeneration_requests(
    user_id, pin_id, idempotency_key, request_fingerprint, model, prompt, amount,
    status, storage_url, result_pin, created_at, updated_at
  ) values (
    v_user_id::text, v_pin_id, v_regeneration_key, repeat('b',64),
    'test-model', 'Expired regeneration', 1, 'completed', v_shared_url,
    jsonb_build_object('id',v_pin_id,'image_url',v_shared_url),
    now()-interval '120 days', now()-interval '120 days'
  );

  -- Old but uncertain requests must never be expired.
  insert into public.pin_generation_requests(
    user_id, board_id, idempotency_key, status, request_fingerprint, pins,
    created_at, updated_at
  ) values (
    v_user_id::text, v_board_id, 'pin-expiry-generation-unknown', 'unknown',
    repeat('c',64), '[]'::jsonb, now()-interval '120 days', now()-interval '120 days'
  );
  insert into public.pin_regeneration_requests(
    user_id, pin_id, idempotency_key, request_fingerprint, model, prompt, amount,
    status, created_at, updated_at
  ) values (
    v_user_id::text, v_pin_id, 'pin-expiry-regeneration-active', repeat('d',64),
    'test-model', 'Uncertain provider outcome', 1, 'processing',
    now()-interval '120 days', now()-interval '120 days'
  );

  v_state := public.expire_pin_image_replay_results(90, 100);
  if (v_state ->> 'expired_generation_requests')::integer < 1
     or (v_state ->> 'expired_regeneration_requests')::integer < 1
     or coalesce((v_state ->> 'deletion_started')::boolean, true)
     or coalesce((v_state ->> 'replay_payloads_cleared')::boolean, true) then
    raise exception 'expiry operation returned an unsafe or incomplete result: %', v_state;
  end if;

  if not exists (
    select 1 from public.pin_generation_requests
     where id = v_generation_id and replay_expired_at is not null
  ) or not exists (
    select 1 from public.pin_regeneration_requests
     where user_id = v_user_id::text and idempotency_key = v_regeneration_key
       and replay_expired_at is not null
  ) then
    raise exception 'completed replay rows were not tombstoned';
  end if;

  if not exists (
    select 1 from public.pin_generation_requests
     where user_id = v_user_id::text and idempotency_key = 'pin-expiry-generation-unknown'
       and replay_expired_at is null
  ) or not exists (
    select 1 from public.pin_regeneration_requests
     where user_id = v_user_id::text and idempotency_key = 'pin-expiry-regeneration-active'
       and replay_expired_at is null
  ) then
    raise exception 'uncertain provider requests were incorrectly expired';
  end if;

  select count(*) into v_queue_count
    from public.pin_image_retention_queue
   where bucket_id = 'pin-images' and object_path = v_shared_path;
  select source_types into v_source_types
    from public.pin_image_retention_queue
   where bucket_id = 'pin-images' and object_path = v_shared_path;
  if v_queue_count <> 1
     or not ('generation_replay' = any(v_source_types))
     or not ('regeneration_replay' = any(v_source_types)) then
    raise exception 'shared image path was not deduplicated in durable queue: %', v_source_types;
  end if;

  -- The idempotency keys survive, but their old result can no longer be replayed
  -- or silently start a new provider task.
  v_state := public.begin_pin_generation_request(
    v_user_id::text, v_board_id, v_generation_key, repeat('a',64)
  );
  if v_state ->> 'status' <> 'expired' then
    raise exception 'expired generation key did not return tombstone status: %', v_state;
  end if;

  v_state := public.begin_pin_regeneration_request(
    v_user_id::text, v_pin_id, v_regeneration_key, repeat('b',64),
    'test-model', 'Expired regeneration', 1
  );
  if v_state ->> 'status' <> 'expired' then
    raise exception 'expired regeneration key did not return tombstone status: %', v_state;
  end if;

  if not has_function_privilege('service_role',
       'public.expire_pin_image_replay_results(integer,integer)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.expire_pin_image_replay_results(integer,integer)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.expire_pin_image_replay_results(integer,integer)', 'EXECUTE') then
    raise exception 'replay expiry RPC privileges are incorrect';
  end if;

  if has_table_privilege('service_role', 'public.pin_image_retention_queue', 'SELECT')
     or has_table_privilege('service_role', 'public.pin_image_retention_queue', 'UPDATE') then
    raise exception 'service_role has direct retention queue table access';
  end if;

  begin
    perform public.expire_pin_image_replay_results(1,100);
    raise exception 'expiry RPC accepted retention below 30 days';
  exception when raise_exception then
    if sqlerrm = 'expiry RPC accepted retention below 30 days' then raise; end if;
  end;
  begin
    perform public.expire_pin_image_replay_results(90,101);
    raise exception 'expiry RPC accepted limit above 100';
  exception when raise_exception then
    if sqlerrm = 'expiry RPC accepted limit above 100' then raise; end if;
  end;
end;
$body$;
