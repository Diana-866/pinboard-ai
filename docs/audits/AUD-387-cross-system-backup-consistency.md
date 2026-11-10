# AUD-387 — cross-system backup consistency and recovery dependencies

**Date:** 2026-11-11  
**Status:** source/documentation audit complete; no live provider verification.

## Scope

Reviewed AUD-370 backup findings/runbook, infrastructure requirements, database bootstrap guide, Storage lifecycle, Supabase client configuration, Pinterest token encryption, payment journal flow, and the repository tree for backup/export/restore scripts and workflows.

## Findings

1. **No backup evidence added since AUD-370.** Repository has no scheduled independent PostgreSQL export, object-store replication/export job, backup verification workflow, or restore-drill record. Only application CI workflows were found. Provider dashboard configuration remains unverified.
2. **Database and Storage form one recovery set.** `pin_images` is a public Supabase Storage bucket. DB rows and public URLs do not contain image bytes. Recovery must preserve exact object paths and restore the bytes as well as rows; restoring either side alone leaves broken pins/schedule snapshots or orphaned objects.
3. **A backup needs a consistency point.** A database snapshot and Storage object copy taken at unrelated times can disagree during uploads, replacements, snapshot creation, and deletion. Recovery manifest must record a defined write-freeze/snapshot window or a versioned-object strategy, DB snapshot timestamp, object inventory timestamp, counts, byte totals and checksums. Keep source read-only until reconciliation completes.
4. **Pinterest ciphertext has an external key dependency.** `backend/pinterestTokenCrypto.js` uses AES-256-GCM. Existing encrypted access/refresh tokens require the exact active `PINTEREST_TOKEN_ENCRYPTION_KEY`; during rotation the previous `PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS` may also be required until all ciphertext is re-encrypted. DB backup without both applicable keys cannot restore Pinterest connectivity. Keys must be escrowed separately from DB and object backups.
5. **Application recovery is not a substitute for backup.** Durable generation/payment/Pinterest journals and Storage lifecycle fences protect interrupted operations while their database remains available. They cannot recreate deleted/corrupted PostgreSQL rows or missing Storage bytes.
6. **Financial and publication records need reconciliation, not blind replay.** Restored balances must be compared with credit transaction history; subscriptions/payment-creation records with Prodamus receipts/webhooks; Pinterest schedules/attempts with publication ledger and remote evidence. Unknown outcomes must remain fenced.
7. **The app's production DB connection is intentionally privileged.** `backend/supabase.js` fails startup in production without `SUPABASE_SERVICE_ROLE_KEY`; recovery must restore service credentials only into a restricted secret store, never into repository or client bundles.
8. **Bootstrap guide is schema-only.** `docs/database.md` describes baseline + ordered migrations for an empty DB and explicitly is not a production data restore procedure.

## Required backup-set manifest

- Source project/provider/region and backup-set ID.
- PostgreSQL snapshot/export timestamp, format, encryption, checksum, schema/migration revision, table/row counts and sequence/constraint/function/grant verification.
- Storage bucket inventory timestamp, object count, total bytes, object paths, content types, per-object checksums and encryption/version metadata.
- Consistency method: quiesced write window or versioned objects plus reconciliation report.
- Exact application commit SHA and migration range.
- Secret inventory by variable name/version only (never values), including active/previous Pinterest encryption keys and JWT, payment/webhook, scheduler, SMTP and Supabase credentials; vault reference and recovery owner.
- Retention expiry, immutable/versioned status, independent provider/account, last successful restore drill and measured RPO/RTO.

## Required restore acceptance

- Restore PostgreSQL and Storage into an isolated project/account; do not overwrite source.
- Verify schema, roles/grants, functions/triggers, migration history, row counts, key financial totals and ownership/RLS behavior.
- Verify Storage object counts, byte totals and checksums; sample-check image URLs used by pins and immutable schedule snapshots.
- Decrypt a dedicated test Pinterest credential using the escrowed active/previous key set.
- Reconcile credit ledger, payments, subscriptions, generation journals, email outbox, Pinterest attempts/publications and schedule rows.
- Keep external writes, billing, generation, email dispatch, cron and Pinterest publishing disabled during validation.
- Measure RPO from the last consistent recoverable snapshot and RTO through completion of integrity checks.

## Disposition

No code change is justified: backup provider selection, account credentials, schedule, retention, immutable policy and restore evidence are infrastructure operations not represented by this repository. AUD-370 remains the authoritative initial gap report; this audit adds cross-system consistency and key-dependency acceptance criteria.

## Safety / validation limits

No Supabase, Storage, provider, vault or hosting dashboard was accessed. No export, backup, restore, migration, secret retrieval, object copy/deletion, deploy, merge, payment, generation or Pinterest action was performed. RPO/RTO remain unknown.