# AUD-113 — Backend API security boundaries

Date: 2026-11-08
Branch: `feat/persisted-boards-api`
Scope: Express middleware and route registration, authentication/administration, development top-up, image upload, Pinterest OAuth/worker, outbound URL validation, storage validation and final error handling.

## Executive summary

The reviewed API consistently applies authentication to user-owned resources and uses database ownership filters/checks in the inspected project/pin paths. Admin routes use both authentication and a DB-backed admin check. Pinterest OAuth callback relies on a short-lived signed state and current session token version; the internal schedule worker uses a separate high-entropy secret checked with timing-safe comparison. Outbound image fetching pins validated public DNS addresses and disables redirects/proxy use.

Two concrete hardening changes were made:
- Added the existing authentication rate limiter to the development credit top-up route.
- Added a per-authenticated-user image-upload limiter before Multer buffers the upload.

These are defense-in-depth controls; the existing development top-up remains disabled in production and requires an explicit secret outside production.

## Findings and remediation

### F-113-01 — Development top-up endpoint had no route-level rate limit
Severity: Medium when enabled outside production; otherwise low residual exposure

Evidence:
- `POST /credits/dev-topup` is intentionally unauthenticated at the session layer and authorizes using a separate `ADMIN_SECRET`.
- `backend/devTopup.js` fails closed in production, unless `ENABLE_DEV_TOPUP=true`, and if the secret is absent or shorter than 32 characters.
- Secret comparison uses `crypto.timingSafeEqual` after length equality.
- The route previously had no rate limiter.

Remediation:
- Applied the existing `authLimiter` (10 requests / 15 minutes) to the route.
- The production-disabled check and secret validation remain unchanged.

Residual:
- Rate limiting uses the existing default in-memory Express limiter. It is not shared across multiple instances and resets on restart. Do not enable development top-up on a publicly reachable staging environment unless the secret is high entropy and staging access is otherwise restricted.

### F-113-02 — Image upload endpoint had no dedicated abuse limit
Severity: Medium (availability/storage cost risk)

Evidence:
- `POST /pins/:id/image` requires authentication and verifies ownership of the pin before storing the uploaded object.
- Multer uses memory storage with a 5 MiB file size limit and MIME allow-list for PNG/JPEG/WebP.
- Image contents are checked against file signatures before upload.
- There was no endpoint-specific rate limit before this audit.

Remediation:
- Added `imageUploadLimiter`: 20 uploads per authenticated user per 15 minutes.
- Middleware order is `requireAuth`, then limiter, then Multer parsing, so unauthenticated traffic does not consume the upload buffer and authenticated upload attempts are limited before file buffering.

Residual:
- The limiter is in-memory per process, not a distributed quota. For multi-instance production, use a shared rate-limit store and monitor Storage usage. Account limits do not replace global ingress/body/concurrency limits.

## Controls observed

### Authentication and authorization
- `requireAuth` extracts a single Bearer token, verifies it, checks the user's current `token_version` in the database and fails closed with 503 if the database lookup fails.
- User routes reviewed for projects, boards and pins use authentication; project and pin ownership checks are present in the inspected query paths.
- Admin routes reviewed use `requireAuth` and `requireAdmin`; `requireAdmin` reads `users.is_admin` from the database and denies on lookup errors or missing privilege.
- `PATCH /me/tariff` only permits self-selection when the explicit non-production feature flag allows it; otherwise it checks database admin status.

### Pinterest integration
- Pinterest tokens are retained server-side and encrypted at rest by the dedicated token crypto module.
- OAuth state is signed, purpose-bound and short-lived; callback checks the current user token version and commits through a fenced database RPC.
- Callback redirects to a configured frontend base and a fixed path/status parameter; no request Host or arbitrary return URL is used.
- User-facing Pinterest routes reviewed require authentication; callback is intentionally unauthenticated but state-bound.
- Internal schedule worker requires `PINPOSY_SCHEDULER_SECRET` with minimum 32-byte configured value and constant-time equality after length validation. It is separately rate-limited.

### SSRF and file handling
- `assertPublicUrl` accepts only HTTP(S), rejects embedded credentials, localhost/internal names and non-public resolved addresses.
- All DNS answers are checked; the outbound fetch uses pinned addresses, `proxy: false`, `maxRedirects: 0` and a timeout.
- Image upload checks magic bytes rather than trusting only the client-supplied MIME value.
- Supabase bucket configuration is validated before upload; image lifecycle deletion uses a database claim protocol.

### Billing and webhooks
- Prodamus webhook has a dedicated parser with small body limits and explicit accepted content types.
- Webhook signature verification is performed in the Prodamus module; payment fulfillment relies on the audited atomic/idempotent DB flows.
- Billing health exposes configuration status and callback URL, but no payment secret was found in the inspected response.

### Error handling
- Unknown routes return JSON 404.
- JSON parse and body-size errors map to 400/413; CORS failures map to 403; other errors return a generic 500 response.
- Some server-side error logging includes error objects/messages. Continue redacting tokens, passwords, webhook bodies and personal data; this audit did not find a confirmed bearer-token log in the inspected paths.

## Deployment-dependent risks not changed

1. `app.set("trust proxy", 1)` is only correct if the deployed request path has exactly one trusted proxy hop and direct origin access is blocked or forwarded headers are sanitized. The actual hosting topology must be confirmed before changing it.
2. CORS allows requests without an Origin header for non-browser/server-to-server compatibility. This is not authentication; every sensitive route must continue enforcing its own auth/signature/secret checks.
3. The in-memory rate limiters are not cluster-wide. A multi-instance deployment needs a shared store and a verified proxy/IP strategy.
4. The public `pin-images` bucket is intentional so Pinterest can fetch published image URLs. Anyone possessing an object URL can read that image; this is a product visibility decision, not private storage.
5. The image route's Multer file-size error currently reaches the generic error handler unless caught by route middleware; it may be returned as 500 rather than 413. This is an API error-classification issue, not an upload-size bypass. A future focused change can map Multer `LIMIT_FILE_SIZE` to 413.

## Verification and limits

- Source-reviewed: `backend/index.js`, `backend/admin.js`, `backend/devTopup.js`, `backend/pinterest.js`, `backend/storage.js`, `backend/imageValidation.js`, `backend/publicUrl.js`, `backend/validate.js`, `backend/prodamus.js`, and related dev-top-up tests.
- Re-fetched the modified `backend/index.js` after both route changes.
- No local Node test suite, integration test, load test or production request was run.
- No database migration, secret, provider setting, production service or deployment was changed.
- This is a focused source review, not a formal penetration test or exhaustive proof that every route is free of authorization defects.
