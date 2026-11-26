#!/usr/bin/env bash
# Clone the fully migrated CI fixture before running destructive concurrency tests.
set -euo pipefail

: "${PGHOST:?PGHOST must target the local PostgreSQL service.}"
: "${PGPORT:?PGPORT must be explicit.}"
: "${PGUSER:?PGUSER must be explicit.}"
: "${PGPASSWORD:?PGPASSWORD must be supplied by the ephemeral CI service.}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required for a unique disposable database.}"
: "${GITHUB_RUN_ATTEMPT:?GITHUB_RUN_ATTEMPT is required for a unique disposable database.}"

case "$PGHOST" in 127.0.0.1|localhost|::1) ;; *) echo "Refusing: PGHOST must be loopback." >&2; exit 2 ;; esac
[[ "$PGPORT" =~ ^[0-9]{1,5}$ ]] && ((10#$PGPORT >= 1 && 10#$PGPORT <= 65535)) || { echo "Refusing: invalid PGPORT." >&2; exit 2; }
[[ "$GITHUB_RUN_ID" =~ ^[0-9]+$ && "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+$ ]] || { echo "Refusing: invalid GitHub run identity." >&2; exit 2; }

export PGDATABASE="pinposy_verify_${GITHUB_RUN_ID}_${GITHUB_RUN_ATTEMPT}"
export PINPOSY_ALLOW_DISPOSABLE_DB_TESTS=1
created=0
cleanup() {
  if [[ "$created" == "1" ]]; then
    dropdb --if-exists --force --maintenance-db=postgres -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$PGDATABASE"
    created=0
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

existing="$(psql -X -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -At -v ON_ERROR_STOP=1 -c "select 1 from pg_database where datname = '$PGDATABASE'")"
if [[ "$existing" == "1" ]]; then echo "Refusing: disposable database already exists." >&2; exit 2; fi

# Clone the migrated SQL fixture, never the shared fixture itself.
createdb --maintenance-db=postgres -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -T pinposy_test "$PGDATABASE"
created=1

scripts=(
  auth-recovery-concurrency.sh
  password-reset-issuance-concurrency.sh
  email-verification-concurrency.sh
  subscription-concurrency.sh
  credit-concurrency.sh
  payment-deletion-receipt-race-concurrency.sh
  generation-concurrency.sh
  pinterest-oauth-concurrency.sh
  pinterest-publication-concurrency.sh
  pinterest-schedule-claim-concurrency.sh
)
for script in "${scripts[@]}"; do
  echo "Running isolated concurrency test: $script"
  bash "backend/test/$script"
done
echo "All ten concurrency tests passed; disposable database cleanup follows."
