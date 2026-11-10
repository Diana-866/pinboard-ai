# AUD-224 — Confirm Pinterest worker schedule updates actually changed a row

## Finding
The worker conditionally updated a schedule using its current `id`, `status='publishing'`, and `claim_token`, but checked only the Supabase `error` field. A successful HTTP/SQL response with zero matching rows is not an error. If a newer worker had already replaced the claim token, the old worker could report `scheduled` or `failed` even though its conditional update changed nothing.

## Changes
- The worker now requests the updated row with `.select("id").maybeSingle()`.
- Added `isScheduleClaimUpdateConfirmed`, which returns true only when the update returned a row and no error.
- A zero-row result is now reported as an unconfirmed/unknown worker outcome, with a diagnostic that the claim is no longer current. The worker does not claim a status transition that it did not persist.
- Added unit coverage for a confirmed row, a zero-row response, a database error, and a missing response.

## User impact
A stale worker can no longer tell the scheduler that a pin was rescheduled or failed when its claim had already been replaced. The visible schedule state remains based on the database's actual row, not an assumed successful update.

## Verification and safety
- Re-read worker, helper, and test files from the feature branch after commits.
- Tests were added but not executed in this environment. No claim is made that Node tests, SQL integration, lint, or build passed.
- No production database, Pinterest API, deployment, or merge operation was performed.

## Commits
- `f1af1cbf6212e87efe9685e09c4349609cedb8e8` — confirmation helper
- `d4ab191e71351db5cb94e7ecc1131a0ff467da63` — worker integration
- `67d0da922ee594e8eb154aa59199efad9d8c41c6` — regression tests
