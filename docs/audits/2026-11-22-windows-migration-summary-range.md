# AUD-405 — stale Windows migration replay summary

**Date:** 2026-11-22  
**Base:** `4ff3b3509d103ae27d945c1faf7bb2e289112428`

## Finding

After AUD-404 extended the Windows migration preflight to the contiguous active chain `010–166` (157 files), its success and failure summary strings still stated `001 + 010-161`. The replay validation itself already required 157 files and the expected `010..166` sequence, so this was a stale operator-facing diagnostic, not a migration-selection defect.

## Fix

- `scripts/verify.ps1`: both migration replay summary messages now state `001 + 010-166`.
- `backend/test/verify-script-migration-chain.test.js`: added a regression requiring the current summary range and rejecting the stale `010-161` range.

## Publication evidence

- Windows script commit: `d1cdf597e5568951eabbd57f3552e9b984cf29db`; blob `d4f447d08c92fcbc6585103867d691d7a749e881`.
- Regression test commit: `7a57d1aa16b9aea8971e1093675bc817b355b30a`; blob `03a9fba19b7b65096e9d142106f6cc349568de29`.

## Verification boundary

The exact changed files were published to `main`; this connector session did not execute Node tests or PostgreSQL replay. Static publication is not runtime PASS. No production database, Supabase, or external payment service was accessed. Owner acceptance remains UA-077: run the migration-only replay on a disposable local PostgreSQL instance and retain the complete result.

## Next step

Continue reviewing the latest verification workflow/job outcome and the next unresolved release gate in `docs/PROJECT_STATE.md`; do not mark runtime acceptance complete until an actual test run succeeds.

## Current main closeout

Current `main` HEAD before documentation closeout: `6bba725ff4e60ba5163da210ad49f6e8a200eec3`. Final test blob includes both AUD-404 inventory regression and AUD-405 stale-summary guard: `03a9fba19b7b65096e9d142106f6cc349568de29`. GitHub Actions remain runner allocation failures (zero steps); Vercel success is a status check only, not production deployment evidence. UA-077/078 remain pending.
