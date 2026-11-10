# AUD-298 — omit internal owner identity from project API responses (2026-11-09)

## Problem

The authenticated project endpoints returned raw Supabase rows. In particular, `GET /projects` and `GET /projects/:id` exposed the internal `user_id` field to the same client that already authenticated as that user. The create route also reused the board serializer, obscuring the project response contract.

## Changes

- Added `serializeProjectForClient`, which removes only the internal `user_id` field and preserves public project fields.
- Applied it to `POST /projects`, `GET /projects`, and `GET /projects/:id`.
- Database rows remain unchanged for authorization and server-side operations; ownership filters are preserved.
- Added regression tests for object serialization, array/list serialization at the route mapping boundary, null/non-object input, and preservation of public fields.

## Verification

- Source and test files were read back from the PR branch.
- Automated tests, lint, typecheck, and build have not been executed in this environment. No CI pass is claimed.
- No production database changes, deployment, or merge.
