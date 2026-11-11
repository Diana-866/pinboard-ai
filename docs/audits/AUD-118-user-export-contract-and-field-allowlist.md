# AUD-118 — Versioned user data export contract and field allowlist

Date: 2026-11-08  
Status: design specification only; no endpoint, migration, export job, or production data access was added.

## Goal

Define a safe, portable export contract for one authenticated PinPosy account. This specification builds on AUD-117's ownership map. It is not yet implementation-ready for every record family: unresolved Storage ownership and a final pass over provider outcome journals remain blockers.

## Security invariants

1. The owner is always derived from the verified PinPosy session (`req.userId`). Never accept `user_id`, email, project ID, board ID, or pin ID as the export owner.
2. Every collection query must prove ownership. For nested objects, traverse the authoritative relationship: project → board → pin. Do not trust a child ID by itself.
3. Use a dedicated export DTO/serializer with explicit field allowlists. Never serialize database rows wholesale, `select('*')`, arbitrary JSONB, or provider response objects.
4. Exclude credentials, token hashes, internal claims, raw webhook data, provider request IDs where not user-facing, and all secrets.
5. A failed child query must fail the export or produce an explicit, machine-readable incomplete status. Never silently label a partial export complete.
6. Build the export from a consistent database snapshot where practical. If using an asynchronous job, record a snapshot/created-at cutoff and define how concurrent changes are handled.
7. Deliver through private Storage or an authenticated download endpoint with a short-lived, single-purpose download capability. Do not place archives in the public `pin-images` bucket.
8. Audit export requests without logging archive contents, passwords, tokens, prompts or private URLs. Rate-limit per account and globally.
9. Export only the requesting user's data; admin privileges must not silently broaden a self-service export.

## Proposed archive layout

```text
pinposy-export-<UTC timestamp>.zip
├── manifest.json
├── profile.json
├── projects.json
├── boards.json
├── pins.json
├── generation-history.json
├── pinterest.json
├── schedules.json
├── billing/
│   ├── credit-transactions.json
│   ├── credit-purchases.json
│   └── subscriptions.json
└── media/
    └── README.json
```

Use UTF-8 JSON. Keep timestamps as ISO-8601 UTC strings. Keep currency amounts as decimal strings (not binary floating-point). Preserve UUIDs as strings and relationships as explicit IDs. Empty collections must be emitted as empty arrays. If media cannot be safely collected, explain that in `media/README.json` and the manifest; do not silently omit it.

## Version 1 contract

### `manifest.json`

Allowlist:
- `schema_version`: fixed string `1.0`
- `product`: `PinPosy`
- `generated_at`: ISO-8601 UTC
- `account_reference`: account UUID
- `sections`: per-file object with `status` (`complete`, `not_available`, `omitted_by_design`, `partial`), `record_count`, and stable `reason_code` when not complete
- `limitations`: stable codes and concise descriptions
- `integrity`: SHA-256 digest per included archive member, calculated after serialization

Never include server paths, bucket credentials, SQL, stack traces, provider secrets or signed download URLs in the manifest.

### `profile.json`

Include:
- account reference
- email address currently associated with account
- name, surname, preferred language
- onboarding completion flag
- created timestamp
- current user-visible tariff name and period end
- current user-visible credit balance

Exclude:
- `password_hash`, `token_version`, `is_admin`, legacy/internal tariff fields, raw auth state, internal risk/abuse flags and any credential material.

### `projects.json`

Include:
- project ID
- website URL supplied by user
- niche, tone, goal, language
- site summary and analysis timestamp
- creation timestamp

The site summary may contain excerpts derived from the website. Include it as stored user-associated content; do not enrich it by refetching the site during export.

### `boards.json`

Include:
- board ID and parent project ID
- title, description, status, cover URL
- creation timestamp

### `pins.json`

Include:
- pin ID and board ID
- title, description, user-visible status
- image URL (as a reference, not a promise of permanent availability)
- model label only if already exposed as user-facing metadata
- credits charged, aspect ratio, scheduled date, creation timestamp

