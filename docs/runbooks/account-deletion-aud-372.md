# Account deletion — safe operator procedure (AUD-372)

**Historical design snapshot (superseded 2026-11-16).** Main now contains account lifecycle/deletion implementation across migrations 127–148, account deletion routes and backend/accountDeletionWorker.js. The statement below that no end-to-end workflow exists is stale. This file is retained as design history; do not use its future-state checklist as current execution instructions. Current behavior and gates must be read from numbered migrations, backend code, integration tests and docs/PROJECT_STATE.md.


**Status:** design/runbook only. There is currently no end-to-end account deletion workflow. Do not claim an account can be deleted automatically or within a fixed deadline.

## Before implementation or processing a manual request

1. Confirm the requester's identity through the approved support process.
2. Check pending/ambiguous Prodamus payments, refunds, chargebacks, credit purchases and subscriptions.
3. Check in-flight generation, Pinterest publication attempts, scheduled pins, OAuth refresh and Storage upload/delete claims.
4. Identify all owned Storage objects from trusted database mappings. Never derive object keys from public URLs.
5. Determine the minimum financial/accounting evidence that must be retained with qualified legal/accounting advice.
6. Confirm backup retention/expiry and whether provider backups can be selectively erased (usually they cannot be edited row-by-row).

## Required future workflow

1. Atomically set lifecycle to `deletion_pending` and revoke JWTs by advancing `token_version`.
2. Block login/session refresh and all new generation, payment checkout, OAuth, publishing and scheduler claims.
3. Reconcile late/ambiguous payment events. Record money received separately from entitlement; do not credit a pending-deletion account.
4. Invalidate OAuth attempts and disconnect Pinterest credentials through the fenced RPC.
5. Cancel future schedules. Preserve ambiguous in-flight publication evidence until resolved.
6. Remove owned projects/pins and media using the reference-aware Storage queue only after all references and in-flight claims are reconciled.
7. Remove or anonymize personal data in email outbox, support/operational records and other data stores according to approved retention.
8. Preserve minimum required financial evidence in a restricted, pseudonymized record set.
9. Verify cleanup by aggregate inventory; never include raw tokens, email payloads or private content in operator reports.
10. Mark the lifecycle terminal only when all required cleanup tasks are complete or an explicit retained-data exception is recorded.

## Stop conditions

Stop and escalate if:
- payment status/amount or refund state is ambiguous;
- a Pinterest publish or OAuth refresh outcome is unknown;
- Storage deletion claim is active, stale or blocked;
- an object still has any durable reference;
- cleanup encounters an FK restriction or unexpected row count;
- a backup/key recovery set is unavailable;
- the requested deletion conflicts with an unresolved legal/accounting retention requirement.

Never resolve a stop condition by force-deleting rows or replaying an ambiguous remote operation.

## Current reality

- No user-facing deletion endpoint or resumable account deletion worker was found in the inspected source.
- Active RU/EN policy currently contains a 30-day deletion promise; it needs operator/legal reconciliation before launch.
- This document is not evidence that any individual request has been processed.
