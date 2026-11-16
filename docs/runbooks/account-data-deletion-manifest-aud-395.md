# AUD-395 — account data inventory and deletion manifest

**Historical design-only snapshot (superseded 2026-11-16).** The implementation now exists in main across migrations 127–148 and backend/accountDeletionWorker.js. The ownership inventory and retention questions remain useful review prompts, but the proposed state machine/order below is not an executable current runbook. Do not apply this document's proposed schema or run destructive steps against production.

## Preconditions

- [ ] Resolve AUD-390–394 lifecycle states, user-first lock order and provider reconciliation.
- [ ] Read deployed schema/FK catalog and migration ledger without modifying data.
- [ ] Confirm actual providers, regions, backup/PITR/Storage versioning and retention settings.
- [ ] Obtain approved financial/accounting retention schedule and legal review.
- [ ] Do not promise 30-day erasure until local, provider and backup steps are evidenced.

## Build the ownership map

- [ ] Map users → projects → boards → pins.
- [ ] Map auth tokens and all TEXT/UUID owner columns explicitly.
- [ ] Map generation requests → tasks → reservations → provider usage/refund journals.
- [ ] Map Pinterest account → OAuth state/refresh lease → schedules → attempts → publications.
- [ ] Map pin review queue, schedule snapshots, manual-review and operator action records.
- [ ] Map subscription/payment → email outbox and payment/webhook journals.
- [ ] Map every managed Storage path from trusted DB references and lifecycle rows.
- [ ] Produce orphan/ambiguous-owner diagnostics; never auto-delete ambiguous rows.

## Classify each record

For every row/object, record one disposition:
- delete — user content/credentials with no remaining dependency;
- anonymize — retained operational/financial record after approved identity minimization;
- retain_restricted — unresolved provider/payment/refund or legally required evidence;
- provider_action — remote token revocation/content deletion where supported;
- backup_expiry — immutable backup copy awaiting verified expiry.

Include exact key/path, owner-resolution evidence, dependencies, state, attempt count, safe error code and terminal proof. Do not place tokens, password hashes, raw prompts or full payment payloads in the manifest.

## Future execution order

- [ ] Atomically mark deletion_pending, increment token_version and fence new work.
- [ ] Cancel unsent emails and prevent claimed messages from sending.
- [ ] Clear Pinterest credentials/refresh lease and hold future schedules; reconcile in-flight publishes.
- [ ] Reconcile GPTunnel tasks and provider charges/refunds; hold uncertain reservations.
- [ ] Record paid-but-withheld Prodamus outcomes without granting entitlement.
- [ ] Build and freeze a verified object/data manifest.
- [ ] Remove user content and managed Storage objects through existing reference-aware claims.
- [ ] Remove auth tokens and OAuth state after reconciliation.
- [ ] Anonymize financial/operator evidence only under approved policy.
- [ ] Verify no eligible local records remain and record backup/provider expiry exceptions.

## Verification

- [ ] Every owned table has an explicit query and expected count.
- [ ] No unresolved ownership orphans are silently skipped.
- [ ] No scheduled or in-flight external operation can restart after deletion.
- [ ] No unresolved provider spend/refund or remote publication fact is discarded.
- [ ] No Storage object is deleted while a reference, upload, deletion claim or ambiguous operation remains.
- [ ] Pending/dead email payloads are scrubbed and no sender can dispatch after deletion.
- [ ] Retained records are pseudonymous, restricted and time-bounded.
- [ ] Backup and third-party copies are disclosed separately from local erasure.
- [ ] Disposable DB/staging tests prove idempotency, concurrency and partial-failure recovery.

## Stop conditions

Stop on unknown owner mapping, FK conflict, ambiguous provider outcome, unknown Storage operation, active claim, missing refund/payment evidence, a possible post-deletion email/publication, or missing approved retention rule. Do not force progress by cascading deletes, balance edits, releasing reservations or deleting journals.

## Safety boundary

This is not authorization to run SQL, delete real user data, alter retention settings, call providers, revoke OAuth tokens, modify backups or change privacy-policy wording.
