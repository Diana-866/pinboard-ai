-- 159_serialize_unfulfilled_payment_markers_with_account_deletion.sql
-- A provider-success callback may fail its atomic fulfillment RPC and then
-- record a paid-but-unfulfilled liability. That fallback must take the same
-- owner -> payment-row locks as deletion finalization and refund reconciliation.
begin;

create or replace function public.record_paid_uncredited_credit_purchase(
  p_purchase_id uuid,
  p_paid_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_owner_id text;
  v_purchase public.credit_purchases%rowtype;
begin
  if p_purchase_id is null then
    raise exception 'credit purchase id is required';
  end if;

  select user_id into v_owner_id
    from public.credit_purchases
   where id=p_purchase_id;
  if not found then raise exception 'credit purchase not found'; end if;

  -- Match deletion/finalization and refund reconciliation lock order.
  perform 1 from public.users where id::text=v_owner_id for update;
  if not found then raise exception 'credit purchase owner not found'; end if;

  select * into v_purchase from public.credit_purchases
   where id=p_purchase_id for update;
  if not found or v_purchase.user_id is distinct from v_owner_id then
    raise exception 'credit purchase owner changed';
  end if;

  if v_purchase.balance_credited_at is not null or v_purchase.status='success' then
    return false;
  end if;
  if v_purchase.provider_refunded_at is not null then
    return false;
  end if;
  if v_purchase.status not in ('pending','denied','canceled','paid_uncredited') then
    raise exception 'credit purchase cannot be marked paid-uncredited (status=%)',v_purchase.status;
  end if;

  update public.credit_purchases
     set status='paid_uncredited',
         paid_at=coalesce(paid_at,p_paid_at,clock_timestamp())
   where id=p_purchase_id;

  return true;
end;
$function$;

create or replace function public.record_paid_unactivated_subscription(
  p_subscription_id uuid,
  p_paid_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_owner_id text;
  v_sub public.subscriptions%rowtype;
begin
  if p_subscription_id is null then
    raise exception 'subscription id is required';
  end if;

  select user_id into v_owner_id
    from public.subscriptions
   where id=p_subscription_id;
  if not found then raise exception 'subscription not found'; end if;

  -- Match deletion/finalization and refund reconciliation lock order.
  perform 1 from public.users where id::text=v_owner_id for update;
  if not found then raise exception 'subscription owner not found'; end if;

  select * into v_sub from public.subscriptions
   where id=p_subscription_id for update;
  if not found or v_sub.user_id is distinct from v_owner_id then
    raise exception 'subscription owner changed';
  end if;

  if v_sub.status='success' and v_sub.period_end is not null then
    return false;
  end if;
  if v_sub.provider_refunded_at is not null then
    return false;
  end if;
  if v_sub.period_end is not null then
    raise exception 'subscription period is already assigned';
  end if;
  if v_sub.status not in ('pending','denied','canceled','paid_unactivated') then
    raise exception 'subscription cannot be marked paid-unactivated (status=%)',v_sub.status;
  end if;

  update public.subscriptions
     set status='paid_unactivated',
         provider_paid_at=coalesce(provider_paid_at,p_paid_at,clock_timestamp())
   where id=p_subscription_id;

  return true;
end;
$function$;

revoke all on function public.record_paid_uncredited_credit_purchase(uuid,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.record_paid_uncredited_credit_purchase(uuid,timestamptz)
  to service_role;

revoke all on function public.record_paid_unactivated_subscription(uuid,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.record_paid_unactivated_subscription(uuid,timestamptz)
  to service_role;

commit;
