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
actual_address="${actual_address%%/*}"
case "$actual_address" in
  127.*|::1) ;;
  10.*|192.168.*|172.16.*|172.17.*|172.18.*|172.19.*|172.2[0-9].*|172.30.*|172.31.*)
    [[ "$PINPOSY_ALLOW_DISPOSABLE_DB_TESTS" == "1" && "$PGDATABASE" =~ ^pinposy_verify_[0-9]+_[0-9]+$ ]] || {
      echo "Refusing tests: private PostgreSQL address requires the unique CI disposable database." >&2
      exit 2
    }
    ;;
  *) echo "Refusing tests: PostgreSQL server address '$actual_address' is not loopback or a private CI address." >&2; exit 2 ;;
esac
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
