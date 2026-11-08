# AUD-148 — Administrative reconciliation and migration 009 preflight

**Date:** 2026-11-08  
**Branch:** `feat/persisted-boards-api`  
**Scope:** Source-level review of migrations 073–082, administrative reconciliation API boundaries, related PostgreSQL fixtures, and a read-only data-loss preflight for migration 009.

## 1. Administrative provider-refund actions

Reviewed migrations 073, 077 and 078, backend handlers `adminProviderRefundActions.js`, `admin.js`, relevant routes in `index.js`, and the disposable PostgreSQL fixture.

Source-level protections confirmed:
- Reconciliation only fills a previously unknown refund fact for a matching failed provider task; it does not permit changing an already-known refund fact.
- Finalization requires every generation task to be failed and reconciled, or the regeneration provider outcome to be failed and reconciled, plus an active credit reservation.
- The reservation release remains driven by the existing request-status lifecycle in the same database transaction.
- Administrative wrapper RPCs recheck `is_admin` after locking operator and target user rows in deterministic UUID order.
- The operator journal is append-only, blocks UPDATE/DELETE/TRUNCATE, has action UUID replay checks and logical uniqueness, and is inaccessible by direct grants to API roles/service_role.
- The backend derives operator identity from verified `req.userId`; the routes are protected by `requireAuth`, `requireAdmin`, and the administrative action rate limiter.
- The integration fixture covers journal-insert rollback, exact replay, altered replay rejection, non-admin rejection, operator demotion, self-targeting, reservation release, and grants.

No confirmed privilege bypass or credit-release defect was found in the reviewed paths. This is not a proof of every role grant or every possible concurrent interleaving; the SQL fixture must run on disposable PostgreSQL before these changes are considered verified.

## 2. Pinterest positive-only reconciliation

Reviewed migration 082, backend `adminPinterestReconciliation.js`, route registration, and `pinterest-operator-reconciliation.integration.sql`.

Confirmed source-level guards:
- Only a stale `unknown` schedule with no active claim can be reconciled.
- The related attempt must also be stale, be `unknown` or `processing`, and have `retry_safe=false`.
- The account → schedule → attempt lock order is retained.
- Operator identity is taken from the authenticated request and independently rechecked in SQL under a user-row lock.
- The exact reserved board and any existing remote pin/board IDs must match.
- Only a positive externally confirmed publication can be recorded; this RPC does not prove non-publication and never enables retry.
- The journal receipt is written in the same transaction as the publication ledger and local state updates.

The integration fixture includes positive completion, exact replay, changed-payload replay rejection, append-only enforcement, duplicate-action rejection, fresh/terminal-state rejection, board mismatch and conflicting publication identity. No SQL execution has been confirmed.

## 3. Migration 009 data-loss preflight

Added `db/preflight/009_hardening_data_loss_report.sql`.

The file contains SELECT-only reports for:
- malformed `user_id` rows across the six tables whose text IDs migration 009 converts;
- orphaned user references;
- orphaned `pinterest_publications.pin_id` rows;
- non-standard board/pin statuses that will be incorporated into CHECK constraints;
- fractional `credit_transactions.amount` values and values outside PostgreSQL integer range.

Detailed candidate rows are returned as JSON so they can be exported before any destructive cleanup. The file does not mutate or archive data. It has not been executed against any database; validate its output on a restored copy before using it operationally. A verified backup and exported candidate rows remain prerequisites before migration 009.

## 4. CI status and verification limits

For commit `726663bde5b886a51ee0d5937802333b78ce0a9d`, GitHub Actions reported failure for:
- Prodamus webhook tests;
- Atomic payment fulfillment integration;
- Persisted boards integration checks (frontend and backend jobs).

GitHub job metadata returned `steps=null`. Attempts to download all four job logs returned Azure `BlobNotFound`. Therefore the failure stage and cause are unknown; this does not establish that the tests ran or that the code caused the failure. Vercel status was failure for that commit.

