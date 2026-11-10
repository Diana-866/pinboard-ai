# AUD-115 — User data inventory and processing flows

Date: 2026-11-08
Branch: `feat/persisted-boards-api`
Scope: static repository review. This is a code/data-flow inventory, not a legal opinion or confirmation of production vendor configuration.

## Executive summary

The active PinPosy privacy notice identifies the main categories of account, project, Pinterest and payment data, but it does not yet describe all observed processing paths with sufficient specificity.

The most material gap is the AI website-analysis flow: PinPosy fetches selected text from the URL supplied by a user and includes that extracted page content in a prompt sent to GPTunnel. The current notice describes prompts about niche/topics/titles and image descriptions, but does not explicitly say that excerpts from the user's submitted website may be sent to the AI provider.

Other gaps:
- Prodamus receives the account email address together with order, plan, amount and currency data to create a checkout link.
- The active policy names Render and Supabase but omits Vercel, which hosts the frontend in the documented deployment plan.
- The email setup guide defines VK WorkSpace and Unisender Go as the target mail providers but explicitly says their configuration and delivery are not yet verified. The privacy notice currently refers only to a generic email provider.
- Actual vendor regions, retention periods, contractual terms and production environment values cannot be confirmed from repository code.

No code, policy, migration, provider configuration, or production setting was changed in this audit. Findings are documented separately to avoid publishing unverified legal/vendor claims.

## 1. Data inventory

| Data category | Examples observed in code/docs | Purpose | Main processing/storage path |
|---|---|---|---|
| Account identity | Email, user ID, optional name/surname, preferred language | Registration, login, account support | Backend → Supabase |
| Authentication | bcrypt password hash, JWT, token version, hashed reset/verification tokens | Authentication and session recovery | Backend → Supabase; JWT stored in browser localStorage |
| Project/business context | Website URL, niche, site summary, goal, tone, language | Site analysis and content planning | Backend → Supabase; selected fields sent to GPTunnel |
| Website content | HTML page title, meta description, up to 15 H1/H2 headings, up to 5 extracted paragraphs | AI niche/summary analysis | User-supplied website fetched by backend; extracted content sent to GPTunnel |
| Generated content | Board names/descriptions, pin titles/descriptions, image prompts, generated images | Content creation and Pinterest publishing | GPTunnel; Supabase database and public Storage |
| Generation metadata | Prompt, model, aspect ratio, provider task ID, status, provider price, task result URL, storage URL | Idempotency, recovery, accounting and support | Supabase generation journal and task tables |
| Credits and billing | Credit balance, ledger entries, plan, order ID, amount, currency, payment status, provider payment ID | Charging, subscription and reconciliation | Supabase; selected checkout fields sent to Prodamus |
| Pinterest account data | Pinterest account ID, username, board IDs/names, pin IDs, OAuth scopes, encrypted access/refresh tokens, expiry | Account connection, analytics and publication | Pinterest API ↔ backend ↔ Supabase |
| Scheduling/publication | Scheduled time, timezone, destination URL, board ID, pin content snapshot, publication status and attempts | Scheduling and safe publishing | Supabase; approved pin content and image URL sent to Pinterest |
| Support/email | Recipient/sender email, subject, message body, incoming message metadata, email outbox payload | Account verification, password reset, notifications and support | Configurable SMTP/IMAP; Supabase outbox |
| Technical/security | Request IP/user-agent/time are described in policy; rate-limit state and request metadata in backend | Security, abuse prevention, troubleshooting | Backend/hosting logs and in-memory limiters; exact log retention not verified |

## 2. External processing flows

### 2.1 GPTunnel — AI text and image generation

Evidence:
- `backend/gptunnel.js` sends prompts in a chat-completion payload and image prompts in image-task payloads to `https://gptunnel.ru`.
- `backend/analyze.js` extracts page title, meta description, up to 15 headings and up to 5 paragraph excerpts from the submitted public website. Those excerpts are embedded in a text-generation prompt.
- `backend/boards.js` sends project niche, site summary, tone and goal to GPTunnel for board suggestions.
- `backend/pins.js` builds idea/image prompts using the user's topic, board/context, language and tone, then calls the provider for text and image work.

