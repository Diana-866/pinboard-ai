#!/usr/bin/env bash
# Бэкап базы и проверка, что дамп читается.
#
#   ./deploy/backup.sh                  дамп + проверка + удаление старых копий
#   ./deploy/backup.sh --verify FILE    проверить существующий дамп
#   ./deploy/backup.sh --list           показать, что лежит в каталоге
#
# Требуется DATABASE_URL. Пароль и адрес никогда не печатаются: только имя файла и размер.
# Переменные: BACKUP_DIR (по умолчанию ./backups), RETENTION_DAYS (по умолчанию 14).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
PG_DUMP="${PG_DUMP:-pg_dump}"
PG_RESTORE="${PG_RESTORE:-pg_restore}"

die() {
  echo "backup: $1" >&2
  exit "${2:-1}"
}

usage() {
  echo "usage: backup.sh [--verify FILE] [--list]" >&2
  exit 2
}

mode="dump"
target=""
while [ $# -gt 0 ]; do
  case "$1" in
    --verify)
      [ $# -ge 2 ] || usage
      mode="verify"
      target="$2"
      shift 2
      ;;
    --list)
      mode="list"
      shift
      ;;
    *)
      usage
      ;;
  esac
done

if [ "$mode" = "list" ]; then
  [ -d "$BACKUP_DIR" ] || die "no backup directory $BACKUP_DIR" 1
  ls -1 "$BACKUP_DIR" 2>/dev/null || true
  exit 0
fi

# Дамп читается через pg_restore --list: если файл битый, проверка это назовёт.
verify_dump() {
  local file="$1"
  [ -f "$file" ] || die "dump file is missing: $file" 1
  [ -s "$file" ] || die "dump file is empty: $file" 1
  local listing
  if ! listing="$("$PG_RESTORE" --list "$file" 2>/dev/null)"; then
    die "dump is not readable: $file" 1
  fi
  local entries
  entries="$(printf '%s\n' "$listing" | grep -c '^[0-9]' || true)"
  # Пустой список означает, что дамп не содержит объектов: это провал, а не успех.
  [ "${entries:-0}" -gt 0 ] || die "dump contains no objects: $file" 1
  echo "backup: verified $file ($entries objects)"
}

if [ "$mode" = "verify" ]; then
  verify_dump "$target"
  exit 0
fi

[ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL is not set; refusing to guess a database" 2

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/pinposy-$stamp.dump"

# -Fc — сжатый формат, из которого pg_restore умеет собирать базу; --no-owner, чтобы
# дамп переносился на другой сервер с другими именами ролей.
if ! "$PG_DUMP" --format=custom --no-owner --no-privileges --file "$file" "$DATABASE_URL" 2>/dev/null; then
  rm -f "$file"
  die "pg_dump failed" 1
fi

if [ ! -s "$file" ]; then
  rm -f "$file"
  die "pg_dump produced an empty file" 1
fi

# Хеш считается из stdin: если передать путь аргументом, coreutils экранирует имя
# с обратными слешами и дописывает ведущий "\", из-за чего файл контрольной суммы
# перестаёт быть простым 64-символьным хешем.
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum < "$file" | awk '{print $1}' > "$file.sha256"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 < "$file" | awk '{print $1}' > "$file.sha256"
else
  die "no sha256 tool available; cannot record the dump checksum" 1
fi

verify_dump "$file"

# Старые копии удаляются только после успешной проверки новой: иначе неудачный бэкап
# уносил бы с собой последний рабочий.
removed=0
while IFS= read -r old; do
  [ -n "$old" ] || continue
  rm -f "$old" "$old.sha256"
  removed=$((removed + 1))
done <<EOF
$(find "$BACKUP_DIR" -maxdepth 1 -name 'pinposy-*.dump' -type f -mtime "+$RETENTION_DAYS" 2>/dev/null || true)
EOF

echo "backup: ok $file ($(wc -c < "$file") bytes), removed $removed old dump(s) older than ${RETENTION_DAYS}d"
