#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/assert-disposable-postgres.sh"

USER_ID="$("${psql_base[@]}" -At -c "insert into public.users(email, credits_balance, tariff_plan) values ('subscription-concurrency-' || gen_random_uuid() || '@example.invalid', 0, 'none') returning id")"
OLDER_ID="$("${psql_base[@]}" -At -c "insert into public.subscriptions(user_id, plan, status, provider_payment_id, amount, currency, created_at) values ('$USER_ID', 'start', 'pending', 'ci-concurrent-old-' || gen_random_uuid(), 1990, 'rub', now() - interval '2 minutes') returning id")"
NEWER_ID="$("${psql_base[@]}" -At -c "insert into public.subscriptions(user_id, plan, status, provider_payment_id, amount, currency, created_at) values ('$USER_ID', 'pro', 'pending', 'ci-concurrent-new-' || gen_random_uuid(), 4990, 'rub', now() - interval '1 minute') returning id")"

cleanup() {
  stop_test_children
  "${psql_base[@]}" -c "delete from public.email_outbox where subscription_id in (select id from public.subscriptions where user_id = '$USER_ID'); delete from public.subscriptions where user_id = '$USER_ID'; delete from public.users where id = '$USER_ID';" >/dev/null 2>&1 || true
  cleanup_test_tmp_dir
}
trap cleanup EXIT

# Hold the user row lock until both independent webhook transactions are waiting.
PGAPPNAME=subscription-concurrency-locker "${psql_base[@]}" -c "begin; select id from public.users where id = '$USER_ID' for update; select pg_sleep(8); commit;" >${TEST_TMP_DIR}/subscription-locker.log 2>&1 &
LOCK_PID=$!

locked=0
for _ in $(seq 1 50); do
  active="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name = 'subscription-concurrency-locker' and position('pg_sleep' in query) > 0")"
  if [[ "$active" == "1" ]]; then locked=1; break; fi
  sleep 0.1
done
if [[ "$locked" != "1" ]]; then
  echo "Could not confirm the concurrency test lock holder"
  kill "$LOCK_PID" 2>/dev/null || true
  exit 1
fi

# Start both webhook transactions while the user row is locked. Then wait
# until PostgreSQL confirms that both are blocked on that exact lock.
PGAPPNAME=subscription-webhook-older "${psql_base[@]}" -c "select public.activate_paid_subscription('$OLDER_ID', now())" >${TEST_TMP_DIR}/subscription-older.log 2>&1 &
OLDER_PID=$!
PGAPPNAME=subscription-webhook-newer "${psql_base[@]}" -c "select public.activate_paid_subscription('$NEWER_ID', now())" >${TEST_TMP_DIR}/subscription-newer.log 2>&1 &
NEWER_PID=$!

waiters=0
for _ in $(seq 1 80); do
  waiters="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name in ('subscription-webhook-older', 'subscription-webhook-newer') and wait_event_type = 'Lock'")"
  if [[ "$waiters" == "2" ]]; then break; fi
  sleep 0.1
done
if [[ "$waiters" != "2" ]]; then
  echo "Both concurrent webhook sessions did not reach the row lock (waiters=$waiters)"
  kill "$LOCK_PID" "$OLDER_PID" "$NEWER_PID" 2>/dev/null || true
  exit 1
fi

wait "$OLDER_PID"
wait "$NEWER_PID"
wait "$LOCK_PID"

"${psql_base[@]}" <<SQL
do \$\$
declare
  v_user public.users%rowtype;
  v_old public.subscriptions%rowtype;
  v_new public.subscriptions%rowtype;
begin
  select * into v_user from public.users where id = '$USER_ID';
  select * into v_old from public.subscriptions where id = '$OLDER_ID';
  select * into v_new from public.subscriptions where id = '$NEWER_ID';

  if v_user.tariff_plan <> 'pro' then
    raise exception 'concurrent activation selected stale plan: %', v_user.tariff_plan;
  end if;
  if v_old.status <> 'success' or v_new.status <> 'success' then
    raise exception 'both concurrent paid orders must be successful';
  end if;
  if v_user.tariff_period_end is distinct from greatest(v_old.period_end, v_new.period_end) then
    raise exception 'user entitlement end does not match the last serialized payment';
  end if;
  if not (
    abs(extract(epoch from (v_old.period_start - v_new.period_end))) < 1
    or abs(extract(epoch from (v_new.period_start - v_old.period_end))) < 1
  ) then
    raise exception 'concurrent paid periods are not serialized without overlap';
  end if;
end;
\$\$;
SQL

echo "Concurrent subscription activation passed for user $USER_ID"
