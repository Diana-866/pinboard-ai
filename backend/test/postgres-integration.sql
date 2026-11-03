-- Integration checks against a real PostgreSQL instance.
-- Run only against a disposable CI database after migrations 001, 009, 010, 011.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_purchase uuid := gen_random_uuid();
  v_sub uuid := gen_random_uuid();
  v_balance integer;
  v_count integer;
  v_first_end timestamptz;
  v_second_end timestamptz;
  v_plan text;
begin
  insert into public.users(id, email, credits_balance, tariff_plan)
  values (v_user, 'pg-integration-' || v_user || '@example.invalid', 10, 'none');

  insert into public.credit_purchases(
    id, user_id, package_id, pack_title, credits, status,
    provider_payment_id, amount, currency
  ) values (
    v_purchase, v_user, 'pack_100', 'Integration test', 100, 'pending',
    'pg-test-' || v_purchase, 100, 'rub'
  );

  v_balance := public.credit_paid_purchase(v_purchase, now(), 'integration test');
  if v_balance <> 110 then
    raise exception 'expected first credit balance 110, got %', v_balance;
  end if;

  v_balance := public.credit_paid_purchase(v_purchase, now(), 'duplicate webhook');
  if v_balance <> 110 then
    raise exception 'duplicate webhook changed balance: %', v_balance;
  end if;

  select count(*) into v_count
    from public.credit_transactions
   where purchase_id = v_purchase;
  if v_count <> 1 then
    raise exception 'expected exactly one ledger row, got %', v_count;
  end if;

  insert into public.subscriptions(
    id, user_id, plan, status, provider_payment_id, amount, currency
  ) values (
    v_sub, v_user, 'start', 'pending', 'pg-sub-' || v_sub, 1990, 'rub'
  );

  perform public.activate_paid_subscription(v_sub, now());
  select period_end into v_first_end
    from public.subscriptions where id = v_sub;

  perform public.activate_paid_subscription(v_sub, now() + interval '1 day');
  select period_end into v_second_end
    from public.subscriptions where id = v_sub;

  if v_first_end is distinct from v_second_end then
    raise exception 'duplicate subscription webhook extended the same order';
  end if;

  select tariff_plan into v_plan from public.users where id = v_user;
  if v_plan <> 'start' then
    raise exception 'expected user tariff start, got %', v_plan;
  end if;

  -- A second paid order must start after the current entitlement, not overlap it.
  insert into public.subscriptions(
    user_id, plan, status, provider_payment_id, amount, currency
  ) values (
    v_user, 'pro', 'pending', 'pg-sub-next-' || v_user, 4990, 'rub'
  ) returning id into v_sub;

  perform public.activate_paid_subscription(v_sub, now());
  if (select period_start from public.subscriptions where id = v_sub) < v_first_end then
    raise exception 'next subscription overlaps existing entitlement';
  end if;

  delete from public.users where id = v_user;
end;
$$;
