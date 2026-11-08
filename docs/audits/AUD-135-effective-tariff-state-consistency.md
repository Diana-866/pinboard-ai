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
