-- 093_pinterest_schedule_remote_pin_identity_fencing.sql
-- A schedule with an already-recorded remote pin ID must never be reconciled
-- against a different remote ID, even when attempt and publication ledger agree.
-- Reassert both automatic reconciliation paths with the schedule ID included
-- in the complete identity tuple.

-- 091_reconcile_confirmed_pinterest_unknown_schedules.sql
-- Re-run positive-only reconciliation on every worker tick. A historical one-time
-- backfill is not enough when an older/partial worker left a confirmed publication
-- paired with an unknown schedule. Both durable records must agree exactly.

create or replace function public.reconcile_confirmed_pinterest_schedule_successes()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reconciled integer;
begin
  update public.pin_schedules s
     set status='published',
         pinterest_pin_id=a.pinterest_pin_id,
         published_at=coalesce(s.published_at,a.updated_at,p.created_at,clock_timestamp()),
         claim_token=null,
         last_error=null,
         next_attempt_at=null,
         updated_at=clock_timestamp()
    from public.pinterest_publish_attempts a
    join public.pinterest_publications p
      on p.user_id=a.user_id
     and p.pin_id=a.pin_id
     and p.pinterest_account_id=a.pinterest_account_id
     and p.pinterest_pin_id=a.pinterest_pin_id
     and p.pinterest_board_id=a.pinterest_board_id
   where s.user_id=a.user_id
     and s.pin_id=a.pin_id
     and s.pinterest_account_id=a.pinterest_account_id
     and s.pinterest_board_id=a.pinterest_board_id
     and (s.pinterest_pin_id is null or s.pinterest_pin_id=a.pinterest_pin_id)
     and s.status='unknown'
     and a.status='published'
     and a.pinterest_pin_id is not null
     and a.pinterest_board_id is not null
     and p.pinterest_pin_id is not null;

  get diagnostics v_reconciled = row_count;
  return v_reconciled;
end;
$$;

revoke all on function public.reconcile_confirmed_pinterest_schedule_successes()
  from public, anon, authenticated;
grant execute on function public.reconcile_confirmed_pinterest_schedule_successes()
  to service_role;

-- 092_pinterest_stale_schedule_recovery_requires_exact_publication_evidence.sql
-- A stale publishing claim is reconciled as published only when the attempt and
-- publication ledger agree on owner, pin, account, board, and remote Pinterest ID.
-- Ambiguous or mismatched evidence remains unknown and is never auto-retried.

