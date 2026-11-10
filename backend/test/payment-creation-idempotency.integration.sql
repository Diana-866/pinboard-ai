-- Verify durable Prodamus checkout idempotency and the ambiguous-outcome fence.
begin;

do $$
declare
  v_state jsonb;
  v_result jsonb := jsonb_build_object(
    'ok', true,
    'order_id', 'pp-test-idempotent',
    'payment_url', 'https://pinposy.payform.ru/test-checkout'
  );
  v_failed boolean := false;
begin
  if not has_function_privilege('service_role',
      'public.begin_payment_creation_request(text,text,text,text)', 'EXECUTE') then
    raise exception 'service_role must execute begin_payment_creation_request';
  end if;
  if has_function_privilege('authenticated',
      'public.begin_payment_creation_request(text,text,text,text)', 'EXECUTE') then
    raise exception 'authenticated must not execute begin_payment_creation_request';
  end if;

  select public.begin_payment_creation_request(
    'payment-idempotency-test-user', 'subscription-test-key-001',
    'subscription', repeat('a', 64)
  ) into v_state;
  if v_state->>'status' <> 'started' then
    raise exception 'first checkout request should start, got %', v_state;
  end if;

  select public.begin_payment_creation_request(
    'payment-idempotency-test-user', 'subscription-test-key-001',
    'subscription', repeat('a', 64)
  ) into v_state;
  if v_state->>'status' <> 'creating' then
    raise exception 'concurrent duplicate must be fenced as creating, got %', v_state;
  end if;

  select public.complete_payment_creation_request(
    'payment-idempotency-test-user', 'subscription-test-key-001', v_result
  ) into v_state;
  if v_state->>'order_id' <> 'pp-test-idempotent' then
    raise exception 'checkout completion did not return the saved result';
  end if;

  select public.begin_payment_creation_request(
    'payment-idempotency-test-user', 'subscription-test-key-001',
    'subscription', repeat('a', 64)
  ) into v_state;
  if v_state->>'status' <> 'ready'
     or v_state->'result'->>'payment_url' <> 'https://pinposy.payform.ru/test-checkout' then
    raise exception 'completed duplicate must replay the exact checkout result, got %', v_state;
  end if;

  begin
    perform public.begin_payment_creation_request(
      'payment-idempotency-test-user', 'subscription-test-key-001',
      'subscription', repeat('b', 64)
    );
  exception when others then
    if sqlerrm like '%idempotency key reused with different payment request%' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'reusing a key with a different request must fail';
  end if;

  select public.begin_payment_creation_request(
    'payment-idempotency-test-user', 'credits-test-key-001',
    'credits', repeat('c', 64)
  ) into v_state;
  if v_state->>'status' <> 'started' then
    raise exception 'new credit checkout should start';
  end if;

  perform public.mark_payment_creation_unknown(
    'payment-idempotency-test-user', 'credits-test-key-001', 'simulated_timeout'
  );
  select public.begin_payment_creation_request(
    'payment-idempotency-test-user', 'credits-test-key-001',
    'credits', repeat('c', 64)
  ) into v_state;
  if v_state->>'status' <> 'unknown' then
    raise exception 'ambiguous provider result must remain fenced, got %', v_state;
  end if;
end;
$$;

rollback;
