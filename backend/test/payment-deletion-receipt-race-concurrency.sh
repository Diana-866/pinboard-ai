#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/assert-disposable-postgres.sh"

create_case() {
  local label="$1"
  USER_ID="$("${psql_base[@]}" -At -c "insert into public.users(email, credits_balance, tariff_plan, account_status, token_version) values ('payment-deletion-race-' || gen_random_uuid() || '@example.invalid', 5, 'none', 'active', 0) returning id")"
  TOKEN_VERSION="$("${psql_base[@]}" -At -c "select coalesce(token_version, 0) from public.users where id = '$USER_ID'")"
  PURCHASE_ID="$("${psql_base[@]}" -At -c "insert into public.credit_purchases(user_id, package_id, pack_title, credits, status, provider_payment_id, amount, currency) values ('$USER_ID', 'pack_100', 'CI payment/deletion race', 100, 'canceled', 'ci-payment-deletion-credit-' || gen_random_uuid(), 190, 'rub') returning id")"
  SUBSCRIPTION_ID="$("${psql_base[@]}" -At -c "insert into public.subscriptions(user_id, plan, status, provider_payment_id, amount, currency) values ('$USER_ID', 'pro', 'canceled', 'ci-payment-deletion-subscription-' || gen_random_uuid(), 4990, 'rub') returning id")"
  CREDIT_RECEIPT_ID="$("${psql_base[@]}" -At -c "select public.record_prodamus_payment_receipt('credits', (select provider_payment_id from public.credit_purchases where id = '$PURCHASE_ID'), 'success', 190, 'rub', repeat(md5(gen_random_uuid()::text), 2))")"
  SUBSCRIPTION_RECEIPT_ID="$("${psql_base[@]}" -At -c "select public.record_prodamus_payment_receipt('subscription', (select provider_payment_id from public.subscriptions where id = '$SUBSCRIPTION_ID'), 'success', 4990, 'rub', repeat(md5(gen_random_uuid()::text), 2))")"
  if [[ -z "$USER_ID" || "$TOKEN_VERSION" != "0" || -z "$PURCHASE_ID" || -z "$SUBSCRIPTION_ID" || -z "$CREDIT_RECEIPT_ID" || -z "$SUBSCRIPTION_RECEIPT_ID" ]]; then
    echo "Could not create isolated $label payment/deletion race fixtures" >&2
    return 1
  fi
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
  echo "Session '$application' did not block on the account lifecycle row lock" >&2
  return 1
}

wait_for_two_lock_waiters() {
  local active=0
  for _ in $(seq 1 100); do
    active="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name in ('payment-after-deletion-credit', 'payment-after-deletion-subscription') and wait_event_type = 'Lock'")"
    if [[ "$active" == "2" ]]; then return 0; fi
    sleep 0.1
  done
  echo "Both credit and subscription fulfillment sessions did not wait on the lifecycle row lock (waiters=$active)" >&2
  return 1
}

cleanup() {
  stop_test_children
  cleanup_test_tmp_dir
}
trap cleanup EXIT

# Case A: one payment transaction owns the user lifecycle lock and commits both
# receipt-bound entitlements before the real deletion acceptance RPC can proceed.
create_case "payment-first"
PGAPPNAME=payment-deletion-payment-first-locker "${psql_base[@]}" -c "begin; select id from public.users where id = '$USER_ID' for update; select public.credit_paid_purchase_with_receipt('$PURCHASE_ID', now(), 'payment won deletion race', '$CREDIT_RECEIPT_ID'); select public.activate_paid_subscription_with_receipt('$SUBSCRIPTION_ID', now(), '$SUBSCRIPTION_RECEIPT_ID'); select pg_sleep(5); commit;" >"${TEST_TMP_DIR}/payment-first-locker.log" 2>&1 &
PAYMENT_LOCK_PID=$!
wait_for_query "payment-deletion-payment-first-locker" "pg_sleep"

PGAPPNAME=payment-deletion-after-payment "${psql_base[@]}" -c "select public.request_account_deletion('$USER_ID', 'password_reauth', $TOKEN_VERSION)" >"${TEST_TMP_DIR}/payment-first-deletion.log" 2>&1 &
DELETION_PID=$!
wait_for_lock_waiter "payment-deletion-after-payment"
wait "$PAYMENT_LOCK_PID"
wait "$DELETION_PID"

"${psql_base[@]}" <<SQL
do \$\$
declare
  v_balance integer;
  v_status text;
  v_token_version bigint;
  v_ledger_count integer;
  v_credit_decision text;
  v_subscription_decision text;
  v_request_state text;
  v_request_version bigint;
  v_event_count integer;
  v_sub public.subscriptions%rowtype;
