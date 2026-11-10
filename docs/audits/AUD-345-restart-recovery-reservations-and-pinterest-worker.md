# AUD-345 — Restart recovery: credit reservations and Pinterest scheduler

**Date:** 2026-11-11  
**Status:** SOURCE REVIEW + REGRESSION TEST COMMITTED  
**Runtime validation:** not executed

## Multi-pin generation reservation lifecycle

Reviewed migrations 054, 065, 088 and 045/046 plus the current generation route.

- Credit reservation is unique per (user, idempotency key), serialized under the user row lock, and subtracts all active reservations from spendable balance.
- Exact provider quotes resize the active reservation before image submissions.
- Completion locks user/request/reservation, checks the claim token and reserved ceiling, inserts pins and debits actual cost in one transaction; completion moves the reservation to settled.
- Definitive failure releases the reservation.
- Unknown outcome with no durable image-task rows releases unused image credits: the image plan is persisted before the first image provider call.
- Unknown outcome with one or more durable task rows retains the reservation. This is intentional: at least one image provider submission may already have been accepted and its cost/result may still be unresolved.
- There is no TTL auto-release for reservations backing unknown task rows. Automatic expiry could permit the user to spend credits that may still be owed to a provider. Such rows require reconciliation, not blind release.

## Pinterest scheduled publication after process restart

Reviewed `backend/pinterest.js`, `backend/scheduleWorker.js`, `backend/pinterestSchedule.js`, and migrations 092/114/119.

- External worker polls the authenticated backend endpoint; server clamps each run to one schedule.
- A live claim is renewed every 60 seconds; stale claims older than 20 minutes are reconciled.
- Stale success is promoted to published only when attempt and publication ledger match owner, pin, account, board and remote Pinterest ID.
- A confirmed safe rejection can be requeued only for the exact original destination. Ambiguous or mismatched outcomes remain unknown/non-retryable.
- A known remote Pinterest Pin ID is retained if local completion cannot be confirmed, preventing duplicate publication.
- Worker process shutdown uses a bounded drain; unfinished work remains in PostgreSQL for fenced recovery.

## Operational dependency

The source tree contains a dedicated worker and scheduler setup documentation, but repository inspection cannot prove that the worker is currently deployed, continuously running, or has correct production secrets. If the external worker is absent, due schedules remain queued; this does not create duplicate posts, but automatic publishing is unavailable. Production worker health must be checked in the hosting control panel and logs.

## Additional regression test

Added a provider-boundary test asserting that malformed text output still records the successful GPTunnel usage fact, while quote and image-provider work are never reached.

## Safety decision

Do not introduce time-based release for unknown image-task reservations. Do not retry unknown Pinterest publication attempts unless exact durable evidence marks the previous attempt safe. Both policies prioritize preventing double charges and duplicate remote posts over automatic recovery.

## Validation and scope

- Source/test/report readback performed.
- Node tests, SQL integration, lint, build, CI, and production worker checks were not run.
- No live database/provider calls, payments, merge, or deployment were performed.
