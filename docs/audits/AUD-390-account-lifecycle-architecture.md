# AUD-390 — account lifecycle architecture and deletion data model

**Date:** 2026-11-11  
**Status:** design proposal only; not an executable migration.

## Goal and non-goals

Provide a durable, resumable, idempotent account-deletion workflow that revokes access immediately, prevents new billable work, safely reconciles external side effects, removes user-owned content and credentials, and retains only approved minimum financial evidence. This document does not authorize production deletion, define legal retention periods, or assume provider/backup capabilities.

## Current schema facts that shape the design

- `users` is the root of the application identity. `projects.user_id` references it; `boards` and `pins` cascade through projects/boards.
- `credit_transactions.user_id`, `auth_tokens.user_id`, `subscriptions.user_id`, `credit_purchases.user_id`, `pinterest_accounts.user_id`, `pinterest_publications.user_id`, and `pin_schedules.user_id` are text columns in the baseline, not declared FKs to `users`.
- `email_outbox.subscription_id` has `ON DELETE RESTRICT`; `provider_refund_operator_actions.operator_user_id` has `ON DELETE RESTRICT`.
- Generation and regeneration journals reference requests/boards/pins with cascades; payment creation requests and multiple operational journals are keyed by text `user_id` and do not have a root-user FK in the inspected migrations.
- `pin_image_object_lifecycle` tracks object paths and claims, not owner identity. The safe deletion path must derive ownership from trusted pin/project records and reuse the existing reference-aware claim protocol.
- Several legacy baseline FKs are not explicit about delete behavior; archived migration 009 must not be treated as deployed truth. The live catalog needs a read-only FK inventory before any migration.

## Proposed lifecycle model

Add `users.account_status` with a conservative default `active`, plus `deletion_requested_at`, `deletion_started_at`, `deletion_completed_at`, and a monotonically increasing `lifecycle_version`. Keep a separate append-only `account_lifecycle_events` table for request/confirmation/phase/exception receipts and `account_deletion_jobs` for resumable per-phase work with claim token, lease expiry, attempt count, next attempt, safe error code and unique `(user_id, phase)`.

Suggested states: `active` → `deletion_pending` → `reconciling` → `cleanup_pending` → `anonymized` or restricted `retained_financial_only`. Transitions are performed only by narrowly scoped SECURITY DEFINER RPCs with fixed search_path and service_role execution. No generic status update endpoint.

Do not hard-delete the `users` row as the primary operation. Preserve a minimal pseudonymous tombstone until all references, provider outcomes, retention obligations and backup expiry are resolved. A later physical purge is a separate, approved operation.

## Immediate access and work fencing

- Login must reject non-active users before issuing a JWT. `requireAuth` must select/check `account_status` and `token_version` from the database on every authenticated request; JWT claims alone are insufficient.
- The request RPC atomically changes status to `deletion_pending`, increments `token_version`, clears/reset auth tokens, and writes the event/job receipt. Existing sessions are invalidated immediately.
- Every billable or externally visible entry point must enforce `account_status='active'`: payment checkout creation, subscription/credit fulfillment, generation and regeneration reservations, OAuth start/callback/refresh, Pinterest manual publish, scheduler claim/start/retry, and user-initiated uploads.
- Every background worker/recovery RPC must recheck lifecycle state inside the same database transaction that claims or commits work. A check only in Express middleware is insufficient.
- For work already sent to a provider, preserve `unknown` until provider evidence is obtained; do not blindly replay or erase its journal.

## Payment and financial design

Provider payment settlement and user entitlement must become distinct facts. A signed late Prodamus payment received after `deletion_pending` must be stored as settled provider money, but must not credit a deleted account or reactivate a subscription. Route it to a restricted refund/reconciliation queue.

Existing payment RPCs lock payment rows and then the user row. A lifecycle transaction naturally starts with the user row. This creates a potential deadlock if implemented without a common lock order. Before rollout, change all payment checkout/fulfillment/refund RPCs to acquire locks in the same documented order (user → payment/purchase/subscription → ledger/reservation), with deterministic ordering for multiple rows. Add concurrent delete-vs-webhook tests proving exactly one terminal outcome and no lost settlement evidence.

Keep immutable provider order/payment/refund references, financial amounts, currency, timestamps, ledger movements and reconciliation evidence under an approved retention class. Remove or pseudonymize direct identifiers only after accounting/legal approval. Never cascade-delete credit transactions or provider settlement evidence merely to remove an account.

## Cleanup phases

