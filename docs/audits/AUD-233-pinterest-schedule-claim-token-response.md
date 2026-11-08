# AUD-233 — Hide Pinterest worker claim tokens from client responses

**Status:** FIX IMPLEMENTED / CI UNVERIFIED  
**Date:** 2026-11-09

## Finding

The schedule API selected complete `pin_schedules` rows and removed only `last_error` before returning them. The internal `claim_token` therefore crossed the backend/browser boundary in calendar responses and in several schedule mutation responses.

The claim token is a server-side fencing capability: the worker must present it when mutating a claimed schedule. It is not needed by the UI and should not be disclosed.

## Change

- `backend/pinterestSchedule.js`: `sanitizeScheduleForClient` now strips both `last_error` and `claim_token`, without mutating the source object.
- `backend/index.js`: applied the sanitizer to schedule creation, calendar listing, legacy-account reconciliation, board reassignment, manual retry, and cancellation responses.
- `backend/test/pinterest-schedule.test.js`: extended the public-payload regression test to prove the raw provider diagnostic and claim token are absent while the original database-shaped object remains unchanged.

## User impact

The calendar and schedule actions continue returning the schedule data needed by the interface. The internal worker token is no longer included in those API responses, reducing exposure of a server-side concurrency/fencing capability.

## Verification

- Changed files were written through GitHub API and read back from `feat/persisted-boards-api`.
- Node tests/build were not run in this environment.
- Current PR CI jobs fail without job steps or downloadable logs; root cause remains unknown. Do not treat this regression test as executed.
- No production deployment, database migration, cron change, Pinterest publication, or PR merge was performed.
