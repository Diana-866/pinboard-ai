# AUD-114 — Personal data protection and data lifecycle

Date: 2026-11-08
Branch: `feat/persisted-boards-api`
Scope: repository-level review only. No production database, provider account, environment variable, or deployed service was accessed.

## Executive summary

The repository has meaningful protections for credentials and account isolation, but **account deletion and retention are not implemented end-to-end**. The published PinPosy privacy notices currently promise deletion timelines and data rights that the inspected backend does not yet operationally fulfil. This is a production-readiness blocker before inviting users to rely on account erasure.

No schema or endpoint change was made in this audit. The existing account-deletion design explicitly identifies unresolved payment, foreign-key, scheduler, and Storage races; implementing a superficial DELETE endpoint would risk destroying financial evidence or leaving live credentials and content behind.

## Findings

### AUD-114-01 — Account deletion is not implemented (Critical)

Evidence:
- The inspected backend route inventory contains no user-account deletion or deletion-request endpoint.
- `docs/runbooks/account-deletion-design.md` is explicitly marked design-only.
- There is no lifecycle marker on the user row in the reviewed schema/migrations.
- Migration 009 uses cascading user foreign keys for multiple records, including auth tokens, credit transactions, subscriptions, credit purchases, Pinterest accounts/publications and project data.
- `email_outbox.subscription_id` uses `ON DELETE RESTRICT`; this is another dependency that must be handled before any physical user deletion.
- The design document notes that a delayed successful Prodamus webhook can still grant credits or activate a subscription after a deletion request unless the payment RPCs become lifecycle-aware.

Impact:
- The privacy policy's right-to-erasure wording cannot currently be fulfilled by an in-product deletion workflow.
- A direct `DELETE FROM users` risks destroying financial records, violating referential integrity, or racing a delayed payment webhook.

Required direction:
1. Introduce an explicit `deletion_pending` lifecycle state and atomically revoke sessions.
2. Block new authenticated work, payment creation, generation, OAuth callbacks and schedule claims for pending accounts.
3. Resolve payments/webhooks with a durable settlement-versus-entitlement model and a consistent SQL lock order.
4. Build idempotent, resumable cleanup for Pinterest credentials, schedules, publication journals, projects, pins, generated objects and email outbox.
5. Preserve only the minimum legally required financial evidence, with an agreed retention schedule.
6. Add concurrency and partial-failure integration tests before exposing deletion in the UI.

### AUD-114-02 — Published deletion/retention promises exceed implemented behavior (Critical)

The active localized policy files are:
- `frontend/src/legal/privacy-policy.ru.md`
- `frontend/src/legal/privacy-policy.en.md`

Both say account data remains while active, and that personal data and Pinterest OAuth tokens are removed within 30 days after account deletion. The backend has no account-deletion workflow, so the 30-day promise is not currently backed by an executable process.

Both policies also say Pinterest tokens are deleted within 24 hours after disconnect. The reviewed disconnect RPC in migration 031 does clear `access_token`, `refresh_token`, and `expires_at` and sets `disconnected_at` atomically; this is a materially stronger implementation than account erasure. However, actual production behavior still depends on migration 031 being applied and the deployed backend calling the v2 RPC.

The active RU/EN policies identify the operator and contact details. Those identity/contact details and the listed processor regions must be re-confirmed by the operator before launch; code inspection cannot validate their legal correctness or current vendor data-processing locations.

Separate stale source:
- `frontend/src/data/privacyPolicy.ts` and `frontend/src/data/privacyPolicy.txt` still contain an obsolete PinSprig policy with unrelated provider, contact, and operator details.
- `frontend/src/pages/PrivacyPolicy.tsx` imports the localized RU/EN Markdown files, not the stale PinSprig source. The stale files appear not to be the active page source, but they are a maintenance hazard and should be removed or clearly archived after confirming no other imports.

Required direction:
- Do not state a deletion deadline until an actual cleanup job, backup-expiry policy and operational owner exist.
- Reconcile policy wording with the real deployment, actual data flows, legal operator details, and contractual retention obligations.
- Remove/archive the obsolete PinSprig policy source in a separate low-risk cleanup after a repository-wide import check.

### AUD-114-03 — Pinterest OAuth credentials have application-layer encryption (Good, with key-management dependency)

Evidence:
- `backend/pinterestTokenCrypto.js` uses AES-256-GCM, a fresh 12-byte IV, and a 16-byte authentication tag.
- New token values are encrypted before persistence. The key is supplied through `PINTEREST_TOKEN_ENCRYPTION_KEY` and must decode to 32 bytes.
- An optional previous key supports rotation. Old ciphertext is lazily re-encrypted when an account is read.
- Legacy plaintext values are still readable and are migrated lazily when an encryption key is available.
- Migration 039 revokes client access to Pinterest credential tables; migration 076 also removes direct client grants from core account tables.
- The disconnect RPC in migration 031 clears stored token fields while retaining the disconnected account identity/history.

Risks / operational prerequisites:
- The previous encryption key must remain available until all records are migrated; losing both usable keys makes stored credentials unrecoverable.
- The key needs a separate protected backup and documented rotation/recovery procedure. Do not store it in the repository, frontend `VITE_*` variables, or the same database it protects.
- The repository cannot prove that the production environment has the key set, that legacy plaintext rows have been fully migrated, or that migrations 031/039/076 are applied.
- A disconnected row retains Pinterest identity and publication history. This should be described accurately in retention wording; disconnect is not account erasure.

