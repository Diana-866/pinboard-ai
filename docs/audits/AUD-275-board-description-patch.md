# AUD-275 — board description editing semantics

Date: 2026-11-09  
Branch: `feat/persisted-boards-api`

## Finding

The authenticated `PATCH /boards/:id` route used `optionalString` for both fields. That helper maps an empty or whitespace-only string to `null`, and the route interpreted `null` as “field omitted”. As a result, clients could update a board description but could not clear it.

## Changes

- Added `backend/boardPatch.js` to build a strict, presence-aware patch.
- Omitted fields remain untouched.
- A supplied title is trimmed, limited to 100 characters, and must remain non-empty.
- A supplied description is trimmed and limited to 500 characters; an empty, whitespace-only, or explicit null description is normalized to `""` so users can clear it.
- Non-string descriptions and empty/unknown-only patches return HTTP 422.
- The route still performs the existing board ownership check before updating and still scopes the update by both board ID and its verified project ID.
- Added `backend/test/board-patch.test.js` covering trimming, length limits, omitted fields, clearing, and invalid input.

## Verification

- Read back the helper, tests, and route from the PR branch.
- Tests are added but have not been executed in this environment. Do not treat this as a passing test run.
- No database migration, production data change, deployment, or merge was performed.
