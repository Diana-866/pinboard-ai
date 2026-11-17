# PostgreSQL test 34 — billing webhook audit privilege assertion mismatch

**Date:** 2026-11-17  
**Repository:** `Diana-866/pinboard-ai`  
**Branch:** `main`  
**Failing run code HEAD:** `1b855857c4df31b9233819e404bd697591f28acb`  
**Fix commit:** `5cf3b1c2b589ba73205e823ec30f28b9193a1c60`  
**Changed source blob:** `405ebc7b556ea051525513439b37582d7904d2e6`

## Incident

The owner's guarded PostgreSQL run applied the upgrade fixture and migrations 010–156, passed two inline assertions and SQL tests 1–33, then failed test 34/46 at the billing webhook audit privilege assertion. The exact run and cleanup evidence are recorded in `2026-11-17-postgres-test-34-billing-webhook-audit-privileges.md`.

## Investigation performed

Assistant re-read the current test and the relevant active migrations, and compared the broad assertion with the focused privilege integration test.

### Evidence

1. `db/migrations/029_billing_webhook_exceptions.sql` creates `public.billing_webhook_exceptions`, enables RLS, revokes all privileges from `public`, `anon`, `authenticated` and `service_role`, then grants `INSERT` to `service_role`.
2. `db/migrations/042_allow_admin_audit_reads.sql` explicitly grants `SELECT` on this table to `service_role`. Its comment explains that the service-role key is server-only and administrative reads are exposed through the backend `/admin` route guarded by `requireAdmin`.
3. `backend/test/billing-webhook-audit-privileges.integration.sql` expects:
   - no SELECT, INSERT, UPDATE or DELETE for `anon` and `authenticated`;
   - SELECT and INSERT for `service_role`;
   - no UPDATE or DELETE for `service_role`.
4. The broad assertion in `backend/test/postgres-integration.sql` incorrectly treated `service_role` having SELECT as a violation, while simultaneously requiring INSERT. That contradicted migration 042 and the focused integration test. The focused test passed earlier in the owner's failing run, consistent with the intended read/insert-only service-role model.

## Diagnosis

The failure was caused by an internally inconsistent broad test assertion, not by evidence that migration 042 granted an unintended privilege. The intended contract is append-only audit writes plus server-side administrative reads: service_role SELECT + INSERT, without UPDATE or DELETE; client roles receive none of these four privileges.

## Change made

Only `backend/test/postgres-integration.sql` was changed. Its inline assertion now checks the complete role/privilege matrix already expressed by the focused test:
- deny SELECT/INSERT/UPDATE/DELETE to `anon` and `authenticated`;
- require SELECT and INSERT for `service_role`;
- deny UPDATE and DELETE to `service_role`.

The exact replacement was guarded in the editing step: the old assertion block had to match exactly once. No migration, production SQL, backend application code, runner, CI configuration, or database was changed.

## Verification status

**Source correction published; runtime verification pending.**

- GitHub accepted the source update at commit `5cf3b1c2b589ba73205e823ec30f28b9193a1c60`.
- New source blob: `405ebc7b556ea051525513439b37582d7904d2e6`.
- No Node tests, PowerShell parser, psql, PostgreSQL runner, Bash concurrency scripts or CI workflows were run by the assistant in this session.
- The earlier owner run remains FAIL; the test correction is not retroactively a passing result.
- Tests 35–46 from the earlier run remain unexecuted.

## Next steps

1. Owner synchronizes to latest main and confirms clean tree.
2. Repeat Node contract gates and PowerShell parser gate as specified in the current `docs/USER_ACTIONS.md`.
3. Only after those pre-gates pass, run the guarded PostgreSQL integration runner.
4. Require all 46/46 ordered SQL tests to pass and disposable DB cleanup to be confirmed. Stop at the first failure.
5. Keep the separate nine Bash concurrency scripts as an independent unverified gate.

## Safety

Preserve PostgreSQL listener PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`. Do not stop/reconfigure the server, bypass runner guards, use production/`PIN_TRIAL`, or disclose secrets. This investigation used GitHub source reads and a source-only test edit; it did not connect to any database.
