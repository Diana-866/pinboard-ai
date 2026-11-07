# AUD-096 — Delayed payment webhooks and customer status refresh

Date: 2026-11-07

## Scope

Review Prodamus success/cancel callbacks, database fulfillment idempotency, and the pricing page's ability to reflect a callback that arrives after the customer returns from checkout.

## Findings

### 1. Subscription fulfillment is transactionally idempotent

The webhook validates the signature, looks up the local order by `provider_payment_id`, validates currency and amount, then calls `activate_paid_subscription`. Migration 011 locks the subscription and user rows and atomically updates the subscription period and user entitlement. Migration 019 additionally prevents a late older paid order from overwriting the current plan selected by a newer-created paid order.

The activation RPC explicitly permits a previously `pending`, `denied`, or `canceled` order to become paid when a valid signed success callback arrives. This matters when a non-success callback or an earlier reconciliation step preceded a delayed success.

### 2. Credit fulfillment is transactionally idempotent

The credit webhook validates signature, order ID, currency and amount, then calls `credit_paid_purchase`. Migration 010 locks the purchase row, returns without crediting again when `balance_credited_at` is already set, and atomically inserts the purchase-linked ledger row, updates the balance and marks the purchase successful. The RPC allows a valid late success for pending/denied/canceled/success records, while its paid marker prevents duplicate crediting.

### 3. Late non-success callbacks do not downgrade paid orders

- Subscription status updates exclude rows already in `success`.
- Credit status updates exclude rows already in `success` and rows with `balance_credited_at` set.
- Duplicate success callbacks pass through the atomic RPCs, which return the already-fulfilled result rather than extending/crediting again.

The existing webhook test file includes regression coverage for duplicate callbacks, commit-then-connection-error retries, cancel-after-success, and late subscription success after a denied status. Migration 089 also contains SQL coverage for late valid success on a canceled credit purchase.

### 4. Customer UI did not refresh a pending order after returning from checkout

Before this change, pricing history loaded on initial mount and when the user's plan/credit balance changed. A webhook could successfully fulfill the order after the initial fetch, while the pricing page continued to display its stale `pending` state until a manual reload or another user-state change.

## Change made

In `frontend/src/components/pricing/PricingView.tsx`:
- While at least one subscription or credit purchase is pending, refresh both authenticated billing-history endpoints every 20 seconds.
- Refresh immediately when the tab regains focus or becomes visible.
- Pause periodic requests while the document is hidden.
- Stop polling when there are no pending orders or the component unmounts/user changes.
- When a previously pending order becomes successful, call `refreshUser()` so plan/credit balance state is refreshed too.
- The refresh is read-only; it does not create/retry a payment, mutate payment state, or grant credits.

Polling lifecycle detail: the effect is keyed by the actual sorted set of pending subscription/purchase IDs, not only a boolean. If one of several pending orders resolves or a new pending order appears, the polling effect is recreated with the correct order snapshot. Follow-up correction commit: `29b272cf10185ead1de297a650f50315443ac79f`.

## Verification and limitations

- Read back webhook handlers, migrations 010/011/019, and existing Prodamus webhook tests from `feat/persisted-boards-api`.
- Read back the pricing UI change from the branch after commit.
- Existing tests were inspected but not executed in this environment.
- Frontend build/typecheck was not run.
- No live Prodamus requests, Supabase queries/writes, production deploys or PR merges were performed.
