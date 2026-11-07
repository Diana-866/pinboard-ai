-- 054_pin_generation_credit_reservations.sql
-- Reserve generation budget atomically before calling a billable image provider.
create table if not exists public.pin_generation_credit_reservations (
  id bigserial primary key,
  user_id text not null,
  idempotency_key varchar(128) not null,
  amount integer not null check (amount > 0),
  status text not null default 'reserved'
    check (status in ('reserved','settling','settled','released')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(user_id,idempotency_key)
);
create index if not exists pin_generation_credit_reservations_active_idx
  on public.pin_generation_credit_reservations(user_id)
  where status='reserved';
alter table public.pin_generation_credit_reservations enable row level security;
revoke all on public.pin_generation_credit_reservations from public,anon,authenticated;
grant select,insert,update,delete on public.pin_generation_credit_reservations to service_role;
grant usage,select on sequence public.pin_generation_credit_reservations_id_seq to service_role;

create or replace function public.reserve_pin_generation_credits(
  p_user_id text,p_idempotency_key text,p_amount integer
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
declare
  v_balance integer;
  v_reserved bigint;
  v_existing public.pin_generation_credit_reservations%rowtype;
begin
  if p_user_id is null or p_idempotency_key is null or p_amount is null or p_amount<=0 then
    raise exception 'invalid generation credit reservation';
  end if;
  -- Serialize all reservations for this user, so two distinct idempotency
  -- keys cannot both reserve the same spendable credits.
  select credits_balance into v_balance from public.users
   where id::text=p_user_id for update;
  if not found then raise exception 'generation user not found'; end if;

  select * into v_existing from public.pin_generation_credit_reservations
   where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.amount<>p_amount then raise exception 'generation reservation amount mismatch'; end if;
    if v_existing.status='reserved' then
      return jsonb_build_object('status','reserved','amount',v_existing.amount);
    elsif v_existing.status='settled' then
      return jsonb_build_object('status','settled','amount',v_existing.amount);
    else
      raise exception 'generation reservation was released';
    end if;
  end if;

  select coalesce(sum(amount),0) into v_reserved
    from public.pin_generation_credit_reservations
   where user_id=p_user_id and status='reserved';
  if coalesce(v_balance,0)-v_reserved < p_amount then
    raise exception 'insufficient available credits for generation reservation';
  end if;
  insert into public.pin_generation_credit_reservations(user_id,idempotency_key,amount)
  values(p_user_id,p_idempotency_key,p_amount);
  return jsonb_build_object('status','reserved','amount',p_amount,
    'available_after_reservation',coalesce(v_balance,0)-v_reserved-p_amount);
end; $$;

create or replace function public.sync_pin_generation_credit_reservation()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
begin
  if new.status='completed' and old.status<>'completed' then
    update public.pin_generation_credit_reservations
       set status='settled',updated_at=clock_timestamp()
     where user_id=new.user_id and idempotency_key=new.idempotency_key and status in ('reserved','settling');
  elsif new.status='failed' and old.status<>'failed' then
    -- Unknown outcomes retain their reservation until reconciliation. A
    -- definitive failure is safe to release.
    update public.pin_generation_credit_reservations
       set status='released',updated_at=clock_timestamp()
     where user_id=new.user_id and idempotency_key=new.idempotency_key and status='reserved';
  end if;
  return new;
end; $$;

drop trigger if exists pin_generation_credit_reservation_sync on public.pin_generation_requests;
create trigger pin_generation_credit_reservation_sync
after update of status on public.pin_generation_requests
for each row execute function public.sync_pin_generation_credit_reservation();

-- All legacy generation debits also respect active reservations, so a separate
-- credit-spending path cannot consume budget already committed to provider work.
create or replace function public.save_generated_pins_and_charge(
  p_user_id text,p_board_id uuid,p_pins jsonb,p_amount integer
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $
declare
  v_balance integer;
  v_reserved bigint;
  v_total numeric;
  v_count integer;
  v_saved jsonb;
begin
  if p_user_id is null or p_board_id is null or p_amount is null or p_amount<=0
     or p_pins is null or jsonb_typeof(p_pins)<>'array' then
    raise exception 'invalid generation arguments';
  end if;
  v_count:=jsonb_array_length(p_pins);
  if v_count<1 or v_count>10 then raise exception 'invalid pin count'; end if;
  if not exists(select 1 from public.boards b join public.projects p on p.id=b.project_id
    where b.id=p_board_id and p.user_id::text=p_user_id) then
    raise exception 'board not found or not owned by user';
  end if;
  if exists(select 1 from jsonb_array_elements(p_pins) item
    where coalesce(item->>'image_url','')=''
       or coalesce(item->>'title','')=''
       or coalesce(item->>'model_used','')=''
       or coalesce(item->>'aspect_ratio','')=''
       or coalesce(item->>'credits_cost','') !~ '^[0-9]+
-- The underlying save_generated_pins_and_charge remains the single atomic debit
-- and pin insert; this wrapper adds a hard reservation ceiling in the same tx.
create or replace function public.complete_pin_generation_request(
  p_user_id text,p_board_id uuid,p_idempotency_key text,p_claim_token uuid,p_pins jsonb,p_amount integer
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $
declare
  v_request public.pin_generation_requests%rowtype;
  v_reservation public.pin_generation_credit_reservations%rowtype;
  v_saved jsonb;
  v_user_balance integer;
begin
  -- Keep lock order identical to reserve_pin_generation_credits: user first,
  -- then request/reservation. This avoids a retry-vs-settlement deadlock.
  select credits_balance into v_user_balance from public.users
   where id::text=p_user_id for update;
  if not found then raise exception 'generation user not found'; end if;
  select * into v_request from public.pin_generation_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if not found or v_request.board_id<>p_board_id then raise exception 'generation request not found'; end if;
  if v_request.status='completed' then return jsonb_build_object('pins',v_request.pins); end if;
  if v_request.status<>'processing' then raise exception 'generation request is not processing'; end if;
  if p_claim_token is null or v_request.claim_token is distinct from p_claim_token then
    raise exception 'generation claim token mismatch';
  end if;
  select * into v_reservation from public.pin_generation_credit_reservations
   where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if not found or v_reservation.status<>'reserved' then
    raise exception 'generation credit reservation is missing';
  end if;
  if p_amount is null or p_amount<=0 or p_amount>v_reservation.amount then
    raise exception 'generation charge exceeds reserved amount';
  end if;
  update public.pin_generation_credit_reservations set status='settling',updated_at=clock_timestamp()
   where id=v_reservation.id and status='reserved';
  v_saved:=public.save_generated_pins_and_charge(p_user_id,p_board_id,p_pins,p_amount);
  update public.pin_generation_requests set status='completed',pins=v_saved->'pins',
    error_code=null,claim_token=null,updated_at=clock_timestamp() where id=v_request.id;
  return v_saved;
end; $;

revoke all on function public.complete_pin_generation_request(text,uuid,text,uuid,jsonb,integer)
  from public,anon,authenticated;
grant execute on function public.complete_pin_generation_request(text,uuid,text,uuid,jsonb,integer)
  to service_role;

revoke all on function public.reserve_pin_generation_credits(text,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_pin_generation_credits(text,text,integer) to service_role;
revoke all on function public.sync_pin_generation_credit_reservation() from public,anon,authenticated;

       or (item->>'credits_cost')::numeric<=0) then
    raise exception 'invalid pin data';
  end if;
  select sum((item->>'credits_cost')::numeric) into v_total
    from jsonb_array_elements(p_pins) item;
  if v_total<>p_amount then raise exception 'pin costs do not match charge'; end if;

  -- Same user-row lock as reservation creation serializes reserve vs debit.
  select credits_balance into v_balance from public.users
   where id::text=p_user_id for update;
  if not found then raise exception 'generation user not found'; end if;
  select coalesce(sum(amount),0) into v_reserved
    from public.pin_generation_credit_reservations
   where user_id=p_user_id and status='reserved';
  if coalesce(v_balance,0)-v_reserved<p_amount then
    raise exception 'insufficient credits after active generation reservations';
  end if;
  update public.users set credits_balance=coalesce(credits_balance,0)-p_amount
   where id::text=p_user_id and coalesce(credits_balance,0)>=p_amount
   returning credits_balance into v_balance;
  if not found then raise exception 'insufficient credits'; end if;

  with inserted as (
    insert into public.pins(board_id,image_url,title,description,status,model_used,aspect_ratio,credits_cost)
    select p_board_id,item->>'image_url',item->>'title',coalesce(item->>'description',''),
      'pending',item->>'model_used',item->>'aspect_ratio',(item->>'credits_cost')::numeric
    from jsonb_array_elements(p_pins) item returning *
  )
  select coalesce(jsonb_agg(to_jsonb(inserted)),'[]'::jsonb) into v_saved from inserted;
  insert into public.credit_transactions(user_id,amount,type,description)
  values(p_user_id,-p_amount,'generation',format('Генерация %s пинов',v_count));
  return jsonb_build_object('balance',v_balance,'pins',v_saved);
end; $;

revoke all on function public.save_generated_pins_and_charge(text,uuid,jsonb,integer)
  from public,anon,authenticated;
grant execute on function public.save_generated_pins_and_charge(text,uuid,jsonb,integer)
  to service_role;

-- Refuse to settle a provider result above the amount reserved before submission.
-- The underlying save_generated_pins_and_charge remains the single atomic debit
-- and pin insert; this wrapper adds a hard reservation ceiling in the same tx.
create or replace function public.complete_pin_generation_request(
  p_user_id text,p_board_id uuid,p_idempotency_key text,p_claim_token uuid,p_pins jsonb,p_amount integer
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $
declare
  v_request public.pin_generation_requests%rowtype;
  v_reservation public.pin_generation_credit_reservations%rowtype;
  v_saved jsonb;
  v_user_balance integer;
begin
  -- Keep lock order identical to reserve_pin_generation_credits: user first,
  -- then request/reservation. This avoids a retry-vs-settlement deadlock.
  select credits_balance into v_user_balance from public.users
   where id::text=p_user_id for update;
  if not found then raise exception 'generation user not found'; end if;
  select * into v_request from public.pin_generation_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if not found or v_request.board_id<>p_board_id then raise exception 'generation request not found'; end if;
  if v_request.status='completed' then return jsonb_build_object('pins',v_request.pins); end if;
  if v_request.status<>'processing' then raise exception 'generation request is not processing'; end if;
  if p_claim_token is null or v_request.claim_token is distinct from p_claim_token then
    raise exception 'generation claim token mismatch';
  end if;
  select * into v_reservation from public.pin_generation_credit_reservations
   where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if not found or v_reservation.status<>'reserved' then
    raise exception 'generation credit reservation is missing';
  end if;
  if p_amount is null or p_amount<=0 or p_amount>v_reservation.amount then
    raise exception 'generation charge exceeds reserved amount';
  end if;
  v_saved:=public.save_generated_pins_and_charge(p_user_id,p_board_id,p_pins,p_amount);
  update public.pin_generation_requests set status='completed',pins=v_saved->'pins',
    error_code=null,claim_token=null,updated_at=clock_timestamp() where id=v_request.id;
  return v_saved;
end; $;

revoke all on function public.complete_pin_generation_request(text,uuid,text,uuid,jsonb,integer)
  from public,anon,authenticated;
grant execute on function public.complete_pin_generation_request(text,uuid,text,uuid,jsonb,integer)
  to service_role;

revoke all on function public.reserve_pin_generation_credits(text,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_pin_generation_credits(text,text,integer) to service_role;
revoke all on function public.sync_pin_generation_credit_reservation() from public,anon,authenticated;
