#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/assert-disposable-postgres.sh"

create_case() {
  local label="$1"
  local kind="$2"
  USER_ID="$("${psql_base[@]}" -At -c "insert into public.users(email, credits_balance, tariff_plan, account_status, token_version) values ('payment-deletion-race-' || gen_random_uuid() || '@example.invalid', 5, 'none', 'active', 0) returning id")"
  TOKEN_VERSION="$("${psql_base[@]}" -At -c "select coalesce(token_version, 0) from public.users where id = '$USER_ID'")"
  PURCHASE_ID=""
  SUBSCRIPTION_ID=""
  CREDIT_RECEIPT_ID=""
  SUBSCRIPTION_RECEIPT_ID=""

  if [[ "$kind" == "credits" ]]; then
    PURCHASE_ID="$("${psql_base[@]}" -At -c "insert into public.credit_purchases(user_id, package_id, pack_title, credits, status, provider_payment_id, amount, currency) values ('$USER_ID', 'pack_100', 'CI payment/deletion race', 100, 'canceled', 'ci-payment-deletion-credit-' || gen_random_uuid(), 190, 'rub') returning id")"
    CREDIT_RECEIPT_ID="$("${psql_base[@]}" -At -c "select public.record_prodamus_payment_receipt('credits', (select provider_payment_id from public.credit_purchases where id = '$PURCHASE_ID'), 'success', 190, 'rub', repeat(md5(gen_random_uuid()::text), 2))")"
    if [[ -z "$PURCHASE_ID" || -z "$CREDIT_RECEIPT_ID" ]]; then
      echo "Could not create isolated $label credit fixtures" >&2
      return 1
    fi
  elif [[ "$kind" == "subscription" ]]; then
    SUBSCRIPTION_ID="$("${psql_base[@]}" -At -c "insert into public.subscriptions(user_id, plan, status, provider_payment_id, amount, currency) values ('$USER_ID', 'pro', 'canceled', 'ci-payment-deletion-subscription-' || gen_random_uuid(), 4990, 'rub') returning id")"
    SUBSCRIPTION_RECEIPT_ID="$("${psql_base[@]}" -At -c "select public.record_prodamus_payment_receipt('subscription', (select provider_payment_id from public.subscriptions where id = '$SUBSCRIPTION_ID'), 'success', 4990, 'rub', repeat(md5(gen_random_uuid()::text), 2))")"
    if [[ -z "$SUBSCRIPTION_ID" || -z "$SUBSCRIPTION_RECEIPT_ID" ]]; then
      echo "Could not create isolated $label subscription fixtures" >&2
      return 1
    fi
  else
    echo "Unsupported race payment kind: $kind" >&2
    return 1
  fi

  if [[ -z "$USER_ID" || "$TOKEN_VERSION" != "0" ]]; then
    echo "Could not create isolated $label account fixture" >&2
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

cleanup() {
  stop_test_children
  cleanup_test_tmp_dir
}
trap cleanup EXIT

run_credit_payment_first() {
  create_case "credit-payment-first" "credits"
  PGAPPNAME=credit-payment-first-locker "${psql_base[@]}" -c "begin; select id from public.users where id = '$USER_ID' for update; select public.credit_paid_purchase_with_receipt('$PURCHASE_ID', now(), 'credit payment won deletion race', '$CREDIT_RECEIPT_ID'); select pg_sleep(5); commit;" >"${TEST_TMP_DIR}/credit-payment-first-locker.log" 2>&1 &
  local payment_pid=$!
  wait_for_query "credit-payment-first-locker" "pg_sleep"

  PGAPPNAME=delete-after-credit-payment "${psql_base[@]}" -c "select public.request_account_deletion('$USER_ID', 'password_reauth', $TOKEN_VERSION)" >"${TEST_TMP_DIR}/delete-after-credit-payment.log" 2>&1 &
  local deletion_pid=$!
  wait_for_lock_waiter "delete-after-credit-payment"
  wait "$payment_pid"
  wait "$deletion_pid"

  "${psql_base[@]}" <<SQL
do \$\$
declare
  v_user public.users%rowtype;
  v_ledger_count integer;
  v_purchase_status text;
  v_decision text;
  v_request_state text;
  v_request_version bigint;
  v_event_count integer;
  v_job_count integer;
begin
  select * into v_user from public.users where id = '$USER_ID';
  select count(*) into v_ledger_count from public.credit_transactions where purchase_id = '$PURCHASE_ID';
  select status into v_purchase_status from public.credit_purchases where id = '$PURCHASE_ID';
  select decision into v_decision from public.payment_entitlement_decisions where receipt_id = '$CREDIT_RECEIPT_ID';
  select state, token_version into v_request_state, v_request_version from public.account_deletion_requests where user_id = '$USER_ID';
  select count(*) into v_event_count from public.account_deletion_events e join public.account_deletion_requests r on r.id = e.request_id where r.user_id = '$USER_ID' and e.event_key = 'request_accepted';
  select count(*) into v_job_count from public.account_deletion_jobs j join public.account_deletion_requests r on r.id = j.request_id where r.user_id = '$USER_ID' and j.step_key = 'preflight' and j.status = 'pending';

  if v_user.credits_balance <> 105 or v_ledger_count <> 1 or v_purchase_status <> 'success'
     or v_decision <> 'granted' or v_user.account_status <> 'deletion_pending'
     or v_user.token_version <> 1 or v_request_state <> 'pending'
     or v_request_version <> v_user.token_version or v_event_count <> 1 or v_job_count <> 1 then
    raise exception 'credit payment-first race failed: balance %, ledger %, purchase %, decision %, lifecycle %, token %, request %, event %, job %',
      v_user.credits_balance, v_ledger_count, v_purchase_status, v_decision,
      v_user.account_status, v_user.token_version, v_request_state, v_event_count, v_job_count;
  end if;
end;
\$\$;
SQL
}

run_credit_deletion_first() {
  create_case "credit-deletion-first" "credits"
  PGAPPNAME=credit-deletion-first-locker "${psql_base[@]}" -c "begin; select public.request_account_deletion('$USER_ID', 'password_reauth', $TOKEN_VERSION); select pg_sleep(5); commit;" >"${TEST_TMP_DIR}/credit-deletion-first-locker.log" 2>&1 &
  local deletion_pid=$!
  wait_for_query "credit-deletion-first-locker" "pg_sleep"

  PGAPPNAME=credit-after-deletion "${psql_base[@]}" -c "select public.credit_paid_purchase_with_receipt('$PURCHASE_ID', now(), 'credit payment lost deletion race', '$CREDIT_RECEIPT_ID')" >"${TEST_TMP_DIR}/credit-after-deletion.log" 2>&1 &
  local payment_pid=$!
  wait_for_lock_waiter "credit-after-deletion"
  wait "$deletion_pid"
  wait "$payment_pid"

  "${psql_base[@]}" <<SQL
do \$\$
declare
  v_user public.users%rowtype;
  v_ledger_count integer;
  v_purchase_status text;
  v_decision text;
  v_request_state text;
  v_request_version bigint;
  v_event_count integer;
  v_job_count integer;
begin
  select * into v_user from public.users where id = '$USER_ID';
  select count(*) into v_ledger_count from public.credit_transactions where purchase_id = '$PURCHASE_ID';
  select status into v_purchase_status from public.credit_purchases where id = '$PURCHASE_ID';
  select decision into v_decision from public.payment_entitlement_decisions where receipt_id = '$CREDIT_RECEIPT_ID';
  select state, token_version into v_request_state, v_request_version from public.account_deletion_requests where user_id = '$USER_ID';
  select count(*) into v_event_count from public.account_deletion_events e join public.account_deletion_requests r on r.id = e.request_id where r.user_id = '$USER_ID' and e.event_key = 'request_accepted';
  select count(*) into v_job_count from public.account_deletion_jobs j join public.account_deletion_requests r on r.id = j.request_id where r.user_id = '$USER_ID' and j.step_key = 'preflight' and j.status = 'pending';

  if v_user.credits_balance <> 5 or v_ledger_count <> 0 or v_purchase_status <> 'canceled'
     or v_decision <> 'withheld_account_lifecycle' or v_user.account_status <> 'deletion_pending'
     or v_user.token_version <> 1 or v_request_state <> 'pending'
     or v_request_version <> v_user.token_version or v_event_count <> 1 or v_job_count <> 1 then
    raise exception 'credit deletion-first race failed: balance %, ledger %, purchase %, decision %, lifecycle %, token %, request %, event %, job %',
      v_user.credits_balance, v_ledger_count, v_purchase_status, v_decision,
      v_user.account_status, v_user.token_version, v_request_state, v_event_count, v_job_count;
  end if;
end;
\$\$;
SQL
}

run_subscription_payment_first() {
  create_case "subscription-payment-first" "subscription"
  PGAPPNAME=subscription-payment-first-locker "${psql_base[@]}" -c "begin; select id from public.users where id = '$USER_ID' for update; select public.activate_paid_subscription_with_receipt('$SUBSCRIPTION_ID', now(), '$SUBSCRIPTION_RECEIPT_ID'); select pg_sleep(5); commit;" >"${TEST_TMP_DIR}/subscription-payment-first-locker.log" 2>&1 &
  local payment_pid=$!
  wait_for_query "subscription-payment-first-locker" "pg_sleep"

  PGAPPNAME=delete-after-subscription-payment "${psql_base[@]}" -c "select public.request_account_deletion('$USER_ID', 'password_reauth', $TOKEN_VERSION)" >"${TEST_TMP_DIR}/delete-after-subscription-payment.log" 2>&1 &
  local deletion_pid=$!
  wait_for_lock_waiter "delete-after-subscription-payment"
  wait "$payment_pid"
  wait "$deletion_pid"

  "${psql_base[@]}" <<SQL
do \$\$
declare
  v_user public.users%rowtype;
  v_sub public.subscriptions%rowtype;
  v_decision text;
  v_request_state text;
  v_request_version bigint;
  v_event_count integer;
  v_job_count integer;
begin
  select * into v_user from public.users where id = '$USER_ID';
  select * into v_sub from public.subscriptions where id = '$SUBSCRIPTION_ID';
  select decision into v_decision from public.payment_entitlement_decisions where receipt_id = '$SUBSCRIPTION_RECEIPT_ID';
  select state, token_version into v_request_state, v_request_version from public.account_deletion_requests where user_id = '$USER_ID';
  select count(*) into v_event_count from public.account_deletion_events e join public.account_deletion_requests r on r.id = e.request_id where r.user_id = '$USER_ID' and e.event_key = 'request_accepted';
  select count(*) into v_job_count from public.account_deletion_jobs j join public.account_deletion_requests r on r.id = j.request_id where r.user_id = '$USER_ID' and j.step_key = 'preflight' and j.status = 'pending';

  if v_user.tariff_plan <> 'pro' or v_sub.status <> 'success' or v_sub.period_end is null
     or v_decision <> 'granted' or v_user.account_status <> 'deletion_pending'
     or v_user.token_version <> 1 or v_request_state <> 'pending'
     or v_request_version <> v_user.token_version or v_event_count <> 1 or v_job_count <> 1 then
    raise exception 'subscription payment-first race failed: tariff %, subscription %, decision %, lifecycle %, token %, request %, event %, job %',
      v_user.tariff_plan, v_sub.status, v_decision, v_user.account_status,
      v_user.token_version, v_request_state, v_event_count, v_job_count;
  end if;
end;
\$\$;
SQL
}

run_subscription_deletion_first() {
  create_case "subscription-deletion-first" "subscription"
  PGAPPNAME=subscription-deletion-first-locker "${psql_base[@]}" -c "begin; select public.request_account_deletion('$USER_ID', 'password_reauth', $TOKEN_VERSION); select pg_sleep(5); commit;" >"${TEST_TMP_DIR}/subscription-deletion-first-locker.log" 2>&1 &
  local deletion_pid=$!
  wait_for_query "subscription-deletion-first-locker" "pg_sleep"

  PGAPPNAME=subscription-after-deletion "${psql_base[@]}" -c "select public.activate_paid_subscription_with_receipt('$SUBSCRIPTION_ID', now(), '$SUBSCRIPTION_RECEIPT_ID')" >"${TEST_TMP_DIR}/subscription-after-deletion.log" 2>&1 &
  local payment_pid=$!
  wait_for_lock_waiter "subscription-after-deletion"
  wait "$deletion_pid"
  wait "$payment_pid"

  "${psql_base[@]}" <<SQL
do \$\$
declare
  v_user public.users%rowtype;
  v_sub public.subscriptions%rowtype;
  v_decision text;
  v_request_state text;
  v_request_version bigint;
  v_event_count integer;
  v_job_count integer;
begin
  select * into v_user from public.users where id = '$USER_ID';
  select * into v_sub from public.subscriptions where id = '$SUBSCRIPTION_ID';
  select decision into v_decision from public.payment_entitlement_decisions where receipt_id = '$SUBSCRIPTION_RECEIPT_ID';
  select state, token_version into v_request_state, v_request_version from public.account_deletion_requests where user_id = '$USER_ID';
  select count(*) into v_event_count from public.account_deletion_events e join public.account_deletion_requests r on r.id = e.request_id where r.user_id = '$USER_ID' and e.event_key = 'request_accepted';
  select count(*) into v_job_count from public.account_deletion_jobs j join public.account_deletion_requests r on r.id = j.request_id where r.user_id = '$USER_ID' and j.step_key = 'preflight' and j.status = 'pending';

  if v_user.tariff_plan <> 'none' or v_sub.status <> 'canceled'
     or v_sub.period_start is not null or v_sub.period_end is not null
     or v_decision <> 'withheld_account_lifecycle' or v_user.account_status <> 'deletion_pending'
     or v_user.token_version <> 1 or v_request_state <> 'pending'
     or v_request_version <> v_user.token_version or v_event_count <> 1 or v_job_count <> 1 then
    raise exception 'subscription deletion-first race failed: tariff %, subscription %, decision %, lifecycle %, token %, request %, event %, job %',
      v_user.tariff_plan, v_sub.status, v_decision, v_user.account_status,
      v_user.token_version, v_request_state, v_event_count, v_job_count;
  end if;
end;
\$\$;
SQL
}

run_credit_payment_first
run_credit_deletion_first
run_subscription_payment_first
run_subscription_deletion_first

echo "Receipt-bound credit and subscription fulfillment passed all four real account-deletion RPC race cases"
