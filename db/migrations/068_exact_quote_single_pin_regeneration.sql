-- 068_exact_quote_single_pin_regeneration.sql
-- Store the exact GPTunnel quote and resize regeneration credits before submit
-- and again against the terminal provider price before settlement.

alter table public.pin_regeneration_requests
  add column if not exists provider_quote_price numeric,
  add column if not exists provider_quote_currency text,
  add column if not exists provider_quote_model text,
  add column if not exists provider_quote_aspect_ratio text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname='pin_regeneration_requests_quote_valid'
       and conrelid='public.pin_regeneration_requests'::regclass
  ) then
    alter table public.pin_regeneration_requests
      add constraint pin_regeneration_requests_quote_valid check (
        (num_nonnulls(provider_quote_price,provider_quote_currency,
          provider_quote_model,provider_quote_aspect_ratio)=0)
        or
        (num_nonnulls(provider_quote_price,provider_quote_currency,
          provider_quote_model,provider_quote_aspect_ratio)=4
          and provider_quote_price>0
          and provider_quote_price::text not in ('NaN','Infinity','-Infinity')
          and provider_quote_currency='RUB'
          and provider_quote_model=model
          and provider_quote_aspect_ratio='2:3')
      );
  end if;
end;
$$;

create or replace function public.record_pin_regeneration_quote(
  p_user_id text,
  p_idempotency_key text,
  p_claim_token uuid,
  p_quote_price numeric,
  p_quote_currency text,
  p_quote_model text,
  p_quote_aspect_ratio text,
  p_user_credits integer
) returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_balance integer;
  v_request public.pin_regeneration_requests%rowtype;
  v_reservation public.pin_generation_credit_reservations%rowtype;
  v_other_reserved bigint;
begin
  if p_user_id is null or p_idempotency_key is null or p_claim_token is null
     or p_quote_price is null or p_quote_price<=0
     or p_quote_price::text in ('NaN','Infinity','-Infinity')
     or p_quote_currency is distinct from 'RUB'
     or p_quote_model is null or p_quote_aspect_ratio is distinct from '2:3'
     or p_user_credits is null or p_user_credits<1 then
    raise exception 'invalid regeneration quote';
  end if;

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
  if p_quote_model is distinct from v_request.model then
    raise exception 'regeneration quote model mismatch';
  end if;

  if v_request.provider_quote_price is not null then
    if v_request.provider_quote_price is distinct from p_quote_price
       or v_request.provider_quote_currency is distinct from p_quote_currency
       or v_request.provider_quote_model is distinct from p_quote_model
       or v_request.provider_quote_aspect_ratio is distinct from p_quote_aspect_ratio then
      raise exception 'conflicting regeneration quote replay';
    end if;
    if v_request.amount<>p_user_credits then
      raise exception 'regeneration quote credit amount mismatch';
    end if;
    return true;
  end if;

  select * into v_reservation
    from public.pin_generation_credit_reservations
   where user_id=p_user_id and idempotency_key=p_idempotency_key
   for update;

  if found then
    if v_reservation.status<>'reserved' then
      raise exception 'regeneration reservation is no longer active';
    end if;
    select coalesce(sum(amount),0) into v_other_reserved
      from public.pin_generation_credit_reservations
     where user_id=p_user_id and status='reserved' and id<>v_reservation.id;
    if coalesce(v_balance,0)-v_other_reserved<p_user_credits then
      raise exception 'insufficient available credits for regeneration quote';
    end if;
    update public.pin_generation_credit_reservations
       set amount=p_user_credits,updated_at=clock_timestamp()
     where id=v_reservation.id;
  end if;

  update public.pin_regeneration_requests
     set amount=p_user_credits,
         provider_quote_price=p_quote_price,
         provider_quote_currency=p_quote_currency,
         provider_quote_model=p_quote_model,
         provider_quote_aspect_ratio=p_quote_aspect_ratio,
         updated_at=clock_timestamp()
   where id=v_request.id;
  return true;
end;
$$;

create or replace function public.resize_pin_regeneration_credit_reservation(
  p_user_id text,
  p_idempotency_key text,
  p_claim_token uuid,
  p_amount integer
) returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_balance integer;
  v_request public.pin_regeneration_requests%rowtype;
  v_reservation public.pin_generation_credit_reservations%rowtype;
  v_other_reserved bigint;
begin
  if p_user_id is null or p_idempotency_key is null or p_claim_token is null
     or p_amount is null or p_amount<1 then
    raise exception 'invalid regeneration reservation resize';
  end if;

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
    if v_reservation.status<>'reserved' then
      raise exception 'regeneration reservation is no longer active';
    end if;
    select coalesce(sum(amount),0) into v_other_reserved
      from public.pin_generation_credit_reservations
     where user_id=p_user_id and status='reserved' and id<>v_reservation.id;
    if coalesce(v_balance,0)-v_other_reserved<p_amount then
      raise exception 'insufficient available credits for regeneration settlement';
    end if;
    update public.pin_generation_credit_reservations
       set amount=p_amount,updated_at=clock_timestamp()
     where id=v_reservation.id;
  else
    -- Legacy in-flight tasks may predate reservation support. Keep them
    -- recoverable, but completion still checks unreserved balance atomically.
    select coalesce(sum(amount),0) into v_other_reserved
      from public.pin_generation_credit_reservations
     where user_id=p_user_id and status='reserved';
    if coalesce(v_balance,0)-v_other_reserved<p_amount then
      raise exception 'insufficient available credits for regeneration settlement';
    end if;
  end if;

  update public.pin_regeneration_requests
     set amount=p_amount,updated_at=clock_timestamp()
   where id=v_request.id;
  return true;
end;
$$;

revoke all on function public.record_pin_regeneration_quote(text,text,uuid,numeric,text,text,text,integer)
  from public,anon,authenticated;
grant execute on function public.record_pin_regeneration_quote(text,text,uuid,numeric,text,text,text,integer)
  to service_role;
revoke all on function public.resize_pin_regeneration_credit_reservation(text,text,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.resize_pin_regeneration_credit_reservation(text,text,uuid,integer)
  to service_role;
