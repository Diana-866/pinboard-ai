# AUD-145 — Pinterest operator reconciliation implementation preflight

**Status:** implementation contract reviewed; no reconciliation endpoint or database mutation added in this audit step.

## Scope

Provide a narrowly scoped administrator action to record a Pinterest publication that is already confirmed externally but whose local schedule remains unresolved. This is not a retry workflow and must never assert that a pin was not published.

## Verified existing contracts

- pin_schedules.user_id and pinterest_publish_attempts.user_id are text; pin_id, pinterest_account_id and schedule IDs are UUIDs.
- Account-scoped uniqueness is (pin_id, pinterest_account_id) for both attempts and publications. The active-schedule unique index also scopes by account.
- begin_scheduled_pinterest_publish locks the account before the schedule; the publication completion path locks account, all matching reconcilable schedules in stable ID order, then the attempt. Migrations 056–061 document and restore this lock order.
- A worker claim is fenced by claim_token. A non-publishing transition clears it.
- Migration 049 moves a stale publishing schedule to unknown after 20 minutes when an attempt journal exists. It does not update the attempt row in that recovery statement.
- Consequently, an unresolved schedule can legitimately be unknown while its durable attempt remains processing. A future reconciliation RPC must not require the attempt itself to already be unknown.
- Migration 050 permits retry only for failed AND retry_safe=true. This remains unchanged; operator reconciliation must not set retry_safe=true.
- Migration 081 requires normal successful completion to match the board ID reserved on the attempt and on every matching publishing/unknown schedule. Conflicting remote pin or board identity is rejected.
- The existing provider-refund operator journal (migration 078) provides a pattern: append-only table, immutable trigger including TRUNCATE, action UUID idempotency, logical uniqueness, DB-side admin recheck while holding the operator row lock, and service-role-only narrow RPC.

## Required implementation contract

### Request

Accept only:
- schedule_id (UUID)
- pinterest_pin_id (non-empty bounded remote ID)
- pinterest_board_id (non-empty bounded remote board ID)
- allowlisted evidence_type
- bounded opaque evidence_reference (not a URL and not arbitrary free text)
- action_id (UUID idempotency key)

The API derives the operator from the verified JWT (req.userId). Do not accept owner, pin, account, attempt, status, claim token, or operator identity from the request body.

### Database transaction

1. Fast-fail callers who are not administrators.
2. Discover the schedule owner; lock operator and target user rows in ascending UUID order, then recheck is_admin under lock. This handles self-targeting and cross-target admin actions without inconsistent user-row lock order.
3. Lock the Pinterest account, then the schedule, then the attempt. Keep the established account → schedule(s) → attempt ordering. When locking multiple matching schedules, use stable ID order.
4. Require the selected schedule to be unknown, have no live claim token, and be stale for at least the scheduler's 20-minute recovery interval. Do not reconcile a fresh publishing row while a worker may still be active.
5. Require the attempt to match the schedule's owner, pin, account, and exact reserved board. Accept attempt status unknown or stale processing only; require it to be older than the same recovery interval and retry_safe=false.
6. Recheck the local pin ownership chain (pins → boards → projects) and the account ownership. Never trust a client-supplied user ID.
7. If a publication row already exists, accept it only when both remote pin ID and board ID exactly match the submitted evidence. Any mismatch is a hard conflict.
8. Insert the publication idempotently, verify the resulting exact remote identity, mark the attempt and only the selected unknown schedule published, clear errors/next-attempt metadata, and leave all failed/cancelled/other schedules unchanged.
9. Append one immutable journal receipt in the same transaction. Enforce both action-ID idempotency (exact payload replay only) and one logical reconciliation per schedule. Journal actor, target user, schedule, pin, account, remote IDs, evidence, before/after state, action UUID, and timestamp.
10. No unknown → scheduled or unknown → failed route. No “not found on Pinterest” or absence-of-search-results evidence may enable retry.

### Tests required before treating implementation as complete

- Exact same-action replay returns the original receipt timestamp without duplicate writes.
- Reusing an action UUID with any changed payload conflicts.
- A second action for the same schedule conflicts.
- Wrong owner, pin, account, board, or schedule identity is rejected.
- Fresh publishing, fresh processing, stale schedule without attempt, failed, published, and cancelled are rejected.
- Stale unknown schedule + stale processing attempt can be reconciled; stale unknown attempt can be reconciled.
- Conflicting existing publication IDs or boards are rejected without changing any row.
- Admin demotion racing the action is serialized by the locked user row.
- Actor equals target; two administrators resolving the same schedule; cross-target concurrent actions; rollback if journal insert fails.
- Verify retry_safe remains false and no retry endpoint accepts unknown.
- Integration fixture runs against disposable PostgreSQL with migrations 015–017, 031/033, 049–061, and 081 plus the new migration.

