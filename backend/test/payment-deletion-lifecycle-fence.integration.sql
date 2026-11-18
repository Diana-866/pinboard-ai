-- Migration 157: paid entitlement RPCs must respect the account lifecycle fence.
-- This verifies no credits or subscription period are granted after deletion_pending.
begin;

do $$
declare
  v_credit_user uuid;
  v_subscription_user uuid;
  v_purchase_id uuid;
  v_subscription_id uuid;
  v_balance integer;
  v_count integer;
  v_rejected boolean;
begin
  insert into public.users(email, credits_balance, account_status)
  values ('migration157-credit-fenced@example.invalid', 40, 'deletion_pending')
  returning id into v_credit_user;

  -- Preserve the existing late-success eligibility for active accounts, but
  -- never grant a late provider success once the account deletion fence wins.
  insert into public.credit_purchases(
    user_id, package_id, pack_title, credits, status, provider_payment_id,
    amount, currency
  ) values (
    v_credit_user::text, 'pack_100', '100 credits', 100, 'canceled',
    'migration157-credit-late-success', 190.00, 'rub'
  ) returning id into v_purchase_id;

  v_rejected := false;
  begin
    perform public.credit_paid_purchase(
      v_purchase_id, '2026-11-18T10:00:00Z', 'migration 157 fenced credit'
    );
  exception when raise_exception then
    if sqlerrm = 'purchase user is not active' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected then
    raise exception 'credit fulfillment unexpectedly granted a fenced account';
  end if;

  select credits_balance into v_balance
    from public.users where id = v_credit_user;
  if v_balance <> 40 then
    raise exception 'fenced account balance changed: expected 40, got %', v_balance;
  end if;

  select count(*) into v_count
    from public.credit_purchases
   where id = v_purchase_id
     and status = 'canceled'
     and balance_credited_at is null;
  if v_count <> 1 then
    raise exception 'fenced credit purchase state was mutated';
  end if;

  select count(*) into v_count
    from public.credit_transactions where purchase_id = v_purchase_id;
  if v_count <> 0 then
    raise exception 'fenced credit purchase created a ledger row';
  end if;

  insert into public.users(email, account_status)
  values ('migration157-subscription-fenced@example.invalid', 'deletion_pending')
  returning id into v_subscription_user;

  insert into public.subscriptions(
    user_id, plan, status, provider_payment_id, amount, currency
  ) values (
    v_subscription_user::text, 'pro', 'canceled',
    'migration157-subscription-late-success', 4990, 'rub'
  ) returning id into v_subscription_id;

  v_rejected := false;
  begin
    perform public.activate_paid_subscription(
      v_subscription_id, '2026-11-18T10:00:00Z'
    );
  exception when raise_exception then
    if sqlerrm = 'subscription user is not active' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected then
    raise exception 'subscription activation unexpectedly granted a fenced account';
  end if;

  select count(*) into v_count
    from public.subscriptions
   where id = v_subscription_id
     and status = 'canceled'
     and period_start is null
     and period_end is null;
  if v_count <> 1 then
    raise exception 'fenced subscription state or paid period was mutated';
  end if;

  select count(*) into v_count
    from public.users
   where id = v_subscription_user
     and tariff_plan is null
     and tariff_period_end is null;
  if v_count <> 1 then
    raise exception 'fenced subscription changed user entitlement';
  end if;
end;
$$;

rollback;
