# PostgreSQL Node contract gate — dynamic table-definition RegExp capture group

Date: 2026-11-17  
Repository: `Diana-866/pinboard-ai`, branch `main`

## Owner-provided evidence

The owner reran the three Node gates after the previous contract correction. The supplied output reports **42 tests, 41 passed, 1 failed**. The sole failure is `upgrade fixture preserves every canonical baseline column except fields introduced by later migrations`, at `backend/test/postgres-integration-runner-contract.test.js:190`.

The runtime error was:

```
SyntaxError: Invalid regular expression:
  /create table(?: if not exists)? public\.users \([\s\S]*?)\n\);/i:
  Unmatched ')'
```

All other 41 Node tests passed, including the direct `users.is_admin` matcher, migration count/range contract, and migration-chain/replay contracts. Owner showed a clean `git status --short` before the run. The owner did not run PowerShell Parser or PostgreSQL runner after the Node failure.

## Diagnosis

The dynamic `new RegExp(...)` string escaped the literal SQL opening parenthesis (`\\(`) but did not open a capture group for the table-definition body. The expression still contained a closing group parenthesis after the lazy repetition (`*?)`), producing an unmatched closing parenthesis.

The required JavaScript string fragment is:

```js
' \\(([\\s\\S]*?)\\n\\);'
```

This yields a regular expression that matches a literal opening SQL parenthesis, captures the table-definition body across newlines, and stops before the closing SQL parenthesis.

## Published correction

Changed only line 195 of `backend/test/postgres-integration-runner-contract.test.js`, adding the missing capture-group opening parenthesis:

```js
      'create table(?: if not exists)? public\\.' + table + ' \\(([\\s\\S]*?)\\n\\);',
```

Commit: `c4de3c67537cac08daadfbf6f461304bd4b61889`  
Final blob: `2765d21320bf1847efb73cf3453d0d3597289df7`

No production SQL, migrations, SQL fixtures, runner, CI workflow, or database were changed.

## Verification and limitations

The corrected source was fetched again from GitHub. Static inspection confirms the dynamic RegExp string now contains the missing capture-group opener `(` immediately after the escaped literal SQL parenthesis.

The assistant did not execute Node, PowerShell, psql, PostgreSQL, or CI. The corrected Node test is **NOT runtime-verified**. PostgreSQL integration remains **NOT PASSED**. The PowerShell Parser and SQL runner must remain blocked until all three Node gate files pass.

## Next owner action

1. Pull latest `origin/main`, confirm clean worktree and matching HEAD/origin/main.
2. Run:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Require **42/42 PASS**. On any failure, stop and send the complete output. Only after Node PASS may the owner run the PowerShell Parser API check; only after Parser PASS may the guarded PostgreSQL runner be used.

SQL PASS still requires the fixture, 144 migrations 010–153, both CI inline assertions, all 46 ordered SQL tests, and confirmed disposable database cleanup.


## 6. Owner rerun result — 42/42 PASS

After syncing, the owner reported:
- `git pull --ff-only origin main` advanced the local branch to `6512dc8aa4ae882e8be91877185a262787b02f87`.
- `git rev-parse HEAD` and `git rev-parse origin/main` both returned `6512dc8aa4ae882e8be91877185a262787b02f87`; both `git status --short` outputs were empty.
- The exact three-file Node command completed with **42 tests, 42 passed, 0 failed, 0 cancelled, 0 skipped** (duration 132.4884 ms).
- The formerly failing dynamic RegExp baseline-column test now passes. The complete contract, migration-chain and verification-script gates pass.

This is owner-executed local Node evidence, not assistant-executed verification and not CI evidence. The assistant did not run Node or any local command.

### Next gate

The Node gate is now **PASS**. The owner may proceed to the PowerShell Parser API check and must require zero syntax errors. Only after Parser PASS may the guarded PostgreSQL integration runner run. PostgreSQL integration remains **NOT PASSED / NOT YET RUN** after this Node gate; SQL PASS still requires fixture, 144 migrations 010–153, two CI inline assertions, all 46 SQL tests and confirmed disposable DB cleanup.


## 7. Owner rerun result — PowerShell Parser PASS

After the documentation commit was pulled, the owner reported:
- `git pull --ff-only origin main` advanced local main from `6512dc8a` to `73a1aef18eaee621783b879aa97ae1527ec9ba5a`.
- Local HEAD and origin/main both equal `73a1aef18eaee621783b879aa97ae1527ec9ba5a`; both worktree status checks were empty.
- The exact `System.Management.Automation.Language.Parser]::ParseFile` check for `scripts/verify-integration.ps1` completed and printed `PowerShell Parser PASS: 0 syntax errors`.

This is owner-provided local Parser evidence. The assistant did not execute PowerShell or any local command. Together with the previously recorded 42/42 Node PASS, both pre-run gates are now **PASS**.

### Next owner action

The guarded PostgreSQL integration runner is now authorized:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Do not bypass runner safeguards or change the protected PostgreSQL process/port/data directory. Stop at the first failure and preserve complete output, including cleanup. A complete SQL PASS requires fixture, 144 migrations 010–153, two CI inline assertions, all 46 ordered SQL tests and confirmed disposable database cleanup. Until that evidence is supplied, PostgreSQL integration remains **NOT PASSED / NOT YET VERIFIED**.
