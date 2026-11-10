# AUD-401 — Supabase read-only preflight and PostgreSQL two-session race harness

**Date:** 2026-11-11  
**Status:** design only. No Supabase connection, catalog query, SQL execution, migration or test run.

## Executive summary

The repository already contains a useful PostgreSQL integration pattern:
- PostgreSQL 16 disposable service in `.github/workflows/atomic-payment-integration.yml`;
- minimal schema fixture followed by ordered migrations;
- SQL integration tests for credit fulfillment and checkout settlement;
- shell concurrency tests that use independent `psql` sessions, `application_name`, `pg_stat_activity`, and explicit lock wait observation.

AUD-401 should extend this pattern rather than introduce another database framework. The missing regression is not duplicate webhook vs duplicate webhook (already covered); it is deletion's user-first fence racing a successful provider callback, with proof of no deadlock and no entitlement after the fence.

No production or staging database was accessed. The following read-only preflight is a plan for an operator to run against the actual Supabase project only after choosing the correct project and confirming the session is read-only.

## Existing test infrastructure verified

- `.github/workflows/atomic-payment-integration.yml` provisions PostgreSQL 16 and creates a disposable minimal schema with `users`, `credit_purchases`, `subscriptions`, `credit_transactions` and service roles.
- That workflow applies canonical migrations in sequence and runs `backend/test/prodamus-credit-fulfillment.integration.sql` and `backend/test/payment-creation-settlement.integration.sql`; inspect the workflow before changing it because it has branch filters and a long migration fixture.
- `backend/test/credit-concurrency.sh` starts independent sessions, holds a purchase row, confirms both webhook sessions wait in PostgreSQL, then asserts one ledger row and one credit increment.
- `backend/test/subscription-concurrency.sh` holds the user row and races two subscription activations, asserting the newer entitlement is not downgraded.
- `backend/test/db-migration-chain.test.js` currently asserts canonical migrations 001 and 010–123; any new migration must update this guard and must not collide with existing numbers.
- `backend/test/payment-creation-settlement.integration.sql` checks legacy order no-op, settled checkout URL suppression, duplicate settlement and exact local payment matching.

Important: the current two concurrency shell scripts do not race a webhook against account deletion, and the current payment RPCs still lock payment/domain rows before the user. Their existing tests passing would not prove the proposed lifecycle fence safe.

## Actual Supabase read-only preflight

### Safety gate before connecting

1. Confirm the exact Supabase project ref and environment (production vs staging) from the operator's own dashboard.
2. Prefer a staging clone or branch database. Production preflight is optional and strictly read-only.
3. Use a read-only database role if available. Do not use service_role API key as a substitute for SQL read-only access.
4. In the SQL client, verify `current_database()`, `current_user`, `current_setting('transaction_read_only')`, `version()`, and the server address/project identity from the operator's trusted dashboard.
5. Begin an explicit read-only transaction and set a short statement timeout. Never paste a script containing DDL/DML or function calls into the catalog-preflight session.
6. Do not export or share customer rows, email addresses, order IDs, webhook bodies, access tokens, secrets, or full connection strings. Return only schema metadata and aggregate counts.

### Catalog inspection checklist

Read only `pg_catalog` / `information_schema` metadata:

- Relations and columns for `users`, `subscriptions`, `credit_purchases`, `credit_transactions`, `payment_creation_requests`, `billing_webhook_exceptions`, and any lifecycle/receipt tables that may already exist.
- Column data types, nullability, defaults, generated/identity flags.
- Primary keys, foreign keys, unique/check constraints and indexes, including partial index predicates.
- All overloads of functions: `credit_paid_purchase`, `activate_paid_subscription`, `begin_payment_creation_request`, `attach_payment_creation_order`, `complete_payment_creation_request`, `settle_payment_creation_request`, and billing audit functions.
- Function language, SECURITY DEFINER flag, owner, `proconfig` search_path, argument/return types.
- Effective EXECUTE privileges for PUBLIC, anon, authenticated and service_role.
- Table privileges, RLS enabled/forced flags, policies and sequence privileges for payment/receipt tables.
- Triggers on financial tables, including immutable/audit triggers.
- Migration ledger/table if present, plus actual existence of canonical objects. Do not assume repository migration history equals deployed schema.
- Aggregate data-quality counts only: duplicate provider order IDs, purchases without owner, successful credit purchases missing `balance_credited_at`, ledger rows without purchase reference, successful subscriptions without paid period, payment-creation rows with missing provider order reference. Do not return identifiers.

### Read-only SQL template

The exact project-specific catalog may differ. This template is SELECT-only; run each query separately inside a read-only transaction. Do not add mutation statements.

