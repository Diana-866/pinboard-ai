-- 161_restrict_granted_decisions_to_atomic_fulfillment.sql
-- service_role may record review/withheld outcomes, but cannot independently
-- assert a grant. Only the receipt-bound fulfillment RPCs may mark granted,
-- after validating the committed local entitlement in the same transaction.

begin;

create or replace function public.set_prodamus_payment_decision(
  p_receipt_id uuid,
  p_decision text,
  p_safe_reason_code text default null,
  p_local_payment_kind text default null,
  p_local_payment_id uuid default null,
  p_user_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.payment_entitlement_decisions%rowtype;
begin
  if p_decision is null or p_decision not in (
    'pending_review', 'withheld_account_lifecycle',
    'rejected_mismatch', 'unmatched', 'ignored_non_success'
  ) then
    raise exception 'invalid entitlement decision';
  end if;
  if p_safe_reason_code is not null
     and p_safe_reason_code !~ '^[a-z0-9_]{1,80}$' then
    raise exception 'invalid decision reason';
  end if;
  if p_local_payment_kind is not null
     and p_local_payment_kind not in ('subscription', 'credits') then
    raise exception 'invalid local payment kind';
  end if;
  if p_local_payment_id is not null and (p_local_payment_kind is null or p_user_id is null) then
    raise exception 'local payment kind and owner are required with local payment id';
  end if;
  if p_user_id is not null and (length(p_user_id) < 1 or length(p_user_id) > 200) then
    raise exception 'invalid decision user id';
  end if;

  select * into v_existing
    from public.payment_entitlement_decisions
   where receipt_id = p_receipt_id
   for update;
  if not found then
    raise exception 'provider receipt decision not found';
  end if;

  if v_existing.decision not in ('pending_review', 'unmatched') then
    if v_existing.decision = p_decision then
      return true;
    end if;
    raise exception 'terminal entitlement decision cannot be overwritten';
  end if;

  update public.payment_entitlement_decisions
     set decision = p_decision,
         safe_reason_code = p_safe_reason_code,
         local_payment_kind = coalesce(p_local_payment_kind, local_payment_kind),
         local_payment_id = coalesce(p_local_payment_id, local_payment_id),
         user_id = coalesce(p_user_id, user_id),
         decided_at = clock_timestamp()
   where receipt_id = p_receipt_id;

  return true;
end;
$$;

create or replace function public.mark_prodamus_entitlement_granted(
  p_receipt_id uuid,
  p_local_payment_kind text,
  p_local_payment_id uuid,
  p_user_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_receipt public.payment_provider_receipts%rowtype;
  v_decision public.payment_entitlement_decisions%rowtype;
  v_payment_user_id text;
  v_provider_order_id text;
  v_payment_status text;
  v_credit_marker timestamptz;
  v_period_end timestamptz;
  v_payment_amount numeric(12,2);
  v_payment_currency text;
begin
  if p_receipt_id is null or p_local_payment_id is null
     or p_local_payment_kind is null or p_local_payment_kind not in ('credits', 'subscription')
     or p_user_id is null or length(p_user_id) < 1 or length(p_user_id) > 200 then
    raise exception 'invalid granted entitlement identity';
  end if;

  select * into v_receipt
    from public.payment_provider_receipts
   where id = p_receipt_id and provider = 'prodamus';
  if not found or v_receipt.payment_kind <> p_local_payment_kind
     or v_receipt.provider_status <> 'success' then
    raise exception 'verified successful provider receipt is required';
  end if;

  select * into v_decision
    from public.payment_entitlement_decisions
   where receipt_id = p_receipt_id
   for update;
  if not found then raise exception 'provider receipt decision not found'; end if;

  if (v_decision.local_payment_kind is not null
      and v_decision.local_payment_kind is distinct from p_local_payment_kind)
     or (v_decision.local_payment_id is not null
      and v_decision.local_payment_id is distinct from p_local_payment_id)
     or (v_decision.user_id is not null
      and v_decision.user_id is distinct from p_user_id) then
    raise exception 'receipt decision is already bound to another local payment';
  end if;

  if v_decision.decision = 'granted' then
    if v_decision.local_payment_kind is distinct from p_local_payment_kind
       or v_decision.local_payment_id is distinct from p_local_payment_id
       or v_decision.user_id is distinct from p_user_id then
      raise exception 'granted receipt decision is bound to another local payment';
    end if;
    return true;
  end if;
  if v_decision.decision not in ('pending_review', 'unmatched') then
    raise exception 'receipt decision is not eligible for grant';
  end if;

  if p_local_payment_kind = 'credits' then
    select user_id, provider_payment_id, status, balance_credited_at, amount, currency
      into v_payment_user_id, v_provider_order_id, v_payment_status, v_credit_marker,
           v_payment_amount, v_payment_currency
      from public.credit_purchases
     where id = p_local_payment_id;
    if not found or v_payment_user_id is distinct from p_user_id
       or v_provider_order_id is distinct from v_receipt.provider_order_id
       or v_payment_status <> 'success' or v_credit_marker is null
       or v_receipt.received_amount is null or v_payment_amount is null
       or abs(v_receipt.received_amount - v_payment_amount) > 0.01
       or coalesce(v_receipt.received_currency, 'rub') <> lower(coalesce(v_payment_currency, 'rub')) then
      raise exception 'credit entitlement is not committed for this receipt';
    end if;
  else
    select user_id, provider_payment_id, status, period_end, amount, currency
      into v_payment_user_id, v_provider_order_id, v_payment_status, v_period_end,
           v_payment_amount, v_payment_currency
      from public.subscriptions
     where id = p_local_payment_id;
    if not found or v_payment_user_id is distinct from p_user_id
       or v_provider_order_id is distinct from v_receipt.provider_order_id
       or v_payment_status <> 'success' or v_period_end is null
       or v_receipt.received_amount is null
       or abs(v_receipt.received_amount - v_payment_amount) > 0.01
       or coalesce(v_receipt.received_currency, 'rub') <> lower(coalesce(v_payment_currency, 'rub')) then
      raise exception 'subscription entitlement is not committed for this receipt';
    end if;
  end if;

  update public.payment_entitlement_decisions
     set decision = 'granted',
         safe_reason_code = null,
         local_payment_kind = p_local_payment_kind,
         local_payment_id = p_local_payment_id,
         user_id = p_user_id,
         decided_at = clock_timestamp()
   where receipt_id = p_receipt_id;

  return true;
end;
$$;

-- Replace the wrapper's direct calls to the general decision RPC with the
-- grant-only internal function. The wrappers already hold users -> payment ->
-- decision locks and run entitlement + decision in the same transaction.
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
  v_decision_row public.payment_entitlement_decisions%rowtype;
  v_balance integer;
begin
  select * into v_receipt from public.payment_provider_receipts
   where id = p_receipt_id and provider = 'prodamus';
  if not found or v_receipt.payment_kind <> 'credits'
     or v_receipt.provider_status <> 'success' then
    raise exception 'verified successful credit receipt is required';
  end if;

  select user_id into v_user_id from public.credit_purchases where id = p_purchase_id;
  if not found then raise exception 'credit purchase not found'; end if;
  select * into v_user from public.users where id::text = v_user_id for update;
  if not found then raise exception 'purchase user not found'; end if;
  select * into v_purchase from public.credit_purchases where id = p_purchase_id for update;
  if not found then raise exception 'credit purchase not found'; end if;
  if v_purchase.user_id is distinct from v_user.id::text then
    raise exception 'credit purchase owner changed during fulfillment';
  end if;
  select * into v_decision_row from public.payment_entitlement_decisions
   where receipt_id = p_receipt_id for update;
  if not found then raise exception 'provider receipt decision not found'; end if;

  if v_decision_row.decision in ('granted', 'withheld_account_lifecycle', 'rejected_mismatch')
     and (v_decision_row.local_payment_kind is distinct from 'credits'
       or v_decision_row.local_payment_id is distinct from v_purchase.id
       or v_decision_row.user_id is distinct from v_purchase.user_id) then
    raise exception 'terminal receipt decision conflicts with local credit purchase';
  end if;

  if v_receipt.provider_order_id is distinct from v_purchase.provider_payment_id
     or v_receipt.received_amount is null
     or abs(v_receipt.received_amount - v_purchase.amount) > 0.01
     or coalesce(v_receipt.received_currency, 'rub') <> lower(coalesce(v_purchase.currency, 'rub')) then
    if v_decision_row.decision = 'rejected_mismatch' then
      return jsonb_build_object('decision', 'rejected_mismatch', 'idempotent', true);
    elsif v_decision_row.decision in ('granted', 'withheld_account_lifecycle') then
      raise exception 'terminal receipt decision conflicts with local credit purchase';
    end if;
    perform public.set_prodamus_payment_decision(
      p_receipt_id, 'rejected_mismatch', 'local_payment_identity_mismatch',
      'credits', v_purchase.id, v_purchase.user_id
    );
    return jsonb_build_object('decision', 'rejected_mismatch', 'idempotent', false);
  end if;

  if v_decision_row.decision = 'granted' then
    if v_purchase.balance_credited_at is null then
      raise exception 'granted credit receipt is missing the purchase credit marker';
    end if;
    return jsonb_build_object('decision', 'granted',
      'balance', coalesce(v_user.credits_balance, 0), 'idempotent', true);
  elsif v_decision_row.decision = 'withheld_account_lifecycle' then
    return jsonb_build_object('decision', 'withheld_account_lifecycle', 'idempotent', true);
  elsif v_decision_row.decision = 'rejected_mismatch' then
    return jsonb_build_object('decision', 'rejected_mismatch', 'idempotent', true);
  elsif v_decision_row.decision not in ('pending_review', 'unmatched') then
    raise exception 'receipt decision is not eligible for credit fulfillment';
  end if;

  if v_purchase.balance_credited_at is not null then
    v_balance := coalesce(v_user.credits_balance, 0);
    perform public.mark_prodamus_entitlement_granted(
      p_receipt_id, 'credits', v_purchase.id, v_purchase.user_id
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

  v_balance := public.credit_paid_purchase(p_purchase_id, p_paid_at, p_description);
  perform public.mark_prodamus_entitlement_granted(
    p_receipt_id, 'credits', v_purchase.id, v_purchase.user_id
  );

  return jsonb_build_object('decision', 'granted', 'balance', v_balance, 'idempotent', false);
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
  v_decision_row public.payment_entitlement_decisions%rowtype;
  v_activation jsonb;
begin
  select * into v_receipt from public.payment_provider_receipts
   where id = p_receipt_id and provider = 'prodamus';
  if not found or v_receipt.payment_kind <> 'subscription'
     or v_receipt.provider_status <> 'success' then
    raise exception 'verified successful subscription receipt is required';
  end if;

  select user_id into v_user_id from public.subscriptions where id = p_subscription_id;
  if not found then raise exception 'subscription not found'; end if;
  select * into v_user from public.users where id::text = v_user_id for update;
  if not found then raise exception 'subscription user not found'; end if;
  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'subscription not found'; end if;
  if v_sub.user_id is distinct from v_user.id::text then
    raise exception 'subscription owner changed during activation';
  end if;
  select * into v_decision_row from public.payment_entitlement_decisions
   where receipt_id = p_receipt_id for update;
  if not found then raise exception 'provider receipt decision not found'; end if;

  if v_decision_row.decision in ('granted', 'withheld_account_lifecycle', 'rejected_mismatch')
     and (v_decision_row.local_payment_kind is distinct from 'subscription'
       or v_decision_row.local_payment_id is distinct from v_sub.id
       or v_decision_row.user_id is distinct from v_sub.user_id) then
    raise exception 'terminal receipt decision conflicts with local subscription';
  end if;

  if v_receipt.provider_order_id is distinct from v_sub.provider_payment_id
     or v_receipt.received_amount is null
     or abs(v_receipt.received_amount - v_sub.amount) > 0.01
     or coalesce(v_receipt.received_currency, 'rub') <> lower(coalesce(v_sub.currency, 'rub')) then
    if v_decision_row.decision = 'rejected_mismatch' then
      return jsonb_build_object('decision', 'rejected_mismatch', 'subscription_id', v_sub.id, 'idempotent', true);
    elsif v_decision_row.decision in ('granted', 'withheld_account_lifecycle') then
      raise exception 'terminal receipt decision conflicts with local subscription';
    end if;
    perform public.set_prodamus_payment_decision(
      p_receipt_id, 'rejected_mismatch', 'local_payment_identity_mismatch',
      'subscription', v_sub.id, v_sub.user_id
    );
    return jsonb_build_object('decision', 'rejected_mismatch', 'subscription_id', v_sub.id, 'idempotent', false);
  end if;

  if v_decision_row.decision = 'granted' then
    if v_sub.status <> 'success' or v_sub.period_end is null then
      raise exception 'granted subscription receipt is missing the paid period';
    end if;
    return jsonb_build_object(
      'decision', 'granted', 'subscription_id', v_sub.id,
      'plan', v_sub.plan, 'current_plan', v_user.tariff_plan,
      'period_start', v_sub.period_start, 'period_end', v_sub.period_end,
      'already_activated', true
    );
  elsif v_decision_row.decision = 'withheld_account_lifecycle'
     or v_decision_row.decision = 'rejected_mismatch' then
    return jsonb_build_object('decision', v_decision_row.decision, 'subscription_id', v_sub.id);
  elsif v_decision_row.decision not in ('pending_review', 'unmatched') then
    raise exception 'receipt decision is not eligible for subscription activation';
  end if;

  if v_sub.status = 'success' and v_sub.period_end is not null then
    perform public.mark_prodamus_entitlement_granted(
      p_receipt_id, 'subscription', v_sub.id, v_sub.user_id
    );
    return jsonb_build_object(
      'decision', 'granted', 'subscription_id', v_sub.id,
      'plan', v_sub.plan, 'current_plan', v_user.tariff_plan,
      'period_start', v_sub.period_start, 'period_end', v_sub.period_end,
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
  perform public.mark_prodamus_entitlement_granted(
    p_receipt_id, 'subscription', v_sub.id, v_sub.user_id
  );

  return v_activation || jsonb_build_object('decision', 'granted');
end;
$$;

revoke all on function public.mark_prodamus_entitlement_granted(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.set_prodamus_payment_decision(uuid, text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_prodamus_payment_decision(uuid, text, text, text, uuid, text)
  to service_role;

commit;
