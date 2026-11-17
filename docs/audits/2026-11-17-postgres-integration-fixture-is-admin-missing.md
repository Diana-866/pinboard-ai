# PostgreSQL SQL integration — upgrade fixture omitted baseline users.is_admin

## Owner runtime evidence (2026-11-17)

The owner synchronized a clean local checkout from commit `c047f44c` to `5d3548a58eb7e53469cf43893f189403a2c2088b`; `git rev-parse HEAD` and `git rev-parse origin/main` matched.

The guarded `scripts/verify-integration.ps1` run then:
- verified the clean synchronized checkout and approved temporary PostgreSQL listener PID 15220 / data directory `X:\\PinPosy-verify-pg18`;
- accepted the temporary role password only through its hidden prompt and verified server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`;
- created disposable database `pinposy_sqlint_1b70f80297f04d60`;
- applied the CI upgrade fixture and all 140 migrations `010–149`;
- passed both CI inline assertions and SQL integration tests 1/46 (`pinterest-unknown-schedule-reconciliation.integration.sql`) and 2/46 (`pinterest-stale-schedule-recovery.integration.sql`);
- failed test 3/46, `pinterest-schedule-cancellation-race.integration.sql:93`, with PostgreSQL error: `column "is_admin" of relation "users" does not exist`. The failing insert explicitly names `(email, tariff_plan, token_version, is_admin)`;
- terminated sessions, dropped the disposable database and printed `Removed disposable database pinposy_sqlint_1b70f80297f04d60`.

Tests 4–46 did not run. The SQL integration suite is NOT PASSED. Cleanup is confirmed. The output also contains PostgreSQL NOTICE messages (including expected `DROP ... IF EXISTS` notices); these were not fatal after the PowerShell stderr fix.

## Source investigation

Assistant fetched current `main` source and compared:
- Canonical schema `db/migrations/001_baseline.sql`, blob `105a13cfba4746206191dcf2bd68d5514912f08c`, defines `public.users.is_admin boolean default false`.
- CI upgrade fixture `backend/test/postgres-integration-upgrade-fixture.sql`, before fix blob `49a817c5e238eda201b8821a9c052585f36e0217`, defined `users` without `is_admin`.
- GitHub Actions workflow `.github/workflows/atomic-payment-integration.yml`, before fix blob `a7960da87693304e46fb59c37e1b5b10705f8935`, contained the same incomplete legacy fixture.
- Failing SQL test `backend/test/pinterest-schedule-cancellation-race.integration.sql`, blob `8d6f92fc6633d1530228ad0e6f1ddc63a81617b7`, inserts an admin user with `is_admin=true`.
- The Node contract test `backend/test/postgres-integration-runner-contract.test.js` requires the standalone fixture to remain byte-for-byte aligned with the workflow's fixture setup (apart from role creation and a leading explanatory comment).

**Root cause identified:** the CI/standalone upgrade fixture omitted a column that belongs to the canonical baseline schema. The SQL test is correctly using the baseline users contract; the disposable fixture was incomplete. This is not a missing application migration and should not be “fixed” by adding an ad hoc production migration. The fixture is designed to represent a legacy schema, but this column is part of the stable baseline contract and is not supplied by migrations 010–149.

## Source changes published

- Added `is_admin boolean default false` to the `public.users` fixture in the CI workflow. Commit `763f91a0e58a505df9823f37479a08a08856f388`; blob `b1e054a50fc7a8ad3c742a2fecc94a41e0d5bf9c`.
- Added the same column to `backend/test/postgres-integration-upgrade-fixture.sql`. Commit `698bcb4b07df2b636a4378679dbbc1de55f69ac2`; blob `3cc57549972b13d2d83bd2ec58330eae1d8c527f`.
- Added a Node contract test asserting that the standalone fixture includes the canonical `users.is_admin` column, while retaining the existing fixture/workflow equality check. Commit `7a9a53f9bae5fdce29d4941295e17ce8b802985a`; blob `ff9fdd0b166093cbb78c6dd9426cb3d98fcbb239`.

These changes were made through GitHub source-file updates. Assistant did not execute Node, PowerShell, psql or PostgreSQL. The new contract test and full integration rerun remain pending owner execution. Do not claim the fix is runtime-verified until the owner supplies output.

## Safety and next step

Only the uniquely named disposable database was touched by the owner's guarded run; runner confirmed its removal. Do not stop listener PID 15220, delete `X:\\PinPosy-verify-pg18`, touch production/PIN_TRIAL, weaken runner guards or expose credentials.

Next owner sequence after the documentation commits are complete:
1. Fast-forward only from origin/main and verify a clean checkout with equal HEAD/origin/main hashes.
2. Run `node --test backend/test/postgres-integration-runner-contract.test.js`.
3. If it passes, rerun the guarded process-scoped runner:
   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1`.
4. Preserve the full output and verify all 46 SQL tests plus disposable database cleanup before declaring PASS.
