#!/usr/bin/env bash
#
# Проверка резервной копии PinPosy восстановлением на отдельную одноразовую базу.
#
#   PGHOST=127.0.0.1 PGUSER=postgres ./scripts/restore-verify.sh \
#     --dump /var/backups/pinposy/pinposy_20261122T031000Z.dump
#
# Что делает по шагам:
#   1. проверяет sha256 файла копии (что восстанавливается именно тот файл);
#   2. сверяет окружение: мажорная версия PostgreSQL, доступность расширений,
#      наличие ролей приложения — иначе проверка не про production;
#   3. создаёт одноразовую базу verify_<pid>_<random>, восстанавливает копию
#      с --exit-on-error и без --no-privileges (GRANT и RLS обязаны восстановиться);
#   4. снимает с восстановленной базы тот же манифест, что писал backup-postgres.sh,
#      и сравнивает точным равенством: строки, max(id), объекты схемы, расширения,
#      RLS-политики, права ролей, последовательности;
#   5. дымовой запрос от имени authenticated (без claims и с claims тестового
#      пользователя) — проверка «приложение видит данные», а не только «данные лежат»;
#   6. пишет результат (дата, файл, sha256, время восстановления = фактический RTO,
#      PASS/FAIL, проваленные проверки) строкой JSON в restore-verify.log.
#
# Отказывается работать без PGHOST и на хосте production-базы: проверять копию
# «куда-нибудь в прод» нельзя.
set -Eeuo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST_SQL="$SCRIPTS_DIR/lib/backup-manifest.sql"

DUMP=""
MANIFEST=""
LOG_FILE=""

usage() {
  cat <<'USAGE'
Usage: scripts/restore-verify.sh --dump <file> [options]

  --dump <file>       Файл резервной копии (pg_dump custom) — обязателен
  --manifest <file>   Манифест копии (по умолчанию <dump>.manifest.json)
  --log <file>        Журнал результатов (по умолчанию рядом с копией:
                      restore-verify.log)
  -h, --help          Эта справка

Требуется кластер PostgreSQL той же мажорной версии, что production-база,
с теми же расширениями и ролями приложения:
  PGHOST, PGPORT (5432), PGUSER, PGPASSWORD (если нужен).
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dump) DUMP="${2:-}"; shift 2 ;;
    --manifest) MANIFEST="${2:-}"; shift 2 ;;
    --log) LOG_FILE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "$DUMP" ] || { echo "error: --dump is required" >&2; exit 2; }
[ -f "$DUMP" ] || { echo "error: file not found: $DUMP" >&2; exit 2; }
[ -n "$MANIFEST" ] || MANIFEST="$DUMP.manifest.json"
[ -f "$MANIFEST" ] || {
  echo "error: нет манифеста $MANIFEST" >&2
  echo "       без манифеста сверять не с чем: восстановленная пустая база прошла бы проверку." >&2
  echo "       Манифест пишет scripts/backup-postgres.sh вместе с каждой копией." >&2
  exit 2
}
[ -r "$MANIFEST_SQL" ] || { echo "error: не найден $MANIFEST_SQL" >&2; exit 2; }
[ -n "${PGHOST:-}" ] || { echo "error: PGHOST is required (кластер для проверки, не production)" >&2; exit 2; }
for tool in psql pg_restore sha256sum jq diff; do
  command -v "$tool" >/dev/null 2>&1 || { echo "error: $tool not found in PATH" >&2; exit 2; }
done

SUMS="$DUMP.sha256"
[ -f "$SUMS" ] || { echo "error: нет файла контрольной суммы $SUMS" >&2; exit 2; }

log_result() {
  [ -n "$LOG_FILE" ] || return 0
  printf '%s\n' "$1" >>"$LOG_FILE" 2>/dev/null || echo "warning: не удалось записать $LOG_FILE" >&2
}

die() {
  echo "FAIL  $*" >&2
  log_result "$(jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg dump "$(basename "$DUMP")" \
    --arg error "$*" '{ts:$ts,dump:$dump,status:"FAIL",error:$error}')"
  exit 1
}

