# AUD-192 — Repair image lifecycle test coverage

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`

## Findings and changes

- Found a deterministic test failure in `backend/test/pin-image-lifecycle.test.js`: the suite called `quarantineStalePinImageUploads` but did not import it from `pinImageLifecycle`. The quarantine scenarios therefore failed with a JavaScript `ReferenceError` before they could validate behavior.
- Added the missing import.
- Added an explicit status-classification regression test for `isDefiniteStorageRejection`:
  - definite client rejections (400, 401, 403, 404, 422) may be finalized as failed;
  - ambiguous or transient outcomes (408, 409, 425, 429, 500, 502, 503, missing/invalid status) must remain fenced.
- This protects the key Storage safety invariant: a timeout, conflict, throttle, or server error must never reopen an object path while a remote upload/delete may still complete.

## Verification

- Re-read the updated test and confirmed every `pinImageLifecycle` helper invoked by the suite is imported.
- GitHub PR check-runs endpoint currently reports zero check runs for the latest commit; no CI result is available yet.
- The Node test file was not executed locally in this environment. No test pass is claimed.
- No database migration, Supabase data, production service, deployment, or merge was changed.
