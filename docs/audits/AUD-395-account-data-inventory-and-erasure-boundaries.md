# AUD-395 — account data inventory and deletion/retention boundaries

**Date:** 2026-11-11  
**Status:** source/migration/documentation review; design only. No production access.

## Executive result

PinPosy does not yet have one authoritative account-owned data inventory or an executable deletion workflow. Data is spread across core relational records, independent task/financial journals, public Storage objects, Pinterest remote state, email queues, operational logs and backups. Deleting the user row cannot establish erasure and may either cascade-delete evidence or be blocked by RESTRICT relationships.

The existing image lifecycle is a strong component: managed object paths, reference guards, upload/deletion claims, quarantine, retryable definitive failures, blocked diagnostics and retention candidate inventory. It is not a complete per-account inventory: retention APIs are global/bounded and source ownership is not a complete cross-system deletion manifest.

The RU/EN privacy notices promise personal data and OAuth token deletion within 30 days. Source does not show an end-to-end deletion process or verified backup expiry capable of substantiating that promise. This remains a launch blocker until implementation and qualified legal review.

## Account data inventory

### 1. Identity, profile and authentication

- users: email, password hash, name/surname, credit snapshot, tariff/entitlement, email verification, admin flag, token_version and timestamps.
- auth_tokens: hashed password-reset/email-verification tokens, purpose, expiry and used timestamp.
- Session material: JWT in browser localStorage; token_version revokes server acceptance but does not erase the browser's stored token.
- OAuth state/attempt records: user linkage, generation/version, browser-binding and expiry/consumption metadata.
- Security/request logs: IP, user-agent, route/timing and error metadata. AUD-351 found raw error/provider/database message logging at some call sites.

**Disposition:** revoke sessions and one-time tokens at lifecycle transition; delete/anonymize profile and OAuth state after in-flight reconciliation. Treat log deletion separately through provider retention settings and structured log policy.

### 2. Projects and user-created content

- projects: owner, website URL, niche, tone, goal, language, extracted site summary and analysis timestamp.
- boards: project-linked titles, descriptions, status and cover URL.
- pins: board-linked title, description, image URL, model, credit cost, status and scheduling metadata.
- pin_review_queue: user-scoped draft/review JSON payload and optional pin identity.
- pin_schedules: source pin, Pinterest account, planned time/status, immutable snapshot title/description/image/destination, claim and execution metadata.
- Pinterest board/profile/pin/analytics data fetched from the user's connected account may also exist in application state/caches; confirm actual persistence and frontend cache behavior before claiming complete deletion.

**Disposition:** content rows may be removed only after schedules/publication attempts and task journals are reconciled. A snapshot is a separate copy of pin content. Review-queue JSON must be treated as arbitrary user content.

### 3. Generated content, AI prompts and provider usage

- pin_generation_requests: idempotency, request fingerprint, plan/result payload, state and ownership.
- pin_generation_tasks: provider task identity, prompts/creative context, status, provider price/refund/outcome, Storage URL and recovery journal.
- pin_regeneration_requests: source pin, prompt/result, provider identity/outcome, Storage URL and replay state.
- pin_generation_credit_reservations: reserved credit disposition tied to request.
- pin_generation_text_usage: text usage/provider-cost ledger.
- Provider refund reconciliation audit and operator action journal: request/task references, refund facts, evidence references and operator identity.

**Disposition:** do not delete unresolved task/provider/refund facts. Keep only minimum pseudonymous provider reconciliation records required for cost/refund after user content is removed. Delete prompt/result text and generated content once provider outcomes are terminal and retention rules allow it. Preserve provider cost facts independently of entitlement.

### 4. Images and Storage copies

- Supabase pin-images bucket is public by URL. Anyone possessing an object URL may fetch the object.
- pin_image_object_lifecycle: bucket/path, state, claim, attempts and errors.
- pin_image_retention_queue: object path, source types, queue state, attempts and claim metadata.
- Deletion claims, upload claims, quarantine/tombstones and replay references may outlive the visible pin.
- Image references exist in pins, schedule snapshots, generation tasks, generation result payloads and regeneration request/result payloads.
- External copies may exist in Pinterest, browser/CDN caches and provider systems; deleting the Supabase object cannot recall those copies.

