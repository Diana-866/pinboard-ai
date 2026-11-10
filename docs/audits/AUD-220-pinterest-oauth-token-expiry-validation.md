# AUD-220 — Validate Pinterest OAuth token expiry before persistence

## Finding
The OAuth callback converted a truthy `expires_in` value directly with `Number(...)` and `Date.toISOString()`. A malformed, non-finite, zero, negative, or out-of-range value could throw during callback processing. The code also treated falsy values as if expiry were absent, conflating an omitted optional field with an explicitly invalid value.

## Change
- Added `backend/pinterestOAuth.js` with a pure `getPinterestTokenExpiresAt` normalizer.
- Missing/null/blank expiry remains `null` for compatibility with providers that omit optional expiry metadata.
- A supplied value must be finite, positive, and representable as a valid JavaScript date; otherwise normalization fails before the OAuth account commit RPC.
- The callback returns a controlled HTTP 502 diagnostic internally and does not persist credentials with an invalid expiry.
- Added `backend/test/pinterest-oauth.test.js` for omitted, numeric, string, malformed, non-finite, zero, negative, out-of-range, and invalid-clock cases.

## User impact
A malformed Pinterest token response can no longer create a broken expiry timestamp or reach the account persistence step. A missing optional expiry remains supported and is not falsely classified as expired.

## Verification
Source and test files were reviewed after writing. Node tests, full backend test suite, lint, and deployment build were not run in this environment. No Pinterest API calls, production database changes, deployments, or PR merge were performed.
