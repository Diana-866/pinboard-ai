# AUD-125 — Operator action journal and atomic RPC migration design

## Scope

Design the next database migration after `077_finalize_reconciled_provider_failures.sql`. This audit is a source-level design only: it does not create or apply a SQL migration, alter production data, expose admin actions over HTTP, or execute tests.

## Schema facts confirmed from migrations

- `public.users.id` is `uuid` (`001_base_schema.sql`); administrator status is stored in `users.is_admin`.
- `public.pin_regeneration_requests.id` is `bigserial` (`053_pin_regeneration_journal.sql`).
- `public.pin_generation_tasks.id` is `bigserial`, and its `generation_request_id` is `bigint` (`045_pin_generation_task_journal.sql`).
- Generation requests are addressed by a bigint parent ID; migration 045's FK from `pin_generation_tasks.generation_request_id` to `pin_generation_requests.id` is bigint.
- Request `user_id` columns are text, while `users.id` is UUID. Existing financial RPCs intentionally compare `users.id::text` to request `user_id`.
- Generation task indexes are constrained to 1–10 and unique per parent request.
- Regeneration and generation request idempotency keys are unique per user.
- Migration 073 reconciliation functions accept user ID, idempotency key, task index/provider task ID, refund fact and evidence. They lock the request/task rows but do not lock the user first or record operator identity.
- Migration 077 finalizers lock user → request → generation tasks (where applicable) → reservation. They enforce known refund facts and rely on request-status triggers to release reservations in the same transaction.
- Migration 074 documents the shared financial lock order as user first, then active reservations. Migrations 045/046 establish parent request → task ordering for generation lifecycle operations.

## Design decisions for migration 078

### 1. Journal schema

Create `public.provider_refund_operator_actions` as an append-only table with:

- `id bigserial primary key`;
- `action_id uuid not null unique` — client-generated idempotency/correlation key;
- `request_kind text not null` constrained to `generation` / `regeneration`;
- `target_request_id bigint not null` — opaque request-row ID, not a provider identifier;
- `operator_user_id uuid not null references public.users(id) on delete restrict`;
- `action_kind text not null` constrained to `refund_fact_reconciled` / `failure_finalized`;
- `task_index integer not null default 0` (1–10 for generation reconciliation; 0 for regeneration reconciliation and either finalization);
- `provider_refunded boolean` nullable only for finalization actions;
- `evidence_type text` and `evidence_reference text`, required and bounded for reconciliation, null for finalization;
- `before_status text not null` and `after_status text not null`, restricted to known safe lifecycle values;
- `created_at timestamptz not null default clock_timestamp()`.

Use a logical uniqueness constraint on `(request_kind, target_request_id, action_kind, task_index)` in addition to unique `action_id`. This prevents a caller from bypassing one-action-per-task/request semantics by retrying with a new UUID. For finalization, `task_index=0` is the canonical sentinel. The journal deliberately has no polymorphic FK to either request table; the RPC validates the target against the table selected by `request_kind` while holding its row lock.

Enable RLS, revoke direct table and sequence access from `public`, `anon`, `authenticated`, and `service_role`. Grant no direct INSERT/UPDATE/DELETE. The narrowly scoped SECURITY DEFINER RPC owner must retain the privileges needed to insert. Add a trigger rejecting UPDATE and DELETE as defense in depth. Do not add a journal mutation RPC.

Do not store user email, provider task IDs, provider idempotency keys, request idempotency keys, claim tokens, prompts, raw provider payloads/errors, access tokens, or arbitrary client-supplied JSON.

### 2. RPC contracts

Add four separate RPCs to keep each operation narrow:

- `admin_reconcile_pin_generation_provider_refund(p_operator_user_id uuid, p_request_id bigint, p_task_index integer, p_provider_refunded boolean, p_evidence_type text, p_evidence_reference text, p_action_id uuid)`
- `admin_reconcile_pin_regeneration_provider_refund(p_operator_user_id uuid, p_request_id bigint, p_provider_refunded boolean, p_evidence_type text, p_evidence_reference text, p_action_id uuid)`
- `admin_finalize_reconciled_pin_generation_failure(p_operator_user_id uuid, p_request_id bigint, p_action_id uuid)`
- `admin_finalize_reconciled_pin_regeneration_failure(p_operator_user_id uuid, p_request_id bigint, p_action_id uuid)`

The operator UUID must be supplied only by the trusted backend from `req.userId`; never accept it from browser-controlled JSON. Each RPC independently checks that the user exists and is currently an administrator. Keep `EXECUTE` revoked from `public`, `anon`, and `authenticated`; grant only to `service_role`.

The browser must not supply a user ID, request idempotency key, provider task ID, provider idempotency key, claim token, reservation amount, balance, or arbitrary target status. The RPC derives all target identity and provider details from locked database rows.

### 3. Locking and atomicity

Use this order consistently:

