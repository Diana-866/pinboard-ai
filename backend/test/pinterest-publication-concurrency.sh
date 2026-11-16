#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/assert-disposable-postgres.sh"

USER_ID="$("${psql_base[@]}" -At -c "insert into public.users(email, tariff_plan, token_version, is_admin) values ('pinterest-publication-race-' || gen_random_uuid() || '@example.invalid', 'start', 0, true) returning id")"
PROJECT_ID="$("${psql_base[@]}" -At -c "insert into public.projects(user_id, niche) values ('$USER_ID', 'Pinterest publication race') returning id")"
BOARD_ID="$("${psql_base[@]}" -At -c "insert into public.boards(project_id, title) values ('$PROJECT_ID', 'Pinterest publication race') returning id")"
PIN_ID="$("${psql_base[@]}" -At -c "insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost) values ('$BOARD_ID', 'https://cdn.example.invalid/publication-race.png', 'Publication race', '', 'approved', 'flux-schnell', 0) returning id")"
ACCOUNT_ID="$("${psql_base[@]}" -At -c "insert into public.pinterest_accounts(user_id, pinterest_user_id, username, access_token) values ('$USER_ID', 'publication-race-$USER_ID', 'publication_race', 'enc:test') returning id")"
SCHEDULE_ID="$("${psql_base[@]}" -At -c "insert into public.pin_schedules(user_id, pin_id, pinterest_account_id, scheduled_at, timezone, pinterest_board_id, status, claim_token, updated_at) values ('$USER_ID', '$PIN_ID', '$ACCOUNT_ID', now() - interval '1 hour', 'UTC', 'remote-board-race', 'unknown', null, now() - interval '30 minutes') returning id")"
ACTION_ID="$("${psql_base[@]}" -At -c "select gen_random_uuid()")"
REMOTE_PIN_ID="remote-pin-race-$PIN_ID"

# Separate fixture for stale-recovery versus late-worker-success race.
RECOVERY_PIN_ID="$("${psql_base[@]}" -At -c "insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost) values ('$BOARD_ID', 'https://cdn.example.invalid/stale-recovery-race.png', 'Stale recovery race', '', 'approved', 'flux-schnell', 0) returning id")"
RECOVERY_SCHEDULE_ID="$("${psql_base[@]}" -At -c "insert into public.pin_schedules(user_id, pin_id, pinterest_account_id, scheduled_at, timezone, pinterest_board_id, status, claim_token, updated_at) values ('$USER_ID', '$RECOVERY_PIN_ID', '$ACCOUNT_ID', now() - interval '1 hour', 'UTC', 'remote-board-recovery-race', 'publishing', gen_random_uuid(), now() - interval '30 minutes') returning id")"
RECOVERY_REMOTE_PIN_ID="remote-pin-recovery-race-$RECOVERY_PIN_ID"

cleanup() {
  stop_test_children
  # The receipt ledger is deliberately append-only in production. This test
  # runs as the disposable CI database owner, so disable only its mutation
  # trigger long enough to remove this isolated fixture and then restore it.
  "${psql_base[@]}" -c "alter table public.pinterest_operator_reconciliations disable trigger pinterest_operator_reconciliations_no_mutation; delete from public.pinterest_operator_reconciliations where schedule_id in ('$SCHEDULE_ID', '$RECOVERY_SCHEDULE_ID'); alter table public.pinterest_operator_reconciliations enable trigger pinterest_operator_reconciliations_no_mutation; delete from public.pinterest_publications where pin_id in ('$PIN_ID', '$RECOVERY_PIN_ID'); delete from public.pinterest_publish_attempts where pin_id in ('$PIN_ID', '$RECOVERY_PIN_ID'); delete from public.pin_schedules where id in ('$SCHEDULE_ID', '$RECOVERY_SCHEDULE_ID'); delete from public.pins where id in ('$PIN_ID', '$RECOVERY_PIN_ID'); delete from public.pinterest_accounts where id = '$ACCOUNT_ID'; delete from public.boards where id = '$BOARD_ID'; delete from public.projects where id = '$PROJECT_ID'; delete from public.users where id = '$USER_ID';" >/dev/null 2>&1 || true
  cleanup_test_tmp_dir
}
trap cleanup EXIT

