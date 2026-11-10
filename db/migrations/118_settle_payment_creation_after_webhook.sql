-- 118_settle_payment_creation_after_webhook.sql
-- Close an ambiguous checkout only after the matching local payment has been
-- atomically fulfilled by its existing subscription/credit RPC.

alter table public.payment_creation_requests
  drop constraint if exists payment_creation_requests_status_check;

alter table public.payment_creation_requests
  add constraint payment_creation_requests_status_check
  check (status in ('creating', 'ready', 'unknown', 'failed', 'settled'));

create or replace function public.settle_payment_creation_request(
  p_order_id text,
  p_request_kind text,
  p_local_payment_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.payment_creation_requests%rowtype;
  v_local_user_id text;
  v_local_order_id text;
  v_local_status text;
  v_local_period_start timestamptz;
  v_local_period_end timestamptz;
  v_balance_credited_at timestamptz;
begin
  if p_order_id is null or length(trim(p_order_id)) < 8
     or length(p_order_id) > 128
     or p_request_kind is null
     or p_request_kind not in ('subscription', 'credits')
     or p_local_payment_id is null then
    raise exception 'invalid settled payment identity';
  end if;

  select * into v_request
    from public.payment_creation_requests
   where provider_order_id = p_order_id
   for update;

  -- Old payments predate durable checkout idempotency and have no request row.
  if not found then
    return false;
  end if;

  if v_request.request_kind <> p_request_kind then
    raise exception 'payment creation kind does not match fulfilled order';
  end if;

  if p_request_kind = 'subscription' then
    select user_id::text, provider_payment_id, status, period_start, period_end
      into v_local_user_id, v_local_order_id, v_local_status,
           v_local_period_start, v_local_period_end
      from public.subscriptions
     where id = p_local_payment_id;
  else
    select user_id::text, provider_payment_id, status, balance_credited_at
      into v_local_user_id, v_local_order_id, v_local_status, v_balance_credited_at
      from public.credit_purchases
     where id = p_local_payment_id;
  end if;

  if not found
     or v_local_user_id is distinct from v_request.user_id
     or v_local_order_id is distinct from p_order_id
     or v_local_status is distinct from 'success'
     or (p_request_kind = 'subscription'
         and (v_local_period_start is null or v_local_period_end is null
              or v_local_period_end <= v_local_period_start))
     or (p_request_kind = 'credits' and v_balance_credited_at is null) then
    raise exception 'local payment is not exactly fulfilled for checkout request';
  end if;

  if v_request.status = 'settled' then
    return true;
  end if;

  if v_request.status = 'failed' then
    raise exception 'failed checkout request cannot be settled';
  end if;

  update public.payment_creation_requests
     set status = 'settled',
         result = null,
         error_code = null,
         updated_at = now()
   where id = v_request.id;

  return true;
end;
$$;

revoke all on function public.settle_payment_creation_request(text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.settle_payment_creation_request(text,text,uuid)
  to service_role;


-- A webhook can win the race against the checkout HTTP response. In that case
-- the checkout result is not persisted (the request is already settled), but
-- the original caller may still receive its just-created response.
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

  if not found then raise exception 'payment creation request not found'; end if;

  if v_request.status = 'settled' then
    if v_request.provider_order_id is distinct from p_result->>'order_id' then
      raise exception 'settled checkout result does not match provider order id';
    end if;
    return p_result;
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
