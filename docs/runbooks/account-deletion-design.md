# Account deletion: implementation design and safety constraints

Status: design only. No endpoint or schema change is implemented by this document.

## Why hard deletion is unsafe

Migration `009_hardening.sql` adds `ON DELETE CASCADE` foreign keys from `users` to:
- `auth_tokens`
- `credit_transactions`
- `subscriptions`
- `credit_purchases`
- `pinterest_accounts`
- `pinterest_publications`

It also makes `projects.user_id` cascade from users. Projects own boards and pins; scheduled rows reference pins with `ON DELETE CASCADE`. Therefore deleting a user row would remove payment and credit ledger records as well as product data.

Do not implement account deletion as `DELETE FROM users` until the financial retention and referential-integrity design has been explicitly resolved.

## Late Prodamus webhook hazard

The current signed webhook handlers look up a payment and call:
- `activate_paid_subscription(subscription_id, paid_at)`
- `credit_paid_purchase(purchase_id, paid_at, description)`

The current RPC implementations lock the payment row and then the user row. They update the user's tariff or credit balance even when the account is no longer intended to be usable. There is currently no account-deletion marker checked by either RPC.

A deletion workflow must therefore coordinate with these functions. Simply anonymizing the user's email/password is insufficient: a delayed successful webhook could still grant a subscription or credits to the retained user row.

## Recommended account lifecycle

Use an explicit lifecycle marker on the user row (for example, `deletion_requested_at`, `deleted_at`, and a state), rather than deleting the row immediately.

Suggested states:
1. `active`: normal access.
2. `deletion_pending`: block new authenticated activity and new payment creation; revoke all sessions; disconnect external integrations and cancel future schedules.
3. `anonymized`: remove or irreversibly pseudonymize personal data and product content after cleanup succeeds, while retaining the minimum financial records required by applicable law and payment-provider reconciliation.

The exact retention period, fields retained, and whether a refund or cancellation is required for pending payments must be confirmed against the operator's legal/accounting obligations and Prodamus terms. Do not invent a universal retention period.

## Payment handling decision required before implementation

For a successful payment webhook received after deletion was requested:
- Always validate signature, order ID, and amount as today.
- Preserve the provider transaction and the fact that money was received.
- Do not silently discard the event or return success without durable reconciliation.
- Do not automatically credit an inaccessible/deleted account or activate its entitlement.
- Record a distinct reconciliation outcome (for example, paid-after-deletion / refund-review) and surface it to an administrator for refund or other legally appropriate handling.

This likely requires separate payment settlement state and entitlement state. Reusing `status='success'` for both “money received” and “service entitlement granted” is ambiguous. Design a backward-compatible schema before changing existing status semantics.

## Concurrency and lock ordering

Current payment RPCs lock payment rows before user rows. A deletion transaction that locks the user row first and then payment rows can deadlock with a concurrent webhook. Before implementing, standardize a lock order across deletion, subscription activation, and credit fulfillment, then test concurrent deletion/webhook races in PostgreSQL.

A robust workflow should be idempotent and resumable: a retry must not double-refund, double-credit, or leave an account half-deleted without a visible state.

## Pinterest and generated media

- Delete/revoke stored Pinterest OAuth credentials and stop future schedule processing.
- Cancel queued schedules and prevent the scheduler from claiming rows belonging to a deletion-pending account.
- Preserve publication-attempt evidence long enough to reconcile ambiguous remote Pinterest outcomes; do not automatically republish.
- Remove owned projects, boards, pins, and generated image objects only after ownership of each Storage object is proven.
- Current `pins.image_url` stores URLs; no user-scoped Storage object path convention has been verified. Do not delete objects by guessing URL-to-key mappings.
- `pinterest_publish_attempts` has no user FK and must be explicitly cleaned or retained according to a documented retention policy.

## Implementation sequence

1. Add lifecycle columns and a server-side deletion-request endpoint; require recent authentication or a separate confirmation step.
2. Make authentication reject non-active accounts, and revoke all existing JWTs atomically.
3. Block new payment creation, AI generation, and scheduler work once deletion is pending.
4. Introduce explicit payment-settlement/reconciliation fields and update both webhook RPCs with concurrency-safe semantics.
5. Build an idempotent cleanup job for Pinterest credentials, schedules, attempts, publications, projects, pins, and Storage objects.
6. Preserve the minimum required financial evidence without retaining unnecessary contact/profile data.
7. Add PostgreSQL integration tests for: duplicate deletion request, webhook racing deletion, webhook arriving after deletion, repeated webhook, partial cleanup retry, and no cross-user Storage deletion.
8. Only then expose the user-facing deletion confirmation and publish the applicable privacy-policy wording.

