# AUD-410 — billing subscription and email-outbox reads fail closed

Date: 2026-11-22  
Base main: `a5a1a3709f028a6a0a2d7629059a7fe647c00d18`

## Finding

Static review of `backend/billing.js` found read paths outside AUD-409 that still converted malformed successful PostgREST results into apparently valid empty/zero data:

- `listUserSubscriptions()` returned `data || []`.
- `listAllSubscriptions()` returned `data || []` for the admin subscription inventory and ignored errors/malformed envelopes from the secondary users/email lookup.
- `getEmailOutboxHealth()` converted null/invalid count values to 0 and converted a malformed dead-row list into an empty list. Its oldest-row queries also used unchecked data envelopes.

The admin UI could show no subscriptions, no dead mail, or zero backlog when the database response was malformed. This can conceal billing reconciliation and email-delivery incidents.

## Changes

- Reused the existing `readArrayQueryResult` validator for subscription lists and the secondary user/email query.
- Added strict count-envelope validation for email outbox health: counts must be non-negative safe integers; missing/malformed counts return HTTP 502 rather than zero.
- Validated oldest-pending, oldest-due and dead-row arrays before deriving health metrics.
- Added an authenticated HTTP regression: malformed successful admin subscription inventory must return 502 and must not proceed to the secondary users lookup.
- Added email-outbox health regression cases for malformed count and dead-row envelopes; both must reject with 502.
- Updated inventory 1442 → 1444 (API authenticated reads 113 → 114; email-outbox tests 5 → 6).

## Commits and blobs

- Backend implementation commit: `63c383029b8e6ff4f3e92d54bd6167b43c745952`
- HTTP regression commit: `b2cd1d445772cd24fbcccb84aff25ec9e5fc136d`
- Outbox regression commit: `6fbcf5bfc68d8268e30e717b5d98903b4160ad19`
- Inventory commit: `0223cb5eec423007fc9c6284f9c5dbd20d6b6d4c`
- `backend/billing.js` blob: `2e3bdb5b8a593487aefea6209d0d35e3cc8e2c4e`
- `backend/test/api-authenticated-reads.test.js` blob: `e901b0958bde330bd31d0446c091a448caf81fcf`
- `backend/test/email-outbox.test.js` blob: `8caff235e2de7a1c17186f179fda0bef8bf6753a`
- `backend/test/test-inventory.json` blob: `5cdd4c950908d5a7d7bc96cf3a8ca5d6661d36b3`

## Verification boundary

- Re-fetched current GitHub blobs after publication.
- Static checks confirmed the shared array validator is used in all affected subscription and outbox list reads, strict count validation is wired into all count queries, and the old fallbacks are absent from `backend/billing.js`.
- Test declaration counts match inventory: API authenticated-read tests 114; email-outbox tests 6; inventory total 1444.
- Node tests were NOT executed. GitHub Actions on the new code/test commits failed before producing steps (runner IDs 0; logs unavailable). No runtime PASS is claimed.
- Vercel status on inventory commit `0223cb5eec423007fc9c6284f9c5dbd20d6b6d4c` was pending at the latest check.

## Safety

No production database, payment provider, email provider, Storage, Pinterest, DNS or deployment was touched.

## Next

Run focused and full backend tests locally under UA-081/UA-080. Continue independent review of financial reconciliation and user-facing payment history; do not infer test or deployment success from source publication.
