# Frontend audit 04 — Pinterest publishing and account lifecycle

- Date: 2026-11-16
- Branch: `main`
- Scope: direct Pinterest publishing control, account settings, account selection/board loading, OAuth browser binding, account token refresh, publication outcome reconciliation and schedule state helpers.
- Nature: source-level review and targeted user-identity isolation fixes. No live Pinterest, browser OAuth, provider, worker or database certification.

## FE-04 — mounted Pinterest controls could retain the previous authenticated user's account data

**Evidence before fix:**
- `PublishPinButton` loaded Pinterest accounts once with an empty-dependency effect. If the authenticated user changed while the component remained mounted, the previous account/board list and publication state could remain visible. An old in-flight publish response could also update the newly authenticated user's component state.
- `PinterestCard` also loaded account status once on mount and did not invalidate pending status/board requests when authenticated identity changed.

**Fix on main:**
- `PublishPinButton` now observes `useAuth().user.id`; on identity changes it clears account/board selection, previous success/uncertain/error state and in-flight UI lock before fetching the new user's accounts.
- Its board fetch is keyed to authenticated user ID as well as selected account/board. The account selector is disabled while a publish request is active.
- Publish completion/error handlers compare the request's captured owner ID with the current owner ID. A response from an earlier user's request cannot set success/error/uncertain state or release a newer user's publish lock.
- `PinterestCard` now observes authenticated user ID, clears account-specific state on identity change, and invalidates outstanding status and board requests through monotonically increasing request IDs. Stale status responses are ignored.

**Commits:**
- `669b0131e23e9d884a407f5da9b0ab2c3df7f9cc` — publish control scoped to authenticated user.
- `8b17d28e0cf8a633b6434c3d1931a48e29f91825` — Pinterest settings scoped to authenticated user.

## Pinterest and publication contracts reviewed

Frontend:
- `frontend/src/components/pins/PublishPinButton.tsx`
- `frontend/src/components/settings/PinterestCard.tsx`
- `frontend/src/components/settings/pinterestAccountState.ts` + tests
- `frontend/src/utils/pinterestPublishOutcome.ts` + tests
- `frontend/src/utils/pinterestPublishResponse.ts` + tests
- `frontend/src/utils/pinterestPinUrl.ts` + tests
- `frontend/src/utils/publishBoardSelection.ts` + tests
- `frontend/src/utils/scheduleMutationReconciliation.ts` + tests
- `frontend/src/utils/scheduleStatus.ts` + tests
- `frontend/src/utils/scheduleRetryReason.ts` + tests
- schedule status and retry presentation in calendar-related utilities.

Backend:
- `backend/pinterest.js`: account status, OAuth link/start/callback, disconnect, board listing, manual publish and scheduler worker.
- `backend/pinterestOAuthBrowserBinding.js`, `pinterestOAuth.js`, `pinterestAccountRequest.js`, `pinterestAccountRecord.js`, `pinterestRefreshRecovery.js`, `pinterestPublicAccount.js`, `pinterestSchedule.js`.
- Tests: OAuth browser binding, OAuth token expiry, account request/token retry, account record key rotation, refresh uncertainty, schedule worker and security contract tests.
- SQL concurrency sources: `pinterest-publication-concurrency.sh`, `pinterest-schedule-claim-concurrency.sh`, plus schedule/publication recovery and reconciliation migrations referenced by the backend tests.

**Contract observations:**
1. Publishing is tied to an explicitly selected account and board. An explicit board that does not belong to the selected account is not silently replaced by another board.
2. Frontend treats only a complete success response for the exact expected board and numeric remote Pinterest pin ID as confirmed. Malformed 2xx, transport failures, 409 and 5xx are ambiguous and fenced from blind duplicate POST.
3. Outbound Pinterest pin links are constructed only from numeric IDs; arbitrary server strings cannot become an external URL.
4. Backend verifies local pin ownership and approved status, resolves the authenticated user's Pinterest account, verifies remote board ownership, and reserves publication atomically before remote POST. Durable publication completion is checked against exact user/pin/account/board/remote-ID identity.
5. OAuth state is signed, purpose-bound, time-limited, tied to user token version, one-time attempt/generation and a browser binding hash. Browser proof is compared using timing-safe equality and stored in a Secure, HttpOnly, host-only, SameSite=Lax cookie. Callback checks the original browser proof and session version before committing credentials.
6. Pinterest access/refresh tokens stay server-side. Public account projection excludes credentials. Lazy encryption-key migration uses row-version optimistic concurrency and does not rewrite refresh rows fenced as uncertain.
7. Pinterest API token refresh is account-scoped. Read-only requests can perform bounded one-time 401 refresh and bounded 429 retry; non-idempotent publish explicitly disables automatic 429 replay.
8. Scheduler authenticates with a minimum-length timing-safe secret, claims one schedule at a time with lease heartbeat/fencing, requires exact attempt/publication ledger identity for positive reconciliation and keeps ambiguous outcomes fenced. Schedule mutation helpers require complete row identity and reject malformed/ambiguous responses.
9. Static review did not reveal another defect in the reviewed backend OAuth/publish/scheduler contracts. SQL concurrency sources were inspected but not run.

## Static readback and verification

After the two fixes, the changed component files were fetched again from GitHub `main`. Sixteen targeted static assertions passed:
- publish button auth binding, clearing old identities, ignoring stale owner responses, user-scoped board loading and disabling account changes during active publish;
- settings card auth binding, invalidation of old status/board requests and rejection of stale status response;
- exact-board publish response validation, ambiguous publish fencing, numeric-only outbound pin URL, no fallback from an explicit unavailable board;
- schedule mutation exact identity, unknown status fail-closed behavior and retry message sanitization;
- OAuth state/browser binding, timing-safe proof comparison, bounded rate-limit retry and optimistic token-key migration.

Existing frontend and backend test sources were inspected. **No frontend unit tests, TypeScript check, production build, browser account-switch test, OAuth browser round trip, Pinterest API request, scheduler worker, backend runtime suite or SQL concurrency script was executed.** Vercel build-rate-limit remains an external CI/deployment blocker from prior checks; no build result is inferred here.

## Remaining risks / boundaries

- The two component identity-reset effects have only source-level verification in this session; a browser test with two authenticated users and delayed old requests is still required.
- Pinterest API credentials, OAuth callback domains, allowed scopes and production redirect URI still need a live configuration review before inviting users.
- Scheduler reliability and no-duplicate guarantees still require the PostgreSQL replay and SQL concurrency tests to run in a disposable database.
- Pinterest integration rate limiting uses process-local MemoryStore; if backend is horizontally scaled, a shared limiter store is required. This is already documented in backend security contract tests and remains a scale-up requirement.
- Full frontend audit, runtime tests and release-readiness gates remain open.
- Mandatory NEXT in `docs/PROJECT_STATE.md`: clean disposable PostgreSQL replay of `001_baseline.sql` + active migrations `010–148`, SQL integration suite and backend runtime suite. UA-001 (PostgreSQL binaries/disk check) and UA-002 (GitHub Actions runner/billing/settings check) remain pending in `docs/USER_ACTIONS.md`.

No production data, Pinterest account, OAuth credential, payment provider or deployed configuration was changed.
