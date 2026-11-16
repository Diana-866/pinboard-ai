#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/assert-disposable-postgres.sh"

USER_ID="$("${psql_base[@]}" -At -c "insert into public.users(email, password_hash, email_verified) values ('password-reset-issue-race-' || gen_random_uuid() || '@example.invalid', 'old-hash', true) returning id")"
HASH_ONE="$(openssl rand -hex 32)"
HASH_TWO="$(openssl rand -hex 32)"
cleanup() {
  stop_test_children
  "${psql_base[@]}" -c "delete from public.auth_tokens where user_id = '$USER_ID'; delete from public.users where id = '$USER_ID';" >/dev/null 2>&1 || true
  rm -f ${TEST_TMP_DIR}/password-reset-issue-race-*.log
  cleanup_test_tmp_dir
}
trap cleanup EXIT

PGAPPNAME=password-reset-issue-locker "${psql_base[@]}" -c "begin; select id from public.users where id = '$USER_ID' for update; select pg_sleep(5); commit;" >${TEST_TMP_DIR}/password-reset-issue-race-locker.log 2>&1 &
LOCK_PID=$!
for _ in $(seq 1 80); do
  active="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name = 'password-reset-issue-locker' and position('pg_sleep' in query) > 0")"
  [[ "$active" == "1" ]] && break
  sleep 0.1
done
if [[ "$active" != "1" ]]; then
  echo "Could not confirm password reset issuance lock holder"
  kill "$LOCK_PID" 2>/dev/null || true
  exit 1
fi

PGAPPNAME=password-reset-issuer-one "${psql_base[@]}" -At -c "select public.issue_password_reset_token('$USER_ID', '$HASH_ONE', now() + interval '1 hour', 300)" >${TEST_TMP_DIR}/password-reset-issue-race-one.log 2>&1 &
ONE_PID=$!
PGAPPNAME=password-reset-issuer-two "${psql_base[@]}" -At -c "select public.issue_password_reset_token('$USER_ID', '$HASH_TWO', now() + interval '1 hour', 300)" >${TEST_TMP_DIR}/password-reset-issue-race-two.log 2>&1 &
TWO_PID=$!

waiters=0
for _ in $(seq 1 100); do
  waiters="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name in ('password-reset-issuer-one', 'password-reset-issuer-two') and wait_event_type = 'Lock'")"
  [[ "$waiters" == "2" ]] && break
  sleep 0.1
done
if [[ "$waiters" != "2" ]]; then
  echo "Both password reset issuers did not contend on the account row (waiters=$waiters)"
  kill "$LOCK_PID" 2>/dev/null || true
  exit 1
fi
wait "$LOCK_PID"
wait "$ONE_PID"
wait "$TWO_PID"

RESULT_ONE="$(tr -d '[:space:]' <${TEST_TMP_DIR}/password-reset-issue-race-one.log)"
RESULT_TWO="$(tr -d '[:space:]' <${TEST_TMP_DIR}/password-reset-issue-race-two.log)"
SUCCESS_COUNT=0
[[ "$RESULT_ONE" == "t" ]] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
[[ "$RESULT_TWO" == "t" ]] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
if [[ "$SUCCESS_COUNT" != "1" ]]; then
  echo "Expected exactly one reset-token issuance within cooldown; got '$RESULT_ONE' and '$RESULT_TWO'"
  exit 1
fi

ACTIVE_TOKENS="$("${psql_base[@]}" -At -c "select count(*) from public.auth_tokens where user_id = '$USER_ID' and purpose = 'password_reset' and used_at is null")"
if [[ "$ACTIVE_TOKENS" != "1" ]]; then
  echo "Expected exactly one active reset token; got $ACTIVE_TOKENS"
  exit 1
fi

echo "Concurrent password-reset issuance cooldown passed for user $USER_ID"
