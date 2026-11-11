# AUD-217 — Treat malformed Pinterest token expiry as requiring reauthorization

## Finding

The public account projection previously marked a token as needing reauthorization only when a parsed expiry timestamp compared earlier than the current time. A non-empty malformed timestamp parses to `NaN`; the comparison is false, so the UI could incorrectly show the account as healthy.

## Change

- Added `isPinterestReauthRequired` in `backend/pinterestPublicAccount.js`.
- A refresh state of `uncertain` remains a reauthorization condition.
- A valid past expiry requires reauthorization.
- A malformed non-empty expiry also requires reauthorization (fail closed).
- A missing expiry remains neutral; this change does not invent an expiry for legacy rows.
- Added tests for malformed, missing, expired, and future expiry metadata.

## User impact

If an account row contains a corrupted expiry value, PinPosy no longer silently presents it as healthy. The existing account card can show its reauthorization warning, prompting the user to reconnect instead of discovering the issue during publication.

## Validation limits

- Changed files were re-fetched from the feature branch.
- Unit tests, backend build/lint, and integration tests were not executed in this environment.
- No live Pinterest request, production database write, deployment, or PR merge was performed.
