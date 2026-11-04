-- 010_atomic_credit_ledger.sql
-- Требует 001_baseline.sql и 009_hardening.sql (user_id уже UUID).
-- Все изменения баланса и запись журнала выполняются в одной транзакции.

alter table public.credit_transactions
  add column if not exists purchase_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'credit_transactions_purchase_id_fkey'
      and conrelid = 'public.credit_transactions'::regclass
  ) then
    alter table public.credit_transactions
      add constraint credit_transactions_purchase_id_fkey
      foreign key (purchase_id) references public.credit_purchases(id)
      on delete set null;
  end if;
end $$;

create unique index if not exists uq_credit_transactions_purchase_id
  on public.credit_transactions (purchase_id)
  where purchase_id is not null;

create or replace function public.adjust_credits_balance_and_log(
  p_user_id text,
  p_amount integer,
  p_type text,
  p_description text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_balance integer;
begin
  if p_user_id is null or p_amount is null or p_amount = 0 then
    raise exception 'user_id and non-zero amount are required';
  end if;
  if p_type is null or length(trim(p_type)) = 0 then
    raise exception 'transaction type is required';
  end if;

  update public.users
     set credits_balance = coalesce(credits_balance, 0) + p_amount
   where id = p_user_id::uuid
     and (p_amount > 0 or coalesce(credits_balance, 0) + p_amount >= 0)
   returning credits_balance into v_balance;

  if not found then
    if exists (select 1 from public.users where id = p_user_id::uuid) then
      raise exception 'insufficient credits';
    end if;
    raise exception 'user not found';
  end if;

  insert into public.credit_transactions(user_id, amount, type, description)
  values (p_user_id::uuid, p_amount, p_type, p_description);

  return v_balance;
end;
$$;

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
  v_purchase public.credit_purchases%rowtype;
  v_balance integer;
begin
  select * into v_purchase
    from public.credit_purchases
   where id = p_purchase_id
   for update;

  if not found then
    raise exception 'credit purchase not found';
  end if;

  -- Повторный/параллельный вебхук: уже начисленная покупка не начисляется снова.
  if v_purchase.balance_credited_at is not null then
    select credits_balance into v_balance
      from public.users where id = v_purchase.user_id;
    return v_balance;
  end if;

  if v_purchase.status not in ('pending', 'denied', 'success') then
    raise exception 'purchase is not eligible for crediting (status=%)', v_purchase.status;
  end if;
  if v_purchase.credits is null or v_purchase.credits <= 0 then
    raise exception 'invalid purchase credits';
  end if;

  update public.users
     set credits_balance = coalesce(credits_balance, 0) + v_purchase.credits
   where id = v_purchase.user_id
   returning credits_balance into v_balance;

  if not found then
    raise exception 'purchase user not found';
  end if;

  insert into public.credit_transactions(user_id, amount, type, description, purchase_id)
  values (
    v_purchase.user_id,
    v_purchase.credits,
    'topup',
    coalesce(p_description, 'Покупка кредитов'),
    v_purchase.id
  );

  update public.credit_purchases
     set status = 'success',
         paid_at = coalesce(p_paid_at, now()),
         balance_credited_at = now()
   where id = v_purchase.id;

  return v_balance;
end;
$$;

revoke all on function public.adjust_credits_balance_and_log(text, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.credit_paid_purchase(uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.adjust_credits_balance_and_log(text, integer, text, text)
  to service_role;
grant execute on function public.credit_paid_purchase(uuid, timestamptz, text)
  to service_role;