**Disposition:** derive object paths only from trusted database ownership/reference mappings. Fence uploads, enumerate all DB references, wait for ambiguous Storage operations, then use existing claim/quarantine/reference-aware delete flow. Never bulk-delete a bucket prefix or derive keys from arbitrary public URLs. Distinguish local Storage deletion from third-party copies.

### 5. Pinterest and external publication

- pinterest_accounts: local account identity, username/scopes, encrypted access/refresh tokens, expiry and refresh metadata.
- OAuth connection/attempt state and refresh leases.
- pinterest_publications: remote Pinterest pin/board identifiers and publication history.
- Schedules, publication attempts, creative snapshots, unknown outcomes and manual-review records.
- Remote Pinterest pins/boards are separate copies under Pinterest's control.

**Disposition:** clear local credentials and invalidate refresh fences early. Stop future schedules. Preserve minimal tombstone and remote attempt facts until in-flight POSTs are reconciled. Remote deletion/revocation requires a separate supported Pinterest action and evidence; local disconnect is not proof of remote deletion.

### 6. Payments, credits and subscriptions

- subscriptions, credit_purchases, credit_transactions, payment creation/idempotency records and webhook exception/reconciliation data.
- Credit balance snapshot on users plus ledger and provider settlement/refund journals.
- Operator refund actions can reference operator and target user with RESTRICT relationships.
- email_outbox references subscriptions with ON DELETE RESTRICT.

**Disposition:** do not cascade-delete payment/credit evidence or mutate balances to simplify deletion. Retain only records required for approved accounting, tax, chargeback, refund and fraud purposes; pseudonymize user linkage where legally permissible. Separate provider-paid facts from product entitlement. Retention period and access policy require qualified legal/accounting approval.

### 7. Email and notifications

- email_outbox: event key, subscription reference, recipient email, locale, template key, JSON payload, retry status, claim metadata and last error.
- Migration 030 clears recipient and payload after successful send, but pending/dead rows can retain recipient/payload and a subscription FK can block physical deletion.
- Password reset/verification messages and subscription notifications are separate from the user profile.
- Configured email provider and its retention/region are not established by repository source.

**Disposition:** cancel unsent nonessential messages at deletion transition; ensure claimed senders re-check lifecycle before sending. Scrub recipient/payload from pending/dead/sent rows as appropriate while preserving minimal event deduplication/financial references.

### 8. Operational, diagnostic and backup copies

- Application and host logs, request metadata, older raw error messages, email provider logs, Render/Vercel/Supabase logs.
- Database backups, PITR/WAL, snapshots, Storage backups/versions and exports.
- Provider-side GPTunnel, Prodamus and Pinterest records.
- Browser localStorage and external browser/CDN caches.
- AUD-387 found no repository evidence proving independent DB + Storage backup consistency, restore verification or backup expiry. Actual provider settings were not inspected.

**Disposition:** define separate retention and deletion propagation for each provider. Selective deletion from immutable backups may be impossible; document backup expiry and restrict access until expiry. Do not claim all copies disappear within 30 days without evidence.

## Confirmed schema and lifecycle hazards

### AUD-395-01 — No single owner-to-data manifest

Data uses inconsistent owner representations: projects.user_id is UUID, while several baseline tables (auth_tokens, subscriptions, credit_purchases, pinterest_accounts, pinterest_publications, credit_transactions) use TEXT; some tables have no direct FK to users. Newer journals add further owner and request relationships.

**Risk:** a cleanup worker that follows only users.id foreign keys or cascades misses rows, while broad deletes can remove shared or retained evidence.

**Required:** create a versioned, read-only ownership inventory with explicit per-table owner resolution and orphan diagnostics. Include indirect paths (project → board → pin; request → task; account → schedule → attempt; subscription → outbox). Never infer ownership from free-form JSON or public URL without a validated mapping.

### AUD-395-02 — Content deletion can be blocked by durable history

Migration 087 changes pin_schedules.pin_id to ON DELETE RESTRICT so publication snapshots/history survive source-pin deletion. email_outbox restricts subscription deletion. Operator reconciliation records and refund actions also retain user/request references.

