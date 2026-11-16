# Backend audit 09 — `backend/index.js` API map and launch risks

- Date: 2026-11-16
- Branch: `main`
- Reviewed HEAD: `a1d2905850718f69a52b6fc275cf2172adfde0dd`
- Entrypoint: `backend/index.js`, 3,098 lines, 73 Express route declarations.
- Scope: complete route inventory, middleware/startup review, targeted inspection of project/board/pin/review-queue, generation, schedule, billing and admin handlers, cross-reference with packages 01–08.
- Status: API map completed; this is not a claim that every line of the 3,098-line file has been manually reviewed or that runtime behavior has been certified.

## 1. Startup and request boundary

- Installs fatal-process handlers, generates a server-owned `x-request-id`, uses Helmet, exact-origin CORS allow-list, JSON body limit 100 KiB and bounded multipart parsers.
- Prodamus webhook parser is registered before the general JSON parser and accepts only multipart, URL-encoded or JSON with a 32 KiB limit. Signature and payment semantics are delegated to the billing services.
- Image upload is memory bounded to one file / 5 MiB and MIME allow-listed before the route handler; byte-signature checks are in the storage/image layer.
- `requireAuth` verifies the bearer JWT and checks `users.token_version` on each request. A database lookup failure returns 503 rather than treating the request as authenticated.
- `requireAdmin` re-reads `users.is_admin`; sensitive operator RPCs additionally re-check administrator identity in SQL.
- The current mainline now fails startup if `JWT_SECRET` is missing or shorter than 32 UTF-8 bytes; production Supabase startup also requires `SUPABASE_SERVICE_ROLE_KEY`. These settings must be present in the deployment environment before release.
- Rate limits: auth, verification, resend, payment creation, image upload, Pinterest scheduling and a shared per-user AI limiter. The AI limiter uses the process-local MemoryStore; it is not a global quota across multiple backend instances.

## 2. API → handler → service → data map

### Public, authentication and account lifecycle

| API | Handler/service | Data boundary |
|---|---|---|
| `GET /`, `GET /health` | inline health handlers | no database |
| `POST /register`, `POST /login` | `auth.js` | `users`, `auth_tokens` via verification service |
| `POST /verify-email`, `POST /resend-verification` | `email-verify.js` | `users`, `auth_tokens`, mail outbox |
| `POST /forgot-password`, `POST /reset-password` | `password-reset.js` | `users`, `auth_tokens`, transactional mail |
| `GET /me`, `PATCH /me`, `PATCH /me/onboarding`, `PATCH /me/tariff` | inline profile handlers, `tariff.js` | `users`, and `projects` for onboarding |
| `GET /account/export`, `POST /account/deletion-request` | `accountLifecycle.js`, deletion worker/RPCs | user-owned project, pin, credit, subscription, Pinterest and image-manifest data; financial records retained by policy |

### Projects, AI, boards, pins and manual review

| API | Handler/service | Data boundary |
|---|---|---|
| `POST /projects`, `GET /projects`, `GET /projects/:id` | inline handlers, project serializer/provisioning order | `projects` scoped by `user_id` |
| `POST /projects/:id/analyze` | `analyze.js` | owner-scoped `projects`; SSRF-safe site analysis |
| `POST /keywords` | `keywordIdeas.js` | latest project niche/language; no measured search-volume data |
| `POST /projects/:id/boards/generate` | `boards.js` | owner-scoped `projects`; inserts `boards` |
| `GET /projects/:id/boards`, `POST /boards`, `GET /boards`, `GET /boards/:id`, `PATCH /boards/:id` | board helpers/serializers | `projects`, `boards`; ownership via project |
| `GET /boards/:id/pins`, `PATCH /pins/:id`, `POST /pins/:id/status` | pin/board helpers, `pinStatusGuard.js` | `pins`, `boards`, `projects`; publication history checked before rejection |
| `POST /pins/:id/image` | `storage.js`, image lifecycle/CAS | `pins`, managed Supabase Storage object lifecycle |
| `POST /pins/:id/regenerate`, `POST /boards/:id/pins/generate` | `pins.js`, GPTunnel, generation pricing and journal RPCs | `pins`, `pin_generation_requests`, `pin_generation_tasks`, `pin_regeneration_requests`, credit reservation/ledger tables |
| `GET /generation/requests/:key` | `generationRecovery.js` serializer | `pin_generation_requests`, owner and idempotency-key scoped |
| `GET /review-queue`, `PUT /review-queue/:id`, `DELETE /review-queue/:id` | `reviewQueueValidation.js`, `reviewQueueReconciliation.js` | `pin_review_queue`, `pins`, `pin_schedules`; queue reads reconcile missing, foreign, rejected and already-scheduled pins |

