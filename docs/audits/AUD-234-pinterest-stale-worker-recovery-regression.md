# AUD-234 — Regression coverage for stale Pinterest worker recovery

**Status:** TEST ADDED / CI UNVERIFIED  
**Date:** 2026-11-09

## Finding

The stale-worker recovery integration test already covered confirmed publication reconciliation, mismatched board evidence, missing publication ledger, and conflicting remote Pinterest IDs. It did not cover the other recovery branch: whether a stale `publishing` claim is requeued only after an explicitly retry-safe failure for the exact scheduled board.

## Change

Extended `backend/test/pinterest-stale-schedule-recovery.integration.sql` with two cases:

1. Exact owner/pin/account/board + `status='failed'` + `retry_safe=true`: stale claim returns to `scheduled`, clears the old claim token, and receives a one-minute retry delay.
2. Retry-safe journal for a different board: schedule stays `failed`, clears the stale claim token, and is not given a retry time.

Also corrected the fixture cleanup to remove the publication ledger row for the conflicting-remote-ID case, preventing test residue or foreign-key cleanup failures.

The workflow already applies migrations 091–096 and already runs this integration test, so no workflow or production migration change was needed.

## User impact

After a backend/worker restart, a publication is automatically requeued only when Pinterest previously gave a confirmed safe rejection for the same destination board. A safe rejection recorded for another board cannot trigger a retry against the current schedule. This protects users from unintended duplicate pins or incorrect automatic retries.

## Verification

- Test file was updated and read back from `feat/persisted-boards-api`.
- The PostgreSQL integration test was not executed locally.
- Current GitHub Actions jobs fail without runner steps or downloadable logs; test execution remains unverified.
- No production database, deployment, Pinterest account, or publication was touched.
