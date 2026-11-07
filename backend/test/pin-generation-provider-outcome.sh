#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=pinposy_test}"
export PGHOST PGPORT PGUSER PGDATABASE

psql_cmd=(psql -X -v ON_ERROR_STOP=1 -q)
SUFFIX="$(date +%s)-$$"
USER_ID="$("${psql_cmd[@]}" -At -c "insert into public.users(email,credits_balance,tariff_plan) values ('multi-provider-outcome-' || gen_random_uuid() || '@example.invalid',25,'pro') returning id")"
PROJECT_ID="$("${psql_cmd[@]}" -At -c "insert into public.projects(user_id,niche,tone,language) values ('$USER_ID','multi provider test','neutral','en') returning id")"
BOARD_ID="$("${psql_cmd[@]}" -At -c "insert into public.boards(project_id,title,description,status) values ('$PROJECT_ID','Provider task journal test','','active') returning id")"
REQUEST_KEY="multi-provider-outcome-$SUFFIX"
REQUEST_ID="$("${psql_cmd[@]}" -At -c "insert into public.pin_generation_requests(user_id,board_id,idempotency_key,status,request_fingerprint) values ('$USER_ID','$BOARD_ID','$REQUEST_KEY','processing',repeat('b',64)) returning id")"
CLAIM_TOKEN="$("${psql_cmd[@]}" -At -c "select claim_token from public.pin_generation_requests where id=$REQUEST_ID")"

cleanup() {
  "${psql_cmd[@]}" -c "delete from public.pin_generation_requests where id=$REQUEST_ID; delete from public.boards where id='$BOARD_ID'; delete from public.projects where id='$PROJECT_ID'; delete from public.credit_transactions where user_id='$USER_ID'; delete from public.users where id='$USER_ID';" >/dev/null 2>&1 || true
}
trap cleanup EXIT

insert_task() {
  local index="$1"
  "${psql_cmd[@]}" -c "insert into public.pin_generation_tasks(generation_request_id,user_id,board_id,task_index,title,description,prompt,model,aspect_ratio,status) values ($REQUEST_ID,'$USER_ID','$BOARD_ID',$index,'Task $index','','Test prompt','flux-schnell','2:3','submitting');" >/dev/null
}
for task_index in 1 2 3 4 5; do insert_task "$task_index"; done

# Success is persisted before storage rehosting and is independently replayable.
"${psql_cmd[@]}" -c "select public.record_pin_generation_provider_outcome('$USER_ID','$REQUEST_KEY','$CLAIM_TOKEN',1,'multi_done_001','succeeded',0.42,null,null,null,'https://provider.example.invalid/done.png');" >/dev/null
"${psql_cmd[@]}" -c "select public.record_pin_generation_provider_outcome('$USER_ID','$REQUEST_KEY','$CLAIM_TOKEN',1,'multi_done_001','succeeded',0.42,null,null,null,'https://provider.example.invalid/done.png');" >/dev/null
DONE_ROW="$("${psql_cmd[@]}" -At -F '|' -c "select status,provider_outcome_status,provider_price,provider_refunded is null,(provider_reconciled_at is not null) from public.pin_generation_tasks where generation_request_id=$REQUEST_ID and task_index=1")"
[[ "$DONE_ROW" == "succeeded|succeeded|0.42|t|t" ]] || { echo "Unexpected success outcome: $DONE_ROW"; exit 1; }

# Legacy recovery may have a durable storage URL and provider ID but no longer
# retain the temporary provider URL; terminal accounting must still be possible.
"${psql_cmd[@]}" -c "select public.record_pin_generation_provider_outcome('$USER_ID','$REQUEST_KEY','$CLAIM_TOKEN',5,'multi_done_005','succeeded',0.31,null,null,null,null);" >/dev/null
LEGACY_DONE_ROW="$("${psql_cmd[@]}" -At -F '|' -c "select status,provider_outcome_status,provider_price,(provider_reconciled_at is not null) from public.pin_generation_tasks where generation_request_id=$REQUEST_ID and task_index=5")"
[[ "$LEGACY_DONE_ROW" == "succeeded|succeeded|0.31|t" ]] || { echo "Legacy success was not reconciled: $LEGACY_DONE_ROW"; exit 1; }

