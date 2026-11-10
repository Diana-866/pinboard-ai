# AUD-386 — Pinterest scheduler worker, leases and restart recovery

**Date:** 2026-11-11  
**Status:** source audit completed; one documentation inconsistency corrected.

## Reviewed components

- backend/scheduleWorker.js and backend/package.json worker entrypoint.
- POST /internal/pinterest/schedule/run in backend/pinterest.js.
- Claim lease renewal in backend/pinterestSchedule.js and migration 114.
- Scheduler monitor migrations 122–123 and health summarizer.
- Claim/recovery SQL migrations 017, 060 and 092.
- Worker, health, route-contract and disposable PostgreSQL integration tests.
- docs/pinterest/scheduler-setup.md.

## Findings

1. **Durable state:** queue rows, claims, attempt journal and publication ledger are in PostgreSQL. The worker process keeps only its polling timer and in-flight request state; restart does not lose queue contents.
2. **Bounded work:** worker and backend both enforce one schedule per HTTP request. Worker prevents overlapping ticks within its own process. Database row locking with SKIP LOCKED, claim token and schedule identity checks fence concurrent workers.
3. **Lease and long-running calls:** schedule claim heartbeat renews every 60 seconds; publication path also checks/renews the exact claim before critical work. A false renewal records lease loss; a transient heartbeat exception is logged without printing provider data. Final writes remain claim-token fenced.
4. **Timeout and restart:** worker HTTP timeout is capped at 15 minutes, below the 20-minute stale-claim window. Shutdown stops new polling and waits at most 20 seconds by default; unfinished work is left to DB stale-claim recovery.
5. **Recovery is evidence-based:** stale claims with no reserved attempt can be requeued. Exact safe-failure journal can be retried only for its recorded destination. A possibly-sent or ambiguous POST remains unknown; a published attempt alone is insufficient without matching publication ledger identity.
6. **Monitor concurrency:** singleton monitor blocks another run while the current run is within its 20-minute window. Run UUID and status='running' fence stale/duplicate completion; migration 123 prevents a lost completion response from overwriting a terminal success.
7. **Health semantics:** admin status distinguishes never seen, running, recent healthy/failed and stale. The public /health endpoint is only API liveness; it is not worker or queue health.
8. **Operational mode:** setup docs correctly require exactly one scheduler mode (dedicated worker OR external cron), same release commit and staging validation before production activation.

## Documentation correction

The setup guide said the worker RPC claims up to 10 rows and immediately clarified that backend enforces one. Corrected the wording to say exactly one row per request. Backend code and SQL were not changed.

## Residual operational risks / requirements

- Scheduler monitor is a single latest-run heartbeat, not an independent process heartbeat. A worker that stops polling is detected only after the last completed run ages past the threshold.
- If the worker HTTP client times out while the backend request continues, the next invocation is blocked by the monitor until the 20-minute run window expires. The per-schedule DB lease and attempt journal remain the safety boundary; this does not prove the backend request itself was cancelled.
- A heartbeat renewal transport error is logged and the worker continues; final claim fencing and publication journal determine the outcome. Operators should monitor stale/unknown schedule counts as well as scheduler heartbeat.
- Exactly one configured scheduler remains the supported operating mode, even though database fencing is designed to prevent duplicate claims.

## Validation limits

Source, migrations and tests were read through GitHub. Node tests, PostgreSQL integration SQL, lint, build, CI, staging and provider dashboard were not run. Migrations 122–123 were not applied to Supabase. No worker was activated; no production DB, Pinterest API, publication, payment or deployment was touched.