-- 148_pin_generation_task_result_immutability.sql
-- A provider success is a durable billable fact. Generic task updates may add
-- the Storage URL, but must never replace the provider result or its price.
-- Once a Storage URL is journaled, it is immutable as well.

create or replace function public.update_pin_generation_task(
  p_user_id text,
  p_idempotency_key text,
  p_claim_token uuid,
  p_task_index integer,
  p_status text,
  p_provider_task_id text default null,
  p_provider_result_url text default null,
  p_storage_url text default null,
  p_provider_price numeric default null,
  p_error_code text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.pin_generation_requests%rowtype;
  v_task public.pin_generation_tasks%rowtype;
  v_allowed boolean;
begin
  if p_claim_token is null then
    raise exception 'generation claim token is required';
  end if;
  if p_status not in ('submitting','queued','running','succeeded','failed','unknown') then
    raise exception 'invalid generation task status';
  end if;
  if p_provider_task_id is not null
     and p_provider_task_id !~ '^[A-Za-z0-9_-]{1,200}$' then
    raise exception 'invalid provider task id';
  end if;
  if p_provider_price is not null and (
    p_provider_price < 0
    or p_provider_price::text in ('NaN','Infinity','-Infinity')
  ) then
    raise exception 'invalid provider price';
  end if;

  -- Preserve the established parent-request -> task lock order and fence
  -- stale workers before inspecting or changing immutable task facts.
  select * into v_request
    from public.pin_generation_requests
   where user_id = p_user_id
     and idempotency_key = p_idempotency_key
   for update;
  if not found then
    raise exception 'generation request not found';
  end if;
  if v_request.status <> 'processing' then
    raise exception 'generation request is not processing';
  end if;
  if v_request.claim_token is distinct from p_claim_token then
    raise exception 'generation claim token mismatch';
  end if;

  select * into v_task
    from public.pin_generation_tasks
   where generation_request_id = v_request.id
     and user_id = p_user_id
     and task_index = p_task_index
   for update;
  if not found then
    raise exception 'generation task not found';
  end if;

  if v_task.provider_task_id is not null
     and p_provider_task_id is not null
     and v_task.provider_task_id <> p_provider_task_id then
    raise exception 'provider task id mismatch for generation task';
  end if;
  if v_task.provider_result_url is not null
     and p_provider_result_url is not null
     and v_task.provider_result_url <> p_provider_result_url then
    raise exception 'provider result URL is immutable for generation task';
  end if;
  if v_task.provider_price is not null
     and p_provider_price is not null
     and v_task.provider_price is distinct from p_provider_price then
    raise exception 'provider price is immutable for generation task';
  end if;
  if v_task.storage_url is not null
     and p_storage_url is not null
     and v_task.storage_url <> p_storage_url then
    raise exception 'Storage URL is immutable for generation task';
  end if;

  v_allowed :=
    (v_task.status = 'prepared' and p_status in ('submitting','failed','unknown'))
    or (v_task.status = 'submitting' and p_status in ('queued','running','succeeded','failed','unknown'))
    or (v_task.status = 'queued' and p_status in ('running','succeeded','failed','unknown'))
    or (v_task.status = 'running' and p_status in ('succeeded','failed','unknown'))
    or (v_task.status = 'unknown' and p_status in ('queued','running','succeeded','failed','unknown'));

  if not v_allowed and not (
    v_task.status = p_status
    and (p_provider_task_id is null or v_task.provider_task_id = p_provider_task_id)
  ) then
    raise exception 'invalid generation task transition: % -> %', v_task.status, p_status;
  end if;

  update public.pin_generation_tasks
     set status = p_status,
         provider_task_id = coalesce(p_provider_task_id, provider_task_id),
         provider_result_url = coalesce(p_provider_result_url, provider_result_url),
         storage_url = coalesce(p_storage_url, storage_url),
         provider_price = coalesce(p_provider_price, provider_price),
         error_code = case
           when p_error_code is null then error_code
           else left(p_error_code, 64)
         end,
         updated_at = clock_timestamp()
   where id = v_task.id;

  update public.pin_generation_requests
     set updated_at = clock_timestamp()
   where id = v_request.id;

  return true;
end;
$$;

revoke all on function public.update_pin_generation_task(
  text,text,uuid,integer,text,text,text,text,numeric,text
) from public, anon, authenticated;
grant execute on function public.update_pin_generation_task(
  text,text,uuid,integer,text,text,text,text,numeric,text
) to service_role;
