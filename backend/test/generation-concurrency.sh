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

# Two retries must not both acquire ownership of the same stale journal-backed
# request. The parent-row lock serializes begin_pin_generation_request claims.
RECOVERY_KEY="ci-generation-recovery-$(printf '%s' "$USER_ID" | tr -d '-')"
RECOVERY_FINGERPRINT="$(printf 'e%.0s' {1..64})"
"${psql_base[@]}" -c "select public.begin_pin_generation_request('$USER_ID', '$BOARD_ID', '$RECOVERY_KEY', '$RECOVERY_FINGERPRINT')" >/dev/null
OLD_RECOVERY_TOKEN="$("${psql_base[@]}" -At -c "select claim_token from public.pin_generation_requests where user_id = '$USER_ID' and idempotency_key = '$RECOVERY_KEY'")"
"${psql_base[@]}" -c "select public.save_pin_generation_plan('$USER_ID', '$RECOVERY_KEY', (select claim_token from public.pin_generation_requests where user_id = '$USER_ID' and idempotency_key = '$RECOVERY_KEY'), '[{\"title\":\"Recovery task\",\"description\":\"\",\"prompt\":\"A test image\",\"model\":\"flux-schnell\",\"aspect_ratio\":\"2:3\"}]'::jsonb)" >/dev/null
"${psql_base[@]}" -c "update public.pin_generation_requests set updated_at = now() - interval '31 minutes' where user_id = '$USER_ID' and idempotency_key = '$RECOVERY_KEY'" >/dev/null

PGAPPNAME=generation-recovery-locker "${psql_base[@]}" -c "begin; select id from public.pin_generation_requests where user_id = '$USER_ID' and idempotency_key = '$RECOVERY_KEY' for update; select pg_sleep(6); commit;" >/tmp/generation-recovery-locker.log 2>&1 &
RECOVERY_LOCK_PID=$!
recovery_locked=0
for _ in $(seq 1 50); do
  active="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name = 'generation-recovery-locker' and position('pg_sleep' in query) > 0")"
  if [[ "$active" == "1" ]]; then recovery_locked=1; break; fi
  sleep 0.1
done
if [[ "$recovery_locked" != "1" ]]; then
  echo "Could not confirm the recovery request lock holder"
  kill "$RECOVERY_LOCK_PID" 2>/dev/null || true
  exit 1
fi

PGAPPNAME=generation-recovery-one "${psql_base[@]}" -At -c "select public.begin_pin_generation_request('$USER_ID', '$BOARD_ID', '$RECOVERY_KEY', '$RECOVERY_FINGERPRINT')->>'status'" >/tmp/generation-recovery-one.log 2>&1 &
RECOVERY_ONE_PID=$!
PGAPPNAME=generation-recovery-two "${psql_base[@]}" -At -c "select public.begin_pin_generation_request('$USER_ID', '$BOARD_ID', '$RECOVERY_KEY', '$RECOVERY_FINGERPRINT')->>'status'" >/tmp/generation-recovery-two.log 2>&1 &
RECOVERY_TWO_PID=$!

recovery_waiters=0
for _ in $(seq 1 80); do
  recovery_waiters="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name in ('generation-recovery-one', 'generation-recovery-two') and wait_event_type = 'Lock'")"
  if [[ "$recovery_waiters" == "2" ]]; then break; fi
  sleep 0.1
done
if [[ "$recovery_waiters" != "2" ]]; then
  echo "Both recovery claims did not contend on the same request row (waiters=$recovery_waiters)"
  kill "$RECOVERY_LOCK_PID" 2>/dev/null || true
  exit 1
fi

wait "$RECOVERY_ONE_PID"
wait "$RECOVERY_TWO_PID"
wait "$RECOVERY_LOCK_PID"
recovery_resume_count="$(grep -xc 'resume' /tmp/generation-recovery-one.log || true)"
recovery_processing_count="$(grep -xc 'processing' /tmp/generation-recovery-one.log || true)"
recovery_resume_count=$((recovery_resume_count + $(grep -xc 'resume' /tmp/generation-recovery-two.log || true)))
recovery_processing_count=$((recovery_processing_count + $(grep -xc 'processing' /tmp/generation-recovery-two.log || true)))
if [[ "$recovery_resume_count" != "1" || "$recovery_processing_count" != "1" ]]; then
  echo "Expected exactly one recovery owner and one processing response; got resume=$recovery_resume_count processing=$recovery_processing_count"
  cat /tmp/generation-recovery-one.log /tmp/generation-recovery-two.log
  exit 1
