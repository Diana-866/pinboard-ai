-- 075_guard_legacy_single_pin_regeneration_debit.sql
-- The legacy RPC remains service_role-callable after journaled regeneration
-- moved to complete_pin_regeneration_request. Keep its debit inside the same
-- available-credit invariant and use the global user-before-pin lock order.
create or replace function public.update_pin_image_and_charge(
  p_user_id text,
  p_pin_id uuid,
  p_image_url text,
  p_amount integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_pin_id uuid;
  v_balance integer;
  v_reserved bigint;
begin
  if p_user_id is null or p_pin_id is null or p_image_url is null
     or length(trim(p_image_url)) = 0
     or p_amount is null or p_amount <= 0 then
    raise exception 'invalid regeneration arguments';
  end if;

  -- Global credit lock order: user first, then business rows/reservations.
  select credits_balance into v_balance
    from public.users
   where id::text = p_user_id
   for update;
  if not found then raise exception 'user not found'; end if;

  select pin.id into v_pin_id
    from public.pins pin
    join public.boards b on b.id = pin.board_id
    join public.projects p on p.id = b.project_id
   where pin.id = p_pin_id
     and p.user_id::text = p_user_id
   for update of pin;
  if not found then raise exception 'pin not found or not owned by user'; end if;

  select coalesce(sum(amount), 0) into v_reserved
    from public.pin_generation_credit_reservations
   where user_id = p_user_id
     and status = 'reserved';

  if coalesce(v_balance, 0)::bigint - v_reserved < p_amount::bigint then
    raise exception 'insufficient unreserved credits';
  end if;

  update public.users
     set credits_balance = coalesce(credits_balance, 0) - p_amount
   where id::text = p_user_id
   returning credits_balance into v_balance;

  update public.pins
     set image_url = p_image_url,
         credits_cost = p_amount
   where id = v_pin_id;

  insert into public.credit_transactions(user_id, amount, type, description)
  values (p_user_id, -p_amount, 'regeneration', 'Перегенерация пина');

  return jsonb_build_object('balance', v_balance, 'pin_id', v_pin_id);
end;
$$;

revoke all on function public.update_pin_image_and_charge(text, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.update_pin_image_and_charge(text, uuid, text, integer)
  to service_role;
