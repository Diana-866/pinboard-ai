-- 078_provider_refund_operator_action_journal.sql
-- Bind privileged refund reconciliation/finalization to an immutable operator action.
-- All successful financial state changes and their operator journal rows commit atomically.

create table if not exists public.provider_refund_operator_actions (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null unique,
  request_kind text not null check (request_kind in ('generation','regeneration')),
  target_request_id uuid not null,
  operator_user_id uuid not null references public.users(id),
  action_kind text not null check (action_kind in ('refund_fact_reconciled','failure_finalized')),
  task_index integer not null default 0 check (task_index >= 0),
  provider_refunded boolean,
  evidence_reference text,
  before_status text not null,
  after_status text not null,
  occurred_at timestamptz not null default clock_timestamp(),
  check (
    (action_kind = 'refund_fact_reconciled'
      and evidence_reference is not null
      and length(trim(evidence_reference)) between 8 and 500
      and provider_refunded is not null)
    or
    (action_kind = 'failure_finalized'
      and evidence_reference is null
      and provider_refunded is null)
  )
);

create index if not exists idx_provider_refund_operator_actions_target
  on public.provider_refund_operator_actions(request_kind,target_request_id,occurred_at desc);
create index if not exists idx_provider_refund_operator_actions_operator
  on public.provider_refund_operator_actions(operator_user_id,occurred_at desc);

alter table public.provider_refund_operator_actions enable row level security;
revoke all on public.provider_refund_operator_actions from public,anon,authenticated,service_role;

create or replace function public.reject_provider_refund_operator_action_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  raise exception 'provider refund operator actions are append-only';
end;
$$;

drop trigger if exists provider_refund_operator_actions_immutable
  on public.provider_refund_operator_actions;
create trigger provider_refund_operator_actions_immutable
  before update or delete on public.provider_refund_operator_actions
  for each row execute function public.reject_provider_refund_operator_action_mutation();

-- Reconciliation wrapper: request/task/provider identifiers are derived from locked rows.
create or replace function public.admin_reconcile_pin_generation_refund(
  p_operator_user_id uuid,
  p_request_id uuid,
  p_task_index integer,
  p_provider_refunded boolean,
  p_evidence_reference text,
  p_action_id uuid
) returns table(action_id uuid,reconciled_at timestamptz,request_status text)
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_user_id text;
  v_request public.pin_generation_requests%rowtype;
  v_task public.pin_generation_tasks%rowtype;
  v_existing public.provider_refund_operator_actions%rowtype;
  v_at timestamptz;
begin
  if p_operator_user_id is null or p_request_id is null or p_task_index is null
     or p_task_index < 1 or p_task_index > 10 or p_provider_refunded is null
     or p_action_id is null or p_evidence_reference is null
     or length(trim(p_evidence_reference)) < 8 or length(p_evidence_reference) > 500 then
    raise exception 'invalid operator refund reconciliation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_action_id::text,0));

  select * into v_existing from public.provider_refund_operator_actions a
   where a.action_id=p_action_id;
  if found then
    if v_existing.request_kind <> 'generation'
       or v_existing.target_request_id <> p_request_id
       or v_existing.operator_user_id <> p_operator_user_id
       or v_existing.action_kind <> 'refund_fact_reconciled'
       or v_existing.task_index <> p_task_index
       or v_existing.provider_refunded <> p_provider_refunded
       or v_existing.evidence_reference <> trim(p_evidence_reference) then
      raise exception 'action_id was already used with different parameters';
    end if;
    return query select v_existing.action_id,v_existing.occurred_at,v_existing.after_status;
    return;
  end if;

  select r.user_id into v_user_id from public.pin_generation_requests r
   where r.id=p_request_id;
  if not found then raise exception 'generation request not found'; end if;

  -- Match the established financial lock order: target user -> request -> task -> reservation.
  perform 1 from public.users u where u.id::text=v_user_id for update;
  if not found then raise exception 'generation user not found'; end if;

  select * into v_request from public.pin_generation_requests r
   where r.id=p_request_id and r.user_id=v_user_id for update;
  if not found or v_request.status <> 'processing' then
    raise exception 'generation request is not awaiting reconciliation';
  end if;

  select * into v_task from public.pin_generation_tasks t
   where t.generation_request_id=v_request.id
     and t.user_id=v_user_id and t.task_index=p_task_index
   for update;
  if not found then raise exception 'generation task not found'; end if;

  select u.is_admin into v_task.updated_at
    from public.users u where u.id=p_operator_user_id;
  if not found or coalesce((select u.is_admin from public.users u where u.id=p_operator_user_id),false) is not true then
    raise exception 'operator is not an administrator';
  end if;

  v_at := public.reconcile_pin_generation_provider_refund(
    v_user_id,v_request.idempotency_key,p_task_index,v_task.provider_task_id,
    p_provider_refunded,trim(p_evidence_reference)
  );

  insert into public.provider_refund_operator_actions(
    action_id,request_kind,target_request_id,operator_user_id,action_kind,
    task_index,provider_refunded,evidence_reference,before_status,after_status,occurred_at
  ) values (
    p_action_id,'generation',p_request_id,p_operator_user_id,'refund_fact_reconciled',
    p_task_index,p_provider_refunded,trim(p_evidence_reference),v_request.status,v_request.status,v_at
  );

  return query select p_action_id,v_at,v_request.status;
