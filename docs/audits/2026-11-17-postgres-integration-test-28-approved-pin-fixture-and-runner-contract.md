# PostgreSQL integration test 28/46 — approved-pin fixture and stale Windows migration contract

Date: 2026-11-17  
Repository: `Diana-866/pinboard-ai`, branch `main`  
Owner-reported checkout before this rerun: `d0155f20da307fc774da18c1ba69e44b19dfcada`

## 1. Owner-provided execution evidence

The owner supplied a rerun transcript after synchronizing to the migration-153 source baseline.

- Node contract suite: the supplied assertion failure shows the Windows replay contract still expected `10..152`, while the current `scripts/verify.ps1` contains `10..153`. The displayed Node failure output is an assertion mismatch; the complete suite summary was not repeated in this message, so no new pass count is inferred.
- PowerShell Parser API: **PASS, 0 syntax errors** for `scripts/verify-integration.ps1`.
- Guarded PostgreSQL runner verified a clean synchronized `main` checkout at `d0155f20da307fc774da18c1ba69e44b19dfcada`, listener PID 15220, temporary data directory `X:\\PinPosy-verify-pg18`, and the expected loopback server identity.
- The legacy/upgrade fixture, all 144 migrations 010–153, and both CI inline assertions passed.
- SQL tests 1–27/46 passed.
- Test 28/46, `pin-image-deletion-claims.integration.sql`, failed while inserting a schedule snapshot with PostgreSQL error `only approved pins can be scheduled`, raised by `guard_pin_schedule_insert_requires_approved_pin()` from migration 148.
- Tests 29–46 did not run.
- Cleanup succeeded: the runner terminated zero remaining sessions, dropped disposable database `pinposy_sqlint_87acdec0a62c4574`, and confirmed its removal. The runner exited nonzero because psql returned exit 3.

The owner ran the PostgreSQL runner even though the Node contract gate had failed. Record this as a gate-order deviation. The runner's own clean-main, listener, and server-identity safety guards passed; no safety bypass is shown.

## 2. Diagnosis

### 2.1 SQL test fixture did not satisfy the new publication invariant

Migration 148 added `guard_pin_schedule_insert_requires_approved_pin()`. Before a schedule row is inserted, it locks the pin and verifies that the pin belongs to the schedule owner and has status `approved`. This is an intentional production invariant: a draft/pending/rejected pin must not be scheduled.

The schedule-snapshot section of `backend/test/pin-image-deletion-claims.integration.sql` created its fixture pin with only `(id, board_id)`, relying on the schema default status, then immediately inserted a schedule. The new guard correctly rejected that fixture because it did not explicitly create an approved pin. This is a test-fixture compatibility defect, not evidence of a production SQL defect and not a reason to weaken migration 148.

Correction: in the schedule-snapshot test block only, create that fixture pin with `status='approved'`. Other pin fixtures and production SQL are unchanged.

### 2.2 Node contract assertion lagged behind migration 153

`backend/test/verify-script-migration-chain.test.js` asserted that `scripts/verify.ps1` contained `10..152`, although the current script and migration chain correctly cover `10..153` (144 migrations). Correction: update that exact assertion to `10..153`. No runner or migration behavior is changed by this correction.

## 3. Changes published

| Path | Commit | Blob SHA | Purpose |
|---|---|---|---|
| `backend/test/pin-image-deletion-claims.integration.sql` | `e4f2d72fdfc4fc547b356c46db697dcba8dfee22` | `2beed365cabe903e1fb8a47a5189e8bfb98a0fb3` | Explicitly mark the schedule-snapshot fixture pin approved |
| `backend/test/verify-script-migration-chain.test.js` | `982500d43a81bd3b2a8ba53aa1534b422e103ce7` | `d4fa2a7d659a758c61bc8b63b75e624588801e71` | Align Windows replay chain assertion with 010–153 |

No production migration, production function, workflow, runner script, database, or PostgreSQL cluster was changed in this follow-up.

## 4. Assistant actions and verification limits

1. Re-fetched current `main` source and documentation before editing.
2. Compared the failing SQL statement with migration 148's approved-pin trigger.
3. Located the schedule-snapshot fixture insertion and changed only its status to `approved`.
4. Compared the failing Node assertion with current `scripts/verify.ps1` and updated the expected upper bound from 152 to 153.
5. The first attempt to update the Node assertion used an incorrect exact-match escape string and made no repository change; the assertion was re-fetched and then updated successfully. During documentation-register editing, an initial helper expression also failed locally before the GitHub update call because of a malformed JavaScript regular-expression literal; no repository write occurred, and the register was then rebuilt using line-based parsing and published. Both failed authoring attempts are retained here for chronology.
6. Assistant did not execute Node, PowerShell, psql, or PostgreSQL. The updated source files require owner runtime verification.
7. The full SQL suite remains **NOT PASSED**. Tests 29–46 remain unexecuted.

## 5. Required next gates

1. Synchronize local checkout to the final documentation commit on `origin/main`; verify clean `main` and equal HEAD/origin/main.
2. Run the three-file Node contract/migration suite. Stop on any failure.
3. Run the PowerShell Parser API check for `scripts/verify-integration.ps1`.
4. Only after both gates pass, rerun the guarded `scripts/verify-integration.ps1` on the same approved disposable PostgreSQL cluster. Do not stop or reconfigure PID 15220, change its data directory/port, bypass guards, or use production/PIN_TRIAL.
5. Target result: fixture, 144 migrations, two inline assertions, all 46 SQL tests, and disposable database cleanup all pass. If a test fails, preserve the first failure and cleanup output; do not report tests after it as passed.

The assistant has no access to the owner's local PowerShell session or PostgreSQL cluster. All runtime results above are owner-provided evidence.
