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

### AUD-165-04 — Redundant worker completion UPDATE removed

The audit found that `publishPin` calls `complete_pinterest_publish_v2`, which already atomically marks matching active/uncertain schedules as `published`, stores the remote pin ID and clears the claim token. The worker then attempted a second conditional UPDATE requiring the old `status='publishing'` and old claim token. That predicate is already false after the completion RPC, so the second UPDATE normally affected zero rows while the worker still reported success.

**Resolved on this branch:** the redundant worker UPDATE has been removed. The completion RPC is now the single authoritative transition. The PostgreSQL integration fixture was strengthened to assert that completion stores the remote ID, sets `published_at`, clears `claim_token`, and leaves failed historical schedules unchanged. The SQL test has not yet been executed in this audit.


### AUD-165-05 — PostgreSQL race regression added

Added `backend/test/pinterest-publication-concurrency.sh` and wired it into `.github/workflows/atomic-payment-integration.yml`. The script creates an isolated fixture, holds the Pinterest account row lock, starts worker completion and administrator reconciliation in separate PostgreSQL sessions, confirms both are waiting on the same lock, then checks the final durable state.

Both operations use the same externally confirmed remote pin identity. Either serialized winner is acceptable: completion may publish first and cause stale reconciliation to reject, or reconciliation may record the operator receipt first and completion may finish idempotently. In both cases the expected final state is one published schedule, no claim token, one matching publication row, and one published attempt; the operator receipt may exist zero or one time.

The new concurrency script is wired into CI but has **not yet been observed executing successfully**. A green workflow run is still required before treating this race as verified.
- Follow-up review found that the append-only reconciliation receipt trigger would reject fixture cleanup if the operator path won the race. The script now disables only that mutation trigger briefly while deleting its isolated CI fixture, then immediately re-enables it. This requires the disposable CI database owner (the workflow uses `postgres`); it does not alter the migration or production permissions.
- Cleanup correction committed as `d222be2c3c24cff9ad2ca960fb1fd542730f1c3b`. At this HEAD, GitHub returned no PR workflow runs; the combined status contains only Vercel `failure` (`build-rate-limit`). PostgreSQL concurrency test remains unexecuted/unverified.
- Extended the same CI script with a second independent race: a late `complete_pinterest_publish_v2` call versus `claim_due_pin_schedules` stale recovery. Both contenders are forced to wait on the same schedule row; after release, the assertion requires one published schedule, cleared claim token, matching published attempt, and exactly one publication row. This tests both valid serialization orders without calling Pinterest. Added in `5e192de6d1cd833ac608ecb28a279fc359bec8ee`; execution remains pending.
- On audit HEAD `4dbd8d3a2eb503eb67975da696834481d2fb2672`, all three PR workflows were created and immediately failed before runner startup (`runner_id=0`, `steps=[]`): atomic payment integration, persisted boards integration, and Prodamus webhook tests. This is infrastructure/runner-level evidence, not a test assertion failure; neither new concurrency case has executed. Vercel check remains `build-rate-limit`.

## Verification status

- Repository/schema inspection: completed for the publication lifecycle and relevant migrations 016–082.
- PostgreSQL integration SQL: inspected, **not executed** in this audit.
- Node tests: **not executed**.
- Pinterest API: not called.
- Production database: not accessed or changed.
- Deploy: not performed.

## Recommended next step

Extend the new PostgreSQL concurrency harness to cover the remaining interleavings: claim vs stale recovery; completion vs account disconnect; and late worker success vs stale recovery. The completion vs operator-reconciliation race now has a dedicated CI script, but still requires a green run. Until all critical races are exercised successfully, retain the existing fail-closed unknown state and do not add automatic retries for ambiguous Pinterest outcomes.


### AUD-165-06 — Disconnect after reservation does not cancel a prepared POST

**Finding: documented race window; no claim of hard cancellation.** The SQL reservation and disconnect operations serialize on the Pinterest account row. If disconnect commits first, the reservation rejects and no attempt is created. If reservation commits first, the attempt is durable and the reservation transaction releases its account lock before the external request.

The backend then calls `withAccount()`, which re-reads the active account and obtains the token before calling `executeWithAccountToken()`. This blocks the common case where disconnect has already committed before that read. However, there is still a time-of-check/time-of-use interval between the active-account read/token selection and the actual `POST /pins`. A disconnect can commit in that interval; the already-read token can still be passed to the HTTP handler. The disconnect RPC clears credentials in PinPosy and fails future queued schedules, but does not revoke the provider token at Pinterest.

