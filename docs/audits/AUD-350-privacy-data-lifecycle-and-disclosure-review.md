# AUD-350 — user data privacy, retention and security review

**Date:** 2026-11-11  
**Status:** SOURCE REVIEW COMPLETE  
**Scope:** Repository/code/documentation review only. No production data or provider console accessed.

## Executive summary

PinPosy has meaningful protections: bcrypt password hashes, hashed one-time auth tokens, versioned JWT invalidation, AES-256-GCM encryption for Pinterest OAuth tokens when configured, deliberate profile projections, and restricted database access.

However, the current privacy and self-service lifecycle is not production-complete. The highest-risk gaps are:
1. Account deletion is not implemented end-to-end, while the active RU/EN notices promise deletion within 30 days.
2. No self-service export endpoint/UI exists, despite the policy offering export by email.
3. The AI website-analysis path sends extracted page text to GPTunnel, which is not explicitly described in the current provider disclosure.
4. The policy's processor inventory/regions and actual deployed providers need operator verification; the documented Vercel frontend is omitted from the policy inventory.
5. Generic raw error logging and email outbox retention need a documented allowlist/retention policy.
6. Public image URLs are intentionally accessible to anyone who has the URL; this is not equivalent to private storage.

This audit is not legal advice and does not verify the correctness of operator identity, tax details, provider contracts, international transfer mechanisms, or actual deployed regions. Do not copy identifying operator/tax data into additional documents.

## Data inventory and external disclosure

The repository inventory identifies:
- Account identity and authentication: email, optional name/surname, password hash, JWT/session version, hashed verification/reset tokens.
- User content: website URL, niche, tone, goals, site summary, boards, pins, prompts, generated images and generation history.
- Pinterest: remote account metadata, scopes, encrypted OAuth credentials, boards/pins/analytics, publication/schedule history.
- Financial: credits, ledger, purchases, subscriptions, order IDs, amount/currency/status and provider references.
- Operational/support: IP/user-agent/request metadata, email recipients and outbox payloads, provider task state and error information.

### External processors evidenced by source/docs
- **GPTunnel:** receives text-generation prompts and image descriptions. The website-analysis route also extracts page title/meta, headings and paragraph excerpts from the URL supplied by the user and sends those excerpts as AI context. Current RU/EN notices do not describe this website-derived text transfer with enough specificity.
- **Prodamus:** checkout creation sends account email plus order, plan/product, amount, currency and callback/success URL data. The notice mentions payment processing but should explicitly describe checkout metadata transfer.
- **Pinterest:** receives approved pin content, image URL, destination URL and selected board for publication; account metadata is retrieved through granted OAuth scopes.
- **Supabase:** stores account, application, payment, integration and journal data; Storage hosts public pin images.
- **Render and Vercel:** documented backend/frontend hosting. The active notice names Render and Supabase but omits Vercel. Actual deployment/project settings and data processing must be checked.
- **Email providers:** recipient and message/template data are sent for verification, password reset and support. The actual configured provider and region are not proven by source alone.

Do not assert vendor regions, retention periods, training policies, subprocessors, or transfer safeguards without checking current contracts and live settings.

## Findings and priorities

### AUD-350-01 — Account deletion is not implemented end-to-end (Critical / P0)
- No account deletion request endpoint or completed cleanup worker was identified in the audited route inventory.
- The design-only runbook identifies lifecycle, payment-webhook, foreign-key, scheduler, and Storage race hazards.
- Payment RPCs and webhook paths need a lifecycle-aware settlement/entitlement model before deletion can be safely implemented.
- User-row cascades can destroy financial records; email outbox references may restrict deletion.
- Late successful payment webhooks can otherwise grant entitlements after a deletion request.
- The active privacy notices promise deletion of personal data and OAuth tokens within 30 days, but no executable end-to-end workflow or verified backup expiry supports that promise.

**Required:** design a resumable, idempotent lifecycle with session revocation, blocked new work, safe payment reconciliation, token revocation, owned-object cleanup, minimum financial retention/anonymization, and concurrency/partial-failure tests. Do not add a superficial account-delete endpoint or hard-delete cascade.

### AUD-350-02 — Data export is not available (High / P1)
- No self-service export endpoint, job, download route or Settings UI was identified.
- The existing export contract is a design specification, not an implementation.
- It correctly requires owner derived from authenticated session, explicit field allowlists, secret exclusions, ownership-checked queries, consistent snapshot semantics, private short-lived downloads and explicit partial-export status.
- Do not expose passwords/hashes, JWTs, Pinterest tokens/ciphertext, OAuth state, provider credentials, webhook secrets, lease tokens, stack traces or raw provider payloads.
- Media ownership mapping is incomplete; never infer object keys from public URLs or promise images will be included.

**Required:** complete the schema ownership map, finalize a versioned export DTO, implement bounded asynchronous private export, and test cross-user isolation, secret exclusion, archive expiry, partial failure and large-account behavior.

### AUD-350-03 — AI website-analysis disclosure gap (High / P1)
- User-supplied website content is fetched and excerpts are included in prompts sent to GPTunnel.
- The active RU/EN policy describes prompts and image descriptions but not this website-derived content transfer with sufficient clarity.
- GPTunnel retention, model training, subprocessors, deletion controls and contractual commitments are not established by code.

