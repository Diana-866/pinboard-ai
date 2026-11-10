-- 049_pinterest_schedule_claim_fencing.sql
-- A schedule claim is fenced before any preflight work. The durable publish
-- attempt is created only while the exact claim token is still current.
alter table public.pin_schedules
  add column if not exists claim_token uuid;

-- Existing in-flight rows predate claim fencing. Give them a token so that
-- their current worker can finish, while later stale recovery can rotate it.
update public.pin_schedules
   set claim_token=gen_random_uuid()
 where status='publishing'
   and claim_token is null;

alter table public.pin_schedules
  drop constraint if exists pin_schedules_publishing_claim_token_check;
alter table public.pin_schedules
  add constraint pin_schedules_publishing_claim_token_check
  check (status <> 'publishing' or claim_token is not null);

-- A claim token is meaningful only while a worker owns a publishing row.
-- Clear it on every terminal, cancelled, unknown, or queued transition.
create or replace function public.clear_nonpublishing_pin_schedule_claim_token()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status <> 'publishing' then
    new.claim_token := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_nonpublishing_pin_schedule_claim_token
  on public.pin_schedules;
create trigger trg_clear_nonpublishing_pin_schedule_claim_token
before insert or update of status, claim_token on public.pin_schedules
for each row
execute function public.clear_nonpublishing_pin_schedule_claim_token();

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

  -- Reconcile a confirmed success before considering any stale claim.
  update public.pin_schedules s
     set status='published',
         pinterest_pin_id=a.pinterest_pin_id,
         published_at=coalesce(s.published_at,a.updated_at,clock_timestamp()),
         claim_token=null,
         last_error=null,
         next_attempt_at=null,
         updated_at=clock_timestamp()
    from public.pinterest_publish_attempts a
   where s.user_id=a.user_id
     and s.pin_id=a.pin_id
     and s.pinterest_account_id=a.pinterest_account_id
     and a.status='published'
     and s.status='publishing'
     and s.updated_at < clock_timestamp() - interval '20 minutes';

  -- If a journal exists, a remote request may have started: keep the row
  -- non-retryable. If no journal exists, the old worker has not crossed the
  -- durable pre-POST boundary. Rotate away its token and safely requeue it.
  update public.pin_schedules s
     set status=case when exists (
           select 1 from public.pinterest_publish_attempts a
            where a.user_id=s.user_id
              and a.pin_id=s.pin_id
              and a.pinterest_account_id=s.pinterest_account_id
         ) then 'unknown' else 'scheduled' end,
         claim_token=null,
         last_error=case when exists (
           select 1 from public.pinterest_publish_attempts a
            where a.user_id=s.user_id
              and a.pin_id=s.pin_id
              and a.pinterest_account_id=s.pinterest_account_id
         ) then
           'Worker stopped after publication attempt was reserved; manual reconciliation required'
         else
           'Worker stopped before publication attempt was reserved; safely requeued'
         end,
         next_attempt_at=case when exists (
           select 1 from public.pinterest_publish_attempts a
            where a.user_id=s.user_id
              and a.pin_id=s.pin_id
              and a.pinterest_account_id=s.pinterest_account_id
         ) then null else clock_timestamp() + interval '1 minute' end,
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

  -- The schedule row lock serializes this journal reservation against stale
  -- claim recovery. Once this returns "started", recovery sees the journal and
  -- must use unknown/reconciliation rather than requeueing.
  return public.begin_pinterest_publish_v2(
    p_user_id,p_pin_id,p_pinterest_account_id,p_pinterest_board_id
  );
end;
$$;

revoke all on function public.claim_due_pin_schedules(integer)
  from public, anon, authenticated;
revoke all on function public.begin_scheduled_pinterest_publish(text,uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.claim_due_pin_schedules(integer) to service_role;
grant execute on function public.begin_scheduled_pinterest_publish(text,uuid,uuid,uuid,uuid,text)
  to service_role;
