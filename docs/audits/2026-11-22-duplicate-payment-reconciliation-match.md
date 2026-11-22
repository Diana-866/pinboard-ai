# AUD-414 — duplicate local payment records make reconciliation ambiguous

Date: 2026-11-22  
Base: `a0c0bd5d2bcd2a58a8a54a5fde07117dd06b67bb`  
Current main after code/test/inventory: `5047f7495e0a7f9d22901d4d9f640f19d1eb86bb`

## Root cause

`listPaymentCreationRequests` built a `Map` keyed by provider order ID. Credit-purchase rows already rejected an existing key, including cross-kind collisions. Subscription rows called `Map.set` without checking the key, so two local subscription records carrying the same provider payment ID silently overwrote one another. The admin inventory could then display a seemingly valid match even though the local financial ledger was ambiguous.

## Fix

- Subscription matches now reject an already-seen provider order ID using the same fail-closed ambiguity error as credit purchases.
- Added one regression covering duplicate subscriptions and duplicate credit-purchase rows with distinct local record IDs.
- Test inventory updated from 1448 to 1449 total declarations; this file from 11 to 12.

## Commits and blobs

- Source commit: `7b7ddd4c475d0f2fa5526beeaba917687c2e9e1b`
- Test commit: `b9a9523044893b3060a44ee9dcbbc20be6ce1df2`
- Fixture correction commit: `b64d0e69a8e4d64ddaf203aed72e34a31ce4c37c`
- Inventory commit: `5047f7495e0a7f9d22901d4d9f640f19d1eb86bb`
- Source blob: `c023ecee49caf106ad33d9d2bf34ab6e31c236a8`
- Test blob: `cb51ee44ab048c567969a5c2ca8df8028910c41f`
- Inventory blob: `0c31cc8d3a060d4a466304eb1fcd774ca366eada`

## Verification

- Re-fetched current source, test and inventory from `main`.
- Static checks: duplicate guard present; regression declaration present; test file has 12 declarations; inventory records 12 for the file and 1449 total.
- Runtime Node tests: NOT RUN in this connector session. GitHub status for the inventory commit shows Vercel pending; that is not backend test evidence. No test PASS claimed.

## Safety

No production database, Prodamus, live payment, Storage, Pinterest, DNS or deployment action performed.

## Next

Run focused and full backend tests locally as recorded in UA-083. Continue reviewing payment reconciliation for duplicate/contradictory provider IDs and require runtime acceptance before release.
