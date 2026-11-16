#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/assert-disposable-postgres.sh"

USER_ID="$("${psql_base[@]}" -At -c "insert into public.users(email, tariff_plan, token_version, is_admin) values ('pinterest-claim-race-' || gen_random_uuid() || '@example.invalid', 'start', 0, true) returning id")"
PROJECT_ID="$("${psql_base[@]}" -At -c "insert into public.projects(user_id, niche) values ('$USER_ID', 'Pinterest claim concurrency') returning id")"
BOARD_ID="$("${psql_base[@]}" -At -c "insert into public.boards(project_id, title) values ('$PROJECT_ID', 'Pinterest claim concurrency') returning id")"
ACCOUNT_ID="$("${psql_base[@]}" -At -c "insert into public.pinterest_accounts(user_id, pinterest_user_id, username, access_token) values ('$USER_ID', 'claim-race-$USER_ID', 'claim_race', 'enc:test') returning id")"
PIN_ONE="$("${psql_base[@]}" -At -c "insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost) values ('$BOARD_ID', 'https://cdn.example.invalid/claim-one.png', 'Claim one', '', 'approved', 'flux-schnell', 0) returning id")"
PIN_TWO="$("${psql_base[@]}" -At -c "insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost) values ('$BOARD_ID', 'https://cdn.example.invalid/claim-two.png', 'Claim two', '', 'approved', 'flux-schnell', 0) returning id")"
SCHEDULE_ONE="$("${psql_base[@]}" -At -c "insert into public.pin_schedules(user_id, pin_id, pinterest_account_id, scheduled_at, timezone, pinterest_board_id, status, updated_at) values ('$USER_ID', '$PIN_ONE', '$ACCOUNT_ID', now() - interval '1 hour', 'UTC', 'remote-board-one', 'scheduled', now() - interval '1 hour') returning id")"
SCHEDULE_TWO="$("${psql_base[@]}" -At -c "insert into public.pin_schedules(user_id, pin_id, pinterest_account_id, scheduled_at, timezone, pinterest_board_id, status, updated_at) values ('$USER_ID', '$PIN_TWO', '$ACCOUNT_ID', now() - interval '1 hour', 'UTC', 'remote-board-two', 'scheduled', now() - interval '1 hour') returning id")"

cleanup() {
  stop_test_children
  "${psql_base[@]}" -c "delete from public.pinterest_publications where pin_id in ('$PIN_ONE', '$PIN_TWO'); delete from public.pinterest_publish_attempts where pin_id in ('$PIN_ONE', '$PIN_TWO'); delete from public.pin_schedules where id in ('$SCHEDULE_ONE', '$SCHEDULE_TWO'); delete from public.pins where id in ('$PIN_ONE', '$PIN_TWO'); delete from public.pinterest_accounts where id = '$ACCOUNT_ID'; delete from public.boards where id = '$BOARD_ID'; delete from public.projects where id = '$PROJECT_ID'; delete from public.users where id = '$USER_ID';" >/dev/null 2>&1 || true
  cleanup_test_tmp_dir
}
trap cleanup EXIT

# Hold the first due row. Concurrent workers must skip it and may claim the
# second row only once; neither may steal the locked row or duplicate its peer.
PGAPPNAME=pinterest-claim-race-locker "${psql_base[@]}" -c "begin; select id from public.pin_schedules where id = '$SCHEDULE_ONE' for update; select pg_sleep(5); commit;" >${TEST_TMP_DIR}/pinterest-claim-race-locker.log 2>&1 &
LOCK_PID=$!

locked=0
for _ in $(seq 1 80); do
  active="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name = 'pinterest-claim-race-locker' and position('pg_sleep' in query) > 0")"
  if [[ "$active" == "1" ]]; then locked=1; break; fi
  sleep 0.1
done
if [[ "$locked" != "1" ]]; then
  echo "Could not confirm Pinterest claim race lock holder"
  kill "$LOCK_PID" 2>/dev/null || true
  exit 1
fi

PGAPPNAME=pinterest-claim-race-worker-a "${psql_base[@]}" -At -c "select id from public.claim_due_pin_schedules(1)" >${TEST_TMP_DIR}/pinterest-claim-race-worker-a.log 2>&1 &
WORKER_A_PID=$!
PGAPPNAME=pinterest-claim-race-worker-b "${psql_base[@]}" -At -c "select id from public.claim_due_pin_schedules(1)" >${TEST_TMP_DIR}/pinterest-claim-race-worker-b.log 2>&1 &
WORKER_B_PID=$!

wait "$WORKER_A_PID"
wait "$WORKER_B_PID"
CLAIM_A="$(tr -d '[:space:]' <${TEST_TMP_DIR}/pinterest-claim-race-worker-a.log)"
CLAIM_B="$(tr -d '[:space:]' <${TEST_TMP_DIR}/pinterest-claim-race-worker-b.log)"

if [[ "$CLAIM_A" == "$SCHEDULE_TWO" && -z "$CLAIM_B" ]]; then
  :
elif [[ "$CLAIM_B" == "$SCHEDULE_TWO" && -z "$CLAIM_A" ]]; then
  :
else
  echo "Concurrent Pinterest workers did not produce exactly one claim for the unlocked row (A='$CLAIM_A', B='$CLAIM_B')"
  kill "$LOCK_PID" 2>/dev/null || true
  exit 1
fi

wait "$LOCK_PID"

# Once the first row is unlocked, the next worker can claim it exactly once.
CLAIM_REMAINDER="$("${psql_base[@]}" -At -c "select id from public.claim_due_pin_schedules(1)")"
if [[ "$CLAIM_REMAINDER" != "$SCHEDULE_ONE" ]]; then
  echo "The previously locked schedule was not claimed after release (got '$CLAIM_REMAINDER')"
  exit 1
fi

"${psql_base[@]}" <<SQL
do \$\$
declare
  v_one_status text;
  v_one_token uuid;
  v_one_attempts integer;
  v_two_status text;
  v_two_token uuid;
  v_two_attempts integer;
begin
  select status, claim_token, attempts into v_one_status, v_one_token, v_one_attempts
    from public.pin_schedules where id = '$SCHEDULE_ONE';
  select status, claim_token, attempts into v_two_status, v_two_token, v_two_attempts
    from public.pin_schedules where id = '$SCHEDULE_TWO';

  if v_one_status <> 'publishing' or v_one_token is null or v_one_attempts <> 1
     or v_two_status <> 'publishing' or v_two_token is null or v_two_attempts <> 1
     or v_one_token = v_two_token then
    raise exception 'concurrent claims are inconsistent (one: %/%/%, two: %/%/%)',
      v_one_status, v_one_token, v_one_attempts, v_two_status, v_two_token, v_two_attempts;
  end if;
end;
\$\$;
SQL

echo "Concurrent Pinterest schedule claims passed: each due row was claimed exactly once with a unique fencing token"
