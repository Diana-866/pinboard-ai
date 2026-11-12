#!/usr/bin/env bash
#
# One command that answers "does this repository still work?".
#
# GitHub Actions cannot run on this account right now (the runners are blocked by
# a billing/spending limit), so this script is the gate that replaces CI: it runs
# exactly what the workflow would run, plus the migration replay, and stops at the
# first failure with a readable summary.
#
#   ./scripts/verify.sh              # backend + frontend
#   ./scripts/verify.sh --migrations # replay db/migrations + scheduler SQL integration test on local PG
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0
SUMMARY=()
SCRATCH_DIRS=()

cleanup() {
  for dir in "${SCRATCH_DIRS[@]:-}"; do
    [ -n "${dir:-}" ] && rm -rf "$dir"
  done
}
trap cleanup EXIT

run_step() {
  local name="$1"
  shift
  printf '\n▶ %s\n' "$name"
  if "$@"; then
    SUMMARY+=("PASS  $name")
  else
    SUMMARY+=("FAIL  $name")
    FAILED=1
  fi
}

install_deps() {
  local dir="$1"
  if [ -d "$dir/node_modules" ]; then
    return 0
  fi
  (cd "$dir" && npm ci --no-audit --no-fund)
}

backend_checks() {
  install_deps "$ROOT/backend" || return 1
  (cd "$ROOT/backend" && node --check index.js && npm test)
}

frontend_checks() {
  install_deps "$ROOT/frontend" || return 1
  (cd "$ROOT/frontend" && npm run lint && npm test && npm run build)
}

migration_replay() {
  if ! command -v psql >/dev/null 2>&1; then
    echo "psql not found — --migrations requires a PostgreSQL client; install PostgreSQL or run this check in a PostgreSQL-enabled environment"
    return 1
  fi
  local db="pinposy_verify_$$"
  local psql_cmd=(psql -q -v ON_ERROR_STOP=1)
  if [ "$(id -u)" = "0" ]; then
    :
  else
    psql_cmd=(sudo -u postgres "${psql_cmd[@]}")
  fi

  # Postgres runs as its own user and cannot traverse a private home directory,
  # so the SQL is copied to a world-readable scratch directory first.
  local scratch
  scratch="$(mktemp -d)"
  SCRATCH_DIRS+=("$scratch")
  cp -r "$ROOT/db/migrations" "$ROOT/db/supabase-stub.sql" "$ROOT/backend/test/pinterest-scheduler-completion-fencing.integration.sql" "$scratch/" 2>/dev/null || {
    echo "missing db/migrations or db/supabase-stub.sql"
    return 1
  }
  chmod -R a+rX "$scratch"

  "${psql_cmd[@]}" -c "drop database if exists ${db}" -c "create database ${db}" >/dev/null || return 1
  "${psql_cmd[@]}" -d "$db" -f "$scratch/supabase-stub.sql" >/dev/null || return 1
  local failed=0
  for migration in "$scratch"/migrations/*.sql; do
    if ! "${psql_cmd[@]}" -d "$db" -f "$migration" >/dev/null 2>&1; then
      echo "migration failed: $(basename "$migration")"
      failed=1
      break
    fi
  done
  if [ "$failed" -eq 0 ]; then
    echo "▶ scheduler monitor integration (completion fencing + stale takeover)"
    if ! "${psql_cmd[@]}" -d "$db" -f "$scratch/pinterest-scheduler-completion-fencing.integration.sql"; then
      echo "scheduler monitor integration failed"
      failed=1
    fi
  fi
  "${psql_cmd[@]}" -c "drop database if exists ${db}" >/dev/null 2>&1
  return $failed
}

run_step "backend (node --check + tests)" backend_checks
run_step "frontend (tsc + tests + build)" frontend_checks

if [ "${1:-}" = "--migrations" ]; then
  run_step "migrations (replay on a scratch database)" migration_replay
fi

printf '\n──────── summary ────────\n'
for line in "${SUMMARY[@]}"; do printf '%s\n' "$line"; done

exit $FAILED
