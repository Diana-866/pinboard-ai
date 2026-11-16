# Backend audit 08 — project/board/pin ownership and account deletion

- Date: 2026-11-16
- Branch: `main`
- Base HEAD reviewed: `7327f2946b20e8e07de02c8b68237373a70d6f06`
- Scope: project/board/pin ownership boundaries, relevant `backend/index.js` routes, account export/deletion lifecycle, supporting SQL and tests.
- Result: no confirmed critical defect in the statically reviewed scope. This is not a runtime, staging, or production certification.

## Files reviewed

### Backend
- `backend/index.js` (route inventory: 73 Express route declarations; detailed review of project, board, pin, schedule, account export/deletion and admin-storage route groups)
- `backend/projectSerialization.js`, `backend/boardSerialization.js`
- `backend/boardPatch.js`, `backend/pinPatch.js`, `backend/pinStatusGuard.js`
- `backend/accountLifecycle.js`
- `backend/accountDeletionWorker.js`, `backend/accountDeletionWorkerGate.js`

### Storage/image controls relevant to project and pin ownership
- `backend/storage.js`, `backend/pinImageLifecycle.js`
- `backend/imageValidation.js`, `backend/imageUploadValidation.js`, `backend/publicUrl.js`
- `backend/pinImageCompareAndSwap.js`, `backend/pinImageRateLimitKey.js`

### SQL
- `db/migrations/001_baseline.sql` — project/board/pin foreign keys and RLS policies.
- `db/migrations/111_idempotent_board_creation.sql`, `124_board_category_separate_from_description.sql`.
- Account deletion sequence: `128`–`147`, including publication fencing, password reauthentication/token-version fence, durable queue, preflight inventory, Pinterest disconnect, Storage manifest/origin fence, review-queue and board-cover image inventory, provider/financial outcome waits, stage completion guards, and bounded Storage batch retry.
- `db/migrations/145_pin_image_lifecycle_guard_review_and_board_references.sql` — upload/deletion reservations include pin, schedule, generation/replay, board-cover and review-queue references.

### Related tests/contracts present in repository
- `backend/test/project-serialization.test.js`, `project-provisioning-order.test.js`
- `backend/test/board-patch.test.js`, `board-serialization.test.js`, `board-pins-pagination.test.js`
- `backend/test/pin-patch.test.js`, `pin-status-guard.test.js`, `pin-image-access-contract.test.js`, `pin-image-compare-and-swap.test.js`, `pin-image-lifecycle.test.js`, `storage-rehost.test.js`
- `backend/test/account-lifecycle.test.js`, `account-deletion-worker.test.js`, `account-deletion-worker-gate.test.js`
- SQL integration contracts: `account-deletion-durable-queue.integration.sql`, `account-deletion-publication-fence.integration.sql`, `account-deletion-reauth-version.integration.sql`, `account-deletion-storage-manifest.integration.sql`, plus pin-image deletion/retention and board-creation idempotency integration tests.

## Findings

### 1. Project, board and pin ownership

- Project reads and writes in the reviewed route group scope by both resource ID and `req.userId`.
- Board ownership is resolved through `boards -> projects.user_id`; pin ownership through `pins -> boards -> projects.user_id`. The shared helpers return 404 for missing or foreign resources.
- Board creation checks ownership of the parent project before insert. Board and pin mutations are then constrained to the checked parent ID.
- The baseline migration enables RLS for projects, boards and pins and defines owner policies through the project relationship.
- Project and board serializers remove internal owner IDs; board serialization also removes idempotency request IDs/fingerprints.
- The board/pin route group includes bounded pagination for board pins and exact pin counts rather than relying on PostgREST's default row cap.
- The development top-up route is not session-authenticated, but its request validator fails closed in production and unless `ENABLE_DEV_TOPUP=true`; it also requires a 32+ character `ADMIN_SECRET` and uses `timingSafeEqual`. It is rate-limited. Public billing catalogue/health routes are read-only. No unauthenticated write path was confirmed in this route inventory.

### 2. Image upload, rehosting and deletion

