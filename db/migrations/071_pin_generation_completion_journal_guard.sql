-- 071_pin_generation_completion_journal_guard.sql
-- Enforce journal-to-settlement consistency inside PostgreSQL, not only in the
-- HTTP handler. Any exception rolls back the pin insert and credit debit too.

create or replace function public.guard_pin_generation_request_completion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_task_count integer;
  v_success_count integer;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  select count(*),
         count(*) filter (where status = 'succeeded')
    into v_task_count, v_success_count
    from public.pin_generation_tasks
   where generation_request_id = new.id;

  -- Preserve compatibility for legacy requests created before task journaling.
  if v_task_count = 0 then
    return new;
  end if;

  if exists (
    select 1
      from public.pin_generation_tasks t
     where t.generation_request_id = new.id
       and t.status not in ('succeeded', 'failed')
  ) then
    raise exception 'generation task journal is not terminal';
  end if;

  if exists (
    select 1
      from public.pin_generation_tasks t
     where t.generation_request_id = new.id
       and (
         (t.status = 'succeeded' and (
           t.provider_outcome_status is distinct from 'succeeded'
           or t.provider_price is null
           or t.storage_url is null
           or length(trim(t.storage_url)) = 0
         ))
         or
         (t.status = 'failed' and
           t.provider_outcome_status is distinct from 'failed')
       )
  ) then
    raise exception 'generation task journal outcome is incomplete';
  end if;

  if jsonb_typeof(new.pins) is distinct from 'array'
     or jsonb_array_length(new.pins) <> v_success_count then
    raise exception 'completed pins do not match successful generation tasks';
  end if;

  -- Every successful journal row must have exactly one matching persisted pin.
  -- Count equality above prevents extra pins; storage URL and immutable content
  -- fields prevent substituting another task's result.
  if exists (
    select 1
      from public.pin_generation_tasks t
     where t.generation_request_id = new.id
       and t.status = 'succeeded'
       and not exists (
         select 1
           from jsonb_array_elements(new.pins) as saved(item)
          where saved.item->>'image_url' = t.storage_url
            and saved.item->>'title' = t.title
            and coalesce(saved.item->>'description', '') = coalesce(t.description, '')
            and saved.item->>'model_used' = t.model
            and saved.item->>'aspect_ratio' = t.aspect_ratio
       )
  ) then
    raise exception 'completed pin content does not match generation task journal';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_pin_generation_request_completion()
  from public, anon, authenticated, service_role;

drop trigger if exists pin_generation_request_completion_journal_guard
  on public.pin_generation_requests;

create trigger pin_generation_request_completion_journal_guard
before update of status, pins on public.pin_generation_requests
for each row
execute function public.guard_pin_generation_request_completion();
