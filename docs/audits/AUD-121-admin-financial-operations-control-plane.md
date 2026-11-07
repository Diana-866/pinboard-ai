# AUD-121 — Administrative control plane for financial operations

**Scope:** inspect how administrators can safely identify unresolved AI-provider operations and stale credit reservations.  
**Branch:** `feat/persisted-boards-api`  
**Status:** source audit and implementation design; no route, UI, migration, or financial mutation added.

## Executive result

The backend already has a database-backed administrator gate and durable journals for generation, regeneration, provider outcomes, credit reservations, and evidence-backed refund reconciliation. The missing layer is an operational control plane: administrators cannot currently inspect a unified queue of unresolved provider outcomes or reservations, and reconciliation actions do not record the authenticated operator identity.

The safe implementation order is therefore:

1. Add a read-only, bounded admin inventory.
2. Add an append-only operator action journal and explicit authorization/evidence rules.
3. Only then expose narrowly scoped reconciliation/finalization actions that call the existing service-role RPCs.
4. Keep provider retries, balance edits, and direct reservation edits out of the admin interface.

No automatic retry or automatic release should be introduced.

## Existing safeguards confirmed in source

### Admin authorization

- `backend/index.js` mounts admin routes behind `requireAuth, requireAdmin`.
- `backend/admin.js` resolves `users.is_admin` from the database using the authenticated `req.userId`; it does not trust request-body role fields.
- The existing `backend/test/admin-access.test.js` covers an allowed database admin, a normal user spoofing admin fields, and database lookup failure (fail-closed behavior).

### Durable financial operation records

- `pin_generation_requests` and `pin_generation_tasks` record multi-pin generation lifecycle.
- `pin_regeneration_requests` records single-pin regeneration lifecycle.
- `pin_generation_credit_reservations` records reserved/settled/released amounts.
- Migrations 063–064 persist provider outcome facts separately from user-credit settlement.
- Migration 073 provides evidence-backed reconciliation RPCs and an append-only `provider_refund_reconciliation_audit` record.
- Migration 077 provides service-role-only finalizers. The finalizers require terminal failed outcomes, known refund booleans and reconciliation timestamps; multi-pin finalization requires every task to be failed and reconciled. The existing status trigger releases the active reservation in the same database transaction.

### Existing admin surface

The backend has admin endpoints for statistics, mail, subscriptions, billing webhook exceptions, pending payment orders, and stale image uploads. There is no admin endpoint for generation-provider exceptions or credit-reservation inventory. The current admin UI has billing exception and email-outbox panels, but no provider-generation reconciliation panel.

## Findings and gaps

### F1 — No unified queue for unresolved AI-provider work

The durable tables contain enough information to construct a privacy-limited queue, but there is no admin read endpoint joining:
- processing generation/regeneration requests;
- per-task provider status and reconciliation state;
- active credit reservations and their age.

A request being old is only an investigation signal. It is not proof that the provider task stopped, failed, or refunded.

### F2 — Evidence audit does not identify the authenticated operator

Migration 073 stores request identity, provider task ID, refund boolean, evidence reference, and timestamp. It does not store the operator's authenticated user ID or a separate operator action/correlation ID. An HTTP endpoint that invokes the RPC would therefore leave a gap in accountability unless a new append-only operator journal is introduced.

### F3 — Reservation age cannot authorize release

Migration 054 deliberately retains reservations for unknown provider outcomes. The generation/regeneration request state and provider task state must be checked together. A stale reservation with a still-running/unknown task must remain reserved. A reservation with no matching request is an integrity exception requiring investigation, not an automatic release candidate.

### F4 — Provider task identifiers and idempotency keys are operational secrets

The database uses provider task IDs, provider idempotency keys, claim tokens, and request idempotency keys to safely recover work. These should not be included in broad admin list responses or browser-visible logs. The read-only queue should expose opaque internal request IDs and safe status summaries only; sensitive identifiers should be used only server-side when a later, narrowly scoped action is invoked.

### F5 — No automated provider reconciliation source is available in this scope

The repository code does not establish a trusted live GPTunnel refund lookup or a verified provider reconciliation feed for admin use. An evidence reference is only an operator-supplied pointer; it is not itself proof. The operator procedure must require checking the provider's authoritative task/payment record before invoking migration 073.

## Proposed read-only queue contract

Suggested endpoint: `GET /admin/financial-operations/unresolved`.

- Require both `requireAuth` and `requireAdmin`.
- Accept bounded `older_than_minutes` and `limit` parameters with strict clamps.
- Return separate arrays for:
  - generation requests with unresolved/unknown provider outcomes;
  - regeneration requests with unresolved/unknown provider outcomes;
  - old active reservations, including whether a matching request exists.
- Include only opaque request/reservation record IDs, operation kind, task count, safe lifecycle statuses, creation/update timestamps, age, and a derived reason code.
- Do not return user email, prompts, image/result URLs, raw provider payloads, provider task IDs, provider idempotency keys, request idempotency keys, claim/fencing tokens, evidence references, or internal raw error text.
- Clearly label age-based results as **needs review**, never **safe to release**.
- Use a hard result cap and deterministic oldest-first ordering. Do not silently imply that a capped response is exhaustive; return the applied limit and truncation indicator.
- Keep this endpoint read-only. It must not call provider APIs, mutate request state, or update reservation rows.

## Required operator action journal before write endpoints

Before exposing reconciliation/finalization through HTTP, add a durable append-only journal containing at minimum:

- operation kind and opaque target request ID;
- authenticated operator user ID;
- action name (e.g. provider refund fact reconciled / reconciled failure finalized);
- evidence reference and a bounded evidence type;
- before/after status summary;
- timestamp and correlation ID;
- success/failure result without storing provider secrets or raw payloads.

The journal should be written transactionally with the reconciliation action, or via a single database RPC that both validates and records the action. A separate best-effort HTTP log is insufficient because the financial mutation could commit while the audit write fails.

The service-role-only RPC should revalidate the target state and active reservation at mutation time. It must not accept arbitrary status changes, balances, reservation amounts, claim tokens, or user IDs supplied by the browser. The backend should derive the authenticated operator identity from `req.userId`; the browser should submit only the opaque target ID, the provider-confirmed refund fact, and the evidence reference required by the narrowly scoped action.

## Implementation gates

1. Review migrations 053–077 against the actual deployed Supabase schema before applying any new migration.
2. Implement and test the read-only queue first.
3. Add database constraints/privileges and an append-only operator action journal.
4. Implement one server-side reconciliation action that calls the existing migration 073 RPC and records the operator action atomically.
5. Implement finalization as a separate explicit action using migration 077; require the queue to be refreshed and the request to remain eligible.
6. Add integration tests for normal admin, non-admin, missing DB permission, stale-but-running task, orphan reservation, provider outcome still unknown, false/true refund facts, replay, concurrent reconciliation, and failed audit insertion.
7. Add the UI only after the API contract and tests are stable.

## Verification limits

- This audit used repository source reads only.
- No PostgreSQL execution, Node tests, frontend build, lint, CI, live Supabase schema inspection, GPTunnel provider lookup, or production deployment was performed.
- Migration 077 remains source-reviewed only; this document does not certify its runtime behavior.
- No files outside this report were changed in AUD-121.