create or replace function public.claim_due_pin_schedules(p_limit integer default 10)
returns setof public.pin_schedules
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.pin_schedules
     set status='failed',
         claim_token=null,
         last_error='Pinterest board is missing; select a destination board and schedule again',
         next_attempt_at=null,
         updated_at=clock_timestamp()
   where status='scheduled'
     and scheduled_at <= clock_timestamp()
     and pinterest_board_id is null;

  update public.pin_schedules
     set status='failed',
         claim_token=null,
         last_error='Pinterest account is missing or disconnected; select an active account and schedule again',
         next_attempt_at=null,
         updated_at=clock_timestamp()
   where status='scheduled'
     and scheduled_at <= clock_timestamp()
     and pinterest_account_id is null;

  update public.pin_schedules s
     set status='failed',
         claim_token=null,
         last_error='Pinterest account is disconnected; reconnect it and schedule again',
         next_attempt_at=null,
         updated_at=clock_timestamp()
   where s.status='scheduled'
     and s.scheduled_at <= clock_timestamp()
     and s.pinterest_account_id is not null
     and not exists (
       select 1 from public.pinterest_accounts a
        where a.id=s.pinterest_account_id
          and a.user_id=s.user_id
          and a.disconnected_at is null
          and a.access_token is not null
     );

  -- Positive-only stale-claim success recovery. A success journal alone is
  -- insufficient: the durable publication ledger must confirm the same
  -- owner, local pin, Pinterest account, destination board, and remote pin ID.
  update public.pin_schedules s
     set status='published',
         pinterest_pin_id=a.pinterest_pin_id,
         published_at=coalesce(s.published_at,a.updated_at,p.created_at,clock_timestamp()),
         claim_token=null,
         last_error=null,
         next_attempt_at=null,
         updated_at=clock_timestamp()
    from public.pinterest_publish_attempts a
    join public.pinterest_publications p
      on p.user_id=a.user_id
     and p.pin_id=a.pin_id
     and p.pinterest_account_id=a.pinterest_account_id
     and p.pinterest_board_id=a.pinterest_board_id
     and p.pinterest_pin_id=a.pinterest_pin_id
   where s.user_id=a.user_id
     and s.pin_id=a.pin_id
     and s.pinterest_account_id=a.pinterest_account_id
     and s.pinterest_board_id=a.pinterest_board_id
     and (s.pinterest_pin_id is null or s.pinterest_pin_id=a.pinterest_pin_id)
     and s.status='publishing'
     and s.updated_at < clock_timestamp() - interval '20 minutes'
     and a.status='published'
     and a.pinterest_pin_id is not null
     and a.pinterest_board_id is not null
     and p.pinterest_pin_id is not null;

  -- Preserve the durable outcome after a worker crash. A safe failure can
  -- requeue only for the exact board it was recorded against. Any other
  -- attempt remains fenced as failed/unknown rather than being replayed.
  update public.pin_schedules s
     set status=case
           when exists (
             select 1 from public.pinterest_publish_attempts a
              where a.user_id=s.user_id and a.pin_id=s.pin_id
                and a.pinterest_account_id=s.pinterest_account_id
                and a.pinterest_board_id=s.pinterest_board_id
                and a.status='failed' and a.retry_safe
           ) then 'scheduled'
           when exists (
             select 1 from public.pinterest_publish_attempts a
              where a.user_id=s.user_id and a.pin_id=s.pin_id
                and a.pinterest_account_id=s.pinterest_account_id
                and a.status='failed'
           ) then 'failed'
           when exists (
             select 1 from public.pinterest_publish_attempts a
              where a.user_id=s.user_id and a.pin_id=s.pin_id
                and a.pinterest_account_id=s.pinterest_account_id
           ) then 'unknown'
           else 'scheduled'
         end,
         claim_token=null,
         last_error=case
           when exists (
             select 1 from public.pinterest_publish_attempts a
              where a.user_id=s.user_id and a.pin_id=s.pin_id
                and a.pinterest_account_id=s.pinterest_account_id
                and a.pinterest_board_id=s.pinterest_board_id
                and a.status='failed' and a.retry_safe
           ) then 'Worker stopped after a confirmed safe Pinterest rejection for this board; safely requeued'
           when exists (
             select 1 from public.pinterest_publish_attempts a
              where a.user_id=s.user_id and a.pin_id=s.pin_id
                and a.pinterest_account_id=s.pinterest_account_id
                and a.status='failed'
           ) then 'Worker stopped after a confirmed Pinterest rejection that is not safe for this schedule destination'
           when exists (
             select 1 from public.pinterest_publish_attempts a
              where a.user_id=s.user_id and a.pin_id=s.pin_id
                and a.pinterest_account_id=s.pinterest_account_id
           ) then 'Worker stopped after a publication attempt; exact destination evidence is missing and manual reconciliation is required'
           else 'Worker stopped before publication attempt was reserved; safely requeued'
         end,
         next_attempt_at=case
           when not exists (
             select 1 from public.pinterest_publish_attempts a
              where a.user_id=s.user_id and a.pin_id=s.pin_id
                and a.pinterest_account_id=s.pinterest_account_id
           ) or exists (
             select 1 from public.pinterest_publish_attempts a
              where a.user_id=s.user_id and a.pin_id=s.pin_id
                and a.pinterest_account_id=s.pinterest_account_id
                and a.pinterest_board_id=s.pinterest_board_id
                and a.status='failed' and a.retry_safe
           ) then clock_timestamp() + interval '1 minute'
           else null
         end,
         updated_at=clock_timestamp()
   where s.status='publishing'
     and s.updated_at < clock_timestamp() - interval '20 minutes';

  return query
  with due as (
    select id
      from public.pin_schedules
     where status='scheduled'
       and scheduled_at <= clock_timestamp()
       and (next_attempt_at is null or next_attempt_at <= clock_timestamp())
       and pinterest_board_id is not null
       and pinterest_account_id is not null
     order by scheduled_at asc
     for update skip locked
     limit greatest(1,least(coalesce(p_limit,10),10))
  )
  update public.pin_schedules s
     set status='publishing',
         claim_token=gen_random_uuid(),
         attempts=attempts+1,
         next_attempt_at=null,
         updated_at=clock_timestamp()
    from due
   where s.id=due.id
  returning s.*;
end;
$$;

revoke all on function public.claim_due_pin_schedules(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_pin_schedules(integer) to service_role;