## Current status

- No account-deletion route exists in the inspected `backend/index.js`.
- No deletion marker exists in the inspected user schema.
- The payment RPCs do not currently check an account lifecycle state.
- No deletion migration has been applied to Supabase.
- This document is a design record, not a claim that deletion functionality is available.


## Additional payment-webhook findings (verified against current code)

### Existing entitlement/payment coupling
- Credit purchases already have `balance_credited_at`, which distinguishes successful order status from actual credit fulfillment. This is a useful partial precedent, but there is no separate settlement/reconciliation state for payments received after deletion.
- Subscription rows use `status='success'` together with `period_start/period_end`; the current activation RPC updates the payment status and user entitlement in the same transaction. A later lifecycle design should preserve the existing public status contract while adding explicit settlement and entitlement/reconciliation fields.
- Both `credit_paid_purchase()` and `activate_paid_subscription()` currently lock the payment row first and the user row second. A deletion flow that locks the user first and then payment rows would introduce a lock-order inversion and possible deadlocks. Standardize lock order before adding the deletion transaction; test with concurrent PostgreSQL sessions.
- The webhook handlers write non-success statuses directly through Supabase table updates, outside the atomic RPC. Any future deletion/settlement state machine must account for these writes or move all state transitions behind transactional database functions.

### Amount-mismatch path
- Both payment handlers compare the signed webhook `sum` against the stored expected amount.
- On mismatch, each currently marks the order `denied` (unless it is already successful) and returns HTTP 200 with `ignored: amount mismatch`.
- A signed webhook with an amount mismatch can still represent money received. The current `denied` label is therefore not a sufficient reconciliation record and should not be interpreted as proof that no money moved.
- Future design: persist the provider-reported amount and a distinct reconciliation state (for example, `amount_mismatch_review`); do not grant entitlement; surface the event to an administrator; acknowledge the webhook only after durable recording. Do not automatically refund or silently discard it.

### Password-reset cooldown overload fix (separate security correction)
- Migration 024 introduced a four-argument cooldown-aware RPC, but PostgreSQL retained the three-argument overload from migration 020. Exact three-argument calls selected the old function and could bypass the cooldown.
- The branch now includes migration 025 to drop the obsolete overload, and the integration test explicitly calls the four-argument RPC and asserts that only the four-argument signature remains.
- This migration is part of the GitHub Actions atomic integration workflow. It has not been applied to the production Supabase database.


## Reconciliation detail: current credit and subscription models

Verified in migrations 010/011 and current webhook handlers:

- Credit purchases already have `balance_credited_at`. The credit fulfillment RPC locks the purchase row, checks this marker, and only credits once. Keep this idempotency marker; do not replace it with a generic payment status.
- Subscription activation currently uses `status='success'` plus a non-null `period_end` as its already-activated condition. This couples settlement and entitlement more tightly than the credit-purchase model.
- Both handlers validate the provider signature, order ID and expected amount. When the amount differs, the current handler writes `denied` (if not already fulfilled) and returns HTTP 200. This is not enough to represent a possibly received but mismatched payment.
- Non-success provider statuses are written directly by the HTTP handler through Supabase updates, while successful fulfillment is handled by SQL RPCs. Future reconciliation states must centralize transitions or use conditional updates/transactions so a late failure cannot overwrite a confirmed success.
- Credit purchase status updates already guard with `balance_credited_at IS NULL` and `status != 'success'`; subscription updates guard with `status != 'success'`. Preserve these protections and add explicit reconciliation fields rather than changing the meaning of `success` in place.

### Safe incremental migration proposal (not implemented)

