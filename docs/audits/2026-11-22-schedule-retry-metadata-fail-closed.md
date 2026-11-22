# AUD-408 — Schedule retry metadata fails closed

**Date:** 2026-11-22  
**Base:** AUD-407 mainline after review-queue envelope validation  
**Scope:** `GET /schedule` retryability enrichment.

## Root cause

For failed schedules, the endpoint loads publication attempts, publication journal rows, and connected Pinterest account metadata to decide whether a retry is safe. When a successful response had malformed `data` (for example `null` with no error), `result.data || []` treated it as a confirmed empty result. The retryability classifier could then infer no prior attempt/publication/account and expose a retry action without trustworthy metadata.

## Fix

- Reused `readArrayQueryResult` for every attempts/publications/accounts batch result.
- On database errors or malformed envelopes, keep schedule rows visible but set failed rows to `retryable: false` and `retry_reason: "metadata_unavailable"`; never infer retry safety from malformed data.
- Added an HTTP regression with a malformed attempts response and valid empty publication/account responses.
- Added a source contract test requiring strict validation for all three metadata groups and forbidding `result.data || []` in the schedule route.
- Updated test inventory from 1437 to 1439 declarations.

## Commits

- Implementation: `afc394d904f082028d00ce0068414e4d73b9e1df`
- HTTP regression: `94ae91a3d5bef3b0d09536972956329ddba0c630`
- Route contract: `6978b9995c0f5327705d4ea823c1d734e21e667f`
- Inventory: `cfe386007abe41ae4c3286eccf6826be96802872`

## Publication verification

Re-fetched current main and confirmed:
- `backend/index.js` blob `acc9a535438d85c152ad5364e81851460e229e39`
- `backend/test/api-authenticated-reads.test.js` blob `9fad565ab5f7b72148d69df01602e2a8ddb6a9ed`
- `backend/test/pinterest-schedule-list-contract.test.js` blob `c03eb9069864e755fe1d1bfa31d234543396056d`
- `backend/test/test-inventory.json` blob `0a35dff4a3ef7add8899a99f3c6972d4e6daaeb6`

Static assertions: all three metadata result groups use `readArrayQueryResult`; the schedule route has no `result.data || []` fallback; malformed metadata returns the safe non-retryable schedule response. Test declarations and inventory match: 111 API reads tests, 2 schedule list contract tests, total 1439.

**Runtime:** Node tests NOT RUN in this session. Static checks are not test execution. No production DB or external provider accessed.

## Next

Run the targeted and full backend suite using UA-076 on a working local environment/runner. Continue reviewing independent release gates; do not enable retries or claim Pinterest publication safety without runtime verification.
