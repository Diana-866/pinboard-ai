# PostgreSQL integration test 38/46 — legacy Pinterest publication fixture status

Date: 2026-11-17

## Owner-provided runtime evidence

The owner supplied the complete output of the guarded command:

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1`

- Runner verified clean synchronized `main` at `62b2a859c8516fe98b174072d3642018d2dff419`.
- Verified PostgreSQL listener PID `15220`, data directory `X:\\PinPosy-verify-pg18`, and server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- The temporary role password was entered locally at the hidden prompt; no password was provided to the assistant or recorded.
- Disposable database: `pinposy_sqlint_eb01275b9a8246a4`.
- CI upgrade fixture passed.
- All **147 migrations 010–156 passed**.
- Both CI inline assertions passed.
- SQL integration tests **1–37/46 passed**, including corrected test 35 `pinterest-oauth.integration.sql`.
- Test **38/46**, `pinterest-account-publication.integration.sql`, failed at line 895 with:
  `unmapped legacy publication history was allowed to retry: {"status": "pin_not_approved"}`.
- Tests 39–46 were not run.
- Cleanup succeeded: no remaining sessions were reported, `DROP DATABASE` completed, and the runner printed `Removed disposable database pinposy_sqlint_eb01275b9a8246a4`.

The output includes non-fatal PostgreSQL NOTICE messages during idempotent migration operations. No migration stopped the run; the first fatal SQL error was test 38. Overall SQL integration remains **NOT PASSED**.

## Source investigation

Inspected current GitHub sources at the synchronized owner revision:

- `backend/test/pinterest-account-publication.integration.sql`, initial blob `24412e01093ae1020047639d787ef914747e4748`.
- `db/migrations/148_atomic_pin_publication_status_fencing.sql`, blob `5bdad254de1d4bb19d68bd9618561da55216f9b8`.
- `backend/test/postgres-integration-runner-contract.test.js`, initial blob `7abd35fbe62c6db075041fbba3bd76b465057b90`.
- Migrations 149–156 were also read to check for a later replacement of `begin_pinterest_publish_v2`; none of those migrations redefines that function.

The failing SQL test creates `v_legacy_pin` with status `pending`, inserts a legacy `pinterest_publish_attempts` row without a `pinterest_account_id`, and calls `begin_pinterest_publish_v2`. It expects `unknown` from the legacy-history fence.

The active function in migration 148 checks the pin status before inspecting legacy publication history. If the pin is not `approved`, it immediately returns `{"status":"pin_not_approved"}`. Only after that guard does it check for legacy publication/publication-attempt rows with a null account ID and return `unknown` with a manual-reconciliation message.

Therefore the owner-observed result is consistent with the current function and fixture: the test used a pending pin, so it never reached the legacy-history branch. The response `pin_not_approved` itself does not allow a publication attempt; it shows that the earlier approval guard short-circuited the intended test. This run does not establish a production publication defect.

## Changes published

1. Updated only `backend/test/pinterest-account-publication.integration.sql`:
   - changed the legacy fixture pin status from `pending` to `approved`, satisfying the function's prerequisite so the test exercises the later unmapped-history guard;
   - changed the failure text from the inaccurate claim that retry was allowed to a precise message that the manual-reconciliation fence was not reached.
   - Commit: `49ffed74ec6b16d2f875a99b0f300445d860592c`.
   - Blob: `5179ca814d7cbe84a45569d3ae8494de959ae43d`.

2. Added a Node source-contract test in `backend/test/postgres-integration-runner-contract.test.js`:
   - asserts the legacy fixture uses an approved pin;
   - asserts the SQL test expects the manual-reconciliation fence;
   - asserts migration 148 places the approval guard before the legacy-history guard, documenting why the fixture must be approved.
   - Commit: `2b2b14407cb7cfba68375d19aba298a015a4d2a8`.
   - Blob: `818a136572644af87ec6b2cfb08dcba909df6430`.

No production application code, database migration, upgrade fixture, CI workflow, runner, live database or production resource was changed.

## Verification status and next gates

Owner-provided evidence for this run:

- Node preflight: **46/46 PASS** on the source snapshot before the additional test-38 contract assertion was added.
- PostgreSQL upgrade fixture: PASS.
- Migrations 010–156: 147/147 PASS.
- CI inline assertions: 2/2 PASS.
- SQL tests 1–37: PASS.
- SQL test 38: FAIL due to fixture not satisfying the approved-pin precondition; source diagnosis described above.
- SQL tests 39–46: NOT RUN.
- Disposable database cleanup: PASS.

The new test-38 SQL fixture correction and its Node source-contract test are **NOT RUNTIME-VERIFIED**. The combined Node preflight now has one additional contract test, so the expected count is **47/47**; this is a source-derived expected count, not an executed result. The PowerShell runner was not changed.

Next owner action after synchronizing all documentation commits:

1. Run the three-file Node command from UA-034 and require exactly **47 tests, 47 pass, 0 fail, 0 skipped**. If the count differs or any test fails, stop and send the full output; do not run the PostgreSQL runner.
2. Only after Node 47/47 PASS, rerun the guarded PostgreSQL runner.
3. SQL integration PASS still requires the fixture, all 147 migrations, both inline assertions, all 46/46 SQL tests and confirmed disposable DB cleanup.
4. Nine Bash concurrency scripts remain a separate unverified gate.

Preserve local PostgreSQL PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`. Never target production or `PIN_TRIAL`, bypass runner guards, or disclose credentials.

