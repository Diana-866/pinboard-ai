#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=pinposy_test}"
export PGHOST PGPORT PGUSER PGDATABASE
psql_cmd=(psql -X -v ON_ERROR_STOP=1 -q)

USER_ID="$("${psql_cmd[@]}" -At -c "insert into public.users(email,credits_balance,tariff_plan) values ('reservation-resize-' || gen_random_uuid() || '@example.invalid',20,'pro') returning id")"
PROJECT_ID="$("${psql_cmd[@]}" -At -c "insert into public.projects(user_id,niche,tone,language) values ('$USER_ID','resize test','neutral','en') returning id")"
BOARD_ID="$("${psql_cmd[@]}" -At -c "insert into public.boards(project_id,title,description,status) values ('$PROJECT_ID','Reservation resize test','','active') returning id")"
KEY_A="reservation-resize-a-$(printf '%s' "$USER_ID" | tr -d '-')"
KEY_B="reservation-resize-b-$(printf '%s' "$USER_ID" | tr -d '-')"
FINGERPRINT="$(printf 'c%.0s' {1..64})"

cleanup() {
  "${psql_cmd[@]}" -c "delete from public.pin_generation_requests where user_id='$USER_ID'; delete from public.pin_generation_credit_reservations where user_id='$USER_ID'; delete from public.boards where id='$BOARD_ID'; delete from public.projects where id='$PROJECT_ID'; delete from public.credit_transactions where user_id='$USER_ID'; delete from public.users where id='$USER_ID';" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${psql_cmd[@]}" -c "select public.begin_pin_generation_request('$USER_ID','$BOARD_ID','$KEY_A','$FINGERPRINT'); select public.begin_pin_generation_request('$USER_ID','$BOARD_ID','$KEY_B','$FINGERPRINT');" >/dev/null
TOKEN_A="$("${psql_cmd[@]}" -At -c "select claim_token from public.pin_generation_requests where user_id='$USER_ID' and idempotency_key='$KEY_A'")"
"${psql_cmd[@]}" -c "select public.reserve_pin_generation_credits('$USER_ID','$KEY_A',5); select public.reserve_pin_generation_credits('$USER_ID','$KEY_B',6);" >/dev/null

# Exact quote may increase the first reservation, but cannot consume the
# second request's reserved balance.
"${psql_cmd[@]}" -c "select public.resize_pin_generation_credit_reservation('$USER_ID','$KEY_A','$TOKEN_A',14);" >/dev/null
AMOUNT_AFTER_GROW="$("${psql_cmd[@]}" -At -c "select amount from public.pin_generation_credit_reservations where user_id='$USER_ID' and idempotency_key='$KEY_A'")"
[[ "$AMOUNT_AFTER_GROW" == "14" ]] || { echo "Reservation did not grow to exact quote ceiling: $AMOUNT_AFTER_GROW"; exit 1; }

# A larger amount than the remaining available balance must fail atomically.
if "${psql_cmd[@]}" -c "select public.resize_pin_generation_credit_reservation('$USER_ID','$KEY_A','$TOKEN_A',15);" >/dev/null 2>&1; then
  echo "Reservation resize overspent the available balance"
  exit 1
fi
AMOUNT_AFTER_REJECT="$("${psql_cmd[@]}" -At -c "select amount from public.pin_generation_credit_reservations where user_id='$USER_ID' and idempotency_key='$KEY_A'")"
[[ "$AMOUNT_AFTER_REJECT" == "14" ]] || { echo "Rejected resize mutated reservation: $AMOUNT_AFTER_REJECT"; exit 1; }

# Shrinking is allowed, and stale owners cannot alter the reservation.
"${psql_cmd[@]}" -c "select public.resize_pin_generation_credit_reservation('$USER_ID','$KEY_A','$TOKEN_A',8);" >/dev/null
if "${psql_cmd[@]}" -c "select public.resize_pin_generation_credit_reservation('$USER_ID','$KEY_A',gen_random_uuid(),9);" >/dev/null 2>&1; then
  echo "Stale claim resized the generation reservation"
  exit 1
fi
FINAL_AMOUNT="$("${psql_cmd[@]}" -At -c "select amount from public.pin_generation_credit_reservations where user_id='$USER_ID' and idempotency_key='$KEY_A'")"
BALANCE="$("${psql_cmd[@]}" -At -c "select credits_balance from public.users where id='$USER_ID'")"
OTHER_RESERVED="$("${psql_cmd[@]}" -At -c "select amount from public.pin_generation_credit_reservations where user_id='$USER_ID' and idempotency_key='$KEY_B'")"
[[ "$FINAL_AMOUNT|$BALANCE|$OTHER_RESERVED" == "8|20|6" ]] || { echo "Unexpected resize state: $FINAL_AMOUNT|$BALANCE|$OTHER_RESERVED"; exit 1; }

echo "Generation reservation resize integration checks passed."
