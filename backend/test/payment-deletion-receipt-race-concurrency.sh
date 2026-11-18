#!/usr/bin/env bash
set -euo pipefail

# This test intentionally leaves immutable account-deletion events behind.
# It must run only inside run-disposable-concurrency-suite.sh, which clones
# the migrated fixture and drops that clone on exit.

source "$(dirname "${BASH_SOURCE[0]}")/lib/assert-disposable-postgres.sh"

create_user() {
  USER_ID="$("${psql_base[@]}" -At -c "insert into public.users(email, credits_balance, tariff_plan, account_status, token_version) values ('payment-deletion-race-' || gen_random_uuid() || '@example.invalid', 5, 'none', 'active', 0) returning id")"
  TOKEN_VERSION="$("${psql_base[@]}" -At -c "select coalesce(token_version, 0) from public.users where id = '$USER_ID'")"
  if [[ -z "$USER_ID" || "$TOKEN_VERSION" != "0" ]]; then
    echo "Could not create isolated payment/deletion race user" >&2
    return 1
  fi
}

create_credit_case() {
  create_user
  PURCHASE_ID="$("${psql_base[@]}" -At -c "insert into public.credit_purchases(user_id, package_id, pack_title, credits, status, provider_payment_id, amount, currency) values ('$USER_ID', 'pack_100', 'CI payment/deletion race', 100, 'canceled', 'ci-payment-deletion-' || gen_random_uuid(), 190, 'rub') returning id")"
  RECEIPT_ID="$("${psql_base[@]}" -At -c "select public.record_prodamus_payment_receipt('credits', (select provider_payment_id from public.credit_purchases where id = '$PURCHASE_ID'), 'success', 190, 'rub', repeat(md5(gen_random_uuid()::text), 2))")"
  PAYMENT_SQL="select public.credit_paid_purchase_with_receipt('$PURCHASE_ID', now(), 'payment/deletion race', '$RECEIPT_ID')"
}

create_subscription_case() {
  create_user
  SUBSCRIPTION_ID="$("${psql_base[@]}" -At -c "insert into public.subscriptions(user_id, plan, status, provider_payment_id, amount, currency) values ('$USER_ID', 'pro', 'canceled', 'ci-subscription-deletion-' || gen_random_uuid(), 4990, 'rub') returning id")"
  RECEIPT_ID="$("${psql_base[@]}" -At -c "select public.record_prodamus_payment_receipt('subscription', (select provider_payment_id from public.subscriptions where id = '$SUBSCRIPTION_ID'), 'success', 4990, 'rub', repeat(md5(gen_random_uuid()::text), 2))")"
  PAYMENT_SQL="select public.activate_paid_subscription_with_receipt('$SUBSCRIPTION_ID', now(), '$RECEIPT_ID')"
}

wait_for_query() {
  local application="$1"
  local query_fragment="$2"
  local active=0
  for _ in $(seq 1 100); do
    active="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name = '$application' and position('$query_fragment' in query) > 0")"
    if [[ "$active" == "1" ]]; then return 0; fi
    sleep 0.1
  done
  echo "Timed out waiting for PostgreSQL session '$application' to reach '$query_fragment'" >&2
  return 1
}

wait_for_lock_waiter() {
  local application="$1"
  local active=0
  for _ in $(seq 1 100); do
    active="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name = '$application' and wait_event_type = 'Lock'")"
    if [[ "$active" == "1" ]]; then return 0; fi
    sleep 0.1
  done
  echo "Session '$application' did not block on the account-deletion user lock" >&2
  return 1
}

request_deletion_sql() {
  printf "select public.request_account_deletion('%s', 'password_reauth', %s)" "$USER_ID" "$TOKEN_VERSION"
}

run_payment_first() {
  local label="$1"
  local payment_app="pinposy-${label}-payment-first"
  local deletion_app="pinposy-${label}-deletion-after-payment"

  PGAPPNAME="$payment_app" "${psql_base[@]}" -c "begin; select id from public.users where id = '$USER_ID' for update; select pg_sleep(3); $PAYMENT_SQL; commit;" >"${TEST_TMP_DIR}/${label}-payment-first.log" 2>&1 &
  PAYMENT_LOCK_PID=$!
  wait_for_query "$payment_app" "pg_sleep"

  PGAPPNAME="$deletion_app" "${psql_base[@]}" -c "begin; $(request_deletion_sql); commit;" >"${TEST_TMP_DIR}/${label}-deletion-after-payment.log" 2>&1 &
  DELETION_PID=$!
  wait_for_lock_waiter "$deletion_app"
  wait "$PAYMENT_LOCK_PID"
  wait "$DELETION_PID"
}

run_deletion_first() {
  local label="$1"
  local deletion_app="pinposy-${label}-deletion-first"
  local payment_app="pinposy-${label}-payment-after-deletion"

  PGAPPNAME="$deletion_app" "${psql_base[@]}" -c "begin; $(request_deletion_sql); select pg_sleep(3); commit;" >"${TEST_TMP_DIR}/${label}-deletion-first.log" 2>&1 &
  DELETION_LOCK_PID=$!
  wait_for_query "$deletion_app" "pg_sleep"

  PGAPPNAME="$payment_app" "${psql_base[@]}" -c "$PAYMENT_SQL" >"${TEST_TMP_DIR}/${label}-payment-after-deletion.log" 2>&1 &
  PAYMENT_PID=$!
  wait_for_lock_waiter "$payment_app"
  wait "$DELETION_LOCK_PID"
  wait "$PAYMENT_PID"
}

