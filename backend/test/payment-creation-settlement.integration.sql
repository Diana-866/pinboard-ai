-- Verify that only exactly fulfilled provider orders can settle checkout requests.
begin;

do $$
declare
  v_state jsonb;
  v_user_id uuid;
  v_subscription_id uuid;
  v_unactivated_subscription_id uuid;
  v_purchase_id uuid;
  v_settled boolean;
  v_failed boolean;
  v_request_status text;
  v_result jsonb;
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

  insert into public.users(email) values ('settlement-test@example.invalid')
  returning id into v_user_id;

  -- A subscription is settled only after its atomic activation wrote success.
  insert into public.subscriptions(
    user_id, plan, status, provider_payment_id, amount, currency, period_start, period_end
  ) values (
    v_user_id::text, 'pro', 'success', 'pp-settlement-sub-0001',
    4990, 'rub', now(), now() + interval '30 days'
  ) returning id into v_subscription_id;

  select public.begin_payment_creation_request(
    v_user_id::text, 'settlement-sub-key-0001',
    'subscription', repeat('e', 64)
  ) into v_state;
  if v_state->>'status' <> 'started' then
    raise exception 'new subscription checkout request should start, got %', v_state;
  end if;
  perform public.attach_payment_creation_order(
    v_user_id::text, 'settlement-sub-key-0001', 'pp-settlement-sub-0001'
  );

  select public.settle_payment_creation_request(
    'pp-settlement-sub-0001', 'subscription', v_subscription_id
  ) into v_settled;
  if not v_settled then
    raise exception 'exactly fulfilled subscription checkout should settle';
  end if;

  select status, result into v_request_status, v_result
    from public.payment_creation_requests
   where user_id = v_user_id::text
     and idempotency_key = 'settlement-sub-key-0001';
  if v_request_status <> 'settled' or v_result is not null then
    raise exception 'settled subscription checkout must not retain/replay its payment URL';
  end if;

  select public.settle_payment_creation_request(
    'pp-settlement-sub-0001', 'subscription', v_subscription_id
  ) into v_settled;
  if not v_settled then
    raise exception 'duplicate settled webhook must be idempotent';
  end if;

  select public.begin_payment_creation_request(
    v_user_id::text, 'settlement-sub-key-0001',
    'subscription', repeat('e', 64)
  ) into v_state;
  if v_state->>'status' <> 'settled' or v_state ? 'result' then
    raise exception 'settled checkout must not replay its payment URL, got %', v_state;
  end if;

  -- A success-looking subscription row without an activated paid period is not fulfilled.
  insert into public.subscriptions(
    user_id, plan, status, provider_payment_id, amount, currency
  ) values (
    v_user_id::text, 'pro', 'success', 'pp-settlement-sub-no-period',
    4990, 'rub'
  ) returning id into v_unactivated_subscription_id;

  select public.begin_payment_creation_request(
    v_user_id::text, 'settlement-sub-key-no-period',
    'subscription', repeat('b', 64)
  ) into v_state;
  perform public.attach_payment_creation_order(
    v_user_id::text, 'settlement-sub-key-no-period', 'pp-settlement-sub-no-period'
  );

  v_failed := false;
  begin
    perform public.settle_payment_creation_request(
      'pp-settlement-sub-no-period', 'subscription', v_unactivated_subscription_id
    );
  exception when others then
    if sqlerrm like '%local payment is not exactly fulfilled%' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'subscription without an activated paid period must not settle';
  end if;

  -- A credit purchase additionally requires the atomic balance marker.
  insert into public.credit_purchases(
    user_id, package_id, pack_title, credits, status, provider_payment_id,
    amount, currency, paid_at, balance_credited_at
  ) values (
    v_user_id::text, 'pack_100', '100 credits', 100, 'success',
    'pp-settlement-credit-0001', 190, 'rub', now(), now()
  ) returning id into v_purchase_id;

  select public.begin_payment_creation_request(
    v_user_id::text, 'settlement-credit-key-001',
    'credits', repeat('f', 64)
  ) into v_state;
  if v_state->>'status' <> 'started' then
    raise exception 'new credit checkout request should start, got %', v_state;
  end if;
  perform public.attach_payment_creation_order(
    v_user_id::text, 'settlement-credit-key-001', 'pp-settlement-credit-0001'
  );

  select public.settle_payment_creation_request(
    'pp-settlement-credit-0001', 'credits', v_purchase_id
  ) into v_settled;
  if not v_settled then
    raise exception 'exactly credited purchase should settle';
  end if;

  -- A mismatched local record must never settle another order.
  v_failed := false;
  begin
    perform public.settle_payment_creation_request(
      'pp-settlement-credit-0001', 'credits', v_subscription_id
    );
  exception when others then
    if sqlerrm like '%local payment is not exactly fulfilled%' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'settlement must reject a mismatched local payment record';
  end if;

  -- A success-looking row without the atomic credit marker is not fulfilled.
  insert into public.credit_purchases(
    user_id, package_id, pack_title, credits, status, provider_payment_id,
    amount, currency, paid_at, balance_credited_at
  ) values (
    v_user_id::text, 'pack_100', '100 credits', 100, 'success',
    'pp-settlement-credit-uncredited', 190, 'rub', now(), null
  ) returning id into v_purchase_id;

  select public.begin_payment_creation_request(
    v_user_id::text, 'settlement-credit-key-002',
    'credits', repeat('a', 64)
  ) into v_state;
  perform public.attach_payment_creation_order(
    v_user_id::text, 'settlement-credit-key-002', 'pp-settlement-credit-uncredited'
  );

  v_failed := false;
  begin
    perform public.settle_payment_creation_request(
      'pp-settlement-credit-uncredited', 'credits', v_purchase_id
    );
  exception when others then
    if sqlerrm like '%local payment is not exactly fulfilled%' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'credit purchase without balance_credited_at must not settle';
  end if;
end;
$$;

rollback;
