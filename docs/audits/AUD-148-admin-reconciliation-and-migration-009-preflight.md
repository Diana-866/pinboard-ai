# AUD-148 — Administrative reconciliation and migration 009 preflight

**Date:** 2026-11-08  
**Branch:** `feat/persisted-boards-api`  
**Scope:** Source-level review of migrations 073–082, administrative reconciliation API boundaries, related PostgreSQL fixtures, and a read-only data-loss preflight for migration 009.

## 1. Administrative provider-refund actions

Reviewed migrations 073, 077 and 078, backend handlers `adminProviderRefundActions.js`, `admin.js`, relevant routes in `index.js`, and the disposable PostgreSQL fixture.

Source-level protections confirmed:
- Reconciliation only fills a previously unknown refund fact for a matching failed provider task; it does not permit changing an already-known refund fact.
- Finalization requires every generation task to be failed and reconciled, or the regeneration provider outcome to be failed and reconciled, plus an active credit reservation.
- The reservation release remains driven by the existing request-status lifecycle in the same database transaction.
- Administrative wrapper RPCs recheck `is_admin` after locking operator and target user rows in deterministic UUID order.
- The operator journal is append-only, blocks UPDATE/DELETE/TRUNCATE, has action UUID replay checks and logical uniqueness, and is inaccessible by direct grants to API roles/service_role.
- The backend derives operator identity from verified `req.userId`; the routes are protected by `requireAuth`, `requireAdmin`, and the administrative action rate limiter.
- The integration fixture covers journal-insert rollback, exact replay, altered replay rejection, non-admin rejection, operator demotion, self-targeting, reservation release, and grants.

No confirmed privilege bypass or credit-release defect was found in the reviewed paths. This is not a proof of every role grant or every possible concurrent interleaving; the SQL fixture must run on disposable PostgreSQL before these changes are considered verified.

## 2. Pinterest positive-only reconciliation

Reviewed migration 082, backend `adminPinterestReconciliation.js`, route registration, and `pinterest-operator-reconciliation.integration.sql`.

Confirmed source-level guards:
- Only a stale `unknown` schedule with no active claim can be reconciled.
- The related attempt must also be stale, be `unknown` or `processing`, and have `retry_safe=false`.
- The account → schedule → attempt lock order is retained.
- Operator identity is taken from the authenticated request and independently rechecked in SQL under a user-row lock.
- The exact reserved board and any existing remote pin/board IDs must match.
- Only a positive externally confirmed publication can be recorded; this RPC does not prove non-publication and never enables retry.
- The journal receipt is written in the same transaction as the publication ledger and local state updates.

The integration fixture includes positive completion, exact replay, changed-payload replay rejection, append-only enforcement, duplicate-action rejection, fresh/terminal-state rejection, board mismatch and conflicting publication identity. No SQL execution has been confirmed.

## 3. Migration 009 data-loss preflight

Added `db/preflight/009_hardening_data_loss_report.sql`.

The file contains SELECT-only reports for:
- malformed `user_id` rows across the six tables whose text IDs migration 009 converts;
- orphaned user references;
- orphaned `pinterest_publications.pin_id` rows;
- non-standard board/pin statuses that will be incorporated into CHECK constraints;
- fractional `credit_transactions.amount` values and values outside PostgreSQL integer range.

Detailed candidate rows are returned as JSON so they can be exported before any destructive cleanup. The file does not mutate or archive data. It has not been executed against any database; validate its output on a restored copy before using it operationally. A verified backup and exported candidate rows remain prerequisites before migration 009.

## 4. CI status and verification limits

For commit `726663bde5b886a51ee0d5937802333b78ce0a9d`, GitHub Actions reported failure for:
- Prodamus webhook tests;
- Atomic payment fulfillment integration;
- Persisted boards integration checks (frontend and backend jobs).

GitHub job metadata returned `steps=null`. Attempts to download all four job logs returned Azure `BlobNotFound`. Therefore the failure stage and cause are unknown; this does not establish that the tests ran or that the code caused the failure. Vercel status was failure for that commit.

No local Node tests, PostgreSQL integration tests, Supabase SQL, production migrations, production data reads/writes, live Pinterest requests, or deployment changes were performed.

## Next verification steps

1. Run the backend Node test suite in a controlled local environment.
2. Run the PostgreSQL integration workflow against disposable PostgreSQL and capture job logs.
3. Run the migration 009 preflight against a restored production backup; export and review every candidate row.
4. Continue auditing all later migrations for RLS, direct grants, SECURITY DEFINER ownership/search_path and execute privileges.
