-- 053_pin_regeneration_journal.sql
-- Durable, fenced idempotency for the legacy single-pin regeneration endpoint.
create table if not exists public.pin_regeneration_requests (
  id bigserial primary key,
  user_id text not null,
  pin_id uuid not null references public.pins(id) on delete cascade,
  idempotency_key varchar(128) not null,
  request_fingerprint text not null check (length(request_fingerprint)=64),
  provider_idempotency_key varchar(128) not null default gen_random_uuid()::text,
  claim_token uuid not null default gen_random_uuid(),
  status text not null default 'processing'
    check (status in ('processing','completed','unknown','failed')),
  model text not null,
  prompt text not null,
  amount integer not null check (amount > 0),
  provider_task_id text,
  provider_result_url text,
  storage_url text,
  provider_price numeric,
  result_pin jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,idempotency_key),
  unique(provider_idempotency_key),
  check (provider_price is null or (provider_price >= 0 and provider_price::text not in ('NaN','Infinity','-Infinity')))
);
create index if not exists pin_regeneration_requests_pin_idx
  on public.pin_regeneration_requests(pin_id,created_at desc);
alter table public.pin_regeneration_requests enable row level security;
revoke all on public.pin_regeneration_requests from public,anon,authenticated;
grant select,insert,update,delete on public.pin_regeneration_requests to service_role;
grant usage,select on sequence public.pin_regeneration_requests_id_seq to service_role;

