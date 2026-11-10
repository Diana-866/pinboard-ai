# AUD-372 — end-to-end account deletion and personal-data lifecycle

**Date:** 2026-11-11  
**Status:** source review complete; deletion remains unimplemented  
**Scope:** account/auth routes, payment webhook/RPC design, Pinterest disconnect, image retention queue, email outbox schema, privacy notices, prior AUD-114/AUD-350/AUD-369.

## Executive result

PinPosy has component-level cleanup protections, especially for managed pin images and Pinterest disconnect, but does not provide an end-to-end account deletion workflow. Do not expose a self-service delete button or implement a direct `DELETE FROM users`.

The active privacy notice says personal data and OAuth tokens are removed within 30 days after account deletion, but the repository has no executable account deletion lifecycle or verified backup expiry process supporting that promise. This is a launch/legal-review blocker; the operator must review and correct policy language against actual operations and applicable law.

## Confirmed source findings

### 1. Account lifecycle and authentication

- `backend/index.js` contains authenticated profile routes such as `GET/PATCH /me`, but no account deletion request/confirmation endpoint or account deletion worker was found in the inspected route inventory.
- The inspected user lifecycle schema has no deletion-pending/anonymized state or equivalent marker.
- Auth invalidation uses `users.token_version`; incrementing it can invalidate existing JWTs, but by itself does not stop a payment webhook or background worker from acting on retained records.
- Pinterest OAuth callback, token refresh, manual publish and scheduler claim paths need an explicit active-account predicate once a lifecycle state exists.

### 2. Payment and financial evidence

- Migration 009 uses cascading user foreign keys for credit transactions, subscriptions, credit purchases and related account/product records. A physical user delete can erase payment/credit evidence.
- The transactional email outbox migration uses `subscription_id ... ON DELETE RESTRICT`; related rows must be handled explicitly before any physical deletion.
- Prodamus successful callbacks invoke `activate_paid_subscription` or `credit_paid_purchase`. The design runbook records that these RPCs do not check an account-deletion marker.
- Existing payment handlers couple settlement and entitlement differently: credit fulfillment has `balance_credited_at`; subscriptions use success/period fields. A delayed successful webhook after deletion request needs a durable paid-but-not-entitled reconciliation outcome, not a silent drop or automatic credit.
- Current payment RPCs lock payment rows before user rows. A deletion transaction that locks user then payment rows can deadlock. A single documented lock order and PostgreSQL concurrency tests are prerequisites.
- The mismatch/unknown-order webhook edge cases already documented in the account-deletion design remain relevant: payment evidence must be durably recorded before acknowledging a webhook that needs reconciliation.

### 3. Pinterest and publication history

- The disconnect path uses `disconnect_pinterest_account_v2`; prior source audits report that the RPC clears OAuth token fields while preserving connection/history state. Disconnect is not full account erasure.
- The account-deletion flow must invalidate pending OAuth attempts, stop new refreshes/publishes, cancel future schedules, and remove stored credentials through the existing fenced RPC.
- An in-flight Pinterest HTTP request cannot be cancelled after it has been sent. Preserve/reconcile its publication outcome; do not promise immediate remote cancellation.
- Publication attempts without a user foreign key need explicit retention/cleanup or anonymization rules.

### 4. Generated images and Storage

- The repository has a reference-aware image deletion lifecycle: claim/fencing, database reference checks, ambiguous remote-operation handling, retention queue and blocked-item diagnostics.
- This image lifecycle is not a complete account cleanup job. Account deletion must enumerate every object owned by the account through verified DB mappings; never infer object paths from public URLs or bulk-delete by age.
- `pin-images` is public-by-URL according to prior audit. Deleting a DB row alone does not prove that the object, snapshots, generation journals or backup copies are gone.
- Keep objects referenced by active schedules, uncertain generation/publication records or an unresolved Storage operation fenced until safely reconciled.

### 5. Email outbox and other retained data

- The email outbox stores recipient and payload data and has a restrictive subscription FK. No complete delivered/dead-letter/outbox retention and anonymization policy was evidenced in the reviewed migration.
- Cleanup must remove or minimize recipient/payload data while preserving the minimum event/financial evidence required for audit and operational reconciliation.
- Logs, provider task journals, webhook exception records, generation usage, support records and backups need explicit retention classes. Deleting the primary user row does not erase copies in provider logs, object versioning or database backups.

### 6. Privacy notice mismatch

- Active RU/EN notices promise deletion of personal data and Pinterest OAuth tokens within 30 days after account deletion; the backend workflow and backup-expiry evidence do not currently support this promise.
- The notice also describes Pinterest token deletion after disconnect; source-level RPC behavior is stronger than account erasure, but live migration/deployment state remains unverified.
- Provider inventory, actual service regions, contractual retention, international transfer safeguards and the legal operator details require operator verification. Do not invent or publish those details from repository assumptions.
- This audit is not legal advice. Policy changes require qualified legal review and actual provider configuration evidence.

