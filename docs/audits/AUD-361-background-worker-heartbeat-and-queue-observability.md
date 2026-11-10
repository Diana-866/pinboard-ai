# AUD-361 — durable worker heartbeat and background queue observability

**Date:** 2026-11-11  
**Status:** IMPLEMENTED IN SOURCE + MIGRATION 121  
**Runtime / database validation:** pending

## Existing monitoring reviewed

- `GET /health` is a liveness response only (`{ ok: true }`); it does not verify database connectivity or background worker activity.
- `GET /admin/billing/email-outbox` already provides privacy-safe counts for pending/sending/stale/dead messages, oldest pending age, and bounded dead-row diagnostics. It excludes recipient email and payload. Delivery is driven by an in-process one-minute timer plus payment callback dispatch; a sleeping/stopped API process can delay retries.
- Pin image retention already has an admin-triggered processing endpoint and a read-only blocked-queue inventory. It is not an independently supervised always-on worker in the inspected source.
- `pin_review_queue` is a human review queue, not an autonomous publication worker; entries must remain pending human approval.
- Pinterest scheduled publication had no durable invocation heartbeat. A successful API liveness check did not prove that the external scheduler was calling its protected endpoint.

## Implementation

- Added `db/migrations/121_pinterest_scheduler_health_monitor.sql` with a singleton monitor row and two service-role-only RPCs: `begin_pinterest_scheduler_run` and `complete_pinterest_scheduler_run`.
- The internal Pinterest schedule endpoint records a UUID run identity after secret authentication, marks the run as running, then stores final aggregate counts and success/failure. It does not store user IDs, pin/board IDs, tokens, request bodies, provider payloads, or arbitrary error text.
- Run completion is fenced by the latest run UUID. A stale/overlapping completion cannot overwrite the current run's monitor record.
- The begin RPC refuses to replace a currently running record until its 20-minute safety window expires, preventing accidental overlapping scheduler invocations from being treated as healthy parallel runs.
- Added admin-only, read-only `GET /admin/operations/pinterest-scheduler` returning status, last start/completion timestamps, age, aggregate counters and a fixed error code.
- Added `backend/pinterestSchedulerHealth.js` and unit tests for never-seen, healthy, failed, long-running and stale states. Completed-run freshness threshold is 3 minutes; an in-progress run is allowed up to 20 minutes, aligned with the scheduler claim recovery window.
- Updated `docs/pinterest/scheduler-setup.md` and `docs/database.md` to include migration 121 and explain monitoring semantics.

## Interpretation and limitations

- `not_seen`: no scheduler invocation has been recorded after migration 121.
- `running`: a recent invocation started but has not completed; after 20 minutes it becomes `stale`.
- `healthy` / `failed`: most recent invocation completed within 3 minutes, with the corresponding outcome.
- `stale`: last completed invocation is older than 3 minutes, or an in-progress invocation exceeded 20 minutes.
- This heartbeat proves the protected scheduler endpoint was invoked; it does not prove Pinterest itself is available, and it is not a separate OS-process heartbeat. Queue age and unknown publication records must still be monitored independently.
- Migration 121 must be applied to staging and validated before any production rollout. It has NOT been applied to Supabase.

## Validation and scope

- Source files and migration were read back from the feature branch; function grant signatures and the overlap fence were checked.
- Runtime tests, SQL execution, lint, build, CI and production dashboard/heartbeat checks were not run.
- No production requests, logs, SMTP, payments, Pinterest API/OAuth, database writes, deployment, merge or provider settings were changed.
- PR #4 remains open and Draft. Latest Vercel status previously reported `build-rate-limit`; no passing CI is claimed.
