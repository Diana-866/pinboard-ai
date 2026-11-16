# SQL integration test inventory — stage 0

**Date:** 2026-11-16  
**Branch:** `main`, source HEAD before this documentation update: `be3dadaff50ad51230b265662fc89cfd5d7f8818`  
**Scope:** the ordered 46-file manifest at `backend/test/postgres-integration-sql-manifest.txt`, plus the aggregate SQL integration script and the CI upgrade fixture.

## Purpose and limits

The manifest was read in full and all 46 referenced test files were fetched from the same `main` HEAD. Their opening contracts, fixture setup and declared migration prerequisites were reviewed to build this inventory. This pass classifies coverage and records the execution boundary; it is **not** a claim that every SQL assertion has been manually audited line by line or executed. The earlier static safety scan of all 46 files (database/role/system DDL, psql escape/connect, external file/process operations) is documented in `docs/PROJECT_STATE.md`; this pass does not upgrade that static scan into a runtime PASS.

The tests are deliberately destructive to their own fixtures in places (INSERT/UPDATE/DELETE and temporary trigger/function setup), so they must run only in the disposable database created by `scripts/verify-integration.ps1`. The aggregate `postgres-integration.sql` explicitly requires the full active migration chain 010–148. No production, PIN_TRIAL or user database was accessed.

## Manifest coverage map (46/46)

### Pinterest OAuth, publication, scheduling and recovery (16)

- `pinterest-unknown-schedule-reconciliation.integration.sql` — positive-only reconciliation requiring exact attempt/publication agreement.
- `pinterest-stale-schedule-recovery.integration.sql` — stale schedule recovery and retry safety tied to exact destination evidence.
- `pinterest-schedule-cancellation-race.integration.sql` — cancellation versus worker-claim race.
- `pinterest-schedule-claim-heartbeat.integration.sql` — heartbeat renewal fenced to the current publishing claim.
- `pinterest-refresh-disconnect-fencing.integration.sql` — stale token-refresh worker cannot restore credentials after disconnect.
- `pinterest-oauth.integration.sql` — OAuth attempt/callback single-use, disconnect/reconnect generation and session invalidation.
- `pinterest-account-foundation.integration.sql` — account-scoped refresh/disconnect foundation and lease fencing.
- `pinterest-multi-account-oauth.integration.sql` — identity-based OAuth upsert, reconnect stability and account caps.
- `pinterest-account-publication.integration.sql` — publication identity, retries, uncertain outcomes and recovery cases.
- `pinterest-known-remote-id-recovery.integration.sql` — preserve known remote Pin ID through ambiguous local completion.
- `pinterest-publication-board-integrity.integration.sql` — publication completion cannot rewrite reserved destination.
- `pin-status-publication-fencing.integration.sql` — atomic pin-status/publication fencing in migration 148.
- `pinterest-operator-reconciliation.integration.sql` — idempotent operator reconciliation journal and privilege boundaries.
- `admin-pinterest-inventory.integration.sql` — bounded recovery inventory without exposing image URLs/private worker fields.
- `pinterest-failed-board-reassignment.integration.sql` — failed publication board reassignment under immutable snapshot/attempt identity.
- `pinterest-failed-schedule-retry-identity.integration.sql` — retry requires exact failed attempt identity.

### Account deletion lifecycle (4)

- `account-deletion-publication-fence.integration.sql` — confirmed deletion blocks future/in-flight scheduled publication processing while active accounts remain unaffected.
- `account-deletion-reauth-version.integration.sql` — password re-authentication bound to token version and idempotent receipt.
- `account-deletion-durable-queue.integration.sql` — durable preflight job, acceptance event and worker lifecycle.
- `account-deletion-storage-manifest.integration.sql` — Storage object manifest, ownership and deletion-stage behavior.

### Billing, checkout and provider refund reconciliation (6)