## Required lifecycle design before implementation

Use an explicit, durable, resumable state machine, for example:

1. `active`: normal operation.
2. `deletion_pending`: request timestamp and request identity recorded; revoke sessions; reject new authenticated work, payment creation, generation, OAuth initiation/callback, manual publish and schedule claims.
3. `reconciling`: resolve in-flight generation, Storage operations, Pinterest publishes and provider payments; cancel future schedules and disconnect credentials.
4. `cleanup_pending`: idempotently remove verified owned product data and object references; scrub email/outbox/support payloads according to policy.
5. `anonymized`: remove/pseudonymize profile and content identifiers while retaining only approved minimum financial and legal evidence.
6. `retained_financial_only` (if required): restricted record set with no usable login, entitlement, OAuth credential or product access.

The exact states and terminal outcomes must be designed against the current schema before adding a migration. Every transition needs an audit event, conditional state predicate and retry-safe worker lease.

## Required transaction and worker invariants

- Session revocation and transition to `deletion_pending` must be atomic.
- Every normal authenticated route must require an active account, not merely a valid JWT.
- New payment creation and all entitlement RPCs must check lifecycle state.
- A signed late-success payment must be durably recorded as paid/reconciliation-required, without crediting or activating an inaccessible account.
- Standardize SQL lock order across deletion, subscription activation and credit fulfillment.
- Workers must use claims/fencing and process bounded batches; expired ambiguous remote-operation leases are blocked for reconciliation, never blindly replayed.
- Pinterest disconnect must invalidate OAuth generations and clear credentials. Preserve uncertain publish evidence until resolved.
- Storage deletion must use the existing reference-aware lifecycle and proven owner-to-object mappings.
- Cleanup must be idempotent, resumable, observable, and safe under duplicate requests, retries, restarts and partial provider failures.
- Keep a minimal append-only financial evidence trail separate from deletable profile/content data, with restricted access and approved retention.
- Define how account deletion interacts with refunds, chargebacks, pending payments, tax/accounting requirements and Prodamus reconciliation before implementation.

## Required test matrix

Use a disposable PostgreSQL/Supabase-compatible test environment, never production:

1. Duplicate deletion request and repeated worker execution.
2. Existing JWT rejected immediately after lifecycle transition; refresh/reset/OAuth callbacks cannot restore access.
3. New generation, payment checkout, publish and schedule claims blocked for pending account.
4. Successful Prodamus webhook racing deletion; both lock orders tested without deadlock.
5. Successful webhook after deletion request creates a durable review case but no credits/subscription entitlement.
6. Duplicate and out-of-order webhooks do not double-credit or overwrite confirmed settlement.
7. Payment amount mismatch and unknown order are durably reconciled before acknowledgement where applicable.
8. In-flight Pinterest publish/disconnect race is recorded as published/failed/unknown without duplicate publication.
9. In-flight image upload/delete and active schedule references prevent unsafe Storage deletion.
10. Partial cleanup, DB outage, Storage outage and worker restart resume without deleting another user's objects.
11. Email outbox FK restrictions are resolved without dropping required financial evidence.
12. Export, logs and retained financial records contain no OAuth tokens, passwords, JWTs or unnecessary personal payloads.
13. Backup restore and expiry policy demonstrate the actual deletion boundary for retained snapshots.

## Safe next implementation order

1. Complete schema/foreign-key and route inventory, including every payment, worker and service-role RPC.
2. Obtain operator/legal/accounting decisions on minimum financial retention, refunds and deletion SLA.
3. Design separate payment settlement vs entitlement state and standardize SQL lock ordering.
4. Add lifecycle migration/RPCs and concurrency integration tests in a disposable database.
5. Gate auth, OAuth, generation, billing, scheduler and workers on active lifecycle state.
6. Add resumable cleanup worker for Pinterest, schedules, projects, pins, Storage, outbox and personal data.
7. Add aggregate diagnostics and operator recovery controls without exposing secrets.
8. Run restore/deletion drills; define backup retention and expiry evidence.
9. Only then add UI and publish policy wording that the implementation can actually fulfil.

## Validation and limitations

- Source/document review only. No live Supabase data, provider console, environment secret, account, payment or Storage object was accessed.
- No account deletion, data export, token revocation, financial reconciliation, SQL migration, tests, build, lint, CI or deployment was executed.
- No code/schema behavior was changed by this audit. Account deletion remains unavailable; do not represent it as implemented.
