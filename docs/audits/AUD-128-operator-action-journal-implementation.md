# AUD-128 — Migration 078 and operator-action integration coverage

## Delivered

- `db/migrations/078_operator_action_journal.sql`
- `backend/test/provider-refund-operator-actions.integration.sql`

## Migration behavior

The migration adds `public.provider_refund_operator_actions`, an append-only journal for administrator-assisted provider-refund reconciliation and failure finalization.

- Operator identity is a UUID FK to `public.users(id)` with `ON DELETE RESTRICT`. Deleting an operator cannot erase accountability history.
- The journal has both a UUID action key and a logical uniqueness key `(request_kind,target_request_id,action_kind,task_index)`. Replaying a request with a new UUID cannot repeat a completed logical action.
- Evidence type is allowlisted. Evidence references are bounded to 8–500 safe ASCII identifier characters; whitespace, email-like values, and URL schemes are not accepted.
- Direct table access is revoked from PUBLIC, anon, authenticated, and service_role. UPDATE, DELETE, and TRUNCATE are blocked by triggers.
- Four narrow SECURITY DEFINER RPCs are exposed to service_role: generation/regeneration reconciliation and generation/regeneration finalization. The internal worker is not executable by API roles.
- Each call first performs a non-locking admin admission check, discovers the target owner, then locks the operator and target user rows in ascending UUID order and rechecks `is_admin IS TRUE` under lock. The locked recheck serializes action execution against administrator demotion without allowing cross-target lock inversion.
- The worker derives target owner, request idempotency key, and provider task ID from database rows. The client cannot nominate another owner or provider task.
- Lock order is user rows sorted by UUID (operator + target; one row when they are the same user) → request → generation tasks in `task_index` order → active credit reservation. Sorting both user rows prevents the A-targets-B / B-targets-A deadlock pattern while retaining the demotion race guarantee.
- The existing migrations 073/077 RPCs remain the only financial workflow mutators. The operator journal insert occurs in the same SQL transaction, so a journal insert failure rolls back the provider-refund fact or finalization.
- Reconciliation action receipts record the unknown-to-known refund fact; finalization receipts record processing-to-failed. No raw provider payload, request key, prompt, claim token, or provider secret is stored.

## Integration coverage added

The SQL integration file creates isolated users and generation/regeneration requests inside a transaction and rolls everything back. It covers:

- Successful generation and regeneration reconciliation and finalization.
- Rollback of the provider-refund fact and 073 audit row when journal insertion is deliberately failed.
- Exact action replay returning the original timestamp without a duplicate row.
- Reuse of an action UUID with changed evidence being rejected.
- Non-admin rejection and replay rejection after administrator demotion.
- Reservation release only through the existing finalization triggers.
- Denial of direct journal privileges to service_role/anon/authenticated.
- Execute grants only for the four intended service_role RPCs; the internal worker remains inaccessible.
- UPDATE and TRUNCATE rejection.
- Operator-owned target request (`operator_user_id` equals the target account), verifying the sorted lock query safely handles one distinct user row.

## Important remaining work / verification limits

- The database layer is complemented by the four Express admin mutation endpoints and unit tests documented in `AUD-129-admin-provider-refund-api.md`. The backend passes the authenticated operator ID from verified `req.userId`, never from a browser-supplied body field; migration 078 independently rechecks that identity under row lock.
- The migration and integration SQL have **not** been executed. No PostgreSQL/Supabase database or SQL parser is available in this execution context; GitHub source review is not a substitute for applying migration 078 to a disposable database and running the integration file.
- Multi-session concurrency tests remain required for demotion/action races, two operators targeting the same request, cross-target actions (A targets B while B targets A), operator deletion, target-account deletion, and operator==target. The migration now orders the two user-row locks by UUID, but a single-session transaction fixture cannot prove these interleavings.
- Do not apply migration 078 to Production until the disposable-database run passes and the concurrency cases are covered.

## Review notes

- Confirmed source contracts in migrations 053, 054, 063, 064, 066, 072, 073, 074, 076, and 077.
- Confirmed request IDs are BIGINT, operator IDs are UUID, and generation tasks are indexed 1–10.
- Re-read the committed migration and test file after correcting a duplicated migration body, evidence-validation quoting, and SQL dollar-quote delimiters.
- Static review only; no tests, build, lint, CI, staging, production, provider API, or deployment was run.
