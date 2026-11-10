# AUD-296 — repair idempotent board-creation migration

Date: 2026-11-09  
Branch: `feat/persisted-boards-api`

## Finding

A read-back of the existing AUD-274 migration found malformed SQL: the SHA-256 regular expression was unterminated, its end anchor was missing, and a duplicate fragment of the constraint/comment block remained after the DO block. The migration could not be applied as written, so the database uniqueness guarantee required by the new board-create API was not reliably installable.

## Change

- Replaced the malformed migration body with one complete, balanced definition.
- The check constraint now permits only the legacy pair (both request fields NULL) or a keyed request with a non-NULL lowercase 64-character hexadecimal SHA-256 fingerprint.
- Preserved the unique index on `(project_id, create_request_id)`, nullable columns, and comments.
- Kept the migration idempotent for repeat execution via `ADD COLUMN IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`, and the constraint existence check.

## Verification and rollout

- Read back the migration source from the PR branch and checked the complete SQL text for balanced block/parenthesis structure and the anchored fingerprint expression.
- PostgreSQL execution and the disposable-database integration workflow have not been run in this environment. Do not treat the migration as runtime-verified.
- The previous AUD-274 report states migration 111 was not applied to production. Confirm that remains true before applying this corrected migration. If it was applied anywhere, inspect the existing constraint definition before attempting any repair.
- No production SQL, deployment, merge, or branch merge was performed.