Data leaving PinPosy:
- User-provided business context and content instructions.
- Website-derived text excerpts (not just the URL or a short niche label).
- Pin/image descriptions and generation instructions.
- Provider task metadata is returned and journaled; source image/result URLs are later copied to PinPosy's Storage when successful.

Policy gap:
- The active RU/EN policy mentions prompts and image descriptions but does not explicitly describe the extracted website text sent to GPTunnel.
- The repository does not establish GPTunnel's prompt retention, training use, subprocessors, deletion controls or contractual data-processing terms. These must be checked against the actual provider agreement before making assurances.

### 2.2 Prodamus — checkout and payment notifications

Evidence:
- `backend/billing.js` reads the account email from `users` and passes it to `createPaymentLink`.
- `backend/prodamus.js` sends `customer_email`, order ID, product/plan description, amount, currency, quantity, SKU/plan, callback URL and success URL, plus a signature.
- The webhook path receives payment status and order/payment metadata; the billing code validates signature, matches the order, verifies amount/currency and activates entitlements through database RPCs.
- The reviewed exception audit stores minimized identifiers/reason/hash rather than raw webhook payloads.

Policy gap:
- Current policy only says Prodamus processes payments and card details never reach PinPosy. It should also disclose that the account email and order/plan/amount/currency details are sent to Prodamus to create and reconcile a checkout.
- The code supports RUB and USD currency values; actual enabled currencies and payment methods must be confirmed in the live merchant account.
- No card number storage was found in the reviewed checkout code. This is not a PCI assessment of the provider or full payment environment.

### 2.3 Pinterest — OAuth, account data and publication

Evidence:
- OAuth uses the official Pinterest API. Account identifiers, username, scopes and encrypted tokens are persisted in `pinterest_accounts`.
- Backend requests board and pin data for connected accounts; publication paths submit approved pin title/description, destination URL, selected board and public image URL.
- Tokens are encrypted in application code with AES-256-GCM when the required key is configured.
- Disconnect clears token columns through the v2 database function, while retaining account identity/history.

Policy alignment:
- The policy identifies Pinterest and the main permissions. It should additionally explain that the content approved for publishing, destination link and generated image URL are sent to Pinterest, and that account/publication metadata may remain after disconnect for history/reconciliation.
- The repository cannot prove that the required OAuth scopes and production migrations are active in the deployed environment.

### 2.4 Hosting, database, object storage and frontend delivery

Evidence:
- `docs/launch-steps.md` and `docs/domain-setup.md` document Vercel for the frontend and Render for the backend.
- Backend uses Supabase for authentication-adjacent records, PostgreSQL data and Storage.
- The `pin-images` bucket is intentionally public so Pinterest can retrieve images. A person with the object URL may be able to access the image.
- The current privacy notice names Render and Supabase but does not name Vercel.

Required verification:
- Confirm actual Vercel project, Render service and Supabase project regions in their consoles.
- Confirm whether Vercel receives any user data beyond ordinary browser requests and deployment/build metadata; do not assume it is only a static CDN without checking project settings, functions and logs.
- Confirm Supabase database and Storage regions separately; a hostname or generic provider label does not establish the region.
- Confirm provider log retention, backup locations, subprocessors and access controls.

### 2.5 Email — transactional and support mail

Evidence:
- `backend/email-verify.js` and `backend/password-reset.js` send recipient email and one-time verification/reset links through the configured transactional SMTP provider.
- The email outbox stores recipient email and a template payload in Supabase.
- `backend/mail.js` supports separate SMTP/IMAP configurations for support inbox, support replies and transactional mail.
- `docs/email-setup.md` proposes VK WorkSpace for support inbox/replies and Unisender Go for transactional email. It explicitly says the accounts, DNS authentication and Render secrets require owner setup and verification.

