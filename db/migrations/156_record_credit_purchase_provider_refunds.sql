-- 156_record_credit_purchase_provider_refunds.sql
-- Record a refund only after an administrator has verified it with the provider.
begin;

alter table public.credit_purchases
  add column if not exists provider_refunded_at timestamptz,
  add column if not exists provider_refund_evidence_type text,
  add column if not exists provider_refund_evidence_reference text,
  add column if not exists provider_refund_recorded_by text;

create table if not exists public.credit_purchase_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.credit_purchases(id) on delete restrict,
  operator_user_id text not null,
  action_key uuid not null,
  action text not null check (action in ('provider_refund_confirmed')),
  evidence_type text not null check (evidence_type in ('provider_dashboard','provider_support','payment_statement','manual_review')),
  evidence_reference text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (purchase_id, action_key)
);

create or replace function public.admin_record_credit_purchase_refund(
  p_operator_user_id uuid,
  p_purchase_id uuid,
  p_action_id uuid,
  p_evidence_type text,
  p_evidence_reference text
) returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_purchase public.credit_purchases%rowtype;
  v_existing public.credit_purchase_reconciliation_events%rowtype;
  v_recorded_at timestamptz;
begin
  if p_operator_user_id is null or p_purchase_id is null or p_action_id is null
     or p_evidence_type not in ('provider_dashboard','provider_support','payment_statement','manual_review')
     or p_evidence_reference is null
     or length(p_evidence_reference) < 8 or length(p_evidence_reference) > 500
     or p_evidence_reference !~ '^[A-Za-z0-9][A-Za-z0-9._/#:-]{7,499}$' then
    raise exception 'invalid credit purchase refund reconciliation evidence';
  end if;

  perform 1 from public.users
   where id=p_operator_user_id and is_admin=true
   for update;
  if not found then raise exception 'administrator privileges required'; end if;

  select * into v_purchase from public.credit_purchases
   where id=p_purchase_id for update;
  if not found then raise exception 'credit purchase not found'; end if;

  select * into v_existing from public.credit_purchase_reconciliation_events
   where purchase_id=p_purchase_id and action_key=p_action_id;
  if found then
    if v_existing.action <> 'provider_refund_confirmed'
       or v_existing.evidence_type <> p_evidence_type
       or v_existing.evidence_reference <> p_evidence_reference then
      raise exception 'action id replay payload mismatch';
    end if;
    return v_existing.recorded_at;
  end if;

  if v_purchase.status <> 'paid_uncredited'
     or v_purchase.balance_credited_at is not null
     or v_purchase.provider_refunded_at is not null then
    raise exception 'credit purchase is not awaiting refund reconciliation';
  end if;

  v_recorded_at := clock_timestamp();
  update public.credit_purchases
     set provider_refunded_at=v_recorded_at,
         provider_refund_evidence_type=p_evidence_type,
         provider_refund_evidence_reference=p_evidence_reference,
         provider_refund_recorded_by=p_operator_user_id::text
   where id=p_purchase_id;

  insert into public.credit_purchase_reconciliation_events(
    purchase_id,operator_user_id,action_key,action,evidence_type,evidence_reference,recorded_at
  ) values (
    p_purchase_id,p_operator_user_id::text,p_action_id,'provider_refund_confirmed',
    p_evidence_type,p_evidence_reference,v_recorded_at
  );
  return v_recorded_at;
end;
$function$;

revoke all on function public.admin_record_credit_purchase_refund(uuid,uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_record_credit_purchase_refund(uuid,uuid,uuid,text,text)
  to service_role;

revoke all on public.credit_purchase_reconciliation_events from public,anon,authenticated,service_role;
grant select,insert on public.credit_purchase_reconciliation_events to service_role;

commit;
