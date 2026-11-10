# AUD-091 — Preserve ambiguous Prodamus payment-link outcomes

Date: 2026-11-07

## Finding

Both subscription and credit-purchase creation inserted a local `pending` row, called Prodamus to create a checkout link, and changed the row to `denied` whenever the HTTP call threw or returned an unusable response.

That transition was unsafe. A network timeout, connection reset, gateway error, or malformed/lost response does not prove that Prodamus did not register the order. The provider may still send a delayed success webhook. Marking the local order `denied` obscured this ambiguity and could make a real payment look like a rejected order.

## Change

Updated:

- `backend/billing.js`
- `backend/creditsBilling.js`

On any create-link exception, the backend now:

1. keeps the already-created local order in `pending`;
2. logs the local row ID and provider order ID (but no secrets or customer email);
3. returns the original error to the caller.

This deliberately uses a conservative rule: even errors that might be definitive remain pending until reconciliation. A late, valid, correctly signed webhook can still activate a subscription or credit a purchase through the existing atomic/idempotent fulfillment RPCs.

## Important limitation / follow-up

This prevents a false terminal state; it does not yet provide a customer-facing way to retrieve a lost checkout URL or an automated provider-side order lookup. Pending orders with no webhook still require an authenticated admin reconciliation workflow. Do not manually mark them failed solely because link creation timed out.

Next audit should inspect the existing admin billing surface and webhook exception inventory, then design a read-only pending-order report and a safe reconciliation action with evidence/audit trail.

## Verification

- Reviewed both create-payment flows and the Prodamus request implementation.
- Confirmed the previous catch blocks unconditionally wrote `status: denied` after any create-link error.
- Confirmed webhook fulfillment still accepts a valid success callback for a pending order and uses the existing atomic fulfillment RPC.
- No Node tests or PostgreSQL integration tests were run in this environment.
- No live Prodamus request, Supabase mutation, production deployment, or PR merge was performed.
