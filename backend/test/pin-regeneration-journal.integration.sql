-- Integration coverage for migration 053: durable idempotency and atomic charging.
do $body$
declare
  v_user_id uuid;
  v_project_id uuid;
  v_board_id uuid;
  v_pin_id uuid;
  v_started jsonb;
  v_replayed jsonb;
  v_completed jsonb;
  v_balance integer;
  v_ledger_count integer;
  v_image_url text;
  v_claim uuid;
  v_other jsonb;
begin
  v_user_id := gen_random_uuid();
  insert into public.users(id, email, credits_balance, tariff_plan, email_verified)
  values (v_user_id, 'regeneration-journal-' || v_user_id::text || '@example.test', 50, 'pro', true);

  insert into public.projects(user_id, niche)
  values (v_user_id, 'regeneration test') returning id into v_project_id;
  insert into public.boards(project_id)
  values (v_project_id) returning id into v_board_id;
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board_id, 'https://storage.test/old.png', 'test', 'test', 'approved', 'flux-schnell', 0)
  returning id into v_pin_id;

  v_started := public.begin_pin_regeneration_request(
    v_user_id::text, v_pin_id, 'regen-test-key-0001',
    repeat('a',64), 'flux-schnell', 'test prompt', 15
  );
  if v_started->>'status' <> 'started' then
    raise exception 'expected started, got %', v_started;
  end if;
  v_claim := (v_started->>'claim_token')::uuid;

  v_completed := public.complete_pin_regeneration_request(
    v_user_id::text, 'regen-test-key-0001', v_claim, 'https://storage.test/new.png'
  );
  if v_completed->'pin' is null then raise exception 'completion returned no pin'; end if;

  select credits_balance into v_balance from public.users where id=v_user_id;
  select count(*) into v_ledger_count from public.credit_transactions
    where user_id=v_user_id::text;
  select image_url into v_image_url from public.pins where id=v_pin_id;
  if v_balance <> 35 then raise exception 'expected balance 35, got %', v_balance; end if;
  if v_ledger_count <> 1 then raise exception 'expected one ledger row, got %', v_ledger_count; end if;
  if v_image_url <> 'https://storage.test/new.png' then raise exception 'pin image was not updated'; end if;

  -- A completed request is replayed, never charged a second time.
  v_replayed := public.begin_pin_regeneration_request(
    v_user_id::text, v_pin_id, 'regen-test-key-0001',
    repeat('a',64), 'flux-schnell', 'test prompt', 15
  );
  if v_replayed->>'status' <> 'completed' then
    raise exception 'expected completed replay, got %', v_replayed;
  end if;
  perform public.complete_pin_regeneration_request(
    v_user_id::text, 'regen-test-key-0001', v_claim, 'https://storage.test/new.png'
  );
  select credits_balance into v_balance from public.users where id=v_user_id;
  select count(*) into v_ledger_count from public.credit_transactions
    where user_id=v_user_id::text and type='regeneration';
  if v_balance <> 35 or v_ledger_count <> 1 then
    raise exception 'replay charged twice: balance %, ledger rows %', v_balance, v_ledger_count;
  end if;

  -- The idempotency key cannot be rebound to a different request.
  begin
    perform public.begin_pin_regeneration_request(
      v_user_id::text, v_pin_id, 'regen-test-key-0001',
      repeat('b',64), 'flux-schnell', 'different prompt', 15
    );
    raise exception 'fingerprint mismatch was accepted';
  exception when others then
    if sqlerrm = 'fingerprint mismatch was accepted' then raise; end if;
    if position('idempotency key reused' in sqlerrm)=0 then raise; end if;
  end;

  -- A caller without the current claim token cannot mutate the journal.
  v_other := public.begin_pin_regeneration_request(
    v_user_id::text, v_pin_id, 'regen-test-key-0002',
    repeat('c',64), 'flux-schnell', 'another prompt', 15
  );
  v_claim := (v_other->>'claim_token')::uuid;
  begin
    perform public.update_pin_regeneration_request(
      v_user_id::text, 'regen-test-key-0002', gen_random_uuid(),
      'unknown', null, null, null, null, 'wrong_claim'
    );
    raise exception 'wrong claim token was accepted';
  exception when others then
    if sqlerrm = 'wrong claim token was accepted' then raise; end if;
    if position('regeneration claim mismatch' in sqlerrm)=0 then raise; end if;
  end;
  perform public.update_pin_regeneration_request(
    v_user_id::text, 'regen-test-key-0002', v_claim,
    'unknown', null, null, null, null, 'test_unknown'
  );
  v_replayed := public.begin_pin_regeneration_request(
    v_user_id::text, v_pin_id, 'regen-test-key-0002',
    repeat('c',64), 'flux-schnell', 'another prompt', 15
  );
  if v_replayed->>'status' <> 'resume' then
    raise exception 'unknown request did not return resume: %', v_replayed;
  end if;

  -- A task ID already recorded while processing must be pollable before the
  -- 30-minute stale-claim timeout; retry must not wait or create another task.
  v_other := public.begin_pin_regeneration_request(
    v_user_id::text, v_pin_id, 'regen-test-key-0003',
    repeat('d',64), 'flux-schnell', 'pending provider task', 15
  );
  v_claim := (v_other->>'claim_token')::uuid;
  perform public.update_pin_regeneration_request(
    v_user_id::text, 'regen-test-key-0003', v_claim,
    'processing', '0123456789abcdef01234567', null, null, null, null
  );
  v_replayed := public.begin_pin_regeneration_request(
    v_user_id::text, v_pin_id, 'regen-test-key-0003',
    repeat('d',64), 'flux-schnell', 'pending provider task', 15
  );
  if v_replayed->>'status' <> 'resume'
     or v_replayed->>'provider_task_id' <> '0123456789abcdef01234567' then
    raise exception 'recorded provider task was not returned for immediate polling: %', v_replayed;
  end if;
end;
$body$;
