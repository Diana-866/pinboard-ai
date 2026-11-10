# AUD-162 — read-only Pinterest inventory API implementation

## Delivered

- Added `backend/adminPinterestInventory.js` with bounded `limit` (1–100) and `offset` (0–10000), allowlisted status filters, and read-only selects from `pin_schedules` and `pinterest_publish_attempts`.
- Added `GET /admin/pinterest/schedules` protected by `adminActionLimiter`, `requireAuth`, and `requireAdmin`.
- Matching is keyed by both `pin_id` and `pinterest_account_id`; legacy null-account records are kept in a separate legacy bucket.
- Response uses an explicit allowlist and omits claim tokens, content snapshots, image URLs, and attempt primary keys.
- Classifies overdue scheduled rows, stale publishing rows (20-minute threshold), and unknown rows.
- `actionable_reconciliation` is only an informational hint when schedule and attempt are old enough, the attempt is unknown/processing with `retry_safe=false`, no claim exists, and board/known remote-pin identities agree. The existing SQL reconciliation RPC remains the authority and revalidates all conditions transactionally.
- Added `backend/test/admin-pinterest-inventory.test.js` covering bounded query construction, account-scoped attempt matching, state classification, redaction, invalid filters, and fresh/conflicting attempt hints.

## Deliberate limitations / next steps

- This is API-only. The frontend admin panel has not yet been connected; its current admin data includes mock-backed sections.
- Pagination currently uses bounded offset pagination, not keyset cursors. If inventory volume grows, replace with a stable cursor over `updated_at,id`.
- The list reads schedules and attempts in two separate queries; the returned attempt state is an operational snapshot, not a transactional lock. Any action must continue to rely on the database reconciliation RPC.
- The API does not call Pinterest, mutate rows, acquire claims, retry, cancel, or publish.
- No new SQL migration is required for the fields read by this endpoint; they are established in migrations 015–017, 031–034, 050–052, and 081–082.

## Verification

- Source review completed.
- Node tests were added but not executed in this environment.
- PostgreSQL integration tests, frontend build, and live database checks were not executed.
- Latest PR commit status: Vercel reports `failure` with `build-rate-limit`; no GitHub Actions workflow runs are reported for the commit. Do not bypass the provider's build limit.
- PR #4 remains Draft and unmerged. No production deployment or database changes were made.
