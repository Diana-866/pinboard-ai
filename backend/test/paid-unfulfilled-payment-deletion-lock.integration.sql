-- Exercise the webhook fallback RPCs against the disposable PostgreSQL schema.
begin;

do $$
declare
  v_user uuid;
  v_purchase uuid;
  v_subscription uuid;
  v_marked boolean;
begin
  insert into public.users(email,password_hash,account_status)
  values ('deleted-payment-marker-test@invalid.example', 'test-hash', 'deleted')
  returning id into v_user;

  insert into public.credit_purchases(
    user_id,package_id,pack_title,credits,status,amount,currency,provider_payment_id
  ) values (
    v_user::text,'test-pack','Test pack',100,'pending',190,'rub','marker-credit-'||v_user::text
  ) returning id into v_purchase;

  v_marked := public.record_paid_uncredited_credit_purchase(v_purchase,clock_timestamp());
  if v_marked is distinct from true then
    raise exception 'deleted-account credit liability was not recorded';
  end if;
  if not exists (
    select 1 from public.credit_purchases
     where id=v_purchase and status='paid_uncredited'
       and paid_at is not null and balance_credited_at is null
  ) then
    raise exception 'credit liability marker was not persisted';
  end if;
  if public.record_paid_uncredited_credit_purchase(v_purchase,clock_timestamp()) is distinct from true then
    raise exception 'credit liability marker is not idempotent';
  end if;

  insert into public.subscriptions(
    user_id,plan,status,amount,currency,provider_payment_id
  ) values (
    v_user::text,'start','pending',1990,'rub','marker-sub-'||v_user::text
  ) returning id into v_subscription;

  v_marked := public.record_paid_unactivated_subscription(v_subscription,clock_timestamp());
  if v_marked is distinct from true then
    raise exception 'deleted-account subscription liability was not recorded';
  end if;
  if not exists (
    select 1 from public.subscriptions
     where id=v_subscription and status='paid_unactivated'
       and provider_paid_at is not null
  ) then
    raise exception 'subscription liability marker was not persisted';
  end if;
  if public.record_paid_unactivated_subscription(v_subscription,clock_timestamp()) is distinct from true then
    raise exception 'subscription liability marker is not idempotent';
  end if;

  update public.credit_purchases
     set provider_refunded_at=clock_timestamp()
   where id=v_purchase;
  if public.record_paid_uncredited_credit_purchase(v_purchase,clock_timestamp()) is distinct from false then
    raise exception 'credit webhook marker overwrote confirmed refund evidence';
  end if;

  update public.subscriptions
     set provider_refunded_at=clock_timestamp()
   where id=v_subscription;
  if public.record_paid_unactivated_subscription(v_subscription,clock_timestamp()) is distinct from false then
    raise exception 'subscription webhook marker overwrote confirmed refund evidence';
  end if;
end;
$$;

rollback;
