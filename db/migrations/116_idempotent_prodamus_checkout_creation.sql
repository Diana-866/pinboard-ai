-- 116_idempotent_prodamus_checkout_creation.sql
-- One durable idempotency record protects both subscription and credit checkouts.
-- Ambiguous provider outcomes are fenced: retries never create a second invoice.

create table if not exists public.payment_creation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  idempotency_key varchar(128) not null,
  request_kind text not null check (request_kind in ('subscription', 'credits')),
  request_fingerprint char(64) not null,
  status text not null check (status in ('creating', 'ready', 'unknown', 'failed')),
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (
    (status = 'ready' and result is not null)
    or (status <> 'ready')
  )
);

create index if not exists payment_creation_requests_user_created_idx
  on public.payment_creation_requests(user_id, created_at desc);

alter table public.payment_creation_requests enable row level security;
revoke all on public.payment_creation_requests from public, anon, authenticated;
grant select, insert, update, delete on public.payment_creation_requests to service_role;

create or replace function public.begin_payment_creation_request(
  p_user_id text,
  p_idempotency_key text,
  p_request_kind text,
  p_request_fingerprint text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.payment_creation_requests%rowtype;
  v_inserted integer;
begin
  if p_user_id is null or length(p_user_id) = 0
     or p_request_kind is null
     or p_request_fingerprint is null
     or p_idempotency_key is null
     or length(p_idempotency_key) < 16
     or length(p_idempotency_key) > 128
     or p_idempotency_key !~ '^[A-Za-z0-9_-]+$'
     or p_request_kind not in ('subscription', 'credits')
     or p_request_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid payment idempotency request';
  end if;

  insert into public.payment_creation_requests(
    user_id, idempotency_key, request_kind, request_fingerprint, status
  ) values (
    p_user_id, p_idempotency_key, p_request_kind, p_request_fingerprint, 'creating'
  )
  on conflict (user_id, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_request
    from public.payment_creation_requests
   where user_id = p_user_id and idempotency_key = p_idempotency_key
   for update;

  if v_request.request_kind <> p_request_kind
     or v_request.request_fingerprint <> p_request_fingerprint then
    raise exception 'idempotency key reused with different payment request';
  end if;

  if v_inserted = 1 then
    return jsonb_build_object('status', 'started');
  end if;

  if v_request.status = 'ready' then
    return jsonb_build_object('status', 'ready', 'result', v_request.result);
  end if;

  -- A process can terminate after reserving the key but before recording the
  -- provider outcome. Never reopen that key: after the provider's 20s timeout
  -- window has elapsed, fence it as unknown instead of creating another invoice.
  if v_request.status = 'creating'
     and v_request.updated_at < now() - interval '2 minutes' then
    update public.payment_creation_requests
       set status = 'unknown',
           error_code = 'creation_lease_expired',
           updated_at = now()
     where id = v_request.id;
    return jsonb_build_object('status', 'unknown');
  end if;

  return jsonb_build_object('status', v_request.status);
end;
$$;

create or replace function public.complete_payment_creation_request(
  p_user_id text,
  p_idempotency_key text,
  p_result jsonb
) returns jsonb
language plpgsql security definer
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

  if v_request.status = 'ready' then
    if v_request.result <> p_result then
      raise exception 'conflicting completed payment result';
    end if;
    return v_request.result;
  end if;
  if v_request.status <> 'creating' then
    raise exception 'payment creation request is not active';
  end if;

  update public.payment_creation_requests
     set status = 'ready', result = p_result, error_code = null, updated_at = now()
   where id = v_request.id;
  return p_result;
end;
$$;

create or replace function public.mark_payment_creation_unknown(
  p_user_id text, p_idempotency_key text, p_error_code text
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  update public.payment_creation_requests
     set status = 'unknown',
         error_code = left(coalesce(p_error_code, 'provider_outcome_unknown'), 64),
         updated_at = now()
   where user_id = p_user_id and idempotency_key = p_idempotency_key
     and status = 'creating';
  return found;
end;
$$;

create or replace function public.fail_payment_creation_request(
  p_user_id text, p_idempotency_key text, p_error_code text
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  update public.payment_creation_requests
     set status = 'failed',
         error_code = left(coalesce(p_error_code, 'payment_creation_failed'), 64),
         updated_at = now()
   where user_id = p_user_id and idempotency_key = p_idempotency_key
     and status = 'creating';
  return found;
end;
$$;

revoke all on function public.begin_payment_creation_request(text,text,text,text) from public, anon, authenticated;
revoke all on function public.complete_payment_creation_request(text,text,jsonb) from public, anon, authenticated;
revoke all on function public.mark_payment_creation_unknown(text,text,text) from public, anon, authenticated;
revoke all on function public.fail_payment_creation_request(text,text,text) from public, anon, authenticated;
grant execute on function public.begin_payment_creation_request(text,text,text,text) to service_role;
grant execute on function public.complete_payment_creation_request(text,text,jsonb) to service_role;
grant execute on function public.mark_payment_creation_unknown(text,text,text) to service_role;
grant execute on function public.fail_payment_creation_request(text,text,text) to service_role;
