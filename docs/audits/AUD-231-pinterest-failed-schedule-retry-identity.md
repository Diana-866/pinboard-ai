# AUD-231 — Exact journal identity for manual Pinterest schedule retries

## Finding
The failed-schedule retry path trusted a publication attempt selected by (pin_id, pinterest_account_id) and its retry_safe flag. It did not require the attempt's user_id and pinterest_board_id to match the schedule. The calendar's retryability metadata used the same incomplete identity. A stale or inconsistent safe journal for another board could therefore make the UI offer a retry, while the RPC could requeue the schedule based on that journal.

## Changes
- Added migration 095 overriding retry_failed_pin_schedule(text, uuid).
- The RPC now rejects an existing attempt unless its owner and original board exactly match the schedule; retry_safe must be exactly true and status must be failed.
- The RPC preserves account → schedule → attempt lock order, existing ownership and duplicate-publication checks, and service-role-only execution.
- The schedule API now loads the journal's owner and board identity. getScheduleRetryability rejects a mismatch, so the calendar does not offer an unsafe retry.
- The retry endpoint maps attempt_identity_mismatch to HTTP 409 with a clear reconciliation message.
- Added pure unit coverage for mismatches in owner, pin, account, and board, plus a disposable PostgreSQL regression test proving that a wrong-board journal cannot requeue a schedule and an exact retry-safe journal can.
- Wired migration 095 and the SQL regression test into the atomic-payment integration workflow after migration 094.

## User impact
If a failed schedule's publication history belongs to another board or account, PinPosy now blocks the retry instead of treating that journal as permission to publish again. The retry button is hidden for inconsistent journal identity; if a stale client still submits the action, the database independently rejects it. A retry remains available when the exact attempt identity matches and the journal explicitly proves it is safe.

## Verification and boundaries
- Source files and workflow were written through GitHub and are awaiting a real CI run.
- No local Node or PostgreSQL test execution was available in this environment.
- No production migration was applied; no Pinterest request, deployment, or PR merge was performed.
