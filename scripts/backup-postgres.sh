#!/usr/bin/env bash
#
# Резервная копия базы PinPosy.
#
#   DATABASE_URL="postgresql://user:pass@host:5432/db" ./scripts/backup-postgres.sh
#   BACKUP_DIR=/var/backups/pinposy KEEP_DAYS=14 KEEP_COUNT=7 ./scripts/backup-postgres.sh
#
# Что делает:
#   1. берёт снапшот (REPEATABLE READ + pg_export_snapshot) и снимает дамп ровно из него;
#   2. в этом же снапшоте считает манифест — счётчики строк, max(id), версию сервера,
#      расширения, роли, последовательности, RLS и права (scripts/lib/backup-manifest.sql);
#   3. полностью распаковывает архив (pg_restore --file=/dev/null) — проверка целостности,
#      а не только читаемости оглавления;
#   4. считает sha256 и пишет строку результата в $BACKUP_DIR/backup.log;
#   5. удаляет только те копии, что одновременно старше KEEP_DAYS и не входят в KEEP_COUNT
#      последних.
#
# Права: umask 077 и каталог 700 — в дампе персональные данные, читать его может только владелец.
# Копия без проверки восстановления копией не считается: scripts/restore-verify.sh
# (см. docs/RUNBOOK_BACKUP_RESTORE.md).
#
# --no-owner без --no-privileges: приложение ходит в базу под ролями anon/authenticated
# через PostgREST, поэтому GRANT и RLS обязаны быть в копии. Восстановление проверяется
# на кластере, где эти роли уже созданы (иначе restore-verify скажет об этом прямо).
set -Eeuo pipefail
umask 077

DATABASE_URL="${DATABASE_URL:-}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
KEEP_COUNT="${KEEP_COUNT:-7}"

MANIFEST_SQL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/backup-manifest.sql"

log_line() {
  # $1 — JSON-объект строки журнала; ошибки записи не должны маскировать исходную ошибку.
  [ -n "${LOG_FILE:-}" ] || return 0
  printf '%s\n' "$1" >>"$LOG_FILE" 2>/dev/null || true
}

die() {
  echo "FAIL  $*" >&2
  log_line "$(jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg dump "${FILE:-}" \
    --arg error "$*" '{ts:$ts,dump:$dump,status:"FAIL",error:$error}')"
  exit 1
}

if [ -z "$DATABASE_URL" ]; then
  echo "error: DATABASE_URL is required (строка подключения PostgreSQL)" >&2
  echo "       пример: postgresql://user:pass@db.example.com:5432/postgres" >&2
  exit 2
fi
[ -r "$MANIFEST_SQL" ] || { echo "error: не найден $MANIFEST_SQL" >&2; exit 2; }
for tool in pg_dump pg_restore psql sha256sum flock jq timeout; do
  command -v "$tool" >/dev/null 2>&1 || { echo "error: $tool not found in PATH" >&2; exit 2; }
done
case "$KEEP_DAYS" in ''|*[!0-9]*) echo "error: KEEP_DAYS must be a non-negative integer" >&2; exit 2 ;; esac
case "$KEEP_COUNT" in ''|*[!0-9]*) echo "error: KEEP_COUNT must be a non-negative integer" >&2; exit 2 ;; esac
[ "$KEEP_COUNT" -ge 1 ] || { echo "error: KEEP_COUNT must be >= 1" >&2; exit 2; }

mkdir -p "$BACKUP_DIR" || die "cannot create $BACKUP_DIR"
chmod 700 "$BACKUP_DIR" || die "cannot chmod 700 $BACKUP_DIR"

LOG_FILE="$BACKUP_DIR/backup.log"

# Один бэкап за раз: два параллельных pg_dump на большой базе дают лишнюю нагрузку
# и могут одновременно крутить ротацию.
exec 9>"$BACKUP_DIR/.lock" || die "cannot open lock file"
flock -n 9 || die "уже идёт другой бэкап (lock: $BACKUP_DIR/.lock)"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pinposy-backup.XXXXXX")"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/pinposy_${STAMP}.dump"
PARTIAL="$FILE.part"
MANIFEST="$FILE.manifest.json"
SUMS="$FILE.sha256"

