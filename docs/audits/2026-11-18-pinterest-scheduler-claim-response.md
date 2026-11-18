# Pinterest scheduler malformed-claim fail-closed review

Date: 2026-11-18  
Repository: `Diana-866/pinboard-ai`, branch `main`  
Reviewed baseline: current main source before this change; Pinterest route blob `9fd09a142874a5760893231ec5d2409b4d878799`.

## Finding and root cause

The internal scheduler route called `claim_due_pin_schedules`, checked only the Supabase `error` field, then used `(dueRows || []).length` and iterated over `dueRows || []`. A successful RPC response with `data: null`, a malformed non-array payload, or an unexpected oversized batch was therefore treated as an empty queue and the scheduler run was marked successful. This silently concealed a broken claim contract and left due work unprocessed while monitoring reported a successful idle run.

The route also began processing each returned row without first validating the complete identity required by the schedule lease and publication journal. The normal path later checks identity in some failure handling, but the worker must reject malformed claimed rows before any side effect or heartbeat begins.

A valid empty set from the set-returning PostgreSQL RPC is `[]`; null is not a safe substitute.

## Changes published

- `backend/scheduleResponse.js`: added `isValidClaimedScheduleRows(rows, limit)`. It requires an array, a nonnegative safe-integer limit, no more than the configured batch limit, complete nonblank string identity fields (`id`, `user_id`, `pin_id`, `pinterest_account_id`, `pinterest_board_id`, `claim_token`) and unique schedule IDs.
- `backend/pinterest.js`: validates the RPC result immediately after the claim call and before setting `claimedCount`, starting claim heartbeat, or processing rows. Malformed claim data now fails the scheduler run rather than being reported as an empty queue.
- `backend/test/schedule-response.test.js`: added valid-empty/valid-one-row and malformed/null/non-array/oversized/duplicate/incomplete-identity regression cases.
- `backend/test/pinterest-scheduler-route-contract.test.js`: asserts validation occurs after the claim RPC and before counting or iteration.

Commits:
- Validator: `1acc3aa120a5b073afccf3132b0bf4ea9310f924`; blob `7170f77c44442bdf12a33c4b63996978d8705f80`.
- Unit regression: `fb48f225540f4c2d9fa10251ae9faab4a9bee82c`; blob `c5b4084903e96f5fa808e8fbff31e222a8dfd5f6`.
- Route integration: `793bc081efc6a27c442fe0faa41cacccbde49fa0`; blob `d66d34f9042c55371c2a34ef8e74931b391a9e0c`.
- Route contract: `10f634594a774e963cf02caecfd263546347e094`; blob `d7f8936167432a3444c0f444968318cf5c919b6c`.

## Verification boundary

After publication, re-fetched all four changed files and inspected the relevant code and tests. Confirmed the route validates before count and iteration. Node test execution was not available in this review; do not claim runtime PASS. PostgreSQL scheduler integration tests and live Pinterest calls were not run. No production database, real Pinterest account, real publication, or external service was accessed.

## Next steps

Run `node --test backend/test/schedule-response.test.js backend/test/pinterest-scheduler-route-contract.test.js`, then `node --test backend/test/schedule-worker.test.js backend/test/pinterest-scheduler-health.test.js`, followed by the disposable PostgreSQL scheduler heartbeat, completion-fencing and stale-recovery SQL tests. Keep scheduled publishing and first-user launch blocked until runtime and staging acceptance are complete.
