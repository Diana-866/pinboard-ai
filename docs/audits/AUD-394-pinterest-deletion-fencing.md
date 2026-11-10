# AUD-394 — Pinterest OAuth, publication and scheduler fencing during account deletion

**Date:** 2026-11-11  
**Status:** source/migration/test review; design only. No production access.

## Scope

Reviewed Pinterest OAuth attempt creation/callback, multi-account token commit, refresh leases, account disconnect, manual publication, scheduled worker claim/reservation/completion, publication and attempt ledgers, stale schedule recovery and existing SQL race tests. Cross-checked AUD-390–393.

## Confirmed protections

- OAuth uses signed short-lived state, one-time attempt ID/generation, token_version, browser binding cookie, and a server-side encrypted token store.
- OAuth commit checks the current attempt/generation and token_version, enforces plan/account limits, and atomically consumes the attempt while saving credentials.
- Disconnect is account-scoped: it advances the OAuth generation fence, clears refresh lease, clears access/refresh tokens and marks the account disconnected. A late refresh worker cannot restore credentials after disconnect.
- Refresh rotation uses a database lease and expected updated_at; unknown refresh outcomes are fenced as uncertain rather than blindly reusing a possibly rotated refresh token.
- Publication reservation locks the Pinterest account before schedule/attempt work. Disconnect and publication reservation serialize on the account row.
- Scheduled publication uses a durable claim token, one-row worker batch, heartbeat, pre-POST claim revalidation, immutable creative snapshot, account-scoped attempt and publication ledger.
- Ambiguous POST outcomes are not automatically retried. Known remote IDs and exact publication identity are durably reconciled. Late remote success after account disconnect can still be recorded.
- Cancellation only changes scheduled rows; it cannot overwrite a worker-owned publishing claim. Existing tests cover cancellation races and refresh/disconnect fencing.

## Findings

### AUD-394-01 — OAuth callback lock order conflicts with user-first account deletion

**Evidence:** migration 032 commit_pinterest_oauth_attempt_v2 locks pinterest_oauth_connection_state first and then users. The earlier v1 function in migration 028 follows the same order. disconnect_pinterest_account_v2 in migration 031 also advances/locks the OAuth state row before updating the Pinterest account. AUD-392 establishes that deletion must lock the PinPosy user first.

**Risk:** deletion can hold the user row while waiting for OAuth state, while callback holds OAuth state and waits for the user row. This is a direct deadlock cycle. Callback also checks token_version but not an account lifecycle status/version.

**Required:** standardize order to users → OAuth connection state → Pinterest account → refresh lease (or another single globally documented order). OAuth begin, callback commit, disconnect and deletion must all follow it. Callback must re-check active lifecycle and expected lifecycle_version inside the commit RPC after acquiring user lock; an HTTP pre-check is insufficient.

### AUD-394-02 — OAuth exchange has an external side-effect window

**Evidence:** callback validates state/browser binding/token_version, exchanges the one-time code with Pinterest and fetches profile before invoking commit_pinterest_oauth_attempt_v2. If deletion begins during the network calls, the callback still holds credentials in process memory until the commit RPC rejects or accepts them.

**Risk:** credentials can be obtained after deletion begins. A correctly fenced commit can prevent persistence, but the callback must not persist, log or return credentials; temporary tokens remain in process memory until request completion. Provider-side authorization grant may remain active if local commit is rejected.

**Required:** lifecycle/version re-check before token exchange and atomic commit after exchange. On rejected commit, discard token material and execute a documented provider revocation/reconnect policy where supported; never persist an account after deletion fence. Avoid logging OAuth payloads.

### AUD-394-03 — Scheduler claim path has no user lifecycle gate

**Evidence:** migration 049 claim_due_pin_schedules claims due rows with FOR UPDATE SKIP LOCKED, rotates claim_token and returns schedules. It checks account connected state but does not lock/check the owner in users or an account lifecycle status. Worker endpoint uses service secret and service_role, then calls tariff check and publish flow.

**Risk:** a schedule can be claimed after deletion begins. HTTP requireAuth is not involved in this background route. Even if later publication reservation rejects a disconnected account, deletion needs a deterministic queue fence and cannot rely on credentials alone.

**Required:** claim RPC must lock owner user before account/schedule and only claim for active lifecycle. Deletion must atomically prevent new claims and mark future scheduled rows as held/cancelled under the same lock order. Stale worker claims must be fenced before POST.

### AUD-394-04 — Publication reservation and completion have no owner lifecycle predicate

**Evidence:** migrations 056/061 lock account → schedule and verify active Pinterest account, then create publication attempt. Migration 057/058/059 completion locks account → schedules → attempt and records remote publication ledger, including late success after disconnect. These RPCs do not lock/check PinPosy user lifecycle because that lifecycle gate is not yet implemented.

**Risk:** after deletion is committed but before Pinterest account row is physically removed, a worker can reserve/complete work unless the account is disconnected first and all RPCs enforce deletion state. Completion must still record a remote side effect that Pinterest already performed, but should not reactivate a schedule or restore a user-visible connection after deletion.

**Required:** reservation and manual publish must require active user + lifecycle_version, checked under user-first lock. Completion must distinguish external fact receipt from local entitlement/state transition: preserve remote pin ID, account identity and publication evidence for reconciliation, but do not make a deleting user's schedule active/visible or create new retry eligibility. Keep the account tombstone until external outcome reconciliation and retention rules permit removal.

### AUD-394-05 — Disconnect is not equivalent to account deletion or provider-side revocation