Therefore the actual guarantee is narrower than “disconnect cancels every not-yet-sent publish”: disconnect that wins before reservation prevents the attempt; disconnect after reservation prevents later account reads and future queued work, but cannot guarantee cancellation of a request whose token has already been read or whose HTTP request is already in flight. The durable attempt journal still prevents an ambiguous request from being automatically replayed.

**Disposition:** no code change made in this audit. Holding a database row lock across a remote HTTP request would make provider latency/timeout part of a database transaction and is not an acceptable default fix. A final pre-send state check can shrink, but cannot eliminate, the race. If product semantics require strict cancellation, design a separate revocation/cancellation protocol and define its linearization point; do not describe local disconnect as an atomic cancellation of external publication. UI/help text should say that a publication already starting may still complete after disconnect.

**Coverage note:** `backend/test/pinterest-account-publication.integration.sql` verifies the disconnect-first case (disconnect commits, then reservation is rejected) and verifies that disconnect leaves an already-publishing schedule for journal reconciliation. It does not test or prove cancellation after the backend has read the access token. The concurrency harness currently covers completion/reconciliation and completion/stale-recovery races, not this external HTTP boundary.


### AUD-165-07 — OAuth reconnect after disconnect and stale callback fencing

**Finding: no credential-resurrection path identified in the reviewed SQL flow.** OAuth attempts are single-use and generation-fenced per PinPosy user. `begin_pinterest_oauth_attempt` increments the durable generation and replaces the current attempt ID. The callback exchanges the provider code and fetches the Pinterest profile before persistence, but the final `commit_pinterest_oauth_attempt_v2` locks the OAuth connection-state row and verifies generation, attempt ID, token version, expiry, and current user/session version before writing credentials. A stale callback therefore cannot commit after a newer attempt or disconnect has invalidated its generation.

`disconnect_pinterest_account_v2` also updates the same per-user OAuth state row, increments generation, clears the active attempt, deletes the account refresh lease, and then clears the account credentials. This uses the same state-row serialization point as the callback. If callback commits first, the later disconnect clears the credentials; if disconnect wins first, the callback sees a stale generation and cannot restore them. The existing `backend/test/pinterest-oauth-concurrency.sh` exercises both contenders waiting on the shared state-row lock and verifies that the final account remains disconnected with null credentials and no active OAuth attempt.

Reconnect of the same Pinterest identity is intentionally supported: `commit_pinterest_oauth_attempt_v2` upserts by (user_id, pinterest_user_id), reactivating the stable row. The integration fixture checks that reconnect returns the same account ID. Missing replacement refresh token/expiry are preserved rather than overwriting known values with null. Refresh-token rotation uses a separate account-scoped lease and fencing checks; the fixtures cover stale refresh completion after disconnect and reconnect during an in-flight refresh.

**Scope and caveats:** the OAuth generation is per PinPosy user, not per Pinterest account. Starting a new OAuth attempt or disconnecting one account invalidates any other in-flight OAuth attempt for that user. This is consistent with the schema comment and “one in-flight link attempt at a time” design, but it should remain explicit in product behavior. Provider authorization-code exchange and profile lookup happen before the final database fence; an invalidated callback may still consume a one-time code or make a read-only profile request, but cannot persist credentials. The local disconnect flow clears PinPosy credentials; it does not demonstrate that Pinterest's own provider-side authorization has been revoked.

**Disposition:** no code change made. Existing SQL and shell regression coverage is relevant, but its actual CI execution is still unconfirmed. Do not claim the race test passed until a runner executes it successfully.


### AUD-165-08 — Migration entrypoint ambiguity and current PR readiness

**Finding: the repository documents two incompatible fresh-database migration entrypoints.** The tree contains both `001_base_schema.sql` and `001_baseline.sql`. The former is the legacy first step in the old `001 → 008` chain. The latter describes itself as a complete baseline replacing `001_base_schema.sql` and migrations `002–008`. Migration `009_hardening.sql` explicitly says it must run after `001_baseline.sql`. However, `docs/database.md` still presents the legacy `001_base_schema.sql → 002…008` sequence as the primary fresh-install procedure and repeats that sequence in its “restore from zero” section, while elsewhere referring to `001_baseline.sql` as the prerequisite for 009. A fresh install following the old instructions can therefore diverge from the baseline path expected by later migrations.

The diagnostic `000_check_schema.sql` is read-only, but its expected-object list represents a substantially later schema state; its “missing objects” output on a fresh database is not itself evidence of corruption. The old `001_base_schema.sql` and `001_baseline.sql` must not both be treated as sequential migrations.

