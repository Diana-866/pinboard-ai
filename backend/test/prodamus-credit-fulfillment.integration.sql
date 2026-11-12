-- AUD-089: exercise the real paid-credit fulfillment RPC against PostgreSQL.
-- Runs after migration 010 and the later hardening migrations in atomic-payment-integration.yml.
begin;

do $$
declare
  v_user_id uuid;
  v_purchase_id uuid;
  v_balance integer;
  v_ledger_count integer;
  v_deleting_user_id uuid;
  v_deleting_purchase_id uuid;
  v_paid_at timestamptz := '2026-11-07T20:00:00Z';
begin
  if not has_function_privilege('service_role',
      'public.credit_paid_purchase(uuid,timestamp with time zone,text)', 'EXECUTE') then
    raise exception 'service_role must be able to execute credit_paid_purchase';
  end if;
  if has_function_privilege('authenticated',
      'public.credit_paid_purchase(uuid,timestamp with time zone,text)', 'EXECUTE') then
    raise exception 'authenticated must not be able to execute credit_paid_purchase';
  end if;

  insert into public.users(email, credits_balance)
  values ('aud089-credit-purchase@example.invalid', 25)
  returning id into v_user_id;

  -- A late, valid provider success may arrive after a local denial/cancellation.
  -- The webhook validates the signed amount/status before invoking this RPC.
  insert into public.credit_purchases(
    user_id, package_id, pack_title, credits, status, provider_payment_id,
    amount, currency
  ) values (
    v_user_id::text, 'pack_100', '100 credits', 100, 'canceled',
    'aud089-late-success', 190.00, 'rub'
  ) returning id into v_purchase_id;

  select public.credit_paid_purchase(
    v_purchase_id, v_paid_at, 'AUD-089 first fulfillment'
  ) into v_balance;

  if v_balance <> 125 then
    raise exception 'first fulfillment returned balance %, expected 125', v_balance;
  end if;

  -- Replay the exact same purchase: it must return the current balance without
  -- inserting another ledger row or adding the package credits again.
  select public.credit_paid_purchase(
    v_purchase_id, v_paid_at, 'AUD-089 duplicate fulfillment'
  ) into v_balance;

  if v_balance <> 125 then
    raise exception 'duplicate fulfillment returned balance %, expected 125', v_balance;
  end if;

  select count(*) into v_ledger_count
    from public.credit_transactions
   where purchase_id = v_purchase_id
     and user_id = v_user_id::text
     and amount = 100
     and type = 'topup';

  if v_ledger_count <> 1 then
    raise exception 'expected exactly one purchase ledger row, found %', v_ledger_count;
  end if;

  if not exists (
    select 1 from public.credit_purchases
     where id = v_purchase_id
       and status = 'success'
       and balance_credited_at is not null
       and paid_at = v_paid_at
  ) then
    raise exception 'purchase success marker and paid_at were not committed';
  end if;

  select credits_balance into v_balance
    from public.users where id = v_user_id;
  if v_balance <> 125 then
    raise exception 'stored user balance %, expected 125', v_balance;
  end if;

  -- A late paid callback must not replenish an account after deletion has
  -- fenced it. The purchase stays uncredited for reconciliation instead.
  insert into public.users(email, credits_balance, account_status)
  values ('aud089-deleted-account@example.invalid', 40, 'deleted')
  returning id into v_deleting_user_id;

  insert into public.credit_purchases(
    user_id, package_id, pack_title, credits, status, amount, currency
  ) values (
    v_deleting_user_id::text, 'pack_100', '100 credits', 100, 'pending', 190.00, 'rub'
  ) returning id into v_deleting_purchase_id;

  begin
    perform public.credit_paid_purchase(
      v_deleting_purchase_id, v_paid_at, 'AUD-089 late fulfillment after deletion finalization'
    );
    raise exception 'expected credit_paid_purchase to reject a deleted account';
  exception
    when others then
      if sqlerrm not like 'account is not active%' then
        raise;
      end if;
  end;

  if (select credits_balance from public.users where id = v_deleting_user_id) <> 40 then
    raise exception 'deleted account balance was unexpectedly changed';
  end if;

  if not exists (
    select 1 from public.credit_purchases
     where id = v_deleting_purchase_id
       and status = 'pending'
       and balance_credited_at is null
  ) then
    raise exception 'rejected late fulfillment unexpectedly changed the purchase';
  end if;
end;
$;

rollback;
