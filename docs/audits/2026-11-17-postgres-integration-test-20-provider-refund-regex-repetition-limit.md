# PostgreSQL integration test 20/46: PostgreSQL regex repetition limit and runner-contract corrections

**Date:** 2026-11-17  
**Repository:** `Diana-866/pinboard-ai`  
**Branch:** `main`  
**Owner's tested source HEAD:** `0b56648d04e43c87fb656a59dc1e21411a5b877f`  
**Assistant's final source HEAD before documentation:** `061a1148947c1770172812d6a1d3b5d2829de438`  
**Status:** source correction published; runtime verification pending; PostgreSQL integration NOT PASSED.

## 1. Owner-provided evidence

The owner supplied the complete local transcript:

- `git status --short` returned no changes.
- Node command:
  `node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js`
  returned 39 tests, 37 pass, 2 fail.
- Failure A: `upgrade fixture preserves every canonical baseline column except fields introduced by later migrations`; assertion `table users must exist`. The helper dynamically built a RegExp with over-escaped literal delimiters, so it failed to recognize a real `CREATE TABLE public.users` declaration.
- Failure B: `Linux replay rejects incomplete or out-of-range migration sequences`; the test still expected `version<=148` and an old migration count, while the checked-in Linux replay script already required 010–150 (141 files).
- PowerShell Parser API returned `PowerShell Parser PASS: 0 syntax errors`.
- The guarded runner verified clean main at `0b56648d04e43c87fb656a59dc1e21411a5b877f`, the expected PostgreSQL listener/server identity, and created a disposable database.
- CI legacy/upgrade fixture passed; all 141 migrations 010–150 applied; both CI inline assertions passed.
- SQL integration tests 1–19/46 passed. Test 20/46, `provider-refund-operator-actions.integration.sql`, failed with PostgreSQL `invalid repetition count(s)` in `_admin_record_provider_refund_action(...)`, at PL/pgSQL line 84.
- Cleanup succeeded: zero remaining sessions, disposable database dropped and explicit removal confirmed. Tests 21–46 did not run.

No password or secret was included in the evidence.

## 2. Root cause

Historical migration `078_operator_action_journal.sql` introduced the evidence-reference regex `{7,499}` in two places:

1. CHECK constraint `provider_refund_operator_actions_shape_check`;
2. PL/pgSQL validation in `public._admin_record_provider_refund_action(...)`.

PostgreSQL's ARE regex engine limits a finite repetition upper bound to 255. The bound 499 is invalid, so the reconciliation RPC fails while evaluating the pattern. The schema also caps the evidence string length separately at 500 characters; the regex does not need a finite upper bound. The safe pattern is `{7,}`, with the existing length check preserving the 500-character maximum.

Migration 078 is historical and was not edited.

## 3. Source changes published

| Path | Change |
|---|---|
| `db/migrations/151_fix_provider_refund_evidence_regex_repetition_limit.sql` | New atomic additive migration. Replaces the CHECK constraint with PostgreSQL-safe `{7,}`; obtains the current function definition with `pg_get_functiondef`, replaces exactly `{7,499}` with `{7,}`, and aborts if the expected legacy token is absent. |
| `backend/test/postgres-integration-runner-contract.test.js` | Corrected the dynamic RegExp escaping in the baseline-column helper; advanced the CI migration-chain assertion to 010–151 (142 files); added a static contract for migration 151. |
| `backend/test/verify-script-migration-chain.test.js` | Updated Linux and Windows replay contract expectations to the current 010–151 / 142-file chain. |
| `backend/test/db-migration-chain.test.js` | Canonical numbered migration chain now includes 151. |
| `scripts/verify.sh` | Linux replay now requires contiguous 010–151, exactly 142 files. |
| `scripts/verify.ps1` | Windows replay now requires contiguous 010–151, exactly 142 files; summary labels updated. |
| `scripts/verify-integration.ps1` | Guarded Windows runner now discovers/applies migrations 010–151, exactly 142 files. |
| `.github/workflows/atomic-payment-integration.yml` | CI applies migration 151 after migration 150. |

Migration 078 remains unchanged. No production database was accessed or modified by the assistant.

## 4. Verification and limitations

- GitHub source updates were published sequentially and returned commits/blobs.
- Source content was re-fetched after the initial writes to inspect migration 151 and the updated contract assertions.
- The assistant did **not** execute Node, PowerShell, psql, PostgreSQL, or the SQL integration suite. The owner transcript is the only runtime evidence.
- Migration 151 has not yet been applied by the owner. Its SQL correctness and the full test-20 behavior remain unverified at runtime.
- Node suite's 2 contract failures were diagnosed and corrected in source, but the corrected suite has not been rerun.
- PowerShell Parser PASS applies to the owner's earlier local source; `scripts/verify-integration.ps1` was subsequently advanced to migration 151, so Parser must be rerun.
- SQL integration remains **NOT PASSED**. Tests 21–46 are unexecuted.

## 5. Next owner gate

1. Synchronize clean `main` and confirm `HEAD == origin/main`.
2. Run the Node contract/migration/replay tests listed in `docs/USER_ACTIONS.md`. Stop on any failure.
3. Run PowerShell Parser API against the updated `scripts/verify-integration.ps1`. Stop on any syntax error.
4. Only after both gates pass, run the unchanged guarded PostgreSQL integration runner.
5. Stop at the first SQL failure and provide the full output including cleanup. SQL PASS requires fixture, all 142 migrations 010–151, both inline assertions, all 46 ordered SQL tests, and successful disposable-database cleanup.

Do not bypass runner guards, alter the target port/PID/data directory, stop PID 15220, modify `X:\PinPosy-verify-pg18`, or use production/PIN_TRIAL.

## 6. Assistant action log

1. Accepted and parsed the complete owner transcript; classified Node failures, Parser result, SQL test 20 failure and cleanup independently.
2. Fetched current GitHub main and verified HEAD `0b56648...`.
3. Fetched migration 078 and confirmed both invalid finite regex bounds; fetched the failing SQL integration test and runner/CI/migration-chain sources.
4. Created additive migration 151; retained migration 078 unchanged.
5. Corrected the Node baseline-column RegExp helper and stale Linux replay-contract expectations.
6. Advanced canonical migration tests, Linux/Windows replay scripts, guarded Windows runner and CI workflow to migration 151.
7. Created this audit, updated project state and owner action log, and updated the documentation register last.
8. Re-fetched changed source and documentation files to verify final blob SHAs.