Exclude raw provider task IDs, internal storage lifecycle state, raw errors, provider response URLs, claim tokens and idempotency keys.

### `generation-history.json`

Include normalized events only:
- event type (`bulk_generation` / `pin_regeneration`)
- request reference and associated board/pin references
- user-visible prompt only if product policy treats the prompt as user-owned content and it is safe to disclose
- safe model label and requested output count/aspect ratio
- normalized status (`processing`, `completed`, `failed`, `unknown`)
- created/updated timestamps
- result pin IDs where ownership is verified

Do not include:
- request fingerprints
- provider idempotency keys, task IDs or raw result URLs
- claim tokens/lease IDs
- raw provider error payloads or internal error messages
- provider prices, cost ledgers, token counts or internal reconciliation data
- raw `result_pin` JSON without a separate reviewed field mapping

**Prompt policy decision:** prompts can contain personal/business information. For a user export, they are potentially user content and should not be silently discarded; however, they must be normalized and reviewed before inclusion. If a prompt cannot be safely separated from provider/internal metadata, mark that generation-history subsection as `partial` with a stable reason code.

### `pinterest.json`

Include:
- remote Pinterest user ID
- username/display handle
- granted scopes
- connected/disconnected state and timestamps
- publication history: local pin reference, remote pin ID, remote board ID, publication timestamp
- publication attempt summaries only when ownership is unambiguous

Exclude:
- access token, refresh token, encrypted token ciphertext, OAuth state, authorization code, refresh lease, raw provider request/response, internal claim/fencing tokens
- historical rows whose account ownership cannot be proven

A disconnected account may remain in the export as historical account metadata; it must not imply the remote Pinterest grant is still active.

### `schedules.json`

Include:
- schedule ID and pin ID
- scheduled timestamp, timezone, destination URL, Pinterest board reference
- normalized status
- attempt count and published timestamp

Exclude raw `last_error`, worker claims, claim tokens, retry lease state and provider payloads. Unknown/ambiguous publication outcomes must remain distinguishable from success or failure.

### Billing files

`credit-transactions.json`:
- transaction ID, amount, type, safe description, timestamp
- decimal values serialized as strings

`credit-purchases.json`:
- purchase ID, package ID/title, credits, normalized payment state, amount/currency, paid/created timestamps
- do not expose webhook payloads or signatures
- expose a normalized credited state, not internal fulfillment timestamps

`subscriptions.json`:
- subscription ID, plan, normalized status, amount/currency, period start/end and creation timestamp
- do not expose raw provider payload, signatures, webhook event hashes or internal reconciliation reasons

Financial records must be exported as history, not treated as proof of an entitlement that is currently active. Explain that payment status and current plan are distinct concepts.

### Media

Do not bundle image files in version 1 until a verified owner-to-object manifest exists. Provide:
- stored image URL reference where it is already part of an owned pin
- per-object availability state only if verified
- explanation that public URLs may be accessible to anyone who has them and may expire/be removed

Do not infer Storage object paths from URL parsing and do not delete or copy objects based only on a URL.

## Explicit exclusion list

The following must never appear in an ordinary user export:
- passwords/password hashes, JWTs, session tokens, token hashes, reset/verification tokens
- Pinterest access/refresh tokens, encrypted token blobs, OAuth codes/state
- Prodamus signatures/secrets, webhook raw bodies, payment callback secrets
- GPTunnel/API credentials, service-role keys, environment variables
- worker lease/claim tokens, fencing tokens, idempotency keys and request fingerprints
- raw stack traces, SQL errors, provider error payloads, internal risk/admin flags
- global billing exception records, other users' records, email outbox queue internals
- internal provider costs and reconciliation evidence unless a separately approved user-facing billing statement is designed

## Completeness and consistency behavior