create or replace function public.begin_pin_regeneration_request(
  p_user_id text,p_pin_id uuid,p_idempotency_key text,p_fingerprint text,
  p_model text,p_prompt text,p_amount integer
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_req public.pin_regeneration_requests%rowtype; v_inserted integer;
begin
  if p_user_id is null or p_pin_id is null or p_idempotency_key is null
     or length(p_idempotency_key)<16 or length(p_idempotency_key)>128
     or p_fingerprint is null or length(p_fingerprint)<>64
     or p_model is null or p_prompt is null or length(p_prompt)>16000
     or p_amount is null or p_amount<=0 then raise exception 'invalid regeneration request'; end if;
  if not exists(select 1 from public.pins pin join public.boards b on b.id=pin.board_id
    join public.projects p on p.id=b.project_id where pin.id=p_pin_id and p.user_id::text=p_user_id)
    then raise exception 'pin not found or not owned by user'; end if;
  insert into public.pin_regeneration_requests(user_id,pin_id,idempotency_key,request_fingerprint,model,prompt,amount)
  values(p_user_id,p_pin_id,p_idempotency_key,p_fingerprint,p_model,p_prompt,p_amount)
  on conflict(user_id,idempotency_key) do nothing;
  get diagnostics v_inserted=row_count;
  select * into v_req from public.pin_regeneration_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if v_req.pin_id<>p_pin_id or v_req.request_fingerprint<>p_fingerprint then
    raise exception 'idempotency key reused with different regeneration request';
  end if;
  if v_inserted=1 then
    return jsonb_build_object('status','started','claim_token',v_req.claim_token,
      'provider_idempotency_key',v_req.provider_idempotency_key);
  end if;
  if v_req.status='completed' then
    return jsonb_build_object('status','completed','pin',v_req.result_pin);
  end if;
  -- A recorded provider task can be safely polled immediately on retry.
  -- Rotate the claim so only the latest poller can persist/complete the result.
  if v_req.status='processing' and v_req.provider_task_id is not null then
    update public.pin_regeneration_requests set claim_token=gen_random_uuid(),
      updated_at=clock_timestamp() where id=v_req.id returning * into v_req;
    return jsonb_build_object('status','resume','claim_token',v_req.claim_token,
      'provider_idempotency_key',v_req.provider_idempotency_key,
      'provider_task_id',v_req.provider_task_id,'provider_result_url',v_req.provider_result_url,
      'storage_url',v_req.storage_url,'provider_price',v_req.provider_price);
  end if;
  if v_req.status='processing' and v_req.updated_at>clock_timestamp()-interval '30 minutes' then
    return jsonb_build_object('status','processing');
  end if;
  if v_req.status='processing' then
    update public.pin_regeneration_requests set claim_token=gen_random_uuid(),
      updated_at=clock_timestamp() where id=v_req.id returning * into v_req;
    return jsonb_build_object('status','resume','claim_token',v_req.claim_token,
      'provider_idempotency_key',v_req.provider_idempotency_key,
      'provider_task_id',v_req.provider_task_id,'provider_result_url',v_req.provider_result_url,
      'storage_url',v_req.storage_url,'provider_price',v_req.provider_price);
  end if;
  if v_req.status='unknown' then
    update public.pin_regeneration_requests set status='processing',claim_token=gen_random_uuid(),
      error_code=null,updated_at=clock_timestamp() where id=v_req.id returning * into v_req;
    return jsonb_build_object('status','resume','claim_token',v_req.claim_token,
      'provider_idempotency_key',v_req.provider_idempotency_key,
      'provider_task_id',v_req.provider_task_id,'provider_result_url',v_req.provider_result_url,
      'storage_url',v_req.storage_url,'provider_price',v_req.provider_price);
  end if;
  return jsonb_build_object('status',v_req.status);
end; $$;

create or replace function public.update_pin_regeneration_request(
  p_user_id text,p_idempotency_key text,p_claim_token uuid,p_status text,
  p_provider_task_id text default null,p_provider_result_url text default null,
  p_storage_url text default null,p_provider_price numeric default null,p_error_code text default null
) returns boolean language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_req public.pin_regeneration_requests%rowtype;
begin
  if p_status not in ('processing','unknown','failed') then raise exception 'invalid regeneration status'; end if;
  if p_provider_task_id is not null and p_provider_task_id !~ '^[A-Za-z0-9_-]{1,200}$' then raise exception 'invalid provider task id'; end if;
  if p_provider_price is not null and (p_provider_price<0 or p_provider_price::text in ('NaN','Infinity','-Infinity')) then raise exception 'invalid provider price'; end if;
  select * into v_req from public.pin_regeneration_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if not found or v_req.status<>'processing' or v_req.claim_token is distinct from p_claim_token then
    raise exception 'regeneration claim mismatch';
  end if;
  if v_req.provider_task_id is not null and p_provider_task_id is not null
     and v_req.provider_task_id<>p_provider_task_id then raise exception 'provider task id mismatch'; end if;
  update public.pin_regeneration_requests set status=p_status,
    provider_task_id=coalesce(p_provider_task_id,provider_task_id),
    provider_result_url=coalesce(p_provider_result_url,provider_result_url),
    storage_url=coalesce(p_storage_url,storage_url),provider_price=coalesce(p_provider_price,provider_price),
    error_code=case when p_error_code is null then error_code else left(p_error_code,64) end,
    updated_at=clock_timestamp()
   where id=v_req.id;
  return true;
end; $$;

create or replace function public.complete_pin_regeneration_request(
  p_user_id text,p_idempotency_key text,p_claim_token uuid,p_storage_url text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_req public.pin_regeneration_requests%rowtype; v_balance integer; v_pin jsonb;
begin
  select * into v_req from public.pin_regeneration_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if not found then raise exception 'regeneration request not found'; end if;
  if v_req.status='completed' then return jsonb_build_object('pin',v_req.result_pin); end if;
  if v_req.status<>'processing' or v_req.claim_token is distinct from p_claim_token then
    raise exception 'regeneration claim mismatch';
  end if;
  if p_storage_url is null or length(trim(p_storage_url))=0 then raise exception 'permanent image URL required'; end if;
  update public.users set credits_balance=coalesce(credits_balance,0)-v_req.amount
   where id::text=p_user_id and coalesce(credits_balance,0)>=v_req.amount
   returning credits_balance into v_balance;
  if not found then raise exception 'insufficient credits'; end if;
  update public.pins set image_url=p_storage_url,credits_cost=v_req.amount
   where id=v_req.pin_id;
  if not found then raise exception 'pin not found or not owned by user'; end if;
  insert into public.credit_transactions(user_id,amount,type,description)
   values(p_user_id,-v_req.amount,'regeneration','Перегенерация пина');
  select to_jsonb(pin) into v_pin from public.pins pin where pin.id=v_req.pin_id;
  update public.pin_regeneration_requests set status='completed',storage_url=p_storage_url,
    result_pin=v_pin,error_code=null,updated_at=clock_timestamp()
   where id=v_req.id;
  return jsonb_build_object('pin',v_pin,'balance',v_balance);
end; $$;

revoke all on function public.begin_pin_regeneration_request(text,uuid,text,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.update_pin_regeneration_request(text,text,uuid,text,text,text,text,numeric,text) from public,anon,authenticated;
revoke all on function public.complete_pin_regeneration_request(text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.begin_pin_regeneration_request(text,uuid,text,text,text,text,integer) to service_role;
grant execute on function public.update_pin_regeneration_request(text,text,uuid,text,text,text,text,numeric,text) to service_role;
grant execute on function public.complete_pin_regeneration_request(text,text,uuid,text) to service_role;