**Disposition:** no database migration was executed and no production data was touched. Before a fresh rebuild or manual Supabase rollout, make one canonical procedure explicit: diagnostic only, then `001_baseline.sql`, then the subsequent numbered migrations beginning with `009_hardening.sql` (with the remaining sequence checked for branch/rollout applicability). Archive or clearly mark the legacy `001_base_schema.sql` so it cannot be mistaken for the current entrypoint. Update every restore guide consistently.

**PR/CI status at HEAD `6a39d7a3cf2974ba28239ab8d812c1fce4fc1719`:** GitHub currently reports PR #4 as open, Draft, not merged, and `mergeable=true`; the earlier `mergeable=false` state is no longer present. This does not make the PR ready to merge. All three latest workflows completed with failure, but each job reports `runner_id=0` and `steps=[]` (jobs started and completed within about 1–2 seconds). Thus no test step ran; this is consistent with the runner/infrastructure failure pattern already observed, not evidence that the test suites passed or failed on code. Vercel reports `build-rate-limit`. No merge, deployment, production migration, real Pinterest request, or payment operation was performed.


**Follow-up remediation on `55f4734`:** the active `db/migrations/001_base_schema.sql` entry was removed after confirming its identical archive copy exists at `db/archive/001_base_schema.sql`. The active numbered entrypoint is now only `db/migrations/001_baseline.sql`. `docs/database.md` was updated to prescribe baseline → every migration 009–082, and the active read-only diagnostic now points to the baseline. Legacy `002–008` files remain in the tree but are explicitly marked “do not run” by the canonical instructions; they have not been applied or deleted. No database was changed. The current Vercel status is still failing with `build-rate-limit`; GitHub Actions for the latest docs-only HEAD have not yet appeared.


### AUD-165-09 — Pinterest admin inventory error redaction

**Finding confirmed:** `backend/adminPinterestInventory.js::sanitizeOperationalError` used over-escaped regular expressions (`\\\\s`, `\\\\b`, `\\\\.`) inside regex literals. In JavaScript these patterns match literal backslash sequences rather than whitespace/word boundaries/dots, so a bearer credential and JWT could pass through the admin inventory response unredacted. The existing test covered a query-string token but did not cover bearer headers or JWTs.

**Fix committed:** corrected the regex escaping, handled Authorization headers without removing the visible `Bearer` scheme, and added a regression test covering bearer token, JWT, and `access_token` key/value redaction. A standalone Node check of the sanitizer expression produced the expected fully redacted string. The repository's full test suite and new test have **not** been run successfully in CI; the GitHub runner issue remains. This fix does not rotate any credentials and does not change production data.


### AUD-165-10 — Expired Storage deletion claim can reopen an object path

**Finding: the image deletion claim protocol does not permanently fence an object path after an ambiguous deletion request expires.** In migration `070_pin_image_deletion_claim_protocol.sql`, `deleteManagedPinImageObject` deliberately leaves the lifecycle row in `deleting` after a timeout, thrown transport error, or Storage 5xx. This is correct because the Storage operation may have committed or may still be in flight. However, once `claim_expires_at` passes, `claim_pin_image_deletion` allows another worker to rotate the claim token and issue another Storage removal. If that second removal completes and finalizes the row as `deleted`, `begin_pin_image_upload` permits the same object path to be reserved again. A delayed first Storage removal could then delete the newly uploaded bytes. The claim token fences database finalization, but it cannot cancel or fence an already-issued external Storage request.

**Coverage gap:** `backend/test/pin-image-lifecycle.test.js` covers ambiguous Storage failures retaining the claim, token-matched finalization, and stale-upload quarantine. It does not cover an expired deletion claim, token rotation, permanent path retirement, or the prohibition on re-upload after an ambiguous deletion.

**Risk:** data loss for a reused object key after a rare timeout/late-completion race. The normal successful deletion path and concurrent DB reference-write guards remain useful; this is specifically the recovery path after an ambiguous external delete.

**Recommended safe remediation:** treat an expired `deleting` claim as permanently `quarantined` (clear its token/expiry and refuse further upload/deletion claims), unless an operator can independently establish that the original Storage request/process has terminated. Cleanup of such objects should be a separate operator workflow that never reopens the same key; any replacement image must receive a fresh object path. Add SQL-level regression coverage for the expired-claim transition and upload refusal. Do not “fix” this by merely rotating the claim token: the token protects the database row, not the external Storage side effect.

**Disposition:** finding recorded; no production database or Storage object was touched. No claim is made that this race has occurred in production. The SQL integration tests and backend test suite have not been successfully run in CI.