```sql
begin read only;
set local statement_timeout = '5s';

select current_database() as database_name,
       current_user as session_role,
       current_setting('transaction_read_only') as read_only,
       version() as postgres_version;

select table_schema, table_name, column_name, data_type,
       is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name in (
     'users','subscriptions','credit_purchases','credit_transactions',
     'payment_creation_requests','billing_webhook_exceptions',
     'payment_provider_receipts','payment_entitlement_decisions',
     'account_deletion_requests','account_deletion_events',
     'account_deletion_jobs','account_deletion_manifest'
   )
 order by table_name, ordinal_position;

select c.relname as table_name, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind in ('r','p')
   and c.relname in (
     'users','subscriptions','credit_purchases','credit_transactions',
     'payment_creation_requests','billing_webhook_exceptions',
     'payment_provider_receipts','payment_entitlement_decisions'
   )
 order by c.relname;

select p.oid::regprocedure as function_signature,
       p.prosecdef as security_definer,
       pg_get_userbyid(p.proowner) as function_owner,
       p.proconfig as function_settings
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (
     'credit_paid_purchase','activate_paid_subscription',
     'begin_payment_creation_request','attach_payment_creation_order',
     'complete_payment_creation_request','settle_payment_creation_request'
   )
 order by p.proname, p.oid::regprocedure::text;

select schemaname, tablename, indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename in (
     'subscriptions','credit_purchases','credit_transactions',
     'payment_creation_requests','billing_webhook_exceptions'
   )
 order by tablename, indexname;

rollback;
```

This is a starter inventory, not a complete security review. Add separate SELECT-only queries for constraints, policies, triggers and role grants after confirming the server supports the relevant catalog views. Never run a function from this inspection script.

## Two-session PostgreSQL regression harness

### Fixture

Use the existing PostgreSQL 16 disposable CI service and migration fixture. Add lifecycle columns / deletion fence and receipt/decision objects only after their migrations exist and are reviewed. Seed one synthetic user and one pending credit purchase; use deterministic synthetic provider order IDs. Test inside a disposable database only.

### Scenario A — deletion wins the user lock

Session D (deletion fence):
1. Begin transaction.
2. Lock synthetic `users` row `FOR UPDATE`.
3. Change lifecycle to `deletion_pending` and increment lifecycle_version (using the actual reviewed RPC/schema in final test).
4. Hold the transaction briefly so Session P reaches its lock wait.
5. Commit.

Session P (payment callback):
1. Start a separate transaction / call the new fulfillment RPC with the already recorded receipt.
2. It must acquire user row first and wait while D holds it.
3. After D commits, P observes non-active lifecycle.
4. P records `withheld_account_lifecycle`; it must not increment `credits_balance`, insert a top-up ledger row, or mark the purchase as credited.
5. Both sessions finish without deadlock. Assert receipt exists exactly once and the entitlement remains withheld.

### Scenario B — payment wins the user lock

Session P:
1. Begin fulfillment transaction and lock user first.
2. Verify active lifecycle; lock purchase; apply balance + ledger + paid markers + granted decision atomically.
3. Hold the transaction while Session D waits for the user row.
4. Commit.

Session D:
1. Begin deletion acceptance and lock same user first.
2. Wait until P commits; then mark deletion_pending and enqueue deletion workflow.
3. Assert payment is fully granted exactly once before the fence; deletion starts only after it.

### Scenario C — duplicate callbacks and commit-response loss

- Two callback sessions use the same provider event hash / purchase.
- Exactly one receipt row, one entitlement decision and one ledger row.
- If receipt transaction commits but fulfillment response is lost, retry returns the same receipt and resumes fulfillment without duplicate grant.
- If the account becomes non-active between receipt insertion and fulfillment, the receipt remains and decision is withheld.

### Scenario D — prove the old inversion is detected

In a disposable-only demonstration, one session locks purchase then requests user; another locks user then requests purchase. Configure short `deadlock_timeout` and `lock_timeout`; assert PostgreSQL reports a deadlock/lock timeout and the test detects it. Do not leave this inversion in a passing implementation. The positive regression must prove both paths use user → purchase.

### Harness mechanics

Reuse conventions from `backend/test/credit-concurrency.sh`:
- unique `PGAPPNAME` per session;
- `pg_stat_activity` to prove the expected lock wait occurred before releasing the blocker;
- explicit PID cleanup and `trap`;
- finite deadlines; no infinite sleeps;
- verify transaction outcomes and aggregate state after both sessions finish;
- use a fresh synthetic user per test and clean all dependent rows in FK-safe order;
- never point these scripts at Supabase or any non-disposable database.

Prefer adding `backend/test/prodamus-deletion-race.sh` plus a focused SQL assertion file, and wire it into the PostgreSQL 16 workflow only after the final lifecycle and receipt migrations are implemented. Avoid editing existing credit/subscription concurrency scripts to change their established purpose.

## Acceptance criteria

- [ ] Actual schema preflight is read-only and reconciled against repository migrations.
- [ ] No secrets or personal data are exported in preflight output.
- [ ] New receipt/decision schema and lifecycle columns match actual catalog.
- [ ] Payment fulfillment and deletion acceptance both lock user first.
- [ ] Scenario A withholds entitlement after deletion fence and retains receipt.
- [ ] Scenario B grants exactly once if payment acquired the user lock first.
- [ ] Duplicate callback and commit-response-loss retry are idempotent.
- [ ] Deadlock reproduction is detected in disposable DB; positive paths have no deadlock.
- [ ] CI uses only PostgreSQL service container, not Supabase credentials.
- [ ] Existing credit, subscription and checkout regression suites still pass.
- [ ] No provider HTTP, email or refund request occurs inside DB transaction.

## Explicitly not done

No Supabase connection or catalog query. No migration, SQL execution, backend source, test harness or workflow modification. No provider request, checkout, refund, credit change, subscription activation or production setting touched.
