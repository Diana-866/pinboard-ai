#!/usr/bin/env bash
#
# Разворачивание схемы PinPosy на новой базе одной командой.
#
#   DATABASE_URL="postgresql://user:pass@host:5432/db" ./scripts/provision-environment.sh
#   DATABASE_URL="..." ./scripts/provision-environment.sh --base-url https://new-backend --yes
#
# Что делает: проверяет, что база пустая (иначе отказывается — чтобы не наложить схему на живые
# данные), при необходимости создаёт роли Supabase, применяет baseline и все миграции по порядку,
# сверяет результат, печатает список обязательных переменных окружения и, если задан адрес,
# прогоняет smoke-проверку бэкенда.
#
# Скрипт намеренно не умеет менять существующую базу: миграции forward-only, а «докатить» их на
# чужую схему — решение человека, а не автоматики.
#
# Коды выхода: 0 — среда готова, 1 — ошибка применения, 2 — неверные аргументы/условия.
set -Eeuo pipefail

DATABASE_URL="${DATABASE_URL:-}"
BASE_URL=""
ASSUME_YES=0
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage: ./scripts/provision-environment.sh --database-url <url> [options]

  --database-url <url>   Строка подключения к новой базе (или переменная DATABASE_URL)
  --base-url <url>       Адрес бэкенда для smoke-проверки после применения схемы
  --yes                  Не спрашивать подтверждение
  -h, --help             Эта справка
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --database-url) DATABASE_URL="${2:-}"; shift 2 ;;
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "$DATABASE_URL" ] || { echo "error: нужна строка подключения (--database-url или DATABASE_URL)" >&2; exit 2; }
command -v psql >/dev/null 2>&1 || { echo "error: psql not found in PATH" >&2; exit 2; }

psql_run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_URL" "$@"; }

echo "▶ проверка базы"
if ! psql_run -tAc "select 1" >/dev/null 2>&1; then
  echo "FAIL  база недоступна по указанной строке подключения" >&2
  exit 2
fi

EXISTING="$(psql_run -tAc "select count(*) from information_schema.tables where table_schema='public'" | tr -d ' ')"
if [ "$EXISTING" != "0" ]; then
  echo "FAIL  в базе уже есть $EXISTING таблиц в схеме public — скрипт не накладывает схему на существующую базу" >&2
  echo "      Для проверки используйте отдельную пустую базу; для обновления схемы — миграции вручную." >&2
  exit 2
fi

if [ "$ASSUME_YES" -ne 1 ]; then
  printf 'Применить %s миграций к ПУСТОЙ базе? [y/N] ' "$(ls "$ROOT"/db/migrations/0[1-9][0-9]_*.sql "$ROOT"/db/migrations/1[0-6][0-9]_*.sql | grep -vc 001_baseline)"
  read -r answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "отменено"; exit 2 ;;
  esac
fi

echo "▶ роли Supabase"
# На «чистом» PostgreSQL baseline требует роли anon/authenticated/service_role и auth.uid().
# На управляемом Supabase они уже есть, поэтому ошибка «роль существует» здесь ожидаема.
if ! psql_run -f "$ROOT/db/supabase-stub.sql" >/tmp/provision-roles.log 2>&1; then
  if grep -q "already exists" /tmp/provision-roles.log; then
    echo "  роли уже существуют — пропускаю"
  else
    echo "FAIL  не удалось подготовить роли:" >&2
    tail -10 /tmp/provision-roles.log >&2
    exit 1
  fi
fi

echo "▶ baseline"
psql_run -f "$ROOT/db/migrations/001_baseline.sql" >/dev/null

echo "▶ миграции"
APPLIED=0
for migration in $(ls "$ROOT"/db/migrations/0[1-9][0-9]_*.sql "$ROOT"/db/migrations/1[0-6][0-9]_*.sql | grep -v 001_baseline | sort); do
  if ! psql_run -f "$migration" >/tmp/provision-migration.log 2>&1; then
    echo "FAIL  миграция $(basename "$migration")" >&2
    tail -15 /tmp/provision-migration.log >&2
    exit 1
  fi
  APPLIED=$((APPLIED + 1))
done
echo "  применено миграций: $APPLIED"

echo "▶ проверка результата"
TABLES="$(psql_run -tAc "select count(*) from information_schema.tables where table_schema='public'" | tr -d ' ')"
FUNCTIONS="$(psql_run -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" | tr -d ' ')"
if [ "$TABLES" -lt 30 ]; then
  echo "FAIL  таблиц $TABLES, ожидалось не меньше 30" >&2
  exit 1
fi
printf 'PASS  таблиц: %s, функций: %s\n' "$TABLES" "$FUNCTIONS"

echo "▶ переменные окружения, которые понадобятся бэкенду"
printf '%s\n' \
  "  DATABASE_URL            — строка подключения (для сервисов и бэкапов)" \
  "  SUPABASE_URL            — адрес REST-слоя (PostgREST), заканчивается без /rest/v1" \
  "  SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY" \
  "  JWT_SECRET              — не короче 32 байт" \
  "  FRONTEND_URL, PUBLIC_BACKEND_URL, BACKEND_URL" \
  "  PINPOSY_SCHEDULER_SECRET, ADMIN_SECRET" \
  "  GPTUNNEL_API_KEY        — без него генерация отвечает 503" \
  "  PRODAMUS_SHOP_ID, PRODAMUS_SECRET, PRODAMUS_SECRET_WEBHOOK" \
  "  PINTEREST_CLIENT_ID, PINTEREST_CLIENT_SECRET, PINTEREST_REDIRECT_URI, PINTEREST_TOKEN_ENCRYPTION_KEY" \
  "  MAIL_SMTP_HOST/PORT/USER/PASS/FROM — без них письма не уходят" \
  "  PIN_IMAGE_PUBLIC_BASE_URL — префикс ссылок на изображения после переезда Storage" \
  "  ACCOUNT_DELETION_WORKER_ENABLED=true — иначе удаление аккаунта отклоняется (fail-closed)"

if [ -n "$BASE_URL" ]; then
  echo "▶ smoke-проверка бэкенда"
  "$ROOT/scripts/smoke-backend.sh" --base-url "$BASE_URL" --expect-ready ok
fi

echo "ИТОГ: среда готова. Следующий шаг — заполнить переменные и запустить backend, затем scripts/bench-e2e.sh на staging."
