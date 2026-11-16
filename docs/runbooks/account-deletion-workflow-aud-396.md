# AUD-396 — account deletion workflow implementation and staging runbook

**Historical status (superseded 2026-11-16):** the deletion pipeline is now implemented in main (migrations 127–148, account deletion routes and dedicated worker). This earlier AUD-396 workflow remains design history, not a current runbook. Its proposed schema/state machine must not be applied or recreated; inspect current migrations and worker before any staging rehearsal. Do not execute against production.

## A. Before implementation

- [ ] Read AUD-390–395 and resolve lock-order and retention findings.
- [ ] Export deployed schema/FK/RLS/function catalog read-only; compare with canonical migrations.
- [ ] Build owner mapping for every UUID/TEXT owner field and indirect relation.
- [ ] Approve financial, security-log, support and backup retention rules.
- [ ] Verify provider regions, retention, deletion/revocation APIs and backup expiry.
- [ ] Confirm feature flag OFF and production deletion endpoint not exposed.

## B. Additive data model (future migration)

Create account_deletion_requests (one current request per user), account_lifecycle_events (append-only transition receipts), account_deletion_jobs (bounded phase/step jobs with lease fencing), and account_deletion_manifest (per-record/object disposition and terminal evidence).

Add lifecycle status/version/timestamps to users with default active, without destructive rewrites. RLS on new tables; service-role-only narrow RPCs; fixed search_path; revoke PUBLIC/anon/authenticated grants explicitly.

Do not add hard-delete cascades or relax RESTRICT constraints to make cleanup appear successful.

## C. Request acceptance

- [ ] Require recent re-authentication and explicit confirmation.
- [ ] In one RPC lock user first, verify active, consume confirmation, increment token_version and lifecycle_version, set deletion_pending, write request/event/jobs.
- [ ] Duplicate requests return same receipt; stale lifecycle version fails.
- [ ] No network calls in acceptance transaction.
- [ ] Verify old JWT and all auth recovery routes fail immediately.

## D. Worker contract

- [ ] Candidate scan is advisory only.
- [ ] Claim transaction locks user first, then job; validates lifecycle version/dependencies and rotates claim token.
- [ ] Commit before network or Storage calls.
- [ ] Finalize transaction locks user then job and verifies claim token/version.
- [ ] Lease expiry is not proof external side effect failed.
- [ ] Unknown payment, generation, Pinterest, SMTP or Storage outcomes become blocked/reconciliation work, not automatic retry.
- [ ] Each step is bounded, idempotent and observable.

## E. Phase order

1. Accept and fence all access/new work.
2. Reconcile Prodamus payment/refund and credit facts.
3. Reconcile GPTunnel tasks and reservations.
4. Reconcile Pinterest OAuth, refresh and publication attempts.
5. Stop email dispatch and scrub unsent payloads.
6. Freeze complete account ownership/data manifest.
7. Remove local credentials.
8. Remove eligible content and Storage objects through reference-aware claims.
9. Anonymize approved retained financial/operator evidence.
10. Verify completeness, report explicit exceptions and finalize tombstone.

Never advance a phase while a required dependency is blocked. Preserve external facts even when local entitlement/content is removed.

## F. Staging tests

- [ ] Synthetic account with all data families populated.
- [ ] Duplicate request and parallel confirmations.
- [ ] Race each request/worker/claim against deletion transition.
- [ ] Crash worker at each boundary and replay same step.
- [ ] Simulate provider success with lost response and late callback.
- [ ] Simulate ambiguous SMTP and Storage outcomes.
- [ ] Verify FK RESTRICT and mixed owner IDs.
- [ ] Verify no credentials, queued email or new work remain.
- [ ] Verify financial/provider receipts retained under test policy.
- [ ] Restore staging backup and verify tombstone/manifest consistency.
- [ ] Verify production feature flag OFF and no user-facing deletion until sign-off.

## Stop conditions

Stop and pause the worker on unknown ownership, unexpected FK, lifecycle/version mismatch, stale/duplicate claim, unrecognized provider outcome, active Storage claim/quarantine, missing retention approval, or evidence that work can start after acceptance.

## Operational rollback

Do not reactivate the account or erase the manifest. Pause workers, retain access revocation, preserve leases and unknown outcomes, then repair forward. Restoration requires explicit approval and must not run after irreversible cleanup begins.

## Safety boundary

This document changes no production SQL, provider setting, Storage object, backup or user data.
