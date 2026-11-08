# AUD-230 — Require exact attempt identity before failed-board reassignment

## Finding

The failed-schedule board reassignment RPC checked that a previous publication attempt was marked `failed` and `retry_safe`, but it did not verify that the journal row belonged to the schedule owner and the schedule's original Pinterest board.

A retry-safe journal from a different board/owner identity must not authorize changing the destination of this schedule.

## Change

- Add migration `094_pinterest_failed_board_reassignment_requires_exact_attempt_identity.sql`.
- Preserve the account → schedule → attempt lock order and existing preflight/error/publication/duplicate-schedule checks.
- Before using a retry-safe attempt as authorization, require exact `user_id` and `pinterest_board_id` equality with the locked schedule.
- Return a dedicated `attempt_identity_mismatch` reason and a clear 409 response; do not mutate or requeue the schedule.
- Add a disposable-PostgreSQL regression test for mismatched and matching journal identities.
- Wire migration 086 (the original reassignment RPC) and migration 094 plus the new test into PostgreSQL CI.

## User impact

A failed schedule can still be moved to a newly verified Pinterest board when the old attempt is explicitly safe to retry and belongs to that exact schedule identity. If the stored attempt points to another board or owner, PinPosy keeps the schedule failed and explains that manual reconciliation is needed instead of silently reusing unrelated journal data.

## Verification and safety

The migration, SQL regression test, route error mapping, CI workflow, and handoff were added to the existing Draft PR branch. SQL tests have not been executed locally. No production database, Pinterest API, deployment, or merge was touched.
