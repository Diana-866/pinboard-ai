# Pinterest unknown-schedule reconciliation integration failure

Date: 2026-11-17

## Owner-provided verification transcript

The owner synchronized the local checkout from `13166c8c` to `c047f44c` with `git pull --ff-only origin main`. The worktree was clean before pull; both `git rev-parse HEAD` and `git rev-parse origin/main` returned:

`c047f44cce666e6dbe844cf318a4b314dd60040c`

Owner ran:

- `node --test backend/test/postgres-integration-runner-contract.test.js`: **12 tests, 12 pass, 0 fail**.
- Windows PowerShell Parser API against `scripts/verify-integration.ps1`: **PowerShell Parser: PASS**.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`.

Runner verified the clean synchronized checkout, approved temporary listener PID `15220`, data directory `X:\PinPosy-verify-pg18`, and PostgreSQL identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`. Password was supplied only through the hidden prompt.

Disposable database: `pinposy_sqlint_b39373fd69614fe7`.

The runner successfully:
1. Created the disposable database.
2. Applied the CI legacy/upgrade fixture.
3. Applied all 139 migrations `010–148`.
4. Completed both CI inline assertions.
5. Started the 46 ordered SQL integration tests.

The first SQL integration test, `backend/test/pinterest-unknown-schedule-reconciliation.integration.sql`, failed at line 110 with the actual PostgreSQL error:

`schedule remote pin identity conflict incorrectly promoted schedule`

The runner reported psql exit code 3. It then terminated sessions, dropped only the disposable database, and printed:

`Removed disposable database pinposy_sqlint_b39373fd69614fe7`

Therefore cleanup is confirmed. Tests 2–46 did not run. The SQL integration suite is **NOT PASSED**.

Some PostgreSQL NOTICE context lines remain mojibake in the owner terminal output, but the actual failing assertion text and runner exit code are readable. The stderr/exit-code fix did work sufficiently for the runner to proceed through the entire migration chain, both inline assertions, and into the SQL test stage.

## Assistant source inspection

Read-only GitHub retrieval on `main` confirmed:

- `backend/test/pinterest-unknown-schedule-reconciliation.integration.sql` blob: `20f04be636298e0cdb33ce1725cd2558e4121e9e`.
- `db/migrations/091_reconcile_confirmed_pinterest_unknown_schedules.sql` blob: `6da23cf6851e28e8fbecbf4d7a3831008ab9c86b`.
- `db/migrations/092_pinterest_stale_schedule_recovery_requires_exact_publication_evidence.sql` blob: `acca458a7c4abb236ea056e18c46c0628355ceb4`.
- `db/migrations/093_pinterest_schedule_remote_pin_identity_fencing.sql` blob: `03d126ad051bd192d32a64d06ac0f5b9e007e895`.
- `db/migrations/148_atomic_pin_publication_status_fencing.sql` blob: `5bdad254de1d4bb19d68bd9618561da55216f9b8`.

The failing test deliberately creates a known-good publication attempt and publication ledger with remote ID `remote-confirmed-123`, then sets the schedule's already-recorded remote ID to `remote-already-recorded`. It expects reconciliation to leave the schedule `unknown`, preserve `remote-already-recorded`, and report zero reconciled rows.

Migration 093's source redefines `reconcile_confirmed_pinterest_schedule_successes()` with the guard:

`(s.pinterest_pin_id is null or s.pinterest_pin_id=a.pinterest_pin_id)`

That condition appears intended to reject the exact conflicting-ID scenario in the test. Migration 093 also redefines `claim_due_pin_schedules()` with the same remote-ID guard for stale `publishing` recovery. Migration 148 was inspected and does not redefine either reconciliation function.

**No root cause is claimed yet.** Static source inspection of migration 093 appears consistent with the test's expected behavior, while the fully migrated disposable database demonstrably promoted the conflicting schedule. The effective function definition in the test database may differ from the inspected migration (for example, a later migration may replace it), or another runtime interaction may be involved. This discrepancy must be resolved from database evidence before changing migration SQL or weakening the test.

## Next diagnostic step

Improve the failing test's error diagnostics (not its expected behavior) to report:
- the value returned by `reconcile_confirmed_pinterest_schedule_successes()`;
- actual schedule `status` and `pinterest_pin_id` after the call;
- the effective runtime function source from `pg_get_functiondef('public.reconcile_confirmed_pinterest_schedule_successes()'::regprocedure)`.

Also inspect the effective `claim_due_pin_schedules(integer)` definition after all migrations, and search migration history for later redefinitions. Then rerun only through the existing guarded disposable-database runner. Do not touch production/PIN_TRIAL, listener PID 15220, or persistent verification data. Do not mark the SQL suite passed until all 46 tests and cleanup complete.

## Assistant actions and limits

Assistant:
1. Interpreted the owner's exact transcript and separated source-contract/parser PASS from SQL integration failure.
2. Retrieved the four tracking documents, failing SQL test, migrations 091–093 and migration 148 from GitHub `main`.
3. Compared the test's conflicting remote-ID case with migration 093's explicit guard.
4. Recorded the discrepancy and next evidence-gathering step here and in the project journal/action log/register.

Assistant did not run local PowerShell, Node, psql or PostgreSQL; did not connect to any database; did not modify application source or migrations in this diagnostic pass; did not access production/PIN_TRIAL; and did not handle credentials. The only database execution evidence is the owner's transcript above.


## Follow-up: failure-only runtime diagnostics added (2026-11-17)

After the first owner run, assistant re-fetched the failing test and migration 093. Migration 093 statically includes the expected schedule-vs-attempt remote ID predicate, but the disposable runtime database nevertheless failed the conflict assertion. No migration logic was changed because the root cause is unproven.

Assistant updated only the failing test's diagnostic branch. If the remote-ID conflict assertion fails again, it now reads the actual schedule status and remote ID, retains the reconciliation row count, and includes `pg_get_functiondef('public.reconcile_confirmed_pinterest_schedule_successes()'::regprocedure)` in the exception. The assertion's expected values and safety semantics are unchanged.

Updated test blob: `95d01cccc1e8ec722b5c101e9a7939cda1b393c0`; commit: `aa1eb96daaf4b2d3148f596372850e43b5052b7a`.

This patch has not been executed by the assistant. No Node, PowerShell, psql or PostgreSQL runtime was available; no database was created or modified by the assistant. The owner must rerun through the existing guarded disposable-database runner. SQL integration remains NOT PASSED.
