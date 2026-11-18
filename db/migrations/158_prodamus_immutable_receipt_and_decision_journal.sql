-- 158_prodamus_immutable_receipt_and_decision_journal.sql
-- Persist verified provider facts independently from entitlement processing.
-- The backend must verify Prodamus HMAC before invoking record_prodamus_payment_receipt.

begin;

create table if not exists public.payment_provider_receipts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'prodamus' check (provider = 'prodamus'),
  payment_kind text not null check (payment_kind in ('subscription', 'credits')),
  provider_order_id text,
  provider_status text not null check (
    provider_status in ('success', 'canceled', 'denied', 'unrecognized')
  ),
  received_amount numeric(12,2),
  received_currency text check (
    received_currency is null or received_currency in ('rub', 'usd', 'eur', 'kzt')
  ),
  event_hash text not null check (event_hash ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null default clock_timestamp(),
  constraint payment_provider_receipts_order_length
    check (provider_order_id is null or length(provider_order_id) between 1 and 200),
  constraint payment_provider_receipts_amount_positive
    check (received_amount is null or received_amount > 0),
  constraint payment_provider_receipts_event_unique unique (provider, event_hash)
);

create index if not exists payment_provider_receipts_order_received_idx
  on public.payment_provider_receipts(provider_order_id, received_at desc);

create table if not exists public.payment_entitlement_decisions (
  receipt_id uuid primary key
    references public.payment_provider_receipts(id) on delete restrict,
  local_payment_kind text check (
    local_payment_kind is null or local_payment_kind in ('subscription', 'credits')
  ),
  local_payment_id uuid,
  user_id text,
  decision text not null check (
    decision in (
      'pending_review',
      'granted',
      'withheld_account_lifecycle',
      'rejected_mismatch',
      'unmatched',
      'ignored_non_success'
    )
  ),
  safe_reason_code text check (
    safe_reason_code is null or safe_reason_code ~ '^[a-z0-9_]{1,80}$'
  ),
  decided_at timestamptz not null default clock_timestamp()
);

create index if not exists payment_entitlement_decisions_state_idx
  on public.payment_entitlement_decisions(decision, decided_at);

alter table public.payment_provider_receipts enable row level security;
alter table public.payment_entitlement_decisions enable row level security;

revoke all on public.payment_provider_receipts
  from public, anon, authenticated, service_role;
revoke all on public.payment_entitlement_decisions
  from public, anon, authenticated, service_role;

create or replace function public.reject_payment_receipt_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'payment provider receipts are immutable';
end;
$$;

drop trigger if exists payment_provider_receipts_immutable
  on public.payment_provider_receipts;
create trigger payment_provider_receipts_immutable
  before update or delete on public.payment_provider_receipts
  for each row execute function public.reject_payment_receipt_mutation();

create or replace function public.record_prodamus_payment_receipt(
  p_payment_kind text,
  p_provider_order_id text,
  p_provider_status text,
  p_received_amount numeric,
  p_received_currency text,
  p_event_hash text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if p_payment_kind not in ('subscription', 'credits') then
    raise exception 'invalid payment kind';
  end if;
  if p_provider_order_id is not null
     and (length(p_provider_order_id) < 1 or length(p_provider_order_id) > 200) then
    raise exception 'invalid provider order id';
  end if;
  if p_provider_status not in ('success', 'canceled', 'denied', 'unrecognized') then
    raise exception 'invalid provider status';
  end if;
  if p_received_amount is not null
     and (p_received_amount <= 0 or p_received_amount > 9999999999.99) then
    raise exception 'invalid provider amount';
  end if;
  if p_received_currency is not null
     and p_received_currency not in ('rub', 'usd', 'eur', 'kzt') then
    raise exception 'invalid provider currency';
  end if;
  if p_event_hash is null or p_event_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid provider event hash';
  end if;

  insert into public.payment_provider_receipts(
    payment_kind, provider_order_id, provider_status,
    received_amount, received_currency, event_hash
  ) values (
    p_payment_kind, p_provider_order_id, p_provider_status,
    p_received_amount, p_received_currency, p_event_hash
  )
  on conflict (provider, event_hash) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
      from public.payment_provider_receipts
     where provider = 'prodamus' and event_hash = p_event_hash;
  end if;
  if v_id is null then
    raise exception 'provider receipt persistence failed';
  end if;

  insert into public.payment_entitlement_decisions(receipt_id, decision)
  values (v_id, 'pending_review')
  on conflict (receipt_id) do nothing;

  return v_id;
end;
$$;

create or replace function public.set_prodamus_payment_decision(
  p_receipt_id uuid,
  p_decision text,
  p_safe_reason_code text default null,
  p_local_payment_kind text default null,
  p_local_payment_id uuid default null,
  p_user_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.payment_entitlement_decisions%rowtype;
begin
  if p_decision not in (
    'pending_review', 'granted', 'withheld_account_lifecycle',
    'rejected_mismatch', 'unmatched', 'ignored_non_success'
  ) then
    raise exception 'invalid entitlement decision';
  end if;
  if p_safe_reason_code is not null
     and p_safe_reason_code !~ '^[a-z0-9_]{1,80}$' then
    raise exception 'invalid decision reason';
  end if;
  if p_local_payment_kind is not null
     and p_local_payment_kind not in ('subscription', 'credits') then
    raise exception 'invalid local payment kind';
  end if;
  if p_local_payment_id is not null and p_local_payment_kind is null then
    raise exception 'local payment kind is required with local payment id';
  end if;
  if p_user_id is not null and length(p_user_id) > 200 then
    raise exception 'invalid decision user id';
  end if;

  select * into v_existing
    from public.payment_entitlement_decisions
   where receipt_id = p_receipt_id
   for update;
  if not found then
    raise exception 'provider receipt decision not found';
  end if;

  if v_existing.decision not in ('pending_review', 'unmatched') then
    if v_existing.decision = p_decision then
      return true;
    end if;
    raise exception 'terminal entitlement decision cannot be overwritten';
  end if;

  update public.payment_entitlement_decisions
     set decision = p_decision,
         safe_reason_code = p_safe_reason_code,
         local_payment_kind = coalesce(p_local_payment_kind, local_payment_kind),
         local_payment_id = coalesce(p_local_payment_id, local_payment_id),
         user_id = coalesce(p_user_id, user_id),
         decided_at = clock_timestamp()
   where receipt_id = p_receipt_id;

  return true;
end;
$$;

revoke all on function public.reject_payment_receipt_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.record_prodamus_payment_receipt(text, text, text, numeric, text, text)
  from public, anon, authenticated;
revoke all on function public.set_prodamus_payment_decision(uuid, text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_prodamus_payment_receipt(text, text, text, numeric, text, text)
  to service_role;
grant execute on function public.set_prodamus_payment_decision(uuid, text, text, text, uuid, text)
  to service_role;

commit;
