# AUD-327 — Cross-account API isolation and object ownership review

Date: 2026-11-10
Branch: `feat/persisted-boards-api`

## Scope

Reviewed the current Express route inventory in `backend/index.js`, the Pinterest route registration and service layer in `backend/pinterest.js`, ownership helpers, project/board serializers, board/pin patch validators, review-queue validation, admin authorization, relevant route tests, and migrations 113/120 for the manual-review queue. Rechecked the previous AUD-104/AUD-117 ownership map and newer schedule/review-queue audits. This is source-level analysis only; no live two-user HTTP test or production Supabase access was performed.

## Executive result

**No confirmed cross-account read/write IDOR was found in the reviewed route paths.** The service-role client bypasses RLS, so API-level ownership predicates are the effective security boundary. The inspected routes consistently derive identity from the verified JWT (`req.userId`) and scope resource access before writes or provider actions.

## Confirmed controls

### Projects, boards, and pins

- Project list/detail/analyze routes constrain by `projects.user_id = req.userId`; updates repeat the owner predicate.
- Project creation and onboarding project creation set `user_id` from the verified session, not the request body.
- Project board listing first verifies project ownership, then queries boards by that owned project ID.
- Board create verifies the supplied project ID against the current user before inserting; idempotent create reads back by the verified project ID plus request key.
- Board detail/update and pin operations use the board/pin ownership traversal: board → project → user; pin → board → project → user. Missing or malformed relationship data fails closed.
- Pin patch/status/image upload constrain the subsequent write by both pin ID and the already-verified board ID. Image upload also uses compare-and-swap on the prior image URL.
- Board and project serializers strip internal owner IDs; board serializer also strips internal idempotency keys/fingerprints.
- Generation recovery lookup scopes by both current user ID and idempotency key, and its serializer omits provider prompts, task IDs and raw operational errors.

### Manual review queue

- Queue reads filter by current `user_id`; deletes filter by both row ID and current user ID.
- Upsert sets `user_id` from `req.userId` and uses composite conflict identity `(user_id,id)`, preventing one account from overwriting another account's row with the same client-selected queue ID.
- Migration 120 revokes table privileges from public/anon/authenticated and grants access only to service_role; RLS is enabled without client policies.

### Pinterest and scheduling

- Pinterest account lookups always include `user_id`; caller-supplied account IDs are resolved only inside that user's active accounts.
- Pinterest board preflight uses the selected account's token and verifies the returned remote board ID exactly.
- Manual publication resolves the local pin owner before account selection, board verification, and atomic publish reservation.
- Schedule list and all inspected retry/cancel/change-board/reconcile routes scope the schedule by both its ID and current user. Mutations repeat user and state predicates or call RPCs with the authenticated user ID.
- The internal scheduler worker is intentionally unauthenticated by user JWT but checks a separate 32+ character secret using constant-time comparison before processing.
- OAuth callback is intentionally public at HTTP level but verifies signed state, browser binding, current user token version and one-time attempt identity before commit.

### Credits, billing, and administration

- Credit history, subscription history and credit-purchase history are scoped to current user ID. Payment creation functions receive user ID from middleware, not body input.
- Admin middleware reads `is_admin` from the database using the authenticated user ID and fails closed on lookup errors; a request-body `is_admin` field does not grant privileges.
- Inspected admin routes consistently apply both `requireAuth` and `requireAdmin`. Financial/admin RPC calls receive operator identity from `req.userId`.
- Public Prodamus webhook is a provider callback with signature verification and order lookup, not a user-facing object lookup.

## Finding

### AUD-327-01 — Manual review queue accepts unverified foreign or nonexistent pin references (low severity, integrity)

`PUT /review-queue/:id` calls `normalizeReviewQueuePin`, which validates the client-supplied `pinId` only by coercing it to a string and limiting its length. The route then persists that value as `pin_review_queue.pin_id` without checking that the referenced pin exists and belongs to `req.userId`. Migration 113 intentionally defines `pin_id` as nullable text without a foreign key.

Current impact is limited: queue reads return the caller's own saved payload and do not dereference the foreign pin to reveal its contents. No cross-account data disclosure or write to the other user's pin was found. However, a queue row can claim a relationship to another user's pin, and future code that trusts this link could create a confused-deputy path. If `pinId` is intended to represent a real persisted pin, validate it through the same pin → board → project ownership chain before upsert; otherwise explicitly treat it as untrusted client metadata and rename/document it accordingly. Add tests for foreign, missing, malformed and owned pin IDs.

## Additional observations / limits

- `GET /me` returns the current user's own `is_admin` boolean. This is not an authorization bypass; admin decisions are independently rechecked from the database.
- `GET /boards/:id/pins` returns the pin row projection (`select("*")`) after board ownership is verified. The checked schema and current serializers should be revisited if new internal/provider columns are ever added to `pins`; an explicit public projection would be safer long-term.
- The route inventory does not prove live Supabase grants, deployed code revision, RPC bodies currently installed in production, actual JWT isolation, or Storage bucket policy.
- Existing unit tests cover individual serializers, patch validators, ownership comparison, admin guard and queue payload normalization, but do not substitute for a two-account API integration suite.

## Recommended next steps

1. Add two-user HTTP integration tests for project/board/pin CRUD, generation recovery, schedule retry/cancel, Pinterest account selection, credit/payment history and admin endpoints. Assert both response status and absence of foreign writes/provider calls.
2. Validate review-queue `pinId` ownership before persisting it, or explicitly model it as an untrusted optional client-side reference.
3. Replace `select("*")` on client-facing pin reads with an explicit allowlist of public fields before adding any internal columns to the pin table.
4. Add a regression rule/code review checklist: every service-role query involving a client-selected object ID must carry an owner predicate or first resolve ownership through a verified parent chain; every SECURITY DEFINER RPC must enforce equivalent checks transactionally.
5. Verify deployed database grants/RLS and the exact migration set independently of repository source.

## Verification and safety

- GitHub source, migration and test review only. No tests, HTTP calls, live user accounts, production DB, provider APIs, SQL migrations, deployments or external writes were run.
- No source code, data, credentials, permissions, repository settings or production resources were changed.
