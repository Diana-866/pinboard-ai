# AUD-159 — Pinterest scheduled publishing recovery and operational visibility

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`  
Reviewed HEAD before this audit entry: `90a0affdbcf2be793052968c38b526f23d4f3288`

## Scope

Reviewed the current scheduler worker in `backend/pinterest.js`, the pure retry/snapshot policy in `backend/pinterestSchedule.js`, scheduler migrations `034`, `047`–`052`, `056`–`061`, `081`, and `082`, the worker setup guide, and the PostgreSQL/operator reconciliation tests.

## Confirmed safety properties

1. The worker endpoint requires a dedicated secret of at least 32 bytes and uses constant-time comparison. It is additionally rate-limited.
2. `claim_due_pin_schedules` caps each claim batch at 10 and uses `FOR UPDATE SKIP LOCKED`. Each claimed schedule receives a fresh UUID `claim_token`.
3. Before a scheduled Pinterest POST, `begin_scheduled_pinterest_publish` checks the exact schedule ID, user, pin, account, board, status, and current claim token. The account -> schedule -> attempt lock order is preserved by migration 061.
4. The durable publish-attempt journal is created before the external POST. Once the journal exists, stale recovery does not blindly requeue the request. It reconciles an already-confirmed success, preserves a journaled safe failure only when `retry_safe=true`, and otherwise moves the stale schedule to `unknown`.
5. A schedule with no journal can be safely requeued after a stale claim because the external create request has not crossed the journal boundary. Fencing prevents an old worker from creating a new attempt after its claim has been revoked.
6. Retry policy is fail-closed: unknown/processing attempts are not retried; a failed attempt is retryable only when the database explicitly records `retry_safe=true`. Retries are capped at five claims with exponential delay capped at 30 minutes.
7. New schedules publish an immutable snapshot of title, description, image, and resolved destination. Later edits to the live pin do not silently change an already-approved scheduled publication.
8. The final completion RPC verifies the exact reserved Pinterest board, serializes account/schedule/attempt updates, and reconciles matching active/unknown schedules to `published`. Migration 082 adds a narrow, append-only, positive-evidence-only admin reconciliation path for stale unknown schedules; it cannot declare non-publication or authorize a retry.
9. The integration SQL covers board identity mismatch, positive reconciliation, exact replay, altered replay rejection, append-only journal behavior, and stale/fresh eligibility boundaries. The workflow applies migrations through 082 and invokes these integration scripts.

## Findings / remaining operational risks

### AUD-159-A — no automated alerting for overdue or unknown schedules found

The worker returns per-run counters for `published`, `failed`, `scheduled`, and `unknown`, and logs failures. The reviewed scheduler setup documentation explicitly says the external cron is not configured in production and that monitoring/alerting for overdue `publishing` and unresolved `unknown` rows remains a follow-up.

The database safety design prevents unsafe duplicate publication, but it does not itself ensure an operator sees a stuck queue. Once cron is enabled, production readiness requires an external monitor that checks at least:
- due rows remaining in `scheduled` beyond the agreed lateness threshold;
- stale `publishing` rows beyond the 20-minute recovery threshold;
- `unknown` rows awaiting manual reconciliation;
- repeated worker HTTP failures / missing cron heartbeats.

This is an operational readiness gap, not a confirmed duplicate-publication defect. Do not enable the cron until the required migrations, encryption key, Pinterest access level, and monitoring are all verified.

### AUD-159-B — worker conditional updates do not verify affected-row count

After publication completion, the SQL completion RPC can already transition the schedule to `published` and clear its claim token. The worker then performs a best-effort REST update filtered by `status='publishing'` and the old claim token. Supabase may return no error when that conditional update affects zero rows; the worker currently reports the expected status without distinguishing zero affected rows from a successful update.

The database completion RPC is authoritative, so this is not a confirmed state-integrity or duplicate-publication defect. However, the worker's per-run result can be less precise if a claim was concurrently revoked or the schedule was already reconciled. A future hardening change should request returned row IDs (or use a narrow RPC) and explicitly handle zero-row updates as "claim no longer current; reread authoritative schedule state".

## Verification limits and production status

- Source-level review only. Node tests, PostgreSQL integration scripts, build, and CI were not executed in this audit.
- GitHub workflow definitions include the relevant migration and integration-test steps, but that is not evidence the current HEAD has passed them.
- The repository's setup guide says the external cron is not configured in production and migrations 015–017 are not applied to the working database. This review did not access production to independently verify those statements.
- No production database, cron configuration, OAuth token, Pinterest API, or deployment was changed. No publication was sent. PR #4 remains open and must not be merged without explicit approval.

## Recommended next work

1. Add a small, read-only admin/monitoring report for overdue and unknown schedules, with no retry side effects.
2. Add an external heartbeat/alert for cron runs and queue age before enabling automatic publication.
3. Make worker conditional updates report whether the claim token actually matched, then add a regression test for zero-row/stale-token behavior.
4. Only after these checks, perform a controlled end-to-end publication test on a dedicated Pinterest test board.
