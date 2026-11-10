# AUD-134 — Subscription entitlement lifecycle and Prodamus recurring-payment boundary

Date: 2026-11-08  
Repository: `Diana-866/pinboard-ai`  
Branch: `feat/persisted-boards-api`  
Scope: subscription checkout, signed payment callback, atomic entitlement activation, plan precedence, expiry enforcement, and whether recurring billing is actually integrated.

## Executive summary

The current PinPosy "subscription" implementation is a **one-time payment for 30 days of access**, not an implemented Prodamus recurring/autopayment subscription. Backend creates a normal Payform link (`do=link`) with a fixed product and a webhook URL. No recurring subscription ID, payment token, next-payment date, autopayment API call, or recurring payment event handler is present in the reviewed path.

The 30-day entitlement activation is atomic and duplicate-safe through `activate_paid_subscription`. A later cancellation/denial callback cannot overwrite a row already marked `success`; a valid delayed success can activate a previously canceled/denied pending order. Expiry is enforced dynamically in `getTariffState`, so a cron job is not required to revoke API access, although the stored `users.tariff_plan` value is not automatically reset to `none` by this function.

## Reviewed source

- `backend/billing.js`
- `backend/prodamus.js`
- `backend/tariff.js`
- `db/migrations/006_subscriptions.sql`
- `db/migrations/011_atomic_subscription_activation.sql`
- `db/migrations/019_prevent_late_subscription_downgrade.sql`
- `db/migrations/029_billing_webhook_exceptions.sql`
- `db/migrations/037_billing_webhook_currency_audit.sql`
- `backend/billingWebhookAudit.js`
- `backend/test/prodamus-webhook.test.js`
- `backend/test/prodamus-ambiguous-checkout.test.js`

## Confirmed safeguards

1. **Order before provider call.** A pending subscription row with unique `provider_payment_id` is inserted before requesting a Payform URL. A network timeout leaves it pending because the provider may already have registered the order.
2. **Signed callback and money checks.** The webhook verifies HMAC-SHA256, resolves the exact local `order_id`, validates currency and amount against server-stored values, and audits unknown/mismatched signed callbacks.
3. **Atomic activation.** `activate_paid_subscription` locks the subscription row and then the user row. It records `success`, `period_start`, `period_end`, and the user's entitlement in one database transaction.
4. **Duplicate callbacks.** A subscription already marked `success` with a non-null `period_end` returns its existing period rather than granting another 30 days.
5. **Late cancellation cannot revoke a paid order.** The webhook updates non-success statuses only where the current row is not `success`; migration 019 and regression tests explicitly preserve successful activation against a later cancellation callback.
6. **Late success remains recoverable.** A correctly signed, amount-matched success can activate a row previously marked `denied` or `canceled`. This handles delayed/out-of-order provider notifications.
7. **Plan precedence.** Migration 019 compares successful orders by local order creation time and prevents an older-created order's late webhook from replacing the plan chosen by a newer-created successful order. A valid payment can still extend the entitlement end date.
8. **Expiry enforced at request time.** `getTariffState` checks the effective period end against current time and fails closed if subscription lookup fails. The tariff middleware blocks protected API routes after expiry even if the denormalized `users.tariff_plan` string remains unchanged.
9. **Activation email outbox.** Email dispatch is decoupled from activation and can drain pending messages again on duplicate callback, supporting recovery after a process stops between database commit and SMTP delivery.

## Important product/architecture distinction: no recurring billing

`createPayment` requests an ordinary Payform payment link. The code sends a 30-day product description and records a local `subscriptions` row, but it does not create a Prodamus autopayment subscription or handle Prodamus subscription lifecycle events such as `subscription.type=action`, `action_code=deactivation`, or `finish`.

The local label "subscription" therefore means a prepaid 30-day entitlement that a customer must purchase again. It does **not** mean a card will be automatically charged every 30 days. Do not advertise automatic renewal or implement a recurring webhook parser without explicitly choosing and configuring Prodamus's separate recurring-payment/club functionality.

