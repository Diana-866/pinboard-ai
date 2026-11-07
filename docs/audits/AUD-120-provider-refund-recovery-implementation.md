# AUD-120 — Provider refund recovery implementation

**Scope:** close the two code-level recovery gaps recorded in AUD-119.  
**Branch:** `feat/persisted-boards-api`  
**Status:** implementation committed; source-reviewed; database execution and automated tests not run.

## What changed

### 1. Safe replay after an audited refund reconciliation

Updated `backend/index.js`:

- Single-pin regeneration reads the durable `provider_refunded` fact before replaying a failed provider outcome. If GPTunnel omits the field on a repeated poll, the route reuses the already persisted boolean.
- Multi-pin generation reads the durable task journal through `get_pin_generation_plan` and reuses that task's reconciled boolean when GPTunnel omits it on replay.
- A new provider-supplied boolean still takes precedence. If it conflicts with the previously reconciled fact, the existing database RPC rejects the conflicting replay; the implementation does not silently overwrite it.
- This preserves the original provider outcome fields and avoids a false replay conflict after operator reconciliation.

### 2. Atomic finalization and reservation release

Added `db/migrations/077_finalize_reconciled_provider_failures.sql` with two service-role-only RPCs:

- `finalize_reconciled_pin_generation_failure(user_id, idempotency_key)`
- `finalize_reconciled_pin_regeneration_failure(user_id, idempotency_key)`

Both functions:
- Lock the user first, then the request, then the task/reservation rows in the established order.
- Require a still-processing request and a currently active reservation.
- Require terminal provider failure facts with known refund booleans and non-null reconciliation timestamps.
- For multi-pin generation, require every task to be failed and reconciled. Mixed success/failure requests cannot use this release path.
- Transition the request to `failed`; existing database triggers perform the reservation release in the same transaction.
- Are idempotent only for requests previously finalized with `error_code = 'provider_refund_reconciled'`.
- Do not change the user's credit balance or insert a credit transaction.

The finalizer accepts provider-supplied refund facts already recorded by GPTunnel as well as facts enriched through migration 073's evidence-backed reconciliation workflow. For operator-enriched facts, migration 073 still records the evidence reference in `provider_refund_reconciliation_audit`.

### 3. Regression coverage

Updated `backend/test/provider-refund-reconciliation-workflow.integration.sql`:
- Replays generation and regeneration provider failures after refund reconciliation using the durable boolean.
- Calls the new finalization RPCs.
- Asserts request status becomes `failed` and reservations become `released`.
- Retains checks that conflicting reconciliation replays cannot rewrite the audited fact.

The test's prerequisite comment now requires migrations 053–077.

## Safety boundaries retained

- Unknown provider refund outcomes continue to hold reservations.
- No automatic second provider submission is introduced.
- No automatic user-credit refund is introduced; failed provider spend remains an internal provider-cost fact.
- A successful provider task in a multi-task request prevents the all-failed finalizer from releasing the reservation.
- No public/user-facing endpoint exposes claim tokens, provider task identifiers, evidence references, or internal provider payloads.
- The finalization RPCs are not wired to an HTTP admin endpoint in this change; trusted operators can invoke them through an authorized service-role maintenance path after confirming provider evidence.

## Required migration and rollout sequence

1. Apply migrations 053–076 in the repository's existing order if they are not already applied.
2. Apply `077_finalize_reconciled_provider_failures.sql`.
3. Deploy the backend code from this branch.
4. Run the SQL integration test `backend/test/provider-refund-reconciliation-workflow.integration.sql` against a disposable database with the required schema.
5. Verify the functions are executable by `service_role` only and that the existing status triggers release reservations on the finalizer transition.
6. Before enabling operator use, document who may reconcile provider refunds, what evidence reference is acceptable, and how to verify the provider task outcome.

Do not apply this migration blindly to production. The migration has only been source-reviewed in this audit; it has not been executed against the user's Supabase project.

## Not included

- Admin UI or HTTP queue for unresolved outcomes.
- Scheduled aging alerts or automated reconciliation worker.
- User-facing billing/export changes.
- Live GPTunnel/Prodamus verification.
- Live Supabase schema verification.

## Verification status

- GitHub source reads confirmed the changed backend snippets, migration, and regression SQL are present on the working branch.
- No PostgreSQL server was available through this workflow; SQL syntax and transactional behavior have not been executed.
- No Node test, build, lint, or CI workflow was run.
- No production database, provider account, or deployment was accessed.
