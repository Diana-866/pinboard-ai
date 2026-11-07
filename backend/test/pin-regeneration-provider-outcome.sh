#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=pinposy_test}"
export PGHOST PGPORT PGUSER PGDATABASE

psql_cmd=(psql -X -v ON_ERROR_STOP=1 -q)
SUFFIX="$(date +%s)-$$"
USER_ID="$("${psql_cmd[@]}" -At -c "insert into public.users(email,credits_balance,tariff_plan) values ('provider-outcome-' || gen_random_uuid() || '@example.invalid',20,'pro') returning id")"
PROJECT_ID="$("${psql_cmd[@]}" -At -c "insert into public.projects(user_id,niche,tone,language) values ('$USER_ID','provider outcome test','neutral','en') returning id")"
BOARD_ID="$("${psql_cmd[@]}" -At -c "insert into public.boards(project_id,title,description,status) values ('$PROJECT_ID','Provider outcome test','','active') returning id")"
PIN_ID="$("${psql_cmd[@]}" -At -c "insert into public.pins(board_id,title,description,image_url,model_used,credits_cost,aspect_ratio) values ('$BOARD_ID','Test pin','','https://cdn.example.invalid/old.png','flux-schnell',1,'2:3') returning id")"

cleanup() {
  "${psql_cmd[@]}" -c "delete from public.pin_regeneration_requests where user_id='$USER_ID'; delete from public.pins where id='$PIN_ID'; delete from public.boards where id='$BOARD_ID'; delete from public.projects where id='$PROJECT_ID'; delete from public.credit_transactions where user_id='$USER_ID'; delete from public.users where id='$USER_ID';" >/dev/null 2>&1 || true
}
trap cleanup EXIT

insert_request() {
  local key="$1"
  "${psql_cmd[@]}" -c "insert into public.pin_regeneration_requests(user_id,pin_id,idempotency_key,request_fingerprint,model,prompt,amount) values ('$USER_ID','$PIN_ID','$key',repeat('a',64),'flux-schnell','provider outcome test',1);" >/dev/null
}

FAILED_KEY="provider-failed-$SUFFIX"
MISSING_REFUND_KEY="provider-no-refund-$SUFFIX"
DONE_KEY="provider-done-$SUFFIX"
insert_request "$FAILED_KEY"
insert_request "$MISSING_REFUND_KEY"
insert_request "$DONE_KEY"

token_for() {
  "${psql_cmd[@]}" -At -c "select claim_token from public.pin_regeneration_requests where user_id='$USER_ID' and idempotency_key='$1'"
}
FAILED_TOKEN="$(token_for "$FAILED_KEY")"
MISSING_TOKEN="$(token_for "$MISSING_REFUND_KEY")"
DONE_TOKEN="$(token_for "$DONE_KEY")"

# A failed, non-refunded task is a reconciled platform expense, not a user debit.
"${psql_cmd[@]}" -c "select public.record_pin_regeneration_provider_outcome('$USER_ID','$FAILED_KEY','$FAILED_TOKEN','task_failed_001','failed',1.25,false,1001,'POLICY_REJECTED');" >/dev/null
FAILED_ROW="$("${psql_cmd[@]}" -At -F '|' -c "select provider_status,provider_price,provider_refunded,provider_error_code,provider_error_title,(provider_reconciled_at is not null) from public.pin_regeneration_requests where user_id='$USER_ID' and idempotency_key='$FAILED_KEY'")"
[[ "$FAILED_ROW" == "failed|1.25|f|1001|POLICY_REJECTED|t" ]] || { echo "Unexpected failed provider outcome: $FAILED_ROW"; exit 1; }

# Exact replay is idempotent; conflicting terminal facts and stale claims fail closed.
"${psql_cmd[@]}" -c "select public.record_pin_regeneration_provider_outcome('$USER_ID','$FAILED_KEY','$FAILED_TOKEN','task_failed_001','failed',1.25,false,1001,'POLICY_REJECTED');" >/dev/null
if "${psql_cmd[@]}" -c "select public.record_pin_regeneration_provider_outcome('$USER_ID','$FAILED_KEY','$FAILED_TOKEN','task_failed_001','failed',1.25,true,1001,'POLICY_REJECTED');" >/dev/null 2>&1; then
  echo "Conflicting provider outcome replay unexpectedly succeeded"
  exit 1
fi
if "${psql_cmd[@]}" -c "select public.record_pin_regeneration_provider_outcome('$USER_ID','$FAILED_KEY',gen_random_uuid(),'task_failed_001','failed',1.25,false,1001,'POLICY_REJECTED');" >/dev/null 2>&1; then
  echo "Stale provider outcome claim unexpectedly succeeded"
  exit 1
fi

# Missing refund metadata is preserved as unknown and remains unreconciled.
"${psql_cmd[@]}" -c "select public.record_pin_regeneration_provider_outcome('$USER_ID','$MISSING_REFUND_KEY','$MISSING_TOKEN','task_failed_002','failed',0.75,null,1002,'UPSTREAM_ERROR');" >/dev/null
MISSING_ROW="$("${psql_cmd[@]}" -At -F '|' -c "select provider_status,provider_price,provider_refunded is null,(provider_reconciled_at is null) from public.pin_regeneration_requests where user_id='$USER_ID' and idempotency_key='$MISSING_REFUND_KEY'")"
[[ "$MISSING_ROW" == "failed|0.75|t|t" ]] || { echo "Missing refund was not kept unresolved: $MISSING_ROW"; exit 1; }

# Successful provider completion records the gross RUB price before storage work.
"${psql_cmd[@]}" -c "select public.record_pin_regeneration_provider_outcome('$USER_ID','$DONE_KEY','$DONE_TOKEN','task_done_001','done',0.42,null,null,null);" >/dev/null
DONE_ROW="$("${psql_cmd[@]}" -At -F '|' -c "select provider_status,provider_price,provider_refunded is null,(provider_reconciled_at is not null) from public.pin_regeneration_requests where user_id='$USER_ID' and idempotency_key='$DONE_KEY'")"
[[ "$DONE_ROW" == "done|0.42|t|t" ]] || { echo "Unexpected successful provider outcome: $DONE_ROW"; exit 1; }

echo "Pin regeneration provider outcome integration checks passed."
