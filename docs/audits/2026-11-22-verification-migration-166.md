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
- GitHub re-fetch confirmed the published diff. Current source/test blobs: `scripts/verify.sh` `ae05d6f5075091475ade646b9c3eaafd9ded899e`; `scripts/verify.ps1` `d4f447d08c92fcbc6585103867d691d7a749e881`; `backend/test/verify-script-migration-chain.test.js` `03a9fba19b7b65096e9d142106f6cc349568de29`.
- Node tests and PostgreSQL replay were **not run** in this connector-only environment.
- No production database was connected; the script remains explicitly limited to local disposable PostgreSQL.

## Release boundary

Runtime remains NOT VERIFIED until a local `npm test` and `scripts/verify.ps1 -MigrationsOnly` (or Linux equivalent) execute successfully. GitHub Actions runner allocation is currently failing before any steps start. Owner action UA-077 records the safe local migration replay.

## Post-publication review correction

Static review of commit `4ff3b3509d103ae27d945c1faf7bb2e289112428` caught a double-escaped JavaScript regex in the newly added inventory test. It would have matched a literal backslash sequence instead of migration prefixes. Corrected to `/^\d{3}_.+\.sql$/` in the follow-up commit. This correction was made before any claim of runtime PASS; Node/PostgreSQL tests remain NOT RUN.


## Complete closeout receipt (current main reconciliation)

- AUD-404 source: `4ff3b3509d103ae27d945c1faf7bb2e289112428`; test regex correction: `e02b16f3d1e0a2625878a172f49c9379295cb7b2`.
- AUD-405 Windows diagnostic correction: script `d1cdf597e5568951eabbd57f3552e9b984cf29db`, regression `7a57d1aa16b9aea8971e1093675bc817b355b30a`, audit `567b852ede0141f003b6e1a4b70185b6bf9e0d71`.
- Final current blobs: verify.sh `ae05d6f5075091475ade646b9c3eaafd9ded899e`; verify.ps1 `d4f447d08c92fcbc6585103867d691d7a749e881`; migration-chain test `03a9fba19b7b65096e9d142106f6cc349568de29`.
- GitHub Actions runs `45031148970` backend/frontend jobs `137234810601`/`137234810203`, `45031148954` postgres job `137234810090`, and `45031140844` frontend/backend jobs `137234784041`/`137234784261`; all `runner_id=0`, `steps=[]`. Runtime not executed.
- Vercel status `success` on documentation HEAD `6bba725ff4e60ba5163da210ad49f6e8a200eec3`; not evidence of production deployment.
- PR #96 comment `7080314663` records that main fixed migration sequence and asks PR to reconcile; PR remains open/unmerged.
- UA-077 / UA-078 are still owner-side local acceptance. No production DB or remote DB replay was run.