# A non-refunded failure is a reconciled platform expense.
"${psql_cmd[@]}" -c "select public.record_pin_generation_provider_outcome('$USER_ID','$REQUEST_KEY','$CLAIM_TOKEN',2,'multi_failed_002','failed',1.25,false,2001,'POLICY_REJECTED',null);" >/dev/null
FAILED_ROW="$("${psql_cmd[@]}" -At -F '|' -c "select status,provider_outcome_status,provider_price,provider_refunded,(provider_reconciled_at is not null) from public.pin_generation_tasks where generation_request_id=$REQUEST_ID and task_index=2")"
[[ "$FAILED_ROW" == "failed|failed|1.25|f|t" ]] || { echo "Unexpected non-refunded failure: $FAILED_ROW"; exit 1; }

# Missing refund metadata stays NULL and is explicitly unreconciled.
"${psql_cmd[@]}" -c "select public.record_pin_generation_provider_outcome('$USER_ID','$REQUEST_KEY','$CLAIM_TOKEN',3,'multi_failed_003','failed',0.75,null,2002,'UPSTREAM_ERROR',null);" >/dev/null
UNKNOWN_REFUND_ROW="$("${psql_cmd[@]}" -At -F '|' -c "select status,provider_refunded is null,(provider_reconciled_at is null) from public.pin_generation_tasks where generation_request_id=$REQUEST_ID and task_index=3")"
[[ "$UNKNOWN_REFUND_ROW" == "failed|t|t" ]] || { echo "Missing refund was inferred: $UNKNOWN_REFUND_ROW"; exit 1; }

# Refunded failure retains gross price but is marked reconciled.
"${psql_cmd[@]}" -c "select public.record_pin_generation_provider_outcome('$USER_ID','$REQUEST_KEY','$CLAIM_TOKEN',4,'multi_failed_004','failed',0.90,true,2003,'REFUNDED_FAILURE',null);" >/dev/null
REFUNDED_ROW="$("${psql_cmd[@]}" -At -F '|' -c "select status,provider_price,provider_refunded,(provider_reconciled_at is not null) from public.pin_generation_tasks where generation_request_id=$REQUEST_ID and task_index=4")"
[[ "$REFUNDED_ROW" == "failed|0.90|t|t" ]] || { echo "Refunded failure was not reconciled: $REFUNDED_ROW"; exit 1; }

# Conflicting terminal facts and stale claims must be rejected.
if "${psql_cmd[@]}" -c "select public.record_pin_generation_provider_outcome('$USER_ID','$REQUEST_KEY','$CLAIM_TOKEN',2,'multi_failed_002','failed',1.25,true,2001,'POLICY_REJECTED',null);" >/dev/null 2>&1; then
  echo "Conflicting provider outcome replay unexpectedly succeeded"
  exit 1
fi
if "${psql_cmd[@]}" -c "select public.record_pin_generation_provider_outcome('$USER_ID','$REQUEST_KEY',gen_random_uuid(),1,'multi_done_001','succeeded',0.42,null,null,null,'https://provider.example.invalid/done.png');" >/dev/null 2>&1; then
  echo "Stale generation claim unexpectedly succeeded"
  exit 1
fi

USER_ACCOUNTING="$("${psql_cmd[@]}" -At -F '|' -c "select credits_balance,(select count(*) from public.credit_transactions where user_id='$USER_ID'),(select status from public.pin_generation_requests where id=$REQUEST_ID) from public.users where id='$USER_ID'")"
[[ "$USER_ACCOUNTING" == "25|0|processing" ]] || { echo "Provider outcome journal changed user settlement state: $USER_ACCOUNTING"; exit 1; }

echo "Multi-pin provider outcome integration checks passed."