1. Add nullable provider-reported amount/currency and a reconciliation outcome to payment rows, with values that distinguish matched, amount-mismatch-review, paid-after-deletion-review, and provider-declined. Exact enum/check constraints should follow an inventory of all existing statuses and provider payloads.
2. Keep the provider settlement outcome separate from entitlement fulfillment. For credits, `balance_credited_at` remains the entitlement marker. For subscriptions, introduce an explicit entitlement activation marker or event record before changing the RPC.
3. On amount mismatch, persist the signed provider event details needed for reconciliation and return HTTP 200 only after the durable write succeeds. If persistence fails, return a retryable non-2xx response.
4. Keep the order idempotent by provider order ID and event identity; duplicate mismatch webhooks must not create duplicate review cases.
5. Add tests for mismatch then success, success then mismatch, duplicate mismatch, late success after account deletion request, and a database write failure before acknowledgement.

No schema or webhook behavior was changed as part of this design note.


## Additional payment audit: schema constraints and orphan webhooks

A second pass over migrations 006, 007, 009 and both webhook handlers confirms:

- `subscriptions.status` is constrained to `pending | success | canceled | denied | expired`; `credit_purchases.status` is constrained to `pending | success | canceled | denied`. A new value such as `amount_mismatch_review` cannot safely be placed into either status column without changing the CHECK constraints and every consumer of those values. Prefer a separate reconciliation column/table.
- Migration 009 adds `ON DELETE CASCADE` from `users` to `subscriptions` and `credit_purchases` (as well as other user data). A physical user deletion therefore erases payment-order rows unless financial records are copied to a separately retained ledger first. This confirms that account deletion must not call a simple user-row DELETE.
- Both webhook handlers currently acknowledge an unknown signed `order_id` with HTTP 200 and `ignored: unknown order_id`. This prevents provider retries but leaves no durable local record of the event. It may be appropriate for unrelated/forged identifiers after signature validation, but a genuinely paid order whose local row is missing needs an orphan-payment review record before acknowledgement.
- The Prodamus webhook sample does not provide a reliable currency field. Subscription orders can be RUB or USD, while credit packs are RUB-only. Reconciliation must compare the signed amount against the currency already stored on the local order; it must not infer currency from the webhook or add a fabricated webhook currency requirement.
- The current mismatch branch stores neither the provider-reported amount nor the event payload, and uses the existing `denied` status. The exact amount and event evidence are therefore unavailable from the order row after handling.

### Revised safe implementation sequence (still design-only)

1. Introduce a separate append-only webhook inbox/reconciliation table keyed by a deterministic event fingerprint (or a stable provider event ID if Prodamus supplies one). Store order ID, normalized status, reported amount, received timestamp, and a carefully redacted/minimized signed payload. Do not store secrets or unnecessary customer data.
2. For known orders, link the inbox row to the local subscription/credit purchase. For unknown order IDs, retain a minimal orphan event and route it for manual review rather than silently discarding it.
3. Add explicit reconciliation state separately from the existing constrained order `status`. Keep the current status contract stable for existing UI, reports and RPCs.
4. Preserve the order's stored currency and catalog amount as authoritative. Since webhook currency is absent, record it as unavailable rather than guessing.
5. Acknowledge HTTP 200 only after the event/inbox and any state transition are durably committed. On database failure, return non-2xx so the provider can retry.
6. Before enabling this in production, inventory admin reporting, refund handling, deletion retention, RLS/service-role access, and retention periods for the new inbox.

No database schema, webhook handler, production setting, or live payment behavior was changed by this audit.


## Authentication/session audit (Nov 2026)

A review of `backend/auth.js`, `backend/index.js`, and the frontend auth context found and corrected two concrete issues on this branch:

- The protected-route middleware had an incorrectly escaped Bearer-header regex, so a normal `Authorization: Bearer <jwt>` header was not reliably stripped to the JWT. Parsing is now centralized in `backend/bearerToken.js` and covered by `backend/test/bearer-token.test.js`.
- Registration previously retried a failed user insert without profile columns for any error. It now retries only when Postgres/PostgREST explicitly reports one of the optional profile columns missing, returns 409 for unique-email races, and fails closed with a temporary service error on other database failures. The initial duplicate-email lookup now also checks and handles database errors.
- The frontend `refreshUser()` previously deleted the locally stored JWT for every error, including network failures and server 5xx. It now clears the token only for a 401; transient errors retain the session so the user can retry.

Additional behavior/limitations to address before production hardening:

