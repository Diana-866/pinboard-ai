-- 017_pinterest_schedule_worker.sql
-- Atomically claim due scheduled pins for one worker instance.
alter table public.pin_schedules
  drop constraint if exists pin_schedules_status_check;
alter table public.pin_schedules
  add constraint pin_schedules_status_check
  check (status in ('scheduled','publishing','published','failed','unknown','cancelled'));

-- An uncertain outcome must block a second schedule until it is reconciled.
drop index if exists public.pin_schedules_one_active_per_pin;
create unique index pin_schedules_one_active_per_pin
  on public.pin_schedules(pin_id)
  where status in ('scheduled','publishing','published','unknown');

create or replace function public.claim_due_pin_schedules(p_limit integer default 10)
returns setof public.pin_schedules
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A worker crash after contacting Pinterest is ambiguous. Never auto-retry it.
  update public.pin_schedules s
    set status='published',
        pinterest_pin_id=a.pinterest_pin_id,
        published_at=coalesce(s.published_at, a.updated_at),
        last_error=null,
        updated_at=now()
    from public.pinterest_publish_attempts a
    where s.pin_id=a.pin_id
      and a.status='published'
      and s.status='publishing'
      and s.updated_at < now() - interval '20 minutes';

  update public.pin_schedules
    set status='unknown',
        last_error='Worker stopped while publication outcome was not confirmed; manual reconciliation required',
        updated_at=now()
    where status='publishing'
      and updated_at < now() - interval '20 minutes';

  return query
  with due as (
    select id
      from public.pin_schedules
      where status='scheduled'
        and scheduled_at <= now()
        and pinterest_board_id is not null
      order by scheduled_at asc
      for update skip locked
      limit greatest(1, least(coalesce(p_limit,10),50))
  )
  update public.pin_schedules s
    set status='publishing',
        attempts=attempts+1,
        updated_at=now()
    from due
    where s.id=due.id
  returning s.*;
end;
$$;

revoke all on function public.claim_due_pin_schedules(integer) from public, anon, authenticated;
grant execute on function public.claim_due_pin_schedules(integer) to service_role;
