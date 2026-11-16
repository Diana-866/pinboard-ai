# PinPosy — account deletion: implementation and operator safety gates (AUD-389)

**Historical status (superseded 2026-11-16):** the statement below that no self-service endpoint or end-to-end worker exists is no longer true on main. The current implementation is represented by migrations 127–148, backend account-deletion routes and backend/accountDeletionWorker.js. This document is retained as historical design context; its future-state checklists are not a current implementation plan or an executable production runbook. Use current code, docs/PROJECT_STATE.md and the current deletion runbooks after checking their migration prerequisites.

## Before accepting a deletion request

1. Verify requester identity and require recent re-authentication / explicit confirmation in the eventual product flow.
2. Inspect exact deployed FK definitions and row counts in a read-only preflight. Do not assume archived migration 009 matches production.
3. Inventory pending/unknown Prodamus orders, refunds, chargebacks, subscriptions and credit purchases.
4. Inventory active generation reservations/tasks, image upload/delete claims, Pinterest OAuth attempts/refresh leases, scheduled pins, in-flight publications, email outbox rows and provider recovery journals.
5. Identify owned Storage objects from trusted database records; do not infer object paths from public URLs.
6. Obtain approved retention rules for accounting evidence, provider records, support data, logs and backups.

## Required future state machine

Suggested states: `active` → `deletion_pending` → `reconciling` → `cleanup_pending` → `anonymized` or restricted `retained_financial_only`. Every transition must be conditional, auditable, idempotent and resumable. A terminal state requires all cleanup tasks complete or a recorded approved retention exception.

## Required execution order

1. Atomically record deletion request, lifecycle state and request audit event; increment `token_version` to revoke existing JWTs.
2. Block login and every authenticated/product route for non-active accounts. Block new checkouts, generation, OAuth, refresh, publishing and scheduler claims.
3. Resolve in-flight provider/payment operations. Keep unknown states fenced. For money received after deletion request, record settlement and route for refund/reconciliation review without automatically granting entitlement.
4. Disconnect every Pinterest account through the existing fenced disconnect path; cancel future schedules. Preserve unknown/in-flight publish evidence until reconciled.
5. Drain/cancel generation reservations and jobs; wait for or reconcile Storage upload/delete claims.
6. Delete only verified account-owned content and Storage objects through reference-aware cleanup; preserve shared or uncertain objects.
7. Scrub or anonymize email outbox, operational records, support data and personal identifiers according to approved retention classes.
8. Preserve minimum required financial/provider evidence in a restricted pseudonymized form; ensure no login, entitlement, OAuth credential or product access remains.
9. Verify by aggregate counts and invariant checks; do not expose private content, email payloads, tokens or raw provider bodies in operator reports.
10. Mark terminal state only after all required jobs are complete and backup expiry/retention behavior is documented.

## Mandatory stop conditions

- Unknown payment, refund or chargeback outcome.
- Unknown Pinterest publication or token-refresh outcome.
- Active/stale Storage claim, remaining reference, or unknown object ownership.
- FK restriction, unexpected row count, failed cleanup batch or missing backup/key evidence.
- Unapproved financial/legal retention decision.

Do not force-delete, replay an ambiguous remote request, or mark cleanup complete to bypass a stop condition.

## Privacy notice gate

The active RU/EN policies currently promise deletion of personal data and OAuth tokens within 30 days. Do not rely on this deadline until the complete workflow and backup expiry have been implemented and verified. Reconcile wording with actual providers, retention settings and qualified legal review before launch.

## Current reality

No deletion route/worker, lifecycle marker or verified 30-day cleanup capability was found. No production data or provider settings were inspected. This runbook is not evidence that a deletion request has been processed.