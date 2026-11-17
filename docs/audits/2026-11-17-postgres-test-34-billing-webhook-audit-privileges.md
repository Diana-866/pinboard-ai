# PostgreSQL integration incident — test 34 billing webhook audit privileges

**Date:** 2026-11-17  
**Repository:** `Diana-866/pinboard-ai`  
**Branch:** `main`  
**Code HEAD tested:** `1b855857c4df31b9233819e404bd697591f28acb`  
**Previous local/origin HEAD from owner log:** `948df3b9`  
**Source evidence:** owner-provided PowerShell transcript in the 2026-11-17 conversation attachment.

## Purpose

Record the exact result of the latest guarded PostgreSQL integration run. This report preserves both successful gates and the first failing test so the failure is not mistaken for a successful migration/test run.

## Actions performed and evidence

1. The owner ran `git pull --ff-only origin main` from `X:\\!PROGECT\\pinboard-ai`.
   - Git advanced `main` from `948df3b9` to `1b855857` by fast-forward.
   - Four files changed in that pull: `docs/DOCUMENTATION_REGISTER.md`, `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, and the approved-pin fixture audit report.
2. `git status --short` returned no entries before verification.
3. `git rev-parse HEAD` returned `1b855857c4df31b9233819e404bd697591f28acb`.
4. The owner ran:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
   ```
5. The runner verified a clean `main` checkout at the SHA above and identified the disposable local PostgreSQL 18.6 instance:
   - listener PID: `15220`
   - endpoint: `127.0.0.1:55439`
   - data directory: `X:\\PinPosy-verify-pg18`
   - server identity: `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`
6. The runner created disposable database `pinposy_sqlint_9f1cf3d0c7f74745`, applied the CI legacy/upgrade fixture, applied **147 migrations 010–156**, and passed both CI inline assertions.
7. Ordered SQL integration tests **1–33 passed**. Test **34/46**, `postgres-integration.sql`, failed at line 965 (PL/pgSQL assertion at line 940) with:
   ```
   ERROR: billing webhook audit table privileges are too broad or insufficient
   ```
8. The runner then terminated connections and dropped only the disposable database. The transcript confirms:
   - `DROP DATABASE`
   - `Removed disposable database pinposy_sqlint_9f1cf3d0c7f74745.`
9. The script exited with failure (psql exit code 3; PowerShell runner reported PostgreSQL integration runner failed).

## Result

**Overall result: FAIL.**

- Migration application: completed for migrations 010–156 in the disposable database.
- CI inline assertions: 2/2 passed.
- Ordered SQL tests: 33 passed before the first failure; test 34 failed.
- Tests 35–46: **NOT RUN** because the runner stopped on the first failure.
- Disposable database cleanup: confirmed by the transcript.
- Production database, `PIN_TRIAL`, live data, and production services: no evidence of access or modification in this run.

## Failure interpretation — not yet diagnosed

The error text identifies a failed assertion about privileges on the billing webhook audit table. It does **not** by itself establish whether the grants are too broad, insufficient, or whether the test's expected role matrix is stale. No production migration or test change should be made until the assertion around `backend/test/postgres-integration.sql:940–965`, the relevant table definition/migration, and the focused privilege integration test are inspected together.

The focused test `billing-webhook-audit-privileges.integration.sql` appears earlier in the transcript and completed without an error, but this does not prove the broader assertion at test 34 is redundant or incorrect. The mismatch must be investigated, not bypassed.

## Next investigation

1. Re-read current `main`, this report, `docs/PROJECT_STATE.md`, and `docs/USER_ACTIONS.md` before acting.
2. Inspect the exact assertion at `backend/test/postgres-integration.sql:940–965`.
3. Inspect the billing webhook audit table's active migration definition, RLS/security model, and grants/revokes, then compare them with `backend/test/billing-webhook-audit-privileges.integration.sql`.
4. Determine whether the implementation or the broad integration assertion is wrong. Preserve the security intent; do not weaken privileges merely to make the test pass.
5. Make the smallest justified change, add/adjust a regression assertion if required, and document the rationale before rerunning.
6. Run the narrow relevant SQL test first, then the guarded full runner only after all required pre-gates pass. Stop at the first failure and preserve full output.

## Safety and provenance

- This report records only actions evidenced by the supplied transcript.
- No passwords, tokens, environment files, or secret values are recorded.
- Do not stop/reconfigure PostgreSQL PID 15220 or alter its data directory as part of this incident investigation.
- Do not connect to production or `PIN_TRIAL`; use only the disposable integration runner.
- Do not mark the SQL integration suite complete until all 46 ordered tests pass and disposable-database cleanup is confirmed.
