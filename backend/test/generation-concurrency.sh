#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=pinposy_test}"
export PGHOST PGPORT PGUSER PGDATABASE

psql_base=(psql -X -v ON_ERROR_STOP=1 -q)
USER_ID="$("${psql_base[@]}" -At -c "insert into public.users(email, credits_balance, tariff_plan) values ('generation-concurrency-' || gen_random_uuid() || '@example.invalid', 20, 'none') returning id")"
PROJECT_ID="$("${psql_base[@]}" -At -c "insert into public.projects(user_id, niche, tone, language) values ('$USER_ID', 'CI concurrency', 'neutral', 'en') returning id")"
BOARD_ID="$("${psql_base[@]}" -At -c "insert into public.boards(project_id, title, description, status) values ('$PROJECT_ID', 'Generation concurrency', '', 'active') returning id")"
KEY="ci-generation-concurrent-$(printf '%s' "$USER_ID" | tr -d '-')"
FINGERPRINT="$(printf 'f%.0s' {1..64})"

cleanup() {
  "${psql_base[@]}" -c "delete from public.pin_generation_requests where user_id = '$USER_ID'; delete from public.pins where board_id = '$BOARD_ID'; delete from public.boards where id = '$BOARD_ID'; delete from public.projects where id = '$PROJECT_ID'; delete from public.credit_transactions where user_id = '$USER_ID'; delete from public.users where id = '$USER_ID';" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${psql_base[@]}" -c "select public.begin_pin_generation_request('$USER_ID', '$BOARD_ID', '$KEY', '$FINGERPRINT')"
PGAPPNAME=generation-concurrency-locker "${psql_base[@]}" -c "begin; select id from public.pin_generation_requests where user_id = '$USER_ID' and idempotency_key = '$KEY' for update; select pg_sleep(8); commit;" >/tmp/generation-locker.log 2>&1 &
LOCK_PID=$!

locked=0
for _ in $(seq 1 50); do
  active="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name = 'generation-concurrency-locker' and position('pg_sleep' in query) > 0")"
  if [[ "$active" == "1" ]]; then locked=1; break; fi
  sleep 0.1
done
if [[ "$locked" != "1" ]]; then
  echo "Could not confirm the generation request lock holder"
  kill "$LOCK_PID" 2>/dev/null || true
  exit 1
fi

PINS='[{"image_url":"https://cdn.example.invalid/concurrent-generation.png","title":"Concurrent generation","description":"","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":5}]'
PGAPPNAME=generation-completion-one "${psql_base[@]}" -c "select public.complete_pin_generation_request('$USER_ID', '$BOARD_ID', '$KEY', '$PINS'::jsonb, 5)" >/tmp/generation-one.log 2>&1 &
ONE_PID=$!
PGAPPNAME=generation-completion-two "${psql_base[@]}" -c "select public.complete_pin_generation_request('$USER_ID', '$BOARD_ID', '$KEY', '$PINS'::jsonb, 5)" >/tmp/generation-two.log 2>&1 &
TWO_PID=$!

waiters=0
for _ in $(seq 1 80); do
  waiters="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name in ('generation-completion-one', 'generation-completion-two') and wait_event_type = 'Lock'")"
  if [[ "$waiters" == "2" ]]; then break; fi
  sleep 0.1
done
if [[ "$waiters" != "2" ]]; then
  echo "Both completion calls did not contend on the same request row (waiters=$waiters)"
  kill "$LOCK_PID" 2>/dev/null || true
  exit 1
fi

wait "$ONE_PID"
wait "$TWO_PID"
wait "$LOCK_PID"

"${psql_base[@]}" <<SQL
do \$\$
declare
  v_balance integer;
  v_pin_count integer;
  v_ledger_count integer;
  v_request_status text;
begin
  select credits_balance into v_balance from public.users where id = '$USER_ID';
  select count(*) into v_pin_count from public.pins where board_id = '$BOARD_ID' and title = 'Concurrent generation';
  select count(*) into v_ledger_count from public.credit_transactions where user_id = '$USER_ID' and type = 'generation';
  select status into v_request_status from public.pin_generation_requests where user_id = '$USER_ID' and idempotency_key = '$KEY';
  if v_balance <> 15 then
    raise exception 'parallel completion debited balance incorrectly: % (expected 15)', v_balance;
  end if;
  if v_pin_count <> 1 or v_ledger_count <> 1 or v_request_status <> 'completed' then
    raise exception 'parallel completion duplicated pins/ledger or failed to complete (pins %, ledger %, status %)', v_pin_count, v_ledger_count, v_request_status;
  end if;
end;
\$\$;
SQL

echo "Concurrent duplicate generation completion passed for request $KEY"
