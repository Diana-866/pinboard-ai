# Prodamus per-request webhook URL HTTPS guard

**Date:** 2026-11-18 (UTC+03:00)  
**Repository:** `Diana-866/pinboard-ai`  
**Branch:** `main`  
**Initial reconciled HEAD:** `77cf63740f6c68c1efe778527fccbce34130938a`  
**Source/test changes:** through `9e93163b7a6cd9c0a69ea206f26d9709fcce4f6d`

## 1. Finding and root cause

The Prodamus checkout builder accepts an optional `urlNotification`. When `PRODAMUS_SYS` is configured, `backend/prodamus.js:createPaymentLink` includes that URL in the signed request payload. Before this change, the value was passed through unchanged. Subscription and credit checkout handlers construct it from `PUBLIC_BACKEND_URL` / `BACKEND_URL` without validating its scheme or embedded credentials.

A configuration typo or unsafe environment value such as `http://api.example/...` could therefore make the provider send payment notifications over plaintext HTTP. A credential-bearing URL could also be passed as the callback destination. The app already validates the provider's returned checkout URL, but had no corresponding guard for the per-request notification destination.

The issue is limited to the per-request override path: if `PRODAMUS_SYS` is blank, the integration intentionally omits `urlNotification` and relies on the webhook URL configured in the Prodamus payment-form settings. This change does not validate or prove that external dashboard setting.

## 2. Implementation

### Shared provider boundary

Added `validateWebhookNotificationUrl(raw)` to `backend/prodamus.js`:
- parses the value as a URL;
- requires `https:`;
- requires a hostname;
- rejects embedded username/password credentials;
- returns the normalized URL;
- raises a configuration error before the provider request for invalid values.

`createPaymentLink` applies this validation whenever it is about to include a per-request notification override. The value that is signed and submitted is the validated normalized URL.

### Checkout preflight

Both `backend/billing.js:createPayment` and `backend/creditsBilling.js:createCreditsPayment` now compute the callback URL and validate it when `PRODAMUS_SYS` is non-empty, before calling `beginPaymentCreation`. Thus a bad callback configuration fails before:
- an idempotency request is reserved;
- a local pending subscription/credit purchase is inserted;
- a request is sent to Prodamus.

Both handlers pass the precomputed URL to `createPaymentLink`; the shared provider module still validates independently as defense in depth.

## 3. Regression coverage

Added tests in `backend/test/prodamus-webhook.test.js`:
- accepts a valid HTTPS notification URL;
- rejects HTTP, FTP, credential-bearing, malformed and non-URL values;
- rejects an insecure URL at `createPaymentLink` even in offline mode when a per-request SYS override is active.

Added an end-to-end handler-level test in `backend/test/prodamus-ambiguous-checkout.test.js`:
- configures `PRODAMUS_SYS` and an HTTP `PUBLIC_BACKEND_URL`;
- verifies both subscription and credit checkout reject the configuration;
- verifies neither local payment table nor the durable idempotency request map changes.

Added a source-contract test in `backend/test/billing-security-contract.test.js` asserting both handlers validate the notification URL before reserving payment idempotency and pass the prevalidated value to the provider helper.

The existing `.github/workflows/prodamus-checkout-tests.yml` already watches all changed production/test paths in both push and pull_request filters and executes `prodamus-ambiguous-checkout.test.js`, `prodamus-webhook.test.js` and `billing-security-contract.test.js`; no workflow edit was required for this change.

## 4. Commit chronology

| Commit | Change |
|---|---|
| `8ee8bc5036ecabbbcb24341111b5f5b91ca56947` | Add shared HTTPS/credential validation and apply it to per-request Prodamus notification overrides |
| `dab469b742abcfcabd217c810298440bfd849a63` | Preflight subscription callback URL before idempotency reservation |
| `86a2c3978cddb36f44d9eb148ca63cf671c7098d` | Preflight credit callback URL before idempotency reservation |
| `e57a0ea93e4206ebe848eb23fd6923865e7da17b` | Add HTTPS/credential and provider-boundary regression tests |
| `cc6f81ad0d0077878eba8a359fb3721ab5c60812` | Add source-contract coverage for preflight ordering and workflow command |
| `9e93163b7a6cd9c0a69ea206f26d9709fcce4f6d` | Add handler-level test proving invalid configuration creates no pending order or idempotency reservation |

