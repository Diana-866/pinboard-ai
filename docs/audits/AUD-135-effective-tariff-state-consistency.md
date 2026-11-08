# AUD-135 — Effective tariff state consistency across API and UI

Date: 2026-11-08  
Scope: source-level review of tariff resolution, the authenticated profile response, Pinterest account limits, and frontend tariff consumers.

## Summary

The backend already has a single entitlement resolver in `backend/tariff.js:getTariffState`. Protected generation, regeneration, scheduling, subscription history, and Pinterest account-limit calculation use this resolver. The authenticated profile endpoint `GET /me`, however, previously reconstructed `subscription_active` from the denormalized `users.tariff_plan` and `users.tariff_period_end` columns. That produced a split-brain contract: the API could deny a feature while the frontend continued to display an active plan or stale entitlement.

The profile response now uses `getTariffState` and returns its effective plan, period end, and active flag. This keeps existing frontend consumers aligned without duplicating entitlement logic in React.

## Findings

### 1. /me returned a stale entitlement snapshot — fixed

Before the fix, `backend/index.js` returned:
- `tariff_plan` directly from `users.tariff_plan`;
- `tariff_period_end` directly from `users.tariff_period_end`;
- `subscription_active` calculated only from those two columns.

By contrast, `getTariffState` checks the latest successful subscription and its `period_end`, and fails closed if the subscription lookup errors. A successful subscription can therefore be active while the denormalized user cache is stale, or expired while the cached user period still looks active.

Change:
- `GET /me` now calls `getTariffState(req.userId)`.
- `tariff_plan`, legacy `subscription_tier`, `tariff_period_end`, and `subscription_active` are derived from that result.
- A failed entitlement lookup causes the profile request to fail rather than presenting stale access as active.

### 2. Existing frontend consumers inherit the corrected state