[ -n "$LOG_FILE" ] || LOG_FILE="$(cd "$(dirname "$DUMP")" && pwd)/restore-verify.log"

# --- 1. контрольная сумма ---------------------------------------------------

echo "▶ sha256 копии"
( cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$SUMS")" --status ) \
  || die "sha256 не совпадает: файл копии повреждён или изменён"
SUM="$(cut -d' ' -f1 <"$SUMS")"
SIZE="$(wc -c <"$DUMP" | tr -d ' ')"
echo "  PASS ${SUM:0:16}…"

jq -e '.format == "pinposy-backup-manifest/1"' "$MANIFEST" >/dev/null 2>&1 \
  || die "манифест не является ожидаемым JSON ($MANIFEST)"

# --- 2. окружение как в production -----------------------------------------

echo "▶ окружение"
TARGET_VERSION_NUM="$(psql -X -q -tA -d postgres -c "SELECT current_setting('server_version_num')::int")" \
  || die "не удалось подключиться к кластеру $PGHOST"
TARGET_MAJOR="$((TARGET_VERSION_NUM / 10000))"
MANIFEST_MAJOR="$(jq -r '.server_version_num / 10000 | floor' "$MANIFEST")"
[ "$TARGET_MAJOR" = "$MANIFEST_MAJOR" ] \
  || die "кластер проверки — PostgreSQL $TARGET_MAJOR, копия снята с PostgreSQL $MANIFEST_MAJOR; проверка на другой мажорной версии не является доказательством"
echo "  PASS PostgreSQL $MANIFEST_MAJOR"

# Расширения: если нужного нет — восстановление либо упадёт на CREATE EXTENSION,
# либо (с ключами вроде --no-privileges) молча пропустит настоящую проблему.
EXT_MISSING="$(psql -X -q -tA -d postgres -v ON_ERROR_STOP=1 -c "
  WITH wanted AS (
    SELECT key AS name, value #>> '{}' AS version FROM json_each('$(jq -c '.extensions' "$MANIFEST")')
  )
  SELECT string_agg(w.name || ' ' || w.version, ', ' ORDER BY w.name)
  FROM wanted w
  LEFT JOIN pg_available_extensions a ON a.name = w.name
  WHERE a.name IS NULL OR a.default_version IS DISTINCT FROM w.version
")"
[ -z "$EXT_MISSING" ] || die "в кластере проверки нет расширений той же версии, что в копии: $EXT_MISSING"
echo "  PASS расширения ($(jq -r '.extensions | keys | length' "$MANIFEST"))"

# Роли: GRANT и RLS-политики ссылаются на них, восстановление без ролей упадёт
# (и это правильно — но сообщение должно быть понятным).
ROLES_MISSING="$(psql -X -q -tA -d postgres -v ON_ERROR_STOP=1 -c "
  WITH wanted AS (SELECT json_array_elements_text('$(jq -c '.roles' "$MANIFEST")') AS name)
  SELECT string_agg(w.name, ', ' ORDER BY w.name)
  FROM wanted w LEFT JOIN pg_roles r ON r.rolname = w.name
  WHERE r.rolname IS NULL
")"
if [ -n "$ROLES_MISSING" ]; then
  echo "error: в кластере проверки нет ролей приложения: $ROLES_MISSING" >&2
  echo "       создайте их (CREATE ROLE <name> NOLOGIN;) и повторите: без ролей" >&2
  echo "       GRANT и RLS-политики восстановить нельзя, а проверка без них бессмысленна." >&2
  die "отсутствуют роли: $ROLES_MISSING"
fi
echo "  PASS роли ($(jq -r '.roles | length' "$MANIFEST"))"

# Куда восстанавливаем: не на хост production-базы.
if [ -n "${DATABASE_URL:-}" ]; then
  PROD_HOST="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[A-Za-z0-9+.-]+://##; s#^[^@/]*@##; s#[/?].*$##; s#:[0-9]+$##')"
  if [ -n "$PROD_HOST" ] && [ "$PROD_HOST" = "$PGHOST" ]; then
    die "PGHOST совпадает с хостом production-базы ($PROD_HOST): проверочная база не должна создаваться на том же сервере"
  fi