"${psql_base[@]}" -c "insert into public.pinterest_publish_attempts(user_id, pin_id, pinterest_account_id, pinterest_board_id, status, retry_safe, updated_at) values ('$USER_ID', '$PIN_ID', '$ACCOUNT_ID', 'remote-board-race', 'unknown', false, now() - interval '30 minutes')" >/dev/null
"${psql_base[@]}" -c "insert into public.pinterest_publish_attempts(user_id, pin_id, pinterest_account_id, pinterest_board_id, status, retry_safe, updated_at) values ('$USER_ID', '$RECOVERY_PIN_ID', '$ACCOUNT_ID', 'remote-board-recovery-race', 'processing', false, now() - interval '30 minutes')" >/dev/null

# Hold the shared account lock so the worker completion and operator
# reconciliation become real concurrent contenders on the same lock boundary.
PGAPPNAME=pinterest-publication-race-locker "${psql_base[@]}" -c "begin; select id from public.pinterest_accounts where id = '$ACCOUNT_ID' for update; select pg_sleep(6); commit;" >${TEST_TMP_DIR}/pinterest-publication-race-locker.log 2>&1 &
LOCK_PID=$!

locked=0
for _ in $(seq 1 80); do
  active="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name = 'pinterest-publication-race-locker' and position('pg_sleep' in query) > 0")"
  if [[ "$active" == "1" ]]; then locked=1; break; fi
  sleep 0.1
done
if [[ "$locked" != "1" ]]; then
  echo "Could not confirm Pinterest publication race lock holder"
  kill "$LOCK_PID" 2>/dev/null || true
  exit 1
fi

PGAPPNAME=pinterest-publication-race-completion "${psql_base[@]}" -At -c "select public.complete_pinterest_publish_v2('$USER_ID', '$PIN_ID', '$ACCOUNT_ID', '$REMOTE_PIN_ID', 'remote-board-race')" >${TEST_TMP_DIR}/pinterest-publication-race-completion.log 2>&1 &
COMPLETION_PID=$!
PGAPPNAME=pinterest-publication-race-reconciliation "${psql_base[@]}" -At -c "select public.admin_reconcile_pinterest_unknown_publication('$USER_ID', '$SCHEDULE_ID', '$REMOTE_PIN_ID', 'remote-board-race', 'pinterest_dashboard', 'concurrency-test-$ACTION_ID', '$ACTION_ID')" >${TEST_TMP_DIR}/pinterest-publication-race-reconciliation.log 2>&1 &
RECONCILIATION_PID=$!

waiters=0
for _ in $(seq 1 100); do
  waiters="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name in ('pinterest-publication-race-completion', 'pinterest-publication-race-reconciliation') and wait_event_type = 'Lock')"
  if [[ "$waiters" == "2" ]]; then break; fi
  sleep 0.1
done
if [[ "$waiters" != "2" ]]; then
  echo "Worker completion and operator reconciliation did not both contend on the account lock (waiters=$waiters)"
  kill "$LOCK_PID" 2>/dev/null || true
  exit 1
fi

wait "$LOCK_PID"
wait "$COMPLETION_PID" || true
wait "$RECONCILIATION_PID" || true

"${psql_base[@]}" <<SQL
do \$\$
declare
  v_schedule_status text;
  v_claim_token uuid;
  v_schedule_remote_id text;
  v_attempt_status text;
  v_attempt_remote_id text;
  v_publication_count integer;
  v_reconciliation_count integer;
begin
  select status, claim_token, pinterest_pin_id
    into v_schedule_status, v_claim_token, v_schedule_remote_id
    from public.pin_schedules where id = '$SCHEDULE_ID';
  select status, pinterest_pin_id
    into v_attempt_status, v_attempt_remote_id
    from public.pinterest_publish_attempts
   where pin_id = '$PIN_ID' and pinterest_account_id = '$ACCOUNT_ID';
  select count(*) into v_publication_count
    from public.pinterest_publications
   where pin_id = '$PIN_ID' and pinterest_account_id = '$ACCOUNT_ID'
     and pinterest_pin_id = '$REMOTE_PIN_ID';
  select count(*) into v_reconciliation_count
    from public.pinterest_operator_reconciliations
   where action_id = '$ACTION_ID';

  if v_schedule_status <> 'published' or v_claim_token is not null
     or v_schedule_remote_id <> '$REMOTE_PIN_ID'
     or v_attempt_status <> 'published' or v_attempt_remote_id <> '$REMOTE_PIN_ID'
     or v_publication_count <> 1 or v_reconciliation_count not in (0,1) then
    raise exception 'worker/reconciliation race produced inconsistent state (schedule %, attempt %, publications %, receipts %)',
      v_schedule_status, v_attempt_status, v_publication_count, v_reconciliation_count;
  end if;
