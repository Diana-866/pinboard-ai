-- Run in disposable PostgreSQL CI after migrations 054 and 088.
-- Covers reservation idempotency, protection of reserved credits, settlement,
-- and the difference between definitive and ambiguous provider outcomes.
begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_request jsonb;
  v_claim uuid;
  v_result jsonb;
  v_key text;
  v_status text;
  v_balance integer;
  v_pins jsonb;
begin
  insert into public.users(id, email, credits_balance, token_version)
  values (v_user, 'generation-reservation-' || v_user || '@example.invalid', 10, 0);

  insert into public.projects(user_id, niche)
  values (v_user, 'credit-reservation-ci')
  returning id into v_project;

  insert into public.boards(project_id, title)
  values (v_project, 'credit-reservation-ci')
  returning id into v_board;

  -- A reservation is idempotent and cannot be duplicated or resized by retry.
  v_key := 'reserve-main-' || v_user;
  v_request := public.begin_pin_generation_request(
    v_user::text, v_board, v_key, repeat('a', 64)
  );
  v_claim := (v_request->>'claim_token')::uuid;

  v_result := public.reserve_pin_generation_credits(v_user::text, v_key, 7);
  if v_result->>'status' <> 'reserved' or (v_result->>'available_after_reservation')::integer <> 3 then
    raise exception 'initial reservation returned unexpected result: %', v_result;
  end if;
  v_result := public.reserve_pin_generation_credits(v_user::text, v_key, 7);
  if v_result->>'status' <> 'reserved' then
    raise exception 'idempotent reservation retry did not return reserved: %', v_result;
  end if;

  begin
    perform public.reserve_pin_generation_credits(v_user::text, v_key, 6);
    raise exception 'reservation amount mismatch was accepted';
  exception when others then
    if sqlerrm not like '%generation reservation amount mismatch%' then raise; end if;
  end;

  -- A legacy debit must not consume credits already reserved by another job.
  v_pins := jsonb_build_array(jsonb_build_object(
    'image_url', 'https://cdn.example.invalid/reservation-blocked.png',
    'title', 'Blocked spend',
    'description', '',
    'model_used', 'flux-schnell',
    'aspect_ratio', '2:3',
    'credits_cost', 4
  ));
  begin
    perform public.save_generated_pins_and_charge(v_user::text, v_board, v_pins, 4);
    raise exception 'legacy generation debit consumed reserved credits';
  exception when others then
    if sqlerrm not like '%insufficient credits after active generation reservations%' then raise; end if;
  end;

  -- Settlement spends only the reserved amount and atomically completes the
  -- request; the trigger changes settling -> settled in the same transaction.
  v_pins := jsonb_build_array(jsonb_build_object(
    'image_url', 'https://cdn.example.invalid/reservation-settled.png',
    'title', 'Settled generation',
    'description', 'Reservation test',
    'model_used', 'flux-schnell',
    'aspect_ratio', '2:3',
    'credits_cost', 7
  ));
  v_result := public.complete_pin_generation_request(
    v_user::text, v_board, v_key, v_claim, v_pins, 7
  );
  select credits_balance into v_balance from public.users where id = v_user;
  select status into v_status
    from public.pin_generation_credit_reservations
   where user_id = v_user::text and idempotency_key = v_key;
  if v_balance <> 3 or v_status <> 'settled'
     or jsonb_array_length(coalesce(v_result->'pins', '[]'::jsonb)) <> 1 then
    raise exception 'reservation settlement mismatch: balance %, status %, result %',
      v_balance, v_status, v_result;
  end if;

  -- Unknown request without a durable image task: release the unused image
  -- reservation but keep the request blocked from blind replay.
  v_key := 'reserve-unknown-no-image-tasks-' || v_user;
  v_request := public.begin_pin_generation_request(v_user::text, v_board, v_key, repeat('e', 64));
  v_result := public.reserve_pin_generation_credits(v_user::text, v_key, 2);
  if v_result->>'status' <> 'reserved' then raise exception 'no-image-task reservation was not created'; end if;
  update public.pin_generation_requests
     set updated_at = clock_timestamp() - interval '31 minutes'
   where user_id = v_user::text and idempotency_key = v_key;
  v_result := public.begin_pin_generation_request(
    v_user::text, v_board, v_key, repeat('e', 64)
  );
  if v_result->>'status' <> 'unknown' then
    raise exception 'stale request without image tasks did not remain unknown: %', v_result;
  end if;
  select status into v_status from public.pin_generation_credit_reservations
   where user_id = v_user::text and idempotency_key = v_key;
  if v_status <> 'released' then raise exception 'unused reservation was not released: %', v_status; end if;
  if not exists (select 1 from public.pin_generation_requests
    where user_id = v_user::text and idempotency_key = v_key and status = 'unknown') then
    raise exception 'no-image-task request was incorrectly made retryable';
  end if;

  -- The completion RPC must reject a charge above the reservation ceiling.
  -- The failed settlement is rolled back and leaves the reservation available for
  -- a safe retry/reconciliation rather than inserting pins or debiting credits.
  v_key := 'reserve-overcharge-' || v_user;
  v_request := public.begin_pin_generation_request(
    v_user::text, v_board, v_key, repeat('d', 64)
  );
  v_claim := (v_request->>'claim_token')::uuid;
  v_result := public.reserve_pin_generation_credits(v_user::text, v_key, 1);
  v_pins := jsonb_build_array(jsonb_build_object(
    'image_url', 'https://cdn.example.invalid/reservation-overcharge.png',
    'title', 'Over-reservation charge',
    'description', '',
    'model_used', 'flux-schnell',
    'aspect_ratio', '2:3',
    'credits_cost', 2
  ));
  begin
    perform public.complete_pin_generation_request(
      v_user::text, v_board, v_key, v_claim, v_pins, 2
    );
    raise exception 'generation charge above reservation was accepted';
  exception when others then
    if sqlerrm not like '%generation charge exceeds reserved amount%' then raise; end if;
  end;
  select credits_balance into v_balance from public.users where id = v_user;
  select status into v_status from public.pin_generation_credit_reservations
   where user_id = v_user::text and idempotency_key = v_key;
  if v_balance <> 3 or v_status <> 'reserved' then
    raise exception 'over-reservation rejection changed balance or reservation: %, %', v_balance, v_status;
  end if;

  -- A definitive failure releases the reservation.
  v_key := 'reserve-failed-' || v_user;
  v_request := public.begin_pin_generation_request(
    v_user::text, v_board, v_key, repeat('b', 64)
  );
  v_result := public.reserve_pin_generation_credits(v_user::text, v_key, 2);
  if v_result->>'status' <> 'reserved' then
    raise exception 'failed-case reservation was not created';
  end if;
  perform public.fail_pin_generation_request(v_user::text, v_key,
    (v_request->>'claim_token')::uuid, 'provider_rejected', false);
  select status into v_status
    from public.pin_generation_credit_reservations
   where user_id = v_user::text and idempotency_key = v_key;
  if v_status <> 'released' then
    raise exception 'definitive failure did not release reservation: %', v_status;
  end if;

  -- An ambiguous outcome must keep its reservation unavailable for spending.
  v_key := 'reserve-unknown-' || v_user;
  v_request := public.begin_pin_generation_request(
    v_user::text, v_board, v_key, repeat('c', 64)
  );
  v_result := public.reserve_pin_generation_credits(v_user::text, v_key, 2);
  if v_result->>'status' <> 'reserved' then
    raise exception 'unknown-case reservation was not created';
  end if;
  -- An existing image task means the provider may have accepted billable work;
  -- its reservation must remain protected while the outcome is unknown.
  insert into public.pin_generation_tasks(
    generation_request_id, user_id, board_id, task_index, title, description,
    prompt, model, aspect_ratio, status
  )
  select id, v_user::text, v_board, 1, 'Unknown image task', '',
         'Image task prompt', 'flux-schnell', '2:3', 'submitting'
    from public.pin_generation_requests where user_id = v_user::text and idempotency_key = v_key;
  perform public.fail_pin_generation_request(v_user::text, v_key,
    (v_request->>'claim_token')::uuid, 'provider_outcome_unknown', true);
  select status into v_status
    from public.pin_generation_credit_reservations
   where user_id = v_user::text and idempotency_key = v_key;
  if v_status <> 'reserved' then
    raise exception 'ambiguous outcome released reserved credits: %', v_status;
  end if;

  v_pins := jsonb_build_array(jsonb_build_object(
    'image_url', 'https://cdn.example.invalid/reservation-unknown-blocked.png',
    'title', 'Unknown outcome blocked spend',
    'description', '',
    'model_used', 'flux-schnell',
    'aspect_ratio', '2:3',
    'credits_cost', 2
  ));
  begin
    perform public.save_generated_pins_and_charge(v_user::text, v_board, v_pins, 2);
    raise exception 'legacy debit consumed credits held for an unknown provider outcome';
  exception when others then
    if sqlerrm not like '%insufficient credits after active generation reservations%' then raise; end if;
  end;

  raise notice 'Pin generation credit reservation checks passed';
end;
$$;

rollback;