fi

# --- 3. одноразовая база и восстановление -----------------------------------

DB="verify_$$_$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pinposy-restore-verify.XXXXXX")"
CLEANED=0

cleanup() {
  [ "$CLEANED" -eq 0 ] || return 0
  CLEANED=1
  case "$DB" in
    verify_*) psql -X -q -d postgres -c "DROP DATABASE IF EXISTS \"$DB\"" >/dev/null 2>&1 || true ;;
  esac
  rm -rf -- "$TMP_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "▶ создание временной базы $DB на $PGHOST"
psql -X -q -d postgres -c "CREATE DATABASE \"$DB\"" >/dev/null 2>&1 \
  || die "не удалось создать временную базу; существующие базы не тронуты"

echo "▶ восстановление копии"
START_NS="$(date +%s%N)"
if ! pg_restore --no-owner --exit-on-error --single-transaction -d "$DB" "$DUMP" >"$TMP_DIR/restore.log" 2>&1; then
  echo "FAIL  восстановление завершилось с ошибкой:" >&2
  tail -20 "$TMP_DIR/restore.log" >&2
  die "pg_restore --exit-on-error"
fi
RESTORE_MS="$(( ($(date +%s%N) - START_NS) / 1000000 ))"
RESTORE_SECONDS="$(awk -v ms="$RESTORE_MS" 'BEGIN { printf "%.2f", ms / 1000 }')"
echo "  PASS восстановление за ${RESTORE_SECONDS}s"

# --- 4. манифест восстановленной базы и сравнение ---------------------------

echo "▶ сверка с манифестом"
{
  printf '%s\n' '\pset format unaligned'
  printf '%s\n' '\pset tuples_only on'
  printf '\\i %s\n' "$MANIFEST_SQL"
} | psql -X -q -tA -v ON_ERROR_STOP=1 -d "$DB" -c "BEGIN ISOLATION LEVEL REPEATABLE READ;" -f - -c "COMMIT;" \
  >"$TMP_DIR/restored.json" 2>"$TMP_DIR/manifest.err" \
  || die "не удалось снять манифест с восстановленной базы: $(tail -3 "$TMP_DIR/manifest.err")"

RESTORED="$TMP_DIR/restored.json"
jq -e '.format == "pinposy-backup-manifest/1"' "$RESTORED" >/dev/null 2>&1 \
  || die "манифест восстановленной базы не является ожидаемым JSON"

FAILED=0
check_json() {
  # $1 — название проверки, $2 — jq-фильтр, который одинаково применяется к обоим манифестам
  local name="$1" filter="$2"
  if diff -q <(jq -S "$filter" "$MANIFEST") <(jq -S "$filter" "$RESTORED") >/dev/null; then
    printf 'PASS  %s\n' "$name"
  else
    printf 'FAIL  %s\n' "$name"
    diff <(jq -S "$filter" "$MANIFEST") <(jq -S "$filter" "$RESTORED") | head -20 | sed 's/^/      /' >&2
    FAILED=$((FAILED + 1))
  fi
}

check_json "строки и max(id) ключевых таблиц" '.tables'
check_json "объекты схемы (таблицы/функции/триггеры/индексы/ограничения)" '.objects'
check_json "расширения" '.extensions'
check_json "RLS: таблицы, политики, права ролей" '.rls'
check_json "последовательности (last_value)" '.sequences'

# last_value >= max(col): иначе данные на месте, а первая вставка падает на duplicate key.
SEQ_BROKEN="$(jq -r '[.sequences[] | select(.max_value != null and .last_value < .max_value) | "\(.sequence): last_value=\(.last_value) < max=\(.max_value)"] | join("; ")' "$RESTORED")"
if [ -n "$SEQ_BROKEN" ]; then
  echo "FAIL  последовательности отстают от данных: $SEQ_BROKEN" >&2
  FAILED=$((FAILED + 1))
else
  echo "PASS  последовательности не отстают от данных"
fi