fi
echo "Concurrent stale generation recovery claim passed for request $RECOVERY_KEY"

# The pre-recovery owner must not mutate the journal or complete/charge after
# a newer recovery claim has rotated the fencing token.
NEW_RECOVERY_TOKEN="$("${psql_base[@]}" -At -c "select claim_token from public.pin_generation_requests where user_id = '$USER_ID' and idempotency_key = '$RECOVERY_KEY'")"
if [[ -z "$OLD_RECOVERY_TOKEN" || -z "$NEW_RECOVERY_TOKEN" || "$OLD_RECOVERY_TOKEN" == "$NEW_RECOVERY_TOKEN" ]]; then
  echo "Recovery did not rotate the generation claim token"
  exit 1
fi
if "${psql_base[@]}" -c "select public.update_pin_generation_task('$USER_ID', '$RECOVERY_KEY', '$OLD_RECOVERY_TOKEN', 1, 'submitting')" >/tmp/generation-stale-owner-update.log 2>&1; then
  echo "Stale generation owner unexpectedly updated the task journal"
  exit 1
fi
STALE_PINS='[{"image_url":"https://cdn.example.invalid/stale-owner.png","title":"Stale owner","description":"","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":5}]'
STALE_PLAN='[{"title":"stale","description":"","prompt":"stale prompt","model":"flux-schnell","aspect_ratio":"2:3"}]'
if "${psql_base[@]}" -c "select public.save_pin_generation_plan('$USER_ID', '$RECOVERY_KEY', '$OLD_RECOVERY_TOKEN', '$STALE_PLAN'::jsonb)" >/tmp/generation-stale-owner-plan.log 2>&1; then
  echo "Stale generation owner unexpectedly rewrote the immutable plan"
  exit 1
fi
if "${psql_base[@]}" -c "select public.fail_pin_generation_request('$USER_ID', '$RECOVERY_KEY', '$OLD_RECOVERY_TOKEN', 'stale_failure', false)" >/tmp/generation-stale-owner-fail.log 2>&1; then
  echo "Stale generation owner unexpectedly marked the request failed"
  exit 1
fi
if "${psql_base[@]}" -c "select public.complete_pin_generation_request('$USER_ID', '$BOARD_ID', '$RECOVERY_KEY', '$OLD_RECOVERY_TOKEN', '$STALE_PINS'::jsonb, 5)" >/tmp/generation-stale-owner-complete.log 2>&1; then
  echo "Stale generation owner unexpectedly completed and charged"
  exit 1
fi
"${psql_base[@]}" -c "select public.update_pin_generation_task('$USER_ID', '$RECOVERY_KEY', '$NEW_RECOVERY_TOKEN', 1, 'submitting')" >/dev/null
BALANCE_AFTER_STALE="$("${psql_base[@]}" -At -c "select credits_balance from public.users where id = '$USER_ID'")"
STALE_PIN_COUNT="$("${psql_base[@]}" -At -c "select count(*) from public.pins where board_id = '$BOARD_ID' and title = 'Stale owner'")"
if [[ "$BALANCE_AFTER_STALE" != "20" || "$STALE_PIN_COUNT" != "0" ]]; then
  echo "Stale generation owner changed financial state (balance=$BALANCE_AFTER_STALE pins=$STALE_PIN_COUNT)"
  exit 1
fi
echo "Stale generation owner fencing passed for request $RECOVERY_KEY"


"${psql_base[@]}" -c "select public.begin_pin_generation_request('$USER_ID', '$BOARD_ID', '$KEY', '$FINGERPRINT')"\n"${psql_base[@]}" -c "select public.reserve_pin_generation_credits('$USER_ID', '$KEY', 5)" >/dev/null
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
PGAPPNAME=generation-completion-one "${psql_base[@]}" -c "select public.complete_pin_generation_request('$USER_ID', '$BOARD_ID', '$KEY', (select claim_token from public.pin_generation_requests where user_id = '$USER_ID' and idempotency_key = '$KEY'), '$PINS'::jsonb, 5)" >/tmp/generation-one.log 2>&1 &
ONE_PID=$!
PGAPPNAME=generation-completion-two "${psql_base[@]}" -c "select public.complete_pin_generation_request('$USER_ID', '$BOARD_ID', '$KEY', (select claim_token from public.pin_generation_requests where user_id = '$USER_ID' and idempotency_key = '$KEY'), '$PINS'::jsonb, 5)" >/tmp/generation-two.log 2>&1 &
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