- Frontend logout currently removes the JWT from localStorage only. It does not revoke the JWT server-side; a copied/stolen token remains valid until its seven-day expiry unless password reset increments `users.token_version`. A future per-device logout design should add a session/JTI allowlist or equivalent revocation mechanism. Do not increment the global token version for ordinary logout unless the product explicitly wants “log out all devices”.
- Protected routes query `users.token_version` on every request and fail closed with HTTP 503 on database errors. Migration 023 must therefore be applied before deploying the backend revision that depends on this column. This is a deployment prerequisite, not a migration to apply automatically from CI.
- Email verification issuance and password-reset issuance both serialize on the user row and enforce cooldowns atomically in SQL. The application-level email-verification pre-check is only a UX optimization; migration 022's RPC is the actual concurrency guard.
- The password-reset four-argument RPC cooldown and migration 025 removal of the legacy three-argument overload must both be present before relying on the five-minute cooldown. Keep the explicit four-argument call in the backend.

The Bearer parser unit tests were run locally in an isolated Node 22 harness: 3 tests passed. This is not a full backend suite or CI result. No production deployment or database migration was performed.


## Password reset and email-verification flow audit (Nov 5, 2026)

Further frontend/backend review found and corrected these issues:

- `VerifyEmail.tsx` captured the verification token from the query string, then removed the query string with React Router navigation. The component's next render could therefore see an empty token when the user clicked Confirm. The token is now retained in a ref before URL cleanup and used for the explicit POST.
- `ResetPassword.tsx` previously left the password-reset credential in the address bar/history. It now captures the token in a ref, removes the query string using replace navigation, and continues rendering/submitting from the in-memory token.
- Login previously ignored Supabase lookup errors and could report “wrong email or password” during a database outage. It now returns 503 for lookup failures while preserving the generic 401 for unknown email/wrong password.
- Password-reset request and email-verification resend lookups now explicitly handle database failures with 503 instead of silently presenting a generic success response when no lookup could be completed. The response remains generic for valid database lookups, so account existence is not disclosed.

Existing atomic database behavior reviewed:
- Password-reset issuance and consumption serialize on the user row before locking token rows. Concurrent consumption rechecks that the token is unused and unexpired after acquiring locks.
- Password reset increments `users.token_version` in the same transaction as password update and token consumption. Protected routes compare this value on every request and reject older JWTs.
- Email verification consumption locks user then token and updates `email_verified` and `used_at` atomically. Repeating a consumed token is idempotent only if that same account is already verified.
- Verification and reset links store only SHA-256 token hashes in `auth_tokens`; raw tokens are delivered in email URLs and are not stored in the database.
- Verification page requires an explicit button click before consuming the token, avoiding email-scanner auto-consumption.

Deployment caveat: these flows depend on migrations 021–025 (and earlier auth/token migrations) being applied in order. The repository state alone does not prove that the Supabase production database has them. Do not deploy the dependent backend before verifying the live migration state. No migration was run and no production configuration was changed.

CI is still not a valid verification signal: recent workflow jobs terminate before runner assignment (runner_id 0, no steps). Frontend build, full backend tests, and Postgres integration tests remain unverified in CI.


## Account lifecycle follow-up audit (Nov 5, 2026)

The current implementation confirms the design-only deletion status and adds these concrete integration constraints:

### Authentication and verification

- `POST /resend-verification` manually verifies the JWT and extracts only `userId`; it does not call `requireAuth` or compare the JWT `tokenVersion` against `users.token_version`. A token invalidated by password reset can therefore still reach the authenticated resend branch until JWT expiry. Fix by extracting one shared active-session validator and using it in both protected middleware and this route. Preserve anonymous email-based resend and its non-enumerating response.
- `requireAuth` queries `users.token_version` for every protected request and fails closed with 503 on lookup error. Migration 023 is therefore a hard deployment prerequisite for this backend revision; the baseline schema does not include this field. Do not deploy backend before verifying the migration in the target database.
- Email verification token issuance and consumption use SQL RPCs for atomic issuance/cooldown and one-time consumption. Application-level resend cooldown reads are only prechecks; the issuance RPC is the concurrency guard. Keep this distinction in future refactors.
- The account lookup used by login currently selects the whole user row and has no explicit account lifecycle-state check because no lifecycle marker exists yet. Once deletion states are introduced, login and JWT validation must reject every non-active state.

