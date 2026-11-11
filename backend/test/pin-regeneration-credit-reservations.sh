#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=pinposy_test}"
export PGHOST PGPORT PGUSER PGDATABASE
psql_cmd=(psql -X -v ON_ERROR_STOP=1 -q)

USER_ID="$("${psql_cmd[@]}" -At -c "insert into public.users(email,credits_balance,tariff_plan) values ('regen-reservation-' || gen_random_uuid() || '@example.invalid',20,'pro') returning id")"
PROJECT_ID="$("${psql_cmd[@]}" -At -c "insert into public.projects(user_id,niche,tone,language) values ('$USER_ID','reservation test','neutral','en') returning id")"
BOARD_ID="$("${psql_cmd[@]}" -At -c "insert into public.boards(project_id,title,description,status) values ('$PROJECT_ID','Regeneration reservation test','','active') returning id")"
PIN_ID="$("${psql_cmd[@]}" -At -c "insert into public.pins(board_id,title,description,image_url,model_used,credits_cost,aspect_ratio) values ('$BOARD_ID','Reservation pin','','https://cdn.example.invalid/old.png','flux-schnell',1,'2:3') returning id")"
OTHER_KEY="other-generation-reserve-$(printf '%s' "$USER_ID" | tr -d '-')"
REGEN_KEY="single-regeneration-reserve-$(printf '%s' "$USER_ID" | tr -d '-')"
FAIL_KEY="single-regeneration-fail-$(printf '%s' "$USER_ID" | tr -d '-')"
FINGERPRINT="$(printf 'b%.0s' {1..64})"

