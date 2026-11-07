-- 054_pin_generation_credit_reservations.sql
-- Reserve generation budget atomically before calling a billable image provider.
create table if not exists public.pin_generation_credit_reservations (
  id bigserial primary key,
  user_id text not null,
  idempotency_key varchar(128) not null,
  amount integer not null check (amount > 0),
  status text not null default 'reserved'
    check (status in ('reserved','settled','released')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(user_id,idempotency_key),
  foreign key (user_id,idempotency_key)
    references public.pin_generation_requests(user_id,idempotency_key) on delete cascade
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
     where user_id=new.user_id and idempotency_key=new.idempotency_key and status='reserved';
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

revoke all on function public.reserve_pin_generation_credits(text,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_pin_generation_credits(text,text,integer) to service_role;
revoke all on function public.sync_pin_generation_credit_reservation() from public,anon,authenticated;
