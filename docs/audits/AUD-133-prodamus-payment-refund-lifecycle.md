# AUD-133 — Prodamus payment fulfillment and refund lifecycle audit

Date: 2026-11-08  
Scope: source-level review of Prodamus checkout, webhook verification, credit fulfillment, and the documented refund flow.  
Repository: `Diana-866/pinboard-ai`  
Branch: `feat/persisted-boards-api`

## Executive summary

The reviewed credit-pack payment path has useful safeguards against duplicate crediting and ambiguous checkout creation. A purchase row is persisted before requesting a payment link; an uncertain link-creation outcome leaves the row pending; the webhook validates a signature and matches the provider order ID; the signed amount/currency is compared with the server-side purchase; and the PostgreSQL RPC locks the purchase row and atomically updates the user balance, inserts the unique ledger row, and sets the credited marker.

The main lifecycle gap is refunds: the inspected application has no refund-specific state, refund webhook handler, refund ledger transaction, or guarded credit-reversal workflow for credit packs. The official Prodamus help pages reviewed describe refunds as an owner-submitted request in the Prodamus cabinet followed by provider processing, and describe tracking refunds in the cabinet. The pages reviewed do not specify a payment-webhook event/payload for refund completion. Therefore, do not implement a guessed webhook status or automatically reverse credits based only on an assumed event.

## Reviewed source

- `backend/prodamus.js`
- `backend/creditsBilling.js`
- `backend/billing.js` (route integration and existing billing architecture; detailed subscription behavior should be audited separately)
- `db/migrations/006_subscriptions.sql`
- `db/migrations/007_credit_purchases.sql`
- `db/migrations/010_atomic_credit_ledger.sql`
- `backend/test/prodamus-ambiguous-checkout.test.js`
- `backend/test/credit-concurrency.sh`

## Safeguards confirmed in source

1. **Server-owned order data.** The pack ID is normalized against the server catalogue. Amount and credits are read from `CREDIT_PACKS`, not accepted from the client.
2. **Persist-before-checkout.** `createCreditsPayment` inserts a `pending` row with a unique `ppc-` order ID before calling Prodamus to create the payment link.
3. **Ambiguous checkout remains recoverable.** A timeout/connection failure does not mark the order denied. The purchase remains pending so a later payment callback can still be reconciled.
4. **Webhook authenticity.** `verifyWebhook` validates HMAC-SHA256 using `PRODAMUS_SECRET_WEBHOOK` (or fallback `PRODAMUS_SECRET`), accepts documented base64/hex representations, and uses `timingSafeEqual` after fixed-length hashing.
5. **Order and money matching.** The handler looks up the exact `order_id`; unknown IDs are audited. Success callbacks must have a valid amount/currency pair matching the stored expected amount within 0.01. Mismatches are recorded for reconciliation and do not credit.
6. **Atomic one-time fulfillment.** `credit_paid_purchase` locks the purchase row, increments the user's balance, inserts a `credit_transactions` row uniquely keyed by `purchase_id`, and marks `balance_credited_at` in one PostgreSQL transaction. Repeated/concurrent calls return without crediting again.
7. **Late success is intentionally possible.** The RPC permits `pending`, `denied`, and `canceled` purchases to be credited. This supports a delayed genuine success callback after an earlier non-success notification or amount-mismatch quarantine. It is safe from duplicate crediting because of the row lock and credited marker, but it makes reliable manual reconciliation important.

## Gaps and risks

### 1. No refund reversal workflow for credit packs — confirmed gap

The inspected migrations constrain credit-purchase statuses to `pending | success | canceled | denied`. There is no `refunded` state, no provider refund ID/amount, no refund-specific unique ledger key, and no RPC to reverse credits exactly once. The webhook status normalizer recognizes only `success`, `order_canceled`, and `order_denied`.

A successful payment can therefore be credited, then refunded manually in Prodamus, while PinPosy has no code path in the reviewed files to revoke/reconcile the purchased credits. The credits may already have been spent. A naive negative balance update would be unsafe and could violate reservation/credit invariants.

