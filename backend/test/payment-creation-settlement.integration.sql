-- Verify that fulfilled checkout requests can be settled without making
-- the checkout URL replayable, and that the settlement RPC is service-only.
begin;

do $$
declare
  v_state jsonb;
  v_settled boolean;
begin
  if not has_function_privilege('service_role',
      'public.settle_payment_creation_request(text,text,uuid)', 'EXECUTE') then
    raise exception 'service_role must execute settle_payment_creation_request';
  end if;
  if has_function_privilege('authenticated',
      'public.settle_payment_creation_request(text,text,uuid)', 'EXECUTE') then
    raise exception 'authenticated must not execute settle_payment_creation_request';
  end if;
  if has_function_privilege('anon',
      'public.settle_payment_creation_request(text,text,uuid)', 'EXECUTE') then
    raise exception 'anon must not execute settle_payment_creation_request';
  end if;

  -- Legacy provider orders without an idempotency row are safe no-ops.
  select public.settle_payment_creation_request(
    'pp-legacy-order-0001', 'subscription', gen_random_uuid()
  ) into v_settled;
  if v_settled then
    raise exception 'legacy order without checkout request must not be marked settled';
  end if;

  select public.begin_payment_creation_request(
    'settlement-test-user', 'settlement-test-key-001',
    'subscription', repeat('e', 64)
  ) into v_state;
  if v_state->>'status' <> 'started' then
    raise exception 'new checkout request should start, got %', v_state;
  end if;

  update public.payment_creation_requests
     set provider_order_id = 'pp-settlement-test-0001',
         status = 'settled',
         result = null
   where user_id = 'settlement-test-user'
     and idempotency_key = 'settlement-test-key-001';

  select public.begin_payment_creation_request(
    'settlement-test-user', 'settlement-test-key-001',
    'subscription', repeat('e', 64)
  ) into v_state;
  if v_state->>'status' <> 'settled' or v_state ? 'result' then
    raise exception 'settled checkout must not replay its payment URL, got %', v_state;
  end if;
end;
$$;

rollback;
