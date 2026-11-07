# AUD-082 — Image storage and upload lifecycle review

Date: 2026-11-07  
Branch: `feat/persisted-boards-api`

## Scope

Reviewed `backend/storage.js`, `backend/imageValidation.js`, `backend/publicUrl.js`, `backend/pinImageLifecycle.js`, the authenticated `POST /pins/:id/image` route in `backend/index.js`, and the focused image-validation/lifecycle tests.

## Positive controls observed

- The manual image-upload route requires authentication and checks pin ownership before changing the pin.
- Multer uses in-memory storage with a 5 MiB file limit; the backend validates actual file signatures instead of trusting the declared MIME type.
- SVG and arbitrary non-raster payloads are rejected.
- The storage bucket is created with an explicit size limit and MIME allow-list. The upload helper independently checks the image bytes and MIME.
- Provider-image rehosting requires HTTPS, rejects credentials and private/special-use IPs, pins DNS answers for the request, disables redirects and proxy use, applies a timeout, and limits response size.
- Cleanup only considers objects in the configured Supabase project/bucket with service-generated object names. It checks pin, schedule, and generation-journal references before deletion; uncertain or active generation requests prevent deletion.

## Finding fixed

### AUD-082-F1 — GIF generation could fail during persistence and cleanup

The image signature validator and storage bucket allow-list accepted GIF, but `buildPinImageObjectPath()` did not permit a GIF extension. Consequently, a valid GIF returned by an image provider could pass content validation and then fail before upload. The managed-object extractor also did not recognize GIF paths, so even if stored by another path, lifecycle cleanup would leave the object behind.

Fixed on this branch:
- Added GIF to the managed object extension allow-list.
- Added GIF to the managed-object path recognition pattern.
- Added a regression test that builds a deterministic GIF object path and verifies that it is recognized as a managed object.

The direct user-upload endpoint still intentionally accepts PNG/JPEG/WebP only; its error text and MIME filter remain aligned. GIF support is for the provider/storage path, which already advertised GIF support.

## Remaining observations / limitations

- `pin-images` is intentionally created as a public bucket because the application stores public image URLs and needs Pinterest-compatible image URLs. Anyone holding a URL can read that image; do not store private or sensitive user images in this bucket.
- For an already-existing bucket, `ensureBucket()` currently checks the configured size limit but does not verify that its public/private mode and MIME allow-list match the application's expectations. A deployment preflight/admin check should verify those bucket settings in Supabase.
- This was a source review plus a focused regression-test addition. The Node test suite, live Supabase Storage operations, RLS/policy behavior, and production upload flow were not executed in this environment.

## Result

The GIF mismatch is patched. No evidence from this review establishes a cross-user image disclosure vulnerability in the authenticated upload route; the public-bucket behavior is an explicit product choice and should be treated as public content.
