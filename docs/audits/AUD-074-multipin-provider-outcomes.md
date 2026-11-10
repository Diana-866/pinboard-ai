# AUD-074 — Multi-pin provider terminal outcome persistence

Date: 2026-11-07  
Branch: `feat/persisted-boards-api`  
Scope: static review and implementation of per-image terminal provider metadata. No SQL/runtime test, provider API call, deployment, or production change.

## Findings

The multi-pin generation path already has a durable per-task journal and stable provider idempotency keys. However, `backend/pins.js` previously reduced a failed GPTunnel task to an internal `provider_task_failed` code and discarded the provider's gross price, refund boolean, and structured error metadata. Successful tasks stored their provider price/result URL but had no explicit terminal-outcome reconciliation marker.

## Changes

- Added `db/migrations/064_pin_generation_provider_outcomes.sql`.
- Added nullable `provider_outcome_status`, `provider_refunded`, `provider_error_code`, `provider_error_title`, and `provider_reconciled_at` to `pin_generation_tasks`.
- Added claim-token-fenced RPC `record_pin_generation_provider_outcome`. It locks parent request before task (matching migration 046 lock order), verifies task identity, and permits identical replay while rejecting conflicting facts and stale claims.
- Successful task outcome is persisted before image rehosting. The same RPC is used to backfill older succeeded journal rows when their provider task ID and price are present, including rows that retained only a durable storage URL.
- Failed task outcome now preserves provider task ID, gross price, strict `refunded` boolean, numeric provider error code, and bounded title. If the task ID is missing, the task stays `unknown` instead of being falsely finalized as failed.
- Failed outcome with `refunded=false` is reconciled as a platform expense; missing refund metadata remains `NULL` with no reconciliation timestamp. Neither case debits user credits.
- `get_pin_generation_plan` now includes the provider outcome fields in its recovery snapshot.
- Added `backend/test/pin-generation-provider-outcome.sh` covering success, refunded/unrefunded/missing-refund failures, identical/conflicting replay, stale claim, and proof that provider journal writes do not settle user credits.

## Remaining billing gaps

- This is still a provider-outcome journal extension, not yet one shared append-only ledger for every provider operation.
- Main generation still uses a local estimate to reserve user credits; exact media quotes are not yet used before task submission.
- The text-plan LLM call in `pins.js`, board generation in `boards.js`, and site analysis in `analyze.js` still discard actual LLM usage cost.
- User-credit pricing policy and provider RUB costs remain separate. No new user charges were introduced.

## Verification and deployment gate

Static source assertions only. The SQL migration and integration script have NOT been executed; PostgreSQL, Bash, Node.js tests, and GitHub Actions remain unverified. Migration 064 must be applied and tested against a disposable PostgreSQL database before deploying the backend code. No production database, provider credentials, user balances, tariffs, or deployments were touched.

**Status:** AUD-074 / MULTI_PIN_PROVIDER_OUTCOME_JOURNAL_ADDED / ROUTE_WIRED / SQL_RUNTIME_UNVERIFIED / DO_NOT_DEPLOY_BEFORE_MIGRATION_TEST.
