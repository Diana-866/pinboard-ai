# AUD-335 — Database schema compatibility and parser/error-path tests

**Date:** 2026-11-10  
**Branch:** `feat/persisted-boards-api`  
**Status:** SOURCE REVIEW + TEST COVERAGE EXTENDED; execution pending

## Database compatibility

Inspected the repository baseline migration `db/migrations/001_baseline.sql`:

- `projects.niche` and `projects.site_summary` are PostgreSQL `text`.
- `boards.title` and `boards.description` are PostgreSQL `text`.
- No conflicting database length limit is declared in this baseline definition.
- The new application limits (80/1,200 and 40/500 characters) are therefore stricter application-level bounds, not a conflict with the baseline column types.

This confirms compatibility with the checked-in baseline migration only. It does not prove that a live Supabase database has exactly this schema or that later/manual SQL changes have not diverged. No live database was queried and no migration was run.

## HTTP error behavior

Reviewed `handleError()` in `backend/index.js`:

- It selects `e.httpStatus` when no explicit status override is supplied.
- A validation failure with HTTP 502 is returned as a generic server error message.
- The internal validation detail is logged server-side rather than exposed to the client.
- This is consistent with the existing generic 5xx policy and avoids leaking provider/model output.

## Changes in this stage

- Centralized parsing and validation in `backend/textOutputValidation.js`:
  - `parseAnalysisResponse()`
  - `parseBoardIdeasResponse()`
- Updated `backend/analyze.js` and `backend/boards.js` to use the shared parser functions.
- Added parser tests for valid JSON, surrounding prose, malformed JSON, empty responses, invalid schemas, and HTTP 502 error classification.
- Removed an unused import from `backend/boards.js`.

## Important limitation

The parser extracts the first greedy JSON object/array-shaped region from model text, matching the previous compatibility behavior. It does not support arbitrary multi-object prose or markdown fences containing unrelated JSON. Invalid or ambiguous output fails closed with HTTP 502. A future improvement could require strict JSON-only provider responses if GPTunnel/model output compatibility is confirmed.

## Validation status

- Read back all changed source/test files from GitHub.
- Automated tests, lint, typecheck, build, and integration tests were not executed; passing status is not claimed.
- No live Supabase query/write, GPTunnel call, migration, payment, or deployment was performed.
- No external callers or production traffic were inspected.

## Next

AUD-336: inspect backend test-runner and CI setup, determine the safest way to execute the focused validator tests and full backend suite, and fix any confirmed failures. Do not merge/deploy until the test evidence and Vercel build quota issue are resolved.