Reviewed:
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/components/pricing/PricingView.tsx`
- `frontend/src/components/settings/SettingsView.tsx`
- `frontend/src/components/layout/Sidebar.tsx`

These components consume the `/me` user payload. Settings uses `subscription_active` to show the no-active-plan state; pricing and the sidebar use `tariff_plan` for the current plan label. No independent subscription-expiry calculation was found in these reviewed consumers. Because the server payload is now canonical, the UI receives the same effective plan as protected backend routes.

### 3. Pinterest account limit already uses effective entitlement

`backend/pinterest.js` computes account limits from `getTariffState` and returns zero when the plan is inactive. This is consistent with the corrected `/me` response. The Pinterest scheduling and retry endpoints also apply `requireTariff`.

### 4. Manual tariff mutation remains a product/operations gap

`PATCH /me/tariff` is production-admin-only (unless the explicit non-production self-select flag is enabled), but it updates only the caller's `users.tariff_plan`. It does not set/clear `users.tariff_period_end`, create an auditable manual entitlement record, or reconcile an existing successful subscription.

Since `getTariffState` treats the latest successful subscription as authoritative whenever one exists, changing the cached `users.tariff_plan` alone may not change the effective plan. If there is no successful subscription, the manual user fields are used; a null end date is interpreted as an indefinite manual grant.

This is not changed in this patch. A robust admin grant/revoke feature should use a dedicated, auditable entitlement source with actor, reason, start/end, and revocation metadata, and define precedence against paid subscriptions. Do not implement an implicit override by changing the current user's cache field.

### 5. Admin aggregate statistics use the denormalized cache

`backend/admin.js` groups user counts by `users.tariff_plan`, not by effective entitlement. This is reporting, not an authorization decision, but may misstate active paid-plan counts after expiry or when the cache diverges. A future reporting change should distinguish cached plan from effective active entitlement and avoid an N+1 query pattern.

## Regression coverage added

`backend/test/tariff.test.js` now covers:
- a successful expired subscription overriding a stale `agency` user cache;
- a current successful `pro` subscription overriding a stale `none` user cache.

The tests exercise the shared resolver. They do not execute the Express `/me` route or a real Supabase/PostgreSQL instance.

## Verification and limitations

- Source inspection only; Node tests were not executed in this environment.
- No live Supabase queries, SQL migrations, payment-provider calls, or production changes were performed.
- No deploy or merge was performed.
- The profile response now depends on the subscription lookup succeeding; this is intentional fail-closed behavior consistent with protected tariff middleware.

## Files changed

- `backend/index.js`
- `backend/test/tariff.test.js`
- `docs/audits/AUD-135-effective-tariff-state-consistency.md`

## Follow-up finding — paid entitlement could be hidden by a stale `none` cache

A deeper review of `backend/tariff.js:getTariffState` found that it returned immediately when `users.tariff_plan` normalized to `none`, before querying `subscriptions`. This contradicted the documented precedence rule and meant that a valid successful subscription could be invisible whenever the denormalized user cache was stale at `none`.

Fixed in the follow-up:
- Always query the latest successful subscription, regardless of the cached user plan.
- If a successful subscription exists, derive the effective plan and expiry from it.
- Use the manual user plan only when no successful subscription exists.
- Continue to fail closed on subscription-query errors.
- Explicitly keep a successful row with a normalized `none` plan inactive.

The regression test already added in `backend/test/tariff.test.js` for a current successful `pro` subscription overriding a stale `none` cache now exercises the previously broken branch.

## Manual admin tariff operations — no user-targeted grant/revoke API found

The only tariff mutation route found in `backend/index.js` is `PATCH /me/tariff`. In production it checks that the caller is an administrator, but it still updates only `req.userId` (the administrator's own user row). It accepts only a plan name, does not accept a target user, period end, reason, or idempotency key, and does not create an audit record.

No `/admin/users/:id/tariff` grant/revoke endpoint was found among the registered admin routes. The existing `GET /admin/subscriptions` route is read-only. Therefore the current backend does not provide a proper audited admin workflow for granting, extending, or revoking another user's manual entitlement.

Do not repurpose `PATCH /me/tariff` for this. A dedicated workflow needs an explicit data model and precedence policy:
- target user and actor admin;
- plan, start/end timestamps, reason/ticket;
- immutable grant history and explicit revocation;
- idempotency key and concurrency/overlap policy;
- defined precedence against paid subscriptions and refunds;
- effective entitlement resolution across manual grants and paid subscriptions.

## Admin statistics caveat

`backend/admin.js:getStats` groups by `users.tariff_plan` only. It is a cache breakdown, not a count of active entitlements. Rename/label it accordingly or replace it with an efficient aggregate over the canonical entitlement data in a separate reporting change. Avoid per-user N+1 subscription lookups.

## Follow-up verification

- Source-level inspection only.
- No Node test suite executed; the new regression is committed but not yet run.
- No SQL, production database, payments, or deployments were touched.

## Follow-up finding — delayed webhook ordering differed between backend and Pinterest OAuth SQL

Migration 019 explicitly preserves the plan from the newest-created successful paid order when an older payment webhook arrives late. However, both the backend resolver and the Pinterest OAuth commit RPC in migration 038 previously sorted successful orders by `period_end DESC` before creation time. A delayed older order can receive a later accumulated `period_end`, causing the wrong plan to win (for example, an old Agency order overriding a newer Analytics purchase).

The backend resolver now orders by `created_at DESC, id DESC`, matching migration 019. It uses `users.tariff_period_end` as the accumulated entitlement horizon, because a delayed older webhook can extend that horizon without becoming the current plan.

Added forward-only migration:
- `db/migrations/080_pinterest_oauth_effective_entitlement_precedence.sql`
- The OAuth RPC now always checks successful subscriptions, even when the cached user plan is `none`.
- It selects the newest-created successful order for the plan and uses the accumulated user period end for expiry.
- Manual grants remain the fallback only when no successful paid subscription exists.

Added an integration SQL scenario to `backend/test/pinterest-multi-account-oauth.integration.sql`: stale `none` cache + older Agency order with later `period_end` + newer Analytics order must allow one Pinterest account and reject the second at the Analytics cap.

## Verification update

- Backend source, regression tests, migration 080, and SQL integration scenario were committed to the feature branch.
- The migration and SQL integration scenario have not been executed against PostgreSQL; SQL syntax and runtime behavior remain unverified.
- No production migration, database write, or deployment occurred.
