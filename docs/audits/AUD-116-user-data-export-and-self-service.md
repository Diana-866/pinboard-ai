# AUD-116 — User data export and self-service controls

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`  
Status: source-code audit; no production database or provider account accessed.

## Scope and method

Reviewed the current backend route inventory in `backend/index.js`, the Pinterest integration routes in `backend/pinterest.js`, the account settings UI in `frontend/src/components/settings/SettingsView.tsx`, authentication context, and relevant schema migrations including 003, 006, 008, 009 and 015. This is a repository-level inspection, not a live-account test or legal compliance opinion.

## Executive summary

There is currently **no user-facing personal-data export endpoint or export UI**. The settings screen exposes appearance, language, timezone, Pinterest connection management and billing summary, but no export, account deletion, email-change or password-change controls. The backend supports profile name/surname/language updates and a password-reset flow, and Pinterest disconnection is implemented. Project/board/pin editing and schedule cancellation are present, but the inspected route inventory contains no general project, board or pin deletion endpoint.

A complete export should not be implemented as a quick `/me/export` that dumps a few tables. The service has financial, integration, publication, scheduling, generation and Storage data with distinct secret/retention requirements. In particular, image URLs may refer to public Storage objects, and export should not expose Pinterest OAuth credentials, JWT/session tokens, password hashes, reset/verification tokens, service keys or webhook secrets.

## Findings

### 1. Export capability — missing

- No `export`, `data-export`, `privacy-request` or equivalent user route appears in the current `backend/index.js` route inventory.
- No export/download action appears in `SettingsView.tsx`.
- No export job, export manifest, archive generation or download-expiry workflow was identified in the inspected paths.
- Therefore users cannot currently self-serve a structured copy of their PinPosy account data through the application.

### 2. Profile and credential controls — partial

- `GET /me` returns a deliberate public profile projection: ID, email, name, surname, credit balance, tariff state, onboarding state, email verification, preferred language and admin flag. It does not return password hashes or OAuth tokens.
- `PATCH /me` supports name, surname and preferred-language updates.
- Email-change route was not found.
- Password reset is available through the unauthenticated, one-time reset-token flow, but a signed-in change-password control/route was not found in the inspected route inventory.
- Frontend logout clears the locally stored JWT; server-side per-device session revocation is not implemented as part of ordinary logout (previously recorded in the authentication audit).

### 3. Pinterest integration — disconnect exists, export does not

- `POST /integrations/pinterest/disconnect` is implemented and uses the versioned `disconnect_pinterest_account_v2` RPC.
- The disconnect flow removes the active connection/credentials according to the RPC contract; account/publication history may still exist and should be represented in a data export where appropriate.
- Export must include non-secret account metadata (for example username, remote account identifier, scopes, connection/disconnection timestamps) only where the product has a legitimate reason to expose it. It must never include access or refresh tokens.
- Pinterest publication IDs, destination board IDs and timestamps are user-relevant history and should be considered for export.

### 4. Projects, boards and pins — read/update/create, limited deletion

- Project routes include create, list, detail, analysis and board generation. No project DELETE route was found.
- Board routes include create, list, detail and update. No board DELETE route was found.
- Pin routes include update, status change, image upload and regeneration. No pin DELETE route was found.
- A user export should preserve the hierarchy and stable IDs: projects → boards → pins, including titles, descriptions, statuses, destination URLs, image references and relevant timestamps.
- Do not assume all fields are safe to export without inspecting each current schema; exclude internal provider task credentials, operational lease/fencing fields and internal error payloads unless they are deliberately transformed into a safe user-facing status.

### 5. Publication schedules and history

- User-facing schedule routes include listing, retry, account reconciliation and cancellation.
- The persistent schedule schema includes scheduled time, timezone, destination URL, Pinterest board ID, state, attempt count, publication ID and error field.
- Export should include user-relevant schedule state and history, but should not blindly expose raw `last_error` values because provider or infrastructure errors can contain implementation details.
- Published-pin records and publication-attempt journals should be included in a normalized, redacted form. Ambiguous or in-flight publication states must remain distinguishable from confirmed publication.

### 6. Billing and credits

- Authenticated routes expose subscription history, credit-purchase history and credit balance.
- The data model includes subscription orders, credit purchases and credit transactions/ledger entries. Migration 009 adds cascading user foreign keys to several financial tables, so hard deletion of the user row can erase financial evidence.
- Export should include order identifiers, product/plan, stored amount/currency, order status, relevant timestamps, credit changes and current balance, subject to a deliberate minimization policy.
- Do not include webhook signatures, raw webhook bodies, provider credentials, internal exception payloads or administrator-only reconciliation metadata.
- Financial records and privacy deletion need a separate retention/anonymization design; the existing deletion design runbook explains why a simple cascade delete is unsafe.

### 7. Image files and Storage

- Pins reference image URLs, and the `pin-images` bucket has intentionally public-read behavior for Pinterest publishing.
- A portable export should either package owned image objects or provide a clear manifest of image URLs and their availability. Merely exporting a URL does not guarantee that the image will remain available indefinitely.
- The current source review did not establish a complete, reliable mapping from every historical `image_url` to an owned Storage object key. Do not delete Storage objects or promise a complete archive by guessing object paths from URLs.
- Export downloads should be private, short-lived, ownership-checked and rate-limited. Avoid placing archives in the public `pin-images` bucket.

### 8. Generation history and operational records

- The repository contains generation journals, provider outcome records, credit reservations and recovery/fencing state.
- Export should expose a concise user-facing generation history (requested operation, created assets, completion/failure state, timestamps and charged/refunded credits) rather than raw internal journal rows.
- Do not expose provider task identifiers, provider request/response payloads, API keys, lease tokens, stack traces or raw error objects.
- Support conversations and email-outbox records require a separate inventory and retention decision; they should not be dumped indiscriminately into the product-data export.

## Recommended export contract

Implement only after a schema-level field inventory and tests. Suggested versioned archive:

- `manifest.json`: export version, generated timestamp, account identifier, included sections, omissions and known limitations.
- `profile.json`: email, name, surname, preferred language, onboarding state, created/updated timestamps where available. Never include password hash, JWT, token version or auth/reset/verification secrets.
- `projects.json`, `boards.json`, `pins.json`: user-owned product hierarchy with safe user-facing fields.
- `generation-history.json`: normalized user-facing generation events and credit effects.
- `pinterest.json`: safe account metadata, publication history and schedules; no OAuth tokens.
- `billing.json`: subscriptions, purchases and credit ledger in normalized form; no webhook secrets/raw payloads.
- `images/...` plus an image manifest, only after ownership/path mapping and archive-size limits are established. Otherwise state clearly that images are referenced by URL and may be time-limited.
- Explicitly document excluded operational/security records and any data that cannot yet be exported.

Prefer an asynchronous export job for potentially large accounts, with a private object, short expiry, one-time or tightly scoped download token, per-user rate limit, audit event, bounded archive size and cleanup. Re-check ownership when issuing and downloading. Do not return an unbounded synchronous ZIP from an API request.

## Recommended next implementation sequence

1. Build a schema matrix for every user-owned table and its foreign-key path, including journals, attempts, schedules, credit ledger, billing and Storage metadata.
2. Define a stable, versioned, redacted export schema and classify each field as user data, operational data, secret or legally retained data.
3. Add integration tests proving cross-user isolation, secret exclusion, pagination/large-account behavior, stable ordering, archive expiry and retry/idempotency.
4. Implement a bounded export job and private download flow; add an export entry to Settings with clear contents/limitations and progress/error states.
5. Separately design self-service deletion and email/password changes. Do not combine export and deletion into one endpoint or perform hard deletion until the payment-webhook, financial-retention, Pinterest schedule and Storage cleanup hazards in `docs/runbooks/account-deletion-design.md` are resolved.
6. Update the RU/EN privacy notice only after the actual feature and retention behavior are implemented and verified.

## Verification and limitations

- Repository route inventory: checked current `backend/index.js` route declarations; no user export, project DELETE, board DELETE or pin DELETE route was present.
- Settings UI: checked full `SettingsView.tsx`; no export or account-deletion controls were present.
- Pinterest: checked `backend/pinterest.js`; authenticated disconnect route is present.
- Schema references: checked migrations 003, 006, 008, 009 and 015.
- No live Supabase queries, provider-console checks, local tests, build, CI run, deployment or migration were performed.
- This audit makes no claim that all user data sources or legal retention duties have been exhaustively inventoried; support mail, provider-side records, backups and production Storage objects require separate verification.
