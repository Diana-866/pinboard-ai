# AUD-080 — Payment webhook and CI readiness review

Date: 2026-11-07
Branch: `feat/persisted-boards-api`
Reviewed HEAD: `2cd1c98aae8a30f4d2d430442d6c0f75c92b9869`
Related: AUD-079, migrations 006/007/010/011, Prodamus webhook handlers.

## Scope

Reviewed:
- `backend/billing.js` subscription checkout and webhook fulfillment.
- `backend/creditsBilling.js` credit-pack checkout and webhook fulfillment.
- `backend/prodamus.js` signature verification, status normalization, currency/amount parsing, checkout URL validation.
- `backend/creditPacks.js` server-owned pack catalog.
- `db/migrations/006_subscriptions.sql`, `007_credit_purchases.sql`,
  `010_atomic_credit_ledger.sql`, `011_atomic_subscription_activation.sql`.
- `backend/test/prodamus-webhook.test.js`,
  `backend/test/subscription-concurrency.sh`,
  `backend/test/credit-concurrency.sh`,
  `.github/workflows/atomic-payment-integration.yml`.

## Findings

### P1 — No confirmed duplicate-credit or duplicate-subscription activation path in reviewed implementation

- Prodamus webhook signature is checked before payment lookup or fulfillment.
- The webhook order ID is resolved against a server-created subscription or credit-purchase row.
- Successful callbacks validate the signed amount and currency against the stored order.
- Credit fulfillment locks the purchase row with `FOR UPDATE`; balance increment, ledger insert, and `balance_credited_at` marker are committed in one PostgreSQL function transaction.
- The unique `credit_transactions.purchase_id` index adds a second database-level duplicate guard.
- Subscription activation locks the subscription and user rows; entitlement update and paid period are committed in one function transaction.
- Both payment concurrency scripts exist and are invoked by the atomic-payment workflow.

No duplicate-credit exploit was established by source review. This is not equivalent to a successful production or CI test run.

### P2 — Late success after a cancellation/denial is deliberately accepted

Both atomic fulfillment functions allow a signed successful payment to complete an order previously marked `canceled` or `denied`. This supports delayed/out-of-order Prodamus callbacks and avoids losing a genuinely paid order. It is safe only because the backend validates the signature, order identity, amount, and currency before calling the RPC.

Operational policy remains: when a late success arrives, fulfill the order; do not infer a refund from an earlier cancellation callback. Refunds and chargebacks need a separate reconciliation policy.

### P2 — CI is currently not providing usable evidence

For HEAD `2cd1c98aae8a30f4d2d430442d6c0f75c92b9869`, the three PR workflows completed with `failure`:
- Persisted boards integration checks — run `42388917515`.
- Atomic payment fulfillment integration — run `42388917565`.
- Prodamus webhook tests — run `42388917492`.

GitHub returned no steps for the failed jobs. Attempts to retrieve job logs returned `BlobNotFound`. Therefore the failure point is unknown: these results do not establish that test commands actually started or failed.

Vercel status is `failure`; its target URL reports `build-rate-limit`. This is a build quota/rate-limit blocker, not evidence of an application test failure.

## Remaining verification

1. Restore a usable CI run/log path and obtain at least one complete run of all three PR workflows.
2. Confirm the latest SQL migrations 067–069 apply cleanly in disposable PostgreSQL; the payment review itself does not validate those newer generation migrations.
3. Run the existing subscription and credit concurrency scripts in CI and retain their logs.
4. Define an explicit refund/chargeback workflow, including the case where purchased credits have already been spent. Do not automatically reverse balances until that policy is designed.

## Safety / production status

- No production database was accessed or modified.
- No migration was applied to Supabase production.
- No live Prodamus payment or webhook was triggered.
- No deployment or PR merge was performed.
- PR #4 remains Draft and open.

## Conclusion

The payment implementation has sound core controls in the reviewed source: signed callbacks, server-owned pricing, amount/currency checks, row locking, transactional balance/ledger updates, and idempotent markers. The immediate release blocker is lack of trustworthy automated verification (GitHub job details/logs unavailable and Vercel build-rate-limit), not a confirmed double-credit defect.