cleanup() {
  rm -f -- "$PARTIAL" "$PARTIAL.manifest.json" "$SUMS.tmp" 2>/dev/null || true
  rm -rf -- "$TMP_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# --- снапшот и дамп ---------------------------------------------------------

# statement_timeout=0: дамп большой базы не должен падать по серверному таймауту;
# idle_in_transaction_session_timeout=0: сессия со снапшотом открыта всё время дампа.
export PGOPTIONS='-c statement_timeout=0 -c idle_in_transaction_session_timeout=0'
export PGCONNECT_TIMEOUT=15

echo "▶ снапшот и дамп → $FILE"

coproc PSQL { psql "$DATABASE_URL" -X -q -tA -v ON_ERROR_STOP=1 2>"$TMP_DIR/psql.err"; }
PSQL_IN="${PSQL[1]}"
PSQL_OUT="${PSQL[0]}"

printf "BEGIN ISOLATION LEVEL REPEATABLE READ;\nSELECT 'SNAPSHOT:' || pg_export_snapshot();\n" >&"$PSQL_IN"
read -r -t 120 snap_line <&"$PSQL_OUT" || die "не удалось получить снапшот (см. $TMP_DIR/psql.err)"
case "$snap_line" in
  SNAPSHOT:*) SNAPSHOT_ID="${snap_line#SNAPSHOT:}" ;;
  *) die "неожиданный ответ при экспорте снапшота: $(head -c 300 "$TMP_DIR/psql.err" 2>/dev/null)" ;;
esac
[ -n "$SNAPSHOT_ID" ] || die "пустой идентификатор снапшота"

timeout 2h pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --lock-wait-timeout=60s \
  --snapshot="$SNAPSHOT_ID" \
  --file="$PARTIAL" || die "pg_dump"

# --- манифест из того же снапшота ------------------------------------------

echo "▶ манифест (тот же снапшот)"
{
  printf '%s\n' '\pset format unaligned'
  printf '%s\n' '\pset tuples_only on'
  printf '\\i %s\n' "$MANIFEST_SQL"
  printf '%s\n' "SELECT 'MANIFEST_END';"
} >&"$PSQL_IN"
read -r -t 600 manifest_json <&"$PSQL_OUT" || die "не удалось снять манифест"
read -r -t 60 manifest_end <&"$PSQL_OUT" || die "манифест оборвался"
[ "$manifest_end" = "MANIFEST_END" ] || die "неожиданный ответ при снятии манифеста"
printf '%s\n' "$manifest_json" | jq -e '.format == "pinposy-backup-manifest/1"' >/dev/null 2>&1 \
  || die "манифест не является ожидаемым JSON"

# Проба «приложение видит данные»: если authenticated имеет SELECT на users,
# считаем строки от его имени без claims и с claims тестового пользователя.
printf "SELECT 'SUBJECT:' || COALESCE((SELECT id::text FROM public.users ORDER BY id LIMIT 1), 'none');\n" >&"$PSQL_IN"
read -r -t 120 subject_line <&"$PSQL_OUT" || die "не удалось получить тестового пользователя"
SUBJECT="${subject_line#SUBJECT:}"

probe_json='null'
if printf '%s' "$manifest_json" | jq -e '.rls.privileges.users == true' >/dev/null 2>&1 && [ "$SUBJECT" != "none" ]; then
  cat >"$TMP_DIR/probe.sql" <<PROBE
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET TRANSACTION SNAPSHOT '$SNAPSHOT_ID';
SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.users;
COMMIT;
PROBE
  cat >"$TMP_DIR/probe_claims.sql" <<PROBE
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET TRANSACTION SNAPSHOT '$SNAPSHOT_ID';
SET LOCAL request.jwt.claims = '{"sub":"$SUBJECT"}';
SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.users;
COMMIT;
PROBE
  rows_plain="$(psql "$DATABASE_URL" -X -q -tA -v ON_ERROR_STOP=1 -f "$TMP_DIR/probe.sql" 2>"$TMP_DIR/probe.err" || echo "ERROR")"
  rows_subject="$(psql "$DATABASE_URL" -X -q -tA -v ON_ERROR_STOP=1 -f "$TMP_DIR/probe_claims.sql" 2>>"$TMP_DIR/probe.err" || echo "ERROR")"
  probe_json="$(jq -cn --arg table users --arg subject "$SUBJECT" \
    --arg plain "$(printf '%s' "$rows_plain" | tr -d '[:space:]')" \
    --arg with_subject "$(printf '%s' "$rows_subject" | tr -d '[:space:]')" \
    '{table:$table,subject:$subject,rows_as_role:$plain,rows_with_subject:$with_subject}')"
