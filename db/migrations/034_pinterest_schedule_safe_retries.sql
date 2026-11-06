-- 034_pinterest_schedule_safe_retries.sql
-- Retry only failures that occurred before a remote Pinterest create request
-- could have been sent. Ambiguous publish attempts remain non-retryable.
alter table public.pin_schedules
  add column if not exists next_attempt_at timestamptz;

create index if not exists pin_schedules_retry_due_idx
  on public.pin_schedules(status, next_attempt_at, scheduled_at)
  where status = 'scheduled';

create or replace function public.claim_due_pin_schedules(p_limit integer default 10)
returns setof public.pin_schedules
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pin_schedules
     set status='failed',
         last_error='Pinterest account is missing or disconnected; select an active account and schedule again',
         next_attempt_at=null,
         updated_at=now()
   where status='scheduled'
     and scheduled_at <= now()
     and pinterest_account_id is null;

  update public.pin_schedules s
     set status='failed',
         last_error='Pinterest account is disconnected; reconnect it and schedule again',
         next_attempt_at=null,
         updated_at=now()
   where s.status='scheduled'
     and s.scheduled_at <= now()
     and s.pinterest_account_id is not null
     and not exists (
       select 1 from public.pinterest_accounts a
        where a.id=s.pinterest_account_id
          and a.user_id=s.user_id
          and a.disconnected_at is null
          and a.access_token is not null
     );

  update public.pin_schedules s
     set status='published',
         pinterest_pin_id=a.pinterest_pin_id,
         published_at=coalesce(s.published_at, a.updated_at),
         last_error=null,
         next_attempt_at=null,
         updated_at=now()
    from public.pinterest_publish_attempts a
   where s.pin_id=a.pin_id
     and s.pinterest_account_id=a.pinterest_account_id
     and a.status='published'
     and s.status='publishing'
     and s.updated_at < now() - interval '20 minutes';

  update public.pin_schedules
     set status='unknown',
         last_error='Worker stopped while publication outcome was not confirmed; manual reconciliation required',
         next_attempt_at=null,
         updated_at=now()
   where status='publishing'
     and updated_at < now() - interval '20 minutes';

  return query
  with due as (
    select id
      from public.pin_schedules
     where status='scheduled'
       and scheduled_at <= now()
       and (next_attempt_at is null or next_attempt_at <= now())
       and pinterest_board_id is not null
       and pinterest_account_id is not null
     order by scheduled_at asc
     for update skip locked
     limit greatest(1, least(coalesce(p_limit,10),10))
  )
  update public.pin_schedules s
     set status='publishing',
         attempts=attempts+1,
         next_attempt_at=null,
         updated_at=now()
    from due
   where s.id=due.id
  returning s.*;
end;
$$;

revoke all on function public.claim_due_pin_schedules(integer) from public, anon, authenticated;
grant execute on function public.claim_due_pin_schedules(integer) to service_role;
