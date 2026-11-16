# Frontend audit 06 — billing, credits and checkout lifecycle

- Date: 2026-11-16
- Branch: `main`
- Scope: pricing/credit-pack catalog, checkout creation and redirect, payment history polling, terminal idempotency-key release, Prodamus provider link creation and webhook fulfillment/security contracts.
- Nature: source-level review and targeted frontend ownership/idempotency fixes. No live payment, Prodamus merchant account, webhook, production DB or balance was touched.

## FE-06 — a delayed checkout response could redirect a newly authenticated user

**Evidence before fix:** `PricingView` invoked `payAndRedirect()` / `buyCreditsAndRedirect()`, which navigated inside the billing library immediately after checkout creation. If the authenticated account changed while the API request was pending, the previous user's response could redirect the new user's browser to the old user's payment page. The component already fenced billing-history reads by owner, but the redirect path had no equivalent owner check.

**Fix on main:**
- `PricingView` now calls `startPayment()` / `startCreditsPurchase()` to obtain a payment intent without navigating.
- It captures the initiating owner ID and redirects only if `billingOwnerIdRef` still matches that owner.
- On owner change, it clears checkout lock, selected plan/pack loading state and previous error; stale old-owner errors do not overwrite the new owner's UI.
- Redirect wrappers remain available in `billing.ts`, but now also require an explicit owner ID.

## FE-07 — browser checkout idempotency keys were global across users

**Evidence before fix:** `billing.ts` used localStorage key `pinposy:payment-idempotency:<scope>`, where scope contained only plan/currency or credit package. The backend correctly scopes payment creation requests by `(user_id, idempotency_key)`, but browser key storage/release was not user-scoped. Thus one account's terminal payment poll could remove the same localStorage key another account was using for its still-pending payment; a later retry by that account could generate a new key and risk a duplicate provider invoice.

**Fix on main:**
- Added `buildPaymentIdempotencyStorageKey(ownerId, scope)`, rejecting empty identities and including URL-encoded owner ID in the browser storage key.
- `startPayment`, `startCreditsPurchase`, `payAndRedirect`, `buyCreditsAndRedirect` and `releasePaymentIdempotencyKey` now require the owner ID.
- Failed-checkout key release and terminal-status polling release only the current owner's key.
- Added tests proving the same checkout scope produces different storage keys for different users and rejects empty owner/scope.

**Commits:**
- `ee54da1181de479cba45b18b654ef5096b3261bf` — checkout redirect fenced by billing owner.
- `7d673859f868faec6fc55b5df02769a5f2bc1b2c` — owner-scoped storage key helper.
- `239f851df6a5896a9084b8534dd2aa2aff248fdb` — owner-scope tests.
- `d8e1666d7ba36ba1c6aba26a3fd76297a4ae2ca4` — billing key create/release owner-scoped.
- `4ba01aca38b768ed3d01aa7262743335a59fad4d` — PricingView passes owner ID and scopes terminal release.
- `6b17db6fa8a0f0e850f79278eb02acaa31699f73` — checkout state declarations grouped.

## Billing and provider contracts reviewed

Frontend:
- `frontend/src/components/pricing/PricingView.tsx`
- `frontend/src/lib/billing.ts`
- `frontend/src/utils/billingOwner.ts` + tests
- `frontend/src/utils/paymentIdempotencyStorageKey.ts` + tests
- `frontend/src/utils/paymentTerminalStatus.ts` + tests
- `frontend/src/utils/creditPurchaseOrderMatch.ts` + tests
- subscription/credit purchase history polling and payment return refresh.

Backend:
- `backend/index.js` billing routes and public Prodamus webhook dispatch.
- `backend/billing.js`, `creditsBilling.js`, `creditPacks.js`, `credits.js`, `prodamus.js`.
- `backend/paymentCreationIdempotency.js`, `paymentOrderId.js`, `prodamusWebhookBody.js`, `billingWebhookAudit.js`.
- Tests inspected: billing security contract, webhook audit, payment creation idempotency, payment settlement, Prodamus webhook, ambiguous checkout, demo-payment guard, credit fulfillment SQL, credit reservation ledger guard, credit/subscription concurrency scripts.

