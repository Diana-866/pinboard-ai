# Pinterest scheduler operations and restart recovery — AUD-386

## Normal operation

- Run exactly one scheduler mode: dedicated worker service or external cron.
- Keep the worker and backend on the same release commit.
- Dedicated worker entrypoint: npm run worker in the backend package.
- Worker defaults to a 30-second poll interval and one schedule per request.
- Monitor GET /admin/operations/pinterest-scheduler together with overdue scheduled, stale publishing and unknown queue rows. The public /health endpoint is API liveness only.

## Worker restart or timeout

1. Do not manually replay the timed-out POST.
2. Check scheduler heartbeat and the exact schedule row, claim token, attempt journal and publication ledger.
3. A fresh publishing lease is still owned by a worker; do not force-release it.
4. After the 20-minute stale window, let the normal claim/recovery RPC classify the record. A pre-POST claim may be requeued; an ambiguous POST remains unknown; an exact safe-failure journal may authorize a retry.
5. If a published attempt and matching ledger exist, normal positive-only reconciliation can restore the schedule.
6. Investigate stale/unknown records through the documented operator inventory and reconciliation flow.

## Safety

- Never enable dedicated worker and external cron together.
- Never change unknown to scheduled manually.
- Never delete/rotate claim tokens or publication attempts by hand.
- Do not apply migrations 122–123 or enable production scheduling until staging tests and explicit owner approval.