# SQL migration chain — static security and data-loss review

**Дата:** 2026-11-16  
**Проверенная ветка:** main  
**Объём:** all 148 files under db/migrations, archived 009, read-only 009 preflight report, Supabase test stub and baseline; active migration SQL 010–148 inspected in ten-file batches.

## Canonical migration sequence

- `000_check_schema.sql` is diagnostic-only and is not an install migration.
- `001_baseline.sql` is the canonical fresh-install baseline. It explicitly preserves historical TEXT user_id columns and numeric credit amounts as they exist in the current backend contract.
- `002–008` are historical pre-baseline files. They are not replayed after the baseline.
- `009_hardening.sql` is archived in `db/archive/` and is not in the active migration directory.
- `db/preflight/009_hardening_data_loss_report.sql` is SELECT-only and is the only permitted way to quantify the archived migration's candidate rows before any future explicit review.
- Active incremental chain is `010–148`.

## Critical finding: archived 009 is destructive and incompatible with current baseline

The archived `009_hardening.sql`:
- Converts six TEXT `user_id` columns to UUID.
- Deletes rows with malformed or orphaned user IDs in NOT NULL tables.
- Deletes orphaned `pinterest_publications.pin_id` rows.
- Converts `credit_transactions.amount` from numeric to integer when no fractional rows are found.
- Rewrites RLS policies and foreign keys.

The canonical baseline explicitly says those TEXT IDs and numeric amounts are retained because the current backend writes/reads those types. Therefore 009 must not be automatically applied to PIN_TRIAL or production. Its preflight report is read-only and exposes exact candidate rows; even a zero count is not a substitute for a verified backup.

## Static review of active migrations 010–148

- Scanned function declarations, SECURITY DEFINER, search_path, grants/revokes, RLS enablement/policies and destructive DDL/DML.
- No SECURITY DEFINER function was found without an explicit search_path in the scanned definitions.
- Service-owned ledgers/queues (generation, regeneration, payment creation, refund audit, image lifecycle, account deletion) consistently revoke client/public access and grant execution/table privileges to service_role as appropriate; RLS is enabled on service-owned tables.
- No DROP TABLE, TRUNCATE TABLE or DROP SCHEMA was found in active migrations.
- Destructive row deletes found in active migrations are concentrated in the account-deletion content-erasure functions in migrations 137, 142 and 143. These are SECURITY DEFINER with search_path and service_role-only execution; later migrations add provider/financial outcome fences and staged completion guards. Account deletion remains feature-gated off in the backend until staging validation.
- Other DROP statements are limited to replacing obsolete policies/functions/indexes/constraints as part of schema evolution; each must still be validated by a real migration replay.

## Verification and limitations

- `scripts/verify.sh` now applies `001_baseline.sql` then only active migrations `010–148`; it skips diagnostic/historical/archived SQL.
- Static migration-script regression test is added.
- `bash -n scripts/verify.sh`: PASS.
- `node --test backend/test/verify-script-migration-chain.test.js`: 4/4 PASS on a scratch copy.
- Full PostgreSQL replay was NOT run because `psql` is unavailable in this environment.
- GitHub Actions continues to fail before job steps (`steps: null`); no CI PostgreSQL migration test ran.
- No production/PIN_TRIAL DB, secrets or external services were accessed or modified.

## Next required verification

Run a clean disposable PostgreSQL replay from baseline through 148, then run all SQL integration tests. Before any future change to archived 009, export and review the exact preflight candidate rows and confirm a restorable backup. Never run 009 as part of normal setup.
