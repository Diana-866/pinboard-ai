#!/usr/bin/env bash
# Shared safety preflight for destructive PostgreSQL concurrency tests.
set -euo pipefail
: "${PGHOST:?Set PGHOST to 127.0.0.1, localhost or ::1 for a disposable local PostgreSQL cluster.}"
: "${PGPORT:?Set PGPORT explicitly to the disposable PostgreSQL port.}"
: "${PGUSER:?Set PGUSER explicitly to the disposable test role.}"
: "${PGDATABASE:?Set PGDATABASE to a unique pinposy_verify_<suffix> disposable database.}"
: "${PINPOSY_ALLOW_DISPOSABLE_DB_TESTS:?Set PINPOSY_ALLOW_DISPOSABLE_DB_TESTS=1 only for a disposable test database.}"
[[ "$PINPOSY_ALLOW_DISPOSABLE_DB_TESTS" == "1" ]] || { echo "Refusing tests: explicit disposable-database opt-in is required." >&2; exit 2; }
case "$PGHOST" in localhost|127.0.0.1|::1) ;; *) echo "Refusing tests: PGHOST must be loopback." >&2; exit 2 ;; esac
[[ "$PGPORT" =~ ^[0-9]{1,5}$ ]] && ((10#$PGPORT >= 1 && 10#$PGPORT <= 65535)) || { echo "Refusing tests: invalid PGPORT." >&2; exit 2; }
[[ "$PGDATABASE" =~ ^pinposy_verify_[A-Za-z0-9_]+$ ]] || { echo "Refusing tests: PGDATABASE must match pinposy_verify_<suffix>." >&2; exit 2; }
export PGHOST PGPORT PGUSER PGDATABASE
unset PGSERVICE PGSERVICEFILE
psql_base=(psql -X -v ON_ERROR_STOP=1 -q -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE")
identity="$("${psql_base[@]}" -At -F '|' -c "select current_database(), coalesce(inet_server_addr()::text, 'local-socket')")"
actual_database="${identity%%|*}"
actual_address="${identity#*|}"
[[ "$actual_database" == "$PGDATABASE" ]] || { echo "Refusing tests: connected database does not match PGDATABASE." >&2; exit 2; }
if [[ "$actual_address" == 127.* || "$actual_address" == "::1" ]]; then
  :
elif [[ "$actual_address" =~ ^172\.(1[6-9]|2[0-9]|3[0-1])\.([0-9]{1,3})\.([0-9]{1,3})/32$ ]]; then
  bridge_octet_3="${BASH_REMATCH[2]}"
  bridge_octet_4="${BASH_REMATCH[3]}"
  if (( 10#${bridge_octet_3} > 255 || 10#${bridge_octet_4} > 255 )) ||
     [[ "${GITHUB_ACTIONS:-}" != "true" ]] ||
     [[ ! "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ ]] ||
     [[ ! "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]] ||
     [[ "$PGDATABASE" != "pinposy_verify_${GITHUB_RUN_ID}_${GITHUB_RUN_ATTEMPT}" ]]; then
    echo "Refusing tests: Docker bridge PostgreSQL is allowed only for this run's exact disposable CI database." >&2
    exit 2
  fi
else
  echo "Refusing tests: PostgreSQL server address '$actual_address' is not an allowed loopback or isolated CI bridge." >&2
  exit 2
fi
TEST_TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pinposy-concurrency.XXXXXX")"
cleanup_test_tmp_dir() {
  if [[ -n "${TEST_TMP_DIR:-}" && -d "$TEST_TMP_DIR" && "$TEST_TMP_DIR" == "${TMPDIR:-/tmp}"/pinposy-concurrency.* ]]; then
    rm -rf -- "$TEST_TMP_DIR"
  fi
}
stop_test_children() {
  local pids pid
  pids="$(jobs -pr || true)"
  if [[ -n "$pids" ]]; then
    while IFS= read -r pid; do [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true; done <<< "$pids"
    while IFS= read -r pid; do [[ -n "$pid" ]] && wait "$pid" 2>/dev/null || true; done <<< "$pids"
  fi
}