1. Lock and verify the operator row (or verify admin status before target locks, then lock the target user's row; do not introduce a reverse-order path).
2. Resolve the target request's owner without trusting browser-supplied ownership data.
3. Lock the target user's `users` row.
4. Lock the request row.
5. For generation, lock all relevant task rows in ascending `task_index`; for one-task reconciliation, lock the selected task.
6. Lock the active reservation row.

The operator row and target user's row are distinct lock domains. To avoid a lock inversion, the implementation must settle the precise order for both before coding: a safe uniform candidate is operator row → target user's row → request → tasks → reservation, provided every admin RPC uses it and no code path subsequently locks the operator row. The existing 077 finalizer's user → request → tasks → reservation sequence is preserved as a suffix. The wrapper can pre-acquire those locks and call the existing function; PostgreSQL row locks are re-entrant within the transaction.

For reconciliation, validate the request is still processing; the provider outcome is failed; the refund fact and reconciliation timestamp are still null; the provider task ID is present and matches the locked task; and the reservation is active. Call the existing 073 RPC using only values read from locked rows, then insert the operator journal row. The provider fact and journal insert commit or roll back together.

For finalization, validate the locked request/task state, call the existing 077 finalizer, then insert the journal row in the same transaction. The existing finalizer and terminal-state triggers remain responsible for reservation release. Do not directly update reservation status or balance in the wrapper.

### 4. Idempotency and uniqueness

For every RPC:

1. Verify the operator still exists and is_admin before returning any replay result. A previously authorized action UUID must not bypass a later administrator demotion.
2. Look up `action_id`. If it exists, compare operator, request kind, target ID, action kind, task index, refund boolean, evidence type, and evidence reference as applicable. Return a safe prior receipt only on an exact match; otherwise reject.
3. If no action UUID exists, proceed to eligibility checks and acquire locks.
4. Insert the journal row only after the financial RPC succeeds.
5. Let the logical unique constraint reject a second action with a different UUID for the same task/request. Convert that conflict to a safe “already handled” result only if the existing action is proven to be the exact same logical fact; otherwise reject.

For generation reconciliation, the logical uniqueness key includes task index, allowing distinct tasks within one generation request to be reconciled independently. Generation finalization and regeneration finalization use task index 0.

### 5. Privilege and SECURITY DEFINER requirements

- Fix `search_path` to `pg_catalog, public` in every SECURITY DEFINER function.
- Use schema-qualified table/function references.
- Explicitly validate `users.is_admin = true` inside every action RPC; Express middleware is not the authorization boundary for service-role calls.
- Keep the journal inaccessible to direct service-role DML; SECURITY DEFINER function ownership supplies the only intended write path.
- Do not make the table owner or function owner a role that the application can assume.
- Keep all output values minimal and privacy-safe.

### 6. Failed attempts

Do not try to write a rejected-attempt record in the same transaction that raises: the exception rolls back that insert. A separate security-event channel may be added later, but it must not imply a successful financial action. It is not required for migration 078 correctness.

## Required tests before staging

Use disposable PostgreSQL with the real migration chain through 078:

1. Missing operator and non-admin operator are rejected by each RPC.
2. An admin demoted before invocation is rejected, including a replayed action UUID.
3. A journal insert failure rolls back the provider refund fact or request finalization.
4. Exact duplicate action UUID returns the original safe receipt without a second mutation.
5. Reusing an action UUID with different target, operator, evidence, refund boolean, or action kind is rejected.
6. A new action UUID for an already reconciled task or finalized request is rejected by logical uniqueness.
7. Two operators racing on one task produce exactly one reconciliation and one journal row.
8. Reconciliation racing finalization serializes without a released reservation while refund status is unknown.
9. Generation task index and provider task ID are derived from the locked row; browser-supplied values cannot redirect the action.
10. Multi-task generation supports one reconciliation per failed task and finalizes only when every task is eligible.
11. UPDATE/DELETE against the journal fail, including when attempted by service_role.
12. Direct SELECT/INSERT/UPDATE/DELETE and sequence access are denied to client roles and service_role.

## Important unresolved implementation gate

The operator row lock order needs a final deadlock review against every path that can demote an admin or delete a user. The proposed order is operator → target user → request → tasks → reservation. Existing financial paths lock target user before request/task/reservation and do not later lock an operator row. The admin-demotion path must be checked before implementation; if it can lock target user first and operator second, the RPC must instead use a non-locking admin check with a carefully documented authorization race policy, or the demotion path must be aligned.

The current migrations do not define a safe way to make a transactionally durable rejected-attempt log after an exception. Keep that out of scope.

## Verification status

- Reviewed migrations 001, 003, 009, 045, 046, 053, 054, 063, 064, 066, 072, 073, 074, 076, and 077.
- Confirmed UUID administrator IDs, bigint request/task IDs, and existing lock-order conventions.
- Identified logical uniqueness as necessary in addition to client action UUID.
- Identified administrator-row versus target-user-row lock order as a pre-implementation deadlock gate.
- No SQL migration created or applied.
- No staging or production database accessed.
- No tests, build, lint, CI, provider calls, deployment, or financial operations run.