end;
$$;

create or replace function public.admin_reconcile_pin_regeneration_refund(
  p_operator_user_id uuid,
  p_request_id uuid,
  p_provider_refunded boolean,
  p_evidence_reference text,
  p_action_id uuid
) returns table(action_id uuid,reconciled_at timestamptz,request_status text)
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_user_id text;
  v_request public.pin_regeneration_requests%rowtype;
  v_existing public.provider_refund_operator_actions%rowtype;
  v_at timestamptz;
begin
  if p_operator_user_id is null or p_request_id is null or p_provider_refunded is null
     or p_action_id is null or p_evidence_reference is null
     or length(trim(p_evidence_reference)) < 8 or length(p_evidence_reference) > 500 then
    raise exception 'invalid operator refund reconciliation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_action_id::text,0));
  select * into v_existing from public.provider_refund_operator_actions a where a.action_id=p_action_id;
  if found then
    if v_existing.request_kind <> 'regeneration'
       or v_existing.target_request_id <> p_request_id
       or v_existing.operator_user_id <> p_operator_user_id
       or v_existing.action_kind <> 'refund_fact_reconciled'
       or v_existing.task_index <> 0
       or v_existing.provider_refunded <> p_provider_refunded
       or v_existing.evidence_reference <> trim(p_evidence_reference) then
      raise exception 'action_id was already used with different parameters';
    end if;
    return query select v_existing.action_id,v_existing.occurred_at,v_existing.after_status;
    return;
  end if;

  select r.user_id into v_user_id from public.pin_regeneration_requests r where r.id=p_request_id;
  if not found then raise exception 'regeneration request not found'; end if;
  perform 1 from public.users u where u.id::text=v_user_id for update;
  if not found then raise exception 'regeneration user not found'; end if;

  select * into v_request from public.pin_regeneration_requests r
   where r.id=p_request_id and r.user_id=v_user_id for update;
  if not found or v_request.status <> 'processing' then
    raise exception 'regeneration request is not awaiting reconciliation';
  end if;

  if not exists (select 1 from public.users u where u.id=p_operator_user_id and u.is_admin is true) then
    raise exception 'operator is not an administrator';
  end if;

  v_at := public.reconcile_pin_regeneration_provider_refund(
    v_user_id,v_request.idempotency_key,v_request.provider_task_id,
    p_provider_refunded,trim(p_evidence_reference)
  );

  insert into public.provider_refund_operator_actions(
    action_id,request_kind,target_request_id,operator_user_id,action_kind,
    task_index,provider_refunded,evidence_reference,before_status,after_status,occurred_at
  ) values (
    p_action_id,'regeneration',p_request_id,p_operator_user_id,'refund_fact_reconciled',
    0,p_provider_refunded,trim(p_evidence_reference),v_request.status,v_request.status,v_at
  );

  return query select p_action_id,v_at,v_request.status;
end;
$$;

-- Finalization wrappers. The underlying finalizers perform all eligibility checks
-- and reservation release through the existing request-status triggers.
create or replace function public.admin_finalize_pin_generation_refund_failure(
  p_operator_user_id uuid,
  p_request_id uuid,
  p_action_id uuid
) returns table(action_id uuid,finalized_at timestamptz,request_status text)
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_user_id text;
  v_request public.pin_generation_requests%rowtype;
  v_existing public.provider_refund_operator_actions%rowtype;
  v_at timestamptz;