### Pinterest scheduling and publication

| API | Handler/service | Data boundary |
|---|---|---|
| `GET /schedule` | `pinterestSchedule.js` serializers/retryability | `pin_schedules`, `pinterest_publish_attempts`, `pinterest_publications`, `pinterest_accounts`; owner-scoped and paginated |
| `POST /schedule/:id/reconcile-account` | legacy-account classification and schedule helpers | owner-scoped schedule, publication/attempt history and connected accounts |
| `POST /pins/:id/schedule` | schedule snapshot/idempotency helpers | `pins`, `pin_schedules`, connected Pinterest account |
| `POST /schedule/:id/change-board` | `change_failed_pin_schedule_board` RPC | immutable schedule snapshot, account and publication attempt identity |
| `POST /schedule/:id/retry` | `retry_failed_pin_schedule` RPC | retry-safety journal and exact publication identity |
| `POST /schedule/:id/cancel` | inline owner-scoped transition | `pin_schedules`; only allowed statuses may be cancelled |
| internal Pinterest routes | `backend/pinterest.js` registered with `registerRoutes` | OAuth/account, encrypted credentials, refresh leases, publication reservation and completion RPCs |

### Credits, billing and admin

| API | Handler/service | Data boundary |
|---|---|---|
| `GET /credits` | `credits.js` | `credit_transactions`, user balance |
| `POST /credits/dev-topup` | `devTopup.js`, `credits.js` | `users`, credit ledger; disabled in production and requires a strong admin secret outside production |
| `GET /billing/plans`, `GET /billing/credit-packs` | `billing.js`, `creditPacks.js`, `prodamus.js` | public, read-only catalog |
| `POST /billing/create-payment`, `GET /billing/subscriptions` | `billing.js`, `tariff.js` | `subscriptions`, payment creation journal and email outbox |
| `POST /billing/credits`, `GET /billing/credit-purchases` | `creditsBilling.js`, `creditPacks.js` | `credit_purchases`, credit ledger and payment creation journal |
| `GET /billing/health` | `prodamus.js` configuration summary | public operational flags and webhook URL; no signing secret |
| `POST /billing/webhook` | `billing.js` / `creditsBilling.js` | provider signature, idempotent payment/credit fulfillment, webhook exception journal |
| `GET /admin/pinterest/schedules`, `POST /admin/pinterest/reconcile-unknown-publication` | `adminPinterestInventory.js`, `adminPinterestReconciliation.js` | admin-only RPC inventory and positive-evidence reconciliation |
| `POST/GET /admin/storage/*` | `pinImageLifecycle.js` and bounded retention RPCs | managed image lifecycle/retention queues; explicit read-only vs mutating operations |
| `GET /admin/stats`, `GET /admin/mail`, `GET /admin/mail/:uid`, `POST /admin/mail/reply` | `admin.js`, `mail.js` | users/credit ledger and support inbox |
| `GET /admin/financial-operations/unresolved`, `GET /admin/subscriptions`, `GET /admin/billing/email-outbox`, `GET /admin/billing/payment-creation-requests`, `GET /admin/billing/webhook-exceptions`, `GET /admin/billing/pending-orders` | financial operations, payment request and billing services | admin-only financial journals, pending orders and exception summaries |
| `GET /admin/operations/pinterest-scheduler` | `pinterestSchedulerHealth.js` | read-only `pinterest_scheduler_monitor` summary |

