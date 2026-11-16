# Frontend audit 07 — admin billing, account lifecycle and legal UX

- Date: 2026-11-16
- Branch: `main`
- Scope: admin subscription/payment exception/financial operation views; admin route authorization; account export and deletion UX/API contract; Russian and English privacy policy and terms.
- Nature: source-level review and narrowly scoped copy/documentation corrections. No admin mutations, real payments, account deletion, production DB or deployment settings were used.

## Reviewed sources

Frontend:
- `frontend/src/components/admin/AdminPanel.tsx`
- `frontend/src/components/admin/AdminSubscriptions.tsx`
- `frontend/src/components/admin/AdminBillingExceptions.tsx`
- `frontend/src/components/admin/AdminPaymentCreationRequests.tsx`
- `frontend/src/components/admin/AdminFinancialOperations.tsx`
- `frontend/src/components/settings/SettingsView.tsx`
- `frontend/src/utils/accountDataExport.ts` and `accountDataExport.test.ts`
- `frontend/src/legal/privacy-policy.ru.md`, `privacy-policy.en.md`
- `frontend/src/legal/terms.ru.md`, `terms.en.md`

Backend:
- `backend/index.js`: account export/deletion routes and admin read routes.
- `backend/admin.js`: `requireAdmin` authorization guard.

## Authorization and safety observations

1. All reviewed admin data routes in `backend/index.js` are protected by `requireAuth` and `requireAdmin`; the admin guard reads `users.is_admin` for the authenticated `req.userId` and returns 403 when the check fails.
2. The payment-creation queue UI validates that the server response is read-only before rendering it. The UI explicitly prohibits automatic retry/reset and directs operators to reconcile the provider order first.
3. Financial-operation and webhook-exception screens are read-only views; no manual financial mutation was added.
4. Account export is authenticated and uses the backend `buildAccountExport(req.userId)` path. The route comment specifies an allowlist and excludes OAuth tokens, password hash and session counters.
5. Account deletion requires authentication, rate limiting and password re-authentication. The request route records a deletion request; it does not physically delete data in the request handler. Physical cleanup is a separate controlled worker lifecycle.
6. The frontend validates the complete deletion receipt before displaying success, clears pending UI work when the authenticated owner changes, and fences delayed logout so a response for a previous account cannot log out a newly authenticated account.

## Findings and changes

### FE-07A — privacy policy described email-only export despite an in-product export flow

**Evidence:** Settings exposes a self-service account-data download, backed by authenticated `GET /account/export`. Both language versions of the Privacy Policy said users could request an export only by email.

**Fix:** Russian and English privacy policies now describe the available **Settings → Data & Account** export and retain the support contact as a fallback when the feature is unavailable or assistance is needed.

### FE-07B — terms described account deletion as contact-only and omitted the two-phase lifecycle

**Evidence:** Settings exposes account deletion after password re-authentication. The backend request immediately restricts account access and records a pending request; physical deletion is handled separately.

**Fix:** Russian and English Terms now document the self-service route, password re-authentication, immediate access restriction and separate physical cleanup under the Privacy Policy. This is a factual UX clarification, not a claim that deletion is instantaneous.

### FE-07C — admin subscription empty state suggested creating a demo payment

**Evidence:** The admin subscription view displayed an instruction to create a demo payment when the list was empty. That instruction is inappropriate as a general production admin action and could be misleading where demo payments are disabled.

**Fix:** Replaced it with a neutral empty state: “Платежей пока нет.”

## Commits

- `832781a4f16a240129dc322172cc62887f20cfda` — Russian privacy export wording.
- `7f9af42658bc41c093b1af630a1f4ae2b14a646d` — English privacy export wording.
- `746a3649feb513e3af46a3d0a0c5cdbfc86043e9` — Russian terms account deletion wording.
- `4960ef76b82a8e4938fa0968e5f6e9011aa45c89` — English terms account deletion wording.
- `865771849e5453e24317a66e77e30601532cfa81` — admin subscription empty state.

## Readback and verification

All five changed files were fetched again from `main` after their commits. Static checks confirmed:
- both privacy policies mention the in-product export and support fallback;
- both Terms mention the self-service deletion path, password re-authentication and separate physical deletion;
- the admin subscription empty state no longer instructs operators to create a demo payment;
- account export and deletion endpoints retain authenticated routing;
- admin subscription, billing exception, payment-creation and unresolved financial-operation routes retain both authentication and admin authorization;
- the payment creation queue remains explicitly read-only;
- deletion receipt validation still accepts only a valid pending receipt.

Existing `accountDataExport.test.ts` was inspected but **not executed**. No frontend test suite, typecheck, production build, browser test, backend runtime test or SQL integration test was run in this audit. GitHub Actions runner provisioning and Vercel build-rate-limit remain independent blockers documented in `docs/USER_ACTIONS.md` / `docs/PROJECT_STATE.md`.

