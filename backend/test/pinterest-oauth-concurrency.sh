#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=pinposy_test}"
export PGHOST PGPORT PGUSER PGDATABASE

psql_base=(psql -X -v ON_ERROR_STOP=1 -q)
USER_ID="$("${psql_base[@]}" -At -c "insert into public.users(email, tariff_plan) values ('pinterest-oauth-race-' || gen_random_uuid() || '@example.invalid', 'start') returning id")"
ATTEMPT_ID="$("${psql_base[@]}" -At -c "select gen_random_uuid()")"
EXTERNAL_ID="oauth-race-$USER_ID"

cleanup() {
  "${psql_base[@]}" -c "delete from public.pinterest_accounts where user_id = '$USER_ID'; delete from public.pinterest_oauth_connection_state where user_id = '$USER_ID'; delete from public.users where id = '$USER_ID';" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Establish one existing account, then begin a reconnect attempt for that identity.
INITIAL_ATTEMPT="$("${psql_base[@]}" -At -c "select gen_random_uuid()")"
INITIAL_GENERATION="$("${psql_base[@]}" -At -c "select public.begin_pinterest_oauth_attempt('$USER_ID', '$INITIAL_ATTEMPT', 0)")"
"${psql_base[@]}" -c "select public.commit_pinterest_oauth_attempt_v2('$USER_ID', '$INITIAL_ATTEMPT', $INITIAL_GENERATION, 0, '$EXTERNAL_ID', 'oauth_race', 'access-before', 'refresh-before', 'boards:read,pins:write', now() + interval '1 hour')" >/dev/null

GENERATION="$("${psql_base[@]}" -At -c "select public.begin_pinterest_oauth_attempt('$USER_ID', '$ATTEMPT_ID', 0)")"

# Hold the shared OAuth state row so callback and disconnect become real,
# independent concurrent contenders instead of merely sequential replays.
PGAPPNAME=pinterest-oauth-race-locker "${psql_base[@]}" -c "begin; select user_id from public.pinterest_oauth_connection_state where user_id = '$USER_ID' for update; select pg_sleep(6); commit;" >/tmp/pinterest-oauth-race-locker.log 2>&1 &
LOCK_PID=$!

locked=0
for _ in $(seq 1 80); do
  active="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name = 'pinterest-oauth-race-locker' and position('pg_sleep' in query) > 0")"
  if [[ "$active" == "1" ]]; then locked=1; break; fi
  sleep 0.1
done
if [[ "$locked" != "1" ]]; then
  echo "Could not confirm OAuth race lock holder"
  kill "$LOCK_PID" 2>/dev/null || true
  exit 1
fi

PGAPPNAME=pinterest-oauth-race-callback "${psql_base[@]}" -At -c "select public.commit_pinterest_oauth_attempt_v2('$USER_ID', '$ATTEMPT_ID', $GENERATION, 0, '$EXTERNAL_ID', 'oauth_race_reconnected', 'access-after', 'refresh-after', 'boards:read,pins:write', now() + interval '1 hour')" >/tmp/pinterest-oauth-race-callback.log 2>&1 &
CALLBACK_PID=$!
PGAPPNAME=pinterest-oauth-race-disconnect "${psql_base[@]}" -At -c "select public.disconnect_pinterest_account_v2('$USER_ID', (select id from public.pinterest_accounts where user_id = '$USER_ID' and pinterest_user_id = '$EXTERNAL_ID'))" >/tmp/pinterest-oauth-race-disconnect.log 2>&1 &
DISCONNECT_PID=$!

waiters=0
for _ in $(seq 1 100); do
  waiters="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name in ('pinterest-oauth-race-callback', 'pinterest-oauth-race-disconnect') and wait_event_type = 'Lock')"
  if [[ "$waiters" == "2" ]]; then break; fi
  sleep 0.1
done
if [[ "$waiters" != "2" ]]; then
  echo "OAuth callback and disconnect did not both contend on the state row (waiters=$waiters)"
  kill "$LOCK_PID" 2>/dev/null || true
  exit 1
fi

wait "$CALLBACK_PID"
wait "$DISCONNECT_PID"
wait "$LOCK_PID"

DISCONNECT_RESULT="$(tr -d '[:space:]' </tmp/pinterest-oauth-race-disconnect.log)"
if [[ "$DISCONNECT_RESULT" != "t" ]]; then
  echo "Expected disconnect to win eventually and return true; got: $DISCONNECT_RESULT"
  cat /tmp/pinterest-oauth-race-callback.log
  exit 1
fi

"${psql_base[@]}" <<SQL
do \$\$
declare
  v_disconnected_at timestamptz;
  v_access_token text;
  v_refresh_token text;
  v_state_attempt uuid;
begin
  select disconnected_at, access_token, refresh_token
    into v_disconnected_at, v_access_token, v_refresh_token
    from public.pinterest_accounts
   where user_id = '$USER_ID'
     and pinterest_user_id = '$EXTERNAL_ID';

  if not found or v_disconnected_at is null
     or v_access_token is not null or v_refresh_token is not null then
    raise exception 'OAuth callback resurrected credentials after disconnect';
  end if;

  select current_attempt_id into v_state_attempt
    from public.pinterest_oauth_connection_state
   where user_id = '$USER_ID';
  if v_state_attempt is not null then
    raise exception 'disconnect left an OAuth attempt active';
  end if;
end;
\$\$;
SQL

echo "Concurrent Pinterest OAuth callback/disconnect fencing passed for user $USER_ID"
