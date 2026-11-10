# AUD-141 — Pinterest scheduler recovery and cron prerequisites

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`

## Scope reviewed

- `backend/pinterest.js`: authenticated worker endpoint, batch claiming, tariff gate, publication call, durable journal lookup, retry classification, fenced schedule status update, response counters.
- `backend/pinterestSchedule.js` and `backend/test/pinterest-schedule.test.js`: retry policy, immutable snapshot resolution, legacy account recovery and retryability.
- Scheduler SQL migrations: `015–017`, `031–052`, `056–061`; refresh-token migrations `026–028`, `036`, `062`.
- `docs/pinterest/scheduler-setup.md`.

## Confirmed safeguards

1. `claim_due_pin_schedules` claims up to 10 rows in one transaction using `FOR UPDATE SKIP LOCKED`, so concurrent cron invocations do not claim the same due row.
2. Each claimed row receives a UUID `claim_token`. `begin_scheduled_pinterest_publish` checks the current token and the schedule/account/pin/board tuple before creating the durable publication attempt.
3. The attempt journal is created before the external Pinterest create request. If the worker stops after this boundary, recovery conservatively marks the schedule `unknown`, unless a confirmed success is already journaled.
4. A stale claim older than 20 minutes is safely requeued only when no attempt journal exists. Confirmed successes reconcile to `published`; ambiguous attempts are not automatically replayed.
5. The worker verifies the user's effective paid plan, verifies the selected Pinterest board, and uses the saved schedule snapshot for new schedules.
6. Automatic retries are limited to failures explicitly marked `retry_safe`. Retry delay grows exponentially and is capped at 30 minutes; the worker stops after five claimed attempts.
7. The Pinterest HTTP timeout is 10 seconds; the worker processes at most 10 rows sequentially. This is comfortably below the 20-minute stale-claim recovery threshold under ordinary operation, though provider/network stalls and database outages still need operational monitoring.

## Finding and change

The cron setup paragraph listed migrations only through `031–050`, while the same document described later schema/RPC requirements in separate sections. That made the deployment prerequisite ambiguous and risked enabling the worker without the snapshot, legacy-account reconciliation, final schedule recovery, lock-order, or refresh-token fence migrations.

Updated `docs/pinterest/scheduler-setup.md` to make the required migration groups explicit:

- `015–017`
- `026–028`
- `031–052`
- `056–062`

The document now explains that `051` and `052` are required for the described snapshot/recovery behavior, and that `053–055` belong to other subsystems. It also clarifies that a lost cron HTTP response should be reconciled against the schedule and attempt journal, and that `unknown` must never be automatically changed back to `scheduled`.

## Operational status and limits

- The repository documentation states that the external cron is not configured in production and migrations `015–017` have not been applied to the working database. This audit did not access or change production infrastructure.
- No migration was applied, no cron secret was created or changed, no Pinterest request was sent, and no deployment occurred.
- Node tests, PostgreSQL integration SQL, build, lint, and CI were not run as part of this audit.
- Monitoring/alerting for overdue `publishing` rows and unresolved `unknown` rows remains an operational follow-up; the database recovery path prevents unsafe duplicates but does not itself notify an operator.
