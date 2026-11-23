#!/usr/bin/env bash
# Проверка бэкапа на настоящем PostgreSQL: дамп, чтение, восстановление в пустую базу.
#
#   ./deploy/verify-backup-local.sh
#
# Что делает: поднимает ДВА временных кластера (источник и приёмник), в источнике применяет
# миграции и кладёт контрольную строку, делает дамп через deploy/backup.sh, восстанавливает
# его в приёмник и сравнивает схемы и данные. Затем удаляет оба кластера.
#
# Проверяется главное свойство бэкапа: из него действительно восстанавливается база.
# `pg_restore --list` этого не доказывает — он читает оглавление, а не данные.
#
# Переменные: PG_BIN — каталог с initdb/pg_ctl/psql/pg_restore (по умолчанию из PATH),
#             PG_TEST_PORT — порт кластера-источника (5433),
#             PG_RESTORE_PORT — порт кластера-приёмника (5434).
set -euo pipefail

PG_BIN="${PG_BIN:-}"
PG_TEST_PORT="${PG_TEST_PORT:-5433}"
PG_RESTORE_PORT="${PG_RESTORE_PORT:-5434}"
WORK_DIR="${WORK_DIR:-$(mktemp -d)}"
SRC_DIR="$WORK_DIR/src"
DST_DIR="$WORK_DIR/dst"
SRC_LOG="$WORK_DIR/src.log"
DST_LOG="$WORK_DIR/dst.log"
BACKUP_DIR="$WORK_DIR/backups"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$PG_BIN:$PATH"

fail() {
  echo "verify-backup: $1" >&2
  exit 1
}

# Полные пути к инструментам, а не PATH: в PATH этой машины первым стоит сломанный
# PostgreSQL 17, и `initdb` из него падает на отсутствующем share/postgres.bki.
to_posix() {
  local path="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$path"
  else
    printf '%s' "$path"
  fi
}

PG_BIN_POSIX=""
if [ -n "$PG_BIN" ]; then
  PG_BIN_POSIX="$(to_posix "$PG_BIN")"
fi

resolve_tool() {
  local name="$1"
  if [ -n "$PG_BIN_POSIX" ] && [ -x "$PG_BIN_POSIX/$name" ]; then
    printf '%s' "$PG_BIN_POSIX/$name"
  elif [ -n "$PG_BIN_POSIX" ] && [ -x "$PG_BIN_POSIX/$name.exe" ]; then
    printf '%s' "$PG_BIN_POSIX/$name.exe"
  elif command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
  else
    return 1
  fi
}

INITDB=""; PG_CTL=""; PSQL=""; PG_RESTORE=""; DUMP_TOOL=""
for tool in initdb pg_ctl psql pg_restore; do
  if ! resolved="$(resolve_tool "$tool")"; then
    echo "verify-backup: $tool not found; set PG_BIN to the PostgreSQL bin directory" >&2
    exit 2
  fi
  case "$tool" in
    initdb) INITDB="$resolved" ;;
    pg_ctl) PG_CTL="$resolved" ;;
    psql) PSQL="$resolved" ;;
    pg_restore) PG_RESTORE="$resolved"; DUMP_TOOL="$(resolve_tool pg_dump)" ;;
  esac
done

stop_cluster() {
  local dir="$1"
  if [ -d "$dir" ]; then
    "$PG_CTL" -D "$dir" stop -m immediate >/dev/null 2>&1 || true
  fi
}

