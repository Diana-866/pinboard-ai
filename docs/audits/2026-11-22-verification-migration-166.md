# AUD-404 — verification scripts rejected the current migration 166 chain

**Date:** 2026-11-22  
**Base main:** `e76f9d8704282800faab8306efdfc10ed07b1d3b`

## Evidence and root cause

The current repository tree was inspected directly. It contains 157 active migration files, a contiguous sequence from `010_atomic_credit_ledger.sql` through `166_user_terms_consent.sql`, with no missing numeric prefix.

Despite that, the Linux `scripts/verify.sh` expected only `010–165` (152 files), and the Windows `scripts/verify.ps1` expected `010–161` (also 152 files). Thus the local disposable-PostgreSQL verification gate refused the valid current schema before replaying migrations. The Linux error text also reported an incorrect historical count.

## Changes

- `scripts/verify.sh`: expected sequence now ends at 166, requires 157 files, and prints the correct range/count.
- `scripts/verify.ps1`: expected sequence now ends at 166 and requires 157 files.
- `backend/test/verify-script-migration-chain.test.js`: updated Linux/Windows contract assertions and added a direct check that the repository's active migration inventory is exactly contiguous 010–166 (157 files).

This only updates disposable local verification logic. No SQL migration was changed or applied.

## Verification

- GitHub tree inventory: 157 active files, numeric range 10–166, no gaps; migration 166 exists.
- Source/test diff will be re-fetched after publication.
- Node tests and PostgreSQL replay were **not run** in this connector-only environment.
- No production database was connected; the script remains explicitly limited to local disposable PostgreSQL.

## Release boundary

Runtime remains NOT VERIFIED until a local `npm test` and `scripts/verify.ps1 -MigrationsOnly` (or Linux equivalent) execute successfully. GitHub Actions runner allocation is currently failing before any steps start. Owner action UA-077 records the safe local migration replay.

## Post-publication review correction

Static review of commit `4ff3b3509d103ae27d945c1faf7bb2e289112428` caught a double-escaped JavaScript regex in the newly added inventory test. It would have matched a literal backslash sequence instead of migration prefixes. Corrected to `/^\d{3}_.+\.sql$/` in the follow-up commit. This correction was made before any claim of runtime PASS; Node/PostgreSQL tests remain NOT RUN.