end;
\$\$;
SQL

echo "Concurrent Pinterest worker completion/operator reconciliation passed for schedule $SCHEDULE_ID (receipt count checked for idempotent winner)"

# Race a late worker success against stale-claim recovery. The blocker holds
# the schedule row while both operations start; after release, either order
# must converge to the same published remote identity without a retry.
PGAPPNAME=pinterest-stale-recovery-race-locker "${psql_base[@]}" -c "begin; select id from public.pin_schedules where id = '$RECOVERY_SCHEDULE_ID' for update; select pg_sleep(6); commit;" >${TEST_TMP_DIR}/pinterest-stale-recovery-race-locker.log 2>&1 &
RECOVERY_LOCK_PID=$!

recovery_locked=0
for _ in $(seq 1 80); do
  active="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name = 'pinterest-stale-recovery-race-locker' and position('pg_sleep' in query) > 0")"
  if [[ "$active" == "1" ]]; then recovery_locked=1; break; fi
  sleep 0.1
done
if [[ "$recovery_locked" != "1" ]]; then
  echo "Could not confirm stale-recovery race lock holder"
  kill "$RECOVERY_LOCK_PID" 2>/dev/null || true
  exit 1
fi

PGAPPNAME=pinterest-stale-recovery-race-completion "${psql_base[@]}" -At -c "select public.complete_pinterest_publish_v2('$USER_ID', '$RECOVERY_PIN_ID', '$ACCOUNT_ID', '$RECOVERY_REMOTE_PIN_ID', 'remote-board-recovery-race')" >${TEST_TMP_DIR}/pinterest-stale-recovery-race-completion.log 2>&1 &
LATE_COMPLETION_PID=$!
PGAPPNAME=pinterest-stale-recovery-race-recovery "${psql_base[@]}" -At -c "select count(*) from public.claim_due_pin_schedules(10)" >${TEST_TMP_DIR}/pinterest-stale-recovery-race-recovery.log 2>&1 &
STALE_RECOVERY_PID=$!

recovery_waiters=0
for _ in $(seq 1 100); do
  recovery_waiters="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name in ('pinterest-stale-recovery-race-completion', 'pinterest-stale-recovery-race-recovery') and wait_event_type = 'Lock')"
  if [[ "$recovery_waiters" == "2" ]]; then break; fi
  sleep 0.1
done
if [[ "$recovery_waiters" != "2" ]]; then
  echo "Late completion and stale recovery did not both contend on the schedule lock (waiters=$recovery_waiters)"
  kill "$RECOVERY_LOCK_PID" 2>/dev/null || true
  exit 1
fi

wait "$RECOVERY_LOCK_PID"
wait "$LATE_COMPLETION_PID"
wait "$STALE_RECOVERY_PID"

"${psql_base[@]}" <<SQL
do \$\$
declare
  v_schedule_status text;
  v_claim_token uuid;
  v_schedule_remote_id text;
  v_attempt_status text;
  v_attempt_remote_id text;
  v_publication_count integer;
begin
  select status, claim_token, pinterest_pin_id
    into v_schedule_status, v_claim_token, v_schedule_remote_id
    from public.pin_schedules where id = '$RECOVERY_SCHEDULE_ID';
  select status, pinterest_pin_id
    into v_attempt_status, v_attempt_remote_id
    from public.pinterest_publish_attempts
   where pin_id = '$RECOVERY_PIN_ID' and pinterest_account_id = '$ACCOUNT_ID';
  select count(*) into v_publication_count
    from public.pinterest_publications
   where pin_id = '$RECOVERY_PIN_ID' and pinterest_account_id = '$ACCOUNT_ID'
     and pinterest_pin_id = '$RECOVERY_REMOTE_PIN_ID';

  if v_schedule_status <> 'published' or v_claim_token is not null
     or v_schedule_remote_id <> '$RECOVERY_REMOTE_PIN_ID'
     or v_attempt_status <> 'published' or v_attempt_remote_id <> '$RECOVERY_REMOTE_PIN_ID'
     or v_publication_count <> 1 then
    raise exception 'late-success/stale-recovery race produced inconsistent state (schedule %, attempt %, publications %)',
      v_schedule_status, v_attempt_status, v_publication_count;
  end if;
end;
\$\$;
SQL

echo "Concurrent Pinterest late-success/stale-recovery race passed for schedule $RECOVERY_SCHEDULE_ID"
