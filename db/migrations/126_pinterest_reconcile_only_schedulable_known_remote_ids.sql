-- 126_pinterest_reconcile_only_schedulable_known_remote_ids.sql
-- Keep permanently conflicting/orphaned attempts out of the scheduler's
-- bounded recovery batch. They remain fenced for manual reconciliation but
-- cannot starve valid scheduled publications behind them.

create or replace function public.reconcile_confirmed_pinterest_schedule_successes()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attempt public.pinterest_publish_attempts%rowtype;
  v_result jsonb;
  v_recovered integer := 0;
  v_reconciled integer := 0;
begin
  -- Do not lock attempts here: complete_pinterest_publish_v2 owns the global
  -- lock order (account -> schedules -> attempt). Only select attempts whose
  -- account and at least one active/uncertain schedule match the exact
  -- account, user, pin and reserved board. Orphaned attempts and destination
  -- conflicts remain fenced, but do not consume the 50-row recovery budget.
  for v_attempt in
    select a.*
      from public.pinterest_publish_attempts a
     where a.status = 'unknown'
       and a.retry_safe is false
       and nullif(btrim(coalesce(a.pinterest_pin_id, '')), '') is not null
       and nullif(btrim(coalesce(a.pinterest_board_id, '')), '') is not null
       and exists (
         select 1
           from public.pinterest_accounts pa
           join public.pin_schedules s
             on s.user_id = a.user_id
            and s.pin_id = a.pin_id
            and s.pinterest_account_id = a.pinterest_account_id
          where pa.id = a.pinterest_account_id
            and pa.user_id = a.user_id
            and s.status in ('publishing','unknown')
            and s.pinterest_board_id = a.pinterest_board_id
            and (
              s.pinterest_pin_id is null
              or s.pinterest_pin_id = a.pinterest_pin_id
            )
       )
     order by a.updated_at asc, a.id asc
     limit 50
  loop
    begin
      v_result := public.complete_pinterest_publish_v2(
        v_attempt.user_id,
        v_attempt.pin_id,
        v_attempt.pinterest_account_id,
        v_attempt.pinterest_pin_id,
        v_attempt.pinterest_board_id
      );
      if v_result->>'status' = 'published'
         and v_result->>'pinterest_pin_id' = v_attempt.pinterest_pin_id
         and v_result->>'pinterest_board_id' = v_attempt.pinterest_board_id then
        v_recovered := v_recovered + 1;
      end if;
    exception when others then
      -- A temporary failure remains retryable by the next worker tick. No
      -- remote POST is issued here, and the attempt stays fenced from retries.
      null;
    end;
  end loop;

  -- Preserve positive-only repair for historical attempts whose exact
  -- publication ledger already proves the remote result.
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
     and s.status='unknown'
     and a.status='published'
     and a.pinterest_pin_id is not null
     and a.pinterest_board_id is not null
     and p.pinterest_pin_id is not null;

  get diagnostics v_reconciled = row_count;
  return v_recovered + v_reconciled;
end;
$$;

revoke all on function public.reconcile_confirmed_pinterest_schedule_successes()
  from public, anon, authenticated;
grant execute on function public.reconcile_confirmed_pinterest_schedule_successes()
  to service_role;