## Verification limits

This is a source-level contract review only. No database migration was applied, no live Pinterest account or publication was queried, and no test suite was executed. PR #4 remains Draft and must not be merged until the migration and integration tests run successfully.


## Implementation progress (2026-11-08)

A first guarded implementation has now been added on the feature branch:

- Migration 082 creates an RLS-protected, service-role-inaccessible append-only reconciliation journal with action UUID and one-reconciliation-per-schedule uniqueness.
- The SECURITY DEFINER RPC rechecks administrator status under deterministic operator/target user locks, then follows the Pinterest account → schedule → attempt lock order.
- Only a stale schedule in unknown state with no claim token is eligible. The matching attempt must be stale processing/unknown, retry_safe=false, and match the owner, pin, account and reserved board.
- Existing remote pin/board identity on the attempt, schedule or publication ledger must match exactly. Legacy account-ambiguous history is rejected.
- A successful action writes the publication ledger, updates only the selected unknown schedule and its attempt, and appends the immutable receipt in one transaction. It never marks a publication as not created and never enables retry.
- Added backend validation and the rate-limited authenticated admin route POST /admin/pinterest/reconcile-unknown-publication. Operator identity is taken from req.userId, not the body.
- Added Node unit tests for request validation, narrow RPC arguments, actor identity derivation and safe error mapping.
- Added a disposable PostgreSQL integration fixture for successful reconciliation, exact replay, changed-payload replay rejection, append-only receipt protection and duplicate schedule rejection. Wired migration 082 and the fixture into the atomic-payment PostgreSQL workflow.

## Verification still required

The SQL migration and PostgreSQL fixture have not yet been executed in a local disposable database. Node tests have not been run locally. CI status for the latest commit must be checked; historical workflow log archives have repeatedly returned BlobNotFound, so a failed check without readable logs cannot be attributed to the new code. Do not apply migration 082 to production or expose the endpoint in a deployment until PostgreSQL integration tests pass.


## Static review and privilege-test follow-up (2026-11-08)

- Rechecked migration 082 against migrations 015-017, 031-033, 049-050, 055, and 056-061. The referenced ownership columns and account-scoped partial unique index match the migration assumptions: schedule/attempt owner IDs are text UUIDs; account, pin, and schedule IDs are UUIDs; the publication conflict target matches the partial unique index from migration 033.
- Rechecked the route: it is behind `adminActionLimiter`, `requireAuth`, and `requireAdmin`; the operator ID passed to the RPC comes from the verified request identity, not the request body. The SECURITY DEFINER RPC independently locks/rechecks admin status.
- Rechecked the transaction ordering and state fence: operator/target user rows are locked in UUID order, followed by account → schedule → attempt; the schedule must be stale `unknown`, and the attempt may be stale `unknown` or `processing` with `retry_safe=false`. Existing schedule/attempt/publication remote IDs must agree with the supplied IDs.
- Extended the disposable SQL fixture to assert no direct table privileges for anon/authenticated/service_role, no RPC EXECUTE for anon/authenticated, EXECUTE for service_role, and rejection of TRUNCATE in addition to UPDATE. The fixture remains wrapped in BEGIN/ROLLBACK.
- Corrected the fixture prerequisite comment: migration 078 is not a dependency of this fixture or migration 082.
- Latest GitHub Actions for HEAD `110061ff4bc6346eee7a1f0073d3855b724cd008`: Persisted boards, Atomic payment, and Prodamus workflows all report failure. All four job-log downloads returned Azure `BlobNotFound`; the available job metadata does not expose step outcomes. Therefore the failure stage is still unknown, and no claim is made that SQL or Node tests ran.
- CI workflow applies migrations 015-075, then 080-082; it skips 076-079 in this disposable harness. Migration 082 does not reference objects introduced by those skipped migrations, but the harness is not a byte-for-byte replay of the complete production migration sequence.
- No local PostgreSQL/Node tests, production migrations, live database operations, Pinterest API calls, cron changes, or deployment were performed.
