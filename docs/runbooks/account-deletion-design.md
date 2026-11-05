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
