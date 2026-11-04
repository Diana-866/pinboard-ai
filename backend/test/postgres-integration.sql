-- Run only in disposable PostgreSQL CI database after migrations 010 and 011.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_purchase uuid;
  v_sub uuid;
  v_balance integer;
  v_count integer;
  v_first_end timestamptz;
  v_second_end timestamptz;
  v_plan text;
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_result jsonb;
  v_before integer;
  v_schedule uuid;
  v_schedule_count integer;
  v_publish_result jsonb;
  v_uncertain_pin uuid;

begin
  insert into public.users(id, email, credits_balance, tariff_plan)
  values (v_user, 'atomic-test-' || v_user || '@example.invalid', 10, 'none');

  insert into public.credit_purchases(
    user_id, package_id, pack_title, credits, status,
    provider_payment_id, amount, currency
  ) values (
    v_user::text, 'pack_100', 'Atomic integration test', 100, 'pending',
    'ci-credit-' || v_user, 100, 'rub'
  ) returning id into v_purchase;

  v_balance := public.credit_paid_purchase(v_purchase, now(), 'first webhook');
  if v_balance <> 110 then raise exception 'expected balance 110, got %', v_balance; end if;

  v_balance := public.credit_paid_purchase(v_purchase, now(), 'duplicate webhook');
  if v_balance <> 110 then raise exception 'duplicate webhook changed balance: %', v_balance; end if;

  select count(*) into v_count from public.credit_transactions where purchase_id = v_purchase;
  if v_count <> 1 then raise exception 'expected one ledger entry, got %', v_count; end if;

  -- Generic balance adjustment must update balance and ledger in the same RPC.
  v_balance := public.adjust_credits_balance_and_log(v_user::text, -10, 'usage', 'test spend');
  if v_balance <> 100 then raise exception 'expected adjusted balance 100, got %', v_balance; end if;
  select count(*) into v_count from public.credit_transactions where user_id = v_user::text;
  if v_count <> 2 then raise exception 'expected two total ledger entries, got %', v_count; end if;

  insert into public.projects(user_id, niche) values (v_user, 'test') returning id into v_project;
  insert into public.boards(project_id) values (v_project) returning id into v_board;

  -- Generated pin rows and the corresponding credit debit must commit together.
  v_result := public.save_generated_pins_and_charge(
    v_user::text, v_board,
    '[{"image_url":"https://cdn.example.invalid/a.png","title":"A","description":"A","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":5},
      {"image_url":"https://cdn.example.invalid/b.png","title":"B","description":"B","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":5}]'::jsonb,
    10
  );
  if (v_result->>'balance')::integer <> 90 then raise exception 'generation debit was not applied'; end if;
  if jsonb_array_length(v_result->'pins') <> 2 then raise exception 'expected two persisted pins'; end if;
  select id into v_pin from public.pins where board_id=v_board order by created_at limit 1;

  -- Regeneration updates the image and debit as one transaction.
  v_result := public.update_pin_image_and_charge(
    v_user::text, v_pin, 'https://cdn.example.invalid/a-new.png', 10
  );
  if (v_result->>'balance')::integer <> 80 then raise exception 'regeneration debit was not applied'; end if;
  if (select image_url from public.pins where id=v_pin) <> 'https://cdn.example.invalid/a-new.png' then
    raise exception 'regenerated image was not saved';
  end if;

  -- Insufficient balance must roll back without inserting any pins or ledger rows.
  select credits_balance into v_before from public.users where id=v_user;
  begin
    perform public.save_generated_pins_and_charge(
      v_user::text, v_board,
      '[{"image_url":"https://cdn.example.invalid/c.png","title":"C","description":"C","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":999}]'::jsonb,
      999
    );
    raise exception 'expected insufficient credits error';
  exception when others then
    if sqlerrm = 'expected insufficient credits error' then raise; end if;
  end;
  if (select credits_balance from public.users where id=v_user) <> v_before then
    raise exception 'failed generation changed user balance';
  end if;

  insert into public.subscriptions(user_id, plan, status, provider_payment_id, amount, currency)
  values (v_user::text, 'start', 'pending', 'ci-sub-' || v_user, 1990, 'rub')
  returning id into v_sub;

  perform public.activate_paid_subscription(v_sub, now());
  select period_end into v_first_end from public.subscriptions where id = v_sub;

  perform public.activate_paid_subscription(v_sub, now() + interval '1 day');
  select period_end into v_second_end from public.subscriptions where id = v_sub;
  if v_first_end is distinct from v_second_end then
    raise exception 'duplicate subscription webhook extended the same order';
  end if;

  select tariff_plan into v_plan from public.users where id = v_user;
  if v_plan <> 'start' then raise exception 'expected tariff start, got %', v_plan; end if;


  -- Idempotency: completed generation returns stored pins without charging again.
  v_result := public.begin_pin_generation_request(v_user::text, v_board, 'ci-generation-key-0001', repeat('a',64));
  if v_result->>'status' <> 'started' then raise exception 'first generation request must start'; end if;
  v_result := public.complete_pin_generation_request(
    v_user::text, v_board, 'ci-generation-key-0001',
    '[{"image_url":"https://cdn.example.invalid/idempotent.png","title":"Idempotent","description":"","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":5}]'::jsonb,
    5
  );
  if (v_result->>'balance')::integer <> 75 then raise exception 'idempotent first charge incorrect'; end if;
  v_result := public.begin_pin_generation_request(v_user::text, v_board, 'ci-generation-key-0001', repeat('a',64));
  if v_result->>'status' <> 'completed' then raise exception 'duplicate generation must return completed'; end if;
  if jsonb_array_length(v_result->'pins') <> 1 then raise exception 'duplicate generation did not return cached pins'; end if;
  if (select credits_balance from public.users where id=v_user) <> 75 then
    raise exception 'duplicate generation charged credits twice';
  end if;

  -- A second paid order must start after the current paid entitlement.
  insert into public.subscriptions(user_id, plan, status, provider_payment_id, amount, currency)
  values (v_user::text, 'pro', 'pending', 'ci-sub-next-' || v_user, 4990, 'rub')
  returning id into v_sub;

  perform public.activate_paid_subscription(v_sub, now());
  if (select period_start from public.subscriptions where id = v_sub) < v_first_end then
    raise exception 'next subscription overlaps existing entitlement';
  end if;

  -- Pinterest publish reservation: concurrent/repeated calls cannot start a second request.
  v_publish_result := public.begin_pinterest_publish(v_user::text, v_pin, 'pinterest-board-ci');
  if v_publish_result->>'status' <> 'started' then
    raise exception 'first Pinterest publish reservation must start';
  end if;
  v_publish_result := public.begin_pinterest_publish(v_user::text, v_pin, 'pinterest-board-ci');
  if v_publish_result->>'status' <> 'processing' then
    raise exception 'duplicate Pinterest publish must be blocked while processing';
  end if;
  perform public.complete_pinterest_publish(v_user::text, v_pin, 'remote-pin-ci-001', 'pinterest-board-ci');
  v_publish_result := public.begin_pinterest_publish(v_user::text, v_pin, 'pinterest-board-ci');
  if v_publish_result->>'status' <> 'published' or v_publish_result->>'pinterest_pin_id' <> 'remote-pin-ci-001' then
    raise exception 'completed Pinterest publish must return the stored remote pin';
  end if;

  -- An uncertain external result must remain blocked, never auto-retried.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/uncertain.png', 'Uncertain', '', 'pending', 'flux-schnell', 0)
  returning id into v_uncertain_pin;
  v_publish_result := public.begin_pinterest_publish(v_user::text, v_uncertain_pin, 'pinterest-board-ci');
  if v_publish_result->>'status' <> 'started' then raise exception 'uncertain test reservation did not start'; end if;
  perform public.fail_pinterest_publish(v_user::text, v_uncertain_pin, 'simulated timeout', true);
  v_publish_result := public.begin_pinterest_publish(v_user::text, v_uncertain_pin, 'pinterest-board-ci');
  if v_publish_result->>'status' <> 'unknown' then
    raise exception 'uncertain Pinterest result must block duplicate retry';
  end if;

  -- Due schedule rows are claimed atomically and not returned twice.
  insert into public.pin_schedules(user_id,pin_id,scheduled_at,timezone,pinterest_board_id)
  values (v_user::text,v_pin,now() - interval '1 minute','Europe/Moscow','pinterest-board-ci')
  returning id into v_schedule;
  select count(*) into v_schedule_count
    from public.claim_due_pin_schedules(10)
    where id=v_schedule;
  if v_schedule_count <> 1 then raise exception 'due schedule was not claimed'; end if;
  select count(*) into v_schedule_count from public.claim_due_pin_schedules(10);
  if v_schedule_count <> 0 then raise exception 'claimed schedule was returned twice'; end if;
  if (select status from public.pin_schedules where id=v_schedule) <> 'publishing' then
    raise exception 'claimed schedule status was not updated';
  end if;

  -- Persistent schedule records remain scheduled until a publisher confirms success.
  insert into public.pin_schedules(user_id, pin_id, scheduled_at, timezone)
  values (v_user::text, v_pin, now() + interval '1 day', 'Europe/Moscow')
  returning id into v_schedule;
  if (select status from public.pin_schedules where id=v_schedule) <> 'scheduled' then
    raise exception 'new schedule must start as scheduled';
  end if;
  begin
    insert into public.pin_schedules(user_id, pin_id, scheduled_at, timezone)
    values (v_user::text, v_pin, now() + interval '2 days', 'Europe/Moscow');
    raise exception 'expected duplicate active schedule to be rejected';
  exception when unique_violation then
    null;
  end;
  update public.pin_schedules set status='cancelled' where id=v_schedule;
  insert into public.pin_schedules(user_id, pin_id, scheduled_at, timezone)
  values (v_user::text, v_pin, now() + interval '2 days', 'Europe/Moscow');
  select count(*) into v_schedule_count from public.pin_schedules
    where user_id=v_user::text and pin_id=v_pin and status='scheduled';
  if v_schedule_count <> 1 then raise exception 'rescheduling after cancellation failed'; end if;

  delete from public.pinterest_publish_attempts where user_id=v_user::text;
  delete from public.pinterest_publications where user_id=v_user::text;
  delete from public.pins where board_id = v_board;
  delete from public.boards where id = v_board;
  delete from public.projects where id = v_project;
  delete from public.users where id = v_user;
end;
$$;