begin
  if p_operator_user_id is null or p_request_id is null or p_action_id is null then
    raise exception 'invalid operator finalization';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_action_id::text,0));
  select * into v_existing from public.provider_refund_operator_actions a where a.action_id=p_action_id;
  if found then
    if v_existing.request_kind <> 'generation'
       or v_existing.target_request_id <> p_request_id
       or v_existing.operator_user_id <> p_operator_user_id
       or v_existing.action_kind <> 'failure_finalized' then
      raise exception 'action_id was already used with different parameters';
    end if;
    return query select v_existing.action_id,v_existing.occurred_at,v_existing.after_status;
    return;
  end if;

  select r.user_id into v_user_id from public.pin_generation_requests r where r.id=p_request_id;
  if not found then raise exception 'generation request not found'; end if;
  perform 1 from public.users u where u.id::text=v_user_id for update;
  if not found then raise exception 'generation user not found'; end if;
  select * into v_request from public.pin_generation_requests r
   where r.id=p_request_id and r.user_id=v_user_id for update;
  if not found then raise exception 'generation request not found'; end if;
  if not exists (select 1 from public.users u where u.id=p_operator_user_id and u.is_admin is true) then
    raise exception 'operator is not an administrator';
  end if;

  v_at := public.finalize_reconciled_pin_generation_failure(v_user_id,v_request.idempotency_key);
  insert into public.provider_refund_operator_actions(
    action_id,request_kind,target_request_id,operator_user_id,action_kind,
    before_status,after_status,occurred_at
  ) values (p_action_id,'generation',p_request_id,p_operator_user_id,'failure_finalized',
            v_request.status,'failed',coalesce(v_at,clock_timestamp()));
  return query select p_action_id,coalesce(v_at,clock_timestamp()),'failed'::text;
end;
$$;

create or replace function public.admin_finalize_pin_regeneration_refund_failure(
  p_operator_user_id uuid,
  p_request_id uuid,
  p_action_id uuid
) returns table(action_id uuid,finalized_at timestamptz,request_status text)
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_user_id text;
  v_request public.pin_regeneration_requests%rowtype;
  v_existing public.provider_refund_operator_actions%rowtype;
  v_at timestamptz;
begin
  if p_operator_user_id is null or p_request_id is null or p_action_id is null then
    raise exception 'invalid operator finalization';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_action_id::text,0));
  select * into v_existing from public.provider_refund_operator_actions a where a.action_id=p_action_id;
  if found then
    if v_existing.request_kind <> 'regeneration'
       or v_existing.target_request_id <> p_request_id
       or v_existing.operator_user_id <> p_operator_user_id
       or v_existing.action_kind <> 'failure_finalized' then
      raise exception 'action_id was already used with different parameters';
    end if;
    return query select v_existing.action_id,v_existing.occurred_at,v_existing.after_status;
    return;
  end if;

  select r.user_id into v_user_id from public.pin_regeneration_requests r where r.id=p_request_id;
  if not found then raise exception 'regeneration request not found'; end if;
  perform 1 from public.users u where u.id::text=v_user_id for update;
  if not found then raise exception 'regeneration user not found'; end if;
  select * into v_request from public.pin_regeneration_requests r
   where r.id=p_request_id and r.user_id=v_user_id for update;
  if not found then raise exception 'regeneration request not found'; end if;
  if not exists (select 1 from public.users u where u.id=p_operator_user_id and u.is_admin is true) then
    raise exception 'operator is not an administrator';
  end if;

  v_at := public.finalize_reconciled_pin_regeneration_failure(v_user_id,v_request.idempotency_key);
  insert into public.provider_refund_operator_actions(
    action_id,request_kind,target_request_id,operator_user_id,action_kind,
    before_status,after_status,occurred_at
  ) values (p_action_id,'regeneration',p_request_id,p_operator_user_id,'failure_finalized',
            v_request.status,'failed',coalesce(v_at,clock_timestamp()));
  return query select p_action_id,coalesce(v_at,clock_timestamp()),'failed'::text;
end;
$$;

revoke all on function public.reject_provider_refund_operator_action_mutation() from public,anon,authenticated,service_role;
revoke all on function public.admin_reconcile_pin_generation_refund(uuid,uuid,integer,boolean,text,uuid) from public,anon,authenticated;
revoke all on function public.admin_reconcile_pin_regeneration_refund(uuid,uuid,boolean,text,uuid) from public,anon,authenticated;
revoke all on function public.admin_finalize_pin_generation_refund_failure(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_finalize_pin_regeneration_refund_failure(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_reconcile_pin_generation_refund(uuid,uuid,integer,boolean,text,uuid) to service_role;
grant execute on function public.admin_reconcile_pin_regeneration_refund(uuid,uuid,boolean,text,uuid) to service_role;
grant execute on function public.admin_finalize_pin_generation_refund_failure(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_finalize_pin_regeneration_refund_failure(uuid,uuid,uuid) to service_role;