fi

printf '%s\n' 'COMMIT;' '\q' >&"$PSQL_IN" || true
wait "$PSQL_PID" 2>/dev/null || true

# --- целостность архива -----------------------------------------------------

echo "▶ полная распаковка архива (проверка целостности)"
pg_restore --file=/dev/null "$PARTIAL" || die "архив повреждён (полная распаковка не удалась)"

pg_restore --list "$PARTIAL" >"$TMP_DIR/list.txt" || die "pg_restore --list"
grep -q ' TABLE DATA public users ' "$TMP_DIR/list.txt" || die "в дампе нет данных ключевой таблицы users"

mv -- "$PARTIAL" "$FILE"
SIZE="$(wc -c <"$FILE" | tr -d ' ')"
SUM="$(sha256sum "$FILE" | cut -d' ' -f1)"
printf '%s  %s\n' "$SUM" "$(basename "$FILE")" >"$SUMS.tmp"
mv -- "$SUMS.tmp" "$SUMS"
printf '%s\n' "$manifest_json" | jq --arg file "$(basename "$FILE")" --arg sha "$SUM" \
  --arg size "$SIZE" --arg snapshot "$SNAPSHOT_ID" --argjson probe "$probe_json" \
  '. + {dump_file:$file, sha256:$sha, size_bytes:($size|tonumber), snapshot:$snapshot, probe:$probe}' \
  >"$PARTIAL.manifest.json"
mv -- "$PARTIAL.manifest.json" "$MANIFEST"
sync -- "$FILE" "$SUMS" "$MANIFEST" || die "sync: данные копии не сброшены на диск"

echo "PASS  backup: $FILE"
echo "      size_bytes=$SIZE sha256=$SUM"
echo "      манифест: $(basename "$MANIFEST")"

ROWS_SUMMARY="$(printf '%s' "$manifest_json" | jq -c '.tables | map_values(.rows)')"
log_line "$(jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg dump "$(basename "$FILE")" \
  --arg sha "$SUM" --arg size "$SIZE" --argjson rows "$ROWS_SUMMARY" \
  '{ts:$ts,dump:$dump,sha256:$sha,size_bytes:($size|tonumber),rows:$rows,status:"PASS"}')"

# --- ротация ----------------------------------------------------------------

if [ "$KEEP_DAYS" -gt 0 ]; then
  REMOVED=0
  while IFS= read -r old; do
    [ -f "$old" ] || continue
    # Удаляем только копии, которые одновременно старше KEEP_DAYS и не входят в KEEP_COUNT
    # последних: иначе при ежедневных бэкапах «старше 14 дней» и «последние 7» конфликтуют.
    if [ -n "$(find "$old" -maxdepth 0 -mtime "+$KEEP_DAYS" 2>/dev/null)" ]; then
      rm -f -- "$old" "$old.sha256" "$old.manifest.json"
      REMOVED=$((REMOVED + 1))
    fi
  done < <(ls -1t "$BACKUP_DIR"/pinposy_*.dump 2>/dev/null | tail -n "+$((KEEP_COUNT + 1))")
  echo "      retention: удалено копий: $REMOVED (старше ${KEEP_DAYS} дн. и вне последних ${KEEP_COUNT})"
fi

echo "      ВАЖНО: копия проверена на целостность, но не на восстановление."
echo "      Регулярно: scripts/restore-verify.sh --dump $FILE"
