# AUD-079 — Prodamus payment and credit-pack fulfillment audit

**Date:** 2026-11-07  
**Scope:** Prodamus webhook verification, subscription activation, one-time credit-pack fulfillment, database idempotency, and payment recovery.  
**Branch:** `feat/persisted-boards-api`

## Executive summary

The inspected payment paths have the essential protections against forged callbacks and duplicate fulfillment:

- The webhook signature is verified before an order lookup or state change.
- The order is resolved by the server-created `provider_payment_id`; the client does not supply the credited amount or pack size.
- A successful callback must contain a valid amount in the expected currency and match the stored order amount within 0.01.
- Credit packs are fulfilled through the database RPC `credit_paid_purchase`, which locks the purchase row, checks the credited marker, updates the user balance, inserts the uniquely linked ledger row, and marks the purchase credited in one PostgreSQL transaction.
- Subscription activation is similarly performed by `activate_paid_subscription` under row locks.
- The inspected code does not reveal a confirmed double-credit or double-activation path.

This is a source review, not proof from an executed PostgreSQL run or a real Prodamus transaction.

## Verified controls

### Webhook authenticity and parsing

- `POST /billing/webhook` is parsed before the general JSON middleware and accepts only multipart, URL-encoded, or JSON payloads with a 32 KB limit.
- Multipart parsing rejects malformed/conflicting fields and prototype-pollution keys.
- `prodamus.verifyWebhook` checks the HMAC-SHA256 signature using `PRODAMUS_SECRET_WEBHOOK` (falling back to `PRODAMUS_SECRET`) and compares signatures using a timing-safe comparison.
- Signature fields are excluded from the canonical payload.
- The route dispatches `ppc-…` order IDs to the credit-pack handler; other order IDs go to the subscription handler.

### Credit-pack fulfillment

- The only accepted package IDs are `pack_100`, `pack_500`, and `pack_1000`; the server catalog currently contains 100/500/1000 credits for 190/790/1290 RUB.
- `createCreditsPayment` derives amount and credits from `backend/creditPacks.js`; it ignores any client-supplied amount.
- A unique partial index protects non-null `credit_purchases.provider_payment_id`.
- The webhook validates signature, order ID, final payment status, amount, and currency before invoking the fulfillment RPC.
- `credit_paid_purchase(uuid,timestamptz,text)` in migration 010 uses `SELECT … FOR UPDATE` on the purchase row. It returns without crediting if `balance_credited_at` is already set.
- For the first fulfillment, the function updates the user balance, inserts a `credit_transactions` row linked to the purchase, and marks `status='success'` and `balance_credited_at` in the same transaction.
- A unique partial index on `credit_transactions.purchase_id` provides a second database-level duplicate-ledger barrier.
- The RPC is revoked from public/anon/authenticated and granted to `service_role` only.
- If the RPC commits but the HTTP connection fails, a retried callback reaches the credited marker and does not apply credits again.

### Subscription fulfillment

- The webhook validates the signed amount/currency against the stored subscription before activation.
- `activate_paid_subscription` locks both subscription and user rows and performs activation in one transaction.
- The migration includes protection against a delayed older payment downgrading a newer entitlement.
- Duplicate callbacks return the already-activated subscription state rather than adding another paid period.
- Pending activation email delivery is handled through the transactional outbox after activation; an email failure does not roll back the payment entitlement.

### Statuses, refunds, and reconciliation

- Only documented final statuses are normalized; unknown/in-progress statuses are logged for review rather than treated as success.
- Unknown order IDs, missing order IDs, unsupported statuses, and amount/currency mismatches are written to `billing_webhook_exceptions` without storing raw customer payloads.
- A late signed success callback can fulfill an order previously marked denied/canceled. This is deliberate in the current implementation and protects against callback reordering; it should be reconciled against the provider's final order state if the provider supports a separate status lookup.
- No automatic credit reversal or subscription downgrade is implemented for refunds/chargebacks. That is safer than guessing whether already-spent credits should be clawed back, but it leaves a manual reconciliation/business-policy requirement.

## Findings and follow-up

1. **No confirmed duplicate-fulfillment vulnerability found in source.** Both credit packs and subscriptions use transactional database RPCs with row locks and idempotent state markers.
2. **Refund/chargeback policy is not automated.** There is no inspected refund/chargeback event path that reverses credit-pack balances. Before launch, define whether to allow a negative balance, freeze the account, or handle spent credits as a receivable; do not implement automatic clawback without this policy.
3. **Late success after canceled/denied status is accepted.** This handles out-of-order callbacks, but the provider's canonical payment status should be reconciled for canceled orders if Prodamus exposes a reliable order-status API.
4. **Legacy helper signature is text-based.** Migration 010 defines `adjust_credits_balance_and_log(p_user_id text, ...)`; `backend/credits.js` passes `String(userId)`. This matches the inspected function. The older `adjust_credits_balance(p_user_id text, p_amount integer)` helper is not the function called by this module.
5. **Database/CI proof remains blocked.** The current HEAD's three GitHub Actions PR workflows completed with `failure`, but GitHub returned no job steps or log URLs. Their root causes cannot be established; no payment-specific test is therefore claimed as passed from those runs. The Vercel status for this HEAD is now `success`.

## Verification boundary

- Reviewed `backend/creditsBilling.js`, `backend/billing.js`, `backend/prodamus.js`, `backend/creditPacks.js`, `backend/credits.js`, migrations 007, 010, 011, 029, and 037, the Prodamus webhook test file, and the atomic-payment workflow.
- Confirmed the workflow provisions disposable PostgreSQL and applies the atomic credit ledger/subscription migrations, but the observed workflow run failed before usable job-step evidence was returned.
- No local Node test suite or PostgreSQL integration suite was executed in this session.
- No live payment, refund, provider API call, production database migration, deployment, or merge was performed.
- PR #4 remains Draft and unmerged.