**Contract observations:**
1. Plan and credit pack prices/sizes are backend-owned catalogs. Client sends plan/package identifiers; the backend does not accept a client-supplied price or credit amount. Credit packs are RUB-only; plan catalog exposes RUB/USD.
2. Payment creation requires an authenticated user and bounded idempotency key. The durable request is scoped by user and includes a SHA-256 request fingerprint, attached unique provider order ID, and states for creating/ready/unknown/failed/settled. Unknown provider outcome remains fenced; only explicit provider rejection with confirmed cleanup releases the request.
3. Provider order IDs use OS cryptographic randomness. The exact provider order ID must be attached to the durable request and match the saved checkout result.
4. Prodamus outbound form signing uses canonicalized HMAC-SHA256. Webhook signature verification uses constant-time comparison. Multipart webhook parsing bounds fields/depth/indexes and rejects prototype-pollution/conflicting field structures.
5. Shared webhook endpoint dispatches credit vs subscription by server-generated order prefix. Both handlers verify signature before DB lookup, reject demo webhook fulfillment in production, validate exact signed amount/currency against the local order and durably record mismatches for review.
6. Subscription plan activation is a single PostgreSQL RPC; credit fulfillment updates balance, ledger and purchase marker atomically. Duplicate webhook fulfillment is idempotent. Checkout request settlement happens only after exact local payment fulfillment; settled checkout no longer replays its payment URL.
7. Webhook exception audit fingerprints are deterministic/deduplicated, exclude the transport retry counter, and do not retain customer email or raw body. Table privileges are restricted to service-role insert; public/authenticated/service-role reads are revoked.
8. Billing history and polling are user-scoped. Frontend releases only keys for payment rows that were previously pending and have reached an explicit terminal status; unfamiliar states such as `unknown` do not release a key.
9. No additional backend billing/webhook contract defect was identified in this static review. The existing SQL integration/concurrency sources are not runtime evidence until executed.

## Static readback and verification

After changes, re-fetched from GitHub `main`:
- `frontend/src/lib/billing.ts`
- `frontend/src/components/pricing/PricingView.tsx`
- owner-scoped key helper and tests
- `backend/billing.js`, `creditsBilling.js`, `prodamus.js`, `paymentCreationIdempotency.js`
- billing security contract test and payment settlement SQL integration source.

Seventeen targeted static assertions passed, including:
- owner-specific localStorage key generation and regression test;
- owner-required start/release function signatures and redirect wrappers;
- PricingView passes owner IDs to both payment types and releases terminal keys only for the current owner;
- redirect is guarded against owner change and checkout lock is reset on owner change;
- both webhook handlers verify signature and production demo guard before order lookup;
- signed amount/currency checks precede fulfillment;
- atomic subscription/credit fulfillment and exact checkout settlement are present;
- ambiguous provider outcomes remain unknown/fenced;
- settled checkout cannot replay a payment URL.

Existing frontend/backend test sources and SQL scripts were inspected but **not executed**. No TypeScript check, frontend unit test command, backend runtime test, SQL integration/concurrency test, live Prodamus call, webhook delivery, real payment or production balance change occurred.

## Remaining risks / boundaries

- Browser checkout ownership and localStorage separation need an integration test with two accounts and delayed checkout responses.
- Real Prodamus merchant settings, webhook URL/signing secret, success/cancel return URLs and production/demo environment values must be checked against the live merchant account before accepting real users; the assistant did not inspect or change these secrets/settings.
- The Vercel `build-rate-limit` blocker and GitHub Actions runner provisioning failure remain. No successful build/test result is available.
- Admin billing exception/subscription/payment-request screens still need a separate authorization and UX audit.
- Full frontend audit and runtime gates remain open. Mandatory NEXT remains disposable PostgreSQL replay `001_baseline.sql` + active migrations `010–148`, SQL integration suite and backend runtime suite. UA-001 (PostgreSQL binary/disk check) and UA-002 (GitHub Actions billing/runner/settings check) remain pending in `docs/USER_ACTIONS.md`.

No real payment, live provider account, production database, user balance, webhook configuration or deployment setting was changed.


## Follow-up readback: current main and pricing-page copy (2026-11-16)

A later readback against the current default branch confirmed the owner-scoped checkout changes documented above. Current source blobs: `PricingView.tsx` `25ca1cade233135ffd6e94a8021cbf64933ddc3f`, `frontend/src/lib/billing.ts` `3316d55ab58fc1bf5a4e3a6767f5e9f2c4f7c35b`, `paymentIdempotencyStorageKey.ts` `ba3a5350c41beeded0b7a99851648a1a0c08e4b1`, its tests `483dc2699b0fc8dca6dc36d3e775d07c9fbd65f7`, and `App.tsx` `f92f463e67cd06708733741253bf18120a9474ee`. Fourteen additional static assertions passed for owner-scoped storage, owner ID propagation to both checkout types, owner-scoped key release, stale-owner redirect fence, payment-return refresh, pending-only foreground polling, terminal-state allowlist, signature-before-order lookup, demo-webhook production guard, amount/currency validation and atomic fulfillment RPCs. Two early false-negative assertions were corrected because they searched the wrong source slice / omitted the terminal-status file; no code defect was implied by those assertion mistakes.

**Follow-up FE-08 — pricing content is not consistently localized.** The plan cards in `PricingView.tsx` still contain hardcoded English feature/not-included arrays, mixed-language account/period metadata and Russian/English credit-pack and history fallback labels. This does not invalidate the payment ownership/settlement contracts, but it is a real UX issue for the seven supported UI locales. The package-06 payment-flow audit remains complete; FE-08 is a separate pricing-content/localization and feature-claim audit to perform next. Plan claims such as team/moderator access, dedicated render capacity, dedicated consulting and white-label PDF reports must be matched to implemented capabilities before they are shown as available paid features. Do not remove/alter plan entitlements or pricing without a documented source-of-truth decision. No source changes were made in this follow-up.
