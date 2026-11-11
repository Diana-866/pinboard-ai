# AUD-361 — background worker and queue observability

**Date:** 2026-11-11  
**Status:** source implementation + migration 122; runtime/database validation pending

## Scope and existing observability

- `GET /health` returns `{ ok: true }` and is API liveness only; it does not prove DB, SMTP, Pinterest API, worker activity or queue freshness.
- `GET /admin/pinterest/schedules` is authenticated/admin-only and read-only. It classifies overdue scheduled rows, stale publishing rows (20-minute boundary) and unknown outcomes; it does not claim, retry or publish.
- `GET /admin/billing/email-outbox` is authenticated/admin-only and privacy-safe. It reports pending/sending/stale/dead counts, bounded dead-row metadata and age metrics without recipient email or message payload.
- `billing.getEmailOutboxHealth` includes `due_pending`, `oldest_due_pending_at` and `oldest_due_pending_age_seconds`; these distinguish due retries from pending rows still waiting for backoff. The original pending count and oldest-created timestamp remain for compatibility.
- The subscription email dispatcher runs in-process on a one-minute timer and on payment callbacks. A sleeping/stopped API can delay retries.
- Pin image retention has an admin-triggered processing endpoint and blocked-queue inventory, not an independently supervised always-on worker. `pin_review_queue` is intentionally a human-review queue.
- The Pinterest worker polls every 30 seconds by default, claims one row per request and had no durable invocation heartbeat before this change.

## Durable Pinterest scheduler heartbeat

- Added `db/migrations/122_pinterest_scheduler_health_monitor.sql` (migration 121 already exists for atomic pin-generation text plan; the heartbeat migration therefore uses 122).
- The migration creates a singleton monitor record and service-role-only `begin_pinterest_scheduler_run` / `complete_pinterest_scheduler_run` RPCs. It stores only run UUID, timestamps, status, aggregate counters and a fixed error code.
- `POST /internal/pinterest/schedule/run` is registered by `backend/pinterest.js` through `registerRoutes`, called from `backend/index.js`. After scheduler-secret authentication it records run start, performs the existing claim-fenced schedule flow, then records aggregate completion counters.
- The begin RPC refuses to overwrite a currently running record until its 20-minute safety window expires. Completion is fenced by run UUID so a delayed older run cannot overwrite a newer monitor record.
- Added admin-only, read-only `GET /admin/operations/pinterest-scheduler`, backed by `backend/pinterestSchedulerHealth.js`.
- Statuses: `not_seen` (no invocation after migration), `running` (less than 20 minutes since start), `healthy` / `failed` (completed within 3 minutes), and `stale` (completed more than 3 minutes ago or a run still active after 20 minutes).
- Added `backend/test/pinterest-scheduler-health.test.js` for never-seen, healthy, failed, long-running and stale summaries.
- Updated scheduler setup and database migration instructions through migration 122.

## Privacy and safety boundaries

- Heartbeat data excludes user IDs, pin/board IDs, Pinterest remote IDs, access/refresh tokens, request bodies, provider payloads and arbitrary exception text.
- Admin health routes require authentication and administrator authorization; they are not public probes.
- The heartbeat proves that the protected scheduler endpoint was invoked. It does not prove Pinterest API availability, does not replace schedule queue-age/unknown reconciliation, and is not an independent OS-process heartbeat.
- Keep exactly one scheduler mode enabled (dedicated worker OR external cron); do not add a second scheduler merely to generate heartbeat traffic.

## Validation limits

- Changed source, docs and migration were read back from the feature branch; the internal route registration and RPC calls were verified by source inspection.
- Runtime tests, SQL execution, lint, build, CI, production configuration, live heartbeat and external monitoring were not run.
- Migration 122 has NOT been applied to Supabase. No production query/write, SMTP delivery, Pinterest API/OAuth, payment action, deployment or provider setting change occurred.
- PR #4 remains open and Draft. Vercel's latest known status was `build-rate-limit`; no passing CI is claimed.
