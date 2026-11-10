# AUD-094 — Prodamus checkout-link recovery and storage decision

Date: 2026-11-07

## Finding

The current subscription and credit-purchase creation flows persist a local row and the provider order ID before requesting a Prodamus checkout URL. On success, the URL is returned to the browser but is not stored. If the provider request succeeds and the HTTP response to the browser is lost, the customer can be left with a pending order but no self-service way to reopen its checkout URL.

The schema currently has no checkout URL or checkout-link expiry fields in either `subscriptions` or `credit_purchases`.

## Provider documentation reviewed

The official Prodamus help article on editing payment links states that the merchant can change the link's basket, amount, currency, expiry period and payment limits, and can deactivate a link. This means links have a configurable lifecycle; the integration must not assume that a previously issued URL remains valid indefinitely.

The existing integration uses the documented `do=link` request to create a link. No provider-side lookup/retrieve operation is implemented in this repository, and the reviewed public documentation did not establish a supported API operation to recover an existing link by `order_id`.

## Security decision

Do not persist raw checkout URLs yet. A checkout URL is a bearer-like payment capability: anyone who obtains it may be able to open the payment flow. Persisting it without a defined expiry, access policy, and cleanup process would increase the impact of a database or log disclosure.

Do not automatically issue another link for the same pending order until Prodamus idempotency/reuse semantics for repeated `do=link` calls with the same `order_id` are confirmed. A second link could create confusing or duplicate payment paths.

## Safe next steps

1. Confirm with Prodamus support or current technical documentation whether an existing link can be retrieved by `order_id`, and whether repeated link-creation calls with the same order ID return the same link or create a new one.
2. Confirm link expiry defaults and whether the generated link can be explicitly time-limited through the API.
3. If durable URL storage is approved, store it only after successful URL validation, never log it, expose it only through an authenticated owner-scoped endpoint, and add expiry/cleanup behavior.
4. Until then, preserve the current safe behavior: pending orders remain visible in the authenticated purchase history and admin reconciliation inventory; no blind retry or automatic status downgrade.

## Verification and scope

- Reviewed `db/migrations/006_subscriptions.sql` and `007_credit_purchases.sql`: neither table defines a checkout URL field.
- Reviewed `backend/billing.js`, `backend/creditsBilling.js`, and `backend/prodamus.js`: the URL is returned from creation and is not persisted; no provider lookup method exists.
- Reviewed the official Prodamus help article on editing payment links.
- No code or database migration changed in this audit.
- No live provider requests, Supabase writes, deployment, or PR merge were performed.
