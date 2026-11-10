# AUD-092 — Read-only inventory for stale pending Prodamus orders

Date: 2026-11-07

## Context

AUD-091 changed ambiguous checkout-link failures to remain pending so that a delayed provider webhook can still fulfill a real payment. That avoids a false terminal state, but old pending rows need a safe way to be found and reviewed.

## Change

Added administrator-only endpoint:

`GET /admin/billing/pending-orders?older_than_hours=24&limit=50`

The endpoint:

- requires the existing authenticated administrator middleware;
- clamps the age filter to 1–720 hours and the per-kind limit to 1–100;
- reads pending subscriptions and pending credit purchases with no credit fulfillment timestamp;
- returns order/provider IDs, user ID, plan/package, amount, currency, creation time, and calculated age;
- performs no status changes, provider requests, refunds, credit adjustments, or other mutations.

The response explicitly warns that age alone is not evidence that payment did not happen. An administrator must reconcile the provider order before any manual terminal decision.

## Files

- `backend/index.js`
- `docs/audits/AUD-092-stale-pending-payment-inventory.md`

## Verification and limitations

- Reviewed both source tables and confirmed their pending status and created_at fields are already used by the billing flow.
- Route is protected by `requireAuth` and `requireAdmin`.
- The endpoint is read-only and applies bounded query parameters.
- No automated route test, Node test, PostgreSQL integration test, or live Supabase query was run.
- No Prodamus API call, production mutation, deployment, or PR merge was performed.
