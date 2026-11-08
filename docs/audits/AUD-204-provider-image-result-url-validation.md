# AUD-204 — Validate provider image result URLs before marking success

## Finding

The image-result parser accepted any non-empty string as a provider result URL. The storage rehosting path later requires an absolute HTTPS URL and rejects other schemes. This meant a malformed or HTTP-only provider response could be journaled as a successful, billable provider outcome before storage rejected it. Recovery would then keep retrying the same unusable URL instead of treating the response as invalid at the provider boundary.

## Change

- `imageTaskResult` now parses the provider URL with the platform URL parser.
- It accepts only absolute HTTPS URLs with a hostname.
- URLs containing embedded username/password credentials are rejected.
- The normalized URL is returned to downstream storage code.
- Added regression tests for HTTP, javascript, credential-bearing, malformed, and valid HTTPS URLs.

## User impact

A provider response that cannot be safely downloaded by the image-storage layer is no longer silently treated as a valid generated image. This catches malformed results earlier and keeps the storage boundary's HTTPS requirement consistent with provider-result validation.

## Verification

- Source and regression tests were reviewed on the feature branch.
- Automated Node tests were not executed in this environment; dependencies and a local checkout are unavailable.
- No production environment, database, provider account, payment flow, or deployment was changed.
