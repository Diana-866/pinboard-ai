# AUD-166 — Payment order identifier hardening

## Finding

Both subscription and credit-pack checkout order IDs used a timestamp plus a short suffix derived from `Math.random()`. The identifier is not an authorization secret, but it is the provider correlation key and is subject to a unique constraint in the database. A weak/randomness source with a short suffix creates avoidable collision risk when multiple checkouts are created in the same millisecond or traffic grows.

## Change

- Added `backend/paymentOrderId.js`.
- Both `backend/billing.js` and `backend/creditsBilling.js` now use the shared generator.
- The suffix is 12 bytes (96 bits) from Node's operating-system-backed cryptographic random generator.
- Prefix and product identifiers are validated before construction, preserving existing Prodamus order prefixes (`pp-` for subscriptions and `ppc-` for credit packs).
- Added `backend/test/payment-order-id.test.js` for output shape, same-millisecond uniqueness sampling, and invalid inputs.

## User-visible effect

Checkout behavior and displayed prices are unchanged. New payment attempts receive stronger, collision-resistant order identifiers, reducing the chance that two purchases could conflict at the provider/database correlation layer.

## Verification

The isolated Node test file passed: 3 tests, 0 failures. This is a focused helper test, not the complete backend test suite. No payment provider requests, database changes, production deployments, or migrations were performed.
