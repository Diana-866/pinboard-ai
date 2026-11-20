# AUD-403 — Fail closed on malformed review-queue reconciliation reads

**Date:** 2026-11-20  
**Area:** Backend, durable manual-review queue  
**Severity:** High — an invalid successful lookup could make persisted queue state appear stale or unscheduled.

## Finding

`GET /review-queue` loads the owner-scoped queue, then performs bounded secondary reads from `pins` and `pin_schedules`. On the current mainline, both result loops used `result.data || []` after checking only `result.error`.

A malformed successful response with `data: null`, a missing `data` property, or a non-array payload was therefore treated as a valid empty result:

- A malformed `pins` response could make pin-linked queue rows appear stale and allow the later cleanup step to delete them.
- A malformed `pin_schedules` response could hide an existing schedule and expose the same pin for approval again.

## Change

- Added `readArrayQueryResult` to `backend/fetchAllPages.js`. It requires a non-array object result with an array-valued `data`, propagates database errors unchanged, and returns HTTP 502 for malformed envelopes.
- Reused the validator for every normal page and the overflow probe in `fetchAllPages`.
- Applied the validator to every `pins` and `pin_schedules` batch in `GET /review-queue`.
- All secondary reads are validated before reconciliation and stale-row deletion.
- Added regression tests for database-error propagation, valid empty arrays, missing/null/non-array envelopes, both route reads, and validation-before-cleanup ordering. Added two HTTP-level tests using the existing fake PostgREST server: malformed `pins` and `pin_schedules` responses must return 502 and issue zero queue-row DELETE requests.

## Verification boundary

- Branch base: current `main` HEAD `8102f14711db3c49ca246a547e09704f0ef146fd`.
- Branch: `fix/review-queue-fail-closed-20261120`.
- Focused and HTTP-level Node tests have **not** been executed in the automation environment. Owner-side acceptance is recorded in UA-073.
- GitHub Actions on the current main HEAD and the previous PR #93 head failed before creating runnable steps; this does not evidence a test failure in this change.
- No SQL migration, production database, Supabase project, user data, Pinterest, Prodamus, DNS, or deployment was changed.
