-- 149_pin_generation_task_facts_guard.sql
-- Enforce journal fact immutability for every writer, including provider-outcome
-- reconciliation RPCs and future SQL paths, not only update_pin_generation_task.

create or replace function public.guard_pin_generation_task_facts()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.provider_task_id is not null
     and new.provider_task_id is distinct from old.provider_task_id then
    raise exception 'provider task id is immutable for generation task';
  end if;
  if old.provider_result_url is not null
     and new.provider_result_url is distinct from old.provider_result_url then
    raise exception 'provider result URL is immutable for generation task';
  end if;
  if old.provider_price is not null
     and new.provider_price is distinct from old.provider_price then
    raise exception 'provider price is immutable for generation task';
  end if;
  if old.storage_url is not null
     and new.storage_url is distinct from old.storage_url then
    raise exception 'Storage URL is immutable for generation task';
  end if;
  return new;
end;
$$;

drop trigger if exists pin_generation_task_facts_immutable
  on public.pin_generation_tasks;
create trigger pin_generation_task_facts_immutable
before update on public.pin_generation_tasks
for each row execute function public.guard_pin_generation_task_facts();

revoke all on function public.guard_pin_generation_task_facts()
  from public, anon, authenticated;
