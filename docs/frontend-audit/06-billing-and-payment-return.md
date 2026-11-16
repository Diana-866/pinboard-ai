# Frontend audit 06 — billing, credits and payment return UX

- Date: 2026-11-16
- Branch: `main`
- Status: [~] Static audit in progress; no runtime certification.
- Scope: subscription and credit-pack checkout UI, payment idempotency keys, billing history, payment-return handling, pending-payment refresh, user-session isolation, and the frontend/backend Prodamus contracts.
- Safety: no real payment, provider dashboard, production webhook, account secret or deployed configuration was accessed or changed.

## Current source baseline

The following files were fetched from GitHub `main` during this pass:

Frontend:
- `frontend/src/components/pricing/PricingView.tsx`
- `frontend/src/lib/billing.ts`
- `frontend/src/utils/paymentTerminalStatus.ts` and tests
- `frontend/src/utils/billingOwner.ts` and tests
- `frontend/src/App.tsx`

Backend and contract references:
- `backend/billing.js`
- `backend/creditsBilling.js`
- `backend/prodamus.js`
- `backend/paymentCreationIdempotency.js`
- `backend/index.js` billing routes
- `backend/test/prodamus-webhook.test.js`
- `backend/test/prodamus-ambiguous-checkout.test.js`
- `backend/test/payment-creation-settlement.test.js`
- `backend/test/billing-security-contract.test.js`
- `docs/backend-audit/03-billing-credits-prodamus.md`
- `docs/backend-audit/11-rpc-contracts.md`

## Contracts confirmed by source inspection

1. Subscription and credit-pack prices are fetched from the backend catalog; the checkout request does not trust a client-submitted amount.
2. Subscription and credit-pack checkout use separate, persisted idempotency scopes. Ambiguous provider outcomes retain the key; only explicit reusable/settled terminal responses release it.
3. A single checkout lock prevents simultaneous plan and credit-pack invoice creation in one mounted pricing view.
4. Checkout completion handlers capture the authenticated owner and ignore stale responses after an account switch. Billing history is cleared on owner change and history requests are owner-fenced.
5. The app handles `?payment=success` by navigating to Pricing, refreshing the authenticated user at 0/3/8/15 seconds, then removing the query parameter. PricingView polls subscription and credit ledgers only while there are pending orders and the page is visible.
6. Polling releases only the idempotency key belonging to a previously pending order that reaches an allowlisted terminal state. Unknown/in-progress statuses do not release it.
7. Backend webhook handlers verify the HMAC signature before order lookup, validate amount/currency, record mismatches/unknown statuses for review, and settle subscriptions/credits through atomic RPC paths.
8. Production deployments block demo-mode webhook fulfillment. Checkout URLs are restricted to HTTPS and the configured Prodamus/payform host family.
9. Backend security-contract tests cover webhook parser bounds, order-prefix dispatch, signature-before-lookup, amount/currency validation, atomic credit fulfillment, idempotency uniqueness, webhook audit privacy and constant-time signature comparison.

## Current verification evidence

- The relevant frontend utility tests and backend test sources were read; they were not executed.
- No React/browser checkout test, TypeScript check, production build, backend runtime suite, SQL integration test, PostgreSQL replay, Prodamus staging payment or live webhook was run.
- The existing backend billing audit already records the checkout-provider HTTP-status ambiguity fix and the exact SQL/RPC reconciliation; this pass does not re-certify those runtime behaviors.
- The Vercel status for the latest calendar component commit `83932ff0376174659a5c46ad8dfaf8f46bdf283c` is `failure` with target `build-rate-limit`; it is not a build log or test result.

## Open work in this package

- Continue line-by-line review of PricingView checkout controls, history/status rendering, error paths and accessible recovery when navigation does not complete.
- Verify all plan and credit-pack UI copy/amount formatting across supported locales against the backend catalog.
- Inspect Prodamus webhook status transitions and checkout return behavior for edge cases not covered by the existing static backend audit.
- Add focused frontend regression tests only where a concrete defect or untested state transition is established.
- Do not run real payments or modify Prodamus settings. A provider staging payment requires a separately documented staging readiness step and explicit user authorization.

## Release boundary

This static pass found no confirmed payment-settlement defect in the inspected code paths, but that is not proof that checkout works in production. The package remains in progress. Mandatory disposable PostgreSQL replay, SQL integration and backend runtime gates remain open under UA-001/UA-002 in `docs/USER_ACTIONS.md`.
