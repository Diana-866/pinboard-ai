-- 067_pin_generation_exact_provider_quotes.sql
-- Persist GPTunnel's pre-submission quote against the immutable task payload.
-- Quotes are a reservation ceiling, not a substitute for the final provider price.

alter table public.pin_generation_tasks
  add column if not exists provider_quote_price numeric,
  add column if not exists provider_quote_currency text,
  add column if not exists provider_quote_model text,
  add column if not exists provider_quote_aspect_ratio text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'pin_generation_tasks_provider_quote_valid'
       and conrelid = 'public.pin_generation_tasks'::regclass
  ) then
    alter table public.pin_generation_tasks
      add constraint pin_generation_tasks_provider_quote_valid
      check (
        num_nonnulls(provider_quote_price, provider_quote_currency,
          provider_quote_model, provider_quote_aspect_ratio) = 0
        or
        (num_nonnulls(provider_quote_price, provider_quote_currency,
            provider_quote_model, provider_quote_aspect_ratio) = 4
          and provider_quote_price > 0
          and provider_quote_price::text not in ('NaN','Infinity','-Infinity')
          and provider_quote_currency = 'RUB'
          and provider_quote_model = model
          and provider_quote_aspect_ratio = aspect_ratio)
      );
  end if;
end;
$$;

create or replace function public.record_pin_generation_task_quote(
  p_user_id text,
  p_idempotency_key text,
  p_claim_token uuid,
  p_task_index integer,
  p_quote_price numeric,
  p_quote_currency text,
  p_quote_model text,
  p_quote_aspect_ratio text
) returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_request public.pin_generation_requests%rowtype;
  v_task public.pin_generation_tasks%rowtype;
begin
  if p_user_id is null or p_idempotency_key is null or p_claim_token is null
     or p_task_index is null or p_task_index < 1 or p_task_index > 10
     or p_quote_price is null or p_quote_price <= 0
     or p_quote_price::text in ('NaN','Infinity','-Infinity')
     or p_quote_currency is distinct from 'RUB'
     or p_quote_model is null or length(p_quote_model) > 100
     or p_quote_aspect_ratio is null
     or p_quote_aspect_ratio not in ('2:3','9:16','4:5','3:4','1:1') then
    raise exception 'invalid generation task quote';
  end if;

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
     and user_id=p_user_id and task_index=p_task_index
   for update;
  if not found then raise exception 'generation task not found'; end if;
  if p_quote_model is distinct from v_task.model
     or p_quote_aspect_ratio is distinct from v_task.aspect_ratio then
    raise exception 'generation task quote payload mismatch';
  end if;

  if v_task.provider_quote_price is not null then
    if v_task.provider_quote_price is distinct from p_quote_price
       or v_task.provider_quote_currency is distinct from p_quote_currency
       or v_task.provider_quote_model is distinct from p_quote_model
       or v_task.provider_quote_aspect_ratio is distinct from p_quote_aspect_ratio then
      raise exception 'conflicting generation task quote replay';
    end if;
    return true;
  end if;

  update public.pin_generation_tasks
     set provider_quote_price=p_quote_price,
         provider_quote_currency=p_quote_currency,
         provider_quote_model=p_quote_model,
         provider_quote_aspect_ratio=p_quote_aspect_ratio,
         updated_at=clock_timestamp()
   where id=v_task.id;

  update public.pin_generation_requests
     set updated_at=clock_timestamp()
   where id=v_request.id and status='processing';

  return true;
end;
$$;

-- Include immutable quote data in every recovery snapshot.
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
    'provider_reconciled_at',t.provider_reconciled_at,
    'provider_quote_price',t.provider_quote_price,
    'provider_quote_currency',t.provider_quote_currency,
    'provider_quote_model',t.provider_quote_model,
    'provider_quote_aspect_ratio',t.provider_quote_aspect_ratio
  ) order by t.task_index),'[]'::jsonb)
    into v_result
    from public.pin_generation_tasks t
    join public.pin_generation_requests r on r.id=t.generation_request_id
   where r.user_id=p_user_id and r.idempotency_key=p_idempotency_key;
  return v_result;
end;
$$;

revoke all on function public.record_pin_generation_task_quote(text,text,uuid,integer,numeric,text,text,text)
  from public,anon,authenticated;
grant execute on function public.record_pin_generation_task_quote(text,text,uuid,integer,numeric,text,text,text)
  to service_role;
revoke all on function public.get_pin_generation_plan(text,text)
  from public,anon,authenticated;
grant execute on function public.get_pin_generation_plan(text,text)
  to service_role;
