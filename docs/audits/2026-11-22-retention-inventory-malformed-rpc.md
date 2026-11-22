# AUD-411 — retention candidate RPC malformed response

Date: 2026-11-22  
Base: main after AUD-410 inventory commit `0223cb5eec423007fc9c6284f9c5dbd20d6b6d4c`

## Finding

The administrator-only read-only endpoint `GET /admin/storage/retention-candidates` called `list_pin_image_retention_candidates` and returned `data || []`. The SQL function is `RETURNS TABLE`, so Supabase RPC data is an array. A malformed successful response with null/non-array data could be reported as "no retention candidates", concealing cleanup backlog and falsely suggesting the inventory was checked.

## Fix

- Replaced the empty-array fallback with shared `readArrayQueryResult({ data, error })`.
- Malformed RPC data now returns HTTP 502 and the route does not claim an empty inventory.
- Added HTTP regression asserting malformed response returns 502, no `candidates` array, and no mutation requests.
- Updated inventory 1444 → 1445 (API authenticated-read declarations 114 → 115).

## Commits and blobs

- Route fix: `f7d6ade5601db604b1eb7dfc778aa21769f2bca9`
- Regression: `1d78395fb5c0a542e3146ee2971edf0fd7d4edd6`
- Inventory: `c8f0835a5907863af4f9481c765c4c7a16b7d499`
- `backend/index.js` blob: `a065f4743d0a510e219c8dfcc1f86849d40ffffa`
- `backend/test/api-authenticated-reads.test.js` blob: `0a5b6b01835c1edf004dd86f67232fd8d8a0a8ff`
- `backend/test/test-inventory.json` blob: `f4c901494fee1135415b2eaaf5444119bfbf995d`

## Verification

- Re-fetched changed source/test/inventory from GitHub.
- Static check confirmed route uses shared array validator and the test declaration count/inventory are synchronized.
- Node tests NOT RUN. Actions runner failures and Vercel pending are tracked in the working-period closeout; no runtime/deployment PASS claimed.

## Safety

Read-only code change only. No production DB, Storage objects, cleanup RPC, Pinterest, payments, DNS or deployment was invoked.

## Next

Run UA-081 plus focused storage route tests and full backend tests on a local runner. Continue independent fail-closed review.
