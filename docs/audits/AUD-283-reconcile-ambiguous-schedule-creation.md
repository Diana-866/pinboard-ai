# AUD-283 — Reconcile ambiguous schedule creation responses

## Problem
The schedule POST can commit in the database while its HTTP response is lost. The backend's one-active-schedule-per-pin uniqueness guard prevents a duplicate on retry, but the client previously surfaced the transport/409 error as if scheduling had failed. The calendar could therefore contain the schedule while the generator showed no success confirmation.

## Change
- The App schedule handler now builds the exact schedule payload once and attempts the POST.
- If the POST rejects, it performs a read-only GET of the authenticated user's schedule list.
- It treats the operation as successful only when exactly one row matches the pin ID, exact scheduled instant, Pinterest board ID, and—when the request explicitly selected one—the Pinterest account ID. If the server selected the account, the match still requires the exact pin, time, and board.
- If the read fails, is malformed, or does not produce exactly one exact match, the original POST error is re-thrown unchanged.
- The recovered row flows through the existing persisted-schedule mapping and state update, using the server's canonical schedule ID and timestamp.

## Safety
- No new schedule is created during reconciliation; it is read-only.
- No loose pin-only match is accepted, so an older schedule for the same pin cannot be mistaken for the current request.
- Existing backend uniqueness and ownership constraints remain unchanged.

## Verification
- Source read-back should confirm exact-match reconciliation and preservation of the original error on any uncertainty.
- Automated tests, lint, typecheck, and build have not been run in this environment.
- No database migration, production data change, deployment, or merge.