**Risk:** naive board/project/user cascades can fail partway or erase evidence if a different deployed constraint is present.

**Required:** design explicit ordered cleanup/anonymization with tombstones; preserve schedule and financial reconciliation until terminal; verify actual deployed FK catalog read-only before any migration.

### AUD-395-03 — Image retention inventory is not account deletion inventory

Migration 103 reports bounded global candidates from old completed journals; migration 109 claims/deletes queue items safely and blocks expired ambiguous leases. docs/storage-lifecycle.md explicitly states there is no periodic orphan sweeper and legacy orphan objects are not inventoried.

**Risk:** global retention age is not proof that an object belongs to a deleting user or is unreferenced by every live/retained table.

**Required:** add a deletion-scoped manifest of verified bucket/path pairs with all reference sources and claim state; then invoke existing per-object lifecycle. Include uploads, task replay references, snapshots and regeneration outputs.

### AUD-395-04 — Email outbox retains user data and can block erasure

Successful sends clear recipient and payload. Pending/dead rows retain recipient and payload, and subscription_id is restrictive. The generic claim worker does not itself establish user lifecycle eligibility.

**Required:** deletion-aware outbox cancellation/scrubbing and a worker pre-send fence. Retain only event dedupe metadata and minimum accounting link where approved.

### AUD-395-05 — Privacy notice promises exceed verified implementation

Active RU/EN policies promise deletion of personal data and OAuth tokens within 30 days. The repository still has no complete deletion state machine, object inventory, provider propagation or backup expiry evidence. The EN policy explains public image URL access; the RU policy needs equivalent clarity. AUD-350/351 also identify incomplete GPTunnel website-derived content and Vercel/email processor disclosure.

**Required:** do not silently weaken policy or claim completion. After provider configuration/contract review and workflow implementation, reconcile both localized policies with qualified legal review. State exceptions for financial evidence, backups, third-party copies and remote Pinterest content accurately.

### AUD-395-06 — Deletion cannot recall third-party copies

Published Pinterest pins, AI-provider request logs, payment-provider records, sent email, browser/CDN caches and backups are not controlled by a local DB cascade.

**Required:** maintain provider-specific deletion/revocation actions and evidence where supported; describe limits transparently. Do not report global erasure merely because local rows are gone.

### AUD-395-07 — No proof of complete backup expiry

Repository docs do not prove backup schedules, independent Storage backup, retention windows, PITR expiry or deletion propagation.

**Required:** obtain read-only provider evidence and perform restore/expiry drills. Until then, mark backup deletion as unverified and do not promise a fixed erasure deadline.

## Required deletion manifest

Each manifest item should contain:
- deletion_request_id and manifest_version;
- data class/table/object provider;
- exact primary key or trusted object path (never raw secret/token);
- owner resolution method and source row identity;
- disposition: delete / anonymize / retain_restricted / provider_action / backup_expiry;
- prerequisite dependencies and FK blockers;
- state, claim token, attempts, safe error code and timestamps;
- terminal evidence and retention deadline.

The manifest must be resumable and idempotent. A cleanup step must not erase the only record that proves the step ran. Keep the audit/manifest itself minimal and pseudonymous.

## Recommended order

1. Resolve lifecycle/version and global lock order from AUD-390–394.
2. Build and verify schema-wide owner mapping and orphan report, read-only.
3. Decide legal/accounting retention classes and third-party deletion limitations.
4. Implement deletion request + atomic session revocation and worker fences.
5. Reconcile generation, payments, Pinterest, Storage and email in-flight work.
6. Generate immutable deletion manifest and execute bounded, idempotent cleanup.
7. Anonymize retained financial/operator evidence and purge eligible content.
8. Verify backup/provider expiry and update RU/EN privacy notice only after evidence.
9. Add end-to-end disposable-DB/staging tests for duplicate requests, partial failure, FK restrictions, concurrent workers and final manifest completeness.

## Safety and limitations

Source/migration/documentation review only. No tests, SQL, production DB/catalog, Storage inventory, provider dashboards/contracts, logs, backups, email or external API calls were accessed. No account, balance, token, content, object or policy was changed. Actual deployed migration/FK state and provider retention settings remain unverified.
