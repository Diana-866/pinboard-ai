# AUD-292 — clear Pinterest schedule claim on confirmed publication (2026-11-09)

## Problem

The latest definition of `public.complete_pinterest_publish_v2` in migration 081 atomically marks matching `pin_schedules` rows as `published`, but does not clear `claim_token`. The worker's success path explicitly assumes that the completion RPC clears the token. A completed schedule could therefore retain the UUID claim capability from its previous `publishing` state.

## Changes

- Added `db/migrations/100_pinterest_publish_completion_clears_claim.sql`, a forward-only replacement of the current completion RPC.
- Preserved the account → all matching active/uncertain schedules in stable ID order → publication attempt lock order.
- Preserved strict owner, attempt-board, schedule-board, and remote-publication identity checks.
- The atomic schedule completion update now sets `claim_token = null` together with `status = 'published'`, `next_attempt_at = null`, and the confirmed remote Pinterest pin ID.
- Preserved function privilege revocation/grant: only `service_role` may execute the completion RPC.

## Regression coverage

- Existing `backend/test/pinterest-publication-concurrency.sh` already asserts that the schedule claim token is null after a worker-completion/stale-recovery race. Its recovery fixture starts in `publishing` with a non-null UUID claim token, so it covers this regression after migration 100 is applied.
- The integration test also verifies convergence of schedule, attempt journal, and publication ledger to the exact same remote Pinterest identity.

## Verification and rollout

- Migration source and existing regression assertion were read from the PR branch.
- SQL integration test was not executed in this environment; it requires the disposable PostgreSQL integration database and migrations applied in order.
- No production SQL was executed. Migration 100 is committed to the branch only; it still requires explicit review and manual application in the intended database.
- No deploy or merge was performed.
