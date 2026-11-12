-- 152_prevent_crediting_purchases_for_deleting_accounts.sql
-- Serialize payment crediting with account deletion using the established
-- owner -> purchase lock order. A late webhook may settle while deletion is pending (the worker waits for
-- pending purchases), but must never replenish a finalized deletion tombstone.
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
as $function$
declare
  v_purchase_user_id text;
  v_user_status text;
  v_purchase public.credit_purchases%rowtype;
  v_balance integer;
begin
  if p_purchase_id is null then
    raise exception 'purchase id is required';
  end if;

  -- Discover the owner without locking the purchase. Lock the owner first so
  -- this transaction serializes with request_account_deletion and finalization.
  select user_id into v_purchase_user_id
    from public.credit_purchases
   where id = p_purchase_id;
  if not found then
    raise exception 'credit purchase not found';
  end if;

  select account_status into v_user_status
    from public.users
   where id::text = v_purchase_user_id
   for update;
  if not found then
    raise exception 'purchase user not found';
  end if;

  -- Re-read and lock the purchase only after the owner lock. This preserves
  -- the global owner -> dependent-row order and revalidates its owner.
  select * into v_purchase
    from public.credit_purchases
   where id = p_purchase_id
   for update;
  if not found or v_purchase.user_id is distinct from v_purchase_user_id then
    raise exception 'credit purchase owner changed';
  end if;

  if v_purchase.balance_credited_at is not null then
    select credits_balance into v_balance
      from public.users
     where id::text = v_purchase_user_id;
    if not found then raise exception 'purchase user not found'; end if;
    return v_balance;
  end if;

  if v_user_status = 'deleted' then
    raise exception 'account is deleted; paid purchase requires reconciliation';
  end if;

  if v_purchase.status not in ('pending', 'denied', 'canceled', 'success', 'paid_uncredited') then
    raise exception 'purchase is not eligible for crediting (status=%)', v_purchase.status;
  end if;
  if v_purchase.credits is null or v_purchase.credits <= 0 then
    raise exception 'invalid purchase credits';
  end if;

  update public.users
     set credits_balance = coalesce(credits_balance, 0) + v_purchase.credits
   where id::text = v_purchase_user_id
     and account_status <> 'deleted'
   returning credits_balance into v_balance;
  if not found then
    raise exception 'account is deleted; paid purchase requires reconciliation';
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
$function$;

revoke all on function public.credit_paid_purchase(uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.credit_paid_purchase(uuid, timestamptz, text)
  to service_role;

commit;