No local Node tests, PostgreSQL integration tests, Supabase SQL, production migrations, production data reads/writes, live Pinterest requests, or deployment changes were performed.

## Next verification steps

1. Run the backend Node test suite in a controlled local environment.
2. Run the PostgreSQL integration workflow against disposable PostgreSQL and capture job logs.
3. Run the migration 009 preflight against a restored production backup; export and review every candidate row.
4. Continue auditing all later migrations for RLS, direct grants, SECURITY DEFINER ownership/search_path and execute privileges.

## 5. Storage admin endpoint rate limiting

A follow-up route review found that both mutating Storage lifecycle endpoints were missing the shared `adminActionLimiter`, unlike the provider-refund and Pinterest reconciliation actions:

- `POST /admin/storage/reconcile-stale-uploads`
- `POST /admin/storage/quarantine-stale-uploads`

Both routes already required authenticated administrator access, so this was not an authorization bypass. However, they perform database/storage lifecycle work and were inconsistent with the API's administrative action throttling policy. Added `adminActionLimiter` before `requireAuth` and `requireAdmin`, ensuring unauthenticated traffic is also throttled.

Added `backend/test/admin-storage-rate-limit.test.js` to guard both route middleware chains against regression. This is a source-registration assertion, not an HTTP integration test. The test has been committed but has not been executed; CI and local test results are not yet available.

## 6. Core-table privileges and SECURITY DEFINER search paths

Reviewed `001_baseline.sql`, migrations 039–043, 076 and 079.

Source-level findings:
- The baseline enables RLS on all ten core tables. The custom application JWT is not a Supabase Auth JWT, so `auth.uid()` evaluates to NULL for normal application requests; the backend uses the service-role client.
- The baseline explicitly revokes client grants on the first five core tables. It does not explicitly revoke grants on the remaining five in that file, but their RLS policies are SELECT-only for user-owned rows (and `auth_tokens` has no client policy). Migration 076 later applies a uniform explicit revoke from PUBLIC/anon/authenticated to all ten tables and grants the required CRUD privileges to service_role.
- Migration 039 independently closes direct client grants on Pinterest credential/publication tables and grants backend access to service_role.
- Migrations 040, 041 and 043 restore catalog-first `pg_catalog, public` search paths on the reviewed SECURITY DEFINER Pinterest, credit-balance and schedule-claim functions. Migration 043 is important because it documents that migration 034 replaced the schedule claim function after migration 040 and reset its path.
- Migration 076 verifies that each expected core table exists before applying RLS and grants; it fails closed rather than silently skipping a missing table.
- Migration 079 exposes a normalized provider-cost view and revokes it from PUBLIC/anon/authenticated, granting SELECT only to service_role. Unknown provider costs remain NULL rather than being represented as zero.

No confirmed client privilege escalation was found in these reviewed migrations. The baseline's incomplete explicit revoke list is a hardening inconsistency, but the RLS policies shown in the same baseline prevent the custom-JWT client from reading protected rows or writing through those five tables; migration 076 supplies the consistent explicit privilege boundary later in the migration chain. These are source-level findings only; grants, view ownership and effective privileges have not been queried on a live or disposable PostgreSQL instance.

## AUD-149 follow-up — complete SECURITY DEFINER catalog regression coverage (2026-11-08)

- A review of the existing `backend/test/security-definer-search-paths.integration.sql` found that its explicit signature list covered only a subset of the RPCs present in the current migration chain; later SECURITY DEFINER functions from migrations 046–082 were not automatically included.
- Extended the same integration test with a catalog-driven pass over every `SECURITY DEFINER` function in schema `public`. It now requires a catalog-first `search_path` (`pg_catalog, public` or `pg_catalog`) and rejects EXECUTE access for `anon` and `authenticated`. The existing explicit list continues to assert that intended application RPCs are executable by `service_role`.
- This is regression-test hardening, not a claim that a production privilege defect was found. Source review found the older `public`-only search paths on superseded definitions later corrected by migrations 040, 041 and 043; the current migration definitions inspected in this pass use catalog-first paths.
- The test is wired into `.github/workflows/atomic-payment-integration.yml` after migrations through 082.
- Commit: `582c31fc82f73bc9278477eef303b5b547c9d7b6`.
- CI on this HEAD: all three PR workflows (persisted boards, Prodamus webhook, atomic payment/PostgreSQL) concluded `failure`; GitHub returned jobs with `steps=null` and `logs_url=null`. Therefore this added SQL assertion has **not** been executed/validated yet. Vercel status is `pending`.
- No production database, live payments, Pinterest publishing, deployment, or merge was performed.

