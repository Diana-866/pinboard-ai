# Migration 156 contract regex over-escaping and current verification status

Date: 2026-11-17

## Repository snapshot

- Repository: `Diana-866/pinboard-ai`.
- `main` HEAD at inspection: `5aee55dcf504dbb4e8ece704733681afcb4436f0` (documentation-only register update).
- Latest migration-156 code/workflow commit: `9295b7bd9ec202cb723c396bf39f5d9f061946ad`.
- Open pull requests returned by GitHub: 55.
- Current `main` combined status: Vercel failure, `Deployment rate limited — retry in 24 hours` (status updated 2026-11-17T14:19:38Z). The current documentation-only HEAD has no Actions runs or check-runs of its own.
- Latest Actions runs for migration-156 changes include `44101655410` (Persisted boards integration checks) and `44101655283` (Atomic payment fulfillment integration). Both jobs completed with failure and `steps: null`; no test step ran. This is not evidence of a SQL/application test failure.
- PR #90 remains Draft/open. Its Windows verification run `43908889550` has been queued since 2026-11-16T16:33:57Z; its job is still queued and has not been claimed. The PR branch `ci/windows-self-hosted-verification-clean` is diverged from current `main` (3 commits ahead, 1001 behind according to GitHub compare). Do not merge or update this branch blindly.

## Defect found

The migration-156 contract in `backend/test/postgres-integration-runner-contract.test.js` used four over-escaped regular expressions. In a JavaScript regex literal, the doubled backslashes changed the intended matchers:

- `r\\\\.result_pin` did not match the SQL identifier `r.result_pin`.
- `[\\\\s\\\\S]` did not act as the intended any-character matcher.
- The function-name matcher similarly failed to match the actual SQL signature.

A direct JavaScript probe against the current migration 156 source reproduced the defect: all four old matchers returned `false`; the corrected four matchers returned `true`.

## Change created

A fresh branch was created from current `main`:

- Branch: `fix/migration-156-contract-regex`
- Commit: `71573a738d71f514af742f18e40a62f556f71bd6`
- File: `backend/test/postgres-integration-runner-contract.test.js`
- New blob: `a381cd497fc199e5fcba6464c842fd5f5fc664d1`

Only the four regex literals in the migration-156 contract were corrected. The migration, SQL fixture, replay scripts, workflow, production configuration and databases were not changed.

The updated test file was fetched again from GitHub. A second JavaScript probe against the unchanged migration-156 SQL returned `true` for all four corrected matchers. The full Node contract suite was not run; this is a source-level correction and focused regex probe, not a test-suite PASS.

## Correct execution path and WSL clarification

The repository already contains a guarded native Windows PostgreSQL integration runner at `scripts/verify-integration.ps1`. The latest project instructions identify the owner's isolated local PostgreSQL 18.6 listener as PID 15220, port 55439, data directory `X:\\PinPosy-verify-pg18`, with a disposable database created and cleaned by the runner.

Therefore, WSL is **not required** to execute the current guarded PostgreSQL migration/SQL integration gate. The earlier focus on restoring WSL/Linux Runner is not the immediate blocker for migration 156. WSL or Git Bash may still be useful for separate Bash concurrency coverage, but it should not delay the native Windows PostgreSQL gate.

## Next verification gates

On a clean local checkout of branch `fix/migration-156-contract-regex`:

1. Run the three Node contract files:
   `node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js`
   The project action register currently expects 45 tests; require all tests to pass and stop on any failure.
2. Run the PowerShell Parser API against the current `scripts/verify-integration.ps1`; require zero syntax errors.
3. Only after both gates pass, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1`.
4. Require the fixture, 147 migrations 010–156, both CI inline assertions, all 46 ordered SQL tests and confirmed disposable database cleanup.

Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`. Do not bypass guards, touch production/`PIN_TRIAL`, change the persistent PostgreSQL cluster, or share credentials.

## Limits

The assistant used read-only GitHub retrieval plus a branch-only file update. It did not run Node's test runner, PowerShell, psql, PostgreSQL, Bash or GitHub Actions. It did not modify `main`, merge a PR, deploy, or touch production, Supabase, DNS, Pinterest or Prodamus settings.
