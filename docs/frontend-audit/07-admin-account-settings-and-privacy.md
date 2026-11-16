# Frontend audit 07 — admin, account settings, export/deletion and privacy disclosures

- Date: 2026-11-16
- Branch: `main`
- Scope: admin panel routing and admin API authorization, payment/financial exception diagnostics, account data export, account deletion request UI and worker gate, RU/EN privacy policy and terms pages.
- Nature: source-level review, defensive UI fixes and privacy-policy translation alignment. No production account deletion, admin mutation, provider configuration or user data export was executed.

## FE-08 — delayed account export/deletion responses could affect a different signed-in account

**Evidence before fix:** `SettingsView` kept export/deletion UI state and delayed logout timer without tying the operation to the authenticated user/request generation. A response from a previous user could download old account data after switching users, write stale status/error into the new user's settings, or run the 4-second logout timer against a newly signed-in account.

**Fix on main:**
- Added `isAccountOperationCurrent(currentOwnerId, requestOwnerId, currentRequestId, requestId)` and regression tests.
- Settings now captures owner and monotonically increasing request IDs for export and deletion.
- Old-owner export responses are ignored before download; old-owner errors/finally handlers cannot change the new owner's state.
- Deletion request completion/error/logout timer are owner- and request-fenced. Changing account increments request IDs, clears account-specific form state and cancels a pending logout timer.

## FE-09 — account export could be partial without an explicit UI warning

**Evidence before fix:** backend `buildAccountExport()` intentionally returns a JSON file with `degradedSections` when one or more table reads fail, rather than silently treating unavailable sections as empty. The settings UI downloaded the file but did not inspect `degradedSections`, so users could mistake a partial export for a complete copy.

**Fix on main:**
- Added `isCompleteAccountExport()`, requiring format version, account object, all expected array sections and an empty `degradedSections` array.
- Added unit tests for complete, degraded and malformed exports.
- Settings still allows downloading the returned file but displays a localized accessible warning if any section is missing/degraded.
- Added `exportPartialWarning` to all seven UI locales.

## Legal disclosure alignment

- English privacy policy already disclosed that pin images (including user uploads) are stored in a public object-storage bucket, that anyone with the public URL can view an image without signing in, and that deleting a PinPosy reference does not recall downloaded/cached/Pinterest copies.
- The Russian policy's content section omitted this material disclosure even though backend `pinImageLifecycle.js` explicitly requires the `pin-images` bucket to be public for Pinterest-compatible URLs.
- Added the equivalent Russian-language disclosure, keeping it aligned with the existing English policy. No storage bucket, access policy or image URL behavior was changed.

## Admin authorization and account lifecycle review

Frontend reviewed:
- `frontend/src/App.tsx` admin route guard and `AdminPanel.tsx`.
- `AdminSubscriptions.tsx`, `AdminPaymentCreationRequests.tsx`, `AdminBillingExceptions.tsx`, `AdminFinancialOperations.tsx`, `AdminPinterestSchedules.tsx`, `AdminEmailOutbox.tsx`, `AdminMail.tsx`.
- `SettingsView.tsx`, `accountDataExport.ts` + tests, `accountDeletionCopy.test.ts`.
- `PrivacyPolicy.tsx`, `TermsOfService.tsx`, `Contacts.tsx` and RU/EN legal markdown.

Backend reviewed:
- `backend/admin.js`, admin route declarations in `backend/index.js`.
- `backend/accountLifecycle.js`, `accountDeletionWorkerGate.js`, `accountDeletionWorker.js`.
- Relevant tests: `admin-access.test.js`, admin billing/financial operations/payment creation/Pinterest reconciliation tests, `account-lifecycle.test.js`, account deletion worker gate/worker tests and deletion SQL integration scripts.

