# AUD-229 — Include the schedule's remote Pinterest ID in recovery identity

## Finding

The automatic success-reconciliation paths compared the publication attempt with the durable publication ledger and matched the schedule by owner, local pin, account, and board. They did not compare an already-populated `pin_schedules.pinterest_pin_id` with the remote ID in those records.

A stale or conflicting remote ID already stored on the schedule could therefore be silently overwritten while the schedule was promoted to `published`.

## Change

- Add migration `093_pinterest_schedule_remote_pin_identity_fencing.sql`.
- In both `reconcile_confirmed_pinterest_schedule_successes()` and stale `claim_due_pin_schedules()` recovery, require the schedule's remote ID to be either null (not yet persisted) or exactly equal to the attempt and publication-ledger remote ID.
- Preserve mismatched schedules as `unknown`; do not overwrite their existing remote ID, mark them published, or make them retryable.
- Extend disposable-PostgreSQL integration tests for both automatic reconciliation paths.
- Apply migration 093 in the atomic-payment PostgreSQL CI workflow after migrations 091 and 092.

## User impact

If PinPosy already has a Pinterest Pin ID on a schedule, recovery cannot replace it with a different ID merely because two other database records agree. The schedule remains blocked for investigation instead of being shown as a potentially incorrect success. A null schedule ID can still be filled when the attempt and durable publication ledger agree exactly.

## Verification and safety

Source files and tests were updated on the existing Draft PR branch. The SQL integration tests were added but have not been executed locally. CI status must confirm the migration and tests. No production database, Pinterest account, deployment, or merge was touched.
