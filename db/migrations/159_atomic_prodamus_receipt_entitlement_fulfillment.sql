-- 159_atomic_prodamus_receipt_entitlement_fulfillment.sql
-- Bind receipt validation, lifecycle fencing, entitlement mutation and decision
-- persistence into one database transaction per payment kind.

begin;

create or replace function public.credit_paid_purchase_with_receipt(
  p_purchase_id uuid,
  p_paid_at timestamptz,
  p_description text,
  p_receipt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id text;
  v_user public.users%rowtype;
  v_purchase public.credit_purchases%rowtype;
  v_receipt public.payment_provider_receipts%rowtype;
  v_decision text;
  v_balance integer;
  v_idempotent boolean := false;
begin
  select * into v_receipt
    from public.payment_provider_receipts
   where id = p_receipt_id
     and provider = 'prodamus';

  if not found or v_receipt.payment_kind <> 'credits'
     or v_receipt.provider_status <> 'success' then
    raise exception 'verified successful credit receipt is required';
  end if;

  -- Resolve owner without taking a payment lock, then acquire the lifecycle
  -- fence before the purchase row to preserve migration 157's lock order.
  select user_id into v_user_id
    from public.credit_purchases
   where id = p_purchase_id;
  if not found then raise exception 'credit purchase not found'; end if;

  select * into v_user
    from public.users
   where id::text = v_user_id
   for update;
  if not found then raise exception 'purchase user not found'; end if;

  select * into v_purchase
    from public.credit_purchases
   where id = p_purchase_id
   for update;
  if not found then raise exception 'credit purchase not found'; end if;
  if v_purchase.user_id is distinct from v_user.id::text then
    raise exception 'credit purchase owner changed during fulfillment';
  end if;

  select decision into v_decision
    from public.payment_entitlement_decisions
   where receipt_id = p_receipt_id
   for update;
  if not found then raise exception 'provider receipt decision not found'; end if;

  if v_receipt.provider_order_id is distinct from v_purchase.provider_payment_id
     or v_receipt.received_amount is null
     or abs(v_receipt.received_amount - v_purchase.amount) > 0.01
     or coalesce(v_receipt.received_currency, 'rub') <> lower(coalesce(v_purchase.currency, 'rub')) then
    if v_decision in ('granted', 'withheld_account_lifecycle', 'rejected_mismatch') then
      raise exception 'terminal receipt decision conflicts with local credit purchase';
    end if;
    perform public.set_prodamus_payment_decision(
      p_receipt_id, 'rejected_mismatch', 'local_payment_identity_mismatch',
      'credits', v_purchase.id, v_purchase.user_id
    );
    return jsonb_build_object('decision', 'rejected_mismatch', 'idempotent', false);
  end if;

  if v_decision = 'granted' then
    if v_purchase.balance_credited_at is null then
      raise exception 'granted credit receipt is missing the purchase credit marker';
    end if;
    return jsonb_build_object(
      'decision', 'granted',
      'balance', coalesce(v_user.credits_balance, 0),
      'idempotent', true
    );
  elsif v_decision = 'withheld_account_lifecycle' then
    return jsonb_build_object('decision', v_decision, 'idempotent', true);
  elsif v_decision = 'rejected_mismatch' then
    return jsonb_build_object('decision', v_decision, 'idempotent', true);
  elsif v_decision not in ('pending_review', 'unmatched') then
    raise exception 'receipt decision is not eligible for credit fulfillment';
  end if;

  if v_purchase.balance_credited_at is not null then
    v_balance := coalesce(v_user.credits_balance, 0);
    perform public.set_prodamus_payment_decision(
      p_receipt_id, 'granted', null, 'credits', v_purchase.id, v_purchase.user_id
    );
    return jsonb_build_object('decision', 'granted', 'balance', v_balance, 'idempotent', true);
  end if;

  if v_user.account_status is distinct from 'active' then
    perform public.set_prodamus_payment_decision(
      p_receipt_id, 'withheld_account_lifecycle', 'account_not_active',
      'credits', v_purchase.id, v_purchase.user_id
    );
    return jsonb_build_object('decision', 'withheld_account_lifecycle', 'idempotent', false);
  end if;

  v_idempotent := false;
  v_balance := public.credit_paid_purchase(
    p_purchase_id, p_paid_at, p_description
  );

  perform public.set_prodamus_payment_decision(
    p_receipt_id, 'granted', null, 'credits', v_purchase.id, v_purchase.user_id
  );

  return jsonb_build_object(
    'decision', 'granted',
    'balance', v_balance,
    'idempotent', v_idempotent
  );
end;
$$;

create or replace function public.activate_paid_subscription_with_receipt(
  p_subscription_id uuid,
  p_paid_at timestamptz,
  p_receipt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id text;
  v_user public.users%rowtype;
  v_sub public.subscriptions%rowtype;
  v_receipt public.payment_provider_receipts%rowtype;
  v_decision text;
  v_activation jsonb;
begin
  select * into v_receipt
    from public.payment_provider_receipts
   where id = p_receipt_id
     and provider = 'prodamus';

  if not found or v_receipt.payment_kind <> 'subscription'
     or v_receipt.provider_status <> 'success' then
    raise exception 'verified successful subscription receipt is required';
  end if;

  select user_id into v_user_id
    from public.subscriptions
   where id = p_subscription_id;
  if not found then raise exception 'subscription not found'; end if;

  select * into v_user
    from public.users
   where id::text = v_user_id
   for update;
  if not found then raise exception 'subscription user not found'; end if;

  select * into v_sub
    from public.subscriptions
   where id = p_subscription_id
   for update;
  if not found then raise exception 'subscription not found'; end if;
  if v_sub.user_id is distinct from v_user.id::text then
    raise exception 'subscription owner changed during activation';
  end if;

  select decision into v_decision
    from public.payment_entitlement_decisions
   where receipt_id = p_receipt_id
   for update;
  if not found then raise exception 'provider receipt decision not found'; end if;

  if v_receipt.provider_order_id is distinct from v_sub.provider_payment_id
     or v_receipt.received_amount is null
     or abs(v_receipt.received_amount - v_sub.amount) > 0.01
     or coalesce(v_receipt.received_currency, 'rub') <> lower(coalesce(v_sub.currency, 'rub')) then
    if v_decision in ('granted', 'withheld_account_lifecycle', 'rejected_mismatch') then
      raise exception 'terminal receipt decision conflicts with local subscription';
    end if;
    perform public.set_prodamus_payment_decision(
      p_receipt_id, 'rejected_mismatch', 'local_payment_identity_mismatch',
      'subscription', v_sub.id, v_sub.user_id
    );
    return jsonb_build_object('decision', 'rejected_mismatch', 'subscription_id', v_sub.id);
  end if;

  if v_decision = 'granted' then
    if v_sub.status <> 'success' or v_sub.period_end is null then
      raise exception 'granted subscription receipt is missing the paid period';
    end if;
    return jsonb_build_object(
      'decision', 'granted',
      'subscription_id', v_sub.id,
      'plan', v_sub.plan,
      'current_plan', v_user.tariff_plan,
      'period_start', v_sub.period_start,
      'period_end', v_sub.period_end,
      'already_activated', true
    );
  elsif v_decision = 'withheld_account_lifecycle'
     or v_decision = 'rejected_mismatch' then
    return jsonb_build_object('decision', v_decision, 'subscription_id', v_sub.id);
  elsif v_decision not in ('pending_review', 'unmatched') then
    raise exception 'receipt decision is not eligible for subscription activation';
  end if;

  if v_sub.status = 'success' and v_sub.period_end is not null then
    perform public.set_prodamus_payment_decision(
      p_receipt_id, 'granted', null, 'subscription', v_sub.id, v_sub.user_id
    );
    return jsonb_build_object(
      'decision', 'granted',
      'subscription_id', v_sub.id,
      'plan', v_sub.plan,
      'current_plan', v_user.tariff_plan,
      'period_start', v_sub.period_start,
      'period_end', v_sub.period_end,
      'already_activated', true
    );
  end if;

  if v_user.account_status is distinct from 'active' then
    perform public.set_prodamus_payment_decision(
      p_receipt_id, 'withheld_account_lifecycle', 'account_not_active',
      'subscription', v_sub.id, v_sub.user_id
    );
    return jsonb_build_object('decision', 'withheld_account_lifecycle', 'subscription_id', v_sub.id);
  end if;

  v_activation := public.activate_paid_subscription(p_subscription_id, p_paid_at);
  perform public.set_prodamus_payment_decision(
    p_receipt_id, 'granted', null, 'subscription', v_sub.id, v_sub.user_id
  );

  return v_activation || jsonb_build_object('decision', 'granted');
end;
$$;

revoke all on function public.credit_paid_purchase_with_receipt(uuid, timestamptz, text, uuid)
  from public, anon, authenticated;
revoke all on function public.activate_paid_subscription_with_receipt(uuid, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.credit_paid_purchase_with_receipt(uuid, timestamptz, text, uuid)
  to service_role;
grant execute on function public.activate_paid_subscription_with_receipt(uuid, timestamptz, uuid)
  to service_role;

commit;
