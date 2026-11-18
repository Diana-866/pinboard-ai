#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/assert-disposable-postgres.sh"

create_case() {
  local label="$1"
  USER_ID="$("${psql_base[@]}" -At -c "insert into public.users(email, credits_balance, tariff_plan, account_status) values ('payment-deletion-race-' || gen_random_uuid() || '@example.invalid', 5, 'none', 'active') returning id")"
  PURCHASE_ID="$("${psql_base[@]}" -At -c "insert into public.credit_purchases(user_id, package_id, pack_title, credits, status, provider_payment_id, amount, currency) values ('$USER_ID', 'pack_100', 'CI payment/deletion race', 100, 'canceled', 'ci-payment-deletion-' || gen_random_uuid(), 190, 'rub') returning id")"
  RECEIPT_ID="$("${psql_base[@]}" -At -c "select public.record_prodamus_payment_receipt('credits', (select provider_payment_id from public.credit_purchases where id = '$PURCHASE_ID'), 'success', 190, 'rub', repeat(md5(gen_random_uuid()::text), 2))")"
  if [[ -z "$USER_ID" || -z "$PURCHASE_ID" || -z "$RECEIPT_ID" ]]; then
    echo "Could not create isolated $label payment/deletion race fixture" >&2
    return 1
  fi
}

cleanup_case() {
  "${psql_base[@]}" -c "delete from public.credit_transactions where purchase_id = '$PURCHASE_ID'; delete from public.credit_purchases where id = '$PURCHASE_ID'; delete from public.users where id = '$USER_ID';" >/dev/null 2>&1 || true
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
  if [[ -n "${PURCHASE_ID:-}" && -n "${USER_ID:-}" ]]; then cleanup_case; fi
  cleanup_test_tmp_dir
}
trap cleanup EXIT

# Case A: payment owns the user lifecycle lock first. Deletion must wait until
# the receipt-bound entitlement and terminal decision commit together.
create_case "payment-first"
PGAPPNAME=payment-deletion-payment-first-locker "${psql_base[@]}" -c "begin; select id from public.users where id = '$USER_ID' for update; select pg_sleep(5); select public.credit_paid_purchase_with_receipt('$PURCHASE_ID', now(), 'payment won deletion race', '$RECEIPT_ID'); commit;" >"${TEST_TMP_DIR}/payment-first-locker.log" 2>&1 &
PAYMENT_LOCK_PID=$!
wait_for_query "payment-deletion-payment-first-locker" "pg_sleep"

PGAPPNAME=payment-deletion-after-payment "${psql_base[@]}" -c "begin; update public.users set account_status = 'deletion_pending' where id = '$USER_ID'; commit;" >"${TEST_TMP_DIR}/payment-first-deletion.log" 2>&1 &
DELETION_PID=$!
wait_for_lock_waiter "payment-deletion-after-payment"
wait "$PAYMENT_LOCK_PID"
wait "$DELETION_PID"

"${psql_base[@]}" <<SQL
do \$\$
declare
  v_balance integer;
  v_status text;
  v_ledger_count integer;
  v_decision text;
begin
  select credits_balance, account_status into v_balance, v_status
    from public.users where id = '$USER_ID';
  select count(*) into v_ledger_count
    from public.credit_transactions where purchase_id = '$PURCHASE_ID';
  select decision into v_decision
    from public.payment_entitlement_decisions where receipt_id = '$RECEIPT_ID';

  if v_balance <> 105 or v_ledger_count <> 1 or v_status <> 'deletion_pending'
     or v_decision <> 'granted' then
    raise exception 'payment-first race was not serialized: balance %, ledger %, status %, decision %',
      v_balance, v_ledger_count, v_status, v_decision;
  end if;
end;
\$\$;
SQL
cleanup_case
USER_ID=""
PURCHASE_ID=""
RECEIPT_ID=""

# Case B: deletion owns the same user lock first. The payment RPC must wait,
# observe deletion_pending after the lock is released, and persist a withheld
# decision without changing the balance, purchase, or credit ledger.
create_case "deletion-first"
PGAPPNAME=payment-deletion-deletion-first-locker "${psql_base[@]}" -c "begin; update public.users set account_status = 'deletion_pending' where id = '$USER_ID'; select pg_sleep(5); commit;" >"${TEST_TMP_DIR}/deletion-first-locker.log" 2>&1 &
DELETION_LOCK_PID=$!
wait_for_query "payment-deletion-deletion-first-locker" "pg_sleep"

PGAPPNAME=payment-after-deletion "${psql_base[@]}" -c "select public.credit_paid_purchase_with_receipt('$PURCHASE_ID', now(), 'payment lost deletion race', '$RECEIPT_ID')" >"${TEST_TMP_DIR}/deletion-first-payment.log" 2>&1 &
PAYMENT_PID=$!
wait_for_lock_waiter "payment-after-deletion"
wait "$DELETION_LOCK_PID"
wait "$PAYMENT_PID"

"${psql_base[@]}" <<SQL
do \$\$
declare
  v_balance integer;
  v_status text;
  v_ledger_count integer;
  v_purchase_status text;
  v_decision text;
begin
  select credits_balance, account_status into v_balance, v_status
    from public.users where id = '$USER_ID';
  select count(*) into v_ledger_count
    from public.credit_transactions where purchase_id = '$PURCHASE_ID';
  select status into v_purchase_status
    from public.credit_purchases where id = '$PURCHASE_ID';
  select decision into v_decision
    from public.payment_entitlement_decisions where receipt_id = '$RECEIPT_ID';

  if v_balance <> 5 or v_ledger_count <> 0 or v_status <> 'deletion_pending'
     or v_purchase_status <> 'canceled' or v_decision <> 'withheld_account_lifecycle' then
    raise exception 'deletion-first race was not serialized: balance %, ledger %, status %, purchase %, decision %',
      v_balance, v_ledger_count, v_status, v_purchase_status, v_decision;
  end if;
end;
\$\$;
SQL

echo "Receipt-bound payment/account-deletion races passed in both lock orders"