## AUD-150 — admin support-mail reply rate limiting (2026-11-08)

- Reviewed mutating admin route registrations after the storage limiter fix. `POST /admin/mail/reply` required `requireAuth` and `requireAdmin`, but did not use the shared `adminActionLimiter`.
- Added `adminActionLimiter` before authentication on the support-mail reply route, so the same 20-actions-per-minute IP-based guard also applies to outbound admin replies.
- Extended `backend/test/admin-storage-rate-limit.test.js` with a registration assertion for the mail-reply middleware chain.
- This is defense-in-depth for a privileged outbound-email action; it does not replace MFA/session controls or provider-side mail quotas.
- Commits: `822269d` (route), `24d443c` (regression test).
- Test status: not run locally in this environment; CI must confirm. No email was sent and no production environment was changed.


## AUD-151 — payment-creation throttling (2026-11-08)

- Reviewed the authenticated subscription and credit-pack purchase creation routes. Both created pending purchase records and initiated payment-provider work without a dedicated request limiter.
- Added a shared `paymentCreationLimiter` to `POST /billing/create-payment` and `POST /billing/credits`: 10 requests per 15-minute window, using the standard client-IP key. It runs after `requireAuth`. The limiter is in-process and is not a distributed/global quota across multiple backend instances.
- Added source-registration regression assertions for both middleware chains. These assertions do not exercise HTTP behavior or the rate-limit store.
- This is abuse-resistance hardening, not an idempotency guarantee: repeated requests within the allowed quota may still create multiple pending orders. Durable per-user idempotency/cooldown and provider reconciliation remain separate follow-up work.
- Test status: not run locally in this environment. No live payment requests, production database changes, deployment, or merge were performed.


## AUD-152 — Pinterest account disconnect throttling (2026-11-08)

- Reviewed the Pinterest OAuth, board-read, manual-publication, scheduling, retry, reconciliation and worker route registrations alongside their dedicated limiter module. The main external API operations already use separate per-user or IP budgets; the authenticated internal worker is secret-protected and IP-limited.
- Found `POST /integrations/pinterest/disconnect` lacked its own limiter despite performing account lookup and a database RPC that changes connection state.
- Added a separate per-user `pinterestAccountLimiter` of 5 requests per minute and applied it after `requireAuth`. It does not share the OAuth, board-read, schedule or publish buckets.
- Added regression assertions for the disconnect middleware chain and the account-action budget.
- The rate limiter uses the existing process-local MemoryStore; it is not a global quota across multiple backend instances. The action is already ownership-scoped and uses the database RPC; this change only bounds repeated calls.
- Test status: not run locally in this environment. No Pinterest OAuth, external API calls, live publishing, production changes, deployment or merge were performed.


## AUD-153 — verification-email resend throttling (2026-11-08)

- Reviewed public authentication and email-verification routes. Registration/login and password reset already use the general 10-per-15-minute auth limiter; token verification and resend shared the broader 30-per-15-minute verification limiter.
- `POST /resend-verification` can trigger outbound email delivery, so sharing the 30-request token-verification budget allowed a comparatively large email burst from one client IP.
- Added a dedicated IP-based limiter of 5 requests per 15 minutes for resend only. The token-application endpoint retains its separate 30-per-15-minute budget. The generic response behavior remains unchanged to avoid account enumeration.
- Added a source-registration regression assertion for the dedicated middleware.
- Limiting is process-local with the existing express-rate-limit MemoryStore and does not enforce a global quota across multiple backend instances. Provider-level quotas and per-account delivery cooldowns remain useful additional controls.
- Test status: not run locally in this environment. No email was sent, production was not changed, and no deployment or merge was performed.


