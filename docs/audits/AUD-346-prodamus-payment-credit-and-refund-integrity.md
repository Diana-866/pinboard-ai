# AUD-346 — Prodamus payment, webhook, credit and refund integrity

**Date:** 2026-11-11  
**Status:** SOURCE REVIEW COMPLETE  
**Runtime validation:** not executed

## Confirmed protections

### Checkout creation
- Checkout requests require a client idempotency key and bind it to a server-computed fingerprint (kind, product, currency).
- Provider order IDs contain a CSPRNG-generated 96-bit random component.
- The local payment row and provider order reference are persisted before the outbound Prodamus request.
- Ambiguous provider link creation is marked unknown and blocks automatic invoice recreation.
- A settled checkout request cannot replay a reusable payment URL.
- Both `subscriptions.provider_payment_id` and `credit_purchases.provider_payment_id` have unique partial indexes.

### Signed webhook handling
- Webhook signature is checked before payment processing; a dedicated webhook secret is preferred, with the shop secret as fallback.
- Only documented final statuses are normalized. Unknown/in-progress statuses are audited and ignored.
- Success callbacks must match the expected currency and amount (within 0.01); USD uses `currency_sum` and requires explicit currency.
- Unknown order IDs and amount/currency mismatches are written to a minimal append-only audit table. Raw customer PII is not persisted.
- Duplicate audit events are fingerprinted; Prodamus transport retry counter `attempt` is excluded.

### Credit fulfillment and subscription activation
- `credit_paid_purchase` locks the purchase row, then atomically updates user balance, inserts one purchase-linked ledger row, and marks the purchase credited.
- A unique partial index on `credit_transactions.purchase_id` reinforces one ledger entry per purchase.
- Repeated success callbacks after an ambiguous commit are safe: the RPC returns the current balance when `balance_credited_at` is already set.
- `activate_paid_subscription` locks subscription and user rows and commits the paid period + entitlement together. A repeated callback does not extend the same order twice.
- Late valid success after a locally denied/canceled state is intentionally accepted, because provider success is authoritative after signature/amount validation.
- Checkout idempotency state is settled only after the local subscription or credit purchase is fully fulfilled. If settlement fails after fulfillment, webhook returns 500 so provider retry can complete reconciliation.

## Important gaps / operational limitations

### Prodamus refunds are manual-only
The runbook explicitly confirms PinPosy does not consume a Prodamus refund webhook and has no `refunded` status or refund ledger for subscriptions or credit purchases. Partial refund totals are not represented. Consequently:
- A completed provider refund does not automatically revoke or adjust PinPosy entitlements/credits.
- Support must reconcile the original order, amount, currency, refund amount, receipt, credits already spent, and later subscriptions manually.
- Do not directly reduce a balance or change tariff dates without a dedicated audited workflow.
This is a real financial operations gap, not a webhook double-credit bug. Automating it safely requires product/accounting policy decisions for partial refunds, already-spent credits, and overlapping subscription periods.

### No independent live reconciliation evidence
Source code and integration tests establish intended behavior, but cannot prove production database migrations are all applied, Prodamus webhook delivery is configured, or the live secret pair is correct. Those require non-destructive dashboard/log checks and a controlled demo payment.

### Legacy balance adjustment surface
Migration 010's generic balance adjustment RPC is service-role-only, but it is broader than purchase fulfillment. Its authorization and active-reservation guards were hardened in later migrations (including 074); production must have the full ordered migration chain applied. This audit did not query live grants or schema state.

## Regression coverage found
Existing tests cover:
- concurrent duplicate subscription callbacks;
- subscription activation commit followed by transport error and webhook retry;
- checkout settlement retry after activation;
- subscription amount mismatch;
- concurrent duplicate credit callbacks and commit-then-error recovery;
- credit settlement retry without a second credit;
- cancellation racing with a completed credit;
- auditing a later mismatched success callback after a credit has already been applied;
- SQL verification of one ledger row and atomic purchase marker;
- service-role-only RPC privileges and exact checkout settlement identity.

## Decision boundary
No refund automation or new refund statuses were introduced. Do not infer that a provider refund means all purchased credits should be clawed back: some may already have been spent. Do not revoke a subscription without preserving later paid periods. These require an explicit policy and a dedicated auditable workflow.

## Validation and scope
- Source, migration, runbook and test files reviewed.
- Tests, SQL integration, lint, build, CI and live Prodamus/Supabase checks were not run.
- No live payment, refund, balance mutation, migration, merge or deployment was performed.
