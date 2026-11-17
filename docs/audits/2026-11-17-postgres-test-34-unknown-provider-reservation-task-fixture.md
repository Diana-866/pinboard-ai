# PostgreSQL test 34: model the durable image task for an unknown provider outcome

## Owner-provided verification evidence

The owner synchronized a clean local checkout to `main` at `0c413265da7c6b09c0ed6fd58d68ed8e299a5a8b` (HEAD matched origin/main).

- Node contract/migration/replay-chain tests: **45/45 PASS**.
- PowerShell Parser for `scripts/verify-integration.ps1`: **0 syntax errors**.
- Guarded runner verified the intended local PostgreSQL listener (PID 15220, port 55439, data directory `X:\\PinPosy-verify-pg18`) and created disposable database `pinposy_sqlint_9f82b9c7dc774317`.
- Upgrade fixture applied; **147 migrations 010–156** applied; both CI inline assertions passed.
- Ordered SQL tests **1–33 passed**. Test **34/46** (`postgres-integration.sql`) failed at the assertion `unknown provider outcome must retain its credit reservation`.
- The runner successfully terminated sessions and dropped the disposable database. Tests 35–46 did not run.

## Diagnosis

This is a test-fixture mismatch, not a production migration defect.

Migration 054 installs `sync_pin_generation_credit_reservation()`, which retains a reservation for an unknown outcome only if the request represents potentially billable image-provider work. Migration 088 refines that behavior: when a request transitions to `unknown` and has **no** row in `pin_generation_tasks`, its image-credit reservation is released. The durable image-task plan is written before the first image-provider call, so no task row means no image task could have been submitted. The request itself remains `unknown` and is not automatically replayed.

The failing block in `backend/test/postgres-integration.sql` manually inserted a `pin_generation_requests` row, reserved 60 credits, and changed the request to `unknown`, but did not create a durable image-task row. The trigger therefore correctly released the reservation under migration 088. The test expected the other valid case: a task exists and the provider outcome is ambiguous.

The existing `backend/test/pin-generation-credit-reservations.integration.sql` already demonstrates the correct fixture: insert a `pin_generation_tasks` row with status `submitting` before marking the request's provider outcome unknown.

## Change published

Only `backend/test/postgres-integration.sql` changed. Before changing `reservation-test-key-0002` to `unknown`, the fixture now inserts one `pin_generation_tasks` row linked to that request, with task index 1, the test user/board, a deterministic prompt/model/aspect ratio, and status `submitting`. A comment explains why this row is necessary and distinguishes it from an ambiguous text-plan request with no image tasks.

- Source commit: `3d1e7827faf703ecfb86bff67a626ecf6a264321`
- Final source blob: `32d82afb8a9bff3b86b096638465aa4dae70656a`

No production SQL, migration, application code, runner, CI workflow, or persistent PostgreSQL data was changed. The prior -40 adjustment through `adjust_credits_balance_and_log` remains in place, so the reservation fixture still begins with 100 credits and the subsequent arithmetic expectations remain unchanged.

## Assistant actions and verification limits

1. Fetched the current SQL test and relevant migration sources from GitHub at the current main branch.
2. Traced the failing assertion to the reservation trigger in migration 054 and the no-image-task release rule in migration 088.
3. Compared the failing fixture with the already-existing reservation integration test, which inserts a `submitting` task before asserting reservation retention for an unknown provider outcome.
4. Updated only the failing SQL fixture and published the change.
5. This audit, `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, and `docs/DOCUMENTATION_REGISTER.md` record the owner evidence, exact source blob, rationale, and next verification steps.

The assistant did **not** execute Node, PowerShell, psql, PostgreSQL, Bash, or CI. The changed fixture is **NOT RUNTIME-VERIFIED**. The latest owner evidence remains Node 45/45 PASS, Parser 0 errors, SQL tests 1–33 PASS / test 34 FAIL before this correction. Tests 35–46 have not run.

## Next owner gates

1. Synchronize cleanly to the latest `origin/main`.
2. Re-run the three Node contract/migration/replay-chain test files; require all tests to pass (45 expected unless contracts are intentionally changed).
3. Re-run the PowerShell Parser check; require 0 syntax errors.
4. Only after both gates pass, run `scripts/verify-integration.ps1`. Require the upgrade fixture, 147 migrations 010–156, two CI assertions, **46/46 ordered SQL tests**, and confirmed disposable database cleanup.
5. Stop on the first failure and provide the complete output. Do not bypass guards or use production/`PIN_TRIAL`.

Preserve PostgreSQL listener PID 15220, port 55439, and data directory `X:\\PinPosy-verify-pg18`. Do not stop or reconfigure the server. Do not share passwords, tokens, or `.env` values. The nine Bash concurrency scripts remain a separate unverified stage.
