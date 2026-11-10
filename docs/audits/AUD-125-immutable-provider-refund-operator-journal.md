# AUD-125 — Immutable operator journal for provider-refund actions

**Status:** implementation draft committed; database execution and integration verification pending.  
**Branch:** `feat/persisted-boards-api`  
**Migration:** `db/migrations/078_provider_refund_operator_action_journal.sql`  
**Predecessor:** AUD-124 and migrations 073/077.

## Objective

Close the accountability gap identified in AUD-124: a privileged refund reconciliation or failure finalization must not commit unless the authenticated administrator's action is recorded in the same database transaction.

## Changes in migration 078

- Adds `provider_refund_operator_actions`, with a unique client action UUID, target request, operator UUID, action kind, bounded evidence reference, safe before/after status fields, and timestamp.
- Enables RLS and revokes direct table privileges from public, anon, authenticated, and service_role.
- Adds a trigger that rejects UPDATE and DELETE, enforcing append-only behavior independently of normal application conventions.
- Adds four narrowly scoped SECURITY DEFINER wrappers:
  - generation refund reconciliation;
  - regeneration refund reconciliation;
  - generation failure finalization;
  - regeneration failure finalization.
- Each wrapper rechecks `users.is_admin` inside the database, serializes action UUID retries with a transaction advisory lock, and rejects reuse of an action UUID with different immutable parameters.
- Reconciliation wrappers derive provider task identifiers and idempotency keys from locked request/task rows. The browser does not supply those values.
- Finalization wrappers call the existing migration 077 finalizers; reservation release remains controlled by the existing request-status triggers.
- The action insert and financial state transition share one transaction. An insert failure therefore rolls back the state transition.

## Important implementation boundary

The operator UUID is a server-supplied argument and must be populated only from the authenticated request context (for this codebase, `req.userId`). Never accept an operator ID from the browser body. The RPC independently verifies that the supplied user is currently an administrator.

The migration assumes request primary keys are UUIDs and that the generation/regeneration request and task columns match the row types used by migrations 073/077. Confirm these assumptions against the exact deployed schema before applying it.

## Required verification before merge or deployment

1. Run the migration against a disposable PostgreSQL database initialized from the complete migration chain through 077.
2. Confirm the actual request primary-key types and all referenced columns against the deployed schema.
3. Verify migration 078 compiles and all four functions can be created with the target PostgreSQL/Supabase version.
4. Add integration tests for:
   - non-admin and missing operator rejection, including service_role RPC invocation;
   - action insert failure rolling back reconciliation/finalization;
   - duplicate action UUID with identical parameters returning the original result;
   - duplicate action UUID with changed target/operator/evidence/refund fact being rejected;
   - concurrent admins acting on the same request;
   - reconciliation racing finalization;
   - operator demotion before RPC invocation;
   - generation task/provider identifiers being derived from the locked database row;
   - direct table reads/writes denied to service_role and client roles;
   - UPDATE/DELETE rejected by the immutability trigger.
5. Run `backend/npm test` (from the backend directory) and the repository's full CI with actual executed job steps and logs.
6. Only after staging verification, add the minimal Express routes. They must derive the operator ID from `req.userId`, validate/reject unknown input fields, generate or validate action UUIDs, and return only safe action metadata.

## Safety status

- No migration was applied to Supabase or production.
- No provider refund, credit balance, or reservation was changed.
- No staging or production database was accessed.
- No SQL execution, PostgreSQL integration test, backend test, build, lint, or deployment was performed.
- Do not merge or deploy migration 078 until the verification gates above pass.
