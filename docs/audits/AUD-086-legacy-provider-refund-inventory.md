# AUD-086 — Legacy provider-refund and reservation inventory

## Finding

Migrations 072–073 protect new terminal transitions and provide a controlled path for reconciling unknown provider refunds. They intentionally do not repair requests that became terminal before those protections were installed. A legacy request can therefore be marked `failed` while its reservation is already `released`, even though a provider task failed with `provider_refunded IS NULL`. A separate class to inspect is a terminal request whose reservation remains `reserved`.

The repository does not have access to production Supabase rows through GitHub. No claim is made that any affected production records currently exist.

## Read-only inventory

Run `backend/test/provider-refund-legacy-inventory.sql` in the Supabase SQL Editor using a database-owner session. It contains only SELECT statements and returns:

1. Non-routine generation/regeneration request states, including terminal requests with active reservations.
2. Failed provider tasks with unknown refund facts or missing reconciliation timestamps.
3. Provider task IDs without a persisted provider outcome.
4. Active reservations with no matching generation or regeneration request.

The first result labels each row with an `inventory_class`. The second result lists orphan active reservations. Routine processing requests with a healthy active reservation are intentionally omitted from the first result.

## Interpretation and safety

- `LEGACY_FAILED_RELEASED_UNKNOWN_PROVIDER_REFUND`: the reservation is already released, but one or more failed provider tasks have no refund fact. Verify the provider task IDs and authoritative billing evidence before deciding whether any accounting correction is needed.
- `TERMINAL_REQUEST_WITH_ACTIVE_RESERVATION`: terminal request and active hold disagree. Do not release it automatically; first establish whether the provider operation was charged/refunded and whether the request's terminal state is valid.
- `PROCESSING_AWAITING_PROVIDER_REFUND_RECONCILIATION`: eligible only if the request and reservation still satisfy the exact preconditions of migration 073. Use the documented reconciliation RPC only with authoritative evidence.
- `FAILED_RELEASED_MISSING_RECONCILIATION_TIMESTAMP`: inspect the provider fact and migration history. Do not infer a refund or charge from a missing timestamp.
- `FAILED_RELEASED_PROVIDER_OUTCOME_MISSING`: compare provider logs and application logs; do not recreate a provider task merely to fill the journal.
- Orphan active reservation: investigate request deletion/retention history and idempotency-key ownership before any action.

**Do not run UPDATE/DELETE statements based on this report.** Do not reopen reservations, debit/credit users, change request statuses, or assume `provider_refunded = false` means the provider charged successfully without checking the provider's accounting semantics. Preserve exported query results and evidence references for an explicit, reviewed remediation plan.

## Verification status

The SQL was reviewed against the repository migrations 054, 063, 064, and 073. It has not been executed against Supabase, and its results are unknown until run against the target database. No production data or balances were changed.
