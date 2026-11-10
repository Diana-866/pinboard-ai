# AUD-292 — clear Pinterest schedule claim on confirmed publication (2026-11-09)

## Problem

The latest definition of `public.complete_pinterest_publish_v2` in migration 081 atomically marks matching `pin_schedules` rows as `published`, but does not clear `claim_token`. The worker's success path assumes that the completion RPC clears the token. A completed schedule could therefore retain the UUID claim capability from its previous `publishing` state.

## Changes

- Added forward-only migration `db/migrations/112_pinterest_publish_completion_clears_claim.sql`, sequenced after the existing migrations through 111.
- Preserved the account → all matching active/uncertain schedules in stable ID order → publication attempt lock order.
- Preserved strict owner, attempt-board, schedule-board, and remote-publication identity checks.
- The atomic schedule completion update now sets `claim_token = null` together with `status = 'published'`, `next_attempt_at = null`, and the confirmed remote Pinterest pin ID.
- Preserved function privilege revocation/grant: only `service_role` may execute the completion RPC.
- Added migration 112 to `.github/workflows/atomic-payment-integration.yml` immediately after migration 111. The earlier draft filename used the already-occupied numeric prefix 100; it was corrected before rollout, and the duplicate-numbered draft file was removed.

## Regression coverage

- `backend/test/pinterest-publication-concurrency.sh` includes a recovery fixture that starts in `publishing` with a non-null UUID claim token.
- Its worker-completion/stale-recovery race asserts the final schedule is `published`, has the exact remote Pinterest ID, and has `claim_token IS NULL`.
- The separate late-success/stale-recovery race also asserts a null claim token. The script is already invoked by the atomic-payment integration workflow after migrations are applied.

## Verification and rollout

- Migration 112, the workflow sequence, and the existing concurrency assertions were read back from the PR branch.
- PostgreSQL integration tests were not executed in this environment; GitHub Actions has previously failed before exposing runner steps/logs. The new CI run must be checked independently.
- No production SQL was executed. Migration 112 is committed to the branch only; it still requires review and manual application to the intended database.
- No deploy or merge was performed.
