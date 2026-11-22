#!/usr/bin/env bash
#
# Резервная копия базы PinPosy.
#
#   DATABASE_URL="postgresql://user:pass@host:5432/db" ./scripts/backup-postgres.sh
#   BACKUP_DIR=/var/backups/pinposy KEEP_DAYS=14 ./scripts/backup-postgres.sh
#
# Что делает: снимает логическую копию в формате pg_dump custom (сжатый, восстанавливается
# выборочно), проверяет, что архив читается (pg_restore --list), считает sha256, удаляет копии
# старше KEEP_DAYS. Пароль и строка подключения никогда не печатаются.
#
# Копия без проверки восстановления копией не считается: раз в месяц прогоняйте
# scripts/restore-verify.sh на отдельной машине (см. docs/RUNBOOK_BACKUP_RESTORE.md).
set -uo pipefail

DATABASE_URL="${DATABASE_URL:-}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

if [ -z "$DATABASE_URL" ]; then
  echo "error: DATABASE_URL is required (строка подключения PostgreSQL)" >&2
  echo "       пример: postgresql://user:pass@db.example.com:5432/postgres" >&2
  exit 2
fi

for tool in pg_dump pg_restore sha256sum; do
  command -v "$tool" >/dev/null 2>&1 || { echo "error: $tool not found in PATH" >&2; exit 2; }
done

case "$KEEP_DAYS" in
  ''|*[!0-9]*) echo "error: KEEP_DAYS must be a non-negative integer" >&2; exit 2 ;;
esac

mkdir -p "$BACKUP_DIR" || { echo "error: cannot create $BACKUP_DIR" >&2; exit 1; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/pinposy_${STAMP}.dump"
PARTIAL="$FILE.part"

# --no-owner / --no-privileges: копия восстанавливается в другую базу и под другой ролью.
# --format=custom: сжатие и возможность выборочного восстановления.
if ! pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$PARTIAL"; then
  echo "FAIL  pg_dump завершился с ошибкой; неполный файл удалён" >&2
  rm -f "$PARTIAL"
  exit 1
fi

# Архив, который не читается pg_restore, бесполезен: проверяем до переименования.
if ! pg_restore --list "$PARTIAL" >/dev/null 2>&1; then
  echo "FAIL  архив не читается pg_restore; файл удалён" >&2
  rm -f "$PARTIAL"
  exit 1
fi

mv "$PARTIAL" "$FILE"
SIZE="$(wc -c <"$FILE" | tr -d ' ')"
SUM="$(sha256sum "$FILE" | cut -d' ' -f1)"
printf '%s  %s\n' "$SUM" "$(basename "$FILE")" > "$FILE.sha256"

echo "PASS  backup: $FILE"
echo "      size_bytes=$SIZE sha256=$SUM"

if [ "$KEEP_DAYS" -gt 0 ]; then
  REMOVED=0
  while IFS= read -r old; do
    rm -f "$old" "$old.sha256"
    REMOVED=$((REMOVED + 1))
  done < <(find "$BACKUP_DIR" -maxdepth 1 -name 'pinposy_*.dump' -type f -mtime "+$KEEP_DAYS" 2>/dev/null)
  echo "      retention: удалено копий старше ${KEEP_DAYS} дн.: $REMOVED"
fi

echo "      ВАЖНО: копия проверена на читаемость, но не на восстановление."
echo "      Раз в месяц: scripts/restore-verify.sh --dump $FILE"