- Uploaded image bytes are checked against PNG/JPEG/WebP/GIF signatures, declared MIME and a 5 MiB ceiling; the bucket allow-list is validated.
- Provider image rehosting validates a public URL, rejects private/special-use IP ranges, pins DNS resolution to the validated addresses, requires HTTPS and disables redirects/proxy use.
- Managed object paths are restricted to the application's generated naming scheme and the configured Supabase project's exact origin.
- Upload and deletion use database lifecycle reservations/fencing. Ambiguous Storage/network outcomes remain fenced for reconciliation; stale upload inspection is observational rather than automatically releasing a potentially active request.
- Pin image replacement uses compare-and-swap against the previous `image_url`; failed replacement cleanup only removes an unreferenced managed object.
- Deletion reference checks include pins, non-cancelled schedules, generation and regeneration journals/results, board covers and review-queue payloads. Account-deletion manifest migrations inventory those same classes of user image, including review-queue snapshots and board covers.
- No confirmed critical defect found in the reviewed static code. Actual Supabase bucket configuration, object permissions, Storage behavior and deletion recovery remain unverified against a live environment.

### 3. Account export and deletion

- Export is authenticated and paginates sections; profile and Pinterest account exports use explicit column allow-lists that omit password hashes and OAuth credentials. Degraded sections are reported rather than silently represented as complete.
- Deletion requires an authenticated request and fresh password reauthentication. The request RPC advances `token_version` and fences the account as `deletion_pending`; the HTTP request itself does not erase data.
- Both embedded and standalone deletion workers share the explicit `ACCOUNT_DELETION_WORKER_ENABLED=true` gate. The deletion request is rejected with 503 while the gate is off. This is intentional fail-closed behavior, but means account deletion is not operational until the worker is deliberately enabled and validated in staging.
- Worker jobs are claimed one at a time with a 15-minute lease. Preflight inventories user-owned rows and exact managed Storage paths before Pinterest credential revocation. Content erasure is a separate fenced stage; Storage objects are deleted only from the persisted manifest through the shared lifecycle guard; finalization retains financial records and a pseudonymous user tombstone.
- SQL guards prevent completion while Storage manifest objects or required provider/financial outcomes remain unresolved. Bounded batches avoid large single-request deletion runs.

## Verification status and blockers

- Static source and SQL inspection only. No Node tests, SQL integration tests, PostgreSQL migration-chain test, Storage integration, account-deletion execution, or live user-flow test was run in this environment.
- The latest observed GitHub Actions runs for the reviewed mainline commit failed before any job step was created (empty step lists and no runner name). This is not evidence that the tests themselves failed; it means they did not execute.
- Do not enable account deletion in production merely to clear the gate. First validate the full worker and SQL chain in staging, including a complete export/deletion/restore acceptance path.
- No production SQL, data, Storage objects, payments, secrets or deployment settings were changed.

## Next

Continue the full `backend/index.js` route-by-route review and reconcile the remaining route groups with handlers, tests and SQL. The route inventory is complete, but this audit package does not claim that every handler in the 3,096-line entrypoint has been read line by line. Keep the full backend audit open; do not mark runtime tests as passed.


## Follow-up after the baseline review — atomic pin status/publication fencing

A separate race was found while reviewing the pin status transition: the HTTP handler's publication-history preflight and the subsequent `pins.status` UPDATE were separate requests. A schedule insertion or provider publication reservation could win between them.

The race was closed in `main`:
- `db/migrations/148_atomic_pin_publication_status_fencing.sql` adds a BEFORE UPDATE trigger that blocks rejection when a pin has active/uncertain schedules, any publication attempt, or a publication ledger row.
- The migration adds a BEFORE INSERT trigger for `pin_schedules` that locks the owning pin and requires the same owner plus `status='approved'`.
- `begin_pinterest_publish_v2` now locks in account → pin order and only creates a provider attempt while the pin remains approved.
- `begin_scheduled_pinterest_publish` now uses account → pin → schedule order, matching the schedule-insert/status lock order and avoiding a pin/schedule lock inversion.
- During review, the replacement initially omitted the existing `users.account_status <> 'active'` guard from migration 128. Restored it in migration 148 and added a static regression assertion; the existing account-deletion publication-fence SQL integration test is now documented to run after the full chain through 148.
- `backend/pinterest.js` maps the database `pin_not_approved` result to HTTP 409.
- Added `backend/test/pin-status-publication-fencing.test.js` and `backend/test/pin-status-publication-fencing.integration.sql`; the SQL test covers rejection with active schedule/history, schedule creation after rejection, provider reservation after rejection, and rejection after a publication attempt is reserved.
- `.github/workflows/atomic-payment-integration.yml` now applies migrations 146–148 in sequence and runs both new tests.

**Verification:** GitHub Actions runs `43896658532` (atomic integration) and `43896658463` (persisted boards) failed before any job step was created; rerun of the previous run also failed/queued without steps. No Node/PostgreSQL test result exists yet. Vercel status on HEAD `44b8f4f1` is `build-rate-limit`. The migration has not been applied to PIN_TRIAL or production.