All `/admin/*` handlers in this entrypoint use `requireAuth` and `requireAdmin`; mutating/reconciliation routes also use the admin-action limiter. The four provider-refund actions are registered through one shared authenticated admin wrapper.

## 3. Confirmed controls

- Project, board and pin reads/mutations use explicit owner checks or a parent resource already checked through `projects.user_id`; serializers omit internal owner IDs and board-create fingerprints.
- Pin rejection checks schedule/attempt/publication history in application code and is now backed by migration 148's database trigger, closing the check-then-update race.
- Migration 148 also locks the owning approved pin before schedule insertion and orders publication reservation as account → pin → schedule. The account-deletion `account_status` fence from migration 128 is preserved in the replacement scheduled-publication function.
- Board creation has an idempotent request key/fingerprint path. Payment creation and image/generation paths have their own idempotency/journal contracts.
- The development credit top-up route is intentionally not session-authenticated, but fails closed in production and unless explicitly enabled with a 32+ character `ADMIN_SECRET`; it is rate-limited.
- Public billing routes expose catalogs and non-secret health flags only. Payment mutations require authentication and a creation limiter.
- Admin SQL functions re-check operator identity rather than trusting a body-supplied admin ID.

## 4. Launch risks / decisions still open

1. **AI spend policy:** `POST /projects/:id/analyze` and `POST /keywords` use the shared AI rate limiter but do not call `requireTariff` or reserve credits. This may be intentional free functionality, but it must be an explicit product/pricing decision with a daily/monthly budget before public promotion. The limiter is process-local, so it is not a cross-instance spend ceiling.
2. **Retry idempotency:** `POST /projects/:id/boards/generate` inserts a new batch without a request idempotency key. A client retry after a lost response can create duplicate boards and repeat provider work. Add a durable generation-request key before relying on automatic client retries.
3. **Pagination:** resolved in main with `backend/fetchAllPages.js`. Project and board list queries now use stable 500-row pages, a 10,000-row cap with explicit 413 overflow, and global newest-first ordering across board batches. Client-facing cursor pagination remains a future improvement for very large accounts. Regression test: `backend/test/fetch-all-pages.test.js`.
4. **Rate-limit deployment:** AI, auth and payment limiters use in-process memory. They are adequate only while one backend process is the intended deployment shape; multiple instances require a shared store.
5. **Email delivery timing:** subscription email outbox rows are durable, but the dispatcher is an in-process timer. A sleeping Render instance can delay retries until wake/startup; it should eventually become a separate worker/cron.
6. **Account deletion:** intentionally unavailable until `ACCOUNT_DELETION_WORKER_ENABLED=true`; validate full export/deletion/Storage/Pinterest recovery in staging before enabling.
7. **Environment:** production must have a strong 32+ byte `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the provider/storage/mail variables required by the enabled product paths. Environment values were not accessible in this repository-only audit.
8. **Runtime CI:** latest GitHub Actions jobs fail before steps are created; no Node or PostgreSQL integration tests have executed in this session. No tests are marked passed.

## 5. Verification and next work

- Static inventory: 73 route declarations enumerated; admin/auth/public middleware and selected handler/service/data boundaries reviewed.
- Static unit/SQL test files exist for auth, projects, boards, pins, image lifecycle, generation, Pinterest OAuth/scheduler, billing, admin and account deletion.
- The canonical migration-numbering test now spans migrations 010–148; the duplicate 141/146 publication migration naming was corrected so the only new migration is 148.
- The atomic integration workflow applies the migration tail 146, 147, 148 and invokes the pin-publication status regression tests plus the account-deletion publication-fence SQL contract.
- GitHub Actions still failed before job steps; no test execution result is available. Vercel build-rate-limit remains an external deployment blocker.
- Next: finish line-by-line review of the remaining `index.js` handlers and all remaining backend modules; resolve AI spend policy, generated-board idempotency and pagination before broad public acquisition. Then audit frontend and execute tests on a working runner.


## Follow-up hardening after the route-map baseline

- `backend/tariffSelfSelect.js` now fails closed: tariff self-selection is enabled only when `NODE_ENV` is explicitly `development` or `test` and `ALLOW_TARIFF_SELF_SELECT=1`. An unset/unknown/staging `NODE_ENV` can no longer accidentally enable paid-plan self-selection. Regression test: `backend/test/tariff-self-select.test.js`.
- Admin mailbox inputs are now bounded and validated in `backend/mailInputValidation.js`: inbox page size 1–100, numeric IMAP UID only, support recipient email validation, subject <=200 characters without CR/LF, body <=20,000 characters. `mail.js` uses the validated values; `index.js` no longer coerces arbitrary JSON objects into strings before service validation. Regression test: `backend/test/mail-input-validation.test.js`.
- These tests are included in `.github/workflows/atomic-payment-integration.yml`.

**CI evidence after the follow-up:** runs `43897777843` (postgres-atomicity) and `43897777966` (backend/frontend) all failed with `steps: null`; no runner steps were created and no tests ran. This is not a test assertion failure. No production environment or mail credentials were read or changed.


## Follow-up hardening after the route-map baseline (continued)

- `backend/tariffSelfSelect.js` fails closed unless `NODE_ENV` is explicitly `development` or `test` and `ALLOW_TARIFF_SELF_SELECT=1`; missing/unknown/staging environment names cannot enable paid-plan self-selection. Test: `backend/test/tariff-self-select.test.js`.
- Admin mailbox reads/replies are bounded: inbox limit 1–100, numeric IMAP UID only, recipient validated as email, subject <=200 chars without CR/LF, body <=20,000 chars. The route preserves raw JSON types so the service can reject objects rather than coercing them into strings. Tests: `backend/test/mail-input-validation.test.js`.
- Project and board list queries now use `fetchAllPages` with stable ordering, 500-row pages and a 10,000-row hard cap. `GET /boards` fetches project IDs and board rows in bounded batches, restores global newest-first ordering and calculates pin counts in small concurrent batches. Test: `backend/test/fetch-all-pages.test.js`. This removes silent PostgREST row-cap truncation; client-facing cursor pagination remains a future improvement for very large accounts.
- Added startup fail-fast and regression tests described in package 02; the API will not start with a missing/weak JWT signing secret.

**Runtime verification remains blocked:** latest runs `43897851250` and `43897851139` were rerun; atomic integration again failed before steps, and persisted boards was queued at the last observation. Earlier runs `43897777843`/`43897777966` had `steps: null`. No tests are claimed as passed.


## Follow-up: bound the calendar list (2026-11-16)

- A further review of the live `GET /schedule` handler found that it paged through all rows with an unbounded offset loop. Unlike project/board lists, this path had no explicit maximum and could grow memory/request time without limit for a large account.
- Replaced the loop with the shared `fetchAllPages` helper. It preserves stable ordering and owner filtering, reads pages of 500, accepts exactly 10,000 rows, and returns HTTP 413 when an additional row exists rather than silently truncating or continuing indefinitely.
- Added `backend/test/schedule-route-pagination-contract.test.js` to guard the route's use of the bounded pager. The existing `backend/test/fetch-all-pages.test.js` covers exact-cap and overflow behavior.
- Commits: `b52a537a` (route fix), `1aafeaaa` (regression contract).
- Static source verification: the route now calls `fetchAllPages` and supplies `.range(from, to)`; test source and route were re-fetched from main. Runtime Node tests were NOT executed; Vercel check remains `build-rate-limit`. No production database, scheduler, or deployment was touched.


- `backend/billing.js:listAllSubscriptions` now clamps admin subscription inventory page size to 1–500; regression test `backend/test/admin-subscription-limit.test.js` and CI step added.
