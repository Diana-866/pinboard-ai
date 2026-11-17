# PostgreSQL integration test 29: retention inventory fixture path collision and migration 156 contract regex

Date: 2026-11-17

## Owner-provided execution evidence

The owner supplied a guarded Windows PostgreSQL runner transcript from clean main commit `5aee55dcf504dbb4e8ece704733681afcb4436f0`.

- The PowerShell Parser API reported `PowerShell Parser PASS: 0 syntax errors`.
- The runner verified the dedicated PostgreSQL listener PID 15220, port 55439, data directory `X:\\PinPosy-verify-pg18`, and temporary verification role.
- It created disposable database `pinposy_sqlint_ebd8138f1c3143c8`.
- The CI upgrade fixture applied.
- All 147 migrations 010–156 applied.
- Both CI inline assertions passed.
- Ordered SQL integration tests 1–28 passed, including test 28 `pin-image-deletion-claims.integration.sql`.
- Test 29 `pin-image-retention-inventory.integration.sql` failed on its first managed-image pin insert with `pin image object is not available for new references`.
- The runner terminated sessions for and dropped only the disposable database; removal was confirmed.
- Tests 30–46 were not run.

The owner also supplied a Node assertion failure in the migration-156 contract. The actual migration contains the expected `r.result_pin ->> 'image_url'` predicate, while the expected regular expression was over-escaped. The supplied excerpt did not include the aggregate Node test count, so no aggregate pass/fail count is inferred.

## Diagnosis

### Test 29 lifecycle path collision

The retention test declared fixed paths:

- `pins/generation-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png`
- `pins/generation-ffffffffffffffffffffffffffffffff.png`

The preceding test 28 uses the same `eeee...eeee.png` object path and explicitly creates a lifecycle state for it as part of deletion/tombstone coverage. The ordered SQL suite runs in one disposable database, so lifecycle rows persist between test files. When test 29 tried to insert a pin referencing the fixed old path, the migration-070 `guard_pin_image_reference_write()` trigger correctly found the pre-existing unavailable lifecycle state and rejected the new reference.

This is a test-data isolation defect. The trigger's rejection is the intended production safety behavior and must not be weakened.

### Migration 156 Node contract regex

The migration-156 contract used double-escaped regex tokens in regex literals (for example `r\\.result_pin` and `[\\s\\S]`), unlike the correctly formed migration-155/154 contracts immediately above it. The actual SQL contains ordinary `r.result_pin`, so the contract failed to match valid source.

## Changes published

1. Corrected all four migration-156 contract regex literals to use the same escaping convention as adjacent migration-154/155 contracts. No production migration was changed.
2. Changed test 29's old-image path to derive from its unique generated test user UUID, and its replay path to derive from its generated project UUID. Their public URLs now append the corresponding unique paths. This prevents collisions with test 28 and other ordered tests while preserving valid 32-hex generation paths.
3. No production SQL, lifecycle guard, migration, CI workflow, or runner was changed.

## Exact source blobs and commits

| Path | Blob SHA | Commit |
|---|---|---|
| `backend/test/postgres-integration-runner-contract.test.js` | `a381cd497fc199e5fcba6464c842fd5f5fc664d1` | `a586d37c347e406b8511436f0aba8044a0812b9e` |
| `backend/test/pin-image-retention-inventory.integration.sql` | `84f8c6c1ebd3d3c529161019c731d2afbbfe882c` | `3d8961c5e68f70c5573e6e8f4d45d2fdae827d39` |

## Assistant actions and verification limits

The assistant fetched the current migration 156, the Node contract, test 29, test 28, migrations 070, 103, 108, 135, 145 and 154, and the current project state/user-action/register documents. It compared the overlapping path literals and inspected the reference-write trigger. It then updated only the two test files and fetched both back from GitHub to confirm their published blob SHAs and intended edits.

The assistant did not execute Node, PowerShell, psql, PostgreSQL, Bash or CI. The corrected Node contract and SQL fixture are not runtime-verified. The owner's Parser PASS applies to the unchanged runner script, but the Node gate failed and must pass before another guarded SQL run.

## Next owner gates

1. Synchronize cleanly to latest `origin/main`.
2. Run the three Node contract files and require every test to pass (the migration-156 suite was previously expected to contain 45 tests).
3. Re-run the PowerShell Parser API against `scripts/verify-integration.ps1`; require 0 syntax errors.
4. Only after both gates pass, run the guarded PostgreSQL integration runner.
5. Require the upgrade fixture, 147 migrations 010–156, both CI inline assertions, all 46 ordered SQL tests, and confirmed disposable database cleanup.

Preserve PostgreSQL listener PID 15220, port 55439 and data directory `X:\\PinPosy-verify-pg18`. Do not bypass guards, use production/`PIN_TRIAL`, or share credentials. Stop at the first failure. Nine Bash concurrency scripts remain outside this runner and are not covered by a successful SQL integration result.
