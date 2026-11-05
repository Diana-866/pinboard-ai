# Account deletion: implementation design and safety constraints

Status: design only. No endpoint or schema change is implemented by this document.

## Why hard deletion is unsafe

Migration `009_hardening.sql` adds `ON DELETE CASCADE` foreign keys from `users` to:
- `auth_tokens`
- `credit_transactions`
- `subscriptions`
- `credit_purchases`
- `pinterest_accounts`
- `pinterest_publications`

It also makes `projects.user_id` cascade from users. Projects own boards and pins; scheduled rows reference pins with `ON DELETE CASCADE`. Therefore deleting a user row would remove payment and credit ledger records as well as product data.

Do not implement account deletion as `DELETE FROM users` until the financial retention and referential-integrity design has been explicitly resolved.

## Late Prodamus webhook hazard

The current signed webhook handlers look up a payment and call:
- `activate_paid_subscription(subscription_id, paid_at)`
- `credit_paid_purchase(purchase_id, paid_at, description)`

The current RPC implementations lock the payment row and then the user row. They update the user's tariff or credit balance even when the account is no longer intended to be usable. There is currently no account-deletion marker checked by either RPC.

A deletion workflow must therefore coordinate with these functions. Simply anonymizing the user's email/password is insufficient: a delayed successful webhook could still grant a subscription or credits to the retained user row.

## Recommended account lifecycle

Use an explicit lifecycle marker on the user row (for example, `deletion_requested_at`, `deleted_at`, and a state), rather than deleting the row immediately.

Suggested states:
1. `active`: normal access.
2. `deletion_pending`: block new authenticated activity and new payment creation; revoke all sessions; disconnect external integrations and cancel future schedules.
3. `anonymized`: remove or irreversibly pseudonymize personal data and product content after cleanup succeeds, while retaining the minimum financial records required by applicable law and payment-provider reconciliation.

The exact retention period, fields retained, and whether a refund or cancellation is required for pending payments must be confirmed against the operator's legal/accounting obligations and Prodamus terms. Do not invent a universal retention period.

## Payment handling decision required before implementation

For a successful payment webhook received after deletion was requested:
- Always validate signature, order ID, and amount as today.
- Preserve the provider transaction and the fact that money was received.
- Do not silently discard the event or return success without durable reconciliation.
- Do not automatically credit an inaccessible/deleted account or activate its entitlement.
- Record a distinct reconciliation outcome (for example, paid-after-deletion / refund-review) and surface it to an administrator for refund or other legally appropriate handling.

This likely requires separate payment settlement state and entitlement state. Reusing `status='success'` for both “money received” and “service entitlement granted” is ambiguous. Design a backward-compatible schema before changing existing status semantics.

## Concurrency and lock ordering

Current payment RPCs lock payment rows before user rows. A deletion transaction that locks the user row first and then payment rows can deadlock with a concurrent webhook. Before implementing, standardize a lock order across deletion, subscription activation, and credit fulfillment, then test concurrent deletion/webhook races in PostgreSQL.

A robust workflow should be idempotent and resumable: a retry must not double-refund, double-credit, or leave an account half-deleted without a visible state.

## Pinterest and generated media

- Delete/revoke stored Pinterest OAuth credentials and stop future schedule processing.
- Cancel queued schedules and prevent the scheduler from claiming rows belonging to a deletion-pending account.
- Preserve publication-attempt evidence long enough to reconcile ambiguous remote Pinterest outcomes; do not automatically republish.
- Remove owned projects, boards, pins, and generated image objects only after ownership of each Storage object is proven.
- Current `pins.image_url` stores URLs; no user-scoped Storage object path convention has been verified. Do not delete objects by guessing URL-to-key mappings.
- `pinterest_publish_attempts` has no user FK and must be explicitly cleaned or retained according to a documented retention policy.

## Implementation sequence

