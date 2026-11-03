#!/usr/bin/env bash
# Provider-neutral encrypted backup for PinPosy.
# Required tools: Supabase CLI, rclone, restic.
# This script only reads from Supabase and writes to the configured Restic repository.

set -Eeuo pipefail
umask 077

fail() {
  printf '[backup] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

require_env() {
  [[ -n "${!1:-}" ]] || fail "Required environment variable is not set: $1"
}

for command_name in supabase rclone restic; do
  require_command "$command_name"
done

for variable_name in SUPABASE_DB_URL SUPABASE_STORAGE_REMOTE SUPABASE_STORAGE_BUCKET RESTIC_REPOSITORY RESTIC_PASSWORD_FILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  require_env "$variable_name"
done

[[ "$SUPABASE_DB_URL" == postgres://* || "$SUPABASE_DB_URL" == postgresql://* ]] \
  || fail "SUPABASE_DB_URL must be a PostgreSQL connection URL"
[[ "$RESTIC_REPOSITORY" == s3:https://* ]] \
  || fail "RESTIC_REPOSITORY must use an HTTPS S3-compatible URL"
[[ -r "$RESTIC_PASSWORD_FILE" ]] || fail "RESTIC_PASSWORD_FILE is not readable"
[[ "$SUPABASE_STORAGE_REMOTE" =~ ^[A-Za-z0-9_-]+$ ]] \
  || fail "SUPABASE_STORAGE_REMOTE must be an existing rclone remote name"
[[ "$SUPABASE_STORAGE_BUCKET" =~ ^[A-Za-z0-9_-]+$ ]] \
  || fail "SUPABASE_STORAGE_BUCKET contains unsupported characters"

# A fresh directory prevents stale local files from surviving between runs.
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pinposy-backup.XXXXXXXX")"
PAYLOAD_DIR="$WORK_DIR/pinposy"
mkdir -p "$PAYLOAD_DIR/database" "$PAYLOAD_DIR/storage"
cleanup() {
  rm -rf -- "$WORK_DIR"
}
trap cleanup EXIT

printf '[backup] Exporting Supabase database roles and schema...\n'
supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$PAYLOAD_DIR/database/roles.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$PAYLOAD_DIR/database/schema.sql"

printf '[backup] Exporting database records...\n'
supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy \
  -x storage.buckets_vectors -x storage.vector_indexes \
  -f "$PAYLOAD_DIR/database/data.sql"

printf '[backup] Copying Storage bucket objects...\n'
rclone copy "${SUPABASE_STORAGE_REMOTE}:${SUPABASE_STORAGE_BUCKET}" "$PAYLOAD_DIR/storage" \
  --create-empty-src-dirs --checkers 8 --transfers 4

BACKUP_TIME="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
GIT_REVISION="$(git rev-parse --verify HEAD 2>/dev/null || printf 'unknown')"
{
  printf 'backup_time_utc=%s\n' "$BACKUP_TIME"
  printf 'git_revision=%s\n' "$GIT_REVISION"
  printf 'database_export=Supabase CLI roles, schema, data\n'
  printf 'storage_bucket=%s\n' "$SUPABASE_STORAGE_BUCKET"
  printf 'storage_copy=rclone copy (source objects retained in Restic snapshots)\n'
  printf 'encryption=Restic repository encryption\n'
  printf 'supabase_cli=%s\n' "$(supabase --version 2>/dev/null || true)"
  printf 'rclone=%s\n' "$(rclone version 2>/dev/null | head -n 1 || true)"
  printf 'restic=%s\n' "$(restic version 2>/dev/null || true)"
} > "$PAYLOAD_DIR/manifest.txt"

printf '[backup] Checking access to the existing encrypted repository...\n'
restic snapshots >/dev/null

printf '[backup] Uploading encrypted backup...\n'
restic backup "$PAYLOAD_DIR" --host "${BACKUP_HOST:-pinposy-backup}" --tag pinposy --tag database-storage

printf '[backup] Verifying that a snapshot is readable...\n'
restic snapshots --latest 1 >/dev/null

printf '[backup] SUCCESS: encrypted database and Storage snapshot saved.\n'
