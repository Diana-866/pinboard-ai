# AUD-130 — Safe staging validation runbook for provider-refund actions

## Scope

This runbook validates migration 078 and the four administrative provider-refund endpoints without touching Production. It is intentionally a manual gate: the current execution environment can inspect and edit GitHub files but cannot execute PostgreSQL or the backend test suite.

## Required isolated environment

Use a disposable Supabase/PostgreSQL project with the same schema and database roles as the target environment. Do not use the Production project. The database must contain the schema produced by migrations 001–077, including the roles `anon`, `authenticated`, and `service_role`.

Before testing:
1. Confirm the disposable project URL and keys are not Production credentials.
2. Ensure no real customer records or payment/provider credentials are present.
3. Take a snapshot/export so the disposable project can be recreated.
4. Confirm migrations 073 and 077 are already applied in the disposable project.

## Database validation

1. Open the disposable project's SQL editor.
2. Run the complete `db/migrations/078_operator_action_journal.sql` file.
3. Stop immediately on any SQL error; do not continue with a partially applied migration.
4. Run the complete `backend/test/provider-refund-operator-actions.integration.sql` file in one transaction. The script creates temporary test users/requests, checks atomic rollback and journal protections, then ends with `ROLLBACK`.
5. Confirm the SQL editor reports success and that no fixture users or requests remain.
6. Run the additional multi-session concurrency checks before approving the migration:
   - Session A holds the operator row lock while Session B attempts demotion and an action; verify the action rechecks `is_admin` after acquiring both user locks.
   - Two operators attempt the same logical action with different action UUIDs.
   - Two operators concurrently target one another's accounts (A targets B while B targets A); verify both transactions request user locks in ascending UUID order and neither is left in a deadlock cycle.
   - Operator deletion races with an action.
   - Target-account deletion races with an action.
   - The same operator acts on their own request.
   Record which transaction commits and verify there is no duplicate journal row or partial financial mutation.

The current SQL integration script does not prove multi-session concurrency. Migration 078 now acquires the operator and target user rows in ascending UUID order to avoid cross-target lock inversion; the two-session test must still confirm the actual PostgreSQL behavior. A passing single-session script is necessary but not sufficient.

## Backend validation

On a checkout of the same branch/commit:
1. Run `cd backend`.
2. Install dependencies using the repository lockfile and the project's normal package manager.
3. Run `npm test`.
4. Confirm the new `admin-provider-refund-actions.test.js` tests pass with the existing backend suite.
5. Run the project's normal lint/build checks if configured; `backend/package.json` currently exposes `npm test` but no backend lint/build script.

## Staging API smoke test

Deploy only to a separate staging backend configured against the disposable database. Never point staging at Production for this test.

For each route, verify:
- No token → 401.
- Valid non-admin token → 403.
- Admin token with malformed payload → 422 and no journal row.
- Admin token with unknown request → 404.
- Valid action → success receipt containing only action metadata and timestamp.
- Exact retry with the same action UUID and identical payload → same receipt timestamp, one journal row.
- Retry with changed payload → 409.
- Replay after administrator demotion → 403.
- More than 20 calls per source IP in one minute → 429.

Use provider outcomes and evidence references from synthetic fixtures only. Do not call a real provider, issue a real refund, or submit real customer information.

## Production approval gate

Do not apply migration 078 or enable these routes against Production until all of the following are true:

- Migration applies cleanly to the disposable database.
- SQL integration test passes.
- Multi-session concurrency cases pass.
- Backend `npm test` passes.
- Staging smoke tests pass.
- A reviewed backup/restore point exists.
- A rollback plan is documented. Since the journal is append-only and the workflow is financially sensitive, rollback should be a reviewed forward-fix or controlled restore—not an improvised DROP TABLE.

## Current execution status

- Migration 078 and SQL integration test are committed to the feature branch but have not been executed.
- Backend adapter, routes, and unit tests are committed but have not been executed.
- No staging database, Production database, provider API, or deployment was touched by this work.
- On the inspected branch commit `34d9a6d`, GitHub Actions reported failures for the persisted-boards frontend/backend jobs, atomic-payment integration job, and Prodamus backend-tests job. GitHub returned `steps=null` and `logs_url=null`; retrieving job logs returned `BlobNotFound`. The cause is unknown; none of these runs is evidence of passing tests or of an application defect. Vercel reports `build-rate-limit`, which is a deployment quota status, not an application test result.
