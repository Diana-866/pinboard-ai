-- 128_account_deletion_stops_publications.sql
-- A confirmed account deletion must cancel the account's future publications
-- and block further processing of its scheduled tasks, independently of any
-- browser session: the Pinterest worker is driven by an external cron and never
-- authenticates as the user, so the account fence has to live in the database.
--
-- Scope: this migration only fences the scheduled-publication pipeline. It
-- never deletes rows and never touches already-published output.
--
-- Three enforced gates, all keyed on the same rule
-- (owner account exists and is not 'active'):
--   1. claim_due_pin_schedules  -> cancels the account's not-yet-published
--      schedules and refuses to hand any of them to a worker;
--   2. renew_pin_schedule_claim -> an in-flight worker can no longer renew a
--      claim, so it aborts at the last checkpoint before POST /pins;
--   3. begin_scheduled_pinterest_publish -> a scheduled reservation is refused
--      up front, so no publication journal row is ever written.
--
-- Ownership is matched the same way the rest of the schema does it:
--   public.users.id is uuid, public.pin_schedules.user_id is text.

begin;

-- 1. Cancel and fence scheduled work for non-active accounts.
create or replace function public.claim_due_pin_schedules(p_limit integer default 10)
returns setof public.pin_schedules
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- P6.17: a fenced account's not-yet-published schedules are cancelled before
  -- any other repair, so no later block can turn one of them back into work.
  -- Rows already published/publishing/unknown are left untouched.
  update public.pin_schedules s
     set status='cancelled',
         claim_token=null,
         last_error='Аккаунт PinPosy удаляется; запланированная публикация отменена',
         next_attempt_at=null,
         updated_at=clock_timestamp()
   where s.status='scheduled'
     and exists (
       select 1 from public.users u
        where u.id::text = s.user_id
          and u.account_status <> 'active'
     );

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

  -- A fenced account is excluded from the claim itself, so even a row that the
  -- crash-recovery block above just requeued to 'scheduled' can never be handed
  -- to a worker. The cancellation at the top of this function retires it on the
  -- next tick.
  return query
  with due as (
    select s0.id
      from public.pin_schedules s0
     where s0.status='scheduled'
       and s0.scheduled_at <= clock_timestamp()
       and (s0.next_attempt_at is null or s0.next_attempt_at <= clock_timestamp())
       and s0.pinterest_board_id is not null
       and s0.pinterest_account_id is not null
       and not exists (
         select 1 from public.users u
          where u.id::text = s0.user_id
            and u.account_status <> 'active'
       )
     order by s0.scheduled_at asc
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

-- 2. An in-flight worker must not be able to renew a claim for a fenced
-- account. The worker calls this immediately before POST /pins; a false result
-- aborts the publication before the external side effect.
create or replace function public.renew_pin_schedule_claim(
  p_schedule_id uuid,
  p_claim_token uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rows integer := 0;
begin
  if p_schedule_id is null or p_claim_token is null then
    return false;
  end if;

  update public.pin_schedules s
     set updated_at = clock_timestamp()
   where s.id = p_schedule_id
     and s.status = 'publishing'
     and s.claim_token = p_claim_token
     and not exists (
       select 1 from public.users u
        where u.id::text = s.user_id
          and u.account_status <> 'active'
     );

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.renew_pin_schedule_claim(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.renew_pin_schedule_claim(uuid,uuid)
  to service_role;

-- 3. Refuse a scheduled reservation for a fenced account before any journal
-- row is written, so the publication pipeline sees a definitive rejection.
create or replace function public.begin_scheduled_pinterest_publish(
  p_user_id text,
  p_schedule_id uuid,
  p_claim_token uuid,
  p_pin_id uuid,
  p_pinterest_account_id uuid,
  p_pinterest_board_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_schedule public.pin_schedules%rowtype;
begin
  if p_claim_token is null then
    raise exception 'schedule claim token is required' using errcode='40001';
  end if;

  if exists (
    select 1 from public.users u
     where u.id::text = p_user_id
       and u.account_status <> 'active'
  ) then
    raise exception 'PinPosy account is deleting; scheduled publication is blocked' using errcode='42501';
  end if;

  -- Match disconnect_pinterest_account_v2 and retry_failed_pin_schedule:
  -- account lock first, then schedule. This prevents both a disconnect race
  -- and an account<->schedule deadlock.
  perform 1
    from public.pinterest_accounts a
   where a.id = p_pinterest_account_id
     and a.user_id = p_user_id
     and a.disconnected_at is null
     and a.access_token is not null
   for update;
  if not found then
    raise exception 'Pinterest account not found or disconnected' using errcode='42501';
  end if;

  select * into v_schedule
    from public.pin_schedules
   where id=p_schedule_id
     and user_id=p_user_id
   for update;

  if not found
     or v_schedule.status <> 'publishing'
     or v_schedule.claim_token is distinct from p_claim_token
     or v_schedule.pin_id <> p_pin_id
     or v_schedule.pinterest_account_id is distinct from p_pinterest_account_id
     or v_schedule.pinterest_board_id is distinct from p_pinterest_board_id then
    raise exception 'schedule claim is no longer current' using errcode='40001';
  end if;

  return public.begin_pinterest_publish_v2(
    p_user_id,p_pin_id,p_pinterest_account_id,p_pinterest_board_id
  );
end;
$$;

revoke all on function public.begin_scheduled_pinterest_publish(text,uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.begin_scheduled_pinterest_publish(text,uuid,uuid,uuid,uuid,text)
  to service_role;

commit;
