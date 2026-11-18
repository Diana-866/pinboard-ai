# Account deletion exact-count fail-closed correction

Date: 2026-11-18
Repository: `Diana-866/pinboard-ai`, branch: `main`

## Root cause

The account-deletion preflight used `Number(count || 0)` for Supabase exact-count responses in three places: direct user-owned tables, email-outbox rows, and pins associated with boards. A malformed response with `count: null` or a missing count and no transport error was silently converted to zero. That can understate the inventory and incorrectly report a successful preflight. Exact count queries return numeric zero for an empty result; null/missing/non-integer values are not evidence of zero.

## Change

- Added `normalizeExactCount(count, table)`, which accepts only non-negative safe integers and throws `invalid_exact_count` for null, missing, string, fractional, negative, infinite, or unsafe values.
- Applied the same strict normalization to all three count paths: direct owned tables, email_outbox and pins.
- Exported the pure normalizer for focused regression coverage.
- Added tests proving valid 0 and positive counts pass and malformed values fail closed. No SQL or production data behavior was changed.

## Verification

- Re-fetched the committed source and test files from GitHub.
- Static scan: `0` permissive `Number(count || 0)` fallbacks remain; `4` strict count-normalization call sites are present; regression file contains `2` assertions/guards referencing `invalid_exact_count`.
- Test blob SHA: `ca4786fe629e75662715027c100664bfaa40254b`.
- Source blob SHA: `3b045acd8600f372a712f0792760eb3145ea1e87`.
- Runtime `node --test backend/test/account-deletion-worker.test.js` was NOT run in this environment. Disposable PostgreSQL integration and worker staging acceptance remain NOT VERIFIED.
- No production DB, user data, account deletion, Storage object, external provider, or worker enablement was touched.

## Follow-up

Run the focused worker test and disposable PostgreSQL account-deletion queue tests from a clean checkout. Keep the worker disabled until runtime/staging acceptance is evidenced.
