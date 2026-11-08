# AUD-147 — RLS boundary and migration 009 data-preservation review

**Date:** 2026-11-08  
**Branch:** `feat/persisted-boards-api`  
**Scope:** Source review of `001_baseline.sql`, `009_hardening.sql`, backend Supabase client initialization, session verification, and API authorization. No live database was queried.

## Findings

### 1. Backend data access depends on the service-role key being configured

`backend/supabase.js` initializes the server client with `SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY`. The schema intentionally revokes direct table privileges from public client roles and relies on the service role to bypass RLS. If the service-role secret is absent, the backend silently falls back to the anon key; requests requiring protected table writes or service-only RPCs will fail under RLS/grants.

This fallback does not itself expose the service key, but it can make an incomplete deployment appear initialized until a protected operation is attempted. Implemented on this branch: production startup now throws a clear configuration error when `SUPABASE_SERVICE_ROLE_KEY` is absent. The anon-key fallback remains available outside production for local/test configurations. This change has not yet been executed in CI.

### 2. Migration 009 performs destructive cleanup before adding foreign keys

Before converting historical `user_id` columns from text to UUID and adding cascading foreign keys, migration 009 deletes:
- Rows with malformed non-UUID `user_id` from NOT NULL tables including `auth_tokens`, `subscriptions`, `credit_purchases`, `pinterest_accounts`, and `pinterest_publications`.
- Orphaned rows whose UUID user no longer exists, across the listed user-owned tables.
- `pinterest_publications` rows whose `pin_id` no longer exists.

The migration emits NOTICE counts, but it does not archive the deleted rows or stop for operator approval. This may be intentional cleanup of invalid legacy data, but it is irreversible without a separate backup. Do not apply migration 009 to a production database until a full backup exists and its cleanup counts have been reviewed. Prefer a separate read-only preflight query/report and an explicit export/archive of affected rows before deletion.

### 3. RLS and API identity model

- The baseline enables RLS on the ten original tables. `users` is tightened to SELECT-only by migration 009; protected writes are expected to use the backend service role.
- `projects`, `boards`, and `pins` policies derive ownership through `auth.uid()`; the app's own HS256 session token is not a Supabase Auth JWT, so direct Supabase client access with the app token does not satisfy these policies. The backend instead verifies its own JWT and derives `req.userId`.
- The inspected `requireAuth` middleware verifies the token, checks the current `token_version` in the database, then sets `req.userId`. The inspected board/pin routes additionally constrain reads and writes by the authenticated user/project relationship.
- `SECURITY DEFINER` credit RPCs inspected in this pass fix `search_path` and revoke execution from `PUBLIC`, `anon`, and `authenticated`, granting execution to `service_role`.

This is a partial source review, not a complete proof of every route, table, function, or deployed grant.

## Recommended next actions

1. Run a Node regression test for the production missing-key startup guard and verify the normal service-role path.
2. Add a read-only SQL preflight for every destructive cleanup branch in migration 009, with counts and export instructions.
3. Review every post-baseline table migration for `ENABLE ROW LEVEL SECURITY`, grants/revokes, and narrowly scoped policies.
4. Add disposable-PostgreSQL tests for cross-user board/pin access and execution privileges of all `SECURITY DEFINER` RPCs.

## Verification boundary

Application change: `backend/supabase.js` now fails fast in production without `SUPABASE_SERVICE_ROLE_KEY` (commit `af82e574d9b9daf1213b49aaaf4b253dee95d64a`). No Supabase SQL was executed and no production data was read, deleted, or modified. CI has not yet reported a run for this commit; Vercel status is pending at the time of review. Do not infer test success from source inspection.


## Production Supabase configuration regression coverage (2026-11-08)
- Added `backend/test/supabase-config.test.js` with isolated child-process checks for two startup paths: production without a service-role key must exit with the explicit configuration error; production with a configured service-role key must initialize successfully.
- The missing-key case explicitly sets both key variables to empty strings so inherited developer/CI environment secrets cannot make the test pass accidentally.
- The test has been committed, but has not been executed locally or in CI. The latest HEAD is `bef687a8459e2eb5b691d5dd2ae275dc99ed57f7`; GitHub reports no PR workflow runs and no combined status checks for this SHA at the time of review. Do not treat this as a passing test.
- No Supabase connection, SQL execution, migration, or production change was performed.
