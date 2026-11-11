# AUD-194 — Recover completed Storage uploads after a process crash

## Finding

Multi-pin generation persists the provider result URL and price before copying the image into permanent Storage. The deterministic Storage object key is derived from the provider idempotency key. However, if Storage successfully writes and finalizes the object, then the process stops before storage_url is saved to pin_generation_tasks, recovery always tried to download the provider URL again. Provider URLs are temporary; if one expires, an already completed Storage object could not be reused automatically.

## Implementation

- Added migration 089_recover_completed_pin_image_uploads.sql with a service-role-only lookup that derives the deterministic object-key digest and returns a path only when its lifecycle state is active.
- Added findCompletedManagedPinImageUpload: after the database lookup, it independently verifies the exact object filename exists in the pin-images Storage bucket.
- Updated rehostImage to attempt this recovery before fetching the provider URL. When both lifecycle and Storage confirm the object, it returns its public URL directly.
- Lookup errors fall back to the existing safe provider-download and fenced-upload flow; they do not bypass upload reservations.
- Added focused tests for successful lookup, missing Storage object, and untrusted/non-deterministic paths.

## User-visible effect

If PinPosy already copied an image into permanent Storage but crashed before saving its URL in the generation journal, a later recovery can reconnect the existing file to the task even if the temporary provider URL has expired. It avoids a second image-provider create request and avoids downloading/uploading the same image again.

Only objects whose lifecycle upload has already been finalized as active are eligible. An object with an unresolved/in-flight upload reservation is never adopted.

## Verification and scope

- Static review confirms deterministic object keys are based on the same provider idempotency key used by the generation task.
- Added unit tests in backend/test/pin-image-lifecycle.test.js.
- Node tests and PostgreSQL integration tests were not run in this environment.
- Migration 089 has not been applied to Supabase. No production data, deployment, provider call, or PR merge was changed.