**Contract observations:**
1. The client route guard checks `isAdmin`, but backend authorization is authoritative: all 22 `/admin/*` route declarations found in `index.js` include `requireAuth, requireAdmin`. `requireAdmin` reads `users.is_admin` by authenticated `req.userId` and fails closed with 403 on false/missing/error. A client-supplied role/admin flag is not trusted.
2. Admin billing exception, payment creation and financial operation queues are diagnostic/read-only; payment creation queue explicitly rejects malformed responses and does not expose idempotency keys or payment URLs. Admin refund/reconciliation actions pass narrow validated payloads to SECURITY DEFINER RPCs which re-check admin status and action identity.
3. Admin mail reply and Pinterest/storage reconciliation routes are admin-protected and rate-limited where they mutate external or durable state. The reviewed admin UI does not use demo users or fake payment records.
4. Account export requires authentication and uses explicit column allowlists for profile/Pinterest account data, excludes password hashes/session counters/OAuth access and refresh tokens, follows the project→board→pin ownership graph, paginates beyond PostgREST row caps, and reports unavailable sections in `degradedSections`.
5. Account deletion request requires authentication, explicit password reauthentication, and the worker rollout gate. On acceptance, the database RPC fences the account by changing account status/token version and invalidates existing sessions; content erasure is a separate durable worker pipeline. The UI correctly says access is disabled but data has not yet been deleted.
6. **Production deletion worker is not confirmed enabled.** Code enables it only when `ACCOUNT_DELETION_WORKER_ENABLED=true`; otherwise production logs `account_deletion_worker.disabled_in_production` and the deletion request endpoint returns 503. Privacy policy currently promises personal data/OAuth token deletion within 30 days. Production env/logs and actual 30-day operational capability are not visible to the assistant; added UA-003 to `docs/USER_ACTIONS.md`.
7. Both privacy policy versions list operator, data categories, providers, retention and rights. RU and EN now both explain the public visibility of pin images. Actual provider/region list, public bucket setting and legal operator/payment/refund details still require owner confirmation against production contracts/settings.

## Commits

- `90f76a1949fccb6070fe5aa161af6ac9b07e00e5` — owner-fence account export/deletion UI.
- `3fbb10d404329790a8aaa8651d0aec6539258f53` — account operation fence helper.
- `f528453643d2e0227a7ec0a2f1264200307c6170` — account operation fence tests.
- `4935297e40b55de313ae7f0d1d4ab0c027196e17` — Settings uses tested owner fence.
- `129c6e45a432e87c449615f7de2c8c7d1d736928` — account export completeness helper.
- `e532cf60fb182ec604f362168bccdda643e97899` — export completeness tests.
- `7ee28c0ac680972dfe0fcab8bcc1df95f2acc48e` — translation schema.
- `5cb84619e5405f06ec24ca5526c0e677ffb42e95`, `11a56053b8758eb017bc9b08f487ea2f8f1e69f5`, `47f73973192ce0f230133b833fdc7d1cd936b2d4`, `448955863cdea7bcb28c75de2bbfa4b33f5eb31d`, `b7a666c7659769597ab9854ab8adb50edc7a457b`, `a92589e7396e3ac4e894b19e76c7667333f0eea6`, `bfbf38c26c3b5bd1431e0dc6542f012a2baafbd2` — seven locale warnings.
- `075b73d23b908a9c758bc69f4b7f0dc8f66ae41c` — warn when export is incomplete.
- `0cd90e941deecd487f9a086037d10569eee222c5` — Russian public-image visibility disclosure.
- `67b52e2b02cf02f693f7db90b2ff57331e235ee6` — UA-003 task.

## Static readback and verification

Changed Settings, helper/test, export helper/test, RU/EN privacy policy, translation schema and all seven locales were fetched again from GitHub `main`: 13 targeted static assertions passed. Backend account lifecycle, worker gate, index routes, admin middleware and relevant tests were re-fetched: 10 targeted static assertions passed. Total: 23 static assertions.

The assertions cover owner/request fencing, stale logout cancellation, partial export warning, completeness validation, locale coverage, RU/EN image disclosure, explicit deletion worker opt-in, authenticated account endpoints, 22 admin routes with auth+admin middleware and fail-closed admin authorization.

Existing unit/integration tests were inspected but **not executed**. No typecheck, frontend tests, build, browser two-user export/deletion test, admin request test, PostgreSQL replay, account deletion worker execution, production account deletion, data export, or admin mutation was performed.

## Remaining risks / owner confirmations

- UA-003: confirm production deletion worker flag, startup/batch logs, staging deletion proof, public image bucket behavior, current subprocessors/regions and legal operator/payment details.
- The privacy policy's 30-day deletion promise must be backed by an enabled, monitored worker and a validated end-to-end staging cycle; do not invite users until that is confirmed or the policy is corrected with appropriate review.
- Account export completeness and account switching need browser-level tests.
- Full frontend audit and runtime gates remain open. Mandatory PostgreSQL replay `001_baseline.sql` + active `010–148`, SQL integration and backend runtime tests remain blocked by UA-001/UA-002.

No production account, account deletion, export download, admin action, storage setting, payment, provider or deployment configuration was changed.
