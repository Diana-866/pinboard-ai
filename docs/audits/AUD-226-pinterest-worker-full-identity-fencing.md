# AUD-226 — Full-identity fencing for Pinterest worker failure updates

## Finding

The worker's failure/recovery path conditionally updated a claimed `pin_schedules` row by schedule ID, status, and claim token. The token is the primary concurrency fence, but the mutation did not independently constrain the row by its owner, local pin, Pinterest account, and destination board. That made the failure path weaker than the success/reconciliation paths, which already verify the full schedule identity.

## Change

- Added `hasCompleteScheduleClaimIdentity`, requiring non-empty schedule ID, user ID, pin ID, Pinterest account ID, Pinterest board ID, and claim token.
- The worker refuses to mutate a failure state if any identity component is missing.
- The conditional update now filters by all six identity values plus `status=publishing` and the exact claim token.
- Added unit coverage for every required identity field.

## User impact

A worker that has incomplete or mismatched schedule data cannot clear a claim or move another schedule into retry/failed/unknown state. A stale or malformed worker result is safely left for reconciliation rather than being applied to a row it cannot fully identify.

## Verification

- Source files were fetched after the edits and commit SHAs recorded in HANDOFF.
- Unit tests were added but not executed in this environment.
- No production database, Pinterest API, deployment, or merge operation was performed.
