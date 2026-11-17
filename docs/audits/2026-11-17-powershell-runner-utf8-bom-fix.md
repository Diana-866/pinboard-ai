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

- The owner's parser output is the only executed Windows runtime evidence so far; it demonstrates the previous no-BOM version did not parse.
- The updated runner and contract test were inspected from GitHub after editing. The Node contract test and Windows PowerShell parser were **not executed** in this assistant environment; no PASS is claimed.
- No PostgreSQL connection, test database, migration, SQL test, Bash concurrency test, backend runtime test, production resource, PIN_TRIAL resource, existing PostgreSQL process/PID 5632, or temporary cluster was accessed or changed by this correction.
- GitHub Actions runner allocation/log availability remains a separate constraint and does not substitute for local validation.

## 5. Required next action

After the owner fast-forwards to the latest `main`, first run the PowerShell parser-only check below. It must complete without output/errors before the integration runner is invoked:

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\\scripts\\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List; throw 'PowerShell parser check failed.' }
'PASS: PowerShell parser'
```

Only after parser PASS, run the existing guarded runner:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1 -PostgresPort 55439
```

Enter the temporary role password only in its hidden local prompt. Return the complete output, exit code, and cleanup result without passwords or secrets. If preflight rejects the cluster, stop and report the exact message; do not bypass checks. Do not use production, PIN_TRIAL, the existing PostgreSQL service/PID 5632, or delete the temporary cluster.

Only after confirmed SQL integration PASS **and** disposable database cleanup may the separately gated Bash concurrency suite be prepared and run, followed by backend runtime verification.
