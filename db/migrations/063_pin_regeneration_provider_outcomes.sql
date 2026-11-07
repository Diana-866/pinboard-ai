-- 063_pin_regeneration_provider_outcomes.sql
-- Preserve GPTunnel terminal facts independently from user-credit settlement.
alter table public.pin_regeneration_requests
  add column if not exists provider_status text
    check (provider_status is null or provider_status in ('done','failed')),
  add column if not exists provider_refunded boolean,
  add column if not exists provider_error_code integer,
  add column if not exists provider_error_title text,
  add column if not exists provider_reconciled_at timestamptz;

create or replace function public.record_pin_regeneration_provider_outcome(
  p_user_id text,
  p_idempotency_key text,
  p_claim_token uuid,
  p_provider_task_id text,
  p_provider_status text,
  p_provider_price numeric default null,
  p_provider_refunded boolean default null,
  p_provider_error_code integer default null,
  p_provider_error_title text default null
) returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_req public.pin_regeneration_requests%rowtype;
  v_reconciled_at timestamptz;
begin
  if p_provider_status not in ('done','failed')
     or p_provider_task_id is null
     or p_provider_task_id !~ '^[A-Za-z0-9_-]{1,200}$'
     or (p_provider_price is not null and
       (p_provider_price < 0 or p_provider_price::text in ('NaN','Infinity','-Infinity')))
     or (p_provider_status='done' and (p_provider_price is null or p_provider_refunded is not null))
     or (p_provider_status='failed' and p_provider_error_title is not null
       and length(p_provider_error_title)>120) then
    raise exception 'invalid provider outcome';
  end if;

  select * into v_req
    from public.pin_regeneration_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key
   for update;

  if not found or v_req.status<>'processing'
     or v_req.claim_token is distinct from p_claim_token then
    raise exception 'regeneration claim mismatch';
  end if;

  if v_req.provider_task_id is not null
     and v_req.provider_task_id<>p_provider_task_id then
    raise exception 'provider task id mismatch';
  end if;

  if v_req.provider_status is not null then
    if v_req.provider_status is distinct from p_provider_status
       or v_req.provider_task_id is distinct from p_provider_task_id
       or v_req.provider_price is distinct from p_provider_price
       or v_req.provider_refunded is distinct from p_provider_refunded
       or v_req.provider_error_code is distinct from p_provider_error_code
       or v_req.provider_error_title is distinct from p_provider_error_title then
      raise exception 'conflicting provider outcome replay';
    end if;
    return true;
  end if;

  -- A failed task with missing refund metadata is recorded, but remains
  -- unreconciled. Never infer a refund from an absent provider field.
  if p_provider_status='done' or p_provider_refunded is not null then
    v_reconciled_at := clock_timestamp();
  else
    v_reconciled_at := null;
  end if;

  update public.pin_regeneration_requests
     set provider_task_id=p_provider_task_id,
         provider_status=p_provider_status,
         provider_price=p_provider_price,
         provider_refunded=p_provider_refunded,
         provider_error_code=p_provider_error_code,
         provider_error_title=case when p_provider_error_title is null
           then null else left(p_provider_error_title,120) end,
         provider_reconciled_at=v_reconciled_at,
         updated_at=clock_timestamp()
   where id=v_req.id;

  return true;
end;
$$;

revoke all on function public.record_pin_regeneration_provider_outcome(text,text,uuid,text,text,numeric,boolean,integer,text)
  from public,anon,authenticated;
grant execute on function public.record_pin_regeneration_provider_outcome(text,text,uuid,text,text,numeric,boolean,integer,text)
  to service_role;
