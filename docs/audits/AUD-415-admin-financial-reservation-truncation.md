# AUD-415 — Admin financial reservation queue truncation flag

**Date:** 2026-11-22  
**Base main:** `51af46261154ab228fc44b316a73082da032b74b`  
**Finding:** `getFinancialOperationsQueue` fetches `limit + 1` reservation rows to determine whether the category is truncated, then maps only the first `limit` rows. The returned `truncated.reservations` flag was calculated from the mapped array, so it could never be true after the slice. An operator could mistake a bounded list for a complete financial review queue.

## Change

- Renamed the mapped response array to `reservationItems`.
- Keep the truncation decision based on the original fetched `reservationRows` (the `limit + 1` probe).
- Response count and array remain bounded to the requested limit.
- Added regression coverage with `limit: 1`, where the fixture has two stale reservations: one item is returned and `truncated.reservations` must be true.
- Test mock now honors the query limit so the regression models the actual `limit + 1` contract.
- Test inventory updated from 1,449 to 1,450 declarations; admin financial test count 7 → 8.

## Commits

- Source: `7099c6fc313b24e05df72079ef390c79bd327acf` (blob `15a9e2a2ff92ddbcffdc04cad4b6f63b1fa51616`)
- Regression: `15d5baecfe45362060254510102b1d9c1bf29b96` (blob `e857aafd038a7f875d585b9dc0dd4c5d5c88af99`)
- Inventory: `f0c784b54002953417cbbaeaf105fed7185cfd52` (blob `d6339327f6bfca475a0ee72d3bf7d43c7fec4fdc`)

## Verification and limits

- Re-fetched source, test and inventory from `main` after publication.
- Static check: mapped output uses `reservationItems`; truncation uses the un-sliced fetched `reservationRows`; test declaration count 8 matches inventory; inventory total 1,450.
- Node runtime test was **NOT RUN** in this environment. No test pass is claimed. Owner/local focused acceptance is recorded as UA-084.
- No production database, payment provider, live payment, Storage, Pinterest, DNS or deployment was touched.

## Next

Run the focused Node test on the local checkout; continue reviewing remaining admin financial and payment reconciliation paths. This fix does not clear the existing release gates.
