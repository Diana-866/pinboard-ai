# AUD-104 — Route authorization and object ownership audit

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`  
Scope: Express routes in `backend/index.js` and Pinterest routes in `backend/pinterest.js`; project, board, pin, image, schedule, Pinterest-account, credit, billing and admin access paths.

## Result

No confirmed cross-account IDOR or mass-assignment vulnerability was identified in the inspected routes. The reviewed routes consistently derive the acting user from `requireAuth` and scope object access either directly by `user_id` or through the ownership chain:

- project → `projects.user_id`
- board → `boards.project_id` → `projects.user_id`
- pin → `pins.board_id` → `boards.project_id` → `projects.user_id`
- schedule → `pin_schedules.user_id`
- Pinterest account → `pinterest_accounts.user_id`

This is important because the backend uses the Supabase service role, which bypasses ordinary RLS enforcement; API-level ownership checks remain a critical security boundary.

## Route inventory and controls

### Authentication and profile
- Registration, login, verification, resend-verification, forgot-password and reset-password are public by design and use dedicated rate limiters / one-time token flows.
- `GET /me`, `PATCH /me`, `PATCH /me/onboarding` require authentication and only update the current user's row.
- `PATCH /me` builds an explicit allow-list (`name`, `surname`, `preferred_language`); caller cannot mass-assign `is_admin`, credits or tariff.
- `PATCH /me/tariff` requires the current user to be a DB-authorized admin unless the explicit non-production self-select switch is enabled.

### Projects, boards and pins
- Project list/detail and analysis routes filter by `user_id = req.userId`.
- Project creation always sets `user_id` from the authenticated identity; request body cannot select another owner.
- Project board listing first verifies project ownership, then selects boards by that project ID.
- `getBoardWithOwnerCheck` resolves board → project and verifies the project's owner before returning it.
- `getPinWithOwnerCheck` resolves pin → board → project and verifies the project owner.
- Pin edit, status, image upload and regeneration routes use the pin ownership helper before writing; writes are additionally constrained by the verified pin's board ID.
- Board creation first verifies the supplied project belongs to the caller. Board updates use the verified board ID and its project ID.
- Board list/detail/pin-list routes are scoped through the caller's project IDs or the board ownership helper.
- Generation routes require authentication and tariff middleware; they do not accept arbitrary owner IDs from the caller.

### Schedules
- Schedule list filters by `pin_schedules.user_id`.
- Schedule reconciliation, retry and cancellation first load the schedule with both `id` and current `user_id`.
- Scheduling starts from an owned pin; the selected Pinterest account is resolved under the current user, and the remote board is verified through that exact account before persistence.
- Retry revalidates the saved account and remote board, then calls a user-scoped database RPC.
- Cancellation updates only a matching user's schedule in `scheduled` state, preventing cancellation of another user's schedule or a currently claimed publication.

### Pinterest
- OAuth start and account status/disconnect require authentication.
- OAuth callback is intentionally unauthenticated at the HTTP layer; it validates a signed, expiring state token, verifies the user's current token version, and commits a single-use attempt through a user-scoped RPC.
- Account selection uses `getAccount(userId, accountId)` / `getAccounts(userId)`, so a caller-supplied foreign account ID is not accepted.
- Board reads and publication run through the resolved account for the authenticated user.
- Manual publication requires authentication, rate limiting and an eligible tariff.
- The internal schedule worker is intentionally not user-authenticated; it requires a separately configured secret of at least 32 bytes and constant-time comparison before claiming work.

### Credits, billing and admin
- Credit history filters by current user.
- Payment creation and purchase/subscription history use the authenticated user ID, not a caller-provided owner ID.
- Prodamus webhook is public by design and uses the provider webhook verification/fulfillment path.
- Public billing catalog and health routes expose configuration/catalog metadata only.
- Admin routes use both `requireAuth` and DB-backed `requireAdmin`.
- `POST /credits/dev-topup` is intentionally public at the route layer but fails closed unless the environment is non-production, `ENABLE_DEV_TOPUP=true`, a 32+ character `ADMIN_SECRET` exists, and the request supplies a timing-safe matching secret. It returns 404 in production/when disabled.

## Mass-assignment review

Inspected profile, tariff, project, board, pin, schedule and billing request handlers. The relevant writes construct explicit field objects rather than spreading `req.body` into database updates. Sensitive fields such as `user_id`, `is_admin`, `credits_balance`, publication IDs, token columns and tariff state are not directly accepted by the inspected user-facing update routes.

## Residual risks / verification gaps

1. This was a source review, not a live two-account adversarial test. No production Supabase data, JWTs, Pinterest credentials or payment endpoints were exercised.
2. The service-role database client bypasses RLS. Any future route that adds a query by object ID must repeat the ownership check in the same handler or use a user-scoped SECURITY DEFINER RPC with equivalent checks.
3. A few helpers traverse PostgREST embedded relations and assume the expected relationship shape. Missing/null relations currently fail closed (typically as an error/404), but should remain covered by tests when schema relationships change.
4. Public endpoints (auth, email verification, OAuth callback, Prodamus webhook, health/catalog, internal worker and dev top-up) rely on their dedicated token/signature/secret controls and rate limits; these controls need environment-level verification.
5. The route audit did not validate live database grants, RPC function bodies, proxy trust configuration, production rate-limit behavior, or deployed environment flags.

## Recommended next step

Add automated route-level tests with two users and foreign project/board/pin/schedule/account IDs. Assert 404/403 and verify that no database writes or provider calls occur. Prioritize `/boards/:id`, `/pins/:id/image`, `/schedule/:id/retry`, `/schedule/:id/cancel`, and Pinterest account selection.

## Change and deployment status

Audit documentation only. No production SQL, bucket configuration, environment variables, external provider calls, deployment or merge was performed. No tests were run as part of this source-only audit.
