# PowerShell SQL integration runner: UTF-8 decoding failure and correction

**Date:** 2026-11-17  
**Repository:** `Diana-866/pinboard-ai`  
**Branch:** `main`  
**Owner-reported execution:** Windows PowerShell, command `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1 -PostgresPort 55439`

## 1. Trigger and observed result

The owner confirmed a clean checkout on `main`, synchronized it with `git pull --ff-only origin main`, and ran the SQL integration runner. PowerShell failed during script parsing, reporting an unclosed `try` block beginning at line 65, a missing Catch/Finally near line 103, and cascading parser errors around the Russian `Read-Host` prompt and SQL string construction.

The prompt appeared as mojibake (`Р...`). No successful runner start, database creation, migration replay, SQL test execution, or cleanup was reported. Treat the SQL integration gate as **NOT RUN / BLOCKED**, not PASS or an application SQL failure.

## 2. Root cause assessment

The runner source contained UTF-8 Cyrillic text but had no UTF-8 byte-order mark (BOM). Windows PowerShell 5.1 interprets a UTF-8 script without a BOM using the active ANSI code page. In a string containing Cyrillic, bytes can therefore be decoded as unrelated characters, including punctuation that changes PowerShell tokenization. This explains both the corrupted prompt and the parser cascade.

This is a source-encoding compatibility defect. The exact Windows PowerShell version/code page was not captured in the owner output, so the diagnosis is strongly supported by the observed mojibake and the script's byte encoding, but the corrected script still requires a real owner-side parser/runtime retest.

## 3. Changes made

1. Fetched `scripts/verify-integration.ps1` from current `main` and confirmed its source blob SHA was `ff7333518519fd20674e8bf9b20310112e6ce039`.
2. Replaced the same file with identical UTF-8 text prefixed by a UTF-8 BOM. No PowerShell statements, SQL, target checks, credentials handling, or cleanup logic were changed. Commit: `db08fe681ad0727b5296e5f3ea686a6ca4a12378`; resulting blob SHA: `0119455a24c23645926565ab6ae78347b79bf374`.
3. Extended `backend/test/postgres-integration-runner-contract.test.js` with a contract assertion that the runner text starts with U+FEFF, so future edits cannot silently remove the BOM. Commit: `a2f58b2aae9d3f79fdb753506a4ad55ae8337bfe`; resulting blob SHA: `de8819ebb00d910dec774c789a1051126b7c560a`.

## 4. Verification status and limitations

- Initial owner output showed that the no-BOM version did not parse. After the BOM correction was pulled, the owner ran the PowerShell Parser API against `scripts/verify-integration.ps1` twice; both runs returned `PASS: PowerShell parser` with no parser errors.
- This is owner-reported syntax-validation evidence only. It does not execute the script or validate PostgreSQL preflight, disposable DB creation, migration replay, inline assertions, SQL tests, or cleanup. The runner runtime, SQL suite and Node contract test remain **NOT RUN**; no SQL PASS is claimed.
- No PostgreSQL connection, test database, migration, SQL test, Bash concurrency test, backend runtime test, production resource, PIN_TRIAL resource, existing PostgreSQL process/PID 5632, or temporary cluster was accessed or changed by this correction.
- GitHub Actions runner allocation/log availability remains a separate constraint and does not substitute for local validation.

## 5. Required next action

Owner has now fast-forwarded to `main` and confirmed the parser-only check twice (`PASS: PowerShell parser`). Do not repeat that check unless the script changes. The next action is to execute the guarded integration runner:



