# AUD-417 — payment-creation queue truncation visibility

**Date:** 2026-11-22  
**Branch:** `main`  
**Finding:** The admin payment-creation inventory queried exactly the requested `limit` and returned `count` without any truncation indicator. If more unresolved `unknown`/`creating` requests existed than the limit, the response looked like the complete queue. This can hide unresolved payment creation from an operator; it is not safe to infer that no further items exist.

## Root cause
`listPaymentCreationRequests` applied `.limit(limit)`, then built the response from those rows. Unlike the adjacent financial queue, it did not fetch one sentinel row to distinguish a complete result from a bounded prefix.

## Change
- Query `limit + 1` rows (maximum requested limit is 100, so the sentinel remains bounded at 101).
- Validate the full query envelope as before, then slice the sentinel row from the returned inventory.
- Add top-level `truncated: boolean`, set only when the extra row exists.
- Keep `count` and `items` bounded to the requested limit.
- Update the query mock to honor `.limit()` and add a regression for a limit of 1 with more than one fixture request.

## Commits
- Source: `64f2bdefe340d13daa28d6cd60d10765c26a3917`
- Regression: `ff5d92c32a5bde0d797b5984b58ebc6650e83fce`
- Test inventory: `7d8d946e3658569cbae75746ea95491c4b220300`
- Audit: this file is created in its own commit; final commit SHA recorded in PROJECT_STATE and DOCUMENTATION_REGISTER.

## Static verification
- Re-fetched source, test and inventory from `main` after publication.
- Confirmed query uses `limit + 1`, result slices to `limit`, and truncation is exposed.
- Confirmed regression asserts the sentinel query limit, bounded count/items and `truncated === true`.
- Inventory now records 13 declarations for `admin-payment-creation-requests.test.js` and 1,452 total declarations.

## Runtime boundary
Node tests were **not run by this GitHub-only session**. Owner/local command is recorded in UA-086. No runtime PASS is claimed. No production database, Prodamus, real payment or provider reconciliation was touched.

## Next
Run UA-086 locally, then continue adjacent read-only admin/payment reconciliation review. Production release remains blocked by runtime/CI acceptance and PR #96 storage migration gates.
