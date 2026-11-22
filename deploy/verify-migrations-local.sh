#!/usr/bin/env bash
# Проверка миграций на временном кластере PostgreSQL: ничего боевого не трогает.
#
#   ./deploy/verify-migrations-local.sh
#
# Что делает: создаёт временный кластер в каталоге под temp, включает доверительную
# аутентификацию, создаёт заглушки Supabase (роли anon/authenticated/service_role, схему auth
# с auth.uid(), extensions pgcrypto и uuid-ossp), прогоняет deploy/apply-migrations.cjs дважды
# и проверяет идемпотентность, затем удаляет кластер.
#
# Переменные: PG_BIN — каталог с initdb/pg_ctl/psql (по умолчанию берётся из PATH),
#             PG_TEST_PORT — порт временного кластера (по умолчанию 5433).
set -euo pipefail

PG_BIN="${PG_BIN:-}"
PG_TEST_PORT="${PG_TEST_PORT:-5433}"
WORK_DIR="${WORK_DIR:-$(mktemp -d)}"
DATA_DIR="$WORK_DIR/data"
LOG_FILE="$WORK_DIR/postgres.log"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

BIN=""
resolve() {
  local name="$1"
  if [ -n "$PG_BIN" ] && [ -x "$PG_BIN/$name" ]; then
    BIN="$PG_BIN/$name"
  elif command -v "$name" >/dev/null 2>&1; then
    BIN="$(command -v "$name")"
  else
    BIN=""
  fi
  [ -n "$BIN" ]
}

for tool in initdb pg_ctl psql; do
  if ! resolve "$tool"; then
    echo "verify-migrations: $tool not found; set PG_BIN to the PostgreSQL bin directory" >&2
    exit 2
  fi
done

cleanup() {
  if [ -d "$DATA_DIR" ]; then
    pg_ctl -D "$DATA_DIR" stop -m immediate >/dev/null 2>&1 || true
    rm -rf "$DATA_DIR"
  fi
}
trap cleanup EXIT

echo "verify-migrations: creating a throwaway cluster in $DATA_DIR"
initdb -D "$DATA_DIR" -A trust -U postgres --encoding=UTF8 --no-locale >/dev/null

pg_ctl -D "$DATA_DIR" -o "-p $PG_TEST_PORT -c listen_addresses=127.0.0.1" -l "$LOG_FILE" start >/dev/null
for _ in $(seq 1 40); do
  if psql -h 127.0.0.1 -p "$PG_TEST_PORT" -U postgres -tAc "select 1" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
psql -h 127.0.0.1 -p "$PG_TEST_PORT" -U postgres -tAc "select 1" >/dev/null

# Заглушки Supabase: без них политики и гранты не применяются.
psql -h 127.0.0.1 -p "$PG_TEST_PORT" -U postgres -v ON_ERROR_STOP=1 -q <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
SQL
psql -h 127.0.0.1 -p "$PG_TEST_PORT" -U postgres -v ON_ERROR_STOP=1 -q \
  -c "create extension if not exists pgcrypto;" \
  -c 'create extension if not exists "uuid-ossp";'

export DATABASE_URL="postgres://postgres@127.0.0.1:$PG_TEST_PORT/postgres"

echo "verify-migrations: first run (all migrations)"
node "$REPO_ROOT/deploy/apply-migrations.cjs"

echo "verify-migrations: second run (must apply nothing)"
SECOND="$(node "$REPO_ROOT/deploy/apply-migrations.cjs" | tail -1)"
case "$SECOND" in
  *"0 applied"*) echo "verify-migrations: idempotent — $SECOND" ;;
  *) echo "verify-migrations: second run applied something again: $SECOND" >&2; exit 1 ;;
esac

APPLIED="$(psql -h 127.0.0.1 -p "$PG_TEST_PORT" -U postgres -tAc "select count(*) from public.schema_migrations")"
if [ "${APPLIED:-0}" -lt 100 ]; then
  echo "verify-migrations: only $APPLIED migrations recorded; expected the whole history" >&2
  exit 1
fi

if ! psql -h 127.0.0.1 -p "$PG_TEST_PORT" -U postgres -tAc \
  "select 1 from information_schema.columns where table_name='users' and column_name='terms_accepted_at'" | grep -q 1; then
  echo "verify-migrations: users.terms_accepted_at is missing after the full history" >&2
  exit 1
fi

echo "verify-migrations: OK — $APPLIED migrations applied and idempotent on PostgreSQL"
