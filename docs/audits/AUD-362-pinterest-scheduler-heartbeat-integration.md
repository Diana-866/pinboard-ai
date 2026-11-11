# AUD-362 — Pinterest scheduler heartbeat integration audit

**Date:** 2026-11-11  
**Status:** migration numbering repaired; integration gap documented; production activation blocked

## Findings

The feature branch contained two distinct files numbered 121:
- `121_atomic_pin_generation_text_plan.sql`
- `121_pinterest_scheduler_health_monitor.sql`

This creates an ambiguous migration order. The monitor migration was moved to `122_pinterest_scheduler_health_monitor.sql`; migration 121 remains unchanged. Database setup documentation now describes the 010–122 sequence and explicitly warns that feature-branch migrations require staging and owner approval.

The branch also contains a pure health summarizer, `backend/pinterestSchedulerHealth.js`, a read-only admin route `GET /admin/operations/pinterest-scheduler`, and tests for summary status classification.

## Critical integration gap

The dedicated worker posts to `/internal/pinterest/schedule/run`. A complete scan of the registered Express routes in `backend/index.js` found no such route. The worker therefore has no matching handler in the current backend source.

The worker also does not call the SQL RPCs `begin_pinterest_scheduler_run` or `complete_pinterest_scheduler_run`. Thus the monitor table cannot receive start/completion heartbeats from the current worker, even if migration 122 is applied. The admin route can read the table but does not make the worker operational.

The scheduler setup guide was corrected: heartbeat is described as prepared but not integrated, and the guide now explicitly prohibits applying migration 122 or enabling the worker/cron in production based on the current state.

## Next engineering work

Implement and test the protected internal scheduler endpoint as a separate task. It must:
1. authenticate the scheduler secret without exposing it in logs or responses;
2. claim at most one due schedule using existing DB fencing/claim RPCs;
3. preserve current publish attempt identity, retry-safe, unknown-outcome and lease-heartbeat semantics;
4. execute the established publication flow rather than introducing a parallel one;
5. record monitor start/completion with a run UUID and aggregate counters, including safe failure completion;
6. reject stale or superseded worker claims and avoid duplicate external publication;
7. have focused unit and PostgreSQL integration tests for no work, success, safe failure, unknown outcome, lost claim, and crash/recovery behavior.

Do not activate until the route, SQL migration, backend and worker are verified on one staging commit.

## Verification limits

- Migration file rename, database docs, scheduler guide and handoff changes are source/documentation only.
- No SQL migration was applied; no live DB query, Pinterest API call, email, payment, or deployment occurred.
- Tests, lint, build and CI were not run.
- PR #4 remains open Draft.


## Correction added in AUD-363

The claim in this report that the internal route was missing was incorrect. The route exists in `backend/pinterest.js` and is registered by `backend/index.js`. See `AUD-363-pinterest-scheduler-route-and-heartbeat-fencing.md` for the verified flow and follow-up completion fencing.
