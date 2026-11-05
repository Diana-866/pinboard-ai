#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=pinposy_test}"
export PGHOST PGPORT PGUSER PGDATABASE

psql_base=(psql -X -v ON_ERROR_STOP=1 -q)
USER_ID="$("${psql_base[@]}" -At -c "insert into public.users(email, credits_balance, tariff_plan) values ('credit-concurrency-' || gen_random_uuid() || '@example.invalid', 5, 'none') returning id")"
PURCHASE_ID="$("${psql_base[@]}" -At -c "insert into public.credit_purchases(user_id, package_id, pack_title, credits, status, provider_payment_id, amount, currency) values ('$USER_ID', 'pack_100', 'CI concurrent credit test', 100, 'pending', 'ci-credit-concurrent-' || gen_random_uuid(), 190, 'rub') returning id")"

cleanup() {
  "${psql_base[@]}" -c "delete from public.credit_transactions where purchase_id = '$PURCHASE_ID'; delete from public.credit_purchases where id = '$PURCHASE_ID'; delete from public.users where id = '$USER_ID';" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Hold the purchase row so both independent credit RPC calls contend on the same row.
PGAPPNAME=credit-concurrency-locker "${psql_base[@]}" -c "begin; select id from public.credit_purchases where id = '$PURCHASE_ID' for update; select pg_sleep(4); commit;" >/tmp/credit-locker.log 2>&1 &
LOCK_PID=$!

locked=0
for _ in $(seq 1 50); do
  active="$("${psql_base[@]}" -At -c "select count(*) from pg_stat_activity where application_name = 'credit-concurrency-locker' and position('pg_sleep' in query) > 0")"
  if [[ "$active" == "1" ]]; then locked=1; break; fi
  sleep 0.1
done
if [[ "$locked" != "1" ]]; then
  echo "Could not confirm the credit concurrency lock holder"
  kill "$LOCK_PID" 2>/dev/null || true
  exit 1
fi

PGAPPNAME=credit-webhook-one "${psql_base[@]}" -c "select public.credit_paid_purchase('$PURCHASE_ID', now(), 'parallel webhook one')" >/tmp/credit-one.log 2>&1 &
ONE_PID=$!
PGAPPNAME=credit-webhook-two "${psql_base[@]}" -c "select public.credit_paid_purchase('$PURCHASE_ID', now(), 'parallel webhook two')" >/tmp/credit-two.log 2>&1 &
TWO_PID=$!

wait "$ONE_PID"
wait "$TWO_PID"
wait "$LOCK_PID"

"${psql_base[@]}" <<SQL
do \$\$
declare
  v_balance integer;
  v_count integer;
  v_purchase public.credit_purchases%rowtype;
begin
  select credits_balance into v_balance from public.users where id = '$USER_ID';
  select * into v_purchase from public.credit_purchases where id = '$PURCHASE_ID';
  select count(*) into v_count from public.credit_transactions where purchase_id = '$PURCHASE_ID';

  if v_balance <> 105 then
    raise exception 'parallel duplicate webhooks credited wrong balance: % (expected 105)', v_balance;
  end if;
  if v_count <> 1 then
    raise exception 'parallel duplicate webhooks created % ledger rows (expected 1)', v_count;
  end if;
  if v_purchase.status <> 'success' or v_purchase.balance_credited_at is null then
    raise exception 'parallel credit purchase did not finish successfully';
  end if;
end;
\$\$;
SQL

echo "Concurrent duplicate credit webhook passed for purchase $PURCHASE_ID"