**Required:** update policy only after verifying provider terms and actual data flow; explain that user-submitted website text may be sent to the AI provider for analysis.

### AUD-350-04 — Processor inventory and international transfer disclosures need verification (High / P1)
- Vercel is documented as frontend host but omitted from the active policy processor list.
- Actual email provider is not confirmed by repository source.
- Active policy region claims must be checked against current project/hosting/database/Storage configuration.
- Current vendor agreements, subprocessors, log retention, support access and transfer safeguards are not verified.

**Required:** operator must verify exact production vendors, services, data regions, contracts and transfer basis before final policy publication. Do not guess or publish provider regions from old notes.

### AUD-350-05 — Logs and email outbox retention/redaction are incomplete (High / P1)
- Central Express error handling logs raw error objects for server errors; other handlers log provider/database error messages.
- No blanket credential disclosure was proven, but raw error objects make a guarantee of redaction difficult.
- Email outbox persists recipient email and JSON payload; no complete retention/cleanup schedule was evidenced in reviewed migrations.
- Billing webhook exception records are intentionally minimized and do not retain raw webhook bodies, which is a positive pattern.

**Required:** introduce structured allowlisted logs (event code, route, correlation ID, safe status), redact authorization/cookies/tokens/email/payment payloads and provider response bodies, and define retention/expiry for delivered, dead-letter and support mail records. Review existing provider-host logs separately.

### AUD-350-06 — Pinterest token encryption depends on secret management (High / P1)
- AES-256-GCM uses fresh 12-byte IV and authenticated tag; active key must be exactly 32 bytes.
- Optional previous key supports rotation and lazy re-encryption.
- Legacy plaintext tokens remain readable and are migrated lazily when encryption is configured and an account is loaded.
- Source cannot prove production key presence, full migration of legacy rows, backup/escrow or successful rotation.
- Losing active and previous keys can make ciphertext unrecoverable.

**Required:** verify production configuration and inventory legacy plaintext rows without exposing token values; escrow active and previous keys independently; rehearse rotation/decryption in isolation. Never place keys in frontend variables, repository or same database.

### AUD-350-07 — Public Storage image URLs are a disclosure boundary (High / P1)
- pin-images is intentionally public so Pinterest can fetch images.
- Anyone possessing an object URL may retrieve the image; unlisted is not private.
- Pin deletion does not alone prove that all snapshots, journals and Storage references are removed.
- Existing lifecycle claims and reference guards reduce unsafe deletion risk, but there is no evidence of a complete orphan inventory/sweeper.

**Required:** disclose public image access clearly; maintain verified owner-to-object mapping; use reference-aware deletion; never bulk-delete based only on age or guessed URL paths.

### AUD-350-08 — Authentication and session storage have residual risk (Medium / P2)
- Passwords are bcrypt-hashed; reset/verification tokens are hashed; token version is checked against DB.
- Browser JWT is stored in localStorage, so same-origin XSS could read it.
- A coordinated HttpOnly-cookie + CSRF migration would require backend/frontend/session design and tests; do not make a frontend-only change.
- Ordinary client logout clears local token but does not constitute server-side per-device revocation.

**Required:** maintain CSP/XSS defenses, dependency hygiene and careful output encoding; design cookie migration as a separate coordinated project if product architecture permits.

### AUD-350-09 — Obsolete PinSprig policy source is a maintenance hazard (Medium / P2)
- frontend/src/data/privacyPolicy.ts and .txt contain an obsolete PinSprig notice with unrelated product/provider/operator statements.
- The active privacy page imports the localized RU/EN Markdown files, not this stale source, according to the prior repository audit.
- The stale content could be accidentally reintroduced by a future refactor.

**Required:** perform repository-wide import/reference check, then remove or clearly archive stale files in a separate low-risk change. Do not copy their content into active policy.

## Safe implementation order

1. Confirm actual production processor inventory, regions, contracts and operator-approved retention/legal requirements.
2. Implement deletion lifecycle design and payment/webhook state separation; add database concurrency tests before any UI.
3. Implement export with explicit DTO and private expiring downloads; exclude secrets and raw provider data.
4. Add structured redacted logging and email outbox retention.
5. Verify token encryption configuration, remove/migrate legacy plaintext safely, and document key rotation/escrow.
6. Reconcile active RU/EN policy with actual deployed behavior; remove stale policy source only after import search.
7. Add privacy controls in Settings only when their backend workflows are implemented and tested.

## Operator decisions and verification required

- Confirm legal operator details and privacy contact are correct and current; do not infer from code.
- Confirm actual Vercel, Render, Supabase, GPTunnel, Prodamus, Pinterest and email providers, their service regions and current contractual terms.
- Decide required financial evidence retention and anonymization period with qualified legal/accounting advice.
- Decide whether support messages and AI prompts are included in export and under what safe redaction rules.
- Confirm whether public generated images are retained after pin deletion/account deletion, and for how long.
- Confirm actual production key configuration and whether any legacy plaintext Pinterest credentials remain.

## Validation and limitations

- Reviewed prior data inventory, deletion design, export contract, token crypto implementation, auth/error handling and active RU/EN privacy policy sources.
- No live database queries, user data exports, deletion, token decryption, provider-console checks, legal review, tests, build, lint, CI or deployment were performed.
- No schema, policy, endpoint or production configuration was changed by this audit.
