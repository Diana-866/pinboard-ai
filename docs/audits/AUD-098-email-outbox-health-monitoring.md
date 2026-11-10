# AUD-098 — Transactional email outbox health monitoring

**Status:** implementation reviewed; no production actions performed  
**Scope:** admin authorization, read-only outbox diagnostics, privacy boundaries, stale lease visibility, regression coverage.

## Summary

The branch already contains a read-only admin endpoint for transactional email outbox health. No duplicate route or schema change was necessary. The endpoint exposes aggregate queue state and a bounded list of exhausted entries without returning recipient addresses or message payloads.

## Implementation reviewed

- `GET /admin/billing/email-outbox` is protected by both `requireAuth` and `requireAdmin`.
- The limit is clamped to 1–100 (default 20).
- `billing.getEmailOutboxHealth` returns counts for `pending`, `sending`, `stale_sending`, and `dead`.
- It reports the oldest pending row's creation time and age.
- Dead-row details are limited to outbox ID, attempts, max attempts, last error code, and timestamps.
- The query does not select `recipient_email` or `payload`.
- The endpoint is read-only; it does not retry, release, delete, or mutate outbox rows.
- Existing test `backend/test/email-outbox.test.js` asserts that recipient email and payload content are absent from the health response.

## Operational interpretation

- `pending`: eligible for retry when `next_attempt_at` is due; not every pending row is necessarily immediately runnable.
- `sending`: currently leased by a dispatcher.
- `stale_sending`: a sending lease whose `locked_until` is in the past; the next claim operation can reclaim it.
- `dead`: retry budget exhausted; requires operator review before any manual recovery.
- An SMTP acceptance followed by a failed database acknowledgement can cause duplicate delivery. The dispatcher uses a deterministic Message-ID, but delivery remains at-least-once.

## Boundaries and follow-up

1. This endpoint is API-level diagnostics, not a dashboard; the frontend admin UI was not verified as consuming it.
2. A `dead` row is intentionally not retried automatically. Before any recovery action, inspect the technical error and determine whether the previous SMTP attempt may already have been accepted.
3. `oldest_pending_at` is based on `created_at`, not `next_attempt_at`; it measures queue age, not exact overdue duration.
4. The one-minute dispatcher interval is process-local and cannot guarantee delivery while the hosting service is asleep.
5. No customer PII, email content, retry action, or live SMTP operation was used in this audit.

## Verification boundaries

- Reviewed: `backend/index.js`, `backend/billing.js`, `backend/test/email-outbox.test.js`, `db/migrations/030_transactional_email_outbox.sql`.
- The privacy regression test was inspected but **not executed**.
- No local checkout or runtime test was performed.
- No Supabase query, SMTP delivery, production deployment, or payment state was modified.
