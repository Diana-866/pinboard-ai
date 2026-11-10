# AUD-393 — generation, provider spend and credit reservations during account deletion

**Date:** 2026-11-11  
**Status:** source/migration/test review; design only. No production access.

## Scope

Reviewed GPTunnel image submission/polling, generation request idempotency, claim fencing, task journal, provider outcome persistence, credit reservations, final pin/credit settlement, recovery endpoint and existing concurrency/integration tests. Cross-checked AUD-390–392.

## Confirmed protections

- GPTunnel image create supports a stable provider idempotency key; task IDs are validated and persisted through a callback as soon as provider acceptance is known.
- Recovery polls the same persisted provider task and does not create a replacement task. Poll exhaustion returns pending, not failed.
- Generation requests use user-scoped idempotency key + request fingerprint. Stale requests with a task plan are resumed with a fresh claim token; stale requests without a plan become unknown rather than blindly resubmitted.
- Every generation task has a durable task journal, stable provider idempotency key, claim-token fencing, and immutable terminal provider outcome fields.
- Provider success/failure outcome journaling is separate from user credit settlement. Unknown provider/refund outcomes remain visible and reservations stay protected.
- Credit reservations serialize balance-changing work by locking users first; reservations prevent legacy debit from consuming reserved credits. Definitive failures release reservations; ambiguous provider outcomes retain them.
- Final generation completion validates task journal against persisted pins and settles pins + credit debit transactionally. Completion and claim-token guards prevent stale owners from finalizing.
- Existing tests cover reservations, duplicate/concurrent generation, provider outcomes, recovery and completion guards. They were inspected, not executed.

## Findings

### AUD-393-01 — Generation request creation has no account lifecycle gate

**Evidence:** latest begin_pin_generation_request implementation in migration 046 validates board ownership and inserts/locks pin_generation_requests, but does not lock/check users or account lifecycle. Backend route invokes it after auth middleware. AUD-391 found requireAuth currently checks token_version only; lifecycle state is not yet implemented.

**Risk:** a request can start concurrently with deletion, and a backend request already authenticated may continue after the deletion transition unless the database entry point itself fences it. Service-role RPCs bypass user-facing RLS and cannot rely on Express checks.

**Required:** begin request must lock users first, require account_status='active', then validate owned board and create/reuse request. Add lifecycle version captured in request. Every mutating RPC must re-check active state and expected lifecycle version inside transaction. Existing processing requests must be moved to a deletion reconciliation state, not blindly retried.

### AUD-393-02 — Final settlement lock order conflicts with deletion

**Evidence:** complete_pin_generation_request locks pin_generation_requests first, then calls save_generated_pins_and_charge. The latter locks/updates users to debit credits. Credit reservation and resize RPCs already use users → request → reservation. Other task journal RPCs use request → task.

**Risk:** deletion locks users first, while completion locks request then waits for user. Deletion may then wait for request while holding user: deadlock. The current generation transaction path does not share the same lock order as reservation.

**Required:** refactor final settlement to lock users → generation request → reservation → task rows in deterministic task_index order → pins/ledger. All mutating generation RPCs must adopt one documented lock order. Keep request/task fencing but do not acquire request lock before user. Revalidate claim token and lifecycle after user lock. Never hold a transaction open across provider or Storage HTTP calls.

### AUD-393-03 — In-flight provider work cannot be canceled reliably

**Evidence:** GPTunnel image submission is an external HTTP call. Once accepted, provider task may continue independently. The system correctly preserves task ID and polls same task; timeout or unknown result is not proof of non-submission.

**Risk:** deletion may begin while provider is processing. Canceling local request or releasing reservation can leave billable provider work unaccounted for; allowing normal completion can persist a new image and charge a user after deletion began.

**Required:** deletion transition fences new provider submissions. Existing accepted tasks enter a durable deletion-reconciliation/held state. Continue polling known task IDs only to obtain provider terminal facts; do not submit replacement tasks. Record final provider price/refund/status even for deleting accounts. Do not save user-visible pins, grant entitlement or create new generation output after deletion commit. Route actual provider cost/refund to financial reconciliation, not ordinary user credit settlement.

### AUD-393-04 — Provider outcome journal is claim-fenced to a processing request

**Evidence:** record_pin_generation_provider_outcome locks parent request and requires status='processing' plus matching claim_token. It persists terminal outcome on pin_generation_tasks. Request transitions to unknown/failed can clear claim_token.

**Risk:** a late provider result after deletion worker fences or transitions the request may no longer be recordable through the normal RPC. Dropping claim fencing is not safe because stale workers could overwrite facts.

**Required:** add a separate append-only provider-event receipt RPC keyed by provider task ID + event/fact identity, which accepts authenticated service-role reconciliation for deletion-held requests without reopening entitlement. Preserve immutable identity and reject conflicting replays. Keep ordinary worker claim fencing for mutable task workflow state.

