#!/usr/bin/env bash
#
# One command that answers "does this repository still work?".
# GitHub Actions jobs currently fail before their first step.
#
#   ./scripts/verify.sh
#   ./scripts/verify.sh --migrations
#   ./scripts/verify.sh --migrations-only
#   ./scripts/verify.sh --migrations-only --postgres-port 5433
#
# Migration replay is restricted to the local PostgreSQL Unix socket. It never
# follows PGHOST, and the explicit port overrides PGPORT.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0
SUMMARY=()
SCRATCH_DIRS=()
POSTGRES_PORT=5432
RUN_MIGRATIONS=0
MIGRATIONS_ONLY=0
MIGRATION_DB_NAME=""
MIGRATION_DB_CREATED=0
MIGRATION_PSQL_CMD=()

usage() {
  cat <<'USAGE'
Usage: scripts/verify.sh [--migrations] [--migrations-only] [--postgres-port PORT]
  --migrations       Also replay the canonical baseline and active SQL migrations.
  --migrations-only  Run only the disposable PostgreSQL migration replay.
  --postgres-port    Local PostgreSQL port (default: 5432).
USAGE
}

while (($#)); do
  case "$1" in
    --migrations)
      RUN_MIGRATIONS=1
      shift
      ;;
    --migrations-only)
      RUN_MIGRATIONS=1
      MIGRATIONS_ONLY=1
      shift
      ;;
    --postgres-port)
      if (($# < 2)) || [[ ! "$2" =~ ^[0-9]{1,5}$ ]]; then
        echo "--postgres-port requires an integer from 1 to 65535." >&2
        exit 2
      fi
      POSTGRES_PORT=$((10#$2))
      if ((POSTGRES_PORT < 1 || POSTGRES_PORT > 65535)); then
        echo "--postgres-port must be between 1 and 65535." >&2
        exit 2
      fi
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

cleanup() {
  if ((MIGRATION_DB_CREATED)); then
    echo "Cleaning up disposable database: $MIGRATION_DB_NAME"
    if "${MIGRATION_PSQL_CMD[@]}" -d postgres -c "DROP DATABASE \"$MIGRATION_DB_NAME\"" >/dev/null 2>&1; then
      MIGRATION_DB_CREATED=0
    else
      echo "WARNING: failed to remove disposable database $MIGRATION_DB_NAME; inspect it manually." >&2
    fi
  fi
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
    echo "psql not found — install PostgreSQL client tools and rerun this command."
    return 1
  fi
  if [ ! -d /var/run/postgresql ]; then
    echo "Local PostgreSQL socket directory /var/run/postgresql was not found; refusing to use PGHOST or a remote endpoint."
    return 1
  fi

  local psql_base=(psql -X -q -h /var/run/postgresql -p "$POSTGRES_PORT" -v ON_ERROR_STOP=1)
  if [ "$(id -u)" = "0" ]; then
    if command -v runuser >/dev/null 2>&1; then
      MIGRATION_PSQL_CMD=(runuser -u postgres -- "${psql_base[@]}")
    elif command -v sudo >/dev/null 2>&1; then
      MIGRATION_PSQL_CMD=(sudo -u postgres "${psql_base[@]}")
    else
      echo "need runuser or sudo to connect as the local postgres OS user"
      return 1
    fi
  elif [ "$(id -un)" = "postgres" ]; then
    MIGRATION_PSQL_CMD=("${psql_base[@]}")
  elif command -v sudo >/dev/null 2>&1; then
    MIGRATION_PSQL_CMD=(sudo -u postgres "${psql_base[@]}")
  else
    echo "need to run as postgres or have sudo access to the local postgres OS user"
    return 1
  fi

  local scratch
  scratch="$(mktemp -d)" || return 1
  SCRATCH_DIRS+=("$scratch")
  cp -r "$ROOT/db/migrations" "$ROOT/db/supabase-stub.sql" "$scratch/" 2>/dev/null || {
    echo "missing db/migrations or db/supabase-stub.sql"
    return 1
  }
  chmod -R a+rX "$scratch"

  local baseline="$scratch/migrations/001_baseline.sql"
  if [ ! -f "$baseline" ] || [ ! -f "$scratch/supabase-stub.sql" ]; then
    echo "canonical baseline or Supabase test stubs are missing"
    return 1
  fi

  shopt -s nullglob
  local all_migrations=("$scratch"/migrations/[0-9][0-9][0-9]_*.sql)
  shopt -u nullglob
  local active_migrations=()
  local migration base prefix
  for migration in "${all_migrations[@]}"; do
    base="$(basename "$migration")"
    prefix="${base%%_*}"
    if [[ "$prefix" =~ ^[0-9]{3}$ ]] && ((10#$prefix >= 10)); then
      active_migrations+=("$migration")
    fi
  done

  local expected_sequence=""
  local actual_sequence=""
  local version expected_prefix
  for ((version=10; version<=166; version++)); do
    printf -v expected_prefix '%03d' "$version"
    expected_sequence+="$expected_prefix,"
  done
  for migration in "${active_migrations[@]}"; do
    base="$(basename "$migration")"
    actual_sequence+="${base%%_*},"
  done
  if (("${#active_migrations[@]}" != 157)) || [[ "$actual_sequence" != "$expected_sequence" ]]; then
    echo "Expected exactly the contiguous migration sequence 010-166 (157 files); found ${#active_migrations[@]} files: ${actual_sequence%,}. Refusing replay."
    return 1
  fi

  local suffix
  suffix="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')" || return 1
  if [[ ! "$suffix" =~ ^[0-9a-f]{8}$ ]]; then
    echo "Could not generate a unique disposable database suffix."
    return 1
  fi
  MIGRATION_DB_NAME="pinposy_verify_${BASHPID:-$$}_$suffix"

  echo "Creating disposable local database: $MIGRATION_DB_NAME (socket /var/run/postgresql, port $POSTGRES_PORT)"
  if ! "${MIGRATION_PSQL_CMD[@]}" -d postgres -c "CREATE DATABASE \"$MIGRATION_DB_NAME\"" >/dev/null; then
    echo "Could not create the disposable database; no existing database was dropped."
    return 1
  fi
  MIGRATION_DB_CREATED=1

  local failed=0
  if ! "${MIGRATION_PSQL_CMD[@]}" -d "$MIGRATION_DB_NAME" -f "$scratch/supabase-stub.sql" >/dev/null; then
    echo "Supabase test stubs failed"
    failed=1
  fi
  if [ "$failed" -eq 0 ]; then
    if ! "${MIGRATION_PSQL_CMD[@]}" -d "$MIGRATION_DB_NAME" -f "$baseline" >/dev/null 2>&1; then
      echo "migration failed: 001_baseline.sql"
      failed=1
    fi
  fi
  if [ "$failed" -eq 0 ]; then
    for migration in "${active_migrations[@]}"; do
      base="$(basename "$migration")"
      echo "  Applying $base"
      if ! "${MIGRATION_PSQL_CMD[@]}" -d "$MIGRATION_DB_NAME" -f "$migration" >/dev/null 2>&1; then
        echo "migration failed: $base"
        failed=1
        break
      fi
    done
  fi

  if ! "${MIGRATION_PSQL_CMD[@]}" -d postgres -c "DROP DATABASE \"$MIGRATION_DB_NAME\"" >/dev/null 2>&1; then
    echo "WARNING: failed to remove disposable database $MIGRATION_DB_NAME; cleanup will retry." >&2
    failed=1
  else
    MIGRATION_DB_CREATED=0
  fi
  return "$failed"
}

if ((MIGRATIONS_ONLY == 0)); then
  run_step "backend (node --check + tests)" backend_checks
  run_step "frontend (lint + tests + build)" frontend_checks
fi

if ((RUN_MIGRATIONS)); then
  run_step "migrations (replay on a disposable local PostgreSQL database)" migration_replay
fi

printf '\n──────── summary ────────\n'
for line in "${SUMMARY[@]}"; do printf '%s\n' "$line"; done

exit "$FAILED"