## Gaps and risks

### 1. Manual renewal only (confirmed)

There is no recurring charge setup or dedicated recurring callback handler in the reviewed backend. Product copy and UI should describe a 30-day paid period with manual renewal unless/until the separate Prodamus recurring integration is built and tested.

### 2. Payment timestamp source

The webhook activation call passes the backend's `new Date().toISOString()` receipt time as `p_paid_at`, rather than a verified provider payment timestamp. The SQL activation uses this value as the start of a new period (or the current entitlement end, whichever is later). If a successful callback is delayed substantially, the period starts later than the actual payment. This is conservative for access (does not grant time before notification) but may give the customer a later expiry than the actual payment timestamp. Confirm the signed Prodamus payment-date field and its semantics before changing this.

### 3. New order on every checkout retry

Every `createPayment` call creates a fresh order ID and a fresh pending subscription. A retry after an ambiguous response may leave more than one payable order for the same user. Duplicate callbacks per order are safe, but multiple separately paid orders are separate valid 30-day purchases and extend access sequentially. Consider a client idempotency key or a carefully defined pending-order reuse/expiry policy; do not auto-cancel an order while its provider outcome may be unknown.

### 4. Entitlement projection remains stale after expiry

`getTariffState` correctly blocks paid API access after `period_end`, but it does not rewrite `users.tariff_plan` to `none`. Any UI or API consumer that reads only the denormalized field without using the tariff state can display a stale paid plan. Audit all read surfaces (especially `/me`, dashboard and admin views) before relying on `users.tariff_plan` as proof of active access. Do not add a cron that changes entitlement without checking the manual-grant and subscription precedence rules.

### 5. No subscription cancellation workflow in PinPosy

The current one-time payment flow has no recurring payment to cancel. A future recurring integration would need separate local state for provider subscription ID, active/deactivated/completed state, next-payment time, and cancellation source/reason. A deactivation callback must stop future renewal without retroactively removing already-paid access.

### 6. Late success semantics need operator visibility

The handler intentionally accepts a valid late success even after a non-success callback. This is sensible for out-of-order notifications, but the dashboard/reconciliation queue should make the final activation visible so operators can distinguish a genuinely paid order from an earlier failed attempt. Existing webhook exception audit captures unknown/unsupported/mismatched events, but it is not a complete journal of every valid callback.

## Recommended next steps

1. Verify all customer-facing copy: describe the current offer as "30 days" / manual renewal, not automatic recurring billing.
2. Audit `/me` and frontend tariff displays to ensure they use effective expiry state, not just stale `users.tariff_plan`.
3. Confirm whether the signed Payform callback includes a trustworthy payment timestamp and whether using it is required for the agreed customer policy.
4. Decide whether checkout retries should reuse a still-pending order via client idempotency, while preserving safe recovery from ambiguous provider outcomes.
5. If automatic renewal is a product requirement, treat it as a separate project: enable Prodamus club/autopayment functionality, define the exact provider subscription lifecycle payload, store provider subscription IDs and events, and add tests for duplicate/out-of-order renewal/deactivation/completion events.
6. Add disposable PostgreSQL integration tests for: older order callback after newer plan purchase; concurrent activation of two orders for one user; expiry at exact boundary; manual grant with null and non-null expiry; delayed success after cancel; and entitlement reads after expiry.

## Provider documentation reviewed

- Prodamus documentation for creating/configuring subscriptions and recurring payments: describes the separate club/autopayment configuration and notification URL for autopayments.
- Prodamus documentation for subscription completion: describes webhook notifications with nested `subscription` object and action codes for deactivation/completion. These are not the generic `payment_status` callback currently handled by PinPosy.
- Prodamus notification retry schedule: URL callbacks are retried on a documented schedule, supporting the need for idempotent handlers.

## Validation status

Source review and provider documentation review only. No Node tests or PostgreSQL tests were executed. No live Prodamus request, real payment, production database query, migration, deployment, or merge was performed.