## Assistant action log

1. Read the complete owner-provided runner transcript and classified the result: fixture/migrations/inline assertions passed; SQL tests 1–37 passed; test 38 failed; tests 39–46 did not run; disposable DB cleanup succeeded.
2. Read the current project state, owner action log and documentation register from GitHub.
3. Fetched the failing SQL test, Node runner-contract test and migration 148 from GitHub.
4. Read migrations 149–156 to ensure no later migration replaced `begin_pinterest_publish_v2`.
5. Traced the test setup and function control flow. Confirmed the test pin was `pending`, while the function returns `pin_not_approved` before reaching the legacy-history check.
6. Changed only the test fixture/message and added a Node source-contract assertion; published the two commits listed above.
7. Created this audit and updated `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md` and `docs/DOCUMENTATION_REGISTER.md` to preserve owner evidence, reasoning, exact changes, verification limits and next action.

The assistant did not execute local Node, PowerShell, psql, PostgreSQL, Bash or CI commands. No credentials were accessed. No local or production database was accessed or modified.

### 2026-11-17 — Owner Node preflight after test-38 fixture correction

Owner synchronized local `main` from `62b2a859c8516fe98b174072d3642018d2dff419` to `d266f57da57f8219e5e1f42616111b32ad76d748` using fast-forward. The owner provided evidence that:
- `git status --short` was empty before and after synchronization.
- `HEAD` and `origin/main` both equalled `d266f57da57f8219e5e1f42616111b32ad76d748`.
- The three-file Node preflight command completed with **47 tests, 47 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo** (112.4228 ms).
- The new contract test, “legacy Pinterest publication fixture reaches the unmapped-history fence with an approved pin”, passed.
- This is owner-reported local Node evidence. It does not execute SQL, the PowerShell runner, PostgreSQL integration tests, Bash concurrency tests or CI.

Next gate: synchronize the documentation-only commit(s) that record this result, confirm clean `main` and matching HEAD/origin, then run the guarded `scripts/verify-integration.ps1` command. Stop at the first SQL error and preserve full output/cleanup evidence. SQL suite still has not passed: previous run stopped at test 38/46; tests 39–46 were not run. The corrected test-38 SQL fixture remains unverified at runtime until this next guarded run. Do not claim 46/46 SQL PASS from the 47/47 Node result.


## Follow-up owner run — test 38 stopped at an earlier publication fixture (2026-11-17)

### Owner-provided execution evidence

The owner synchronized the local checkout to documentation snapshot ce3bcc98ec09d6acfff726b7bd71265c70832791:
- git pull --ff-only origin main fast-forwarded from d266f57d to ce3bcc98ec09d6acfff726b7bd71265c70832791.
- HEAD and origin/main both equalled ce3bcc98ec09d6acfff726b7bd71265c70832791; git status --short was empty before and after.
- The guarded runner verified clean synchronized main, PostgreSQL listener PID 15220, data directory X:\PinPosy-verify-pg18, and server identity 127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006.
- The owner entered the temporary role password only at the hidden local prompt. No password was shared or recorded.
- Disposable DB: pinposy_sqlint_bd50f191982f4df6.
- CI upgrade fixture passed; all 147 migrations 010–156 passed; both inline assertions passed.
- SQL tests 1–37/46 passed. Test 38/46, pinterest-account-publication.integration.sql, failed at line 895 with: first account publication did not start: {"status": "pin_not_approved"}.
- Tests 39–46 were not run.
- Cleanup passed: runner terminated remaining sessions (0 reported), dropped only the disposable DB, and printed Removed disposable database pinposy_sqlint_bd50f191982f4df6.
- Overall SQL integration remains NOT PASSED.

