-- 045_pin_generation_task_journal.sql
-- Persist the exact per-image request and provider idempotency key before any
-- billable task is submitted. This journal is the basis for safe reconciliation.
create table if not exists public.pin_generation_tasks (
  id bigserial primary key,
  generation_request_id bigint not null
    references public.pin_generation_requests(id) on delete cascade,
  user_id text not null,
  board_id uuid not null references public.boards(id) on delete cascade,
  task_index smallint not null check (task_index between 1 and 10),
  title text not null,
  description text not null default '',
  prompt text not null,
  model text not null,
  aspect_ratio text not null
    check (aspect_ratio in ('2:3','9:16','4:5','3:4','1:1')),
  provider_idempotency_key varchar(128) not null default gen_random_uuid()::text,
  provider_task_id text,
  status text not null default 'prepared'
    check (status in ('prepared','submitting','queued','running','succeeded','failed','unknown')),
  provider_result_url text,
  storage_url text,
  provider_price numeric,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (generation_request_id, task_index),
  unique (provider_idempotency_key),
  check (provider_price is null or provider_price >= 0)
);

create unique index if not exists pin_generation_tasks_provider_id_idx
  on public.pin_generation_tasks(provider_task_id)
  where provider_task_id is not null;
create index if not exists pin_generation_tasks_request_status_idx
  on public.pin_generation_tasks(generation_request_id, status, task_index);

alter table public.pin_generation_tasks enable row level security;
revoke all on public.pin_generation_tasks from public, anon, authenticated;
grant select, insert, update, delete on public.pin_generation_tasks to service_role;
grant usage, select on sequence public.pin_generation_tasks_id_seq to service_role;

create or replace function public.save_pin_generation_plan(
  p_user_id text, p_idempotency_key text, p_tasks jsonb
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.pin_generation_requests%rowtype;
  v_count integer;
  v_existing integer;
  v_item jsonb;
  v_index integer;
  v_result jsonb;
begin
  if p_user_id is null or p_idempotency_key is null
     or p_tasks is null or jsonb_typeof(p_tasks) <> 'array' then
    raise exception 'invalid generation plan';
  end if;
  v_count := jsonb_array_length(p_tasks);
  if v_count < 1 or v_count > 10 then raise exception 'invalid generation plan size'; end if;

  select * into v_request
    from public.pin_generation_requests
   where user_id = p_user_id and idempotency_key = p_idempotency_key
   for update;
  if not found then raise exception 'generation request not found'; end if;
  if v_request.status <> 'processing' then raise exception 'generation request is not processing'; end if;

  select count(*) into v_existing
    from public.pin_generation_tasks
   where generation_request_id = v_request.id;

  if v_existing > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'task_index', task_index,
      'title', title,
      'description', description,
      'prompt', prompt,
      'model', model,
      'aspect_ratio', aspect_ratio,
      'provider_idempotency_key', provider_idempotency_key,
      'provider_task_id', provider_task_id,
      'status', status
    ) order by task_index), '[]'::jsonb)
      into v_result
      from public.pin_generation_tasks
     where generation_request_id = v_request.id;
    return v_result;
  end if;

  for v_item, v_index in
    select value, ordinality::integer
      from jsonb_array_elements(p_tasks) with ordinality
  loop
    if coalesce(v_item->>'title','') = ''
       or length(v_item->>'title') > 200
       or coalesce(v_item->>'prompt','') = ''
       or length(v_item->>'prompt') > 12000
       or coalesce(v_item->>'model','') = ''
       or length(v_item->>'model') > 100
       or coalesce(v_item->>'aspect_ratio','') not in ('2:3','9:16','4:5','3:4','1:1') then
      raise exception 'invalid generation task at index %', v_index;
    end if;
  end loop;

  insert into public.pin_generation_tasks(
    generation_request_id, user_id, board_id, task_index,
    title, description, prompt, model, aspect_ratio
  )
  select v_request.id, p_user_id, v_request.board_id, ordinality::smallint,
         value->>'title', coalesce(value->>'description',''),
         value->>'prompt', value->>'model', value->>'aspect_ratio'
    from jsonb_array_elements(p_tasks) with ordinality;

  select coalesce(jsonb_agg(jsonb_build_object(
    'task_index', task_index,
    'title', title,
    'description', description,
    'prompt', prompt,
    'model', model,
    'aspect_ratio', aspect_ratio,
    'provider_idempotency_key', provider_idempotency_key,
    'provider_task_id', provider_task_id,
    'status', status
  ) order by task_index), '[]'::jsonb)
    into v_result
    from public.pin_generation_tasks
   where generation_request_id = v_request.id;
  return v_result;
end;
$$;

create or replace function public.update_pin_generation_task(
  p_user_id text,
  p_idempotency_key text,
  p_task_index integer,
  p_status text,
  p_provider_task_id text default null,
  p_provider_result_url text default null,
  p_storage_url text default null,
  p_provider_price numeric default null,
  p_error_code text default null
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_task public.pin_generation_tasks%rowtype;
  v_allowed boolean;
begin
  if p_status not in ('submitting','queued','running','succeeded','failed','unknown') then
    raise exception 'invalid generation task status';
  end if;
  if p_provider_task_id is not null and p_provider_task_id !~ '^[A-Za-z0-9_-]{1,200}$' then
    raise exception 'invalid provider task id';
  end if;
  if p_provider_price is not null and p_provider_price < 0 then
    raise exception 'invalid provider price';
  end if;

  select t.* into v_task
    from public.pin_generation_tasks t
    join public.pin_generation_requests r on r.id = t.generation_request_id
   where t.user_id = p_user_id
     and r.user_id = p_user_id
     and r.idempotency_key = p_idempotency_key
     and t.task_index = p_task_index
   for update of t;
  if not found then raise exception 'generation task not found'; end if;

  v_allowed :=
    (v_task.status = 'prepared' and p_status in ('submitting','failed','unknown')) or
    (v_task.status = 'submitting' and p_status in ('queued','running','succeeded','failed','unknown')) or
    (v_task.status = 'queued' and p_status in ('running','succeeded','failed','unknown')) or
    (v_task.status = 'running' and p_status in ('succeeded','failed','unknown')) or
    (v_task.status = 'unknown' and p_status in ('queued','running','succeeded','failed','unknown'));
  if not v_allowed then
    if v_task.status = p_status and
       (p_provider_task_id is null or v_task.provider_task_id = p_provider_task_id) then
      return true;
    end if;
    raise exception 'invalid generation task transition: % -> %', v_task.status, p_status;
  end if;

  update public.pin_generation_tasks
     set status = p_status,
         provider_task_id = coalesce(p_provider_task_id, provider_task_id),
         provider_result_url = coalesce(p_provider_result_url, provider_result_url),
         storage_url = coalesce(p_storage_url, storage_url),
         provider_price = coalesce(p_provider_price, provider_price),
         error_code = case when p_error_code is null then error_code else left(p_error_code,64) end,
         updated_at = now()
   where id = v_task.id;
  return true;
end;
$$;

revoke all on function public.save_pin_generation_plan(text,text,jsonb) from public, anon, authenticated;
revoke all on function public.update_pin_generation_task(text,text,integer,text,text,text,text,numeric,text) from public, anon, authenticated;
grant execute on function public.save_pin_generation_plan(text,text,jsonb) to service_role;
grant execute on function public.update_pin_generation_task(text,text,integer,text,text,text,text,numeric,text) to service_role;