### Billing and deletion race

- Both `createPayment()` implementations (subscriptions and credit packs) fetch the user and then create a pending payment row, but neither checks a deletion lifecycle state. A deletion design must block both endpoints once deletion is pending.
- Both payment fulfillment RPCs can currently grant entitlements to the linked user without checking a deletion state. The deletion marker check must happen inside the same transaction that fulfills payment, not only in Express middleware; otherwise a webhook can race a deletion request.
- Keep the existing payment-row-then-user-row lock order used by fulfillment RPCs, or deliberately redesign every competing transaction and test it. A deletion transaction that takes user then payment locks can deadlock.
- User deletion must not cascade-delete subscriptions, credit purchases, or credit ledger evidence. Migration 009 currently has cascading foreign keys; retain the minimum required financial evidence separately before anonymization.

### External integrations and cleanup

- Pinterest account credentials are encrypted at application level with AES-256-GCM, but deletion must remove both encrypted access and refresh tokens and revoke the remote grant where the provider supports it. Removing the DB row alone may not revoke the Pinterest-side grant.
- Scheduler claims are independent background operations. A lifecycle-state filter must be enforced in the atomic claim SQL function as well as API routes, so a pending-deletion user's scheduled pins cannot be claimed during cleanup.
- Storage object ownership/path mapping has not been established from the inspected schema. Never delete image objects by deriving a storage key from a public URL; build and test an explicit owner-to-object manifest first.

No account deletion endpoint, lifecycle column, migration, webhook behavior, or production setting was changed in this follow-up. These are verified code constraints and implementation requirements, not shipped functionality.


## Data isolation and Storage audit (Nov 5, 2026)

### Database RLS model

- The baseline migration enables RLS on all ten application tables. Policies use `auth.uid()`, while PinPosy authenticates with its own JWT rather than Supabase Auth. For ordinary anon/authenticated Supabase requests, `auth.uid()` is therefore NULL and the policies deny access. The Express backend uses the Supabase service-role client, which bypasses RLS; consequently API-level ownership checks are the effective isolation boundary for current application traffic. Do not describe these policies as independently validating PinPosy JWT ownership.
- `backend/supabase.js` currently falls back from `SUPABASE_SERVICE_ROLE_KEY` to `SUPABASE_ANON_KEY`. With the anon key, the backend loses service-role RLS bypass and many writes fail closed; it must never silently run in this degraded mode. Add a startup hard failure when service role key is absent, and never expose that key to frontend bundles.
- Project list/detail and project-scoped board routes filter by `req.userId` or first verify project ownership. Board/pin mutation helpers resolve ownership through the project relationship and return 404 for non-owned objects. This is good API-level coverage, but it needs cross-user integration tests for every read/write route and nested relationship.
- The project analysis update fetches the project with owner filter, then updates by project ID only. Since the service-role key bypasses RLS, preserve ownership in the UPDATE predicate too (add `.eq('user_id', req.userId)`) to avoid a time-of-check/time-of-use gap if ownership can change or records are manipulated concurrently.
- Admin middleware reads `users.is_admin` using the authenticated user ID and denies on lookup error. This is fail-closed. Add tests for non-admin, missing user, and database error; do not rely on frontend hiding admin controls.

### Storage exposure and ownership

- The `pin-images` bucket is created as public and uploaded object paths are global `pins/<timestamp>-<random>.<ext>`, with no user or pin identifier. Anyone who obtains a public URL can read that image; this may be acceptable for Pinterest-ready public creative assets, but it is not private per-user storage. The product privacy statement and UI must not imply uploaded pin images are private.
- Storage path is not persisted as a separate ownership record; only the public URL is stored on `pins.image_url`. Account deletion therefore cannot reliably enumerate and remove every user's objects by ownership. Introduce an explicit object key/owner mapping (or store the key in a dedicated column) before promising deletion of stored images.
- `ensureBucket()` currently treats a failed list/create operation as a logged warning and leaves `bucketReady=false`; upload then fails later. Prefer explicit startup/readiness failure or propagate the storage configuration error at upload time with a stable error code.
- The backend uses service-role access to Storage, so Storage RLS policies do not provide user isolation for these uploads. Keep upload routes behind JWT and pin ownership checks; test cross-user upload attempts and ensure object keys cannot be selected by the caller.

