# AUD-095 — Pending checkout customer recovery UX

Date: 2026-11-07

## Scope

Review the customer-facing billing history and the authenticated billing endpoints after AUD-094. This audit is read-only; it does not change payment behavior or database state.

## Findings

### 1. The customer can see a pending state, but cannot resume payment

- `GET /billing/subscriptions` returns the current user's subscription rows, including `provider_payment_id`.
- `GET /billing/credit-purchases` returns the current user's credit purchases, including `provider_payment_id`.
- Both endpoints are protected by `requireAuth`; their underlying queries filter by the authenticated user's ID.
- The pricing UI renders a status label for credit purchases, including `pending`, but does not render a checkout action, an order reference, or recovery guidance.
- The reviewed pricing UI does not implement a customer-facing retry/retrieve flow for pending orders.

This is consistent with the safe provider decision in AUD-094: the application has no proven way to retrieve an existing Prodamus link and must not silently create another payment link.

### 2. Pending credit purchases have an unhelpful date display

The credit-purchase history currently displays `paid_at` and renders an em dash when it is null. A pending order normally has no `paid_at`, so the customer sees no date even though `created_at` is available in the API response.

This is a UI presentation defect, not a payment-state defect. The history should use `paid_at ?? created_at` for display, while keeping the status as the authoritative indication of payment.

### 3. Order references are available to the authenticated backend, but hidden from the customer

Both history queries return `provider_payment_id`, but the reviewed credit-purchase history does not display it. Showing a shortened order reference (with a copy action) would let support locate the exact provider order without exposing a payment URL or allowing a second checkout to be created.

Do not expose a raw checkout URL, provider credentials, webhook payload, or other users' order references in this UI.

## Provider recovery decision

The official Prodamus documentation reviewed for AUD-094 confirms that a merchant can edit a link's expiry and deactivate it. It does not establish a public API operation to retrieve a checkout URL by `order_id`, nor does it settle whether repeated `do=link` requests with the same `order_id` reuse a link or create another payment path.

Therefore:
- Do not add a customer-facing "Pay again" button that calls `do=link` for an existing order.
- Do not infer that a pending order is unpaid merely because its age exceeds a threshold.
- Do not change a pending order to denied/canceled based only on timeout or age.
- Keep fulfillment exclusively behind the verified Prodamus webhook and existing atomic database routines.
- For a lost checkout URL, support/admin must reconcile the provider order in the Prodamus merchant cabinet before advising the customer. Do not manually grant credits or activate a subscription.

## Recommended implementation sequence

1. Improve customer history display: show `created_at` when `paid_at` is null and show a copyable `provider_payment_id` reference for pending rows.
2. Add localized, neutral help text for pending orders: payment confirmation may take time; if the checkout page was closed or the status remains pending, contact support with the order reference. Do not promise a self-service retry.
3. Before implementing a retry/recovery endpoint, obtain written confirmation from Prodamus about lookup-by-order-ID and repeated `do=link` semantics, including link expiry behavior.
4. If Prodamus confirms a safe lookup operation, implement a server-side owner-scoped endpoint that first verifies the local order's owner, amount, currency and pending state; never accept a client-supplied arbitrary provider order ID.
5. Add regression tests for ownership isolation, paid/canceled order rejection, stale pending handling, provider timeouts and duplicate callbacks before enabling any recovery action.

## Verification

- Read `frontend/src/components/pricing/PricingView.tsx`, `frontend/src/lib/billing.ts`, `backend/billing.js`, `backend/creditsBilling.js` and the billing routes in `backend/index.js` from branch `feat/persisted-boards-api`.
- Confirmed the history endpoints are authenticated and user-scoped.
- Confirmed the UI does not expose a payment URL or recovery action.
- No tests were run. No Prodamus live API requests, Supabase queries/writes, deployments or merges were performed.
