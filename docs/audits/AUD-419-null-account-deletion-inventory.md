# AUD-419 — Reject null account-deletion inventory lists

**Date:** 2026-11-22  
**Base:** `f3b89191493cc2ccd8d64bba77dbdd49d14faf2d`  
**Scope:** read-only account-deletion admin inventory; no account data or production mutation.

## Finding

`getAccountDeletionInventory` checked the oldest-pending and attention-job query results only when the returned `data` was non-null. A successful but malformed `{ data: null, error: null }` response therefore bypassed validation:

- a null oldest-pending result was interpreted as no oldest request;
- a null attention-job result was converted by `(needingAttention || [])` into an empty queue.

This could hide pending deletion work or blocked/retrying/running jobs from an operator.

## Fix

- Require both successful list queries to return arrays, including the valid empty-array case.
- Remove null-to-empty fallbacks after validation.
- Update the test database mock to preserve explicitly configured null results rather than silently replacing them with `[]`.
- Add a regression covering null for both query stages.
- Update the inventory from 1,454 to 1,455 declarations; account-deletion inventory tests 9→10.

## Commits and blobs

- Source commit: `07acd29fdcf0a9b6de493ac57185f286bc325670`; blob `ab6347d8dd5477d1f8d9f91d68086e6e0b2ac451`.
- Regression commit: `8f82af5141e4941a833ffd0e127149eec2c29faa`; blob `5b917d01bab1325ff840ca4551af9ac984d0b78d`.
- Inventory commit: `7e0de2be65baceb12bed3a851075da7a1477951f`; blob `014b2f9a29c076add50812aab242d0bc13b7b923`.

## Verification

- Re-fetched source, test and inventory from `main`.
- Static checks confirmed strict array validation for both query stages and no null-to-empty fallback.
- Regression declaration exists; actual declaration count is 10 and matches inventory; total inventory is 1,455.
- **Runtime tests NOT RUN** in this connector environment. Prior Actions runs failed before steps due runner allocation; no test PASS is claimed. UA-088 records owner/local acceptance.
- No production database, deletion job, account, provider, storage, DNS or deployment was touched.

## Next

Run the focused admin inventory and test-inventory tests, then the full backend suite from UA-088 on a local Node 22 checkout. Continue independent admin/read-path review after fresh HEAD and documentation checks.


## Subsequent main update — AUD-420 (2026-11-22)

After AUD-419, a follow-up commit added bounded attention-queue truncation reporting and strict row validation. The deletion inventory test file grew from 10 to 12 declarations, and the total inventory from 1,455 to 1,457 at AUD-420. The current main inventory is 1,458 after AUD-421 added one admin-access regression. See `docs/audits/AUD-420-account-deletion-inventory-truncation.md` for that independent change. The original AUD-419 commit-level counts above remain historical and are not the current main totals.
