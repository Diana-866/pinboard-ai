# AUD-396 — executable account-deletion workflow architecture

**Date:** 2026-11-11  
**Status:** architecture proposal only; no migration or runtime implementation.

## Objective

Design a resumable deletion workflow that revokes access and blocks new work atomically, records an auditable request and retryable jobs, reconciles uncertain external operations, removes data from a versioned ownership manifest, and retains only approved restricted evidence.

## 1. Separate state machines

### Account lifecycle (users.account_status)

| State | Meaning | Login / new work |
|---|---|---|
| active | Normal account | Allowed |
| deletion_pending | Request accepted; access revoked; work fenced | Denied |
| reconciling | Existing external operations being resolved | Denied |
| cleanup_pending | Manifest-backed local cleanup in progress | Denied |
| anonymized | Personal content/identifiers removed; tombstone retained | Denied |
| retained_financial_only | Only approved restricted evidence remains | Denied |

Transitions are monotonic. No automatic transition returns to active. Restoration, if ever allowed, is a separate operator-reviewed process and only before irreversible work begins.

### Deletion request

One current request per user, immutable request ID and lifecycle version. Proposed fields: request_id, user_id, requested/confirmed/started/completed timestamps, actor and confirmation method, lifecycle_version, state, safe terminal code and manifest_version.

Require recent re-authentication and explicit confirmation. If email confirmation is used, store only a hash and expiry. Never store passwords, JWTs or provider credentials.

### Event journal

Append-only receipt containing request ID, pseudonymous subject, previous/new state, lifecycle version, event type, actor class, timestamp and safe reason code. No free-form personal or secret payloads.

### Deletion jobs

One logical job per request and phase/step, unique by (request_id, step_key). Fields: job_id, request_id, user_id, phase, step_key, dependencies, status, claim_token, lease_expires_at, attempts, next_attempt_at, safe_error_code and timestamps.

Statuses: pending / running / retry_wait / blocked / succeeded / skipped. Blocked means unknown provider outcome, unresolved ownership, active Storage claim or missing retention approval; it is never silently treated as success.

### Manifest items

One row per record/object or bounded homogeneous group. Store exact trusted table+primary key or validated Storage bucket/path, ownership proof source, disposition, dependencies, state, claim token, attempts, terminal evidence reference and retention deadline. Never store tokens, password hashes, raw prompts or full payment payloads.

Dispositions: delete / anonymize / retain_restricted / provider_action / backup_expiry / manual_review. Freeze a manifest version before cleanup. Newly discovered evidence becomes a later manifest revision; never rewrite completed items to hide an incomplete snapshot.

## 2. Atomic request acceptance

A narrowly scoped SECURITY DEFINER RPC performs one transaction:

1. Lock users row first (FOR UPDATE); require active state.
2. Verify recent re-authentication and consume the explicit confirmation receipt atomically.
3. Set account_status to deletion_pending; increment token_version and lifecycle_version; set request timestamps.
4. Invalidate unused password-reset and email-verification tokens.
5. Insert deletion request and append-only lifecycle event.
6. Insert initial jobs and durable internal processing receipt.
7. Commit once.

Duplicate submission returns the same request receipt. A stale lifecycle version fails closed. No provider or SMTP network call occurs in this transaction.

This commit is the access cutoff. The frontend may clear localStorage after success, but server authorization remains authoritative.

## 3. Universal lifecycle fences

Every path that creates new user-visible, billable or externally visible work must require account_status=active under the relevant transaction/claim lock:

- login and requireAuth;
- password reset and email verification issue/consume;
- checkout, purchase creation, subscription entitlement and credit fulfillment;
- generation/regeneration reservation and task creation;
- Pinterest OAuth begin/commit/refresh, manual publish, schedule create/claim/retry;
- upload begin/finalize and image-reference writes;
- email enqueue and email dispatch;
- every service-role worker/recovery RPC.

Express middleware alone is insufficient for background claims. Database RPCs must check lifecycle atomically with the claim. Completion RPCs must distinguish recording an already-completed external fact from granting entitlement or reopening work.

Global lock order: users → deletion request/job → domain rows in deterministic order. Never lock a job and then wait for its user row. Do not hold database locks during Pinterest, Prodamus, GPTunnel, SMTP or Storage network calls.

## 4. Worker claim and lease protocol

1. Read candidate request IDs without locking (advisory only).
2. In a short transaction, lock owner users row first with SKIP LOCKED; verify deletion state and lifecycle_version.
3. Lock matching job second; verify dependencies, due time and no live lease.
4. Rotate claim_token, increment attempts, set lease and mark running.
5. Commit; perform one bounded step outside the transaction.
6. Finalize in a short transaction, again locking user then job and checking lifecycle_version, claim_token and lease.
7. A stale claim cannot overwrite newer state. Independently verifiable provider facts use a dedicated reconciliation path.

Lease expiry permits reclaim only when the external outcome is known safe to retry. If a call may have committed, mark blocked/unknown and reconcile; never repeat it merely because a lease expired. A DB claim token cannot cancel an HTTP request already sent.

## 5. Ordered phases and completion criteria

