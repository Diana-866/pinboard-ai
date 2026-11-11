# AUD-388 — financial ledger integrity and post-restore reconciliation

**Date:** 2026-11-11  
**Status:** source audit completed; no financial records or provider accounts accessed.

## Scope

Reviewed credit balance RPCs, purchase fulfillment, subscription activation, Prodamus webhook validation, checkout idempotency, payment settlement, refund reconciliation, and PostgreSQL integration tests.

## Confirmed safeguards

1. **Credit top-up atomicity:** `credit_paid_purchase` locks the exact purchase row, credits the matching user, inserts one `credit_transactions` row with unique `purchase_id`, and marks `balance_credited_at`/success in one transaction. Repeated webhook returns current balance without a second top-up.
2. **Webhook validation:** both payment handlers authenticate the Prodamus HMAC before looking up orders, validate normalized success status and amount/currency, and persist unsupported/mismatched callbacks for review.
3. **Subscription activation:** `activate_paid_subscription` locks subscription and user, writes success period and current entitlement atomically, and protects newer plan labels from late older callbacks.
4. **Checkout idempotency:** unique `(user_id,idempotency_key)` and unique provider order reference fence duplicate invoice creation. Ambiguous provider outcomes remain unknown; exact webhook fulfillment settles the request and clears reusable checkout URL result.
5. **Refund/generation settlement:** provider refund reconciliation is journaled and idempotent; active generation credit reservations are protected from generic debits.
6. **Privileges:** payment/credit SECURITY DEFINER RPCs are revoked from public/anon/authenticated and granted to service_role in the reviewed migrations.

## Material recovery gaps

1. **No verified opening ledger baseline.** Current user balance is a mutable snapshot. `credit_transactions` records movements, but the repository does not establish a verified opening balance per account/time for a complete historical replay. Summing transactions alone cannot prove current balance, especially for legacy/direct adjustments.
2. **Legacy balance-only RPC remains.** `adjust_credits_balance(text, integer)` is still executable by service_role and intentionally changes `users.credits_balance` without a `credit_transactions` row. Migration 074 preserves reservation safety, not ledger completeness. This is an internal privileged escape hatch; no public endpoint was found calling it in the reviewed paths, but it weakens ledger-as-single-source-of-truth assumptions.
3. **No automated reconciliation/export evidence.** No read-only report or scheduled alert was found that compares current balances with a verified opening snapshot plus ledger, matches credit purchases to top-up ledger rows, or reconciles subscriptions and checkout requests against provider settlements.
4. **External provider evidence is required.** PostgreSQL alone cannot prove whether Prodamus accepted/settled an invoice if webhook delivery was missed. Restore validation needs provider-side order/payment/refund exports and an explicit mapping by `provider_payment_id`.
5. **Unknown records must remain unknown.** Do not convert `payment_creation_requests.status='unknown'` to failed or retry it solely because a restored DB lacks a checkout result. Reconcile against Prodamus before any manual state change.

## Restore reconciliation minimum

- Compare `users.credits_balance` to a signed-off opening balance snapshot plus ledger movements after that snapshot; do not infer opening balance from current transaction history.
- Check every successful `credit_purchases` row has `balance_credited_at`, exactly one matching `credit_transactions.purchase_id`, same user and amount; investigate ledger rows with missing/mismatched purchase and purchases without matching ledger.
- Compare pending/unknown/success purchases and subscriptions with Prodamus order exports, including amount, currency, order ID, paid/refunded status and provider timestamps.
- For subscriptions, compare each successful period and current `users.tariff_plan`/`tariff_period_end` against ordered subscription rows; do not simply select the latest period by end date.
- Check payment creation request status/order identity against its exact local subscription or credit purchase. Settled requests must not retain reusable payment URL results.
- Preserve refund audit, billing webhook exceptions, payment creation requests, credit transactions, subscriptions, credit purchases and users as one relational restore set.

## Disposition

No code change made. A new reconciliation migration or automatic repair would be unsafe without a signed-off opening balance and provider evidence. Existing SQL integration tests cover atomic top-up, replay idempotency, checkout settlement and refund reconciliation; they were inspected but not executed.

## Safety / validation limits

No Supabase data, Prodamus dashboard/export, live account balance, payment, refund, webhook or secret was accessed. No SQL was run, no migration applied, and no balance/payment/subscription changed. Node tests, PostgreSQL integration, CI and staging were not run.
