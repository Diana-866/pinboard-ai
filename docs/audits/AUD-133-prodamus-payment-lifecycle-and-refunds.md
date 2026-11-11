# AUD-133 — Prodamus payment lifecycle and credit fulfillment audit

**Scope:** source-level review of Prodamus checkout creation, signed payment callbacks, credit purchase fulfillment, subscription activation, and refund handling.

**Reviewed on:** 2026-11-08  
**Branch reviewed:** `feat/persisted-boards-api`  
**Files reviewed:**
- `backend/prodamus.js`
- `backend/creditsBilling.js`
- `backend/billing.js`
- `backend/index.js` (webhook parser and dispatcher)
- `db/migrations/006_subscriptions.sql`
- `db/migrations/007_credit_purchases.sql`
- `db/migrations/010_atomic_credit_ledger.sql`
- `backend/test/prodamus-ambiguous-checkout.test.js`
- `backend/test/credit-concurrency.sh`

This is a source review. No live Prodamus request, payment, refund, webhook, Supabase query, PostgreSQL test, or Node test was executed.

## Positive controls confirmed

1. **Purchase intent is persisted before requesting a checkout URL.** Both subscription and credit flows create a local `pending` row with a server-generated `order_id` before calling Prodamus. If the network outcome is ambiguous, the row remains pending; the code does not falsely mark it as failed. A later callback can still be matched to the order.
2. **Order identifiers are unique in the database.** Migrations 006 and 007 create partial unique indexes on `provider_payment_id`, preventing two local purchases from sharing one non-null provider order ID.
3. **Checkout values are server-owned.** Credit pack ID is normalized against the server catalog; amount and credits are loaded from that catalog rather than trusted from the browser. Subscription plan and amount are likewise selected server-side.
4. **Callback signature is verified before order lookup or state changes.** `verifyWebhook` checks the Prodamus `Sign` header against HMAC-SHA256 using the configured webhook secret (falling back to the general secret). Comparison uses `crypto.timingSafeEqual` on fixed-length hashes. It accepts base64 and hex encodings and has a compatibility fallback for flattened nested values.
5. **Order, amount, and currency are checked.** The handler matches the signed `order_id` to the local purchase, requires a recognized final status, validates currency and positive amount, and compares the amount against the stored server-side price with a 0.01 tolerance. Unknown orders, missing order IDs, unknown statuses, and mismatches are persisted through the webhook exception audit path for manual reconciliation.
6. **Credit fulfillment is transactionally idempotent.** `credit_paid_purchase` locks the purchase row `FOR UPDATE`, checks `balance_credited_at`, updates the user balance, inserts a ledger row with `purchase_id`, and marks the purchase credited in one PostgreSQL transaction. The unique index on `credit_transactions(purchase_id)` provides a second line of defence. The concurrency shell test is designed to prove that two simultaneous callbacks create one ledger row and credit once.
7. **Subscription activation is also delegated to a database RPC.** The webhook invokes `activate_paid_subscription`, keeping subscription activation, user tariff/period update, and idempotency within PostgreSQL. Email delivery is handled separately through the outbox.

## Findings and remaining risks

### AUD-133-01 — No refund/reversal lifecycle found (high priority before accepting real payments)

The reviewed code maps only `success`, `order_canceled`, and `order_denied` to internal states. No refund/reversal status or callback handler was found in the reviewed payment paths. The credit ledger has a positive top-up transaction, but the reviewed migrations/functions do not provide a corresponding idempotent refund debit, a refund record keyed by provider refund/transaction ID, or a policy for refunds after credits have already been spent.

Consequences:
- A successful payment can be credited, then refunded by an operator/provider without PinPosy automatically reversing or flagging the corresponding credits.
- Blindly subtracting the original pack amount is unsafe if the user has already spent some credits; the system needs an explicit negative-balance/collection policy or a manual review state.
- Refund events must be idempotent independently from payment-success events and must not erase the original payment ledger entry.

**Recommendation:** before real-money launch, define a refund workflow based on the actual Prodamus account/API contract. Persist each refund as a separate immutable financial event with a unique provider refund/transaction identifier; reconcile amount, currency, original order, and cumulative refunded amount; use a guarded atomic RPC to apply the policy exactly once. If credits are already spent, do not silently clamp the balance or silently skip the reversal—mark the account/purchase for an explicit debt or manual-resolution policy.

### AUD-133-02 — No callback event ID, timestamp, or replay window

The callback verifier validates the HMAC over the payload but does not check a signed event timestamp, provider event ID, or freshness window. The local purchase-level idempotency guard prevents a duplicate success callback from crediting the same purchase twice. This is useful, but it is not full event-level replay protection and will not be sufficient for future refund/partial-refund events, where several distinct legitimate events can exist for one order.

**Recommendation:** if Prodamus supplies a stable notification/transaction/refund identifier and timestamp in its documented callback contract, persist those values under unique constraints and reject/reconcile duplicate event IDs. Do not invent timestamp fields or reject old callbacks without confirming the provider contract; the provider documentation describes repeated URL notification delivery, so delayed legitimate retries must remain recoverable.

### AUD-133-03 — Credit fulfillment RPC accepts terminal non-success statuses

`credit_paid_purchase` currently allows rows whose status is `pending`, `denied`, `canceled`, or `success`, provided the purchase has not yet been credited. The handler calls this RPC only after a valid signed `success` callback with a matching amount/currency, so the status allow-list appears intentionally permissive to recover from late success callbacks after an earlier denial/cancellation or an ambiguous checkout outcome.

