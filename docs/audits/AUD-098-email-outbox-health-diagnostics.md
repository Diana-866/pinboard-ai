# AUD-098 — privacy-safe email outbox health diagnostics

**Status:** implemented on the feature branch  
**Scope:** read-only operational visibility for the durable transactional email outbox.

## Changes

- Added `billing.getEmailOutboxHealth(limit, dependencies)`.
- Added authenticated, admin-only endpoint `GET /admin/billing/email-outbox?limit=20`.
- Endpoint reports counts for `pending`, `sending`, expired-lease `stale_sending`, and `dead` rows.
- Reports the oldest pending timestamp and its age in seconds.
- Returns a bounded list of dead-row metadata: internal row ID, attempt counters, sanitized error code, and timestamps.
- Does not return recipient addresses, email content, outbox payload, payment reference, or subscription/user identifiers.
- The endpoint is read-only: it does not claim, retry, resend, delete, or mutate outbox rows.
- Added a unit regression test that verifies status counts and checks that customer email/payload fields are not exposed.

## Security and operational notes

- Route uses the existing `requireAuth` and `requireAdmin` middleware.
- Existing migration 030 already grants the server-side service role the required SELECT privilege on `email_outbox`; no new database migration is required.
- Limit is clamped to 1–100 (default 20).
- This is diagnostics only. Dead-row recovery remains a separate, deliberate operational action; no automatic resend control was added.
- SMTP delivery remains at-least-once. A duplicate can still occur if SMTP accepted a message but the database acknowledgement was lost.

## Verification boundaries

- Source and test changes were written through GitHub API and should be read back from the feature branch.
- Unit tests and frontend/backend build were not executed in this environment.
- No production database, SMTP provider, customer records, or live payment state was accessed or modified.
- PR was not merged and no deployment was triggered.