# Race a terminal failure marker against completion while both contend on the
# same request row. Either winner is valid, but mixed terminal/financial state
# is not: failed means no pins/debit; completed means exactly one of each.
RACE_KEY="ci-generation-fail-complete-$(printf '%s' "$USER_ID" | tr -d '-')"
RACE_FINGERPRINT="$(printf 'a%.0s' {1..64})"
"${psql_base[@]}" -c "select public.begin_pin_generation_request('$USER_ID', '$BOARD_ID', '$RACE_KEY', '$RACE_FINGERPRINT')"\n"${psql_base[@]}" -c "select public.reserve_pin_generation_credits('$USER_ID', '$RACE_KEY', 5)" >/dev/null
PGAPPNAME=generation-race-locker "${psql_base[@]}" -c "begin; select id from public.pin_generation_requests where user_id = '$USER_ID' and idempotency_key = '$RACE_KEY' for update; select pg_sleep(6); commit;" >/tmp/generation-race-locker.log 2>&1 &
RACE_LOCK_PID=$!

race_locked=0
for _ in $(seq 1 50); do
  active="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name = 'generation-race-locker' and position('pg_sleep' in query) > 0")"
  if [[ "$active" == "1" ]]; then race_locked=1; break; fi
  sleep 0.1
done
if [[ "$race_locked" != "1" ]]; then
  echo "Could not confirm the failure/completion race lock holder"
  kill "$RACE_LOCK_PID" 2>/dev/null || true
  exit 1
fi

PGAPPNAME=generation-race-failure "${psql_base[@]}" -c "select public.fail_pin_generation_request('$USER_ID', '$RACE_KEY', (select claim_token from public.pin_generation_requests where user_id = '$USER_ID' and idempotency_key = '$RACE_KEY'), 'simulated_race_failure', false)" >/tmp/generation-race-failure.log 2>&1 &
RACE_FAIL_PID=$!
PGAPPNAME=generation-race-completion "${psql_base[@]}" -c "select public.complete_pin_generation_request('$USER_ID', '$BOARD_ID', '$RACE_KEY', (select claim_token from public.pin_generation_requests where user_id = '$USER_ID' and idempotency_key = '$RACE_KEY'), '$PINS'::jsonb, 5)" >/tmp/generation-race-completion.log 2>&1 &
RACE_COMPLETE_PID=$!

race_waiters=0
for _ in $(seq 1 80); do
  race_waiters="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name in ('generation-race-failure', 'generation-race-completion') and wait_event_type = 'Lock'")"
  if [[ "$race_waiters" == "2" ]]; then break; fi
  sleep 0.1
done
if [[ "$race_waiters" != "2" ]]; then
  echo "Failure and completion did not both contend on the same request row (waiters=$race_waiters)"
  kill "$RACE_LOCK_PID" 2>/dev/null || true
  exit 1
fi

wait "$RACE_LOCK_PID"
wait "$RACE_FAIL_PID" || true
wait "$RACE_COMPLETE_PID" || true

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
  select status into v_request_status from public.pin_generation_requests where user_id = '$USER_ID' and idempotency_key = '$RACE_KEY';

  if v_request_status = 'failed' then
    if v_balance <> 15 or v_pin_count <> 1 or v_ledger_count <> 1 then
      raise exception 'failure won race but completion still charged/saved (balance %, pins %, ledger %)', v_balance, v_pin_count, v_ledger_count;
    end if;
  elsif v_request_status = 'completed' then
    if v_balance <> 10 or v_pin_count <> 2 or v_ledger_count <> 2 then
      raise exception 'completion won race but final state is inconsistent (balance %, pins %, ledger %)', v_balance, v_pin_count, v_ledger_count;
    end if;
  else
    raise exception 'failure/completion race ended in unexpected status %', v_request_status;
  end if;
end;
\$\$;
SQL

echo "Concurrent failure/completion terminal-state race passed for request $RACE_KEY"

