# AUD-208 — Fail closed when a completed image has no public URL

## Finding

The image rehosting flow looked up a completed managed upload before downloading the provider result. If the completed object existed but Supabase did not return a public URL, the previous code could fall through and attempt another upload with the same idempotency key. That is not a safe recovery action: the database has already confirmed ownership of a completed object, and URL construction failure does not mean the object is absent.

## Changes

- Added a single helper for obtaining the public URL of an already-managed image.
- If a completed object is found but the URL is missing, the backend now returns HTTP 503 and asks the caller to retry later.
- Separated completed-object lookup errors from public URL errors so the caller receives the correct diagnostic path.
- Applied the same fail-closed behavior to both the original deterministic key and the bounded recovery keys.
- Added a regression test asserting that a completed object with an unavailable public URL does not trigger a second upload.

## User impact

A temporary URL-construction problem can no longer cause PinPosy to re-upload an image that is already recorded as completed. The request remains retryable and does not silently create another storage operation.

## Verification limits

The code and regression test were committed to the feature branch. Tests were not executed in this environment because a local checkout and installed dependencies are unavailable. No deployment, production database operation, Storage mutation, or migration was performed.