begin
  select credits_balance, account_status, token_version
    into v_balance, v_status, v_token_version
    from public.users where id = '$USER_ID';
  select count(*) into v_ledger_count
    from public.credit_transactions where purchase_id = '$PURCHASE_ID';
  select decision into v_credit_decision
    from public.payment_entitlement_decisions where receipt_id = '$CREDIT_RECEIPT_ID';
  select decision into v_subscription_decision
    from public.payment_entitlement_decisions where receipt_id = '$SUBSCRIPTION_RECEIPT_ID';
  select state, token_version into v_request_state, v_request_version
    from public.account_deletion_requests where user_id = '$USER_ID';
  select count(*) into v_event_count from public.account_deletion_events e
   join public.account_deletion_requests r on r.id = e.request_id
   where r.user_id = '$USER_ID' and e.event_key = 'request_accepted';
  select * into v_sub from public.subscriptions where id = '$SUBSCRIPTION_ID';

  if v_balance <> 105 or v_ledger_count <> 1 or v_status <> 'deletion_pending'
     or v_token_version <> 1 or v_request_state <> 'pending'
     or v_request_version <> 1 or v_request_version <> v_token_version or v_event_count <> 1
     or v_credit_decision <> 'granted'
     or v_subscription_decision <> 'granted'
     or v_sub.status <> 'success' or v_sub.period_end is null then
    raise exception 'payment-first race was not serialized: balance %, ledger %, status %, token %, request %, credit decision %, subscription decision %, subscription %',
      v_balance, v_ledger_count, v_status, v_token_version, v_request_state,
      v_credit_decision, v_subscription_decision, v_sub.status;
  end if;
end;
\$\$;
SQL
USER_ID=""
PURCHASE_ID=""
SUBSCRIPTION_ID=""
CREDIT_RECEIPT_ID=""
SUBSCRIPTION_RECEIPT_ID=""

# Case B: the actual request_account_deletion RPC owns and commits the lifecycle
# fence first. Both independent receipt-bound fulfillment RPCs must wait, then
# durably withhold without changing either entitlement.
create_case "deletion-first"
PGAPPNAME=payment-deletion-deletion-first-locker "${psql_base[@]}" -c "begin; select public.request_account_deletion('$USER_ID', 'password_reauth', $TOKEN_VERSION); select pg_sleep(5); commit;" >"${TEST_TMP_DIR}/deletion-first-locker.log" 2>&1 &
DELETION_LOCK_PID=$!
wait_for_query "payment-deletion-deletion-first-locker" "pg_sleep"

PGAPPNAME=payment-after-deletion-credit "${psql_base[@]}" -c "select public.credit_paid_purchase_with_receipt('$PURCHASE_ID', now(), 'payment lost deletion race', '$CREDIT_RECEIPT_ID')" >"${TEST_TMP_DIR}/deletion-first-credit.log" 2>&1 &
CREDIT_PID=$!
PGAPPNAME=payment-after-deletion-subscription "${psql_base[@]}" -c "select public.activate_paid_subscription_with_receipt('$SUBSCRIPTION_ID', now(), '$SUBSCRIPTION_RECEIPT_ID')" >"${TEST_TMP_DIR}/deletion-first-subscription.log" 2>&1 &
SUBSCRIPTION_PID=$!
wait_for_two_lock_waiters
wait "$DELETION_LOCK_PID"
wait "$CREDIT_PID"
wait "$SUBSCRIPTION_PID"

"${psql_base[@]}" <<SQL
do \$\$
declare
  v_balance integer;
  v_status text;
  v_token_version bigint;
  v_ledger_count integer;
  v_purchase_status text;
  v_credit_decision text;
  v_subscription_decision text;
  v_request_state text;
  v_request_version bigint;
  v_user public.users%rowtype;
  v_sub public.subscriptions%rowtype;
begin
  select * into v_user from public.users where id = '$USER_ID';
  select count(*) into v_ledger_count
    from public.credit_transactions where purchase_id = '$PURCHASE_ID';
  select status into v_purchase_status
    from public.credit_purchases where id = '$PURCHASE_ID';
  select decision into v_credit_decision
    from public.payment_entitlement_decisions where receipt_id = '$CREDIT_RECEIPT_ID';
  select decision into v_subscription_decision
    from public.payment_entitlement_decisions where receipt_id = '$SUBSCRIPTION_RECEIPT_ID';
  select state, token_version into v_request_state, v_request_version
    from public.account_deletion_requests where user_id = '$USER_ID';
  select * into v_sub from public.subscriptions where id = '$SUBSCRIPTION_ID';

  if v_user.credits_balance <> 5 or v_ledger_count <> 0
     or v_user.account_status <> 'deletion_pending' or v_user.token_version <> 1
     or v_purchase_status <> 'canceled' or v_sub.status <> 'canceled'
     or v_sub.period_start is not null or v_sub.period_end is not null
     or v_user.tariff_plan <> 'none' or v_user.tariff_period_end is not null
     or v_request_state <> 'pending' or v_request_version <> v_user.token_version
     or v_credit_decision <> 'withheld_account_lifecycle'
     or v_subscription_decision <> 'withheld_account_lifecycle' then
    raise exception 'deletion-first race was not serialized: balance %, ledger %, status %, purchase %, subscription %, tariff %, request %, credit decision %, subscription decision %',
      v_user.credits_balance, v_ledger_count, v_user.account_status, v_purchase_status,
      v_sub.status, v_user.tariff_plan, v_request_state, v_credit_decision, v_subscription_decision;
  end if;
end;
\$\$;
SQL

echo "Receipt-bound credit/subscription fulfillment and the real account-deletion acceptance RPC serialized correctly in both lock orders"
