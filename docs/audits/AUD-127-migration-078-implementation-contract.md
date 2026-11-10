# AUD-127 — Migration 078 implementation contract review

## Scope

Prepare the concrete database contract for an operator-action journal and four administrator-only RPCs layered over migrations 073 and 077. This review checks exact request identifiers, ownership fields, existing RPC signatures, SECURITY DEFINER conventions, and the available SQL integration-test harness.

This is a source review and implementation contract only. No migration was applied, no database was accessed, and no tests or deployment were run.

## Confirmed schema and API contracts

- `public.users.id` is UUID and `is_admin` is boolean with default false (`001_baseline.sql`).
- Generation and regeneration request IDs are BIGINT identity keys. Both request tables store `user_id` as TEXT and `idempotency_key` as TEXT/VARCHAR; request IDs are the correct external target identifiers for the new RPCs.
- Generation requests are `public.pin_generation_requests`; their tasks are `public.pin_generation_tasks`, linked by `generation_request_id`, `user_id`, and `task_index`.
- Regeneration requests are `public.pin_regeneration_requests`.
- Both workflows use `public.pin_generation_credit_reservations`, keyed by `user_id` + `idempotency_key`; only `status='reserved'` is active.
- Generation reconciliation is `reconcile_pin_generation_provider_refund(text,text,integer,text,boolean,text)`.
- Regeneration reconciliation is `reconcile_pin_regeneration_provider_refund(text,text,text,boolean,text)`.
- Generation finalization is `finalize_reconciled_pin_generation_failure(text,text)`.
- Regeneration finalization is `finalize_reconciled_pin_regeneration_failure(text,text)`.
- All four existing financial RPCs are SECURITY DEFINER, pin `search_path=pg_catalog,public`, and grant EXECUTE to `service_role` while revoking client roles.
- Existing integration SQL uses transaction-scoped fixtures and ends with ROLLBACK. The backend package currently exposes `npm test` as `node --test`; SQL integration files are separate and require a disposable PostgreSQL/Supabase-compatible database.

## Important implementation constraints

1. **Never trust a browser-supplied owner or provider identifier.** The new RPC accepts only an operator UUID, request BIGINT ID, action UUID, and operation-specific refund/evidence fields. It derives the request owner, idempotency key, provider task ID, and task index from locked database rows.
2. **Authorization precedes replay.** Perform a non-locking admin admission check, discover the request owner, then lock the operator and target user rows in ascending UUID order. Recheck `is_admin IS TRUE` while holding the operator row lock, then check `action_id`. A replay must not bypass administrator demotion; deterministic ordering also prevents cross-target A→B / B→A lock inversion.
3. **Lock order is both user rows sorted by UUID (operator + target; one row if identical) → request → tasks by ascending task_index → active reservation.** This preserves the request/task/reservation suffix used by migration 077 and the reservation paths in migrations 054/066/074.
4. **The request owner lookup before locking is discovery only.** After locking both user rows and then the request, re-read and verify the owner and idempotency key. A missing request, deleted owner, or changed owner/key aborts.
5. **Existing financial RPCs remain the only financial mutators.** The wrapper calls the 073 reconciliation or 077 finalizer using database-derived values, then inserts the operator journal row in the same transaction. Do not update balances or reservations directly.
6. **Journal append-only behavior needs two layers.** Revoke direct table/sequence privileges from PUBLIC, anon, authenticated, and service_role; add a trigger rejecting UPDATE/DELETE. The SECURITY DEFINER function owner is the intended insert path.
7. **Operator identity retention is intentional.** `operator_user_id` references `users(id) ON DELETE RESTRICT`, never CASCADE, so account deletion cannot erase accountability history.
8. **Idempotency requires both action and logical uniqueness.** A UUID primary/unique key protects exact replay; a unique logical key on request kind, target request ID, action kind, and task index prevents a new UUID from repeating an already completed logical operation. Generation reconciliation is per task; finalization uses task index 0.
9. **Evidence is metadata, not proof.** Restrict evidence types to a short allowlist and bound the reference length. Do not store provider task IDs, request idempotency keys, email addresses, prompts, claim tokens, raw provider payloads, or arbitrary JSON.
10. **Safe receipts only.** RPCs return the journal action ID, action kind, request kind/ID, task index, and timestamp; do not return provider secrets or raw financial records.

## Existing workflow behavior that wrappers must preserve

- Migration 073 only changes the previously unknown `provider_refunded` fact from NULL to a boolean and stamps `provider_reconciled_at`; its audit row is separate from the proposed operator accountability journal.
- Migration 077 finalizes a generation request only after every task is failed and refund-reconciled. Regeneration finalization requires a failed provider outcome with a known refund fact and reconciliation timestamp.
- Status triggers release the reservation when the request transitions to failed. The new wrappers must not release it themselves.
- Exact provider outcomes are immutable in migrations 063/064; the 073 RPC is the supported narrow enrichment path for the unknown refund fact.

## Test contract for migration 078

Add a dedicated SQL integration file covering:

- Missing operator and non-admin rejection for each of the four RPCs.
- Demotion-before-action and replay-after-demotion rejection.
- Exact action UUID replay returns the same receipt and does not add another journal row.
- Reuse of an action UUID with a different operator, target, operation, task, refund fact, or evidence is rejected.
- A different action UUID cannot repeat a logical task reconciliation or finalization.
- Generation reconciliation derives task index/provider task ID from the database and supports separate failed tasks independently.
- Generation finalization remains blocked until every task is reconciled.
- Journal INSERT failure rolls back the underlying 073/077 financial mutation.
- UPDATE/DELETE of the journal fail, including as service_role; direct SELECT/INSERT/UPDATE/DELETE and sequence access are denied to client roles and service_role.
- Operator==target, two operators racing on one task, target deletion race, operator deletion race, and demotion race are exercised with a multi-session PostgreSQL harness where available. A single transaction SQL fixture cannot honestly prove concurrency behavior.

## Verification status

- Reviewed migrations 001, 046, 053, 054, 063, 064, 066, 072, 073, 074, 076, and 077.
- Reviewed the existing reconciliation integration tests, core-table privilege tests, SECURITY DEFINER search-path test, and backend package scripts.
- Confirmed request IDs are BIGINT and administrator IDs UUID; corrected the wrapper contract to derive request ownership and provider identifiers from locked rows.
- No SQL migration created or applied.
- No database, staging environment, provider API, test runner, build, lint, CI, or deployment accessed/executed.
