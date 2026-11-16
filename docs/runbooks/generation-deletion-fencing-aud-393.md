# AUD-393 — generation and provider spend fencing during account deletion

**Historical design checklist (superseded 2026-11-16).** Generation/deletion spend fencing has since been implemented in the mainline migration chain (including migrations 142–144) and backend generation/provider recovery code. The unchecked items below are not a current implementation checklist. Verify exact current behavior in code/tests; do not use this document to apply schema changes.


**Status:** design-only runbook. Do not execute against production.

## Preconditions

- [ ] Verify deployed migration state and RPC definitions read-only.
- [ ] Confirm GPTunnel idempotency and task lookup behavior with provider documentation/account evidence.
- [ ] Confirm Storage object inventory and existing claim/quarantine protocol.
- [ ] Resolve AUD-390 lifecycle states and AUD-392 financial receipt model.

## Required database changes

- [ ] Add user account_status and monotonic lifecycle_version.
- [ ] Capture lifecycle_version in generation and regeneration request rows.
- [ ] Gate every mutating generation RPC on active status and expected version.
- [ ] Refactor lock order to users → request → reservation → tasks (task_index order) → pins/ledger.
- [ ] Preserve service_role-only grants, fixed search_path, RLS and claim-token fencing.
- [ ] Add append-only provider task receipt path for late outcomes after ordinary claim invalidation.
- [ ] Keep provider outcome separate from user credit disposition.
- [ ] Add per-task deletion reconciliation state and operator inventory.

## Runtime behavior

- [ ] Reject new generation and regeneration after deletion transition.
- [ ] Do not submit new GPTunnel tasks during deletion.
- [ ] For accepted/unknown submissions, poll only the same known provider task ID.
- [ ] Persist price, terminal outcome and refund facts even if account is non-active.
- [ ] Never create a replacement task because a request timed out or became unknown.
- [ ] Do not save pins or debit ordinary user credits after deletion commit.
- [ ] Hold uncertain reservations; release only proven unsubmitted or authoritatively refunded/no-cost amounts.
- [ ] Keep external provider and Storage calls outside database transactions.

## Storage and cleanup

- [ ] Build deletion inventory from trusted DB object paths and task journals.
- [ ] Fence new uploads/finalization after lifecycle transition.
- [ ] Reconcile in-flight uploads before deleting references.
- [ ] Use existing deletion claim/quarantine/reference checks.
- [ ] Never derive Storage keys from public URLs or delete an unverified bucket prefix.

## Disposable PostgreSQL and staging tests

- [ ] Deletion vs begin/reserve/resize/complete races.
- [ ] Both lock winners with no deadlock and correct final state.
- [ ] Accepted task + deletion: poll same task, receipt persists, no pin/debit.
- [ ] Timeout/unknown + deletion: reservation remains held.
- [ ] Late terminal outcome after claim invalidation is recorded append-only.
- [ ] Partial multi-task success releases only proven unused reservation.
- [ ] Upload/finalization vs deletion uses reference-aware cleanup.
- [ ] Regeneration and legacy paths are lifecycle-fenced.
- [ ] Existing generation, recovery, credit, provider outcome and image lifecycle tests pass.

## Stop conditions

Stop rollout on any provider task resubmission without proof, missing provider cost/refund fact, released uncertain reservation, ordinary credit debit after deletion commit, deadlock, pin persistence after deletion fence, orphaned Storage object, or stale claim overwriting newer state.

## Operator handling

Show held tasks in a restricted inventory keyed by request/task/provider IDs and pseudonymous user reference. Record provider price/refund evidence and exact disposition. Operators must not edit credit balances, mark unknown tasks failed by assumption, release reservations to unblock deletion, or delete task journals before financial reconciliation and approved retention.

## Safety boundary

This runbook does not authorize production migrations, GPTunnel calls, Storage deletion, balance edits, or changes to real user tasks.
