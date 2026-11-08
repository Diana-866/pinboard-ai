# AUD-225 — Finalize schedules when the publication already exists

## Finding

The scheduled worker can reserve a schedule whose Pinterest publication ledger already contains a successful publication for the same local pin/account. The reservation RPC returns `status=published` without issuing a new Pinterest POST. The backend previously returned success immediately, without finalizing the currently claimed `pin_schedules` row. In a stale or partially repaired state, the calendar entry could therefore remain `publishing` until a later stale-claim reconciliation.

## Change

- Added `resolvePublishedReservation` to require a non-empty remote pin ID and an exact match between the stored Pinterest board and the requested destination.
- When a scheduled worker receives an existing published reservation, it now conditionally finalizes the exact schedule row using its current claim token and the full user/pin/account/board identity.
- If the conditional update affects no row, the backend accepts success only when a follow-up read proves that a concurrent completion already finalized the same schedule with the same remote pin and board.
- Database errors or identity/claim mismatches remain fail-closed; the worker does not send another Pinterest POST.

## User impact

A schedule whose pin was already published but whose calendar state had not caught up can now be marked published during the next worker run, without publishing a duplicate. A stale worker cannot overwrite a newer claim, and a publication recorded for another board is not treated as success.

## Verification

- Added unit tests for valid existing publication identity, wrong board, and missing remote pin ID.
- Source files were fetched again after the commits and reviewed.
- Node tests, PostgreSQL integration tests, lint, and build were not executed in this environment. Do not treat the tests as passed.
- No production database, Pinterest API, deployment, or merge operation was performed.
