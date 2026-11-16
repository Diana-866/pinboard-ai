#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/assert-disposable-postgres.sh"

USER_ID="$("${psql_base[@]}" -At -c "insert into public.users(email, password_hash, email_verified) values ('auth-recovery-race-' || gen_random_uuid() || '@example.invalid', 'old-hash', false) returning id")"
TOKEN_HASH="$(printf '%064d' 0 | tr '0' 'a')"

cleanup() {
  stop_test_children
  "${psql_base[@]}" -c "delete from public.auth_tokens where user_id = '$USER_ID'; delete from public.users where id = '$USER_ID';" >/dev/null 2>&1 || true
  cleanup_test_tmp_dir
}
trap cleanup EXIT

"${psql_base[@]}" -c "select public.issue_password_reset_token('$USER_ID', '$TOKEN_HASH', now() + interval '1 hour', 0)" >/dev/null

# Hold the user row so both independent consumers read the candidate token,
# then queue behind the same user lock before either may consume it.
PGAPPNAME=auth-reset-race-locker "${psql_base[@]}" -c "begin; select id from public.users where id = '$USER_ID' for update; select pg_sleep(6); commit;" >${TEST_TMP_DIR}/auth-reset-race-locker.log 2>&1 &
LOCK_PID=$!

locked=0
for _ in $(seq 1 80); do
  active="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name = 'auth-reset-race-locker' and position('pg_sleep' in query) > 0")"
  if [[ "$active" == "1" ]]; then locked=1; break; fi
  sleep 0.1
done
if [[ "$locked" != "1" ]]; then
  echo "Could not confirm auth reset race lock holder"
  kill "$LOCK_PID" 2>/dev/null || true
  exit 1
fi

PGAPPNAME=auth-reset-consumer-one "${psql_base[@]}" -At -c "select public.consume_password_reset_token('$TOKEN_HASH', repeat('x', 60))" >${TEST_TMP_DIR}/auth-reset-consumer-one.log 2>&1 &
ONE_PID=$!
PGAPPNAME=auth-reset-consumer-two "${psql_base[@]}" -At -c "select public.consume_password_reset_token('$TOKEN_HASH', repeat('y', 60))" >${TEST_TMP_DIR}/auth-reset-consumer-two.log 2>&1 &
TWO_PID=$!

waiters=0
for _ in $(seq 1 100); do
  waiters="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name in ('auth-reset-consumer-one', 'auth-reset-consumer-two') and wait_event_type = 'Lock'")"
  if [[ "$waiters" == "2" ]]; then break; fi
  sleep 0.1
done
if [[ "$waiters" != "2" ]]; then
  echo "Both auth reset consumers did not contend on the user row (waiters=$waiters)"
  kill "$LOCK_PID" 2>/dev/null || true
  exit 1
fi

wait "$ONE_PID"
wait "$TWO_PID"
wait "$LOCK_PID"

RESULT_ONE="$(tr -d '[:space:]' <${TEST_TMP_DIR}/auth-reset-consumer-one.log)"
RESULT_TWO="$(tr -d '[:space:]' <${TEST_TMP_DIR}/auth-reset-consumer-two.log)"
SUCCESS_COUNT=0
[[ "$RESULT_ONE" == "t" ]] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
[[ "$RESULT_TWO" == "t" ]] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
if [[ "$SUCCESS_COUNT" != "1" ]]; then
  echo "Expected exactly one successful reset-token consumer; got '$RESULT_ONE' and '$RESULT_TWO'"
  exit 1
fi

"${psql_base[@]}" <<SQL
do \$\$
declare
  v_user public.users%rowtype;
  v_token public.auth_tokens%rowtype;
begin
  select * into v_user from public.users where id = '$USER_ID';
  select * into v_token from public.auth_tokens where token_hash = '$TOKEN_HASH';
  if v_user.token_version <> 1 then
    raise exception 'concurrent reset incremented token_version % times, expected once', v_user.token_version;
  end if;
  if v_token.used_at is null then
    raise exception 'concurrent reset token was not consumed';
  end if;
  if v_user.password_hash not in (repeat('x', 60), repeat('y', 60)) then
    raise exception 'concurrent reset did not set either submitted password hash';
  end if;
end;
\$\$;
SQL

echo "Concurrent password-reset token consumption passed for user $USER_ID"