### Follow-up source diagnosis

The previous correction changed the distinct v_legacy_pin fixture from pending to approved so the legacy-history assertion could pass the approval guard. However, the same SQL test also creates the primary v_pin fixture at lines 112–114 with status pending, then immediately calls begin_pinterest_publish_v2 at line 202 and expects started.

Migration 148's active begin_pinterest_publish_v2 function locks and reads the pin, then returns pin_not_approved unless its status is approved, before it reaches the publication-history checks. Thus the owner-observed failure is the expected result for the primary fixture. The earlier approved legacy fixture correction was valid but incomplete: it did not change this separate primary pin.

This is a test-fixture defect exposed by the migration-148 invariant, not a reason to weaken the production approval guard. No production defect is established by this run.

### Published follow-up correction

1. backend/test/pinterest-account-publication.integration.sql:
   - changed only the primary v_pin fixture for the multi-account publication scenario from pending to approved;
   - the unique multi-account.png fixture row now satisfies the approval precondition.
   - Commit: 2b9b6a266c37b22086678acb994c09ce56af5b82.
   - Blob: 5b1f9f98662c9f2903b4edb983bb3b34f0aa3b09.

2. backend/test/postgres-integration-runner-contract.test.js:
   - strengthened the existing source-contract test (no new test case/count) to assert that both the primary multi-account fixture and legacy-history fixture are approved;
   - renamed the contract test to cover the approved-pin precondition for publication fixtures and retained the migration-148 assertion that the approval guard precedes the legacy-history fence.
   - Commit: a1b5cbccf74c0a85dcf7c7d22de00d47e84fa3e2.
   - Blob: 1ee73760a8bbeeaa42152b61f2139c371c8d677f.

No production application code, migration, runner, CI workflow, live database or production resource was changed.

### Assistant action log for this follow-up

1. Read the complete owner-provided synchronization and guarded-runner transcript; recorded the exact SHAs, database identity, migration/test counts, first fatal error, unrun tests and successful disposable-database cleanup.
2. Fetched the current SQL test, Node source-contract test, migration 148, project state, owner action log, documentation register and existing test-38 audit from GitHub at the then-current main.
3. Inspected the primary fixture creation and first publication call, plus migration 148's active function body. Distinguished v_pin from the already-corrected v_legacy_pin and identified the remaining pending status.
4. Updated only the two test files listed above. Both edits used exact-single-occurrence checks before the GitHub write; no local source files or local database were accessed.
5. The first attempt to prepare this audit update ended with a JavaScript SyntaxError in the documentation-writing wrapper before any GitHub write. No repository change resulted from that attempt; the update was retried with a literal-safe payload.
6. This audit and the project state, owner action log and documentation register are being updated to record the follow-up evidence and correction.

The assistant did not execute local Node, PowerShell, psql, PostgreSQL, Bash or CI commands; did not access credentials or any database; and did not modify production code or migrations.

### Verification status and next owner gate

- Owner run: fixture PASS; 147/147 migrations PASS; 2/2 inline assertions PASS; SQL tests 1–37 PASS; test 38 FAIL at the primary pin approval precondition; tests 39–46 NOT RUN; disposable DB cleanup PASS.
- The newly corrected primary fixture and strengthened Node contract assertion are NOT RUNTIME-VERIFIED.
- The prior owner Node 47/47 result applies to the earlier source snapshot, before this follow-up Node assertion was strengthened. The expected suite count remains 47 because the existing test case was extended, but a fresh run is required.
- After the documentation batch is published and pulled, owner must run the prescribed three-file Node command and require 47/47 PASS. Only then rerun the guarded PostgreSQL runner. Stop on the first SQL error and preserve the entire output including cleanup.
- SQL integration PASS still requires all 46/46 SQL tests and confirmed cleanup. Nine Bash concurrency scripts remain a separate unverified gate.


### Additional documentation-preparation attempt record

For completeness of the assistant action chronology: after the first audit-update wrapper SyntaxError (already recorded above), a separate combined state/action-log update was also initially submitted with unescaped Markdown code-fence delimiters in its JavaScript template literal. The wrapper parser raised SyntaxError before the script executed, so no GitHub read/write tool call from that attempt ran and no repository state changed. The update was retried with escaped delimiters and succeeded. Both authoring errors were tooling/payload preparation failures only; neither altered source, tests, documentation, Git refs or databases.
