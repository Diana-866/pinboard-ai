# AUD-366 — access-control boundaries for user data and admin operations

**Date:** 2026-11-11  
**Status:** source audit complete; regression contract added

## Scope reviewed

Projects, boards, pins, review queue, image upload, generation and regeneration entry points, credits and billing history, tariff self-selection, dev top-up, admin middleware, Supabase service-role configuration, core RLS/grants and SECURITY DEFINER search-path hardening.

## Confirmed protections

1. The custom application JWT is verified with an explicit HS256 allowlist. Each protected request checks the current database `token_version`; password-reset version changes invalidate old sessions. `req.userId` is populated only from the verified token.
2. Project reads/writes use the authenticated owner ID. Board ownership is resolved through its project; pin ownership through board → project. Mutations first resolve the resource against that owner and then constrain the write by its parent ID.
3. Admin middleware reads `is_admin` from the database for the authenticated `req.userId`; request body role/admin fields do not grant privileges. Admin endpoints use this middleware.
4. Migration 076 explicitly enables RLS, revokes direct grants from `public`, `anon`, and `authenticated` on all ten core account/data tables, and grants CRUD only to `service_role`. This is essential because PinPosy uses its own JWT, not Supabase Auth JWTs; `auth.uid()` RLS policies alone would not establish the intended application identity boundary.
5. Sensitive Pinterest tables also have dedicated server-only grants (migration 039); manual-review queue has the same server-only grant boundary (migration 120).
6. Production backend refuses to initialize without `SUPABASE_SERVICE_ROLE_KEY`; it does not silently fall back to anon key.
7. The dev top-up endpoint is not a normal user credit API: it is hidden in production / unless explicitly enabled outside production, requires a server-side ADMIN_SECRET of at least 32 bytes and timing-safe comparison, and validates email and bounded integer amount. The secret is not derived from user identity.
8. Profile patch accepts only name, surname and preferred language; tariff self-selection checks the database admin flag unless the explicit non-production self-select feature is enabled.

## Important deployment caveat

The repository contains migrations 076 and 120 for the access-grant hardening. A source audit cannot establish that they have been applied to the live Supabase project. Verify the applied migration ledger before launch; do not infer production database state from repository contents.

## Regression guard

Added `backend/test/data-access-boundary-contract.test.js` covering the core table grants, Pinterest/review-queue grants, authenticated resource routes, database-backed admin check, and dev top-up guard.

## Verification limits

Source and tests were inspected on the feature branch. Node tests, lint, build and CI were not run. No live Supabase queries, data writes, admin actions, credit changes, payments or deployments were performed.
