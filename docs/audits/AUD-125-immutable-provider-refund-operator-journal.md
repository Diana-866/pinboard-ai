# AUD-125 — Superseded refund operator journal draft

**Status:** withdrawn; do not apply or merge the original AUD-125 implementation.  
**Branch:** `feat/persisted-boards-api`  
**Replacement implementation:** `db/migrations/078_operator_action_journal.sql` (AUD-128)  
**Removal commit:** `4bed0af122b65853f01e2c32163b1dfce7d3c3d3`

## Why this draft was withdrawn

A repository-tree inspection found that the branch already contained `078_operator_action_journal.sql`. The separate AUD-125 file `078_provider_refund_operator_action_journal.sql` introduced a second migration with the same numeric prefix and attempted to create the same audit table with an incompatible schema.

The two versions did not agree on important contracts:

- The existing workflow in migrations 073 and 077 uses request IDs passed as `bigint`; the withdrawn draft declared request IDs as `uuid`.
- The established reconciliation procedures accept `user_id text`, `idempotency_key text`, and provider task identifiers as text. The withdrawn wrappers used UUID request identifiers and assumed additional row contracts.
- The pre-existing AUD-128 migration already implements a single append-only operator journal and narrow administrative RPCs around the established 073/077 workflow. Keeping both 078 files would make migration ordering and table/function definitions ambiguous.

The withdrawn file was deleted from this feature branch before it could be applied. No database was changed.

## Current verification status

The following source files were inspected from the feature branch:

- `db/migrations/073_provider_refund_reconciliation_workflow.sql`
- `db/migrations/077_finalize_reconciled_provider_failures.sql`
- `db/migrations/078_operator_action_journal.sql`

The 073/077 source confirms the reconciliation and finalization contracts, including the existing request-status and reservation workflow. The AUD-128 migration uses `bigint` request identifiers and invokes those established procedures.

This was source-level contract inspection only. It does **not** establish that the migration chain executes successfully.

## Required next verification gates

1. Check the full ordered migration chain for duplicate numeric prefixes and ensure only one 078 migration remains.
2. Run the full chain through 078 against a disposable PostgreSQL/Supabase-compatible database.
3. Add integration coverage for authorization, idempotent replay, mismatched replay payloads, append-only enforcement (including TRUNCATE), rollback atomicity, and concurrent actions.
4. Verify the backend passes only the authenticated operator ID from `req.userId`; never accept it from the request body.
5. Run backend tests, lint/build, and CI; inspect actual logs before claiming success.

## Safety boundary

- No SQL was applied to Supabase or production.
- No provider refund, credit balance, or reservation was changed.
- No deployment or merge to `main` was performed.
- The replacement migration remains unverified at runtime until the gates above pass.
