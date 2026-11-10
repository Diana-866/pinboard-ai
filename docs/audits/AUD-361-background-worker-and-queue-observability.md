# AUD-361 — background worker and queue observability

**Date:** 2026-11-11  
**Status:** source-level review; email queue diagnostics improved; external monitoring still required

## Scope

Reviewed the API liveness route, dedicated Pinterest scheduler worker, read-only Pinterest schedule inventory, transactional email outbox health endpoint, related tests, migration 030, and scheduler operations guide.

## Existing observability

- `GET /health` returns `{ ok: true }` and is a process liveness response only. It does not prove database connectivity, SMTP availability, Pinterest API availability, worker activity, or queue freshness.
- `GET /admin/pinterest/schedules` is protected by authentication and administrator authorization. It uses a bounded, read-only RPC and classifies overdue scheduled rows, publishing rows stale for 20 minutes, and unknown outcomes. It does not claim, retry, or publish.
- `GET /admin/billing/email-outbox` is protected by authentication and administrator authorization. It reports aggregate states and bounded dead-row metadata without recipient email or payload.
- The dedicated worker polls every 30 seconds by default, sends one claim per request, and logs per-run counters or a safe failure event. It has no HTTP health listener or durable heartbeat of its own.

## Change

Extended `billing.getEmailOutboxHealth` with:
- `due_pending`: pending rows whose `next_attempt_at` is already due;
- `oldest_due_pending_at`;
- `oldest_due_pending_age_seconds`.

The existing `pending` count and `oldest_pending_at` remain unchanged for compatibility. This distinction matters because a pending row may be intentionally waiting for its retry backoff; creation age alone is not evidence that it is overdue.

Updated `backend/test/email-outbox.test.js` to cover the new due metrics while retaining assertions that customer addresses and message payloads are not exposed.

## Operational gaps and safe recommendations

1. Monitor API liveness separately from queue state. A green `/health` response must not be treated as proof that background jobs are running.
2. For the selected single scheduler deployment, monitor worker log freshness or configure an external heartbeat check. The repository does not currently persist a worker heartbeat, and this audit does not configure an external provider.
3. Alert on Pinterest `unknown` outcomes for operator reconciliation; investigate `stale_publishing` after the existing 20-minute classification boundary; alert on `overdue_scheduled` rows after a service-specific lateness tolerance is agreed.
4. For email, alert on `dead > 0` and `stale_sending > 0`; use `due_pending` and `oldest_due_pending_age_seconds` rather than total pending count or creation age to detect delayed delivery. Thresholds must account for retry backoff and hosting sleep.
5. Do not expose admin diagnostic endpoints publicly or add a second scheduler merely to generate heartbeat traffic. Keep exactly one scheduler mode enabled.

## Verification limits

- Source and test changes were read back from the feature branch.
- Node tests, lint, build, CI, production configuration, and external monitoring provider were not run or changed.
- No database migration/schema change, live Supabase query, SMTP delivery, Pinterest API call, payment action, or deployment occurred.
- PR #4 remains open and Draft.