## Remaining items

- The full frontend file-by-file audit is still incomplete.
- Runtime confirmation of account export/deletion, admin routes, all UI locales and production legal-page delivery remains open.
- The legal text has been aligned with implemented UX only; this source review is not legal advice or a substitute for jurisdiction-specific professional review.
- Mandatory disposable PostgreSQL replay, SQL integration and backend runtime gates remain blocked by UA-001/UA-002.

No production account, user data, financial balance, payment provider, admin operation, database or deployment configuration was changed.


## Supplemental hardening — account operations, partial export and public image disclosure

A second source pass on the same package extended the initial review without creating a second report file.

### FE-08 — account export/deletion operations fenced by owner and request generation

`SettingsView` now captures the authenticated owner and request generation for account export and deletion. A delayed export response cannot download a previous user's data after account switching; stale catch/finally handlers cannot change the new user's settings state. Deletion completion, error state and delayed logout are fenced by the same owner/request identity, and switching users cancels the old logout timer.

Added `frontend/src/utils/accountOperationFence.ts` and tests covering same owner, changed owner, superseded request and missing identity.

### FE-09 — partial account exports now produce an explicit warning

Backend `buildAccountExport()` can return a JSON file with `degradedSections` when one or more database sections are unreadable. `SettingsView` previously downloaded such a file without telling the user it was incomplete. Added `isCompleteAccountExport()` and tests; the UI still downloads the file but now displays an accessible localized warning if the export envelope is malformed, a required section is missing, or `degradedSections` is non-empty. Added `exportPartialWarning` in all seven supported locales.

### Public image visibility disclosed in Russian

The English policy already disclosed that pin images live in a public object-storage bucket and that anyone with the public URL can view them. Backend `pinImageLifecycle.js` requires the `pin-images` bucket to be public for Pinterest-compatible image URLs. Added the matching Russian disclosure, including warning not to upload confidential/private content and noting that deleting the PinPosy reference cannot recall downloaded, cached or third-party copies. No storage access setting was changed.

### Deletion worker production gate — owner confirmation required

`ACCOUNT_DELETION_WORKER_ENABLED=true` is an explicit opt-in. `backend/index.js` starts the embedded worker only when enabled; production otherwise logs `account_deletion_worker.disabled_in_production`. The deletion request service fails closed with 503 while the worker is disabled. The privacy policy promises deletion within 30 days, but the assistant cannot inspect production environment variables or worker logs. Added UA-003 to `docs/USER_ACTIONS.md` to require owner confirmation of the production flag, startup/batch logs, staging deletion proof, actual subprocessors/regions, public image storage behavior and legal operator/payment details. Do not enable the worker in production without staging validation.

### Additional commits

- `90f76a1949fccb6070fe5aa161af6ac9b07e00e5` — account export/deletion owner fencing in Settings.
- `3fbb10d404329790a8aaa8651d0aec6539258f53` — account operation fence helper.
- `f528453643d2e0227a7ec0a2f1264200307c6170` — account operation fence tests.
- `4935297e40b55de313ae7f0d1d4ab0c027196e17` — Settings uses tested owner fence.
- `129c6e45a432e87c449615f7de2c8c7d1d736928` — account export completeness helper.
- `e532cf60fb182ec604f362168bccdda643e97899` — export completeness tests.
- `7ee28c0ac680972dfe0fcab8bcc1df95f2acc48e` and locale commits `5cb84619e5405f06ec24ca5526c0e677ffb42e95`, `11a56053b8758eb017bc9b08f487ea2f8f1e69f5`, `47f73973192ce0f230133b833fdc7d1cd936b2d4`, `448955863cdea7bcb28c75de2bbfa4b33f5eb31d`, `b7a666c7659769597ab9854ab8adb50edc7a457b`, `a92589e7396e3ac4e894b19e76c7667333f0eea6`, `bfbf38c26c3b5bd1431e0dc6542f012a2baafbd2` — partial export warning translations.
- `075b73d23b908a9c758bc69f4b7f0dc8f66ae41c` — show incomplete export warning.
- `0cd90e941deecd487f9a086037d10569eee222c5` — Russian public-image visibility disclosure.
- `67b52e2b02cf02f693f7db90b2ff57331e235ee6` — UA-003 owner action.

### Supplemental readback

After these changes, 13 static assertions passed across Settings, account operation helper/tests, export completeness helper/tests, RU/EN privacy policies and all seven locale files. Ten more passed across account lifecycle, worker gate, backend account routes, admin middleware and account/admin authorization tests. Total: 23 static assertions. The 22 admin route declarations in `backend/index.js` all include `requireAuth, requireAdmin`; `requireAdmin` checks the authenticated user in the database and fails closed. No frontend test, typecheck, build, browser account-switch test, worker run, production export/deletion, backend runtime or SQL test was executed.