### AUD-393-05 — Credit reservation must not be released solely because account is deleted

**Evidence:** reservation trigger releases only when request becomes definitively failed; unknown outcomes keep reservation. Migration 088 allows release for unknown requests with no image task journal. Existing tests explicitly verify unknown with task journal retains reservation and blocks other spend.

**Risk:** deletion cleanup that marks all requests failed or releases all reservations would free credits while GPTunnel may still charge for a task. Conversely, holding every reservation forever would strand balance and deletion.

**Required:** classify each task: never submitted/prepared; submission unknown; provider accepted/queued/running; succeeded; failed with explicit refund fact; failed with missing refund metadata. Release only the unsubmitted portion or tasks with authoritative no-cost/refund evidence. Unknown provider/refund outcome remains held for operator reconciliation. Do not mutate balance to force cleanup.

### AUD-393-06 — Image Storage cleanup is a separate lifecycle

**Evidence:** successful generation uploads provider result to Storage and stores storage_url; task journal and replay guards preserve references. Existing image deletion uses claims/quarantine/reference checks.

**Risk:** deletion can race with upload, finalization or replay references. Removing a board/pin first may orphan Storage objects; deleting objects based on public URLs is unsafe.

**Required:** deletion must inventory trusted Storage object paths from DB/task journals, fence uploads and finalization, wait for or reconcile in-flight uploads, then use the existing claim/quarantine/reference-aware deletion protocol. Do not derive object keys from public URLs or bulk-delete a prefix without a verified inventory.

### AUD-393-07 — Regeneration follows a related but distinct journal

**Evidence:** single-pin regeneration uses its own request claim and provider task journal; its flow performs provider submission and later settlement. It must be included in lifecycle fencing and lock-order review, not assumed covered by multi-pin generation.

**Required:** audit/refactor regeneration begin, provider outcome, completion, failure/refund reconciliation and legacy debit paths under the same lifecycle and lock-order rules.

## Required state separation

Keep three dimensions independent:
1. User lifecycle: active / deletion_pending / reconciling / cleanup_pending / anonymized.
2. Provider task outcome: prepared / submitting / queued / running / succeeded / failed / unknown, plus price/refund facts.
3. User credit disposition: reserved / settled / released / held_for_deletion_review.

A deletion request must not rewrite a provider outcome as failed, and provider success must not imply that a pin should be saved or credits should be debited after deletion.

## Implementation phases

1. Add lifecycle status/version to user and capture version in generation/regeneration request.
2. Add active-state and version checks to begin, reserve, quote, resize, task-plan, task-update, completion, failure and recovery mutation RPCs.
3. Refactor all generation settlement RPCs to users → request → reservation → tasks → pins/ledger lock order.
4. Add deletion-held provider receipt path independent of ordinary claim ownership and entitlement.
5. Implement per-task deletion reconciliation: no-submission, unknown submission, accepted task, terminal provider success/failure and refund status.
6. Integrate Storage upload/deletion claim inventory and reference checks.
7. Add regeneration parity and legacy path coverage.
8. Only then allow account cleanup to remove prompts, generated content and task journals under approved financial/privacy retention rules.

## Mandatory regression/concurrency matrix

- Deletion commits before begin generation: no request, reservation or provider submission.
- Generation begin wins user lock: request version is recorded; deletion then fences new submissions.
- Deletion vs reserve/resize: no reservation created/resized after deletion commit.
- Deletion vs final settlement: no deadlock; if deletion wins, no pins or ordinary credit debit; if settlement wins first, deletion sees committed result.
- Provider accepts task then deletion starts: same provider task is polled; result/price/refund receipt persists; no replacement task, user-visible pin or post-deletion debit.
- Submission timeout/unknown vs deletion: reservation held until provider evidence; no blind replay.
- Late success after claim invalidation: append-only provider receipt captures fact without reopening generation entitlement.
- Multi-task partial success: reconcile each task independently and only release proven unused amount.
- Storage upload vs deletion: object is inventoried and deleted only after reference-aware claim protocol.
- Regeneration and legacy paths receive same fencing.
- Existing idempotency, recovery, reservation, provider outcome and completion tests remain green.

## Release gates

No deletion rollout until all generation mutating RPCs enforce lifecycle and expected version, all financial RPCs share user-first lock order, provider outcomes can be durably recorded after deletion fencing, reservations are reconciled per task, Storage deletion is reference-aware, and race tests pass on disposable PostgreSQL.

## Safety

Source/migration/test review only. No tests, SQL, GPTunnel calls, Storage operations, balances, production data or account state accessed or changed. Live migration state remains unverified.