- `prodamus-credit-fulfillment.integration.sql` — paid-credit fulfillment RPC and service-role boundary.
- `payment-creation-idempotency.integration.sql` — durable checkout idempotency and ambiguous-outcome fence.
- `payment-creation-settlement.integration.sql` — settlement restricted to exactly fulfilled provider orders.
- `provider-refund-reconciliation-guard.integration.sql` — unknown refund outcomes retain reservations; explicit non-refund permits safe release.
- `provider-refund-reconciliation-workflow.integration.sql` — refund reconciliation state and audit workflow.
- `provider-refund-operator-actions.integration.sql` — administrator refund journal, privilege and injected journal-failure behavior.

### Generation, regeneration and credit accounting (8)

- `pin-generation-credit-reservations.integration.sql` — reservation idempotency, reserved-credit protection, settlement and provider outcome classes.
- `credit-reservation-ledger-guard.integration.sql` — generic ledger debit cannot consume active reservations.
- `legacy-regeneration-reservation-guard.integration.sql` — legacy regeneration debit cannot consume reserved credits.
- `pin-generation-provider-quotes.integration.sql` — immutable quote persistence, claim fencing and reservation resizing.
- `pin-generation-completion-guard.integration.sql` — charge only after terminal task state and exact saved-pin/journal correspondence.
- `pin-regeneration-exact-quote.integration.sql` — exact regeneration quote persistence, claim fencing and repricing.
- `pin-generation-text-usage.integration.sql` — text-plan usage accounting under request claims.
- `pin-regeneration-journal.integration.sql` — durable regeneration idempotency and atomic charging.

### Image object lifecycle and retention (5)

- `pin-image-deletion-claims.integration.sql` — managed object-path parsing, traversal rejection and deletion-claim schema/lifecycle contracts.
- `pin-image-retention-inventory.integration.sql` — read-only inventory including regeneration replay references.
- `pin-image-replay-expiry.integration.sql` — replay-reference retirement and durable-queue safety; explicitly avoids deleting Storage objects during retirement.
- `pin-image-retention-queue.integration.sql` — worker lease/claim fencing and finalization.
- `pin-image-retention-queue-blocked-inventory.integration.sql` — read-only blocked-queue diagnostics.

### Privilege and function-hardening checks (4)

- `core-table-privileges.integration.sql` — client-role privileges on core tables.
- `pinterest-sensitive-table-privileges.integration.sql` — client access removed from Pinterest credential tables while service access remains.
- `security-definer-search-paths.integration.sql` — SECURITY DEFINER function search_path configuration.
- `billing-webhook-audit-privileges.integration.sql` — billing webhook audit schema and client-role access restrictions.

### Other / cross-cutting (3)

- `auth-recovery.integration.sql` — password reset and email verification token lifecycle.
- `board-creation-idempotency.integration.sql` — duplicate/racing board creation idempotency.
- `postgres-integration.sql` — broad regression assertions after the full migration chain, including auth, subscriptions, billing, generation, scheduling and related RPC contracts.

## Findings and execution boundary

1. Coverage is broad across the highest-risk stateful flows: credit reservation/settlement, provider uncertainty, Pinterest OAuth/publication fencing, account deletion, image retention and client-role privilege boundaries.
2. The manifest is ordered, and several focused tests declare minimum migration prerequisites. The aggregate test requires the complete active chain 010–148. Preserve the runner's manifest order; do not sort files alphabetically or run them against a shared database.
3. These tests are SQL-level integration checks, not substitutes for backend route/service tests, frontend tests, live Pinterest/Prodamus sandbox tests, Storage API tests or end-to-end user journeys.
4. Static inspection of file headers and test contracts cannot establish that assertions pass on the current schema. The required runtime gate remains the isolated Windows PostgreSQL 18.6 runner in UA-004.
5. No concrete SQL assertion defect is declared by this inventory pass. Any later finding must be tied to exact file/line and reproduced on the disposable database before changing migration/test behavior.

## Next steps

- Complete deeper assertion-by-assertion review and reconcile every test's prerequisites with the runner's fixture, migration order and manifest.
- Execute the SQL suite only through `scripts/verify-integration.ps1 -PostgresPort 55439` and verify its cleanup output.
- Only after SQL PASS proceed, in passport order, to the nine Bash concurrency scripts and then the backend Node suite.
