# AUD-136 — Admin tariff controls and statistics integrity

**Status:** source audit and bounded fix completed; production behavior not changed.

## 1. Manual tariff administration is not implemented

The current API has no route that grants, changes, or revokes a tariff for an arbitrary target user.

- `PATCH /me/tariff` can update only the authenticated caller's own `users.tariff_plan`.
- In production, that route is restricted to a caller whose current `users.is_admin` flag is true. The non-production self-select switch is separate.
- It does not accept a target user ID, set a period end, record a reason, or write an audit event.
- The entitlement resolver treats a user row without a successful subscription as a manually managed tariff; a NULL period end means unlimited manual access.
- The Pinterest OAuth RPC independently mirrors this manual fallback.

This is not a safe substitute for an admin grant/revoke workflow. No mutation route or schema was added in this pass because the precedence contract must be explicit before adding a second entitlement source.

### Recommended contract before implementation

Introduce an append-only manual entitlement ledger with at least:
- target user ID, plan, optional expiry, reason/ticket;
- actor admin ID and creation timestamp;
- explicit revocation timestamp and revoking admin ID (no destructive deletion);
- validation that the actor is an active admin at transaction time;
- a single canonical precedence rule shared by backend API gates and the Pinterest OAuth RPC.

The policy must explicitly decide how manual grants interact with paid subscriptions (for example, whether a grant temporarily overrides paid plan, or whether the newest paid purchase always wins). Until this is agreed, do not add an endpoint that mutates `users.tariff_plan` directly.

## 2. Statistics could silently truncate

Before this change, `backend/admin.js:getStats()` selected all users and credit transactions in one Supabase response. The default response row cap can truncate large tables without the endpoint indicating that totals are incomplete.

Also, month grouping used local server timezone via `getFullYear()` / `getMonth()`, so the same UTC timestamp could be assigned to different months depending on deployment region.

### Changes

- Added paginated reads in `backend/admin.js` using 500-row ranges until a short page is returned.
- Month grouping now uses UTC calendar months and safely skips invalid timestamps.
- Invalid/non-finite transaction amounts are ignored instead of contaminating aggregates with NaN.
- Added `backend/test/admin-stats.test.js` for pagination beyond 1,000 rows, UTC month-boundary behavior, malformed input handling, and aggregation.

The tariff breakdown in `getStats()` still counts cached `users.tariff_plan` labels. It is explicitly not an effective active-entitlement count; that would require applying the canonical entitlement resolver or a database aggregation that shares its precedence logic.

## 3. Admin UI data limitation

The users/activity tab in `frontend/src/components/admin/AdminPanel.tsx` still reads `ADMIN_USERS` mock data. Its user totals, active-subscriber cards, and detailed activity table must not be treated as live customer data. The subscriptions tab is a separate API-backed component. This existing UI issue should be resolved before relying on the user/activity dashboard operationally.

## Verification boundaries

- Source changes were committed to the existing PR branch and re-read from GitHub.
- Node tests were added but not executed in this environment.
- No Supabase database, customer records, payment provider, merge, or deployment was touched.
