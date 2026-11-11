# AUD-297 — omit internal board identity metadata from API responses

Date: 2026-11-09  
Branch: `feat/persisted-boards-api`

## Finding

AUD-274 added internal request UUID and SHA-256 fingerprint columns. The keyed POST path omitted the fingerprint, but other board routes used broad `select("*")` results directly. Board list/detail and PATCH responses could expose internal request metadata; detail reads also carried the nested project owner ID.

## Change

- Added shared `serializeBoardForClient`.
- Applied it to keyed and legacy create, PATCH, list, and detail responses.
- Removed `create_request_id`, `create_request_fingerprint`, and nested `projects.user_id` from API output while preserving public fields.
- Kept full database rows for internal ownership checks; only response serialization changes.
- Added Node tests for top-level fields, nested owner identity, relation arrays, and non-object input.

## Verification

- Backend route and serializer/test sources were read back from the branch.
- Tests, lint, typecheck, and build have not been run; no CI pass is claimed.
- No production DB changes, deployment, or merge.