assert_deletion_request_pending() {
  local count
  count="$("${psql_base[@]}" -At -c "select count(*) from public.account_deletion_requests r join public.account_deletion_jobs j on j.request_id = r.id where r.user_id = '$USER_ID' and r.state = 'pending' and j.step_key = 'preflight' and j.status = 'pending'")"
  [[ "$count" == "1" ]] || { echo "Account-deletion acceptance RPC did not create one pending preflight job" >&2; return 1; }
}

# Credit case A: payment acquires the lifecycle lock first. The actual deletion
# acceptance RPC must wait, then enqueue the deletion request after the grant.
create_credit_case
run_payment_first "credit"
"${psql_base[@]}" <<SQL
do \$\$
declare
  v_balance integer;
  v_status text;
  v_ledger_count integer;
  v_decision text;
begin
  select credits_balance, account_status into v_balance, v_status from public.users where id = '$USER_ID';
  select count(*) into v_ledger_count from public.credit_transactions where purchase_id = '$PURCHASE_ID';
  select decision into v_decision from public.payment_entitlement_decisions where receipt_id = '$RECEIPT_ID';
  if v_balance <> 105 or v_ledger_count <> 1 or v_status <> 'deletion_pending' or v_decision <> 'granted' then
    raise exception 'credit payment-first race failed: balance %, ledger %, status %, decision %', v_balance, v_ledger_count, v_status, v_decision;
  end if;
end;
\$\$;
SQL
assert_deletion_request_pending

# Credit case B: the actual deletion acceptance RPC acquires the lifecycle
# lock first. Receipt-bound credit fulfillment must wait and then be withheld.
create_credit_case
run_deletion_first "credit"
"${psql_base[@]}" <<SQL
do \$\$
declare
  v_balance integer;
  v_status text;
  v_ledger_count integer;
  v_purchase_status text;
  v_decision text;
begin
  select credits_balance, account_status into v_balance, v_status from public.users where id = '$USER_ID';
  select count(*) into v_ledger_count from public.credit_transactions where purchase_id = '$PURCHASE_ID';
  select status into v_purchase_status from public.credit_purchases where id = '$PURCHASE_ID';
  select decision into v_decision from public.payment_entitlement_decisions where receipt_id = '$RECEIPT_ID';
  if v_balance <> 5 or v_ledger_count <> 0 or v_status <> 'deletion_pending'
     or v_purchase_status <> 'canceled' or v_decision <> 'withheld_account_lifecycle' then
    raise exception 'credit deletion-first race failed: balance %, ledger %, status %, purchase %, decision %', v_balance, v_ledger_count, v_status, v_purchase_status, v_decision;
  end if;
end;
\$\$;
SQL
assert_deletion_request_pending

# Subscription case A: subscription fulfillment commits before the deletion
# acceptance RPC can acquire the user lock.
create_subscription_case
run_payment_first "subscription"
"${psql_base[@]}" <<SQL
do \$\$
declare
  v_balance_plan text;
  v_status text;
  v_period_end timestamptz;
  v_decision text;
begin
  select tariff_plan, account_status into v_balance_plan, v_status from public.users where id = '$USER_ID';
  select period_end into v_period_end from public.subscriptions where id = '$SUBSCRIPTION_ID' and status = 'success';
  select decision into v_decision from public.payment_entitlement_decisions where receipt_id = '$RECEIPT_ID';
  if v_balance_plan <> 'pro' or v_status <> 'deletion_pending' or v_period_end is null or v_decision <> 'granted' then
    raise exception 'subscription payment-first race failed: plan %, status %, period %, decision %', v_balance_plan, v_status, v_period_end, v_decision;
  end if;
end;
\$\$;
SQL
assert_deletion_request_pending

# Subscription case B: deletion acceptance commits first; subscription period
# and tariff must remain untouched and the receipt decision is durably withheld.
create_subscription_case
run_deletion_first "subscription"
"${psql_base[@]}" <<SQL
do \$\$
declare
  v_balance_plan text;
  v_status text;
  v_subscription_status text;
  v_decision text;
begin
  select tariff_plan, account_status into v_balance_plan, v_status from public.users where id = '$USER_ID';
  select status into v_subscription_status from public.subscriptions where id = '$SUBSCRIPTION_ID';
  select decision into v_decision from public.payment_entitlement_decisions where receipt_id = '$RECEIPT_ID';
  if v_balance_plan <> 'none' or v_status <> 'deletion_pending'
     or v_subscription_status <> 'canceled' or v_decision <> 'withheld_account_lifecycle' then
    raise exception 'subscription deletion-first race failed: plan %, status %, subscription %, decision %', v_balance_plan, v_status, v_subscription_status, v_decision;
  end if;
end;
\$\$;
SQL
assert_deletion_request_pending

echo "Receipt-bound credit and subscription fulfillment races passed against request_account_deletion in both lock orders"