# Невалидные индексы: восстановление формально прошло, но индекс не построен.
INVALID_IDX="$(jq -r '.objects.invalid_indexes' "$RESTORED")"
if [ "$INVALID_IDX" != "0" ]; then
  echo "FAIL  невалидных индексов после восстановления: $INVALID_IDX" >&2
  FAILED=$((FAILED + 1))
fi

# --- 5. дымовой запрос как приложение --------------------------------------

PROBE_STATUS="skipped"
if jq -e '.probe != null' "$MANIFEST" >/dev/null 2>&1; then
  SUBJECT="$(jq -r '.probe.subject' "$MANIFEST")"
  cat >"$TMP_DIR/probe.sql" <<PROBE
SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.users;
PROBE
  cat >"$TMP_DIR/probe_claims.sql" <<PROBE
SET LOCAL request.jwt.claims = '{"sub":"$SUBJECT"}';
SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.users;
PROBE
  rows_plain="$(psql -X -q -tA -v ON_ERROR_STOP=1 -d "$DB" -c "BEGIN" -f "$TMP_DIR/probe.sql" -c "ROLLBACK" 2>"$TMP_DIR/probe.err" | tr -d '[:space:]')" \
    || { echo "FAIL  запрос от имени authenticated не выполняется: $(tail -2 "$TMP_DIR/probe.err")" >&2; FAILED=$((FAILED + 1)); rows_plain=""; }
  rows_subject="$(psql -X -q -tA -v ON_ERROR_STOP=1 -d "$DB" -c "BEGIN" -f "$TMP_DIR/probe_claims.sql" -c "ROLLBACK" 2>>"$TMP_DIR/probe.err" | tr -d '[:space:]')" \
    || { echo "FAIL  запрос с claims тестового пользователя не выполняется: $(tail -2 "$TMP_DIR/probe.err")" >&2; FAILED=$((FAILED + 1)); rows_subject=""; }
  want_plain="$(jq -r '.probe.rows_as_role' "$MANIFEST")"
  want_subject="$(jq -r '.probe.rows_with_subject' "$MANIFEST")"
  if [ -n "$want_plain" ] && [ -n "$want_subject" ] && [ "$want_plain" != "ERROR" ] && [ "$want_subject" != "ERROR" ]; then
    if [ "$rows_plain" = "$want_plain" ] && [ "$rows_subject" = "$want_subject" ]; then
      echo "PASS  запрос как authenticated: без claims $rows_plain, с claims $rows_subject"
      PROBE_STATUS="pass"
    else
      echo "FAIL  запрос как authenticated: без claims $rows_plain (ожидалось $want_plain), с claims $rows_subject (ожидалось $want_subject)" >&2
      FAILED=$((FAILED + 1))
      PROBE_STATUS="fail"
    fi
  else
    echo "SKIP  копия снята там, где authenticated не имеет SELECT на users: сверять нечего (см. .rls.privileges)"
    PROBE_STATUS="skipped"
  fi
fi

# --- 6. результат -----------------------------------------------------------

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [ "$FAILED" -ne 0 ]; then
  echo "ИТОГ: копия не прошла проверку восстановления ($FAILED проверок)" >&2
  log_result "$(jq -cn --arg ts "$TS" --arg dump "$(basename "$DUMP")" --arg sha "$SUM" \
    --argjson restore_seconds "$RESTORE_SECONDS" --argjson failed "$FAILED" --arg probe "$PROBE_STATUS" \
    '{ts:$ts,dump:$dump,sha256:$sha,restore_seconds:$restore_seconds,probe:$probe,status:"FAIL",failed_checks:$failed}')"
  exit 1
fi

echo "ИТОГ: копия восстанавливается, данные и права на месте, RTO ${RESTORE_SECONDS}s"
log_result "$(jq -cn --arg ts "$TS" --arg dump "$(basename "$DUMP")" --arg sha "$SUM" \
  --argjson restore_seconds "$RESTORE_SECONDS" --arg probe "$PROBE_STATUS" \
  '{ts:$ts,dump:$dump,sha256:$sha,restore_seconds:$restore_seconds,probe:$probe,status:"PASS"}')"
