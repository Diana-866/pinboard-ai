# PostgreSQL SQL integration — durable queue test expects an outdated preflight error

## Owner runtime evidence (2026-11-17)

Owner synchronized local checkout to `01a7fd7f8ab60bfc6e380cef01352b6d6ae2f038`; `HEAD` and `origin/main` matched. The worktree was clean before pull.

Owner ran:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Node runner contract suite: **15/15 PASS**, 0 failures.

The guarded runner verified clean synchronized main, approved temporary PostgreSQL listener PID 15220 and data directory `X:\PinPosy-verify-pg18`, hidden password entry, and server identity:

`127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`

Disposable database: `pinposy_sqlint_ab121efa0ee94999`.

The CI upgrade fixture passed; all **140 migrations 010–149** passed; both inline CI SQL assertions passed. SQL tests 1–6 of 46 passed:
1. `pinterest-unknown-schedule-reconciliation.integration.sql`
2. `pinterest-stale-schedule-recovery.integration.sql`
3. `pinterest-schedule-cancellation-race.integration.sql`
4. `pinterest-schedule-claim-heartbeat.integration.sql`
5. `account-deletion-publication-fence.integration.sql`
6. `account-deletion-reauth-version.integration.sql`

Test 7/46, `account-deletion-durable-queue.integration.sql`, failed with PostgreSQL exception `account deletion Storage manifest is required`. The SQL error context identifies `finish_account_deletion_job(uuid,uuid,text,text)`. Tests 8–46 did not run.

Cleanup was confirmed: runner terminated sessions (0 remaining), executed `DROP DATABASE`, and printed `Removed disposable database pinposy_sqlint_ab121efa0ee94999`. No production/PIN_TRIAL database or persistent verification cluster was removed or modified. Overall SQL integration remains **NOT PASSED**.

## Source investigation and root cause

Fetched current `main` source and compared:

- Failing test `backend/test/account-deletion-durable-queue.integration.sql`, pre-fix blob `6e85b453df8395529043097db7ce5ea978d5b048`.
- Migration 131 `db/migrations/131_account_deletion_preflight_inventory.sql`, blob `45aaad97035c7dca0b6a13f8831a78844f20651f`.
- Migration 137 `db/migrations/137_account_deletion_content_erasure_stage.sql`, blob `dab57a684b6a105f7d0d40b0796e61b498c0365b`.
- Migration 144 `db/migrations/144_account_deletion_stage_completion_guards.sql`, blob `f196a9ea2565b0759c5fa324977878cffdd12183`.
- Migration 147 `db/migrations/147_account_deletion_storage_batch_retry.sql`, blob `1c3b6205f5ba22ba868f379bb6f0c7a98dfc2d33`.

Migration 131 installs the `account_deletion_preflight_inventory_required` trigger, which raises `account deletion preflight inventory is required` if a preflight job is changed to succeeded without a persisted inventory.

Migration 137 adds `mark_account_deletion_storage_manifest(uuid,uuid)`. That function requires a running preflight job, the active claim, and a non-null `inventory_recorded_at`; only then does it set `storage_manifest_recorded_at`.

Migration 144 later replaces `finish_account_deletion_job` and checks `storage_manifest_recorded_at` **before** it updates job status (and before the migration-131 inventory trigger could fire). When the test first attempts successful preflight completion before recording either prerequisite, the function correctly raises `account deletion Storage manifest is required`. The test incorrectly expected the older inventory-trigger message. This is a stale test expectation caused by a later, stronger prerequisite being checked first; it is not evidence that production migration logic is broken.

The correct test sequence remains: verify completion is rejected before inventory/manifest, record inventory, mark the Storage manifest, then complete the preflight. Because the marker function itself requires recorded inventory, the test cannot independently reach the older inventory trigger before the Storage guard without bypassing or weakening the intended contract. The test should therefore expect the first, current Storage-manifest guard.

## Changes published

1. Updated only `backend/test/account-deletion-durable-queue.integration.sql`:
   - clarified the comment to describe the current prerequisite order;
   - changed the expected error from `account deletion preflight inventory is required` to `account deletion Storage manifest is required`.
   - New blob `733295e89326d675be7c3e7c4a7dcd71c1dc1022`, commit `24889b82c1b9221fed49716dad25a3a6d02f75e8`.

2. Added a Node source-contract test requiring the durable-queue test expectation to match migration 144's Storage-manifest guard and to keep that guard before the job update.
   - New blob `c5dcbf017955d1c125f91ec75c2e4df13a036b4e`, commit `684acac9a226e6a3a442c076a1806ad10fd6b788`.
   - The suite now contains 16 test declarations by source inspection; the new assertion has **not** yet been executed.

No production migration, application runtime, role, grant, RLS policy, FK, or deletion safeguard was changed.

## Assistant actions and verification limits

Assistant fetched current `main` versions of the failing SQL test, contract test, migrations 130, 131, 134, 137–144, 147 and current project journals. It inspected the exact function order and traced the expected error to the first preflight-success attempt before inventory/manifest recording. It changed only the SQL integration test and its Node source-contract test, then created this audit.

Assistant did not execute Node, PowerShell, psql, PostgreSQL or the SQL integration suite. The test-only correction remains runtime-unverified. The owner's 15/15 Node result applies to the pre-correction source at commit `01a7fd7f8ab60bfc6e380cef01352b6d6ae2f038`, not to the new 16-test source.

## Next step and safety

After all documentation updates are published, owner should:
1. run `git status --short`, then `git pull --ff-only origin main`;
2. verify `git rev-parse HEAD` equals `git rev-parse origin/main`;
3. run `node --test backend/test/postgres-integration-runner-contract.test.js`;
4. only if all 16 contract tests pass, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`.

Password only at the hidden prompt. Do not stop listener PID 15220, delete `X:\PinPosy-verify-pg18`, touch production/PIN_TRIAL, weaken runner guards, or expose credentials. SQL integration can be marked PASS only after both inline assertions, all 46 SQL tests, and confirmed disposable database cleanup succeed.
