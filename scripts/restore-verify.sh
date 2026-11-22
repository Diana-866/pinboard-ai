#!/usr/bin/env bash
#
# Проверка резервной копии PinPosy восстановлением на отдельную одноразовую базу.
#
#   PGHOST=127.0.0.1 PGUSER=postgres ./scripts/restore-verify.sh --dump backups/pinposy_20260101T000000Z.dump
#
# Что делает: создаёт временную базу рядом с локальным сервером, восстанавливает в неё копию,
# сверяет число строк в ключевых таблицах с исходным дампом (по данным самого дампа — через
# восстановление), печатает итог, удаляет временную базу. Рабочие базы не затрагиваются.
#
# Скрипт намеренно отказывается работать без PGHOST: восстановление «куда-нибудь в production»
# — это не проверка копии.
set -uo pipefail

DUMP=""
MIN_CORE_ROWS=1

usage() {
  cat <<'USAGE'
Usage: scripts/restore-verify.sh --dump <file> [options]

  --dump <file>    Файл резервной копии (pg_dump custom)
  --min-rows <n>   Минимум строк в таблице users (по умолчанию 1)
  -h, --help       Эта справка

Требуется локальный PostgreSQL и права на создание базы:
  PGHOST, PGPORT (5432), PGUSER, PGPASSWORD (если нужен).
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dump) DUMP="${2:-}"; shift 2 ;;
    --min-rows) MIN_CORE_ROWS="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "$DUMP" ] || { echo "error: --dump is required" >&2; exit 2; }
[ -f "$DUMP" ] || { echo "error: file not found: $DUMP" >&2; exit 2; }
case "$MIN_CORE_ROWS" in ''|*[!0-9]*) echo "error: --min-rows must be a non-negative integer" >&2; exit 2 ;; esac
[ -n "${PGHOST:-}" ] || { echo "error: PGHOST is required (локальный сервер для проверки)" >&2; exit 2; }
command -v psql >/dev/null 2>&1 || { echo "error: psql not found" >&2; exit 2; }
command -v pg_restore >/dev/null 2>&1 || { echo "error: pg_restore not found" >&2; exit 2; }

DB="pinposy_restore_verify_$$_$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')"
CLEANED=0

cleanup() {
  if [ "$CLEANED" -eq 0 ]; then
    psql -X -q -d postgres -c "DROP DATABASE IF EXISTS \"$DB\"" >/dev/null 2>&1 || true
    CLEANED=1
  fi
}
trap cleanup EXIT INT TERM

echo "▶ создание временной базы $DB на $PGHOST"
psql -X -q -d postgres -c "CREATE DATABASE \"$DB\"" >/dev/null 2>&1 || {
  echo "FAIL  не удалось создать временную базу; существующие базы не тронуты" >&2
  exit 1
}

echo "▶ восстановление копии"
if ! pg_restore --no-owner --no-privileges --exit-on-error -d "$DB" "$DUMP" >/tmp/restore-verify.log 2>&1; then
  echo "FAIL  восстановление завершилось с ошибкой:" >&2
  tail -20 /tmp/restore-verify.log >&2
  exit 1
fi

FAILED=0
check_rows() {
  local table="$1" min="$2" actual
  actual="$(psql -X -q -tA -d "$DB" -c "select count(*) from public.\"$table\"" 2>/dev/null)"
  if [ -z "$actual" ]; then
    echo "FAIL  таблица $table не восстановлена"
    FAILED=1
  elif [ "$actual" -lt "$min" ]; then
    echo "FAIL  таблица $table: строк $actual, ожидалось не меньше $min"
    FAILED=1
  else
    printf 'PASS  %-28s rows=%s\n' "$table" "$actual"
  fi
}

echo "▶ сверка ключевых таблиц"
check_rows users "$MIN_CORE_ROWS"
check_rows projects 0
check_rows boards 0
check_rows pins 0
check_rows credit_transactions 0
check_rows subscriptions 0

if [ "$FAILED" -ne 0 ]; then
  echo "ИТОГ: копия не прошла проверку восстановления" >&2
  exit 1
fi

echo "ИТОГ: копия восстанавливается, ключевые таблицы на месте"