Run the existing guarded runner now that parser PASS is confirmed:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1 -PostgresPort 55439
```

Enter the temporary role password only in its hidden local prompt. Return the complete output, exit code, and cleanup result without passwords or secrets. If preflight rejects the cluster, stop and report the exact message; do not bypass checks. Do not use production, PIN_TRIAL, the existing PostgreSQL service/PID 5632, or delete the temporary cluster.

Only after confirmed SQL integration PASS **and** disposable database cleanup may the separately gated Bash concurrency suite be prepared and run, followed by backend runtime verification.


## 6. Owner parser validation follow-up (2026-11-17)

The owner pulled `main` from `e187ce33` to `28b50f44` and ran the PowerShell Parser API twice against `scripts/verify-integration.ps1`. Both invocations returned `PASS: PowerShell parser` and no parser errors. This confirms that the UTF-8 BOM correction resolves the reported parse failure in the owner's PowerShell environment.

The parser API only parses the file; it does not execute its statements. PostgreSQL preflight, database creation, migrations 010–148, the two inline assertions, all 46 SQL integration files and finally cleanup remain unverified. SQL integration status remains **NOT RUN** until the guarded runner completes and its output/exit code/cleanup are reviewed.

Assistant documentation commits were added after the owner's reported pull, so the local checkout is now behind `origin/main`. First run `git status --short`; if the working tree is clean, run `git pull --ff-only origin main`. If it is not clean, stop and report the output; do not reset/stash/clean. Then run `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1 -PostgresPort 55439`. The role password must be entered only in the hidden local prompt. If preflight fails, stop and report the exact message; do not bypass it. Never touch production, PIN_TRIAL, existing PostgreSQL PID 5632 or delete the temporary cluster. Bash concurrency and backend runtime suites remain blocked until SQL PASS plus cleanup confirmation.


The documentation-only follow-up commits after the owner's parser check mean the owner must fast-forward once more before executing the runner. The runner's clean-main/origin-main preflight requires this; do not attempt the runner from the previous local HEAD. The updated exact steps are in `docs/USER_ACTIONS.md` UA-004.


## 7. Owner runner attempt: PostgreSQL inet/CIDR identity mismatch (2026-11-17)

The owner synchronized a clean local checkout to `21226c6d` and ran the guarded runner. It confirmed clean `main`, PostgreSQL listener PID `15220`, and data directory `X:/PinPosy-verify-pg18`; the hidden password prompt was reached. The identity query returned an address rendered as `127.0.0.1/32`, while the script expected `127.0.0.1`. The runner stopped with `PostgreSQL identity mismatch`.

Source-order inspection confirms this check occurs before cluster-role inspection/creation and before generating or creating the disposable database. At failure, `$createdDatabase` is still `$null` and `$createdRoles` is empty. Therefore no fixture, migration, inline assertion or SQL integration test ran, and this attempt had no runner-created database to clean up. The PostgreSQL cluster itself was not stopped or modified by the runner before this guard.

Root cause: PostgreSQL `inet_server_addr()` rendered as text includes its host mask (`/32`); exact comparison against a bare IPv4 host string is too strict. Corrective change: use `host(inet_server_addr())` in the identity query, which normalizes the address to the bare host form. Script commit `a0de3046d924abcedb267076d03e365e6b9b0353`, blob `05787d0f8067d3412ed10e06856e7b1cdfce1c6d`. A Node contract assertion was added to prevent regression: commit `4495b4b4dd52b3f82f43859d640bbab571a3466e`, blob `ce331fba2e06bb63473cfedf1c586003606b09c4`.

Neither the Node contract test nor the modified PowerShell parser/runner has been executed after this correction. The SQL integration gate remains NOT RUN. Owner must fast-forward pull, rerun parser-only validation, and invoke the guarded runner only after parser PASS. If any preflight fails, stop; do not bypass checks or manually alter the cluster. Bash concurrency and backend runtime stages remain blocked.

### Canonical local PostgreSQL migration replay procedure — owner transcript (2026-11-16, supplied 2026-11-17)

This section records the exact owner-provided PowerShell procedure. Treat it as authoritative historical evidence for the successful migration-only replay; do not conflate it with `scripts/verify-integration.ps1` or the 46-file SQL integration suite.

**Environment and preflight**

- Run from `X:\\!PROGECT\\pinboard-ai` in Windows PowerShell with `$ErrorActionPreference = 'Stop'`.
- PostgreSQL binaries: `X:\\Program Files\\PostgreSQL\\18\\bin`; temporarily prepend this directory to the current process `PATH`, preserving the old value for restoration.
- Preserve the prior process values/presence of `PGUSER`, `PGCLIENTENCODING`, and `PGPASSWORD`; set only for this PowerShell session: `PGUSER=pinposy_verify_admin`, `PGCLIENTENCODING=UTF8`.
- Assert current branch is `main`, working tree is clean, and historical checked-out HEAD is exactly `ebb1040ac73e600dfdbfc57d8aa765f9713441a2`.
- Assert migration 140 file hash is `484e589c32940ad9df8ef67de71c43b27fddf76c` and `scripts/verify.ps1` hash is `6614843edaafd4924c90c679a0f9fe232e59a0f0`.
- Assert selected `psql.exe` is exactly under PostgreSQL 18 bin directory.
- Inspect TCP listeners on port 55439 and require exactly one listener bound to `127.0.0.1`; stop on any mismatch.
- Prompt for `pinposy_verify_admin` password with `Read-Host -AsSecureString`; reject empty input. Convert to process-scoped `PGPASSWORD` only for the command, zero the temporary BSTR in a finally block, never print or transmit the password.
- Query server identity using `psql -h 127.0.0.1 -p 55439 -U pinposy_verify_admin -d postgres` and verify exact prefix: address `127.0.0.1`, port `55439`, data directory `X:/PinPosy-verify-pg18`, server encoding `WIN1251`, client encoding `UTF8`, PostgreSQL `18.6`.

**Actual migration-only execution**

- Invoke a child Windows PowerShell process with `-NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify.ps1 -MigrationsOnly -PostgresPort 55439`.
- Capture `$LASTEXITCODE`; throw on nonzero. Only print `MIGRATION REPLAY PASSED` on exit code zero.
- The verified runner created disposable database `pinposy_verify_196929316b56e`, applied Supabase test stubs, canonical baseline `db/migrations/001_baseline.sql`, and every numbered migration from `010` through `148` (139 migrations).
- The runner then terminated any backend connected to that disposable database and successfully executed `DROP DATABASE`. The transcript shows `DROP DATABASE`, `PASS PostgreSQL migration replay (001 + 010-148)`, `All configured checks passed.`, and final `MIGRATION REPLAY PASSED`.
- In the outer `finally`, restore the original `PGPASSWORD`, `PGUSER`, `PGCLIENTENCODING` presence/values and original `PATH`; print that temporary environment variables were restored.

**Evidence interpretation / guardrails**

- This owner-supplied transcript proves the migration-only replay completed successfully and disposable database cleanup succeeded. Keep this result as PASS; never rewrite it as “migrations were not run”.
- It does not prove the separate `scripts/verify-integration.ps1` run completed, nor that its two inline assertions or 46 SQL integration test files ran. Those belong to a separate gate and must be marked independently.
- Historical HEAD and hashes above identify the exact checkout used for this replay; do not require the current moving `main` HEAD to equal that historical commit when interpreting this evidence.
- Never stop/reinitialize the PostgreSQL cluster `X:\\PinPosy-verify-pg18`, never touch production or PIN_TRIAL, never bypass any preflight, and never request or store the password in chat.
- The long console output displayed Cyrillic PostgreSQL NOTICE text as mojibake, but the command continued through all migrations, cleanup and the explicit success summary. Do not infer failure from those display artifacts alone.


## 6. Owner retest after identity normalization — migration 018 collision (2026-11-17)

The owner fast-forwarded the clean checkout to `33fdee6f3da62495ed3137ebf06cb04b91c3ffcb`. PowerShell Parser API returned `PASS: PowerShell parser`. The runner then passed its repository guard, PostgreSQL listener/process/data-directory checks and exact identity check (`127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`). This confirms the prior `/32` identity mismatch is resolved in the owner environment.

The runner created `pinposy_sqlint_389e6a26525c4ee8`, applied the upgrade fixture and failed while applying `db/migrations/018_preferred_language.sql`: PostgreSQL reported that `users_preferred_language_check` already exists on `users`. The `finally` cleanup completed: backend termination, `DROP DATABASE`, absence check and explicit `Removed disposable database ...` message. This disposable database is confirmed removed. The persistent PostgreSQL cluster was not reported stopped or reinitialized.

Current-main static inspection found no definition of this constraint in `backend/test/postgres-integration-upgrade-fixture.sql` or migrations `010–017`; migration 018 itself drops the named constraint if present before adding it. Therefore the source of the duplicate is unresolved. Do not assume which statement emitted the error from the mojibake/truncated console rendering; collect full error context and inspect `pg_constraint` immediately before migration 018 in a fresh guarded run. Do not weaken/drop constraints speculatively.

The run did not reach the two inline assertions or the 46 SQL integration tests. SQL integration remains blocked at migration 018. The independent migration-only replay (`001_baseline.sql` + `010–148`) remains PASS. Node contract test execution is not evidenced. Next action: add a read-only diagnostic immediately before migration 018 (or an equivalent isolated reproduction against a new disposable DB), print matching `pg_constraint` rows including relation/schema/definition, then use the resulting evidence to make the smallest fix and add a regression test. Keep all existing target guards and cleanup logic intact.


## 7. Read-only migration 018 diagnostic instrumentation (2026-11-17)

To resolve the unexplained duplicate constraint without weakening schema guarantees, the guarded runner now logs each migration filename and executes a read-only `pg_constraint` query immediately before `018_preferred_language.sql`. The query prints schema, table, constraint name/type and `pg_get_constraintdef`. No SQL migration, fixture, target guard, or cleanup behavior was changed. Runner commit `2c75a0d5639bfa43629a83d03fcd8d760c78368d`, blob `4ad7496780efdbdd1996d29dbd5dd31e3f361676`.

A Node source-contract assertion now checks that the progress and diagnostic query remain present. Commit `883c065b97e52010ba99fa3a79d3420e73d56e92`, blob `9dc83eae945470b653907881f09732077837b169`. Neither this test nor the updated parser/runner has been executed yet. The next owner run must capture the catalog result and full error context before any schema change is considered. The prior temporary DB was confirmed dropped; no PostgreSQL instance was accessed during this code/documentation change.


## 8. Empty pre-018 catalog result and expanded diagnostics (2026-11-17)

Owner's run of the first diagnostic build showed the header but no rows for `users_preferred_language_check`; immediately afterward migration 018 still failed with a duplicate-constraint message. The disposable DB was successfully removed. This is contradictory evidence, not a basis for speculative schema changes.

The runner now emits a sentinel database row, every constraint attached to `public.users`, any matching named constraint across all schemas/tables, and any same-named relation. Migration 018 is invoked with psql verbose error/context and echo-errors options to expose SQLSTATE and statement context. Runner commit `eb95ccf5126ec833e5f7f55092bef82c173cd48b`, blob `1fe066227a40d1dfef1df55a63babfec9d56403f`. Contract assertion commit `5837793afd56968e1f5695177c79361640cea204`, blob `c7b449c128154d7f0cc87170d6cabab5f0e9c87e`. Not yet owner-executed. Next step is capture complete diagnostics before altering migration or fixture.


## 9. Owner retest — diagnostic query type error (2026-11-17)

The owner fast-forwarded the clean local checkout from `2ced4164` to `d48fdde95765a5b254e92bc05388af7f32661e8d`. The PowerShell Parser API check again returned `PASS: PowerShell parser`. The guarded runner verified clean `main`, listener PID `15220`, data directory `X:/PinPosy-verify-pg18`, and server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.

The runner created disposable database `pinposy_sqlint_f6ff758b193649be`, applied the upgrade fixture, and successfully applied migrations 010–017. Immediately before migration 018, the expanded diagnostic query itself failed with PostgreSQL error `operator does not exist: text || "char"`. This occurred because PostgreSQL catalog fields `pg_constraint.contype` and `pg_class.relkind` are internal `char` values and were concatenated directly with text. Therefore this run did **not** produce the intended catalog rows and did not reach migration 018's SQL; it does not provide new evidence about the original duplicate-constraint cause.

The runner's `finally` successfully terminated connections, dropped `pinposy_sqlint_f6ff758b193649be`, verified its absence, and printed `Removed disposable database ...`. No evidence indicates that the persistent PostgreSQL cluster was stopped or reinitialized. The two inline assertions and all 46 SQL integration tests were not reached.

Assistant source inspection identified the diagnostic-only type mismatch. Corrected the read-only query by explicitly casting both `c.contype::text` and `cl.relkind::text` before concatenation. No migration, fixture, production database, target guard, or cleanup behavior was changed. Added a Node source-contract assertion requiring both casts. These are source edits only; neither the Node test, PowerShell parser nor integration runner has been executed after this correction. The underlying migration-018 constraint collision remains unresolved pending a successful diagnostic query. Never infer that the constraint is absent from the database based on the failed diagnostic.

Owner-provided evidence: terminal transcript in chat. Assistant actions: fetched current `main` source and docs; identified the two internal-char concatenations; updated runner and contract test; recorded this incident in the audit, project journal, owner-action log and documentation register. No PostgreSQL command was run by the assistant; no password or secret was recorded.



## 10. Owner retest — contract test caught stale diagnostic wording (2026-11-17)

The owner fast-forwarded local clean `main` from `d48fdde9` to `844514ab` (the transcript shows the remote update ending at `844514ab`). The Node command `node --test .\\backend\\test\\postgres-integration-runner-contract.test.js` executed 10 tests: 9 passed, 1 failed. The sole failure was the contract test requiring the old runner log string `Diagnostic: matching constraints immediately before migration 018`. The current runner had intentionally expanded this log to `Diagnostic: database and public.users constraints immediately before migration 018:`. The output proves a stale test expectation, not a PowerShell runner or PostgreSQL failure. The contract test's other 9 checks passed, including both catalog text casts.

The owner then ran the PowerShell Parser API check; it returned `PASS: PowerShell parser`. The integration runner was **not** run after the diagnostic cast change in this transcript. No new disposable database was created in this retest, no migrations were applied, and no SQL integration assertions/tests ran.

Assistant inspected the current test, runner and documentation on GitHub `main`. Changed only the stale expected diagnostic wording in `backend/test/postgres-integration-runner-contract.test.js` to match the current runner log. Commit: `a4472b204bf6c66f02c0adb8c9d1db79579c47ea`; resulting test-file blob: `902a0d700a1b145d7e48ad5f0cc856c5bd6f99a1`. This source edit has not yet been executed by the assistant or owner. The previous 9/10 result remains the only observed execution result; do not report the contract suite as passing until rerun.

Documentation updated to preserve the owner transcript, exact pass/fail counts, reason for failure, parser result, scope of what did not run, and assistant's source edit. No PostgreSQL instance, database, migration, fixture, production service, secret, or owner local file was touched by the assistant.


## 11. Owner retest — Node source-contract suite passes (2026-11-17)

The owner fast-forwarded the local checkout from `844514ab` to `7f0084ca` with `git pull --ff-only origin main`. The transcript shows an empty `git status --short` before the pull. Five files changed in the fast-forward: the Node contract test and four documentation files (49 insertions, one deletion).

The owner executed `node --test .\\backend\\test\\postgres-integration-runner-contract.test.js`. Result: **10 tests, 10 passed, 0 failed**. The output confirms all ten contract checks passed, including the corrected assertion for the expanded pre-migration-018 diagnostic heading, explicit casts of PostgreSQL catalog `contype` and `relkind`, fixture and inline-check parity, the ordered 46-file SQL manifest, Windows PowerShell BOM, identity normalization, safety guards, verbose diagnostics and the contiguous 010–148 migration chain.

This test reads and validates source/manifest contracts; it does not execute PostgreSQL. The supplied transcript contains no PowerShell Parser API run for this newly pulled revision and no invocation of `scripts/verify-integration.ps1`. Accordingly, no new temporary database was created, no migration or inline assertion was executed, and the 46 SQL integration tests remain NOT RUN in this turn. The earlier parser PASS is historical evidence for its earlier revision only.

Assistant action in this turn: fetched the current runner, contract test, project state, owner action log, audit and documentation register from GitHub `main`; verified the current source blob IDs; then appended this owner evidence and its limits to the project journal, UA-004 and this audit. No source code was changed by the assistant, and no local files, PostgreSQL processes/databases, production/PIN_TRIAL, or secrets were touched.

Next gate: run the PowerShell Parser API check against the current pulled revision. Only if it passes, invoke the guarded integration runner and capture the complete output, including diagnostic records and cleanup confirmation. Do not report the SQL integration gate as passed until the fixture, all 139 migrations, two inline assertions, all 46 SQL tests and disposable database cleanup have completed successfully.


## 12. Owner retest — PowerShell Parser API passes (2026-11-17)

The owner ran the parser API against the local `scripts/verify-integration.ps1` after the previous transcript showed the Node source-contract suite passing 10/10. The command set `$ErrorActionPreference = 'Stop'`, initialized token/error references, called `[System.Management.Automation.Language.Parser]::ParseFile` on the resolved runner path, and would have formatted parser errors and thrown if `$errors.Count -gt 0`. The observed output was **`PASS: PowerShell parser`**, so the parser reported no syntax errors.

This is a syntax-only check. It does not execute the runner or prove that its runtime guards, PostgreSQL connectivity, migration replay, inline assertions, 46 SQL integration tests or cleanup succeed. No database was created or changed in this owner transcript. The SQL integration gate remains open.

Assistant procedure for this update: fetched the latest versions of the project state, owner action log, audit, documentation register, runner and Node contract test from GitHub `main`; checked the current runner/test blob SHAs against the previously documented source versions; then appended the owner evidence and its limits to the three chronological documents. No source-code change or PostgreSQL action was performed by the assistant. The documentation register is updated separately with the resulting document blob SHAs and commits.

Next: owner runs the guarded integration runner on clean synchronized `main`, then supplies the complete output. Preserve all safety checks and cleanup confirmation. Do not claim SQL integration PASS unless all required stages complete and the disposable database is confirmed absent.


## 13. Runner launch blocked by PowerShell execution policy (2026-11-17)

Owner attempted to launch `.\scripts\verify-integration.ps1` from the project checkout. PowerShell refused to load the file because script execution is disabled by the active execution policy. The reported error category was `PSSecurityException`, fully qualified ID `UnauthorizedAccess`.

The rejection happened before script-body execution. The runner did not reach its hidden secure password prompt, PostgreSQL identity checks, disposable database creation, fixture load, migration chain, inline assertions, 46 SQL integration tests or cleanup. Consequently this attempt did not create a disposable database and is not a failed SQL test run; it is a launch-policy block. The prior 10/10 Node contract test and PowerShell Parser PASS remain source-level checks only.

Assistant diagnosis/actions: retrieved current `main` versions of the runner, Node contract test, project journal, owner action log, audit and documentation register; reviewed the runner's fixed 55439 port, target identity guards, hidden `Read-Host -AsSecureString` password prompt, unique disposable database naming and `finally` cleanup verification; concluded the script body was not reached; and recorded the event in the chronological documents. No code, local machine, PostgreSQL process/database, production/PIN_TRIAL or secret was changed or accessed by the assistant.

Safe retry is limited to a child process and does not persistently alter LocalMachine or CurrentUser policy:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

The runner's internal safety checks remain in force. The temporary role password must be entered only into its hidden prompt and never placed in command arguments or chat. If domain/Group Policy blocks this child-process override, stop and report the exact error; do not alter machine/user policy or bypass runner guards.

The SQL integration gate remains NOT PASSED until the guarded run completes all expected stages and confirms the disposable database is absent after cleanup.


## 14. Owner runner retry — process launch succeeds, synchronization guard stops execution (2026-11-17)

The owner first repeated the direct invocation and received the same execution-policy refusal (`PSSecurityException / UnauthorizedAccess`). The owner then invoked the runner in a child PowerShell process using `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`. This time the script loaded and fetched the remote branch successfully. Git output showed `7f0084ca..b8d04ffc main -> origin/main`.

The runner then deliberately stopped because local `main` was at `7f0084ca8ff0681b56c214c3f7020f9d029c2ef5`, while fetched `origin/main` was `b8d04ffc9636fb7f4bc506aaf06f9bd6c86241cc`. Exact safety condition: local main must be synchronized with origin/main.

Inspection of current runner blob `74c128b4c6933b8b5aba888e4abeb01200df2ab6` established the order: branch check → fetch origin/main → clean-worktree check → compare HEAD and origin/main → secure password prompt → disposable DB creation. The failure happened at the comparison, before the password prompt and before any PostgreSQL interaction or database creation. No migration, assertion, SQL test or cleanup occurred in this attempt. It is a repository synchronization guard, not a SQL failure.

Assistant procedure: fetched the latest runner and four tracking documents from GitHub main; inspected relevant line ordering and source SHA; recorded both owner invocations and exact commit IDs; updated the chronological docs and register; re-fetched the documents to confirm the recorded update. No local git operation, code edit, DB operation, production/PIN_TRIAL access or secret handling occurred.

Next owner step: run `git status --short`. Only if it is empty, run `git pull --ff-only origin main`; then compare `git rev-parse HEAD` and `git rev-parse origin/main`. If dirty or pull fails, stop and share output; do not reset/force/discard. When the two IDs match, rerun the process-scoped guarded runner. SQL integration is still NOT PASSED.


## 15. Owner synchronizes local main with origin/main (2026-11-17)

The owner ran `git status --short`; no output was returned, so the worktree was clean. The owner then ran `git pull --ff-only origin main`. Git completed a fast-forward from `7f0084ca` through `b8d04ffc` to `95b7aa3c`, updating four documentation files with 220 insertions and no deletions. The owner verified both `git rev-parse HEAD` and `git rev-parse origin/main`; both returned `95b7aa3cadfdb0b5d213ec65d2d61cf47ffcf990`.

This confirms local main and origin/main are synchronized and resolves the runner's previous stale-checkout safety stop. This is not an integration-test result: no successful runner rerun has yet been reported, and the prior invocation stopped before password prompt/PostgreSQL/database creation.

Assistant procedure: fetched current runner, Node contract test and four tracking documents from GitHub main; checked runner blob `74c128b4c6933b8b5aba888e4abeb01200df2ab6` and contract test blob `902a0d700a1b145d7e48ad5f0cc856c5bd6f99a1`; reviewed safety-check order; appended this owner transcript and its exact scope to the project state, action log and audit; updated the register; and re-fetched the updated files to verify blob identities. No local Git commands, source edits, PostgreSQL operations, production/PIN_TRIAL access or secret handling were performed by the assistant.

Next: owner reruns the guarded process-scoped PowerShell invocation from the now-synchronized clean checkout. The temporary role password is entered only at the hidden prompt. Capture all output and verify cleanup. SQL integration remains NOT PASSED.


## 16. Second stale-main stop — assistant sequencing error (2026-11-17)

Owner ran the process-scoped integration runner. It fetched remote and showed `95b7aa3c..a98f8821 main -> origin/main`, then rejected local HEAD `95b7aa3cadfdb0b5d213ec65d2d61cf47ffcf990` because origin/main was `a98f8821f345677271add7d53a3cbe94840f2f0d`.

The assistant explicitly records responsibility for this avoidable stop. After the owner had synchronized local main to `95b7aa3c`, the assistant committed the documentation update at `a98f8821` and then mistakenly instructed the owner to launch the runner without another pull. The owner followed that instruction. The runner's exact synchronization guard behaved correctly; the failure is in the assistant's action sequencing/instruction, not in the owner's work or PostgreSQL.

Current runner blob inspected: `74c128b4c6933b8b5aba888e4abeb01200df2ab6`. Guard ordering confirms the mismatch check (lines 59–61) precedes the hidden password prompt (line 103) and disposable database creation (line 143). No password was requested; no PostgreSQL connection, database creation, fixture, migration, assertion, SQL test or cleanup occurred.

Assistant actions: retrieved runner and four documentation files from GitHub main; checked guard order and source hash; traced local/remote hashes to the previous assistant documentation commit; documented the user's transcript and assistant accountability; updated the register; and re-fetched documents to verify exact blob identities. No local checkout, database, production/PIN_TRIAL or secret was touched.

Corrected procedure after this documentation update: owner checks `git status --short`; only if clean, performs `git pull --ff-only origin main`; verifies `git rev-parse HEAD` and `git rev-parse origin/main` match; then runs the guarded process-scoped integration command immediately. No assistant commit should occur between that pull and the run. Each subsequent assistant commit to main necessarily advances the remote and requires another pull before the next runner attempt. SQL integration remains NOT PASSED.


## 17. Integration run reached migration 018; root cause still unproven (2026-11-17)

Owner synced local main and origin/main to `13166c8cd476a13a787e9584f5b914430f702cc1`, then executed the guarded PowerShell runner. It verified the approved temporary PostgreSQL server identity and created disposable DB `pinposy_sqlint_318fd598c73448c5`. The fixture and migrations 010–017 completed. Migration 018 failed; inline assertions and all 46 SQL tests were not reached.

Pre-018 catalog output listed only the expected six constraints directly on `public.users`; neither a target-named constraint nor relation appeared in the runner's diagnostic output. The psql text supplied by owner is mojibake and visibly includes SQLSTATE 00000 NOTICE for the expected `DROP CONSTRAINT IF EXISTS` behavior. It does not reliably show the actual subsequent server ERROR or SQLSTATE. The NOTICE must not be mistaken for the root cause. Root cause remains unknown.

Cleanup was successful and explicit: session termination, `DROP DATABASE`, then `Removed disposable database pinposy_sqlint_318fd598c73448c5`. No permanent database or production/PIN_TRIAL resource was touched.

Assistant retrieved and inspected runner, migration 018, fixture, baseline and SQL manifest; recorded exact blob SHAs in project state/action log/register. No source changes or database operations were performed by assistant. Next action is a minimal diagnostic improvement to preserve exact psql error encoding/SQLSTATE and inspect catalogs at each migration 018 statement, then another guarded disposable run. SQL integration remains NOT PASSED.


## 18. Runner patch for native psql stderr and UTF-8 diagnostics (2026-11-17)

The previous owner run reached migration 018, then the PowerShell exception text showed the expected `DROP CONSTRAINT IF EXISTS` NOTICE (SQLSTATE 00000) instead of the runner's own nonzero-exit wrapper. Source review found global `$ErrorActionPreference = 'Stop'` and a direct native `psql.exe` invocation. Likely explanation: Windows PowerShell 5.1 treats native stderr output as a terminating PowerShell error before the code reads `$LASTEXITCODE`. The Cyrillic mojibake also suggests native output decoding was not aligned with PostgreSQL's UTF-8 client output. This diagnosis remains to be verified by a new guarded run; it does not establish that migration 018 SQL is defective.

Assistant updated `Invoke-Psql` to scope `$ErrorActionPreference = 'Continue'` and `[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)` around the native invocation, merge/capture output, read `$LASTEXITCODE` immediately, and restore both original settings in `finally`. The existing exit-code check, target guards and disposable-database cleanup are unchanged.

Runner commit `b5b43c86213209e1cacefd8807fce188439dc11d`; blob `d1137519b254f31a8d669405d355956b1fb23ddf`.

Two contract tests were added for scoped stderr handling/exit-code capture/restoration and scoped UTF-8 decoding/restoration. Test commit `e24511b5219315928baefb3563ef959c16cc86ec`; blob `088c23d854c9be56320b2728f1e4cbe6b107f8a5`. Assistant re-fetched both files and confirmed source text and 12 test declarations. No test execution or PowerShell/PostgreSQL runtime was available to assistant; do not claim PASS.

Next: owner synchronizes after all documentation commits, runs `node --test backend/test/postgres-integration-runner-contract.test.js`, runs the PowerShell parser check, and invokes the guarded integration runner. New output should reveal the true psql exit code and UTF-8 ERROR if one exists. Only then diagnose migration 018. SQL integration remains NOT PASSED.


## 19. Owner retest: PowerShell runner now reaches SQL integration tests (2026-11-17)

Owner synchronized local main to `c047f44cce666e6dbe844cf318a4b314dd60040c`. Node runner-contract tests passed **12/12**; Windows PowerShell Parser API reported **PASS**. The guarded runner verified the approved temporary PostgreSQL server identity, applied the fixture, all 139 migrations 010–148, and both inline CI assertions.

It then started the ordered 46 SQL integration tests. Test 1, `pinterest-unknown-schedule-reconciliation.integration.sql`, failed at line 110 with PostgreSQL error `schedule remote pin identity conflict incorrectly promoted schedule` (psql exit 3). The runner cleaned up the disposable DB `pinposy_sqlint_b39373fd69614fe7` and explicitly printed its removal. Tests 2–46 did not run. SQL integration is NOT PASSED.

This demonstrates the earlier PowerShell stderr/exit-code handling patch allowed execution to pass migration 018 and all remaining migrations and reach SQL tests. Some NOTICE context remains mojibake, but the assertion error and psql exit code were captured correctly.

Assistant inspected test blob `20f04be636298e0cdb33ce1725cd2558e4121e9e`, migrations 091, 092, 093 and 148. Migration 093's source contains a remote-ID equality guard in the reconciliation function; migration 148 does not redefine it. The failing test intentionally places `remote-already-recorded` on the schedule while attempt and publication ledger agree on `remote-confirmed-123`. Static source and runtime result therefore disagree. Do not infer a root cause or modify the migration speculatively.

Detailed evidence and next steps are recorded in `docs/audits/2026-11-17-pinterest-unknown-schedule-reconciliation-test-failure.md`. Next diagnostic: add failure-only assertion details showing the reconciliation row count, actual schedule status/remote ID, and effective runtime function definition using `pg_get_functiondef`; inspect effective `claim_due_pin_schedules(integer)` and any later migration overrides. Preserve the existing test expectation and guarded disposable DB boundaries.