- For a small export, use a read-only repeatable-read transaction if the database client supports it reliably.
- For larger accounts, use an asynchronous export job. Capture a cutoff timestamp and query every section against that cutoff; document that updates after the cutoff are not included.
- Use deterministic ordering: `created_at ASC, id ASC` (or the stable equivalent).
- Page in bounded chunks. Never load an unbounded account history or all image bytes into Node memory.
- Establish hard limits for records, archive bytes, job duration and concurrent exports. Exceeding a limit must return a clear retry/limit response, not a truncated archive marked complete.
- Compute file hashes after serialization and include them in the manifest.
- Recheck that the export job owner matches the requester before issuing the download capability.
- Expire archives automatically and delete them through a dedicated private-bucket lifecycle.
- Ensure retrying a job cannot leak an earlier user's archive or issue a stale download token.

## Required API behavior (future implementation)

Suggested interface:
- `POST /account/export-requests` — authenticated, rate-limited; returns job reference and accepted status.
- `GET /account/export-requests/:id` — owner-scoped status only.
- `GET /account/export-requests/:id/download` — owner-scoped, one-time/short-lived download capability only when completed.

The exact route names are proposals, not existing endpoints. No direct streaming export should be added until memory limits, snapshot strategy, cancellation and private archive storage are implemented.

Suggested stable error codes:
- `EXPORT_NOT_FOUND`
- `EXPORT_ALREADY_RUNNING`
- `EXPORT_RATE_LIMITED`
- `EXPORT_LIMIT_EXCEEDED`
- `EXPORT_SOURCE_UNAVAILABLE`
- `EXPORT_INCOMPLETE`
- `EXPORT_EXPIRED`

Avoid revealing whether another user's export ID exists; return the same not-found response for non-owned IDs.

## Required tests before shipping

### Ownership isolation
- User A cannot request, poll, cancel or download User B's export by changing any ID.
- Nested board/pin/generation/schedule/publication references are checked through the authoritative ownership chain.
- Legacy Pinterest publication/attempt rows with missing account mapping are omitted, not assigned to a guessed account.
- A cross-user Storage URL cannot cause the export worker to copy or delete another user's object.

### Secret exclusion
Seed recognizable sentinel values into every secret/internal field and assert none occur in any archive member or manifest:
- password hash and auth token hash
- Pinterest access/refresh tokens and ciphertext
- OAuth state/code
- Prodamus webhook signature/body
- provider idempotency key, task ID, claim/fencing token
- API key/environment secret
- raw provider error and stack trace

### Completeness and failure
- Empty account produces a valid archive with empty arrays.
- Large history paginates without duplicate/missing records.
- Source-table timeout or permission error cannot yield a `complete` manifest.
- Concurrent updates follow the documented cutoff/snapshot rule.
- Duplicate export requests are idempotent or safely rejected.
- Expired archive cannot be downloaded; archive is removed on schedule.
- Archive checksum matches each serialized file.

### Regression
- Export does not change balances, reservations, schedules, Pinterest connection state or payment records.
- Export route does not accept owner IDs or bypass normal auth/session-version checks.
- Export does not log user content or archive bytes.

## Blockers before implementation

1. Finish field-level review of migrations 063–068 and 071–075 for provider outcomes, exact quotes, reservation settlement and refund reconciliation. Export only normalized user-facing facts.
2. Verify the exact active column definitions and relationships for `pinterest_publish_attempts`, schedules and publication history.
3. Add an explicit Storage owner/object mapping before promising downloadable media.
4. Decide product policy for exporting prompts and website-derived excerpts.
5. Choose private archive storage, expiry policy, job worker, quotas and operational alerting.
6. Confirm retention and export obligations with the operator's applicable legal requirements; this document is not legal advice.

## Verification

Reviewed checked-in migrations for core tables, profile/onboarding, billing, Pinterest, generation journals, reservations and refund reconciliation, plus AUD-117 and the account-deletion runbook. No live Supabase query, production configuration change, SQL migration, application code, test, build, CI run, merge or deployment was performed.