## AUD-154 — authenticated AI-generation throttling (2026-11-08)

- Reviewed all backend AI provider entry points and route registrations: project analysis, board generation, pin generation, and pin regeneration. Each route invokes GPTunnel-backed work.
- The shared 12-requests-per-minute AI limiter previously ran before authentication and therefore keyed requests by client IP. Rotating IPs could avoid the per-client ceiling, while unrelated users behind one NAT shared a bucket.
- Moved the limiter after `requireAuth` on all four routes and keyed it by the verified `req.userId`. The same account budget now spans all four endpoints, preventing route switching from multiplying the per-account allowance.
- Added a source-registration regression test covering the limiter key and all four middleware chains.
- The limiter still uses express-rate-limit's process-local MemoryStore. It is **not** a global account quota across multiple backend instances; a shared Redis-compatible store or database-backed quota is required for that guarantee. Account rotation remains outside the protection of a per-account limiter.
- This change does not add idempotency to board generation or change its billing semantics. Existing pin generation and regeneration request journals/reservations remain the mechanisms for duplicate-request recovery and credit safety.
- Test status: regression test added but not run locally. No GPTunnel requests, production database changes, deployment, or merge were performed.
- Commits: `6347e2b` (limiter and route order), `a55f398` (regression test).


## AUD-155 — text-generation replay, accounting and recovery boundaries (2026-11-08)

- Reviewed every current application call path to GPTunnel text/image operations: `backend/analyze.js`, `backend/boards.js`, `backend/pins.js`, `backend/gptunnel.js`, and the corresponding Express routes.
- Image generation and pin regeneration have durable request/task journals, credit reservations, provider task IDs/idempotency keys, claim fencing, and transactional settlement. The source-level review did not identify a second unauthenticated route to those provider calls.
- Project analysis (`POST /projects/:id/analyze`) and board generation (`POST /projects/:id/boards/generate`) do not have durable idempotency records. A repeated client request can call GPTunnel again; repeated board generation can insert another set of board rows. The per-account rate limiter bounds bursts but does not deduplicate requests or serialize concurrent requests.
- Both analysis and board-generation modules call `generateText()`, which intentionally does not require or persist provider usage metadata. Unlike pin generation's text-usage callback, these paths do not record the GPTunnel request ID, model, usage, or RUB cost in the reviewed handlers. They also do not use the pin-generation credit reservation/settlement RPCs. Whether these are intentionally included in a subscription entitlement or should consume a separate allowance is a product/billing decision; currently there is no per-operation provider-cost ledger visible in these paths.
- Pin idea generation calls `generateTextWithUsage(..., { requireUsage: false })` but its route records returned usage through `record_pin_generation_text_usage`. If the provider accepted the text request but the response/usage journal is lost before the task plan is persisted, the parent request is marked uncertain and cannot be resumed from a saved plan. This is fail-closed against silently paying twice, but recovery requires an explicit reconciliation path; the text request itself does not supply a provider idempotency key.
- GPTunnel image task creation accepts a provider idempotency key and the application reuses the persisted per-task key during recovery. The provider-side retention/guarantee is assumed by the code and must be verified against the current GPTunnel contract; it has not been independently established in this audit.
- No migration or route behavior was changed for these findings because durable idempotency for analysis and board generation needs a database-backed state machine, including explicit policy for ambiguous provider outcomes and board insertion atomicity. A process-local mutex would not protect multiple backend instances and would give false confidence.
- Recommended next implementation: add durable per-user operation records and claim fencing for board generation; persist generated board results atomically with the completed request; make analysis idempotent and persist usage/cost metadata. Decide explicitly whether analysis/board generation are included in the plan or consume credits before introducing financial settlement.
- Verification: source review only. Node/PostgreSQL tests have not been run locally. No GPTunnel calls, production DB operations, deployments, or merges were performed.