| Phase | Work | Completion condition |
|---|---|---|
| P0 accept_and_fence | Accept request, revoke sessions, deny login, gate new work | All request gates active; lifecycle version advanced |
| P1 reconcile_financial | Checkout, payment, subscription, credit, refund and chargeback journals | Every provider event has explicit settled/denied/unknown disposition; no entitlement can be granted |
| P2 reconcile_generation | Generation/regeneration tasks, reservations and provider usage/refunds | Outcomes terminal or explicitly blocked; unknown reservations held |
| P3 reconcile_pinterest | OAuth, refresh, manual/scheduled publication and remote IDs | No future publish can start; in-flight POSTs confirmed, rejected or blocked unknown |
| P4 stop_notifications | Cancel unsent outbox jobs; fence claimed senders; scrub nonessential payloads | No pending/claimed sender can send after cutoff |
| P5 build_manifest | Enumerate owned rows, indirect references and Storage objects | Ownership resolved; ambiguous items blocked; manifest version frozen |
| P6 remove_credentials | Clear local Pinterest secrets and auth tokens; provider revocation only where supported | Zero usable local credentials; remote revocation evidenced separately |
| P7 remove_content | Remove eligible review, schedule, generation, pin, board, project and image content | Each item deleted or explicitly retained/blocked; Storage uses existing claim protocol |
| P8 minimize_retained | Pseudonymize approved financial/operator/reconciliation records | Direct identifiers removed only where approved; deadline recorded |
| P9 verify_and_finalize | Per-table counts, object and queue checks, exception report | No eligible item omitted; every remainder has approved exception |
| P10 tombstone | Set anonymized or retained_financial_only; record completion | Immutable completion receipt; tombstone retained until separate purge policy |

Steps are independently retryable and bounded. Do not advance a dependent phase while required items are blocked.

## 6. External side effects and unknown outcomes

- Prodamus signed success after deletion: record immutable payment fact, withhold entitlement, route to restricted refund/reconciliation.
- GPTunnel task already submitted: poll/reconcile the same task; hold reservation if spend/outcome unknown.
- Pinterest POST already started: preserve unknown; record late remote pin ID exactly once; never reactivate schedule or publish again.
- Pinterest OAuth exchange after acceptance: commit RPC rejects by lifecycle/version; discard in-memory tokens; provider grant revocation is separate and not assumed.
- SMTP claimed before deletion: sender re-checks lifecycle immediately before send. Ambiguous acceptance is recorded as unknown, not assumed undelivered.
- Storage upload/delete timeout: preserve lifecycle claim/quarantine; no blind retry or path reuse.

Each external operation needs its own idempotency/reconciliation contract. Deletion job leases alone cannot make remote effects exactly once.

## 7. Foreign keys, ownership and deletion strategy

Do not hard-delete users as the first/default operation. Keep a minimal lifecycle tombstone until dependencies resolve.

Before content deletion:
- resolve deployed FK catalog read-only;
- map UUID/TEXT owner columns and indirect ownership;
- preserve schedules/publication snapshots until remote reconciliation is terminal;
- preserve payment/credit/refund/operator receipts under approved retention;
- scrub email_outbox recipient/payload and resolve FK dependencies deliberately;
- process images only through reference-aware lifecycle, including pins, schedule snapshots, generation/regeneration journals and active upload/deletion claims;
- retain object-path tombstones to prevent reuse.

No broad cascade, prefix deletion, balance rewrite or direct Storage remove.

## 8. Security and observability

- RLS on workflow tables; no anon/authenticated access. Narrow service-role-only SECURITY DEFINER RPCs with fixed search_path.
- No public generic status-update RPC.
- Claim tokens never appear in user responses or logs.
- User-visible status exposes coarse phase/counts, not provider payloads or identifiers.
- Log request ID, step key, attempt, safe error code and duration; redact email, IP, prompts, tokens, payment payloads and raw provider errors.
- Read-only admin view separately authorized; operator actions append-only and reason-coded.
- Rate-limit request and confirmation attempts; avoid account/email enumeration.

## 9. Rollout and rollback

Feature flag defaults OFF. Additive schema may deploy before gates, but no request is accepted until all gates and worker fences are verified. Staging uses synthetic accounts only.

After acceptance, there is no general rollback to active. Operational rollback means pause workers, keep access revoked, preserve manifests/claims and repair forward. Restoration is separate and prohibited after irreversible provider/content actions.

## 10. Mandatory tests

- Duplicate request / simultaneous confirmation: one request, one lifecycle version increment.
- Stale/expired confirmation and re-auth timeout.
- Old JWT, login, password reset, verification and all protected routes denied immediately.
- All billable and service-role worker claims blocked after cutoff.
- User-first lock order races against billing, OAuth, generation and scheduler.
- Worker crash before/after claim, external call, remote commit and local finalize.
- Stale claim cannot overwrite new lease; unknown outcome is not automatically retried.
- Payment settlement retained once with no post-deletion credit/subscription.
- Generation reservation never released while outcome unknown.
- Pinterest late success recorded without reactivation.
- SMTP race cannot dispatch after cutoff without an explicit in-flight receipt.
- Storage reference/upload/delete races preserve shared objects and quarantine.
- Mixed UUID/TEXT ownership, FK RESTRICT and orphan cases.
- Manifest completeness; every retained item has approved policy and deadline.
- Restart after every phase; finalization replay is idempotent.

## Release blockers

Do not accept deletion requests until deployed FKs and ownership mapping are verified; all lifecycle gates and user-first lock order are implemented; provider unknown-outcome paths are tested; Storage inventory is account-scoped; financial retention is approved; backup expiry and vendor retention are verified; RU/EN policies match actual behavior; and disposable PostgreSQL/staging tests pass.

## Safety

No implementation, migration, SQL, production/provider access or data mutation was performed. Retention durations, legal bases, provider revocation support and deployed schema remain unverified.