1. Add lifecycle columns and a server-side deletion-request endpoint; require recent authentication or a separate confirmation step.
2. Make authentication reject non-active accounts, and revoke all existing JWTs atomically.
3. Block new payment creation, AI generation, and scheduler work once deletion is pending.
4. Introduce explicit payment-settlement/reconciliation fields and update both webhook RPCs with concurrency-safe semantics.
5. Build an idempotent cleanup job for Pinterest credentials, schedules, attempts, publications, projects, pins, and Storage objects.
6. Preserve the minimum required financial evidence without retaining unnecessary contact/profile data.
7. Add PostgreSQL integration tests for: duplicate deletion request, webhook racing deletion, webhook arriving after deletion, repeated webhook, partial cleanup retry, and no cross-user Storage deletion.
8. Only then expose the user-facing deletion confirmation and publish the applicable privacy-policy wording.

## Current status

- No account-deletion route exists in the inspected `backend/index.js`.
- No deletion marker exists in the inspected user schema.
- The payment RPCs do not currently check an account lifecycle state.
- No deletion migration has been applied to Supabase.
- This document is a design record, not a claim that deletion functionality is available.


## Additional payment-webhook findings (verified against current code)

### Existing entitlement/payment coupling
- Credit purchases already have `balance_credited_at`, which distinguishes successful order status from actual credit fulfillment. This is a useful partial precedent, but there is no separate settlement/reconciliation state for payments received after deletion.
- Subscription rows use `status='success'` together with `period_start/period_end`; the current activation RPC updates the payment status and user entitlement in the same transaction. A later lifecycle design should preserve the existing public status contract while adding explicit settlement and entitlement/reconciliation fields.
- Both `credit_paid_purchase()` and `activate_paid_subscription()` currently lock the payment row first and the user row second. A deletion flow that locks the user first and then payment rows would introduce a lock-order inversion and possible deadlocks. Standardize lock order before adding the deletion transaction; test with concurrent PostgreSQL sessions.
- The webhook handlers write non-success statuses directly through Supabase table updates, outside the atomic RPC. Any future deletion/settlement state machine must account for these writes or move all state transitions behind transactional database functions.

### Amount-mismatch path
- Both payment handlers compare the signed webhook `sum` against the stored expected amount.
- On mismatch, each currently marks the order `denied` (unless it is already successful) and returns HTTP 200 with `ignored: amount mismatch`.
- A signed webhook with an amount mismatch can still represent money received. The current `denied` label is therefore not a sufficient reconciliation record and should not be interpreted as proof that no money moved.
- Future design: persist the provider-reported amount and a distinct reconciliation state (for example, `amount_mismatch_review`); do not grant entitlement; surface the event to an administrator; acknowledge the webhook only after durable recording. Do not automatically refund or silently discard it.

### Password-reset cooldown overload fix (separate security correction)
- Migration 024 introduced a four-argument cooldown-aware RPC, but PostgreSQL retained the three-argument overload from migration 020. Exact three-argument calls selected the old function and could bypass the cooldown.
- The branch now includes migration 025 to drop the obsolete overload, and the integration test explicitly calls the four-argument RPC and asserts that only the four-argument signature remains.
- This migration is part of the GitHub Actions atomic integration workflow. It has not been applied to the production Supabase database.


## Reconciliation detail: current credit and subscription models

Verified in migrations 010/011 and current webhook handlers:

- Credit purchases already have `balance_credited_at`. The credit fulfillment RPC locks the purchase row, checks this marker, and only credits once. Keep this idempotency marker; do not replace it with a generic payment status.
- Subscription activation currently uses `status='success'` plus a non-null `period_end` as its already-activated condition. This couples settlement and entitlement more tightly than the credit-purchase model.
- Both handlers validate the provider signature, order ID and expected amount. When the amount differs, the current handler writes `denied` (if not already fulfilled) and returns HTTP 200. This is not enough to represent a possibly received but mismatched payment.
- Non-success provider statuses are written directly by the HTTP handler through Supabase updates, while successful fulfillment is handled by SQL RPCs. Future reconciliation states must centralize transitions or use conditional updates/transactions so a late failure cannot overwrite a confirmed success.
- Credit purchase status updates already guard with `balance_credited_at IS NULL` and `status != 'success'`; subscription updates guard with `status != 'success'`. Preserve these protections and add explicit reconciliation fields rather than changing the meaning of `success` in place.

