# AUD-412 — financial reconciliation and credit history fail closed

Date: 2026-11-22  
Base: main after AUD-411 inventory commit `c8f0835a5907863af4f9481c765c4c7a16b7d499`

## Findings

Review of financial operations and customer credit history found remaining successful-but-malformed database envelopes being converted to empty arrays:

- `adminFinancialOperations.getFinancialOperationsQueue()` treated generation, regeneration, credit-reservation, generation-task and reservation-to-request matching reads as empty when `data` was absent. That could conceal unresolved provider/refund work or active credit reservations in the administrator reconciliation queue.
- `creditsBilling.listUserCreditPurchases()` returned `data || []`, which could show a customer's payment history as empty when the database result was malformed.

These paths are financially sensitive: incomplete evidence must not be used to infer that no unsettled operation or purchase exists.

## Changes

- Applied shared `readArrayQueryResult` to every array query in financial reconciliation: three primary inventories, task journal batches and both secondary request-match reads.
- `truncated` flags now derive from validated arrays, not unchecked response data.
- Applied the shared validator to credit purchase history.
- Added reconciliation regression covering six query positions: generation, regeneration, reservations, tasks, secondary generation matches and secondary regeneration matches. Each malformed response must reject with HTTP 502.
- Added customer HTTP regression requiring malformed credit purchase history to return 502 before balance derivation.
- Updated inventory 1445 → 1447 (admin financial operations 6 → 7; API authenticated-read 115 → 116).

## Commits and blobs

- Financial reconciliation implementation: `0958b429a9d559ee621dea48c6360afe7b2c4251`
- Reconciliation regressions: `78698054d968483de3006d1cfbed315854eb33a0`
- Credit history implementation: `d08d535056b611b38133883f4131cafed7174866`
- Credit history regression: `b31b1f4acc184cd889fcb1d86550f1e7dcc44148`
- Inventory: `19c883abb7811fc0ba7307fc99b267a5e3a73e95`
- `backend/adminFinancialOperations.js` blob: `a6359ee7e91bb695c5aa6fabc692bc4d93513b27`
- `backend/creditsBilling.js` blob: `24bca345435b20a17e8cb5f0796eca890d6f6d98`
- `backend/test/admin-financial-operations.test.js` blob: `d44821f16951e63d653c6ab6d528d5151e42e1ff`
- `backend/test/api-authenticated-reads.test.js` blob: `6f53d93ad39b9c8b4437fca20f26dd425a8063c6`
- `backend/test/test-inventory.json` blob: `38601e89955dfd518eb9755ee8f716beac4c78d9`

## Verification

- Re-fetched source/tests/inventory from GitHub after publication.
- Static checks confirmed no `data || []` fallback remains in the two affected modules, strict validators are present, new regression declarations exist and inventory matches 1447.
- Node tests NOT RUN. GitHub Actions has failed before test steps due runner allocation; no runtime PASS claimed.

## Safety

No production database, provider, Storage, email provider, Pinterest, DNS or deployment touched.

## Next

Runtime acceptance via UA-081/UA-080 on a local runner; continue review of remaining user financial history and administrative read paths.
