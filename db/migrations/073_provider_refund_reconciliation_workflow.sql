-- 073_provider_refund_reconciliation_workflow.sql
-- Allow trusted operators to resolve a previously unknown provider refund fact
-- without rewriting the immutable provider outcome or releasing a reservation
-- outside the existing terminal-state triggers.

create table if not exists public.provider_refund_reconciliation_audit (
  id bigserial primary key,
  request_kind text not null check (request_kind in ('generation','regeneration')),
  user_id text not null,
  idempotency_key text not null,
  task_index integer not null default 0 check (task_index >= 0),
  provider_task_id text not null,
  provider_refunded boolean not null,
  evidence_reference text not null check (length(trim(evidence_reference)) between 8 and 500),
  reconciled_at timestamptz not null default clock_timestamp(),
  unique(request_kind,user_id,idempotency_key,task_index)
);

alter table public.provider_refund_reconciliation_audit enable row level security;
revoke all on public.provider_refund_reconciliation_audit from public,anon,authenticated,service_role;
revoke all on sequence public.provider_refund_reconciliation_audit_id_seq from public,anon,authenticated,service_role;

create or replace function public.reconcile_pin_generation_provider_refund(
  p_user_id text,
  p_idempotency_key text,
  p_task_index integer,
  p_provider_task_id text,
  p_provider_refunded boolean,
  p_evidence_reference text
) returns timestamptz
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_request public.pin_generation_requests%rowtype;
  v_task public.pin_generation_tasks%rowtype;
  v_at timestamptz := clock_timestamp();
begin
  if p_user_id is null or p_idempotency_key is null or p_task_index is null
     or p_task_index < 1 or p_task_index > 10
     or p_provider_task_id is null
     or p_provider_task_id !~ '^[A-Za-z0-9_-]{1,200}$'
     or p_provider_refunded is null
     or p_evidence_reference is null
     or length(trim(p_evidence_reference)) < 8
     or length(p_evidence_reference) > 500 then
    raise exception 'invalid provider refund reconciliation';
  end if;

  select * into v_request
    from public.pin_generation_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key
   for update;
  if not found or v_request.status <> 'processing' then
    raise exception 'generation request is not awaiting reconciliation';
  end if;

  select * into v_task
    from public.pin_generation_tasks
   where generation_request_id=v_request.id
     and user_id=p_user_id
     and task_index=p_task_index
   for update;
  if not found
     or v_task.status is distinct from 'failed'
     or v_task.provider_outcome_status is distinct from 'failed'
     or v_task.provider_task_id is distinct from p_provider_task_id
     or v_task.provider_refunded is not null
     or v_task.provider_reconciled_at is not null then
    raise exception 'generation provider outcome is not eligible for reconciliation';
  end if;

  if not exists (
    select 1 from public.pin_generation_credit_reservations r
     where r.user_id=p_user_id and r.idempotency_key=p_idempotency_key
       and r.status='reserved'
  ) then
    raise exception 'generation credit reservation is not active';
  end if;

  update public.pin_generation_tasks
     set provider_refunded=p_provider_refunded,
         provider_reconciled_at=v_at,
         updated_at=v_at
   where id=v_task.id;

  insert into public.provider_refund_reconciliation_audit(
    request_kind,user_id,idempotency_key,task_index,provider_task_id,
    provider_refunded,evidence_reference,reconciled_at
  ) values (
    'generation',p_user_id,p_idempotency_key,p_task_index,p_provider_task_id,
    p_provider_refunded,trim(p_evidence_reference),v_at
  );

  return v_at;
end;
$$;

create or replace function public.reconcile_pin_regeneration_provider_refund(
  p_user_id text,
  p_idempotency_key text,
  p_provider_task_id text,
  p_provider_refunded boolean,
  p_evidence_reference text
) returns timestamptz
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_request public.pin_regeneration_requests%rowtype;
  v_at timestamptz := clock_timestamp();
begin
  if p_user_id is null or p_idempotency_key is null
     or p_provider_task_id is null
     or p_provider_task_id !~ '^[A-Za-z0-9_-]{1,200}$'
     or p_provider_refunded is null
     or p_evidence_reference is null
     or length(trim(p_evidence_reference)) < 8
     or length(p_evidence_reference) > 500 then
    raise exception 'invalid provider refund reconciliation';
  end if;

  select * into v_request
    from public.pin_regeneration_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key
   for update;
  if not found or v_request.status <> 'processing'
     or v_request.provider_status is distinct from 'failed'
     or v_request.provider_task_id is distinct from p_provider_task_id
     or v_request.provider_refunded is not null
     or v_request.provider_reconciled_at is not null then
    raise exception 'regeneration provider outcome is not eligible for reconciliation';
  end if;

  if not exists (
    select 1 from public.pin_generation_credit_reservations r
     where r.user_id=p_user_id and r.idempotency_key=p_idempotency_key
       and r.status='reserved'
  ) then
    raise exception 'regeneration credit reservation is not active';
  end if;

  update public.pin_regeneration_requests
     set provider_refunded=p_provider_refunded,
         provider_reconciled_at=v_at,
         updated_at=v_at
   where id=v_request.id;

  insert into public.provider_refund_reconciliation_audit(
    request_kind,user_id,idempotency_key,task_index,provider_task_id,
    provider_refunded,evidence_reference,reconciled_at
  ) values (
    'regeneration',p_user_id,p_idempotency_key,0,p_provider_task_id,
    p_provider_refunded,trim(p_evidence_reference),v_at
  );

  return v_at;
end;
$$;

revoke all on function public.reconcile_pin_generation_provider_refund(text,text,integer,text,boolean,text)
  from public,anon,authenticated;
revoke all on function public.reconcile_pin_regeneration_provider_refund(text,text,text,boolean,text)
  from public,anon,authenticated;
grant execute on function public.reconcile_pin_generation_provider_refund(text,text,integer,text,boolean,text)
  to service_role;
grant execute on function public.reconcile_pin_regeneration_provider_refund(text,text,text,boolean,text)
  to service_role;