**Evidence:** disconnect_pinterest_account_v2 nulls local access/refresh tokens and marks disconnected_at; it does not delete account identity/history, schedules, publication ledger, attempt journal or immutable schedule snapshots. Refresh lease is removed. This is deliberate and supports reconciliation.

**Risk:** using disconnect as the whole deletion process leaves user content, publication history, snapshots, remote IDs and OAuth connection metadata. Conversely, hard-deleting pinterest_accounts immediately conflicts with FK ON DELETE RESTRICT relationships and destroys the identity needed to reconcile late publication outcomes. Local token clearing should not be described as proof of provider-side token revocation.

**Required:** account deletion must first fence and clear credentials, preserve a minimal tombstone/account ID for reconciliation, then process owned schedules/content and ledgers according to retention policy. Verify Pinterest's supported token revocation behavior separately; do not claim remote revocation unless confirmed.

### AUD-394-06 — Future scheduled work and in-flight POSTs need separate dispositions

**Evidence:** scheduler queue contains scheduled, publishing, unknown, published, failed and cancelled states. Cancellation race test proves only scheduled rows can be cancelled; publishing claims cannot be overwritten. complete_pinterest_publish_v2 intentionally records late success after disconnect and updates matching publishing/unknown schedules to published. Unknown results are non-retryable until exact evidence.

**Risk:** blanket cancellation of all rows could overwrite a publishing claim or lose an external publication. Leaving all future schedules intact risks publication after deletion. An in-flight POST may already have been accepted remotely even when local response is lost.

**Required:** on deletion transition: future scheduled rows become a dedicated deletion-held/cancelled state; publishing rows are fenced from new POST before the side-effect boundary; if POST may already have started, keep unknown and reconcile exact attempt/remote ID. Continue recording confirmed remote success in an immutable external publication receipt, but do not schedule follow-up or re-enable local user content. Never convert unknown to safe retry by assumption.

### AUD-394-07 — OAuth connection state and account tombstones require explicit retention

**Evidence:** OAuth connection state is retained across disconnect to prevent generation reset; account identity rows are soft-disconnected; publication and attempt FKs restrict account deletion; operator reconciliation references user/account/schedule/pin with RESTRICT.

**Risk:** account/user hard deletion can be blocked by FKs or destroy evidence needed to explain remote side effects. The OAuth state row may contain user_id and should be included in deletion/anonymization inventory.

**Required:** define minimal tombstone fields and retention period for account ID, Pinterest external ID, remote pin/board IDs, attempt outcome and audit facts. Remove encrypted credentials promptly; separately anonymize/delete profile, OAuth state, snapshots and creative content after all in-flight outcomes are resolved and legal retention rules are applied.

## Required state separation

1. PinPosy lifecycle: active / deletion_pending / reconciling / cleanup_pending / anonymized.
2. Pinterest connection: connected / disconnected / credential_uncertain / tombstoned.
3. Schedule execution: scheduled / publishing / unknown / published / failed / cancelled / deletion_held.
4. Remote side effect: not_submitted / unknown / remote_pin_confirmed / remote_rejection_confirmed.
5. Retention disposition: operational / reconciliation_only / anonymized / purge_eligible.

Disconnecting Pinterest is not deleting the PinPosy account. A remote publication confirmed after deletion is a fact to record, not permission to restore local access or publish again.

## Implementation phases

1. Introduce user lifecycle status/version and make OAuth begin/callback, disconnect, refresh lease, publish reservation/completion and scheduler claim use user-first lock order.
2. Add lifecycle checks inside SECURITY DEFINER RPCs, not only Express routes.
3. Make OAuth callback discard credentials when lifecycle/version check fails; verify provider token revocation support and document limitations.
4. Add deletion-held schedule state and an atomic transition for future scheduled rows; fence publishing claims immediately before POST.
5. Add an immutable remote-publication receipt/reconciliation path that can record late success after deletion without restoring schedule eligibility.
6. Keep Pinterest account tombstone until attempts, schedules and publication facts reconcile; clear tokens and refresh lease at transition.
7. Inventory and anonymize OAuth state, snapshots, pin creative content, account profile and retained logs under approved retention policy.
8. Add concurrency tests for deletion vs OAuth begin/callback/refresh/disconnect, claim, reservation, POST boundary and late completion.

## Mandatory regression/concurrency matrix

- Deletion vs OAuth callback: both lock winners; no deadlock; callback cannot persist credentials after deletion commit.
- Deletion vs OAuth begin: no new attempt after deletion; stale callback rejected.
- Deletion vs refresh: stale refresh cannot restore credentials; uncertain rotation remains safely fenced.
- Deletion vs scheduler claim: no new claims after deletion commit.
- Deletion vs manual/scheduled reservation: no new provider POST after deletion wins.
- Deletion vs already-started POST: unknown/late success is recorded exactly once without restoring local access.
- Disconnect vs refresh remains covered by existing test.
- Cancellation vs worker claim remains covered by existing test.
- Published ledger and remote IDs remain consistent across tombstone/anonymization.
- All FK dependencies and operator reconciliation retention have explicit tested outcomes.

## Release gates

No account deletion rollout until OAuth and publication RPCs enforce active lifecycle/version, lock order is globally user-first, scheduler claim is lifecycle-aware, future schedules are held atomically, late remote outcomes can be recorded without reopening local access, and tombstone/retention behavior is tested.

## Safety

Source/migration/test review only. No tests, SQL, Pinterest API calls, token operations, schedule changes, Storage operations, production data or account state accessed or changed. Live migration state unverified.
