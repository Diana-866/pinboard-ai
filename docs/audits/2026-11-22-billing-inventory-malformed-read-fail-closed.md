# AUD-409 — fail closed for billing inventories and schedule account recovery

Date: 2026-11-22  
Base main: `cfe386007abe41ae4c3286eccf6826be96802872`

## Finding

A static review of current `backend/index.js` found several successful-but-malformed PostgREST responses that were silently treated as empty arrays:

- `GET /admin/billing/pending-orders` used `subscriptionsResult.data || []` and `creditsResult.data || []`. A malformed response could falsely show no unresolved provider orders.
- `GET /admin/billing/webhook-exceptions` used `data || []`, potentially hiding exceptions.
- `POST /schedule/:id/reconcile-account` used `data || []` for publication attempts, publications and duplicate schedules. Missing evidence could incorrectly produce a retryable result. The active-account single-row response was also not checked for a valid matching identity.

These are operational and duplicate-publication risks: a missing or malformed result is not proof that there are no pending payments, no webhook exceptions, or no previous publication.

## Changes

- Replaced the billing list fallbacks with shared `readArrayQueryResult` validation. A malformed envelope now returns a server error instead of a false empty inventory.
- Added strict array validation for all retry metadata reads in account reconciliation.
- Validated a non-null account response as an object with the exact expected account ID; malformed/mismatched identity fails closed.
- On unavailable metadata, the route returns the schedule with `retryable: false` and `retry_reason: "metadata_unavailable"`.
- Added HTTP regressions for malformed pending-order and webhook-exception responses.
- Added a source contract regression requiring strict reconciliation metadata validation and forbidding the old `data || []` fallbacks.
- Updated the test declaration inventory from 1439 to 1442.

## Published changes

| Commit | Change |
|---|---|
| `42e4546998d50944ff2ab486c0210e2d0484f3d2` | Backend fail-closed changes |
| `e2cc97edee60e3267f07d8975c496f32ecd48233` | HTTP regressions for billing inventories |
| `dfc64df387d7a39f5ce4d84496c6c168a02a6f3f` | Schedule account-recovery contract regression |
| `5e88940e1479639824c5411251a66dae8bfbfa9b` | Test inventory update |

Current source/test blobs at publication:

- `backend/index.js`: `d98404479adffa3d5dcca09528c72b33487b02fc`
- `backend/test/api-authenticated-reads.test.js`: `3c545e069a47921aefb753293a2e4b272b4e544a`
- `backend/test/pinterest-schedule-list-contract.test.js`: `9af064c4de7231d3e35b268546f79c98ca35d9de`
- `backend/test/test-inventory.json`: `8cd88664b6882fc645153b13bbd03f96b30418e2`

## Verification boundary

- Re-fetched current source, test and inventory files from GitHub after publication.
- Static verification confirmed strict validator calls in the affected handlers, the account identity guard, the two new HTTP tests, the new contract test, and inventory total 1442 with 113 API authenticated-read tests and 3 schedule-list contract tests.
- Node runtime tests were **not executed** in this session. Static source checks do not count as runtime PASS.
- GitHub Actions jobs on recent main commits have been failing before returning any job steps; logs are unavailable (`BlobNotFound`). Vercel status was pending at the latest checked documentation commit. No CI or deployment PASS is claimed.

## Safety

No production database, production Storage, Pinterest API, Prodamus, DNS or deployment was accessed or changed. No payment was marked failed and no schedule was retried.

## Next

Run the targeted backend regressions and full backend suite on a local checkout with a working Node runner (UA-080 / UA-076). Continue reviewing remaining high-risk database read paths and payment fulfillment after runtime evidence is available.