### Safe follow-up implementation

1. Make `SUPABASE_SERVICE_ROLE_KEY` mandatory at backend startup; no anon fallback.
2. Add owner predicate to the project analysis UPDATE.
3. Add cross-account API tests covering project, board, pin, image upload, schedule, and admin routes.
4. Decide whether pin images are intentionally public. If private, migrate to a private bucket with short-lived signed URLs; if public, state that anyone with the URL can access them.
5. Persist explicit Storage object keys and owner mapping before implementing deletion cleanup.

No RLS, bucket, Storage object, production secret, or database setting was changed in this audit. These findings are based on the checked-in schema and backend source; live Supabase policy/bucket state has not been queried.


## Admin and mutation-route audit (Nov 5, 2026)

### Privilege boundaries

- `/admin/*` routes consistently apply both `requireAuth` and `requireAdmin`. The admin check reads `users.is_admin` for the authenticated `req.userId`; missing row, false flag, and database error all deny access (currently HTTP 403). This is fail-closed, although returning 503 for database outages would make operational diagnosis clearer without granting access.
- `PATCH /me` only accepts name, surname, and preferred_language; it does not accept `is_admin`, `credits_balance`, `tariff_plan`, email, or password fields. Unknown fields are ignored, and an empty recognized update is rejected.
- `PATCH /me/tariff` is guarded: self-selection is enabled only outside production with `ALLOW_TARIFF_SELF_SELECT=1`; otherwise the authenticated account must already be admin. The environment helper explicitly disables the flag in production.
- `POST /credits/dev-topup` has no JWT middleware, but it is not an unauthenticated production top-up: the validator returns 404 in production or unless `ENABLE_DEV_TOPUP=true`, requires an `ADMIN_SECRET` of at least 32 characters, compares it with `timingSafeEqual`, and validates email/amount. Keep this endpoint disabled in production and never expose ADMIN_SECRET to the frontend. Consider rate limiting this endpoint in development as defense in depth.

### Ownership on mutation

- Board and pin mutation handlers previously performed an ownership read, then updated the target by ID alone. The API has no current endpoint to reassign project/board ownership, but this left a check-then-write gap if parent relationships changed concurrently.
- Updated board edits to include the verified `project_id` in the UPDATE predicate. Updated pin title/description, status, and image updates to include the verified `board_id` in the UPDATE predicate. These predicates make the write remain bound to the parent record that was checked.
- Project analysis UPDATE now also includes `user_id = req.userId` (see prior audit section).
- Remaining routes to cover with cross-account integration tests: generated-board insert, generated-pin completion RPC, pin-regeneration RPC, schedule creation/cancellation, Pinterest OAuth callback, and Storage upload. Existing helper checks and SQL RPC ownership checks are present in source, but a complete adversarial test matrix has not yet been executed.

### CI status for latest ownership-guard commit

- Latest code commit: `07f0bec935e997df926718494f325bffc56cb99a`.
- GitHub Actions runs for persisted-board integration, atomic payment fulfillment, and Prodamus webhook tests all report failure. The job API returned no step details and no log URLs, so the cause is not attributable to these code changes from available evidence. Vercel also reports `build-rate-limit`; no current deployment was produced.
- PR #4 remains draft and unmerged. No CI success is claimed. Do not merge or deploy until actionable CI results are available and required checks pass.

No production configuration, live database, migration, or deployment was changed.


## Pinterest security follow-up (Nov 5, 2026)

- OAuth state now includes the user's current `token_version`. The callback checks that the account still exists and that the version is unchanged before exchanging the code or storing Pinterest tokens. This prevents a callback started before password reset from reconnecting the external account afterwards.
- OAuth state remains valid until its 15-minute expiry and is not yet stored/consumed as a one-time nonce. A durable hashed nonce with atomic consumption is a future hardening task. When account lifecycle status is introduced, the callback must also require an active account.
- `begin_pinterest_publish()` is a SECURITY DEFINER function. It now checks the full `pins -> boards -> projects.user_id` ownership chain inside SQL before creating a publication attempt, rather than trusting the supplied user ID and relying only on the Express pre-check.
- `claim_due_pin_schedules()` currently has no account lifecycle predicate because no deletion-state column exists. Add an active-account join when lifecycle status is implemented; also gate OAuth callback, token refresh, manual publication, and scheduled publication.
- `backend/supabase.js` still falls back to `SUPABASE_ANON_KEY`. Making the service-role key mandatory is a release-hardening task, but was not changed because the deployed Render environment has not been inspected and an unverified startup change could cause an outage.
- Pinterest tokens use AES-256-GCM with a 32-byte key. Legacy plaintext tokens are migrated on read, so verify no legacy rows remain before claiming all stored tokens are encrypted.

