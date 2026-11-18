-- 157_payment_fulfillment_user_first_lifecycle_fence.sql
-- Align paid entitlement RPC lock order with account deletion acceptance:
-- users -> credit_purchases / subscriptions.
-- Refuse new entitlement grants after the account deletion fence is committed.
-- This is an interim lock/lifecycle guard; immutable provider receipts are a
-- separate required follow-up before enabling live payments during deletion.

begin;

create or replace function public.credit_paid_purchase(
  p_purchase_id uuid,
  p_paid_at timestamptz,
  p_description text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id text;
  v_user public.users%rowtype;
  v_purchase public.credit_purchases%rowtype;
  v_balance integer;
begin
  -- Resolve the owner without locking the payment row. Every mutating path for
  -- this account must acquire the user fence before the payment row.
  select user_id into v_user_id
    from public.credit_purchases
   where id = p_purchase_id;

  if not found then
    raise exception 'credit purchase not found';
  end if;

  select * into v_user
    from public.users
   where id::text = v_user_id
   for update;

  if not found then
    raise exception 'purchase user not found';
  end if;

  select * into v_purchase
    from public.credit_purchases
   where id = p_purchase_id
   for update;

  if not found then
    raise exception 'credit purchase not found';
  end if;
  if v_purchase.user_id is distinct from v_user.id::text then
    raise exception 'credit purchase owner changed during fulfillment';
  end if;

  -- Do not grant credits after account deletion has acquired the user fence.
  -- The webhook transaction rolls back, leaving the local payment unresolved
  -- for reconciliation rather than mutating a fenced account.
  if v_user.account_status is distinct from 'active' then
    raise exception 'purchase user is not active';
  end if;

  if v_purchase.balance_credited_at is not null then
    return coalesce(v_user.credits_balance, 0);
  end if;

  if v_purchase.status not in ('pending', 'denied', 'canceled', 'success') then
    raise exception 'purchase is not eligible for crediting (status=%)', v_purchase.status;
  end if;
  if v_purchase.credits is null or v_purchase.credits <= 0 then
    raise exception 'invalid purchase credits';
  end if;

  update public.users
     set credits_balance = coalesce(credits_balance, 0) + v_purchase.credits
   where id = v_user.id
     and account_status = 'active'
   returning credits_balance into v_balance;

  if not found then
    raise exception 'purchase user is not active';
  end if;

  insert into public.credit_transactions(user_id, amount, type, description, purchase_id)
  values (v_purchase.user_id, v_purchase.credits, 'topup',
          coalesce(p_description, 'Покупка кредитов'), v_purchase.id);

  update public.credit_purchases
     set status = 'success',
         paid_at = coalesce(p_paid_at, now()),
         balance_credited_at = now()
   where id = v_purchase.id;

  return v_balance;
end;
$$;

create or replace function public.activate_paid_subscription(
  p_subscription_id uuid,
  p_paid_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id text;
  v_sub public.subscriptions%rowtype;
  v_user public.users%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_already_activated boolean;
  v_latest_success_created_at timestamptz;
  v_latest_success_id uuid;
  v_effective_plan text;
  v_plan_applied boolean := false;
begin
  -- Resolve the owner without taking a subscription lock. Match deletion's
  -- user-first order before locking the payment row.
  select user_id into v_user_id
    from public.subscriptions
   where id = p_subscription_id;

  if not found then
    raise exception 'subscription not found';
  end if;

  select * into v_user
    from public.users
   where id::text = v_user_id
   for update;

  if not found then
    raise exception 'subscription user not found';
  end if;

  select * into v_sub
    from public.subscriptions
   where id = p_subscription_id
   for update;

  if not found then
    raise exception 'subscription not found';
  end if;
  if v_sub.user_id is distinct from v_user.id::text then
    raise exception 'subscription owner changed during activation';
  end if;

  if v_user.account_status is distinct from 'active' then
    raise exception 'subscription user is not active';
  end if;

  if v_sub.status not in ('pending', 'denied', 'canceled', 'success') then
    raise exception 'subscription is not eligible for activation (status=%)', v_sub.status;
  end if;

  v_already_activated := (v_sub.status = 'success' and v_sub.period_end is not null);

  -- Compare against all other successful orders, not only the one whose
  -- period_end currently matches the user row. A late older webhook may itself
  -- extend tariff_period_end, so matching by period_end would lose chronology.
  select created_at, id
    into v_latest_success_created_at, v_latest_success_id
    from public.subscriptions
   where user_id = v_sub.user_id
     and status = 'success'
     and id <> v_sub.id
   order by created_at desc, id desc
   limit 1;

  if v_already_activated then
    v_end := v_sub.period_end;
    v_start := coalesce(v_sub.period_start, v_end - interval '30 days');
  else
    v_start := greatest(
      coalesce(p_paid_at, now()),
      coalesce(v_user.tariff_period_end, coalesce(p_paid_at, now()))
    );
    v_end := v_start + interval '30 days';

    update public.subscriptions
       set status = 'success',
           period_start = v_start,
           period_end = v_end
     where id = v_sub.id;
  end if;

  -- Every valid late payment still adds its 30 days to the end of the
  -- entitlement. Only the newest-created paid order changes the current plan.
  if v_user.tariff_period_end is null or v_user.tariff_period_end <= v_end then
    if v_latest_success_created_at is null
       or v_sub.created_at > v_latest_success_created_at
       or (
         v_sub.created_at = v_latest_success_created_at
         and v_sub.id >= v_latest_success_id
       ) then
      update public.users
         set tariff_plan = v_sub.plan,
             tariff_period_end = v_end
       where id = v_user.id
         and account_status = 'active';
      v_plan_applied := true;
    else
      update public.users
         set tariff_period_end = v_end
       where id = v_user.id
         and account_status = 'active';
    end if;
  end if;

  select tariff_plan into v_effective_plan
    from public.users where id = v_user.id;

  return jsonb_build_object(
    'subscription_id', v_sub.id,
    'plan', v_sub.plan,
    'current_plan', v_effective_plan,
    'plan_applied', v_plan_applied,
    'period_start', v_start,
    'period_end', v_end,
    'email', v_user.email,
    'already_activated', v_already_activated
  );
end;
$$;

revoke all on function public.credit_paid_purchase(uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.credit_paid_purchase(uuid, timestamptz, text)
  to service_role;

revoke all on function public.activate_paid_subscription(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.activate_paid_subscription(uuid, timestamptz)
  to service_role;

commit;
