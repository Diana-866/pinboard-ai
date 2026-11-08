# AUD-207 — Recover quarantined generation uploads on fresh stable paths

## Finding

Generation image object paths are deterministic from the provider idempotency key. This is valuable for idempotency, but a stale upload path is permanently quarantined when its remote Storage outcome is ambiguous. A later retry then hits the same retired path and cannot persist an otherwise valid, already-paid provider result.

## Changes

- The Storage layer now preserves a machine-readable `path_quarantined` code when mapping the conflict to HTTP 409.
- When (and only when) the original deterministic path is quarantined, rehosting tries up to three deterministic recovery paths derived from the original provider idempotency key.
- Before writing each recovery path, the backend checks whether the same recovery key already has a completed managed upload. This lets a retry after a process crash reuse the already-saved image rather than upload it again.
- Each recovery path has its own lifecycle reservation. A path that is still uploading, referenced, or otherwise unavailable remains a hard stop; the code does not skip active conflicts or reuse quarantined paths.
- The provider image is downloaded once and reused for the bounded recovery attempts; no new billable image-generation task is submitted.

## User impact

If an image upload path was permanently quarantined after an ambiguous Storage failure, PinPosy can now save the existing generated image at a fresh managed path. The user does not need to pay for another AI generation merely because the first Storage path became unusable. If the process crashes after the fallback upload completes, the next retry can find that same completed fallback by its stable key.

## Regression coverage

- Simulates the original deterministic path being quarantined.
- Verifies the backend selects a distinct, deterministic recovery path.
- Verifies the fallback URL points to the fresh path.

## Safety boundaries

- Recovery is attempted only for the explicit `path_quarantined` outcome.
- Other errors (including upload-in-progress, referenced, database lookup failures, and Storage failures) are propagated.
- At most three recovery slots are attempted.
- No lifecycle state is forcibly finalized or unquarantined.

## Verification limits

Changes and regression coverage were committed to the feature branch. Node tests were not executed in this environment because a local checkout and installed dependencies are unavailable. No deployment, production database operation, Storage mutation, or migration was performed.
