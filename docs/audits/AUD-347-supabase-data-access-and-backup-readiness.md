# AUD-347 — Supabase database, privilege boundaries, Storage and backup readiness

**Date:** 2026-11-11  
**Status:** SOURCE REVIEW COMPLETE  
**Runtime/live validation:** not executed

## Executive result

The repository contains a coherent backend-only database access model. Core tables and later sensitive queues/journals generally enable RLS and revoke direct access from `PUBLIC`, `anon`, and `authenticated`. Newer SECURITY DEFINER RPCs use catalog-first search paths and explicitly restrict execution.

No new confirmed cross-account data exposure or direct-client table grant was identified in the migrations reviewed for this audit. This is not a production ACL attestation: no live Supabase catalog query or two-account adversarial test was run.

## 1. Core table protection

Migration 076:
- enables RLS on all 10 core tables: users, projects, boards, pins, credit_transactions, auth_tokens, subscriptions, credit_purchases, pinterest_accounts, pinterest_publications;
- revokes all table privileges from PUBLIC, anon and authenticated;
- grants backend CRUD to service_role;
- fails if an expected table is missing.

The older baseline includes auth.uid()-based policies. PinPosy uses its own JWT rather than Supabase Auth identity, so these policies are not the application's authorization mechanism. The explicit absence of direct client grants is the relevant database boundary.

## 2. Later queues, journals and billing tables

Cross-checked the prior AUD-102 inventory and the later migrations:
- `pin_generation_tasks` and `pin_generation_text_usage`: RLS enabled; client privileges revoked; service-role access explicit; RPCs are SECURITY DEFINER with `search_path=pg_catalog,public` and client EXECUTE revoked.
- `payment_creation_requests` (116): RLS enabled; client privileges revoked; service_role CRUD explicit; four checkout RPCs explicitly revoke PUBLIC/anon/authenticated EXECUTE and grant service_role.
- `provider_refund_operator_actions` (078) and `pinterest_operator_reconciliations` (082): RLS enabled; direct access revoked even from service_role; append-only mutation/truncate triggers; narrow SECURITY DEFINER RPCs enforce current DB-backed admin status and record actions.
- `pin_review_queue` (113/120): RLS enabled; no client policies; migration 120 revokes client privileges and grants service_role CRUD.
- `gptunnel_provider_cost_ledger` (079): view access revoked from PUBLIC/anon/authenticated and SELECT granted only to service_role.
- Earlier AUD-102 reviewed 13 additional queue/journal/ledger tables and has an SQL privilege integration test, but that test has not been run in this environment.

No missing client revoke was found in these specifically inspected later-table migrations. This is a source-level check, not an exhaustive live catalog diff of every object in the deployed database.

## 3. SECURITY DEFINER / backend trust boundary

- Migrations 040–043 harden search paths for the earlier security-definer functions.
- The repository's integration test scans all SECURITY DEFINER functions in public and rejects missing/untrusted search_path settings, and checks that anon/authenticated cannot execute them.
- Newer RPCs inspected in 078, 082, 084, 099, 109, 110, 116 and 121 use `pg_catalog,public` and explicit grants/revokes.
- Backend startup fails in production if SUPABASE_SERVICE_ROLE_KEY is absent; it does not silently fall back to the anon key.

**Important:** service_role bypasses RLS. It is a highly privileged secret and the Express API remains the true per-user ownership boundary. A future endpoint that queries an object by ID must validate ownership before read/write/provider calls. Prior AUD-104 found no confirmed IDOR in its reviewed route inventory, but did not perform a live two-user adversarial test.

## 4. Storage and image exposure

The `pin-images` bucket is intentionally public so Pinterest can fetch published images. Anyone who obtains a public object URL may read that image. Public visibility does not itself authorize anonymous writes.

Backend startup validates bucket name, public visibility, allowed image MIME types and minimum file size. Managed upload/deletion is fenced by database lifecycle claims and reference guards.

**Unverified live configuration:** actual bucket metadata, `storage.objects` grants/policies, anonymous write/overwrite/delete behavior and public GET behavior have not been queried or tested against production. A repository migration is not evidence of live Storage ACL state.

## 5. Backup and restore

No repository evidence was found that establishes:
- an independent scheduled database backup destination;
- a verified backup retention schedule and encryption-at-rest controls;
- a separate backup/escrow of `PINTEREST_TOKEN_ENCRYPTION_KEY` and its previous rotation key;
- a backup of required Storage objects;
- a documented, measured RPO/RTO;
- a successful isolated restore drill, including application startup and decryption of a test Pinterest token.

This is a **P0 operational verification gap** because database backup without the separately-held token encryption key may restore encrypted credentials that the application cannot decrypt. Supabase plan-level backup features and actual configuration must be checked in the project dashboard; code cannot prove them.

## 6. Other production-readiness blockers carried forward

- AUD-114: account deletion is not implemented end-to-end, while published privacy notices contain deletion timelines. Do not claim the erasure workflow is operational until lifecycle-aware payment handling, cleanup and backup expiry are implemented and tested.
- AUD-103: public image URLs are intentional; product/privacy wording must explain that possession of a URL allows retrieval.
- AUD-104: service-role bypass makes API ownership checks security-critical; live cross-account tests remain outstanding.

## 7. Required operator verification (read-only first)

1. In Supabase Dashboard, inspect actual Database role/table privileges and confirm migrations through 121 are applied in order. Do not paste keys or secrets into chat.
2. Inspect Storage bucket `pin-images`: public=true, expected MIME allow-list, minimum 5 MiB size limit, and no unintended anon/authenticated write/update/delete policies.
3. Confirm Supabase backup/PITR availability for the actual plan/project, backup retention, and recovery procedure. Do not assume dashboard feature availability from repository code.
4. Confirm a separate secure backup of current and previous Pinterest token-encryption keys, accessible only to the recovery operator.
5. Perform a restore drill into an isolated project, never over production. Verify schema/migrations, representative user/project/pin data, Storage object availability, backend startup, and decryption of a test credential.
6. Record measured RPO/RTO and keep the restore evidence outside the production database.

## Scope and validation

- Reviewed baseline/core grants, migrations 039–043, 076, 078, 079, 082, 084, 099, 109, 110, 113, 116, 120, 121, prior privilege/storage/route audits and Supabase client initialization.
- No live Supabase query, ACL check, Storage probe, backup-console inspection or restore was performed.
- SQL integration tests, Node tests, lint, build and CI were not run.
- No production migration, backup setting, secret, data, deployment or merge was changed.