### AUD-114-04 — Authentication secrets are hashed; browser session remains exposed to XSS (Known risk)

Evidence:
- `backend/auth.js` hashes passwords with bcrypt (cost factor 10) and does not return password hashes.
- Password reset and email-verification tokens are stored as SHA-256 hashes in `auth_tokens` (documented and previously audited).
- The frontend stores the application JWT in `localStorage`; this is documented in the active privacy notice and means a successful same-origin XSS could read a session token.
- Password reset increments `token_version`; authenticated API calls compare the JWT version with the database value.

Direction:
- Keep the localStorage risk explicit until a coordinated HttpOnly-cookie + CSRF migration is designed and tested. Do not attempt a frontend-only cookie conversion.
- Confirm bcrypt cost factor against current production capacity and upgrade policy in a separate performance/security task.

### AUD-114-05 — Public image URLs are an intentional disclosure boundary (High)

Evidence:
- `backend/storage.js` creates/checks the `pin-images` bucket as public.
- `backend/pinImageLifecycle.js` requires public visibility so Pinterest can fetch generated pin images.
- Managed object deletion is guarded by database claims and reference-write triggers in migration 070; deletion is not a blind Storage remove.
- `docs/storage-lifecycle.md` describes legacy/orphan limitations and states that there is no periodic orphan sweeper.

Impact:
- Anyone possessing a public object URL may be able to retrieve the image. Unlisted URLs are not equivalent to private storage.
- Deleting a pin row does not, by itself, prove that all related Storage objects, schedule snapshots or generation journal references are gone.
- Existing legacy orphans are not automatically inventoried/deleted.

Direction:
- Make public image visibility clear in the privacy notice/product UX.
- Account cleanup must enumerate only objects whose ownership is provable, preserve shared/referenced objects, and use the existing lifecycle claim protocol.
- Define an orphan inventory and retention process; do not bulk-delete by age or guess object paths.

### AUD-114-06 — Payment audit trail is minimized, but retention and deletion policy are unresolved (High)

Evidence:
- Migration 029 creates `billing_webhook_exceptions` with order/status/amount/reason/hash/timestamp fields and explicitly avoids storing raw webhook payloads or customer PII.
- Payment rows are linked to users and cascade on user deletion in migration 009.
- The design runbook identifies late-success webhook behavior and the need to preserve evidence without granting entitlements to an account being deleted.

Direction:
- Separate payment settlement evidence from entitlement state.
- Retain only the minimum accounting/reconciliation data required by the applicable law and payment-provider contract.
- Ensure admin access, retention and eventual anonymization are explicitly tested.

### AUD-114-07 — Operational logs and email outbox need a retention/redaction policy (Medium)

Evidence:
- Backend error handling logs raw error objects in the final Express error handler; several route-specific handlers log provider/database error messages.
- The transactional `email_outbox` stores `recipient_email` and a JSON `payload`, and is not governed by an explicit retention job in the reviewed migrations.
- Billing webhook exception records intentionally store a minimized event fingerprint rather than the raw payload.

Risk:
- Error objects may include provider response details or request context depending on the library/error shape. No direct credential leak was proven in this review, but a blanket `console.error(err)` makes the log boundary difficult to guarantee.
- Email recipients and payloads may remain after delivery unless an explicit retention/cleanup policy is added.

Direction:
- Introduce structured allow-listed logging (error code, route, correlation ID, safe status only); never log Authorization headers, cookies, passwords, OAuth tokens, reset/verification links, webhook signatures, or raw payment payloads.
- Minimize outbox payloads and define deletion/retention behavior for sent/dead records.
- Confirm retention/rotation periods and access controls in Render/Supabase/provider consoles; repository code cannot establish provider log retention.

## Backup / restore

No repository evidence establishes a verified backup schedule, independent backup location, encryption-key escrow, or successful restore drill for production Supabase. A database backup alone is insufficient if the Pinterest token encryption key is lost. This remains an operational verification task, not a code-level pass.

Required acceptance criteria:
- Independent encrypted backups of database and required Storage objects.
- Encryption key backup kept separately under restricted access.
- Documented RPO/RTO and retention.
- Periodic restore drill into an isolated environment, including a token-decryption smoke test using a test account.
- Evidence that backup expiry aligns with the published deletion commitments.

## Priority plan

1. **P0:** Keep account deletion unavailable until lifecycle/payment/cleanup semantics and tests are complete; reconcile policy promises with actual capabilities.
2. **P0:** Confirm operator identity/contact, processors, data locations, and retention wording in both active policy languages.
3. **P1:** Implement deletion lifecycle and race-safe cleanup as a staged backend/database project; do not use direct user-row deletion.
4. **P1:** Establish backups, key escrow/rotation, retention and restore drills.
5. **P2:** Replace broad raw error logging with structured redacted logging; add email outbox retention.
6. **P2:** Remove or archive the obsolete PinSprig policy source after import verification.

## Verification limits

- Reviewed repository source, migrations, and documentation on the branch named above.
- No live Supabase queries, production environment inspection, vendor-console review, legal review, or data-subject request simulation was performed.
- No migration, account deletion, Storage deletion, key rotation, provider change, deployment, or PR merge was performed.
- Existing integration tests were not executed as part of this audit.