Subsequent commits on main also corrected RUB webhook amount-field metadata (`ce36d6ee38a3df4cc0fb450445bcf5ea02d3c0c8`) and recorded that follow-up. Those changes are separate from this URL guard and were retained.

## 5. Source snapshot and diffs

Final observed blobs for this task:
- `backend/prodamus.js`: `db96f8afb6fdfa29f2a4aa39fa63fde9ece358c1` (includes the later RUB metadata correction);
- `backend/billing.js`: `82f24c63c31f63cb8d0586bb5a0c798b1593dc73`;
- `backend/creditsBilling.js`: `62cb1b27dbbedd1093d1062944f1b99a7154ce41`;
- `backend/test/prodamus-webhook.test.js`: `cda5c65104c626d28789573b46b2709a6bd5f97f`;
- `backend/test/billing-security-contract.test.js`: `7183451d356680463d852cdc29fc99826a31acfa`;
- `backend/test/prodamus-ambiguous-checkout.test.js`: `cdc64bf186ce2aa16c260225e2b1c0a0436cbe70`.

All six files were re-fetched from main after editing. Their final contents and the individual commit diffs were inspected. The Prodamus workflow file remained unchanged at blob `300a7d69d55c58610d63ee68beeff4d008e47c2b`; its path filters and five-file Node command include the relevant source and tests.

## 6. Runtime and CI verification boundary

No local Node/npm command was executed because no owner worktree/runtime is available through the GitHub file-edit connection. Therefore all newly added tests are **NOT RUNTIME-VERIFIED**.

GitHub Actions runs triggered by the code/test commits repeatedly completed FAILURE within approximately 2 seconds. For the latest observed Prodamus checkout run `44306613409`, job `134809710833` had:
- `runner_id: 0`;
- empty `runner_name`;
- `steps: []`;
- two check-run annotations reported, but their contents were not accessible through the available GitHub connection.

This indicates that the test steps were not available to inspect; it does not establish that the tests themselves failed. The exact Actions failure cause remains UNKNOWN. No blind rerun was initiated. Owner UA-036 remains the route to inspect the run in GitHub UI if the failure persists.

Vercel status on source/test commit `cc6f81ad0d0077878eba8a359fb3721ab5c60812` was SUCCESS at the time checked. This is not evidence of a production deployment and does not substitute for backend tests.

No production DB, `PIN_TRIAL`, real payment, Prodamus account, live webhook, Pinterest API, deployment or external service was accessed. No environment secrets were read or changed.

## 7. Remaining gates

1. Obtain an inspectable successful Prodamus checkout workflow run executing all five configured Node test files.
2. Complete owner PostgreSQL gate UA-035: guarded local disposable DB run, all 46/46 SQL tests and cleanup. Last owner evidence remains tests 1–37 PASS, test 38 FAIL, tests 39–46 NOT RUN, cleanup PASS.
3. Resolve UA-036 if GitHub continues to fail before runner allocation or with inaccessible logs.
4. Verify the actual webhook endpoint in Prodamus form settings (when SYS is blank) through the owner account; this code change cannot verify external dashboard state.
5. Do not enable live payments or invite first users until runtime, database, webhook configuration and deployment gates are green.

## 8. Assistant action chronology

1. Re-fetched current main, project passport, owner actions, documentation register, Prodamus source, billing handlers, relevant tests, workflow and migration 029/037/116–118.
2. Confirmed the notification URL was signed and submitted without HTTPS/credential validation when SYS is configured.
3. Added shared URL validation, then preflighted both payment handlers before durable idempotency reservation.
4. Added helper tests, a two-handler regression test and a source-contract test.
5. Re-fetched all changed files and inspected each source/test diff; verified the existing CI workflow already watches and executes these tests.
6. Reconciled intervening main commits, retained the separate RUB amount-field metadata correction, and checked the latest Actions job metadata and Vercel status.
7. Created this report and synchronized the project passport, owner actions and documentation register.