cleanup() {
  stop_cluster "$SRC_DIR"
  stop_cluster "$DST_DIR"
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

start_cluster() {
  local dir="$1" port="$2" log="$3"
  "$INITDB" -D "$dir" -A trust -U postgres --encoding=UTF8 --no-locale >/dev/null
  "$PG_CTL" -D "$dir" -o "-p $port -c listen_addresses=127.0.0.1" -l "$log" start >/dev/null
  for _ in $(seq 1 40); do
    if "$PSQL" -h 127.0.0.1 -p "$port" -U postgres -tAc "select 1" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
  "$PSQL" -h 127.0.0.1 -p "$port" -U postgres -tAc "select 1" >/dev/null
}

# Заглушки Supabase: без них политики и гранты не применяются. В приёмнике они тоже нужны:
# в бою их создаёт сам Supabase до восстановления.
supabase_stubs() {
  local port="$1"
  "$PSQL" -h 127.0.0.1 -p "$port" -U postgres -v ON_ERROR_STOP=1 -q <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
SQL
  psql -h 127.0.0.1 -p "$port" -U postgres -v ON_ERROR_STOP=1 -q \
    -c "create extension if not exists pgcrypto;" \
    -c 'create extension if not exists "uuid-ossp";'
}

echo "verify-backup: cluster A (source) on port $PG_TEST_PORT, cluster B (restored) on port $PG_RESTORE_PORT"
start_cluster "$SRC_DIR" "$PG_TEST_PORT" "$SRC_LOG"
start_cluster "$DST_DIR" "$PG_RESTORE_PORT" "$DST_LOG"
supabase_stubs "$PG_TEST_PORT"
supabase_stubs "$PG_RESTORE_PORT"

export DATABASE_URL="postgres://postgres@127.0.0.1:$PG_TEST_PORT/postgres"
node "$REPO_ROOT/deploy/apply-migrations.cjs" >/dev/null || fail "migrations did not apply"

# Контрольная строка: после восстановления она обязана быть на месте. Схема без данных
# восстанавливается и тогда, когда данные в дамп не попали.
"$PSQL" -h 127.0.0.1 -p "$PG_TEST_PORT" -U postgres -v ON_ERROR_STOP=1 -q <<'SQL'
create table if not exists public.backup_probe (id integer primary key, note text not null);
insert into public.backup_probe (id, note) values (1, 'round trip');
SQL

echo "verify-backup: dump via deploy/backup.sh"
# PG_DUMP/PG_RESTORE — полными путями: иначе backup.sh возьмёт из PATH чужую версию.
PG_DUMP="$DUMP_TOOL" PG_RESTORE="$PG_RESTORE" BACKUP_DIR="$BACKUP_DIR" \
  bash "$REPO_ROOT/deploy/backup.sh" || fail "backup.sh failed"
DUMP="$(find "$BACKUP_DIR" -maxdepth 1 -name 'pinposy-*.dump' -type f | head -1)"
[ -n "$DUMP" ] || fail "backup.sh produced no dump file"
[ -f "$DUMP.sha256" ] || fail "no checksum sidecar next to the dump"
CHECKSUM="$(tr -d '[:space:]' < "$DUMP.sha256")"
[ "${#CHECKSUM}" -eq 64 ] || fail "checksum is not a 64-character hex digest: ${#CHECKSUM} characters"

echo "verify-backup: restore into the empty cluster"
# В приёмнике уже есть объекты Supabase (схема auth, роли, extensions) — так же, как на боевом
# сервере перед восстановлением. Поэтому восстановление идёт без --exit-on-error, но каждая
# ошибка обязана быть про уже существующий объект: любая другая означает потерянные данные.
"$PG_RESTORE" -h 127.0.0.1 -p "$PG_RESTORE_PORT" -U postgres -d postgres   --no-owner --no-privileges "$DUMP" 2>"$WORK_DIR/restore.log" || true

if grep -E '^pg_restore: (error|warning)' "$WORK_DIR/restore.log" | grep -v 'already exists' | grep -q .; then
  grep -E '^pg_restore: (error|warning)' "$WORK_DIR/restore.log" | grep -v 'already exists' >&2
  fail "pg_restore reported errors other than pre-existing Supabase objects"
fi

floor_for() {
  case "$1" in
    tables) printf '30' ;;
    policies) printf '5' ;;
    rls) printf '30' ;;
    migrations) printf '100' ;;
    *) printf '1' ;;
  esac
}

query() {
  local port="$1" sql="$2"
  "$PSQL" -h 127.0.0.1 -p "$port" -U postgres -tAc "$sql"
}

probe="$(query "$PG_RESTORE_PORT" "select note from public.backup_probe where id = 1")"
[ "$probe" = "round trip" ] || fail "the control row did not survive the dump: '$probe'"

for sql_name in \
  "tables:select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'" \
  "policies:select count(*) from pg_policies where schemaname='public'" \
  "rls:select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity" \
  "migrations:select count(*) from public.schema_migrations" ; do
  name="${sql_name%%:*}"
  sql="${sql_name#*:}"
  src="$(query "$PG_TEST_PORT" "$sql")"
  dst="$(query "$PG_RESTORE_PORT" "$sql")"
  # Нижняя граница: равенство «0 = 0» доказывает только то, что обе базы пусты.
  floor="$(floor_for "$name")"
  if [ "${src:-0}" -lt "$floor" ]; then
    fail "$name in the source is $src, expected at least $floor"
  fi
  if [ "$src" != "$dst" ]; then
    fail "$name differ after restore: source $src, restored $dst"
  fi
  echo "verify-backup: $name match ($src, floor $floor)"
done

src_versions="$(query "$PG_TEST_PORT" "select string_agg(version, ',' order by version) from public.schema_migrations")"
dst_versions="$(query "$PG_RESTORE_PORT" "select string_agg(version, ',' order by version) from public.schema_migrations")"
[ "$src_versions" = "$dst_versions" ] || fail "the applied migration list differs after restore"

if ! query "$PG_RESTORE_PORT" \
  "select 1 from information_schema.columns where table_name='users' and column_name='terms_accepted_at'" | grep -q 1; then
  fail "users.terms_accepted_at is missing in the restored database"
fi

echo "verify-backup: OK — dump restored into an empty cluster, schema and data match"
