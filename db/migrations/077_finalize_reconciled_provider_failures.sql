-- 077_finalize_reconciled_provider_failures.sql
-- Complete the operator-assisted refund reconciliation workflow atomically.
-- The existing status triggers release reservations only after a verified
-- terminal provider failure has been reconciled.

create or replace function public.finalize_reconciled_pin_generation_failure(
  p_user_id text,
  p_idempotency_key text
) returns timestamptz
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_request public.pin_generation_requests%rowtype;
  v_reservation public.pin_generation_credit_reservations%rowtype;
  v_task_count integer;
  v_reconciled_at timestamptz;
begin
  if p_user_id is null or p_idempotency_key is null then
    raise exception 'invalid generation reconciliation finalization';
  end if;

  -- Match the global credit lock order: user -> request -> tasks -> reservation.
  perform 1 from public.users where id::text=p_user_id for update;
  if not found then raise exception 'generation user not found'; end if;

  select * into v_request
    from public.pin_generation_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key
   for update;
  if not found then raise exception 'generation request not found'; end if;

  if v_request.status='failed' then
    if v_request.error_code is distinct from 'provider_refund_reconciled' then
      raise exception 'generation request was not finalized by refund reconciliation';
    end if;
    select max(reconciled_at) into v_reconciled_at
      from public.provider_refund_reconciliation_audit
     where request_kind='generation' and user_id=p_user_id
       and idempotency_key=p_idempotency_key;
    return v_reconciled_at;
  end if;
  if v_request.status<>'processing' then
    raise exception 'generation request is not awaiting reconciliation';
  end if;

  perform 1 from public.pin_generation_tasks
   where generation_request_id=v_request.id and user_id=p_user_id
   order by task_index for update;

  select count(*) into v_task_count
    from public.pin_generation_tasks
   where generation_request_id=v_request.id and user_id=p_user_id;
  if v_task_count=0 or exists (
    select 1 from public.pin_generation_tasks t
     where t.generation_request_id=v_request.id
       and t.user_id=p_user_id
       and (t.status is distinct from 'failed'
         or t.provider_outcome_status is distinct from 'failed'
         or t.provider_task_id is null
         or t.provider_refunded is null
         or t.provider_reconciled_at is null)
  ) then
    raise exception 'all generation tasks must be failed and refund-reconciled';
  end if;

  select * into v_reservation
    from public.pin_generation_credit_reservations
   where user_id=p_user_id and idempotency_key=p_idempotency_key
   for update;
  if not found or v_reservation.status<>'reserved' then
    raise exception 'generation credit reservation is not active';
  end if;

  select coalesce(
           max(a.reconciled_at),
           max(t.provider_reconciled_at)
         ) into v_reconciled_at
    from public.pin_generation_tasks t
    left join public.provider_refund_reconciliation_audit a
      on a.request_kind='generation'
     and a.user_id=p_user_id
     and a.idempotency_key=p_idempotency_key
     and a.task_index=t.task_index
     and a.provider_task_id=t.provider_task_id
     and a.provider_refunded=t.provider_refunded
   where t.generation_request_id=v_request.id and t.user_id=p_user_id;

  update public.pin_generation_requests
     set status='failed',
         error_code='provider_refund_reconciled',
         claim_token=null,
         updated_at=clock_timestamp()
   where id=v_request.id;

  return v_reconciled_at;
end;
$$;

create or replace function public.finalize_reconciled_pin_regeneration_failure(
  p_user_id text,
  p_idempotency_key text
) returns timestamptz
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_request public.pin_regeneration_requests%rowtype;
  v_reservation public.pin_generation_credit_reservations%rowtype;
  v_reconciled_at timestamptz;
begin
  if p_user_id is null or p_idempotency_key is null then
    raise exception 'invalid regeneration reconciliation finalization';
  end if;

  -- Match the global credit lock order: user -> request -> reservation.
  perform 1 from public.users where id::text=p_user_id for update;
  if not found then raise exception 'regeneration user not found'; end if;

  select * into v_request
    from public.pin_regeneration_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key
   for update;
  if not found then raise exception 'regeneration request not found'; end if;

  if v_request.status='failed' then
    if v_request.error_code is distinct from 'provider_refund_reconciled' then
      raise exception 'regeneration request was not finalized by refund reconciliation';
    end if;
    select max(reconciled_at) into v_reconciled_at
      from public.provider_refund_reconciliation_audit
     where request_kind='regeneration' and user_id=p_user_id
       and idempotency_key=p_idempotency_key;
    return v_reconciled_at;
  end if;
  if v_request.status<>'processing'
     or v_request.provider_status is distinct from 'failed'
     or v_request.provider_task_id is null
     or v_request.provider_refunded is null
     or v_request.provider_reconciled_at is null then
    raise exception 'regeneration provider failure is not reconciled';
  end if;

  select reconciled_at into v_reconciled_at
    from public.provider_refund_reconciliation_audit
   where request_kind='regeneration'
     and user_id=p_user_id
     and idempotency_key=p_idempotency_key
     and task_index=0
     and provider_task_id=v_request.provider_task_id
     and provider_refunded=v_request.provider_refunded;
  if not found then
    -- A provider-supplied refund fact is already authoritative; the audit row
    -- is required only when an operator had to enrich a previously unknown fact.
    v_reconciled_at := v_request.provider_reconciled_at;
  end if;

  select * into v_reservation
    from public.pin_generation_credit_reservations
   where user_id=p_user_id and idempotency_key=p_idempotency_key
   for update;
  if not found or v_reservation.status<>'reserved' then
    raise exception 'regeneration credit reservation is not active';
  end if;

  update public.pin_regeneration_requests
     set status='failed',
         error_code='provider_refund_reconciled',
         updated_at=clock_timestamp()
   where id=v_request.id;

  return v_reconciled_at;
end;
$$;

revoke all on function public.finalize_reconciled_pin_generation_failure(text,text)
  from public,anon,authenticated;
revoke all on function public.finalize_reconciled_pin_regeneration_failure(text,text)
  from public,anon,authenticated;
grant execute on function public.finalize_reconciled_pin_generation_failure(text,text)
  to service_role;
grant execute on function public.finalize_reconciled_pin_regeneration_failure(text,text)
  to service_role;
