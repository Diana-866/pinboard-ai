-- 150_preserve_regeneration_claim_token_on_refund_finalization.sql
-- Keep the regeneration journal's required claim token when an operator-
-- reconciled provider failure is finalized. Unlike generation requests,
-- pin_regeneration_requests.claim_token is NOT NULL (migration 053).
-- The terminal status fences all processing-only mutations; clearing this
-- token is neither required nor permitted by the table contract.

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

revoke all on function public.finalize_reconciled_pin_regeneration_failure(text,text)
  from public,anon,authenticated;
grant execute on function public.finalize_reconciled_pin_regeneration_failure(text,text)
  to service_role;