Policy gap:
- The active policy only says "Email provider" and does not identify the intended processors.
- Do not update the policy to state VK WorkSpace/Unisender Go are active until actual configuration and successful test delivery are confirmed.
- Verification and reset emails contain bearer links with one-time tokens. These are transmitted through SMTP and should never appear in application logs or support tooling.

## 3. Frontend-only and demo features

- `frontend/src/components/bot/FloatingStrategistBot.tsx` contains canned client-side responses in the inspected implementation. The inspected handler does not send chat messages to a backend AI service. Do not describe it as a live external AI processor unless a server-side implementation is later added.
- `frontend/src/components/competitors/CompetitorAudit.tsx` contains demo/static competitor profiles and external Pinterest profile links. The inspected implementation does not establish a competitor scraping or data-ingestion pipeline.
- `frontend/src/services/gemini.ts` contains legacy Gemini generation code, but the active PinGenerator imports only TypeScript types from that module and its current generation handler calls the backend `/boards/:id/pins/generate` endpoint. The Gemini module should be treated as legacy/unreferenced runtime functionality unless another caller is found; no Gemini API data flow was confirmed in the active generation path.
- No third-party analytics SDK was identified in the inspected frontend files. The policy's statement that third-party analytics are not used is consistent with this limited source review, but does not verify hosting/provider-level telemetry.

## 4. Policy gaps to resolve before public launch

1. Disclose that excerpts from a user-submitted public website may be sent to GPTunnel for analysis.
2. Disclose the exact categories sent to Prodamus: account email, order identifier, plan/product, amount and currency.
3. Add Vercel to the processor/hosting inventory only after confirming its role and processing configuration.
4. Replace the generic email-provider entry with verified support and transactional email processors and actual regions.
5. Explain Pinterest publication data flow: approved content, destination URL, board selection and public image URL.
6. Explain that disconnecting Pinterest removes OAuth credentials but may leave non-secret account identity, schedules/publication history and records for support/reconciliation.
7. Reconcile retention statements with implemented account deletion, Storage cleanup, email-outbox retention and provider backup/log expiry. AUD-114 documents the current deletion gap.
8. Verify and correct the claimed data regions and cross-border transfer language. Do not infer data residency from provider names.
9. Clarify whether request IPs are actually recorded by application code or by hosting infrastructure, and publish retention only when confirmed.

## 5. Recommended next actions

### P0 — before production onboarding
- Verify the legal operator/contact details with the account owner.
- Verify actual provider accounts, regions, DPAs/terms, subprocessors and retention settings.
- Decide whether GPTunnel may receive submitted website excerpts; if yes, disclose it clearly at the point of use and in the privacy notice.
- Confirm email providers before naming them as active.
- Align all data-deletion and retention claims with the implementation and backup lifecycle.

### P1 — implementation
- Add a user-facing export flow or documented support process that can reliably export account, project, pin, schedule, generation, credit and payment records with secrets excluded.
- Build the account deletion lifecycle described in AUD-114 before promising automated erasure.
- Add a structured data inventory maintained alongside integrations; require an update whenever a new external processor or new category of personal data is introduced.
- Review and minimize support inbox body access, outbox payloads and diagnostic logs.

### P2 — maintenance
- Remove or archive the unused legacy Gemini generator and obsolete PinSprig privacy-policy files after confirming no imports/callers remain.
- Add automated checks that the active RU/EN privacy policy files are the ones rendered by the app and that provider names/data-flow descriptions remain synchronized with the architecture docs.

## 6. Verification limits

- Reviewed source and repository documentation on `feat/persisted-boards-api`.
- No production network traffic, provider account, environment variables, vendor console, DPA, or live database was inspected.
- No claim is made about actual provider retention, training use, subprocessor list, or processing region beyond what repository docs currently state.
- No data export, account deletion, payment, Pinterest publication, email delivery or AI provider request was executed.
- No tests were run; no production configuration or deployed service was changed.
