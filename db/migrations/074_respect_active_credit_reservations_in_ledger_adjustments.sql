-- 074_respect_active_credit_reservations_in_ledger_adjustments.sql
-- Keep generic/legacy balance adjustments from spending credits held for
-- in-flight image generation or regeneration provider requests.
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
  v_reserved bigint;
begin
  if p_user_id is null or length(trim(p_user_id)) = 0
     or p_amount is null or p_amount = 0 then
    raise exception 'user_id and non-zero amount are required';
  end if;
  if p_type is null or length(trim(p_type)) = 0 then
    raise exception 'transaction type is required';
  end if;

  -- Preserve the shared lock order used by reserve/settle paths:
  -- user row first, then aggregate active reservation rows.
  select credits_balance into v_balance
    from public.users
   where id::text = p_user_id
   for update;
  if not found then
    raise exception 'user not found';
  end if;

  if p_amount < 0 then
    select coalesce(sum(amount), 0) into v_reserved
      from public.pin_generation_credit_reservations
     where user_id = p_user_id
       and status = 'reserved';

    if coalesce(v_balance, 0)::bigint - v_reserved < -(p_amount::bigint) then
      raise exception 'insufficient unreserved credits';
    end if;
  elsif coalesce(v_balance, 0)::bigint + p_amount::bigint > 2147483647 then
    raise exception 'credit balance overflow';
  end if;

  update public.users
     set credits_balance = coalesce(credits_balance, 0) + p_amount
   where id::text = p_user_id
   returning credits_balance into v_balance;

  insert into public.credit_transactions(user_id, amount, type, description)
  values (p_user_id, p_amount, p_type, p_description);

  return v_balance;
end;
$$;

revoke all on function public.adjust_credits_balance_and_log(text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.adjust_credits_balance_and_log(text, integer, text, text)
  to service_role;