No live Pinterest authorization, Supabase RPC, migration, or deployment was run. These are source changes only; SQL execution tests remain outstanding.


### Scheduled publication queue edge case

- The schedule API permits a row with no `pinterest_board_id`, while the worker only claims rows with a destination board. Such rows previously remained `scheduled` indefinitely and never appeared as a terminal failure.
- Updated migration `017_pinterest_schedule_worker.sql`: when the worker runs, due rows missing a Pinterest board are moved to `failed` with an actionable `last_error`. They are no longer silently stranded; after selecting a destination, the user can create a new schedule because the partial unique index excludes failed rows.
- UI audit found a mismatch to resolve: calendar/review components use local PinPosy board IDs (`boardId`), while the persistent scheduler needs a remote Pinterest board ID (`pinterestBoardId`). The current calendar path can submit the latter as undefined. A proper remote-board selector/ID mapping is still needed; this SQL guard is a fail-safe, not a complete UX fix.
- The ownership check added to `begin_pinterest_publish()` explicitly casts `projects.user_id` to text, matching the established `user_id::text` comparison used by the pin-generation ownership RPC and avoiding a possible UUID/text operator mismatch.


### Pinterest destination selection in scheduling UI

- The generator already fetched real Pinterest boards, but the manual approval flow incorrectly labelled local PinPosy boards as Pinterest destinations and scheduled rows without a remote board ID. The review flow now fetches the authenticated user's Pinterest boards, exposes a separate remote destination selector, carries its ID into every scheduled item (including bulk approval), and blocks approval when no real Pinterest destination is selected. The local PinPosy board remains a separate organizational field.
- The backend schedule endpoint now requires a non-empty Pinterest board ID (maximum 128 characters) and stores that validated value. This prevents API clients from creating queue rows that the worker cannot claim. The worker-side fail-safe for legacy/malformed due rows remains in migration 017.
- The generator now blocks adding a generated pin to the schedule until a real Pinterest board is selected and a local PinPosy board exists. This closes the normal UI path as well as the API path.
- Limitation: the remote board ID is syntactically validated at scheduling time; existence/ownership is checked against Pinterest by the worker immediately before publication. A future enhancement could validate the board during schedule creation too, but doing so would add a remote API call to every schedule request.

- Manual review persistence now waits for the schedule API response before removing a card from the queue. Failed single approvals leave the card in place; bulk approval removes only successfully persisted cards and reports the partial result. This avoids silently losing a review item when the network or backend rejects its schedule.

### Scheduler reliability audit follow-up

- The authenticated schedule-creation API now applies the same active publishing-plan gate as manual publishing (`start`, `pro`, `agency`). The worker continues to re-check entitlement at execution time because a subscription can expire after a schedule is created. This avoids knowingly accepting new scheduled work from accounts that cannot currently use publishing while still preventing publication after entitlement expiry.
- The manual-review keyboard approval effect now includes the selected remote Pinterest board ID in its dependencies, so the right-arrow shortcut uses the latest selected destination rather than a stale render closure.
- Publication safety observations: network/timeout failures during `POST /pins`, HTTP 408/5xx, missing remote IDs, and local completion failures are conservatively recorded as `unknown`; definite API rejections are recorded as `failed`; only `published` attempts are reconciled to a published schedule after worker interruption. The current design intentionally prefers a missed/review-required post over a duplicate post.
- Remaining operational dependency: the repository contains the worker endpoint and atomic claim RPC, but this audit has not verified a live external cron invocation, the Render scheduler secret, deployed environment variables, or applied Supabase migrations. Automatic publishing must not be considered operational until those are verified in the actual services.
- Remaining engineering hardening: token refresh is not coordinated across multiple backend instances. If Pinterest rotates refresh tokens and two instances refresh the same account concurrently, one refresh may race or fail. A distributed refresh lock/lease (or equivalent atomic credential-version strategy) and tests are still needed before claiming multi-instance refresh resilience.

