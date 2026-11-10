# AUD-370 — independent backup and full restore readiness

**Date:** 2026-11-11  
**Status:** source/configuration audit complete; no live backup or restore evidence

## Scope and evidence

Reviewed `backend/supabase.js`, `backend/storage.js`, `backend/test/supabase-config.test.js`, `docs/database.md`, `docs/INFRASTRUCTURE_REQUIREMENTS.md`, and previous audits AUD-347/AUD-348. Inspected the repository tree for backup/export/restore scripts, backup workflows, and provider-specific backup configuration.

The repository contains the application schema/migration chain through 123 and a clean-database bootstrap guide. It does not contain a verified independent scheduled PostgreSQL export/backup job, object-storage backup/replication job, backup alerting configuration, or restore-drill evidence. This is a repository-level finding; provider dashboards and external backup systems were not inspected.

## Assets that must be backed up independently

1. **PostgreSQL:** schema, rows, sequences, constraints, indexes, extensions, functions, triggers, grants/roles and migration history. Include financial journals and durable generation, payment, email and Pinterest queues. Use a consistent provider-supported backup/export method; do not treat a schema-only migration chain as a data backup.
2. **Supabase Storage:** every required object in `pin-images`, including object key/path, bytes, size, content type and checksum. Public URLs and DB rows are not the image bytes. A DB backup without object backup leaves pins and scheduled publications with broken images.
3. **Secrets and key escrow:** exact current and previous `PINTEREST_TOKEN_ENCRYPTION_KEY` values, protected independently from the database; backend JWT secret, Prodamus signing/webhook secrets, scheduler/admin secrets, SMTP credentials and provider configuration. Never commit or place raw values in this runbook.
4. **Deployable application:** exact Git commit SHA, migration set, build/deploy configuration and non-secret environment-variable inventory. Keep secrets in a separate restricted recovery vault.
5. **Control-plane access:** recovery access to domain/DNS, hosting, Supabase, storage and backup accounts, with MFA and a second authorized recovery path.

## Recovery order (isolated restore only)

1. Freeze production writes, deployments, migrations, payment reconciliation, billable generation, Pinterest publishing and destructive Storage cleanup. Preserve provider receipts and logs.
2. Recover privileged account access and secrets from the independent vault. Verify the backup set and its timestamps/checksums before restoring.
3. Restore PostgreSQL into a new isolated project. Do not overwrite the source project. Confirm schema, migration history, roles/grants, RPCs/triggers, sequences, FK integrity, row counts and financial ledger totals.
4. Restore Storage objects into an isolated bucket/project while preserving object paths. Compare object inventory, byte sizes and checksums; verify a sample of public image reads expected by Pinterest.
5. Configure the isolated backend with restored DB/storage endpoints and escrowed keys. Confirm production mode requires service-role key; verify JWT auth, test-user ownership boundaries and decryption of a test Pinterest credential.
6. Keep outbound side effects disabled. Do not call real GPTunnel, Prodamus or Pinterest endpoints during restore validation. Use mocks/test credentials and non-billable fixtures.
7. Run read-only and staging smoke checks for users/projects/boards/pins, credit and payment ledgers, generation journals, email outbox, Pinterest schedules and Storage URLs.
8. Record restore start/end, backup timestamp, recovered object count/checksum results, data gaps, operator, exact commit/migration set, measured RPO and RTO. Only then request owner approval for a separate production cutover plan.

## Acceptance criteria before claiming backup readiness

- Automated backups run to a different provider/account and failure alerts are delivered.
- DB and Storage backups are both encrypted, access-restricted, versioned/immutable where supported, and retained under a documented schedule.
- Restore is performed in an isolated environment from an actual backup, not just by replaying migrations.
- DB integrity and key financial totals reconcile; image inventory and checksums verify; a test encrypted Pinterest credential decrypts with escrowed key material.
- Restore is repeatable by an authorized operator using the documented runbook.
- RPO/RTO are measured during the drill, not inferred from provider plan labels.

## Findings / limitations

- No independent backup/export pipeline or backup alert configuration was found in the inspected repository.
- No independent Storage object copy or checksum inventory was evidenced.
- No live Supabase plan/dashboard settings, PITR availability, backup retention, project region, bucket ACLs, or provider-level snapshots were inspected.
- No current/previous encryption-key escrow or emergency account recovery path can be established from source code.
- `docs/database.md` describes rebuilding an empty schema from baseline + migrations; this is not restoration of user data or Storage objects.
- Migration 123 is the latest numbered migration found in this branch tree. A repository file does not prove that it is applied in production.
- Current RPO/RTO remain **unknown**; full disaster-recovery readiness remains **unproven**.

## Safety

No live Supabase/database/storage/provider account was accessed. No backup/export, restore, migration, secret retrieval, object copy/deletion, deploy, merge, payment, generation or Pinterest action was performed.
