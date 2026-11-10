# AUD-124 — Operator accountability for provider refund actions

**Status:** source audit and implementation design complete; no schema or runtime changes made.  
**Branch:** `feat/persisted-boards-api`  
**Scope:** accountability gap between the existing provider-refund reconciliation/finalization RPCs and a future admin control plane.

## Executive finding

The current database workflow protects provider outcome facts and reservation transitions, but it does not durably identify the authenticated administrator who initiated an operator-assisted reconciliation.

Migration 073 creates `provider_refund_reconciliation_audit` with request identity, task identity, refund fact, evidence reference, and timestamp. It has no operator user ID or action/correlation ID.

Migration 077 adds service-role-only finalization RPCs. They atomically transition eligible requests to failed; existing status triggers release reservations in the same transaction. These RPCs do not accept or persist an operator identity.

This is a material accountability gap for any future HTTP admin action. Do not expose these RPCs directly through a generic admin endpoint until it is closed.

## Source evidence reviewed

- `db/migrations/073_provider_refund_reconciliation_workflow.sql`
  - Creates an append-only-by-privilege reconciliation evidence table.
  - Revokes direct table and sequence access from public, anon, authenticated, and service_role.
  - Grants service_role execute on narrowly scoped reconciliation RPCs.
  - RPCs persist the refund fact and evidence reference, but not the operator identity.
- `db/migrations/077_finalize_reconciled_provider_failures.sql`
  - Adds separate service-role-only finalizers for generation and regeneration.
  - Locks user → request → tasks (generation) → reservation.
  - Requires terminal failed provider facts, known refund boolean, reconciliation timestamp, and active reservation.
  - Uses the existing request-status trigger to release the reservation transactionally.
  - Idempotent replay is limited to the recognized `provider_refund_reconciled` terminal state.
- `backend/admin.js`
  - `requireAdmin` resolves `users.is_admin` from the authenticated database user.
- `backend/index.js`
  - Existing admin routes are protected by `requireAuth, requireAdmin`.
  - The new financial operations queue is read-only; no reconciliation/finalization HTTP route is currently exposed.

## Required design

### 1. Append-only operator action journal

Introduce a separate table, for example `provider_refund_operator_actions`, with:
- generated action ID;
- request kind (`generation` / `regeneration`);
- opaque target request record ID;
- authenticated operator user ID referencing `users(id)`;
- action kind (`refund_fact_reconciled` / `failure_finalized`);
- evidence reference and a bounded evidence type for reconciliation actions;
- safe before/after status summaries;
- unique client-generated action/correlation UUID for idempotent retries;
- timestamp.

Do not store provider payloads, access tokens, claim tokens, user email, prompts, or raw provider errors.

Enable RLS and revoke direct table/sequence access from public, anon, authenticated, and service_role. Permit inserts only through narrowly scoped SECURITY DEFINER RPCs. Do not provide update/delete RPCs. Consider a trigger that rejects UPDATE/DELETE even from service_role, so append-only semantics are enforced independently of application convention.

### 2. Atomic reconciliation wrapper RPCs

Add narrowly scoped wrappers for generation and regeneration that accept:
- authenticated operator user ID (derived only from `req.userId` on the server);
- opaque request row ID;
- task index for generation only;
- provider-confirmed refund boolean;
- bounded evidence reference/type;
- action/correlation UUID.

The wrapper must derive user ID, idempotency key, and provider task ID from the locked target row. Never accept those sensitive values from the browser.

Inside one database transaction:
1. Verify the operator exists and `users.is_admin = true`.
2. Lock rows in the established global order (user before request, then task/reservation where applicable).
3. Revalidate the request is still processing, the provider outcome is failed, the refund fact is still unknown, and the reservation remains active.
4. Call the existing reconciliation RPC using only server-derived values.
5. Insert the operator action journal row.
6. Return a safe result.

If journal insertion fails, the refund fact update must roll back too. A repeated action UUID must not create a second reconciliation or silently target a different request. Replays should return the prior successful result only when all immutable action parameters match.

### 3. Atomic finalization wrapper RPCs

Use separate wrappers for generation and regeneration:
1. Verify the operator is still an administrator.
2. Lock user → request → tasks → reservation in the established order.
3. Revalidate all eligibility conditions at mutation time.
4. Invoke the existing migration 077 finalizer.
5. Insert a `failure_finalized` operator action row in the same transaction.
6. Return the final state and action ID.

The finalizer must not accept arbitrary status, balance, reservation amount, user ID, or idempotency key from the browser. It must not release a reservation directly.

### 4. Failed-attempt logging

A transaction that raises an exception rolls back its own audit insert. Therefore successful financial actions and rejected attempts need distinct handling:
- successful mutation + action journal: one atomic transaction;
- rejected/failed attempt: optional separate security event after rollback, with no financial mutation and carefully bounded metadata.

Do not create a best-effort “success log” after the mutation commits; that recreates the accountability gap.

## Concurrency and replay requirements

Add disposable-PostgreSQL integration coverage for:
- non-admin operator rejected inside the RPC even if it has service_role execution;
- missing operator user rejected;
- action journal insert failure rolls back the refund fact or finalization;
- duplicate action UUID with identical parameters returns the original result without a second action;
- duplicate action UUID with different target/evidence/refund fact is rejected;
- two admins concurrently reconciling the same provider task: exactly one reconciliation fact and one successful action;
- reconciliation racing finalization: only a valid serialized outcome; no orphan audit or released reservation with unknown refund fact;
- generation task index and provider task ID are derived from the locked row, not trusted from browser input;
- operator demotion between UI load and RPC invocation is respected by the database check.

## API boundary

A future Express route should:
- require `requireAuth, requireAdmin`;
- derive operator ID from `req.userId`, never from request body;
- accept only opaque target request ID, action UUID, and the minimal evidence fields;
- reject unknown fields or invalid formats;
- return safe action/result metadata only;
- never return provider task IDs, idempotency keys, user IDs, claim tokens, evidence internals, prompts, or raw payloads.

The database must independently re-check admin status and target eligibility; middleware alone is not sufficient for the service-role RPC.

## Rollout gates

1. Review migrations 053–077 against the actual deployed schema and confirm the migration ledger.
2. Implement journal schema and wrapper RPCs in a new migration after 077.
3. Add disposable PostgreSQL integration tests for atomicity, concurrency, authorization, and idempotency.
4. Obtain a successful CI run with actual job steps/logs; prior runs with missing runner steps do not count.
5. Exercise the wrappers on staging using synthetic users and provider facts only.
6. Only then expose the narrow admin UI actions, with a confirmation step and immutable action receipt.
7. Keep provider retries, generic balance edits, and direct reservation mutation out of the admin interface.

## Verification status

- Source reviewed: migrations 073 and 077, admin middleware, and current admin route.
- Confirmed no operator identity column in the existing refund reconciliation audit schema.
- Confirmed no HTTP route currently exposes the new finalization RPCs.
- No migration created or applied.
- No database, provider, staging, or production access used.
- No tests, build, lint, CI, or deployment run.
- No financial data changed.
