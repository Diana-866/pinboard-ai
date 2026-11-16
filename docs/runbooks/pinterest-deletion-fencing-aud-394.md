# AUD-394 — Pinterest account deletion fencing

**Historical design checklist (superseded 2026-11-16).** Pinterest/deletion fencing has since been implemented in the mainline migration chain (127–148) and Pinterest account/scheduler worker code. The unchecked items below are not a current implementation checklist. Current runtime behavior and release gates must be checked against main, integration tests and docs/PROJECT_STATE.md.


**Status:** design-only runbook. Do not execute against production.

## Preconditions

- [ ] Verify deployed migrations and current SECURITY DEFINER RPC bodies read-only.
- [ ] Confirm Pinterest's supported OAuth token revocation endpoint/behavior from authoritative provider documentation.
- [ ] Resolve lifecycle states and user-first lock order from AUD-390–393.
- [ ] Inventory account rows, OAuth connection state, refresh leases, schedules, attempts, publications, snapshots and operator reconciliation FKs.

## Lifecycle transition

- [ ] Lock PinPosy user first; require active state and increment lifecycle_version.
- [ ] Under the same documented lock order, fence OAuth attempts and scheduler claims.
- [ ] Clear local access/refresh credentials and refresh lease; retain minimal account tombstone.
- [ ] Move future scheduled rows to deletion-held/cancelled; do not overwrite publishing/unknown claims.
- [ ] Prevent manual publish, retry, OAuth reconnect and new scheduled claims after transition.

## OAuth and refresh

- [ ] Make OAuth begin and callback commit lock user → OAuth state → account.
- [ ] Re-check active lifecycle/version inside commit RPC after token exchange.
- [ ] Discard exchanged credentials if commit is rejected.
- [ ] Verify remote token revocation support; never claim local credential deletion equals provider revocation.
- [ ] Preserve refresh lease fencing; stale workers cannot restore credentials.

## Publication and worker

- [ ] Make scheduler claim RPC lock/check active owner before account/schedule.
- [ ] Make manual and scheduled reservation require active lifecycle/version.
- [ ] Assert lifecycle + claim token immediately before POST /pins.
- [ ] If deletion wins before POST, do not publish.
- [ ] If POST may already have reached Pinterest, preserve unknown state and reconcile exact attempt.
- [ ] Record late remote pin ID as immutable external fact; do not restore user-visible schedule or retry eligibility.
- [ ] Keep external Pinterest HTTP calls outside database transactions.

## Retention and cleanup

- [ ] Preserve account tombstone until all in-flight attempts and schedules are reconciled.
- [ ] Retain remote pin/board IDs and minimal publication evidence only for approved period.
- [ ] Inventory and process OAuth state, account profile, immutable snapshots, creative content, schedule rows and logs.
- [ ] Resolve all RESTRICT foreign keys and operator reconciliation dependencies before hard deletion.
- [ ] Anonymize user identity in retained financial/operational records where legally required.

## Disposable PostgreSQL and staging tests

- [ ] OAuth callback vs deletion lock-order races, both winners.
- [ ] OAuth begin/callback/refresh blocked after deletion.
- [ ] Scheduler claim and manual reservation blocked after deletion.
- [ ] Future scheduled rows held without mutating publishing/unknown claims.
- [ ] Deletion before POST prevents remote side effect.
- [ ] Deletion after POST start records late remote success exactly once without reactivation.
- [ ] Existing disconnect/refresh and cancellation/claim races remain green.
- [ ] Tombstone/FK/anonymization retention path completes without losing reconciliation evidence.

## Stop conditions

Stop if any OAuth credentials persist after deletion fence, a scheduler claims/publishes after deletion, an unknown POST is blindly retried, late remote success is discarded, local schedule is reactivated, account tombstone is deleted before reconciliation, or FK evidence is removed prematurely.

## Safety boundary

This runbook does not authorize production migrations, Pinterest API calls, token revocation, schedule changes, Storage deletion or changes to real user accounts.
