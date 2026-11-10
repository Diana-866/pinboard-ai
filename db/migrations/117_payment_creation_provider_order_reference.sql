-- 117_payment_creation_provider_order_reference.sql
-- Persist the local Prodamus order identity before making the remote request.
-- This lets operators reconcile an ambiguous provider outcome without exposing
-- the idempotency key or checkout URL.

alter table public.payment_creation_requests
  add column if not exists provider_order_id text;

create unique index if not exists payment_creation_requests_provider_order_id_uidx
  on public.payment_creation_requests(provider_order_id)
  where provider_order_id is not null;

create or replace function public.attach_payment_creation_order(
  p_user_id text,
  p_idempotency_key text,
  p_order_id text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.payment_creation_requests%rowtype;
begin
  if p_order_id is null or length(trim(p_order_id)) < 8 or length(p_order_id) > 128 then
    raise exception 'invalid provider order id';
  end if;

  select * into v_request
    from public.payment_creation_requests
   where user_id = p_user_id and idempotency_key = p_idempotency_key
   for update;

  if not found then
    raise exception 'payment creation request not found';
  end if;

  if v_request.status <> 'creating' then
    raise exception 'payment creation request is not active';
  end if;

  if v_request.provider_order_id is not null
     and v_request.provider_order_id <> p_order_id then
    raise exception 'conflicting provider order id';
  end if;

  update public.payment_creation_requests
     set provider_order_id = p_order_id,
         updated_at = now()
   where id = v_request.id;

  return true;
end;
$$;

revoke all on function public.attach_payment_creation_order(text,text,text)
  from public, anon, authenticated;
grant execute on function public.attach_payment_creation_order(text,text,text)
  to service_role;


-- Completion is accepted only for the exact order identity durably attached
-- before the provider request. This prevents a checkout result from drifting
-- away from the operator's reconciliation reference.
create or replace function public.complete_payment_creation_request(
  p_user_id text,
  p_idempotency_key text,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.payment_creation_requests%rowtype;
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object'
     or coalesce(p_result->>'payment_url', '') = ''
     or coalesce(p_result->>'order_id', '') = '' then
    raise exception 'invalid completed payment result';
  end if;

  select * into v_request
    from public.payment_creation_requests
   where user_id = p_user_id and idempotency_key = p_idempotency_key
   for update;

  if not found then
    raise exception 'payment creation request not found';
  end if;

  if v_request.status = 'ready' then
    if v_request.result <> p_result then
      raise exception 'conflicting completed payment result';
    end if;
    return v_request.result;
  end if;

  if v_request.status <> 'creating' then
    raise exception 'payment creation request is not active';
  end if;

  if v_request.provider_order_id is null
     or v_request.provider_order_id <> p_result->>'order_id' then
    raise exception 'completed payment order does not match attached provider order id';
  end if;

  update public.payment_creation_requests
     set status = 'ready', result = p_result, error_code = null, updated_at = now()
   where id = v_request.id;

  return p_result;
end;
$$;

revoke all on function public.complete_payment_creation_request(text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_payment_creation_request(text,text,jsonb)
  to service_role;
