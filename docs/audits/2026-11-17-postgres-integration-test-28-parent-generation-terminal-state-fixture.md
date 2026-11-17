# PostgreSQL integration test 28 — parent generation terminal-state fixture correction

## Context and owner-provided run evidence

The owner ran the guarded `scripts/verify-integration.ps1` runner after both pre-run gates had passed:
- Node contract suite: 42/42 PASS.
- PowerShell Parser: 0 syntax errors.

The owner synchronized to commit `edf883e604140a864560b11b1181c672590f8f04`. The runner:
- verified the clean main checkout and PostgreSQL listener PID 15220 / data directory `X:\PinPosy-verify-pg18`;
- created disposable database `pinposy_sqlint_954a7251fb504472`;
- applied the CI legacy/upgrade fixture;
- applied all 144 migrations, 010–153;
- passed both CI inline assertions;
- passed ordered SQL tests 1–27;
- failed test 28, `pin-image-deletion-claims.integration.sql`, at line 454 (the enclosing DO block; the failing statement was line 402):
  `completed pins do not match successful generation tasks`;
- cleaned up the disposable database successfully: `DROP DATABASE`, then `Removed disposable database pinposy_sqlint_954a7251fb504472.`

The runner exited nonzero as expected. Tests 29–46 were not run. This is **27/46 SQL tests passed; integration suite FAIL**, not a full pass.

## Diagnosis

The fixture creates one `pin_generation_tasks` row with:
- `status = 'failed'`;
- `provider_outcome_status = 'failed'`;
- a non-null `storage_url`, so the test can prove the task journal retains a durable image reference.

It then marked the parent `pin_generation_requests` row as `completed` while omitting `pins`. Migration 014 defines `pins jsonb` as nullable with no default, so the value remained SQL NULL.

Migration 071's `guard_pin_generation_request_completion()` runs on a transition to `completed`. Because the task journal contains one failed task and zero successful tasks, it expects a JSON array whose length equals zero. A NULL `pins` value is not an array and correctly raises `completed pins do not match successful generation tasks`.

This is a fixture state inconsistency, not evidence of a production migration defect: all task rows in this fixture are failed, while the parent was incorrectly labelled completed. The purpose of this test section is to verify that a terminal generation task journal remains an image reference even when its parent request is terminal; it does not need to fabricate a successful generation.

## Change published

Only `backend/test/pin-image-deletion-claims.integration.sql` was changed:
- The fixture now marks the parent request `status = 'failed'` and sets `error_code = 'provider_task_failed'`, matching its only task's terminal failed outcome.
- Added a short explanatory SQL comment.
- The task row and its storage URL remain unchanged, so the image-reference assertion still exercises the intended journal-retention behavior for a failed terminal request.

Source commit: `c58b877c1d51713c6b0d102206d8d4439ec4123e`  
Source blob: `1df7078c31ba2992d526c0993802f3819b59df80`

No production SQL, migrations, CI workflow, migration manifest, PowerShell runner, or database was changed. Historical migrations remain untouched.

## Verification and limitations

The assistant inspected the current source for migrations 014, 045, 064, 071, 145 and 153, and the relevant SQL fixture block. The diagnosis follows the explicit nullable `pins` column definition and the completion guard's task-count/pin-array invariant.

The assistant did not run Node, PowerShell, psql, PostgreSQL, or CI and did not access the owner's local database. The source change has not yet been runtime-verified. The previous owner-provided Node 42/42 and PowerShell Parser PASS results predate this SQL fixture-only change. The prior PostgreSQL runner result remains FAIL (27/46); tests 29–46 remain unexecuted.

## Next owner steps

1. Pull latest `origin/main`; require a clean worktree and matching local HEAD/origin/main.
2. Rerun the three-file Node contract gate and require 42/42 PASS:
   ```powershell
   node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
   ```
3. The PowerShell runner itself was not changed; its prior Parser PASS remains the latest parser evidence. If the Node gate passes, run the guarded runner:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
   ```
4. Send the full output, including migration count, both assertions, all SQL test results, and cleanup. Stop at the first failure; do not rerun before review.

Do not bypass guards, alter PID 15220 / port 55439 / data directory, touch `X:\PinPosy-verify-pg18`, or use production/PIN_TRIAL. Never send passwords, tokens, or `.env` contents.

A full SQL PASS still requires all 46 ordered SQL tests and confirmed disposable database cleanup.