1. `revoke_access`: mark deletion pending, bump token version, disable login, invalidate auth tokens and block new work.
2. `reconcile_external`: classify all payments/refunds/chargebacks, generation provider tasks, Pinterest attempts, OAuth refreshes and uploads; unknowns remain blocked and visible to authorized operators.
3. `stop_queues`: cancel future Pinterest schedules, stop unclaimed generation work, prevent new scheduler claims and clear email outbox pending jobs according to notification policy. Preserve sent/unknown receipts.
4. `disconnect_integrations`: use the existing account-scoped Pinterest disconnect fencing; clear OAuth credentials, refresh leases and OAuth attempt state. Keep minimal integration audit needed for unresolved publications.
5. `delete_content`: remove boards/projects/pins/review items and only verified account-owned Storage objects. Use the existing image lifecycle claim/reference checks. Never delete a shared/referenced object.
6. `scrub_personal_data`: remove or pseudonymize name, email and other direct identifiers in records that must remain; invalidate sessions and remove one-time auth tokens. Ensure email outbox recipient/payload is cleared for unsent/dead records once safe.
7. `verify`: prove zero active credentials, zero new work, no unowned object deletion, no pending cleanup task except explicitly retained exceptions, and approved financial-only retained records.
8. `finalize`: record completion timestamp and outcome. Retain tombstone and event receipts until the separate retention/purge policy permits final purge.

Each phase must be idempotent, bounded, claim-fenced and restartable. A partial failure records a safe error code and retries only the phase, never restarts a completed external side effect.

## Data classification matrix

| Data family | Deletion treatment |
|---|---|
| Password hash, JWT/session version, auth tokens | Revoke immediately; delete auth token rows and clear password hash at approved terminal phase |
| Name, email, profile, projects, boards, pins, prompts | Delete or irreversibly anonymize after export/retention checks |
| Pinterest access/refresh tokens and OAuth attempts | Clear/revoke promptly; retain only non-secret minimal reconciliation metadata |
| Schedules and queued generation | Cancel unstarted work; preserve unknown/in-flight provider journals until reconciled |
| Credit balance and ledger | Disable spend immediately; preserve financial movement evidence; do not cascade-delete |
| Purchases, subscriptions, Prodamus order references, refunds | Retain restricted/pseudonymized evidence under approved policy; no post-deletion entitlement |
| Email outbox | Stop dispatch; clear unsent recipient/payload; preserve minimal event/attempt receipt only if needed |
| Storage objects | Delete only after ownership/reference proof and successful fenced claim; retain tombstones to prevent path reuse |
| Logs, support records, backups | Apply separately approved minimization/retention/expiry rules; application DB deletion does not erase copies |

## Migration sequence (future work, not executed)

- **M1 — additive schema:** account status/version/timestamps, event journal, deletion job queue, indexes, constraints, RLS and service_role-only RPC grants. No destructive FK changes.
- **M2 — universal gates:** login, `requireAuth`, billing, generation, OAuth, publishing, uploads and worker claims; feature tests for active vs pending.
- **M3 — payment lock-order refactor:** user-first locking across all fulfillment/settlement RPCs, with concurrency integration tests and replay tests.
- **M4 — resumable cleanup worker:** one phase per job, lease fencing, safe retries, provider exception queue, image ownership inventory and operator visibility.
- **M5 — anonymization and retention:** legal/accounting-approved data map, outbox scrubbing, restricted financial retention, backup expiry verification and policy update.
- **M6 — controlled release:** staging restore/deletion drills, synthetic user end-to-end, race tests, observability, rollback/stop conditions, then limited rollout.

## Mandatory test matrix

- Request replay and simultaneous duplicate confirmation; only one lifecycle transition.
- Old JWT and password reset token rejected immediately after request.
- Checkout creation racing with deletion; no new invoice after deletion commit.
- Signed success webhook racing with deletion; provider settlement retained exactly once and no post-deletion entitlement.
- Refund/chargeback racing with deletion; immutable evidence retained and no credit resurrection.
- Generation reservation, provider callback and worker claim racing with deletion; no new billable task after gate; ambiguous provider task remains fenced.
- Pinterest OAuth callback/refresh/manual publish/scheduler claim racing with disconnect/deletion; no credential resurrection or duplicate remote pin.
- Upload/finalize/image deletion racing with cleanup; no shared object deletion and no lost lifecycle tombstone.
- Worker crash between every phase; lease expiry and retry do not duplicate external actions.
- Foreign-key catalog test against a production-like restored schema; retained financial records survive content cleanup.
- Export/retention/privacy notice checks; backup expiry is independently demonstrated.

## Release gates

Do not enable account deletion until actual production FKs are inventoried, payment lock order is unified, every external-work path has a lifecycle gate, storage ownership is proven, financial retention is approved, backups have a documented expiry, and the complete test matrix passes in disposable PostgreSQL and staging.

## Safety

This proposal changes no code or data. It does not assert a legal retention period or guarantee provider backup erasure. Any retention duration must be approved by qualified counsel/accounting and verified against live vendor settings.