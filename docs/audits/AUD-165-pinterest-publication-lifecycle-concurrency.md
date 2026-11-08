# AUD-165 — Pinterest publication lifecycle and concurrency audit

**Branch:** `feat/persisted-boards-api`  
**Reviewed HEAD:** `88b90815381544f211409c5d1f4291bd32c557b9`  
**Scope:** schedule claim → durable attempt journal → Pinterest create request → local completion; stale-worker recovery; manual positive-evidence reconciliation.  
**Change type:** audit only. No production calls, database writes, migrations, or provider requests were performed.

## Executive result

No confirmed path was found in the reviewed state machine that automatically re-sends a Pinterest create request after an ambiguous outcome. The implementation is deliberately fail-closed: it persists a journal before the external POST, treats transport/timeout/provider-server uncertainty as non-retryable, and requires positive evidence for operator reconciliation.

The most important remaining verification limitation is that the repository's SQL integration tests exercise many state transitions and inspect lock ordering, but do not appear to run competing transactions concurrently against a live PostgreSQL instance. Therefore this is a code/schema audit, not a proof under real database contention.

## Lifecycle trace

1. **Claim.** `claim_due_pin_schedules` bounds claims to at most 10, uses `FOR UPDATE SKIP LOCKED`, increments the schedule attempt counter, and issues a fresh `claim_token`. A stale claim is fenced by clearing/rotating the token before the schedule can be claimed again.
2. **Pre-POST reservation.** Scheduled work enters `begin_scheduled_pinterest_publish`. The current definition locks the Pinterest account before the schedule, verifies the exact schedule ID, owner, pin, account, board, status and claim token, then delegates to `begin_pinterest_publish_v2`. The durable attempt row is created before the HTTP request.
3. **Duplicate prevention.** The account-scoped attempt journal is unique for a pin/account pair. Existing `processing` or `unknown` attempts do not start another create request. A retry is allowed only for a `failed` attempt explicitly marked `retry_safe=true`; consuming that retry clears the marker.
4. **External request.** The worker calls Pinterest `POST /pins` with rate-limit retry disabled. Network failures, timeouts, HTTP 408/429/5xx, missing remote IDs, and failures to persist a returned remote ID are treated as ambiguous and do not become automatically retryable.
5. **Completion.** `complete_pinterest_publish_v2` locks account → all matching active/uncertain schedules in stable order → attempt. It verifies the reserved board and remote publication identity, then records the publication, marks the attempt published, and reconciles matching publishing/unknown schedules in one transaction.
6. **Stale recovery.** A stale publishing schedule with a published journal is reconciled to published. A stale schedule with a failed journal is requeued only if that journal explicitly says `retry_safe=true`. A schedule with a processing/unknown journal becomes unknown; a schedule with no journal can safely be requeued because the worker cannot cross the external-POST boundary without first creating the journal.
7. **Operator reconciliation.** Migration 082 accepts only an old unknown schedule and old unknown/processing attempt, with no claim token, exact owner/account/board/remote identity checks, and `retry_safe=false`. It records an append-only audit receipt and marks the publication as published. It has no non-publication action and does not enable retry.

## Concurrency and race review

| Race | Guard found | Assessment |
| --- | --- | --- |
| Two workers claim the same due schedule | Row locks with `SKIP LOCKED`, fresh claim token | Guarded |
| Old worker resumes after stale recovery | `begin_scheduled_pinterest_publish` requires the exact current claim token | Guarded before journal reservation |
| Recovery runs before a worker reserves its journal | Schedule row lock serializes claim validation/reservation against stale recovery | Guarded |
| Worker crashes after journal reservation / before response | Existing processing journal becomes unknown; no automatic retry | Fail-closed |
| Pinterest creates a pin but response is lost | Transport/timeout outcome becomes unknown; no automatic retry | Fail-closed; operator verification required |
| Worker returns after schedule became unknown | Completion RPC can persist a confirmed late success and reconcile unknown | Guarded by account/schedule/attempt locks and identity checks |
| Manual reconciliation races with a live worker | Reconciliation requires stale unknown state; it locks account → schedule → attempt and checks current state under lock | State transitions serialize; genuine external evidence remains a human responsibility |
| Conflicting remote pin or board identity | Completion/reconciliation rejects conflicting identity instead of overwriting it | Guarded |
| Disconnect races with scheduled reservation | Account-first lock order is shared by reservation, completion, and account-scoped operations | Lock order is consistent in reviewed definitions |

## Findings and limitations

### AUD-165-01 — No automatic retry path found for ambiguous publication outcomes

The reviewed SQL and JavaScript preserve the durable attempt as the authority. Unknown outcomes are blocked from both automatic and manual retry; only explicit safe rejection evidence can set `retry_safe=true`. This is the correct duplicate-avoidance posture for a create API where the client cannot prove whether a timed-out request was accepted.

### AUD-165-02 — Concurrency verification is not equivalent to a live race test

The integration SQL covers claim fencing, stale recovery, account scoping, retry-safe behavior, disconnect interactions, completion identity checks, and reconciliation guards. Some assertions inspect function-definition lock order. I did not find a test that launches competing database sessions and deliberately interleaves worker completion, stale recovery, disconnect, and operator reconciliation. A future test harness should exercise those races against PostgreSQL, not just run the SQL fixtures sequentially.

### AUD-165-03 — Pinterest's remote create operation has no local exactly-once guarantee

The local journal prevents PinPosy from intentionally issuing a second create request after an ambiguous result. It cannot roll back a remote pin or guarantee exactly-once behavior across a network boundary. The operational policy must remain: unknown means inspect Pinterest and reconcile only with positive evidence; never infer non-publication merely from a missing local confirmation.

### AUD-165-04 — Worker schedule updates are conditional but do not inspect affected-row counts

After `publishPin` has already called the transactional completion RPC, the worker performs a follow-up conditional schedule update using the old claim token. The code checks the Supabase error but not the number of rows affected. The completion RPC is the authoritative state transition, so this does not appear to create a duplicate-publication path; however, the follow-up update can be a no-op after another valid transition while the worker still reports its local result. Consider removing this redundant write or explicitly selecting/counting the affected row and reporting a state conflict. No change was made because the completion RPC already owns the durable transition and changing response semantics needs a focused test.

## Verification status

- Repository/schema inspection: completed for the publication lifecycle and relevant migrations 016–082.
- PostgreSQL integration SQL: inspected, **not executed** in this audit.
- Node tests: **not executed**.
- Pinterest API: not called.
- Production database: not accessed or changed.
- Deploy: not performed.

## Recommended next step

Add a PostgreSQL concurrency test harness that runs two or more sessions and forces the key interleavings: claim vs recovery; completion vs operator reconciliation; completion vs disconnect; and worker late-success vs stale recovery. Until then, retain the existing fail-closed unknown state and do not add automatic retries for ambiguous Pinterest outcomes.
