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
