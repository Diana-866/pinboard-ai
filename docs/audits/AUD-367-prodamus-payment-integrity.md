# AUD-367 — Prodamus payment and credit integrity

**Date:** 2026-11-11  
**Status:** source audit complete; regression contract added

## Reviewed

- Prodamus HMAC signature verification and webhook body parsing.
- Subscription and credit checkout creation.
- Amount/currency validation and signed payment statuses.
- Duplicate, concurrent, delayed and commit-then-error webhook deliveries.
- Atomic credit ledger and subscription activation functions.
- Checkout idempotency and provider order identity.
- Webhook exception audit and operator refund reconciliation.

## Confirmed controls

1. The public webhook accepts only multipart, URL-encoded or JSON content; multipart is memory-only, bounded to 80 fields × 16 KiB, no files. Nested field parser rejects prototype-pollution keys, duplicate/conflicting fields, oversized sparse arrays and excessive depth.
2. Payment handlers validate Prodamus HMAC-SHA256 signature before database order lookup. Both hex and base64 signatures are supported with constant-time comparison. A dedicated webhook secret is preferred; shop secret is the documented fallback.
3. Only documented final statuses are mapped. Unknown/in-progress values are audited and ignored, so they cannot downgrade pending orders. Cancellation/denial updates cannot overwrite a successful subscription or credited purchase.
4. A success callback must match the locally stored amount and currency. Foreign-currency orders require the signed `currency` + `currency_sum` pair; legacy RUB callbacks may use `sum`. Amount mismatches are durably audited and do not activate entitlements or add credits.
5. Subscription activation and paid period are updated atomically under row locks. Credit fulfillment locks the purchase row and writes user balance, ledger row and `balance_credited_at` in one database transaction. A repeated credit callback returns without a second credit.
6. Checkout creation has a unique per-user idempotency key and immutable request fingerprint; provider order IDs are unique. Ambiguous provider responses remain `unknown` and are not blindly reissued.
7. Webhook settlement verifies exact provider order, request kind, local payment ID, user identity, success status and fulfilled period/credit marker before closing checkout state.
8. Webhook exception fingerprints are unique and the audit table is not publicly readable; the backend service role can insert only. Provider refund reconciliation is a separate operator-only workflow and database guards prevent finalizing unresolved provider outcomes.

## Operational caveat

The source contains migrations 010, 011, 029, 037, 072–073 and 116–118, but this audit cannot prove which are applied in the live Supabase database. Before accepting real payments, compare the production migration ledger to the repository. Verify Prodamus test-mode callbacks with actual signed payloads for RUB and foreign currency, including retry and cancellation races.

## Regression guard

Added `backend/test/billing-security-contract.test.js`. Existing focused tests in `backend/test/prodamus-webhook.test.js`, `prodamus-ambiguous-checkout.test.js`, `payment-creation-settlement.test.js` and `billing-webhook-audit.test.js` cover concrete duplicate, race, mismatch and ambiguous-provider cases.

## Verification limits

Only source inspection and GitHub file read-back performed. Node tests, lint, build, CI, live Supabase, real Prodamus callbacks, real payment/refund and deployment were not run. No balances, subscriptions, credentials or provider settings were changed.
