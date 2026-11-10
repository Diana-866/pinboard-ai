# AUD-117 — User-owned database inventory and export ownership map

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`  
Status: repository schema audit; no production database queried.

## Objective

Map the database records that belong in a user export, identify how ownership is established, distinguish user-facing data from operational/secrets, and document deletion/retention hazards. This is a source-level schema review, not a live Supabase inventory or legal retention opinion.

## Executive summary

The export cannot safely use a blanket `user_id = ?` filter. The product hierarchy is owned indirectly:

`users → projects → boards → pins`

Several newer records also use direct `user_id`, while schedules and publication history combine direct ownership with pin/account references. Some operational journals have no user foreign key and must be scoped through their parent request, board, pin or Pinterest account. A few records are global operational/audit data and must not be included in an ordinary user export.

A key risk is that the current schema has destructive cascades: migration 009 links payment/credit history and Pinterest records to users with `ON DELETE CASCADE`; projects also cascade, which then removes boards, pins and pin-linked schedules. The deletion runbook correctly prohibits a simple user-row delete until financial retention and late-webhook behavior are redesigned.

## Ownership and export matrix

| Data set / table | Ownership path in checked-in schema | Export classification | Important exclusions / caveats |
|---|---|---|---|
| `users` | Primary key `users.id` | Include a safe profile projection: email, name, surname, language, onboarding state, created timestamp and user-facing tariff/balance summary | Exclude `password_hash`, `token_version`, `is_admin`, internal auth state and secrets. Treat account ID as a stable export reference, not a credential. |
| `projects` | `projects.user_id → users.id` | Include project URL, niche, tone, goal, language, site summary, analysis timestamp and creation timestamp | Site summary may contain extracted website content; disclose it as user content. |
| `boards` | `boards.project_id → projects.id → users.id` | Include title, description, status, cover URL, timestamps and parent project ID | Never accept a caller-supplied project ID without checking it belongs to the authenticated user. |
| `pins` | `pins.board_id → boards.project_id → projects.user_id` | Include title, description, status, model label, credits cost, schedule date, aspect ratio, image reference and timestamps | Image URL does not prove Storage ownership or availability. Avoid exporting internal provider errors or raw task metadata. |
| `credit_transactions` | Direct `user_id → users.id` (converted to UUID and FK in migration 009) | Include amount, transaction type, safe description and timestamp | Treat as financial/ledger evidence. Hard delete currently cascades. |
| `subscriptions` | Direct `user_id → users.id` | Include plan, status, amount, currency, period dates, creation date and a provider order reference where safe | Exclude webhook payloads/signatures and internal fulfillment metadata. Hard delete currently cascades. |
| `credit_purchases` | Direct `user_id → users.id` | Include package, credits, status, amount, currency, paid/created timestamps and safe order reference | `balance_credited_at` is an internal reconciliation field; expose only a normalized paid/credited state. Hard delete currently cascades. |
| `auth_tokens` | Direct `user_id → users.id` | Exclude entirely from user export | Contains token hashes, purpose and expiry/consumption state. Raw tokens must never be exported. Hard delete currently cascades. |
| `pinterest_accounts` | Direct `user_id → users.id` | Include username, remote account ID, scopes and created/updated/disconnected timestamps | Never include access/refresh tokens or encrypted token ciphertext. Migration 031 makes access token nullable and adds disconnect timestamp; preserve account history as appropriate. |
| `pinterest_publications` | Direct `user_id`; also `pin_id → pins.id`; optional `pinterest_account_id → pinterest_accounts.id` | Include remote pin/board IDs, associated local pin/account references and publication timestamp | Older rows may lack account ID. Do not infer account identity where mapping is ambiguous. |
| `pin_schedules` | Direct `user_id`, `pin_id → pins.id`, optional Pinterest account FK | Include schedule time, timezone, destination URL, state, attempts and published timestamp in normalized form | Do not export raw `last_error`, claim/fencing values or operational retry internals. In-flight/unknown states must remain distinct. |
| `pinterest_publish_attempts` | Account/pin relationship; migration 031 adds nullable account FK. No user FK is established in the reviewed runbook. | Include normalized user-relevant publication result only after ownership is proven through pin and account | Legacy rows may have no resolvable account; do not guess. Exclude provider request payloads, claims, leases and raw errors. |
| `pin_generation_requests` | Direct `user_id`, `board_id → boards → projects` | Include a normalized generation event, safe outcome, timestamps and associated created pins | Stores `pins` JSON, request fingerprint and error code. Do not expose raw JSON/internal fingerprint without field-level review. |
| `pin_generation_tasks` | Direct `user_id`, `generation_request_id → pin_generation_requests`, `board_id → boards` | Include only safe task summary/status and created asset relationship | Exclude prompt if it contains sensitive user input unless explicitly part of export policy; exclude provider idempotency keys, provider task IDs, raw provider URLs/results, operational status details and error internals. |
| `pin_regeneration_requests` | Direct `user_id`, `pin_id → pins` | Include normalized regeneration event and result relation | Contains prompt, request fingerprint, claim token, provider IDs/URLs, result JSON and error code. Redact operational fields; prompts require deliberate user-content policy. |
| `pin_generation_text_usage` | Direct `user_id` | Normally exclude from user export; optionally expose only user-visible aggregate usage if product requirements demand it | Provider request IDs, token counts and provider cost are operational/cost-accounting data, not necessarily user data. |
| `email_outbox` | `subscription_id → subscriptions`; recipient email and payload | Exclude internal delivery queue rows | Contains recipient, template payload, claim token, retry state and error code. A user export may include the actual transactional message content only if separately retained and deliberately modeled; do not dump queue payloads. |
| `billing_webhook_exceptions` | Global operational billing audit; event hash/order reference, no user FK identified | Exclude from user export | Contains provider callback reconciliation metadata; administrator-only operational record. Do not expose reason/details indiscriminately. |
| `pinterest_account_refresh_leases` | `pinterest_account_id → pinterest_accounts`; user ID also present | Exclude | Lease IDs/times are worker coordination secrets/state. |
| `pin_image_object_lifecycle` | Bucket + object path; no user FK | Exclude raw lifecycle rows | Global Storage cleanup state. Export image objects only through a separate verified owner-to-object manifest. |
| Other credit reservation/refund/provider journals | Must be traced through their owning payment/generation request and checked migration-by-migration | Include only normalized user-visible credit effects, not raw journal rows | Do not assume table name implies direct ownership. Keep reservations, provider outcomes and internal reconciliation data out of public export. |

## Important schema facts

1. Core hierarchy ownership is indirect for boards and pins. A safe export must begin from the authenticated user's projects, then derive boards and pins through those IDs.
2. Migration 009 converts several legacy `user_id` columns to UUID and adds cascading user FKs for `auth_tokens`, `credit_transactions`, `subscriptions`, `credit_purchases`, `pinterest_accounts` and `pinterest_publications`. It also makes `projects.user_id` cascade. Deleting a user can therefore destroy financial evidence and connected-account history.
3. `pin_schedules` references pins with `ON DELETE CASCADE`. Deleting a project can cascade through boards and pins, removing schedules.
4. Migration 031 adds account-scoped Pinterest foreign keys to publication, publish-attempt and schedule records. Some historical mappings are intentionally nullable; unresolved history must not be assigned to an account by guesswork.
5. Generation journals include direct user IDs and parent references, but some columns store prompts, provider IDs, result URLs, idempotency keys, claim tokens, fingerprints and internal error codes. A normalized export DTO is required.
6. `email_outbox` is linked to subscriptions with `ON DELETE RESTRICT`, so a user/account cleanup cannot blindly delete subscription rows while pending or historical outbox rows remain.
7. The image lifecycle table stores bucket/object path and worker claim state, but the reviewed schema does not establish a complete user-to-object ownership relation. `pins.image_url` alone is not a safe deletion manifest.
8. RLS is not the export authorization boundary for PinPosy's custom JWT: ordinary Supabase client roles are denied by the current policy model, while backend service-role access bypasses RLS. Every export query must apply authenticated ownership predicates explicitly.

## Export query design requirements

- Start with authenticated `userId` from verified middleware; never accept an export owner ID from request parameters.
- Query the user's profile and direct-owner tables with exact owner predicates.
- Query projects first; derive project IDs, board IDs and pin IDs from those result sets. Use bounded batches and stable ordering.
- Scope generation tasks through both the direct owner and their parent request/board; scope regeneration records through direct owner and owned pin.
- Scope publication attempts through verified owned pin and matching owned Pinterest account. Keep unresolved legacy records in an explicit omissions section rather than attaching them incorrectly.
- Normalize schedule and generation errors into stable user-facing codes; never serialize raw provider/database error objects.
- Use a versioned manifest and explicit `included`, `excluded` and `limitations` sections.
- Paginate/batch all potentially large collections; set maximum row count, archive size and execution time. Prefer asynchronous export jobs and private short-lived downloads.
- Build a separate verified image manifest before packaging or deleting Storage objects. Do not derive ownership from a public URL.
- Preserve financial evidence and late-webhook reconciliation separately from profile anonymization/deletion.

## Deletion constraints confirmed

The checked-in `docs/runbooks/account-deletion-design.md` is consistent with the schema findings:
- No simple `DELETE FROM users`; cascading FKs erase financial and credit records.
- Payment fulfillment RPCs need an account lifecycle check inside the same transaction; middleware-only checks are raceable.
- A deletion workflow must use a durable lifecycle marker, revoke sessions, stop new payment/generation/scheduler activity, coordinate payment-row/user-row lock order, and preserve a minimal financial trail.
- Pinterest credentials and schedules require coordinated cleanup; already-sent remote publication calls cannot be cancelled locally.
- Storage deletion requires an explicit owner-to-object mapping and idempotent cleanup.
- Deletion must be resumable and tested against late/duplicate webhooks and partial cleanup.

## Gaps / items not established by this audit

- No live Supabase schema, row counts, actual FK inventory, RLS catalog, or production migration state was queried.
- The complete column inventory for all intermediate credit reservation/refund/provider tables still needs a focused pass before writing a final export allowlist.
- Support email systems, provider-side user records, backups, logs and legal retention schedules are outside this schema-only pass.
- Storage bucket contents and a complete object owner map were not available.
- This audit does not assert that every migration is applied in production.

## Next step

AUD-118 should turn this ownership matrix into an explicit export allowlist and a versioned JSON contract, then add SQL/API integration tests for cross-user isolation and secret exclusion. Do not add a live export route until the remaining journal/credit tables and Storage ownership map are resolved.

## Verification

- Inspected baseline schema, hardening migration 009, schedule migration 015, Pinterest account/publication migrations 031/033, generation migrations 014/045/053, billing exception migration 029, transactional email outbox migration 030, text usage ledger migration 069, image lifecycle migration 070, and the account deletion design runbook.
- No live database query, production setting change, migration, application code change, test run, build, CI run, merge or deployment was performed.