**Required before production sales:** obtain Prodamus confirmation of the authoritative refund-completion signal and whether a refund callback is available for this Payform integration. Until then, refunds need an explicit operator reconciliation process based on the provider cabinet/report, not a guessed webhook event.

### 2. Refund semantics must account for spent credits

A future reversal must be idempotent and transactionally linked to the original purchase. It must record the actual refunded amount (including partial refunds if supported), prevent duplicate reversal, and define what happens when some or all purchased credits have already been spent or reserved. Do not silently drive the balance negative, invalidate active reservations, or treat a refund request as a completed refund.

### 3. No webhook event replay/timestamp window

The verifier checks HMAC authenticity but does not check a signed event timestamp, event ID, or replay window. The purchase-level credited marker prevents duplicate crediting, and state updates are guarded against overwriting a credited purchase. Nevertheless, the integration has no general webhook-delivery journal/deduplication key for forensic event ordering. Confirm with Prodamus whether callbacks include a stable event identifier/timestamp and whether signature canonicalization covers it. If not, persist a local digest and receipt record for observability; do not invent a timestamp requirement that Prodamus does not send.

### 4. Refund completion is not the same as refund request

The Prodamus help page reviewed says the owner submits a refund request in the cabinet, Prodamus then initiates the refund after funds are available, and bank settlement may take 1–30 business days (often 1–5). It says refunds can be tracked in the cabinet. A request therefore must not immediately trigger credit reversal. The documentation reviewed does not define a technical webhook callback for refund completion.

### 5. Checkout retry UX

Each call to `createCreditsPayment` generates a fresh order ID. If the user retries after an ambiguous response, a second pending order can be created. This is not a double-credit vulnerability because each order is independently matched and fulfilled once, but it can leave multiple payable links/orders. Consider a client idempotency key or a safe reuse/reconciliation policy for an existing pending order, only after defining expiration and provider-link behavior.

## Tests present (not executed in this audit)

- `backend/test/prodamus-ambiguous-checkout.test.js` covers ambiguous subscription and credit-pack link creation, asserting the row remains pending.
- `backend/test/credit-concurrency.sh` creates a disposable purchase, holds its row lock, starts two independent `credit_paid_purchase` calls, and asserts the balance increases once and exactly one ledger row exists.

No Node tests, PostgreSQL integration scripts, provider requests, real payments, or production database queries were run for this audit.

## Recommended next implementation sequence

1. Ask Prodamus support to confirm whether Payform sends a refund-completion webhook for this exact integration, the event name/payload, signature rules, partial-refund behavior, and whether the original `order_id` is included.
2. Add a durable refund/reconciliation journal with unique provider refund identity (or a controlled operator-generated idempotency key if Prodamus has none), original purchase FK, amount/currency, status, evidence/source, and timestamps.
3. Design a guarded SQL reversal RPC only after product policy for spent/reserved credits is defined. It should lock the purchase/user in a consistent order, be idempotent, write a negative ledger row linked to the purchase/refund, and never silently overdraw the account.
4. Add disposable PostgreSQL tests for duplicate refund event, partial then final refund, refund-vs-credit race, refund after credits have been spent, refund while credits are reserved, and operator retry after uncertain outcome.
5. Add a read-only admin queue for refund requests/events awaiting reconciliation. Never automatically mark a refund complete based solely on age or a customer-facing request.

## Provider documentation reviewed

- Prodamus — “Как в Prodamus устроены возвраты платежей клиентам”: refund request is created by the payment-page owner in the cabinet; Prodamus initiates the refund after funds are available; customer receipt is generated; bank processing is described as 1–30 business days; refunds are tracked in the cabinet.
- Prodamus — “Интервалы уведомлений”: URL notification retries are documented, but this page does not establish a refund-completion webhook contract.

## Validation status

Source review only. No SQL migration was added because refund callback semantics and credit-reversal policy are not yet confirmed. No production changes, merges, deployments, or live payment actions were performed.
