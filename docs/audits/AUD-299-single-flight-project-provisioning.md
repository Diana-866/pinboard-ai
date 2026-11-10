# AUD-299 — single-flight default project provisioning (2026-11-09)

## Problem

Board creation first loads the user's projects and creates one if the list is empty. Two board-create flows started at nearly the same time could both observe an empty list and issue separate project inserts. A lost create response was recoverable on a later attempt (the next GET sees the persisted project), but concurrent flows in the same browser runtime were not coordinated.

## Changes

- Added `frontend/src/utils/projectProvisioning.ts` with per-user single-flight provisioning.
- Concurrent board-create flows for the same user now share one GET/conditional-POST operation.
- Different users remain isolated.
- Failed operations release the in-flight entry; a subsequent attempt reloads persisted projects before trying another create, so an already-committed project is reused after an ambiguous response.
- `App.tsx` now resolves the project through this helper before creating the board.
- Added `projectProvisioning.test.ts` covering concurrent calls, user isolation, retry after ambiguous failure, and malformed responses.

## Scope and limitations

This coordinates concurrent calls within one browser JavaScript runtime. It is not a cross-tab or cross-device database uniqueness guarantee; implementing that would require a carefully designed server-side default-project invariant and migration.

## Verification

- Changes were read back from the PR branch.
- Frontend tests, lint, and build have not been executed in this environment. No CI pass is claimed.
- No production database changes, deployment, or merge.
