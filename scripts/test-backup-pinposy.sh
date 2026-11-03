#!/usr/bin/env bash
# Offline smoke test for scripts/backup-pinposy.sh. No network or real credentials.

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pinposy-backup-test.XXXXXXXX")"
trap 'rm -rf -- "$TEST_DIR"' EXIT
MOCK_BIN="$TEST_DIR/bin"
MOCK_TMP="$TEST_DIR/tmp"
mkdir -p "$MOCK_BIN" "$MOCK_TMP"
: > "$TEST_DIR/calls.log"
printf 'test-only-password\n' > "$TEST_DIR/restic-password"
chmod 600 "$TEST_DIR/restic-password"

cat > "$MOCK_BIN/supabase" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == "--version" ]]; then
  printf 'supabase test-mock\n'
  exit 0
fi
printf 'supabase' >> "$MOCK_CALL_LOG"
printf ' <%s>' "$@" >> "$MOCK_CALL_LOG"
printf '\n' >> "$MOCK_CALL_LOG"
output=""
while (($#)); do
  if [[ "$1" == "-f" ]]; then
    output="$2"
    shift 2
  else
    shift
  fi
done
[[ -n "$output" ]] || exit 20
printf '%s\n' '-- mock SQL export --' > "$output"
MOCK
cat > "$MOCK_BIN/rclone" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == "version" ]]; then
  printf 'rclone test-mock\n'
  exit 0
fi
[[ "${1:-}" == "copy" ]] || exit 21
source="$2"
destination="$3"
printf 'rclone <%s> <%s>\n' "$source" "$destination" >> "$MOCK_CALL_LOG"
mkdir -p "$destination"
printf 'fake image bytes\n' > "$destination/example.webp"
MOCK
cat > "$MOCK_BIN/restic" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == "version" ]]; then
  printf 'restic test-mock\n'
  exit 0
fi
printf 'restic' >> "$MOCK_CALL_LOG"
printf ' <%s>' "$@" >> "$MOCK_CALL_LOG"
printf '\n' >> "$MOCK_CALL_LOG"
case "${1:-}" in
  snapshots)
    exit 0
    ;;
  backup)
    payload="$2"
    [[ -s "$payload/database/roles.sql" ]]
    [[ -s "$payload/database/schema.sql" ]]
    [[ -s "$payload/database/data.sql" ]]
    [[ -s "$payload/storage/example.webp" ]]
    [[ -s "$payload/manifest.txt" ]]
    ;;
  *)
    exit 22
    ;;
esac
MOCK

chmod +x "$MOCK_BIN/supabase" "$MOCK_BIN/rclone" "$MOCK_BIN/restic"

PATH="$MOCK_BIN:$PATH" \
MOCK_CALL_LOG="$TEST_DIR/calls.log" \
TMPDIR="$MOCK_TMP" \
SUPABASE_DB_URL="postgresql://test:never-real@127.0.0.1:5432/test" \
SUPABASE_STORAGE_REMOTE="supabase-test" \
SUPABASE_STORAGE_BUCKET="pin-images" \
RESTIC_REPOSITORY="s3:https://backup.invalid/pinposy-test" \
RESTIC_PASSWORD_FILE="$TEST_DIR/restic-password" \
AWS_ACCESS_KEY_ID="test-access-key" \
AWS_SECRET_ACCESS_KEY="test-secret-key" \
bash "$ROOT_DIR/scripts/backup-pinposy.sh"

[[ "$(grep -c '^supabase ' "$TEST_DIR/calls.log")" -eq 3 ]]
grep -q '^rclone <supabase-test:pin-images>' "$TEST_DIR/calls.log"
[[ "$(grep -c '^restic <snapshots>$' "$TEST_DIR/calls.log")" -eq 1 ]]
grep -q '^restic <backup>' "$TEST_DIR/calls.log"
grep -q '^restic <snapshots> <--latest> <1>' "$TEST_DIR/calls.log"
[[ -z "$(find "$MOCK_TMP" -mindepth 1 -print -quit)" ]]

printf '[backup-test] SUCCESS: exports, Storage copy, Restic upload, verification and cleanup passed.\n'
