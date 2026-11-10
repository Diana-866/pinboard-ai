-- 065_resize_pin_generation_credit_reservation.sql
-- Resize a still-active generation reservation after exact task quotes are known.
-- Lock order matches generation settlement: user -> request -> reservation.
create or replace function public.resize_pin_generation_credit_reservation(
  p_user_id text,
  p_idempotency_key text,
  p_claim_token uuid,
  p_amount integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_balance integer;
  v_request public.pin_generation_requests%rowtype;
  v_reservation public.pin_generation_credit_reservations%rowtype;
  v_other_reserved bigint;
begin
  if p_user_id is null
     or p_idempotency_key is null
     or length(p_idempotency_key) < 16
     or length(p_idempotency_key) > 128
     or p_claim_token is null
     or p_amount is null
     or p_amount <= 0 then
    raise exception 'invalid generation reservation resize';
  end if;

  -- Serialize against all balance-changing reservations and settlements.
  select credits_balance into v_balance
    from public.users
   where id::text = p_user_id
   for update;
  if not found then raise exception 'generation user not found'; end if;

  select * into v_request
    from public.pin_generation_requests
   where user_id = p_user_id
     and idempotency_key = p_idempotency_key
   for update;
  if not found or v_request.status <> 'processing' then
    raise exception 'generation request is not processing';
  end if;
  if v_request.claim_token is distinct from p_claim_token then
    raise exception 'generation claim token mismatch';
  end if;

  select * into v_reservation
    from public.pin_generation_credit_reservations
   where user_id = p_user_id
     and idempotency_key = p_idempotency_key
   for update;
  if not found or v_reservation.status <> 'reserved' then
    raise exception 'generation credit reservation is not active';
  end if;

  select coalesce(sum(amount), 0) into v_other_reserved
    from public.pin_generation_credit_reservations
   where user_id = p_user_id
     and status = 'reserved'
     and id <> v_reservation.id;

  if coalesce(v_balance, 0) - v_other_reserved < p_amount then
    raise exception 'insufficient available credits for resized generation reservation';
  end if;

  update public.pin_generation_credit_reservations
     set amount = p_amount,
         updated_at = clock_timestamp()
   where id = v_reservation.id;

  return jsonb_build_object(
    'status', 'reserved',
    'amount', p_amount,
    'available_after_reservation', coalesce(v_balance, 0) - v_other_reserved - p_amount
  );
end;
$$;

revoke all on function public.resize_pin_generation_credit_reservation(text,text,uuid,integer)
  from public, anon, authenticated;
grant execute on function public.resize_pin_generation_credit_reservation(text,text,uuid,integer)
  to service_role;