This is not, by itself, proof of an exploitable crediting bug. However, the RPC does not independently receive or verify the provider-confirmed status; any future internal caller with service-role access could credit a canceled/denied row. The function's contract is therefore wider than its webhook caller's validation.

**Recommendation:** narrow the RPC contract if possible (for example, pass an explicit verified-success assertion only if the trust boundary is clear, or require the row to be in a documented eligible state and use a separate audited recovery operation for exceptional late-success cases). Add regression tests for event ordering: canceled → success, denied → success, success → canceled, duplicate success, and two concurrent success callbacks. Preserve the legitimate late-success recovery case deliberately rather than simply forbidding it.

### AUD-133-04 — Checkout retries create new local orders

Every call to `createCreditsPayment` or `createPayment` generates a fresh random/time-based order ID and inserts a new pending row. There is no client idempotency key or reusable checkout-attempt key in the reviewed create-payment routes. A user retry after a lost HTTP response can therefore create another pending order and another payment link. This does not double-credit a single order, but it can leave multiple payable links for the same intended purchase and may lead to multiple legitimate charges.

**Recommendation:** add an authenticated checkout idempotency key scoped to user + product/plan + currency, with a persisted request fingerprint and a safe reuse/recovery policy. If the provider's link-creation endpoint supports an idempotent request key or lookup by order ID, use it; otherwise do not blindly repeat link creation after an ambiguous provider response. Provide a way to surface/reconcile stale pending orders.

### AUD-133-05 — Payment callbacks are retried by Prodamus; reconciliation must be durable

The official Prodamus help page documents repeated URL-notification attempts over a schedule extending to 24 hours. The local handlers return 500 when the database operation or webhook exception audit write fails, which is appropriate for retryable failures. However, no periodic reconciliation worker for stale pending Prodamus orders was found in the reviewed payment files. Ambiguous checkout rows can remain pending indefinitely if no callback arrives.

**Recommendation:** add a read-only operational report for old pending purchases/subscriptions and a documented manual reconciliation process against Prodamus payment reports. Any automated reconciliation must use an authoritative provider API/report and must not infer payment success from the browser redirect.

## Important implementation details

- Webhook endpoint: `POST /billing/webhook`; the request parser accepts multipart form, URL-encoded form, or JSON and caps the body.
- The route dispatches credit orders by the `ppc-` prefix; other orders are sent to the subscription handler.
- Credit purchase fulfillment uses `credit_paid_purchase`; the older generic `adjust_credits_balance_and_log` is not used in this success path.
- The purchase RPC locks the purchase before the user row. The reviewed generic balance adjustment locks the user row but does not then lock a purchase row, so no reverse lock edge was established in this narrow payment review.
- Unknown/unsupported/mismatched callbacks are saved via `persistWebhookException`; they are not treated as successful payments.
- Browser success redirect is not used as proof of payment; only the signed server callback triggers fulfillment.

## Provider documentation checked

- Prodamus documents repeated URL notification attempts and their retry intervals: https://help.prodamus.ru/payform/uvedomleniya/intervaly-uvedomlenii
- Prodamus describes its payment refund process and agent reports including refunded orders: https://help.prodamus.ru/payform/vozvraty-platezhei
- The exact refund callback payload/event semantics were not established from the sources reviewed. Confirm with Prodamus support/account documentation before implementing an automatic refund handler.

## Required regression/staging scenarios

1. Duplicate signed success callback sequentially and concurrently: one balance credit, one purchase ledger row.
2. Correct success callback after a prior signed canceled/denied callback: expected late-payment policy is explicit and tested.
3. Canceled/denied callback after a completed success: it must not downgrade a paid/credited purchase or active subscription.
4. Signed callback with wrong amount/currency, followed by a correct callback: no credit on mismatch; correct callback follows the documented recovery policy.
5. Unknown order ID and missing order ID: durable audit record; no fulfillment.
6. Replayed callback: same result, no duplicate credit.
7. Two different checkout attempts for the same user/product after a simulated lost response: verify UX and duplicate-charge prevention policy.
8. Provider-confirmed full refund after credits are unspent; full refund after partial spend; duplicate refund notification; two partial refunds whose cumulative amount reaches the original payment.
9. Prodamus callback arrives before checkout-link response is returned: payment still matches the pre-created local order and is fulfilled once.
10. Database outage while persisting webhook exception or crediting: endpoint returns retryable failure; subsequent callback safely completes.

## Verification status

- Source review completed for the listed files.
- No concrete duplicate-credit path was established in the reviewed success callback flow.
- No refund/reversal implementation was found in the reviewed files/migrations.
- Existing test assets were inspected but not executed in a PostgreSQL/Node runtime.
- No Prodamus API, live checkout, refund, webhook, Supabase production database, or production environment was accessed.
- No migration or production configuration was changed.


## Follow-up regression added (2026-11-08)

Added a backend webhook regression in `backend/test/prodamus-webhook.test.js` for a signed success callback that arrives after a purchase has already been credited but carries an amount different from the stored order amount. The expected behavior is: persist an `amount_mismatch` audit record, do not invoke the credit RPC, and do not downgrade the already-successful purchase.

This test is committed but has not been executed in the current environment. It supplements the existing source-level evidence that callback amount/currency validation occurs before the already-credited idempotency return.
