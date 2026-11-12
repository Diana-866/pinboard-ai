-- Regression coverage for provider-refund / Prodamus webhook races.
-- Runs after migrations 157-160 on the disposable PostgreSQL integration database.
begin;

do $$
declare
  v_admin_id uuid;
  v_before_user_id uuid;
  v_after_user_id uuid;
  v_delayed_user_id uuid;
  v_before_sub_id uuid;
  v_after_sub_id uuid;
  v_delayed_sub_id uuid;
  v_refund_at timestamptz;
  v_plan text;
  v_period_end timestamptz;
  v_status text;
begin
  insert into public.users(email,is_admin,account_status)
  values ('refund-race-admin@example.invalid',true,'active')
  returning id into v_admin_id;

  -- Race 1: refund is confirmed before the first activation webhook.
  insert into public.users(email,account_status,tariff_plan)
  values ('refund-before-activation@example.invalid','deletion_pending','none')
  returning id into v_before_user_id;
  insert into public.subscriptions(
    user_id,plan,status,provider_payment_id,amount,currency,provider_paid_at
  ) values (
    v_before_user_id::text,'pro','paid_unactivated','refund-before-activation',
    1290.00,'rub',clock_timestamp()
  ) returning id into v_before_sub_id;

  select public.admin_record_subscription_provider_refund(
    v_admin_id,v_before_sub_id,gen_random_uuid(),
    'provider_dashboard','refund-before-activation-001'
  ) into v_refund_at;

  begin
    perform public.activate_paid_subscription(v_before_sub_id,clock_timestamp());
    raise exception 'expected activation to reject a subscription refunded before activation';
  exception when others then
    if sqlerrm not like 'provider refund confirmed%' then raise; end if;
  end;

  select tariff_plan into v_plan from public.users where id=v_before_user_id;
  select status into v_status from public.subscriptions where id=v_before_sub_id;
  if v_plan <> 'none' or v_status <> 'paid_unactivated' then
    raise exception 'refund-before-activation race changed entitlement or subscription state';
  end if;

  -- Race 2: a provider refund is recorded after activation; a duplicate
  -- success webhook must not re-run the idempotent entitlement path.
  insert into public.users(email,account_status,tariff_plan,tariff_period_end)
  values ('refund-after-activation@example.invalid','active','pro',clock_timestamp()+interval '30 days')
  returning id into v_after_user_id;
  insert into public.subscriptions(
    user_id,plan,status,provider_payment_id,amount,currency,provider_paid_at,
    period_start,period_end
  ) values (
    v_after_user_id::text,'pro','success','refund-after-activation',
    1290.00,'rub',clock_timestamp(),clock_timestamp()-interval '1 day',
    clock_timestamp()+interval '29 days'
  ) returning id into v_after_sub_id;

  -- This represents provider-confirmed refund evidence arriving after the
  -- subscription had already been activated. The operational reconciliation
  -- path is separately permission-gated; this row mutation models its result.
  update public.subscriptions
     set provider_refunded_at=clock_timestamp(),
         provider_refund_evidence_type='provider_dashboard',
         provider_refund_evidence_reference='refund-after-activation-001',
         provider_refund_recorded_by=v_admin_id::text
   where id=v_after_sub_id;

  select tariff_period_end into v_period_end from public.users where id=v_after_user_id;
  begin
    perform public.activate_paid_subscription(v_after_sub_id,clock_timestamp());
    raise exception 'expected duplicate activation to reject a subscription refunded after activation';
  exception when others then
    if sqlerrm not like 'provider refund confirmed%' then raise; end if;
  end;

  select tariff_plan,tariff_period_end into v_plan,v_period_end
    from public.users where id=v_after_user_id;
  if v_plan <> 'pro' or v_period_end is null then
    raise exception 'duplicate webhook changed or erased the existing entitlement unexpectedly';
  end if;

  -- Race 3: refund wins, then a delayed success webhook attempts to mutate
  -- the subscription row directly. The database trigger must reject it even
  -- if a future webhook code path bypasses activate_paid_subscription.
  insert into public.users(email,account_status,tariff_plan)
  values ('refund-delayed-webhook@example.invalid','active','none')
  returning id into v_delayed_user_id;
  insert into public.subscriptions(
    user_id,plan,status,provider_payment_id,amount,currency,provider_paid_at
  ) values (
    v_delayed_user_id::text,'start','paid_unactivated','refund-delayed-webhook',
    190.00,'rub',clock_timestamp()
  ) returning id into v_delayed_sub_id;

  update public.subscriptions
     set provider_refunded_at=clock_timestamp(),
         provider_refund_evidence_type='provider_dashboard',
         provider_refund_evidence_reference='refund-delayed-webhook-001',
         provider_refund_recorded_by=v_admin_id::text
   where id=v_delayed_sub_id;

  begin
    update public.subscriptions
       set status='success',
           period_start=clock_timestamp(),
           period_end=clock_timestamp()+interval '30 days'
     where id=v_delayed_sub_id;
    raise exception 'expected delayed success webhook to be rejected by refund trigger';
  exception when others then
    if sqlerrm not like 'provider refund confirmed%' then raise; end if;
  end;

  select status into v_status from public.subscriptions where id=v_delayed_sub_id;
  select tariff_plan into v_plan from public.users where id=v_delayed_user_id;
  if v_status <> 'paid_unactivated' or v_plan <> 'none' then
    raise exception 'delayed webhook changed refunded subscription or user entitlement';
  end if;
end;
$$;

rollback;
