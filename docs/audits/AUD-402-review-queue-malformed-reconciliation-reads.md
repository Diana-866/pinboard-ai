# AUD-402 — Fail closed on malformed manual-review reconciliation reads

**Date:** 2026-11-19  
**Area:** Backend, durable manual-review queue  
**Severity:** High — a malformed successful lookup could cause queue-row deletion or duplicate approval exposure.

## Finding

`GET /review-queue` performs two bounded secondary reads after loading the owner-scoped queue: related `pins` rows and persisted `pin_schedules` rows. Both loops previously used `result.data || []` after checking only `result.error`.

A response with no database error but a missing, null, or non-array `data` value was therefore treated as a valid empty result. For the pin lookup, reconciliation could classify every queue item linked to a pin as stale and delete those rows. For the schedule lookup, an already scheduled pin could be returned to the approval UI because the schedule set appeared empty.

## Change

- Added `readArrayQueryResult` to `backend/fetchAllPages.js`. It propagates database errors and accepts only an object response containing an array in `data`; malformed envelopes fail with HTTP 502.
- Reused the helper in `fetchAllPages` for both normal pages and the overflow probe.
- Applied it to both secondary query batches in `GET /review-queue`. No stale-row cleanup can run after a malformed pin or schedule response.
- Added regression coverage for malformed envelopes, preserved database errors, valid empty arrays, and the route's validation-before-cleanup contract.

## Verification boundary

- Static source changes and GitHub blob contents are reviewed in this PR.
- Node tests have **not** been executed in this automation environment. Required local command is recorded in UA-064.
- No SQL migration, production database, Supabase project, user data, Pinterest, Prodamus, DNS, or deployment was changed.
