# AUD-389 — account deletion lifecycle and cross-system cleanup

**Date:** 2026-11-11  
**Status:** source audit completed; deletion remains unimplemented.

## Scope

Reviewed auth/session validation, account/profile routes, payment creation and webhooks, Pinterest OAuth/disconnect/scheduler paths, Storage deletion claims, email outbox, user foreign keys, and active RU/EN privacy notices. Cross-checked prior AUD-372/AUD-350 design findings.

## Confirmed current behavior

1. `requireAuth` validates JWT and `token_version`, but only selects `token_version`; there is no account lifecycle state or `active` predicate. Login also has no deletion-state check.
2. No account deletion request/confirmation route or resumable account deletion worker exists in the inspected backend route and worker inventory.
3. Payment creation and fulfillment have no deletion-state gate. Signed late Prodamus callbacks can still activate subscriptions or credit purchases for the associated user.
4. Pinterest disconnect is account-scoped and fenced: it invalidates OAuth generation, clears access/refresh tokens and refresh lease, and preserves account/publication history. This is useful for disconnect but is not a full account erasure workflow.
5. Scheduler and publication paths are fenced by Pinterest account connection and schedule claim identity, but there is no user lifecycle predicate. A pending deletion cannot currently block all new claims through a central lifecycle switch.
6. Pin-image deletion is reference-aware and claim/fencing based, but it is not an account-owned object inventory or a bulk account cleanup operation. No safe universal mapping from public image URL to owned Storage key was established.
7. `email_outbox` stores recipient and JSON payload, references subscriptions with `ON DELETE RESTRICT`, and has retry/claim state. Sent messages clear recipient and payload, but pending/dead rows need explicit handling before account data cleanup.
8. Historical migration `db/archive/009_hardening.sql` explicitly introduced `ON DELETE CASCADE` relationships for financial and account data (including credit transactions, subscriptions, credit purchases, Pinterest accounts/publications and projects). It is archived and not canonical install material; the current live FK state was not inspected. Do not assume the archived migration accurately describes deployed constraints.
9. Active Russian and English privacy notices promise personal data and OAuth-token deletion within 30 days. The repository has no executable deletion lifecycle or verified backup expiry evidence to substantiate that deadline.

## Critical risks

- A direct `DELETE FROM users` may cascade-delete financial evidence and product history; it may also be blocked by restrictive email-outbox foreign keys. Exact deployed constraints must be inspected before implementation.
- Merely incrementing `token_version` does not stop webhook handlers, payment creation, OAuth callbacks, scheduler workers, generation recovery, or Storage jobs that do not check account lifecycle.
- A late successful payment after deletion request must be durably recorded as money received but not automatically grant inaccessible entitlement. Existing payment `status='success'` conflates provider payment success and entitlement fulfillment in some paths.
- Payment RPCs currently lock payment row then user row. A deletion transaction locking user first then payment rows can deadlock; lock order and race behavior need a deliberate database design and concurrent SQL tests.
- Pinterest HTTP publication already sent cannot be recalled. Unknown publication outcomes must remain fenced and preserved for reconciliation.
- Storage objects, replay journals, image deletion claims, email payloads, provider task journals, logs and backups are separate data copies. Removing the user row does not erase them.

## Required design before implementation

1. Add a durable lifecycle state machine and audit history; define states, transition authority, request confirmation, retry lease and terminal criteria.
2. Make login and every authenticated request reject non-active accounts. Increment `token_version` atomically with `deletion_pending`; ensure account state is checked from PostgreSQL, not only JWT claims.
3. Add lifecycle gates to payment checkout creation, credit/subscription fulfillment, AI generation, OAuth initiation/callback/refresh, manual publishing, scheduler claims, and all recovery workers.
4. Separate provider settlement from entitlement/reconciliation. Signed late-success, amount-mismatch, refund and chargeback events must be durably recorded and routed to a restricted operator queue without granting entitlement after deletion begins.
5. Standardize SQL lock order across lifecycle transition, payment RPCs, Pinterest account/schedule transitions, and cleanup. Add concurrent webhook-vs-delete and worker-vs-delete integration tests.
6. Reconcile/cancel future schedules, invalidate OAuth attempts and clear Pinterest credentials through existing fenced RPCs. Preserve in-flight/unknown publication and refresh evidence until safely resolved.
7. Build an ownership inventory for Storage objects using trusted DB mappings and use existing reference-aware deletion claims. Never infer keys from public URLs or bulk-delete by user-supplied URL.
8. Explicitly classify every retained dataset: financial evidence, credit ledger, provider settlement, email outbox, auth tokens, generation/provider journals, publication attempts, support records, logs, backups and object versions. Minimize/pseudonymize only after legal/accounting approval.
9. Define backup expiry and prove deletion propagation to backups under the actual provider configuration. If selective deletion from backups is impossible, disclose the retention window accurately.
10. Only after the workflow and provider evidence exist, reconcile the 30-day RU/EN policy promise with actual achievable timelines and qualified legal review.

## No source change

No endpoint, migration, destructive cleanup or policy wording was changed. Implementing only a delete button or hard-delete RPC would increase the risk of financial evidence loss, late payment entitlement, orphaned Storage objects and unreconciled Pinterest operations. The correct next step is a schema-level lifecycle design with lock-order and concurrency tests, followed by phased implementation.

## Validation limits

No production database, provider dashboard, actual foreign-key catalog, Storage inventory, user data or backups were accessed. No SQL, tests, CI, staging, payment, Pinterest API, email or deletion operation was run. This is a source/documentation audit, not evidence that any account can currently be deleted.