### Safe incremental migration proposal (not implemented)

1. Add nullable provider-reported amount/currency and a reconciliation outcome to payment rows, with values that distinguish matched, amount-mismatch-review, paid-after-deletion-review, and provider-declined. Exact enum/check constraints should follow an inventory of all existing statuses and provider payloads.
2. Keep the provider settlement outcome separate from entitlement fulfillment. For credits, `balance_credited_at` remains the entitlement marker. For subscriptions, introduce an explicit entitlement activation marker or event record before changing the RPC.
3. On amount mismatch, persist the signed provider event details needed for reconciliation and return HTTP 200 only after the durable write succeeds. If persistence fails, return a retryable non-2xx response.
4. Keep the order idempotent by provider order ID and event identity; duplicate mismatch webhooks must not create duplicate review cases.
5. Add tests for mismatch then success, success then mismatch, duplicate mismatch, late success after account deletion request, and a database write failure before acknowledgement.

No schema or webhook behavior was changed as part of this design note.


## Additional payment audit: schema constraints and orphan webhooks

A second pass over migrations 006, 007, 009 and both webhook handlers confirms:

- `subscriptions.status` is constrained to `pending | success | canceled | denied | expired`; `credit_purchases.status` is constrained to `pending | success | canceled | denied`. A new value such as `amount_mismatch_review` cannot safely be placed into either status column without changing the CHECK constraints and every consumer of those values. Prefer a separate reconciliation column/table.
- Migration 009 adds `ON DELETE CASCADE` from `users` to `subscriptions` and `credit_purchases` (as well as other user data). A physical user deletion therefore erases payment-order rows unless financial records are copied to a separately retained ledger first. This confirms that account deletion must not call a simple user-row DELETE.
- Both webhook handlers currently acknowledge an unknown signed `order_id` with HTTP 200 and `ignored: unknown order_id`. This prevents provider retries but leaves no durable local record of the event. It may be appropriate for unrelated/forged identifiers after signature validation, but a genuinely paid order whose local row is missing needs an orphan-payment review record before acknowledgement.
- The Prodamus webhook sample does not provide a reliable currency field. Subscription orders can be RUB or USD, while credit packs are RUB-only. Reconciliation must compare the signed amount against the currency already stored on the local order; it must not infer currency from the webhook or add a fabricated webhook currency requirement.
- The current mismatch branch stores neither the provider-reported amount nor the event payload, and uses the existing `denied` status. The exact amount and event evidence are therefore unavailable from the order row after handling.

### Revised safe implementation sequence (still design-only)

1. Introduce a separate append-only webhook inbox/reconciliation table keyed by a deterministic event fingerprint (or a stable provider event ID if Prodamus supplies one). Store order ID, normalized status, reported amount, received timestamp, and a carefully redacted/minimized signed payload. Do not store secrets or unnecessary customer data.
2. For known orders, link the inbox row to the local subscription/credit purchase. For unknown order IDs, retain a minimal orphan event and route it for manual review rather than silently discarding it.
3. Add explicit reconciliation state separately from the existing constrained order `status`. Keep the current status contract stable for existing UI, reports and RPCs.
4. Preserve the order's stored currency and catalog amount as authoritative. Since webhook currency is absent, record it as unavailable rather than guessing.
5. Acknowledge HTTP 200 only after the event/inbox and any state transition are durably committed. On database failure, return non-2xx so the provider can retry.
6. Before enabling this in production, inventory admin reporting, refund handling, deletion retention, RLS/service-role access, and retention periods for the new inbox.

No database schema, webhook handler, production setting, or live payment behavior was changed by this audit.
