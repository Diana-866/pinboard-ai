-- 157_record_subscription_provider_refunds.sql
-- A paid subscription that could not grant an entitlement must be refunded
-- before account erasure can remove the associated operational account data.
begin;

alter table public.subscriptions
  add column if not exists provider_refunded_at timestamptz,
  add column if not exists provider_refund_evidence_type text,
  add column if not exists provider_refund_evidence_reference text,
  add column if not exists provider_refund_recorded_by text;

create table if not exists public.subscription_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  operator_user_id text not null,
  action_key uuid not null,
  action text not null check (action in ('provider_refund_confirmed')),
  evidence_type text not null check (evidence_type in ('provider_dashboard','provider_support','payment_statement','manual_review')),
  evidence_reference text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (subscription_id, action_key)
);

create or replace function public.admin_record_subscription_provider_refund(
  p_operator_user_id uuid,
  p_subscription_id uuid,
  p_action_id uuid,
  p_evidence_type text,
  p_evidence_reference text
) returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_owner_id text;
  v_sub public.subscriptions%rowtype;
  v_existing public.subscription_reconciliation_events%rowtype;
  v_recorded_at timestamptz;
  v_is_admin boolean;
begin
  if p_operator_user_id is null or p_subscription_id is null or p_action_id is null
     or p_evidence_type not in ('provider_dashboard','provider_support','payment_statement','manual_review')
     or p_evidence_reference is null
     or length(p_evidence_reference) < 8 or length(p_evidence_reference) > 500
     or p_evidence_reference !~ '^[A-Za-z0-9][A-Za-z0-9._/#:-]{7,499}$' then
    raise exception 'invalid subscription refund reconciliation evidence';
  end if;

  perform 1 from public.users
   where id=p_operator_user_id and is_admin=true
   for update;
  if not found then raise exception 'administrator privileges required'; end if;

  -- Lock the account owner before the dependent subscription row.
  select user_id into v_owner_id
    from public.subscriptions where id=p_subscription_id;
  if not found then raise exception 'subscription not found'; end if;

  perform 1 from public.users where id::text=v_owner_id for update;
  if not found then raise exception 'subscription user not found'; end if;

  select * into v_sub from public.subscriptions
   where id=p_subscription_id for update;
  if not found or v_sub.user_id is distinct from v_owner_id then
    raise exception 'subscription owner changed';
  end if;

  select * into v_existing from public.subscription_reconciliation_events
   where subscription_id=p_subscription_id and action_key=p_action_id;
  if found then
    if v_existing.action <> 'provider_refund_confirmed'
       or v_existing.evidence_type <> p_evidence_type
       or v_existing.evidence_reference <> p_evidence_reference then
      raise exception 'action id replay payload mismatch';
    end if;
    return v_existing.recorded_at;
  end if;

  if v_sub.status <> 'paid_unactivated'
     or v_sub.provider_paid_at is null
     or v_sub.provider_refunded_at is not null then
    raise exception 'subscription is not awaiting refund reconciliation';
  end if;

  v_recorded_at := clock_timestamp();
  update public.subscriptions
     set provider_refunded_at=v_recorded_at,
         provider_refund_evidence_type=p_evidence_type,
         provider_refund_evidence_reference=p_evidence_reference,
         provider_refund_recorded_by=p_operator_user_id::text
   where id=p_subscription_id;

  insert into public.subscription_reconciliation_events(
    subscription_id,operator_user_id,action_key,action,evidence_type,evidence_reference,recorded_at
  ) values (
    p_subscription_id,p_operator_user_id::text,p_action_id,'provider_refund_confirmed',
    p_evidence_type,p_evidence_reference,v_recorded_at
  );
  -- If a deletion job exhausted its retry budget while waiting for this
  -- provider refund, reopen only its financial erasure/finalization stages.
  -- The account owner lock above serializes this with worker stage execution.
  with reopened as (
    update public.account_deletion_jobs j
       set status='retry_wait',
           attempts=0,
           claim_token=null,
           lease_expires_at=null,
           next_attempt_at=clock_timestamp(),
           safe_error_code=null,
           started_at=null,
           finished_at=null,
           updated_at=clock_timestamp()
      from public.account_deletion_requests r
      join public.users u on u.id=r.user_id
     where j.request_id=r.id
       and r.user_id::text=v_owner_id
       and r.state='pending'
       and u.account_status='deletion_pending'
       and j.step_key in ('erase_content','finalize')
       and j.status in ('pending','retry_wait','blocked')
    returning j.request_id,j.id
  )
  insert into public.account_deletion_events(request_id,event_key,actor_class,reason_code)
  select request_id,
         'provider_refund_requeued_'||id::text||'_'||p_action_id::text,
         'operator',
         'provider_refund_confirmed'
    from reopened
  on conflict(request_id,event_key) do nothing;

  return v_recorded_at;
end;
$function$;

revoke all on function public.admin_record_subscription_provider_refund(uuid,uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_record_subscription_provider_refund(uuid,uuid,uuid,text,text)
  to service_role;

revoke all on public.subscription_reconciliation_events from public,anon,authenticated,service_role;
grant select,insert on public.subscription_reconciliation_events to service_role;

commit;
