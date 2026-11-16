#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/assert-disposable-postgres.sh"

USER_ID="$("${psql_base[@]}" -At -c "insert into public.users(email, password_hash, email_verified) values ('email-verify-race-' || gen_random_uuid() || '@example.invalid', 'test-hash', false) returning id")"
ISSUE_HASH_ONE="$(openssl rand -hex 32)"
ISSUE_HASH_TWO="$(openssl rand -hex 32)"

cleanup() {
  stop_test_children
  "${psql_base[@]}" -c "delete from public.auth_tokens where user_id = '$USER_ID'; delete from public.users where id = '$USER_ID';" >/dev/null 2>&1 || true
  rm -f ${TEST_TMP_DIR}/email-verify-race-*.log
  cleanup_test_tmp_dir
}
trap cleanup EXIT

wait_for_two_lock_waiters() {
  local one="$1" two="$2"
  for _ in $(seq 1 100); do
    local waiters
    waiters="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name in ('$one', '$two') and wait_event_type = 'Lock'")"
    [[ "$waiters" == "2" ]] && return 0
    sleep 0.1
  done
  echo "Both email verification sessions did not contend on the user row"
  return 1
}

start_user_lock() {
  local app="$1"
  PGAPPNAME="$app" "${psql_base[@]}" -c "begin; select id from public.users where id = '$USER_ID' for update; select pg_sleep(4); commit;" >"${TEST_TMP_DIR}/email-verify-race-$app.log" 2>&1 &
  LOCK_PID=$!
  for _ in $(seq 1 80); do
    local active
    active="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name = '$app' and position('pg_sleep' in query) > 0")"
    [[ "$active" == "1" ]] && return 0
    sleep 0.1
  done
  echo "Could not confirm user-row lock holder ($app)"
  kill "$LOCK_PID" 2>/dev/null || true
  return 1
}

# Two independent issuers queue behind the same account lock. Only the first
# may issue a token; the second must observe its creation and respect cooldown.
start_user_lock "email-verify-issue-locker"
PGAPPNAME=email-verify-issuer-one "${psql_base[@]}" -At -c "select public.issue_email_verification_token('$USER_ID', '$ISSUE_HASH_ONE', now() + interval '24 hours', 300)" >${TEST_TMP_DIR}/email-verify-race-issuer-one.log 2>&1 &
ONE_PID=$!
PGAPPNAME=email-verify-issuer-two "${psql_base[@]}" -At -c "select public.issue_email_verification_token('$USER_ID', '$ISSUE_HASH_TWO', now() + interval '24 hours', 300)" >${TEST_TMP_DIR}/email-verify-race-issuer-two.log 2>&1 &
TWO_PID=$!
wait_for_two_lock_waiters "email-verify-issuer-one" "email-verify-issuer-two"
wait "$LOCK_PID"
wait "$ONE_PID"
wait "$TWO_PID"

ISSUE_ONE="$(tr -d '[:space:]' <${TEST_TMP_DIR}/email-verify-race-issuer-one.log)"
ISSUE_TWO="$(tr -d '[:space:]' <${TEST_TMP_DIR}/email-verify-race-issuer-two.log)"
ISSUE_SUCCESS=0
[[ "$ISSUE_ONE" == "t" ]] && ISSUE_SUCCESS=$((ISSUE_SUCCESS + 1))
[[ "$ISSUE_TWO" == "t" ]] && ISSUE_SUCCESS=$((ISSUE_SUCCESS + 1))
if [[ "$ISSUE_SUCCESS" != "1" ]]; then
  echo "Expected exactly one verification token issuance; got '$ISSUE_ONE' and '$ISSUE_TWO'"
  exit 1
fi

ACTIVE_TOKENS="$("${psql_base[@]}" -At -c "select count(*) from public.auth_tokens where user_id = '$USER_ID' and purpose = 'email_verify' and used_at is null")"
if [[ "$ACTIVE_TOKENS" != "1" ]]; then
  echo "Expected exactly one active verification token; got $ACTIVE_TOKENS"
  exit 1
fi

# Two consumers of the winning token must serialize on the same user row.
# The second click is intentionally idempotent and may also return true.
LIVE_HASH="$ISSUE_HASH_ONE"
[[ "$ISSUE_TWO" == "t" ]] && LIVE_HASH="$ISSUE_HASH_TWO"
start_user_lock "email-verify-consume-locker"
PGAPPNAME=email-verify-consumer-one "${psql_base[@]}" -At -c "select public.consume_email_verification_token('$LIVE_HASH')" >${TEST_TMP_DIR}/email-verify-race-consumer-one.log 2>&1 &
ONE_PID=$!
PGAPPNAME=email-verify-consumer-two "${psql_base[@]}" -At -c "select public.consume_email_verification_token('$LIVE_HASH')" >${TEST_TMP_DIR}/email-verify-race-consumer-two.log 2>&1 &
TWO_PID=$!
wait_for_two_lock_waiters "email-verify-consumer-one" "email-verify-consumer-two"
wait "$LOCK_PID"
wait "$ONE_PID"
wait "$TWO_PID"

CONSUME_ONE="$(tr -d '[:space:]' <${TEST_TMP_DIR}/email-verify-race-consumer-one.log)"
CONSUME_TWO="$(tr -d '[:space:]' <${TEST_TMP_DIR}/email-verify-race-consumer-two.log)"
if [[ "$CONSUME_ONE" != "t" || "$CONSUME_TWO" != "t" ]]; then
  echo "Expected both serialized verification clicks to return idempotent success; got '$CONSUME_ONE' and '$CONSUME_TWO'"
  exit 1
fi

"${psql_base[@]}" <<SQL
do \$\$
declare
  v_user public.users%rowtype;
  v_token public.auth_tokens%rowtype;
  v_active integer;
begin
  select * into v_user from public.users where id = '$USER_ID';
  select * into v_token from public.auth_tokens where token_hash = '$LIVE_HASH';
  select count(*) into v_active from public.auth_tokens
   where user_id = '$USER_ID' and purpose = 'email_verify' and used_at is null;
  if v_user.email_verified is distinct from true then
    raise exception 'concurrent verification did not verify the account';
  end if;
  if v_token.used_at is null then
    raise exception 'concurrent verification did not consume the token';
  end if;
  if v_active <> 0 then
    raise exception 'expected no active verification tokens after consume, got %', v_active;
  end if;
end;
\$\$;
SQL

echo "Concurrent email-verification issuance and consumption passed for user $USER_ID"
