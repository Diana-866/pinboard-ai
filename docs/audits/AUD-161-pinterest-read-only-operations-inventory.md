# AUD-161 — Pinterest read-only operations inventory design

**Scope:** follow-up source review on `feat/persisted-boards-api` after AUD-160. No application code or production data changed.

## Confirmed implementation boundary

- The only admin Pinterest route currently registered in `backend/index.js` is `POST /admin/pinterest/reconcile-unknown-publication`, guarded by `adminActionLimiter`, `requireAuth`, and `requireAdmin`.
- `backend/adminPinterestReconciliation.js` calls only the narrow positive-evidence RPC. It does not list schedules, read attempts, call Pinterest, or provide retry/cancel behavior.
- `frontend/src/components/admin/AdminPanel.tsx` currently uses mock admin data and has tabs for users, accounting, night/bot, mail, subscriptions, billing exceptions, and email outbox. It has no Pinterest tab or API-backed operational inventory.
- The migration 082 reconciliation RPC accepts only stale `unknown` schedules with no active claim and a matching stale attempt in `unknown`/`processing` with `retry_safe=false`. It records positive evidence; it cannot mark non-publication or enable a retry.
- The schedule schema contains `status`, `scheduled_at`, `updated_at`, `attempts`, `last_error`, `next_attempt_at`, `claim_token`, `pin_id`, `pinterest_account_id`, `pinterest_board_id`, and `pinterest_pin_id`. The attempt journal contains `status`, `retry_safe`, `last_error`, `updated_at`, and remote identity fields; account-scoped uniqueness is used in later migrations.

## Finding AUD-161-A — operator discovery is not wired to the admin UI

**Severity: operational gap; no confirmed duplicate-publication or authorization vulnerability.**

The positive-only reconciliation action is not discoverable from the admin panel. An operator must obtain schedule ID and exact remote Pinterest pin/board IDs outside the application. There is no admin inventory to triage overdue `scheduled`, stale `publishing`, or `unknown` rows, nor to inspect the related attempt journal.

## Recommended read-only API contract

Add `GET /admin/pinterest/schedules` behind `adminActionLimiter`, `requireAuth`, and `requireAdmin`. It must be strictly read-only and must not call Pinterest or any mutating RPC.

Suggested bounded query:
- `status`: optional allowlist of `scheduled,publishing,unknown,failed,published`; default to operationally relevant `scheduled,publishing,unknown`.
- `limit`: integer 1–100, default 50.
- `cursor`: opaque keyset cursor based on `updated_at,id`; avoid unbounded offset scans.
- `kind`: optional allowlist for `overdue_scheduled,stale_publishing,unknown,all`.

Classification should be derived server-side using one documented threshold (20 minutes for stale `publishing` / `unknown` eligibility, and scheduled time plus due/next-attempt time for overdue scheduled rows). Do not label a row as retryable merely because it is overdue. The database's durable attempt journal remains authoritative for `retry_safe`.

Minimum response fields:
- schedule ID, pin ID, owner ID (or privacy-safe stable reference), Pinterest account ID;
- schedule status, scheduled/updated/published timestamps, attempt count, next-attempt timestamp;
- reserved board ID and already-recorded remote pin ID;
- last error, claim-present boolean (never the claim token);
- matching attempt status, `retry_safe`, attempt updated timestamp, attempt remote IDs;
- server-derived triage category and explicit `actionable_reconciliation` boolean only when the exact positive-only reconciliation preconditions can plausibly be met.

Never return OAuth tokens, encrypted token fields, claim tokens, content snapshots, image URLs, descriptions, or other user-private creative content. Consider masking owner/account identifiers in the UI where full values are not operationally necessary.

## Query and correctness constraints

1. Filter/join schedules and attempts by both `pin_id` and `pinterest_account_id`; never join only by pin ID because the account-scoped schema permits multiple account identities.
2. Detect missing or conflicting attempt records explicitly; do not silently drop schedules via an inner join.
3. Use bounded pages and deterministic keyset ordering. Validate cursor format and status/kind allowlists.
4. The read endpoint must not update timestamps, acquire/release claims, change statuses, enqueue work, or call the Pinterest API.
5. `unknown` and stale `publishing` remain unresolved, not retry candidates. Display `retry_safe=false` clearly. A positive reconciliation button should be a separate explicit workflow requiring external confirmation of the exact remote pin and board plus evidence reference.
6. Do not expose raw `claim_token`, OAuth credentials, content snapshots, or service-role errors.
7. Add tests for admin guard ordering, parameter bounds, deterministic pagination, redaction, state classification, account-scoped join behavior, and a mock proving that GET performs only selects and never calls RPC/update/insert/delete.
8. Frontend should show read-only diagnostics first. Do not add a retry, publish, cancel, or "mark not published" action in this scope.

## Migration / production caveat

The scheduler setup guide still documents that external cron is not configured in production and that the required Pinterest migrations, encryption key, and Pinterest access must be verified before enabling it. This audit did not independently inspect the live database or hosting environment. Do not enable cron as part of this work.

## Verification limits

Source-level review only. Node tests, frontend build, PostgreSQL integration SQL, and CI were not executed. No production Supabase, Pinterest, cron, hosting, or deployment changes were made. PR #4 remains open and Draft; do not merge without explicit approval.
