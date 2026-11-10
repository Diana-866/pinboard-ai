-- 066_pin_regeneration_credit_reservations.sql
-- Make single-pin regeneration participate in the same reserved-credit pool
-- as multi-pin generation. Unknown provider outcomes keep their reservation.

create or replace function public.reserve_pin_regeneration_credits(
  p_user_id text,
  p_idempotency_key text,
  p_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_balance integer;
  v_request public.pin_regeneration_requests%rowtype;
  v_reservation public.pin_generation_credit_reservations%rowtype;
  v_reserved bigint;
begin
  if p_user_id is null or p_idempotency_key is null or p_claim_token is null then
    raise exception 'invalid regeneration reservation';
  end if;

  -- Match the global credit lock order: user -> request -> reservation.
  select credits_balance into v_balance
    from public.users where id::text=p_user_id for update;
  if not found then raise exception 'regeneration user not found'; end if;

  select * into v_request
    from public.pin_regeneration_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key
   for update;
  if not found or v_request.status<>'processing'
     or v_request.claim_token is distinct from p_claim_token then
    raise exception 'regeneration claim mismatch';
  end if;

  select * into v_reservation
    from public.pin_generation_credit_reservations
   where user_id=p_user_id and idempotency_key=p_idempotency_key
   for update;
  if found then
    if v_reservation.amount<>v_request.amount then
      raise exception 'regeneration reservation amount mismatch';
    end if;
    if v_reservation.status='reserved' then
      return jsonb_build_object('status','reserved','amount',v_reservation.amount);
    end if;
    raise exception 'regeneration reservation is no longer active';
  end if;

  select coalesce(sum(amount),0) into v_reserved
    from public.pin_generation_credit_reservations
   where user_id=p_user_id and status='reserved';

  if coalesce(v_balance,0)-v_reserved<v_request.amount then
    raise exception 'insufficient available credits for regeneration reservation';
  end if;

  insert into public.pin_generation_credit_reservations(user_id,idempotency_key,amount)
  values(p_user_id,p_idempotency_key,v_request.amount);

  return jsonb_build_object(
    'status','reserved',
    'amount',v_request.amount,
    'available_after_reservation',coalesce(v_balance,0)-v_reserved-v_request.amount
  );
end;
$$;

create or replace function public.release_failed_pin_regeneration_reservation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if new.status='failed' and old.status is distinct from 'failed' then
    update public.pin_generation_credit_reservations
       set status='released',updated_at=clock_timestamp()
     where user_id=new.user_id
       and idempotency_key=new.idempotency_key
       and status='reserved';
  end if;
  return new;
end;
$$;

drop trigger if exists pin_regeneration_credit_reservation_release
  on public.pin_regeneration_requests;
create trigger pin_regeneration_credit_reservation_release
after update of status on public.pin_regeneration_requests
for each row
execute function public.release_failed_pin_regeneration_reservation();

create or replace function public.complete_pin_regeneration_request(
  p_user_id text,
  p_idempotency_key text,
  p_claim_token uuid,
  p_storage_url text
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_balance integer;
  v_request public.pin_regeneration_requests%rowtype;
  v_reservation public.pin_generation_credit_reservations%rowtype;
  v_has_reservation boolean := false;
  v_other_reserved bigint;
  v_pin jsonb;
begin
  if p_user_id is null or p_idempotency_key is null or p_claim_token is null then
    raise exception 'invalid regeneration completion';
  end if;

  -- Serialize all credit settlement with reservations and other spending.
  select credits_balance into v_balance
    from public.users where id::text=p_user_id for update;
  if not found then raise exception 'regeneration user not found'; end if;

  select * into v_request
    from public.pin_regeneration_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key
   for update;
  if not found then raise exception 'regeneration request not found'; end if;
  if v_request.status='completed' then
    return jsonb_build_object('pin',v_request.result_pin);
  end if;
  if v_request.status<>'processing' or v_request.claim_token is distinct from p_claim_token then
    raise exception 'regeneration claim mismatch';
  end if;
  if p_storage_url is null or length(trim(p_storage_url))=0 then
    raise exception 'permanent image URL required';
  end if;

  select * into v_reservation
    from public.pin_generation_credit_reservations
   where user_id=p_user_id and idempotency_key=p_idempotency_key
   for update;
  v_has_reservation := found;
  if v_has_reservation and
     (v_reservation.status<>'reserved' or v_reservation.amount<>v_request.amount) then
    raise exception 'regeneration credit reservation is not active or mismatched';
  end if;

  select coalesce(sum(amount),0) into v_other_reserved
    from public.pin_generation_credit_reservations
   where user_id=p_user_id and status='reserved'
     and (not v_has_reservation or id<>v_reservation.id);

  -- Legacy in-flight requests without a reservation may finish only from
  -- unreserved balance; new requests are reserved before provider submission.
  if coalesce(v_balance,0)-v_other_reserved<v_request.amount then
    raise exception 'insufficient credits after active generation reservations';
  end if;

  update public.users
     set credits_balance=coalesce(credits_balance,0)-v_request.amount
   where id::text=p_user_id
     and coalesce(credits_balance,0)>=v_request.amount
   returning credits_balance into v_balance;
  if not found then raise exception 'insufficient credits'; end if;

  update public.pins
     set image_url=p_storage_url,credits_cost=v_request.amount
   where id=v_request.pin_id;
  if not found then raise exception 'pin not found or not owned by user'; end if;

  insert into public.credit_transactions(user_id,amount,type,description)
  values(p_user_id,-v_request.amount,'regeneration','Перегенерация пина');

  if v_has_reservation then
    update public.pin_generation_credit_reservations
       set status='settled',updated_at=clock_timestamp()
     where id=v_reservation.id and status='reserved';
  end if;

  select to_jsonb(pin) into v_pin
    from public.pins pin where pin.id=v_request.pin_id;

  update public.pin_regeneration_requests
     set status='completed',storage_url=p_storage_url,result_pin=v_pin,
         error_code=null,updated_at=clock_timestamp()
   where id=v_request.id;

  return jsonb_build_object('pin',v_pin,'balance',v_balance);
end;
$$;

revoke all on function public.reserve_pin_regeneration_credits(text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.reserve_pin_regeneration_credits(text,text,uuid)
  to service_role;
revoke all on function public.complete_pin_regeneration_request(text,text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.complete_pin_regeneration_request(text,text,uuid,text)
  to service_role;
