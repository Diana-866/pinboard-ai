# PostgreSQL Node contract gate — upgrade fixture regex and migration count

Date: 2026-11-17  
Repository: `Diana-866/pinboard-ai`, branch `main`  
Owner checkout: `0fc877a0aa5dd47d565f77b9873fc4c62edbf807` (confirmed equal to `origin/main`; clean worktree)

## 1. Owner-provided evidence

The owner synchronized successfully from `7662d856` to `0fc877a0aa5dd47d565f77b9873fc4c62edbf807`. Both `git status --short` checks were empty and `git rev-parse HEAD` equaled `git rev-parse origin/main`.

The requested Node gate ran:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Result: **42 tests, 39 passed, 3 failed**. Failures:

1. `upgrade fixture includes the canonical users.is_admin baseline column`: `upgrade fixture users table must exist`, assertion at line 44.
2. `CI migration list remains the complete contiguous 010-152 chain`: actual migration count 144, stale expected count 143.
3. `upgrade fixture preserves every canonical baseline column except fields introduced by later migrations`: dynamically constructed RegExp threw `Unmatched ')'`.

The owner stopped at this Node gate. No PowerShell Parser or PostgreSQL runner was executed after these failures. No database or persistent PostgreSQL service was touched in this run.

## 2. Diagnosis

All three failures were defects in the Node contract source, not evidence of a production SQL regression.

### 2.1 Users fixture table was present; the matcher was over-escaped

The canonical fixture `backend/test/postgres-integration-upgrade-fixture.sql` contains `create table public.users (` and the `is_admin boolean default false` column. The two direct JavaScript regex literals in the contract encoded `[\\s\\S]` and `\\n` with an extra escaping layer. The resulting regex searched for literal backslashes rather than matching arbitrary characters/newlines, so it failed to capture an existing table.

The literals were corrected to use the normal regex forms `[\s\S]` and `\n`.

### 2.2 Migration count was stale

The active contiguous chain is `010–153`, which contains **144** migrations. The test title, expected length, and expected sequence still described `010–152` / 143 migrations. The source contract was updated to assert the complete `010–153` chain and count 144.

### 2.3 Dynamic RegExp helper

The dynamic `new RegExp(...)` helper must receive a JavaScript string containing regex escapes. Its source representation now uses the correct two-backslash JavaScript string escapes (for example, `public\\.`, `[\\s\\S]`, and `\\n`), producing a valid regular expression at runtime. The previous malformed string over-escaped these sequences and produced an unmatched parenthesis.

## 3. Published correction

Only `backend/test/postgres-integration-runner-contract.test.js` was changed. No production migration, SQL fixture, runner, CI workflow, or database was changed.

- Intermediate update corrected the migration count/title: commit `3cb658510bc54dca040239fb15ac85ece3e6d017`, subsequently superseded.
- Final update corrected both direct users-table regex literals while retaining the corrected 144-migration assertion: commit `3c2d82bfafef40d16d6ae6c3eb7f4c7d7292e698`, final blob `2f0e54ad47ffd05cfca500568a3f962cb6af6c93`.

The first automated exact-string replacement did not match three lines; the successful write changed the migration count/title only. The file was then re-fetched, the two remaining lines were located by their exact line positions, corrected, and published in the final commit above. This authoring sequence is retained for traceability.

## 4. Source verification and limits

After publication, the final contract file was re-fetched from GitHub. Static inspection confirmed:
- Both users-table regex literals now use `([\s\S]*?)\n` rather than the over-escaped form.
- The dynamic `RegExp` helper uses valid JavaScript string escaping.
- The CI migration-list contract title and expected sequence both cover `010–153` (144 entries).

The assistant did not execute Node, PowerShell, psql, PostgreSQL, or CI. The corrected Node source is **not runtime-verified**. No claim is made that the three tests or the aggregate Node gate now pass.

## 5. Required owner sequence

1. Synchronize to the latest clean `origin/main` and verify `HEAD` equals `origin/main`.
2. Re-run the same three Node gates. Require **42/42 PASS**. On any failure, stop and provide the complete output.
3. Only after Node PASS, run the PowerShell Parser API check and require zero syntax errors.
4. Only after both gates pass, run the guarded PostgreSQL integration runner.
5. SQL integration PASS still requires the fixture, all 144 migrations `010–153`, both CI inline assertions, all 46 ordered SQL tests, and confirmed disposable-database cleanup.

Do not bypass runner guards, alter PID 15220 / port 55439 / data directory, touch `X:\\PinPosy-verify-pg18`, use production/PIN_TRIAL, or share passwords, tokens, or `.env` contents.