### Pinterest refresh-token concurrency protection

- Added migration 026 with a per-user database lease for refresh-token rotation. The lease is acquired/released through SECURITY DEFINER RPCs restricted to `service_role`; leases expire automatically after at most 60 seconds so a crashed worker cannot hold a permanent lock.
- `refreshAccessToken()` now acquires the distributed lease before calling Pinterest. If another backend instance owns it, the caller polls the encrypted account record and reuses the newly saved access token when it changes; it does not concurrently submit the same refresh token. After acquiring the lease, it re-reads the account to avoid refreshing credentials already rotated by another request.
- If the lease cannot be acquired within the bounded wait, the request fails with a retryable 503 instead of racing the other instance. Lease-release failures are logged; expiry is the fallback.
- Operational ordering is mandatory: migration 026 must be applied before deploying this code to any environment that can refresh Pinterest tokens. Until then, the RPC is absent and refresh fails closed with 503. The migration has not been applied to Supabase as part of this repository work.
- Residual edge case: if a process crashes after Pinterest rotates the refresh token but before PinPosy persists the replacement, the lease eventually expires but the old token may already be invalid. No local lock can eliminate this remote/local commit gap; recovery may require reconnecting Pinterest. The lease prevents concurrent rotation but does not make Pinterest's remote token endpoint transactional with Supabase.
- No live concurrent-refresh test was run because the Supabase migration is not applied and no production credentials were accessed. Add an integration test against a disposable Supabase/Postgres environment before enabling the scheduler in production.

### Refresh-token commit fencing (migration 027)

- Migration 027 adds `commit_pinterest_token_refresh()`. A refresh result is persisted only if the caller still owns the unexpired lease and the Pinterest account row still has the exact `updated_at` version observed before the remote refresh request.
- This prevents a slow/expired lease holder from overwriting a newer refresh or a concurrent OAuth reconnect. The RPC updates the existing account row (it does not upsert a deleted/reconnected account) and releases the lease in the same database transaction after a successful compare-and-swap.
- If the lease expired or the account row changed, the refresh result is discarded and the latest stored account is re-read. If the state cannot be reconciled, the request fails closed with 503.
- Rollout order: apply migrations 026 and 027 before deploying the new backend code. Both migrations remain unapplied in the live Supabase project until separately authorized and verified.

- If the commit RPC returns a transport/database error, the backend now re-reads the account before failing. If the new credentials were actually committed but the response was lost, it recovers and uses them rather than prompting an unnecessary reconnect.

### Scheduler error classification hardening

- When the worker catches a publication error, it reads the idempotency journal to determine whether the pin was published, failed, or has an uncertain outcome. If that journal lookup itself fails, the schedule is now marked `unknown` rather than `failed`; a database read outage must not turn an ambiguous remote publication into an automatically retryable state.
- The worker now checks whether persisting the schedule's final state failed. In that case its response reports `unknown` and logs the database error instead of reporting a terminal status that was not actually saved. The existing stale-`publishing` recovery remains the fallback if the update could not be committed.

### Schedule cancellation and worker claim window

- Cancellation is a conditional single-row update (`status = scheduled` → `cancelled`) scoped by both schedule ID and authenticated user ID. The worker claims due rows in a database transaction with `FOR UPDATE SKIP LOCKED` and changes them to `publishing`. These state transitions serialize: if cancellation wins, the worker no longer sees a due row; if the worker claim wins, cancellation cannot change an in-flight publication. The API deliberately does not pretend that an already claimed Pinterest request can be cancelled remotely.
- The worker processes its claimed batch sequentially. Claiming 50 rows at once could leave later rows waiting long enough to cross the 20-minute stale-claim threshold before the current process reaches them. Both the API and SQL claim RPC are now capped at 10 rows. At the configured 10-second Pinterest HTTP timeout, this bounds the queue-ahead window substantially while retaining modest batching.
- A schedule can be retried only after a definite failed attempt; `unknown`, `publishing`, and `published` remain protected by the unique active-per-pin index. There is no separate reschedule endpoint: after a definite failure the client may create a new schedule row, subject to the unique index and publication journal.
