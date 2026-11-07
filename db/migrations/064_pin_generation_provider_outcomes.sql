-- 064_pin_generation_provider_outcomes.sql
-- Preserve terminal provider facts per image task, independently of user-credit settlement.
alter table public.pin_generation_tasks
  add column if not exists provider_outcome_status text
    check (provider_outcome_status is null or provider_outcome_status in ('succeeded','failed')),
  add column if not exists provider_refunded boolean,
  add column if not exists provider_error_code integer,
  add column if not exists provider_error_title text,
  add column if not exists provider_reconciled_at timestamptz;

create or replace function public.record_pin_generation_provider_outcome(
  p_user_id text,
  p_idempotency_key text,
  p_claim_token uuid,
  p_task_index integer,
  p_provider_task_id text,
  p_provider_status text,
  p_provider_price numeric default null,
  p_provider_refunded boolean default null,
  p_provider_error_code integer default null,
  p_provider_error_title text default null,
  p_provider_result_url text default null
) returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_request public.pin_generation_requests%rowtype;
  v_task public.pin_generation_tasks%rowtype;
  v_reconciled_at timestamptz;
begin
  if p_provider_status not in ('succeeded','failed')
     or p_task_index is null or p_task_index < 1 or p_task_index > 10
     or p_provider_task_id is null
     or p_provider_task_id !~ '^[A-Za-z0-9_-]{1,200}$'
     or (p_provider_price is not null and
       (p_provider_price < 0 or p_provider_price::text in ('NaN','Infinity','-Infinity')))
     or (p_provider_status='succeeded' and
       (p_provider_price is null or p_provider_refunded is not null
        or p_provider_result_url is null or length(trim(p_provider_result_url))=0))
     or (p_provider_status='failed' and p_provider_result_url is not null)
     or (p_provider_error_title is not null and length(p_provider_error_title)>120) then
    raise exception 'invalid generation provider outcome';
  end if;

  -- Preserve the same parent-request -> task lock order as migration 046.
  select * into v_request
    from public.pin_generation_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key
   for update;
  if not found or v_request.status<>'processing'
     or v_request.claim_token is distinct from p_claim_token then
    raise exception 'generation claim token mismatch';
  end if;

  select * into v_task
    from public.pin_generation_tasks
   where generation_request_id=v_request.id
     and user_id=p_user_id
     and task_index=p_task_index
   for update;
  if not found then raise exception 'generation task not found'; end if;
  if v_task.provider_task_id is not null
     and v_task.provider_task_id<>p_provider_task_id then
    raise exception 'provider task id mismatch for generation task';
  end if;

  if v_task.provider_outcome_status is not null then
    if v_task.provider_outcome_status is distinct from p_provider_status
       or v_task.provider_task_id is distinct from p_provider_task_id
       or v_task.provider_price is distinct from p_provider_price
       or v_task.provider_refunded is distinct from p_provider_refunded
       or v_task.provider_error_code is distinct from p_provider_error_code
       or v_task.provider_error_title is distinct from p_provider_error_title
       or (p_provider_status='succeeded' and
         v_task.provider_result_url is distinct from p_provider_result_url) then
      raise exception 'conflicting generation provider outcome replay';
    end if;
    return true;
  end if;

  if v_task.status in ('succeeded','failed') and v_task.status<>p_provider_status then
    raise exception 'generation provider outcome conflicts with task status';
  end if;

  -- Failed tasks without refund metadata are stored but remain unreconciled.
  if p_provider_status='succeeded' or p_provider_refunded is not null then
    v_reconciled_at := clock_timestamp();
  else
    v_reconciled_at := null;
  end if;

  update public.pin_generation_tasks
     set status=p_provider_status,
         provider_task_id=p_provider_task_id,
         provider_price=p_provider_price,
         provider_result_url=coalesce(p_provider_result_url,provider_result_url),
         provider_outcome_status=p_provider_status,
         provider_refunded=p_provider_refunded,
         provider_error_code=p_provider_error_code,
         provider_error_title=case when p_provider_error_title is null
           then null else left(p_provider_error_title,120) end,
         provider_reconciled_at=v_reconciled_at,
         error_code=case when p_provider_status='failed' then 'provider_task_failed' else null end,
         updated_at=clock_timestamp()
   where id=v_task.id;

  update public.pin_generation_requests
     set updated_at=clock_timestamp()
   where id=v_request.id;

  return true;
end;
$$;

-- Include the provider outcome fields in the durable recovery snapshot.
create or replace function public.get_pin_generation_plan(
  p_user_id text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'task_index',t.task_index,
    'title',t.title,
    'description',t.description,
    'prompt',t.prompt,
    'model',t.model,
    'aspect_ratio',t.aspect_ratio,
    'provider_idempotency_key',t.provider_idempotency_key,
    'provider_task_id',t.provider_task_id,
    'status',t.status,
    'provider_result_url',t.provider_result_url,
    'storage_url',t.storage_url,
    'provider_price',t.provider_price,
    'provider_outcome_status',t.provider_outcome_status,
    'provider_refunded',t.provider_refunded,
    'provider_error_code',t.provider_error_code,
    'provider_error_title',t.provider_error_title,
    'provider_reconciled_at',t.provider_reconciled_at
  ) order by t.task_index),'[]'::jsonb)
    into v_result
    from public.pin_generation_tasks t
    join public.pin_generation_requests r on r.id=t.generation_request_id
   where r.user_id=p_user_id and r.idempotency_key=p_idempotency_key;
  return v_result;
end;
$$;

revoke all on function public.record_pin_generation_provider_outcome(text,text,uuid,integer,text,text,numeric,boolean,integer,text,text)
  from public,anon,authenticated;
grant execute on function public.record_pin_generation_provider_outcome(text,text,uuid,integer,text,text,numeric,boolean,integer,text,text)
  to service_role;
revoke all on function public.get_pin_generation_plan(text,text) from public,anon,authenticated;
grant execute on function public.get_pin_generation_plan(text,text) to service_role;
