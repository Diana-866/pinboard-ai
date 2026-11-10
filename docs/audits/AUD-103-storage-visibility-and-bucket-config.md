# AUD-103 — Supabase Storage visibility and image lifecycle

Date: 2026-11-08
Branch: `feat/persisted-boards-api`

## Scope

Reviewed `backend/storage.js`, `backend/pinImageLifecycle.js`, image upload and schedule routes in `backend/index.js`, migration 070, and image lifecycle tests.

## Confirmed behavior

1. The `pin-images` bucket is intentionally public. The backend uses `getPublicUrl()`, and the URLs are stored in `pins.image_url`, schedule snapshots and generation journals. This is required by the current Pinterest-compatible URL flow.
2. Public means anyone who obtains an object URL can read the image without application authentication. A URL is not an access-control mechanism. Object names contain random or deterministic components but must not be treated as secrets.
3. Public bucket visibility does not by itself grant anonymous upload/update/delete. Backend writes use the Supabase service-role client; no repository migration was found defining a client-side `storage.objects` write policy. The live project's effective Storage policies and grants were not queried, so this is not a claim about current production policy state.
4. The authenticated manual upload route checks pin ownership before uploading and updates the pin scoped by both pin ID and board ID. File signatures are validated; SVG and arbitrary non-raster data are rejected.
5. Provider image rehosting requires HTTPS, resolves and pins public IP addresses, blocks redirects and proxy use, applies a timeout and response-size cap, and validates the downloaded image bytes.
6. Migration 070 adds a database-backed object lifecycle claim. Triggers serialize durable references in pins, active schedules, generation tasks and regeneration journals against upload/deletion. Uncertain Storage outcomes remain fenced rather than being treated as confirmed success.
7. Admin stale-upload reconciliation/quarantine endpoints require both authentication and database-backed admin authorization. They do not expose upload tokens in their HTTP response.

## Finding fixed — existing bucket configuration was not fully verified

Previously, `ensureBucket()` checked the configured file-size limit but did not verify the visibility or MIME allow-list of an already-existing bucket. A drifted bucket could therefore behave differently from the application's assumptions.

Changes in this audit:
- Added `validatePinImageBucketConfiguration()` to `backend/pinImageLifecycle.js`.
- `ensureBucket()` now fails closed unless the bucket is named `pin-images`, is public, has exactly the expected PNG/JPEG/WebP/GIF MIME allow-list, and has a file-size limit of at least 5 MiB.
- Added unit tests for the valid configuration, private/wrong bucket, widened/missing MIME allow-list, and insufficient size limit.

The check is performed when the backend first initializes Storage in a process. It does not continuously monitor configuration changes after the first successful check; a restart is needed to re-run the preflight.

## Security and privacy decision

The current product design intentionally makes pin images public for Pinterest delivery. Users must be told not to upload private, confidential, personal-document or otherwise sensitive images. If PinPosy later needs private user media, it should use a separate private bucket and short-lived signed URLs, not change `pin-images` to private without redesigning Pinterest publication and downstream consumers.

Deleting an object removes its public URL only after Storage confirms deletion; already downloaded copies, browser caches, Pinterest copies and third-party caches cannot be reliably recalled.

## Verification limits

- Source review and regression tests were added; they were not executed in this environment.
- No live Supabase Storage bucket metadata, `storage.objects` RLS policies, grants, public access behavior or anonymous write attempts were inspected.
- No live upload, signed/public URL, delete, cache invalidation or Pinterest fetch was performed.
- No production migration, bucket setting or deployment was changed.

## Next operational verification

Before production release, inspect the actual `pin-images` bucket metadata in Supabase and confirm: public=true, expected MIME allow-list, file_size_limit >= 5 MiB, and no unintended anonymous/authenticated INSERT/UPDATE/DELETE policies on `storage.objects`. Confirm anonymous GET of a known pin URL succeeds, while anonymous upload/overwrite/delete attempts fail.
