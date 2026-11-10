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