cleanup() {
  "${psql_cmd[@]}" -c "delete from public.pin_regeneration_requests where user_id='$USER_ID'; delete from public.pin_generation_requests where user_id='$USER_ID'; delete from public.pin_generation_credit_reservations where user_id='$USER_ID'; delete from public.pins where id='$PIN_ID'; delete from public.boards where id='$BOARD_ID'; delete from public.projects where id='$PROJECT_ID'; delete from public.credit_transactions where user_id='$USER_ID'; delete from public.users where id='$USER_ID';" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# A package-generation reservation must reduce the amount available to a
# single-pin regeneration before any provider task can be submitted.
"${psql_cmd[@]}" -c "select public.reserve_pin_generation_credits('$USER_ID','$OTHER_KEY',12);" >/dev/null
"${psql_cmd[@]}" -c "select public.begin_pin_regeneration_request('$USER_ID','$PIN_ID','$REGEN_KEY','$FINGERPRINT','flux-schnell','reservation test',9);" >/dev/null
TOKEN="$("${psql_cmd[@]}" -At -c "select claim_token from public.pin_regeneration_requests where user_id='$USER_ID' and idempotency_key='$REGEN_KEY'")"
if "${psql_cmd[@]}" -c "select public.reserve_pin_regeneration_credits('$USER_ID','$REGEN_KEY','$TOKEN');" >/dev/null 2>&1; then
  echo "Single-pin regeneration consumed credits reserved by another generation"
  exit 1
fi
FAILED_STATE="$("${psql_cmd[@]}" -At -c "select public.update_pin_regeneration_request('$USER_ID','$REGEN_KEY','$TOKEN','failed',null,null,null,null,'insufficient_credits')")"
[[ "$FAILED_STATE" == "t" ]] || { echo "Could not mark unsubmitted over-budget request failed"; exit 1; }

# An exact remaining balance can be reserved, consumed once, and marked settled.
"${psql_cmd[@]}" -c "select public.begin_pin_regeneration_request('$USER_ID','$PIN_ID','$REGEN_KEY-2','$FINGERPRINT','flux-schnell','reservation test',8);" >/dev/null
TOKEN2="$("${psql_cmd[@]}" -At -c "select claim_token from public.pin_regeneration_requests where user_id='$USER_ID' and idempotency_key='$REGEN_KEY-2'")"
"${psql_cmd[@]}" -c "select public.reserve_pin_regeneration_credits('$USER_ID','$REGEN_KEY-2','$TOKEN2');" >/dev/null
"${psql_cmd[@]}" -c "select public.complete_pin_regeneration_request('$USER_ID','$REGEN_KEY-2','$TOKEN2','https://cdn.example.invalid/new.png');" >/dev/null
SETTLEMENT="$("${psql_cmd[@]}" -At -F '|' -c "select u.credits_balance,r.status,other.status,p.image_url,(select count(*) from public.credit_transactions where user_id='$USER_ID' and type='regeneration') from public.users u join public.pin_generation_credit_reservations r on r.user_id=u.id::text and r.idempotency_key='$REGEN_KEY-2' join public.pin_generation_credit_reservations other on other.user_id=u.id::text and other.idempotency_key='$OTHER_KEY' join public.pins p on p.id='$PIN_ID' where u.id='$USER_ID'")"
[[ "$SETTLEMENT" == "12|settled|reserved|https://cdn.example.invalid/new.png|1" ]] || { echo "Unexpected reserved regeneration settlement: $SETTLEMENT"; exit 1; }

# A provider-confirmed failure releases only its own reservation; unknown must
# remain reserved (covered by the status transition condition in migration).
FAIL_USER="$("${psql_cmd[@]}" -At -c "insert into public.users(email,credits_balance,tariff_plan) values ('regen-release-' || gen_random_uuid() || '@example.invalid',10,'pro') returning id")"
FAIL_PROJECT="$("${psql_cmd[@]}" -At -c "insert into public.projects(user_id,niche,tone,language) values ('$FAIL_USER','release test','neutral','en') returning id")"
FAIL_BOARD="$("${psql_cmd[@]}" -At -c "insert into public.boards(project_id,title,description,status) values ('$FAIL_PROJECT','Release test','','active') returning id")"
FAIL_PIN="$("${psql_cmd[@]}" -At -c "insert into public.pins(board_id,title,description,image_url,model_used,credits_cost,aspect_ratio) values ('$FAIL_BOARD','Failure pin','','https://cdn.example.invalid/old.png','flux-schnell',1,'2:3') returning id")"
FAIL_USER_KEY="failed-regeneration-reservation-$(printf '%s' "$FAIL_USER" | tr -d '-')"
"${psql_cmd[@]}" -c "select public.begin_pin_regeneration_request('$FAIL_USER','$FAIL_PIN','$FAIL_USER_KEY','$FINGERPRINT','flux-schnell','failure test',3);" >/dev/null
FAIL_TOKEN="$("${psql_cmd[@]}" -At -c "select claim_token from public.pin_regeneration_requests where user_id='$FAIL_USER' and idempotency_key='$FAIL_USER_KEY'")"
"${psql_cmd[@]}" -c "select public.reserve_pin_regeneration_credits('$FAIL_USER','$FAIL_USER_KEY','$FAIL_TOKEN'); select public.update_pin_regeneration_request('$FAIL_USER','$FAIL_USER_KEY','$FAIL_TOKEN','failed',null,null,null,null,'provider_generation_failed');" >/dev/null
RELEASED="$("${psql_cmd[@]}" -At -c "select status from public.pin_generation_credit_reservations where user_id='$FAIL_USER' and idempotency_key='$FAIL_USER_KEY'")"
[[ "$RELEASED" == "released" ]] || { echo "Definitive provider failure did not release its reservation: $RELEASED"; exit 1; }

"${psql_cmd[@]}" -c "delete from public.pin_regeneration_requests where user_id='$FAIL_USER'; delete from public.pin_generation_credit_reservations where user_id='$FAIL_USER'; delete from public.pins where id='$FAIL_PIN'; delete from public.boards where id='$FAIL_BOARD'; delete from public.projects where id='$FAIL_PROJECT'; delete from public.users where id='$FAIL_USER';" >/dev/null

echo "Single-pin regeneration reservation integration checks passed."
