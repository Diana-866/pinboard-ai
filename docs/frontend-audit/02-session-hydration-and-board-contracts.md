# Frontend audit 02 — session hydration and project/board contracts

- Date: 2026-11-16
- Branch: `main`
- Scope: login/session restoration and the project/board creation + editing path from frontend to backend.
- Nature: source-level contract review and targeted fix. No runtime/browser/DB certification.

## FE-02 — login navigated to protected app even when /me hydration failed

**Evidence before fix:** `frontend/src/pages/Login.tsx` awaited `refreshUser()` but ignored its boolean result, then always navigated to `/app`. `AuthContext.refreshUser()` returns `false` when the profile request fails; on transient network/5xx errors it deliberately preserves the stored token and leaves `user=null`. The previous route guard only checked token presence. Therefore a valid credential response followed by a failed profile request could mount the application shell with no authenticated profile.

**Changes:**
- Login now checks the `refreshUser()` result and remains on the login page with a localized, actionable error when the profile cannot be loaded.
- Added `sessionLoadError` and `sessionLoading` messages for all seven supported interface locales (en, ru, es, pt, de, fr, zh).
- `AuthContext` exposes `isAuthReady`, set only after the initial `/me` hydration attempt settles.
- `RequireAuth` now waits for initial hydration and requires both a stored token and a loaded user profile before mounting protected screens. If hydration settles without a user, it redirects to login; transient failures do not clear the stored token.
- Extracted `getProtectedRouteState()` to `frontend/src/utils/protectedRouteState.ts` and added four unit tests covering no-token redirect, loading, failed-profile redirect and authenticated render. This test file is included by the existing `frontend/package.json` test glob `src/utils/*.test.ts`.

**Commits:**
- `1afda7d2868bfddc8c14b145b1a7a1c0da0bd597` — localized profile hydration failure.
- `323f475e6588a96254aa18a6b63aaff64737a316` — Login checks refresh result.
- `1f9411eb57d9fb737de2bf0a62aa7603748ae366` — localized session-loading copy.
- `8f814fc2d3de9d7490a83e3d83afd1d598fb2846` — initial auth readiness state.
- `332725f24c1bb5e4e5f68a69c8bd84f56cfc2678` — protected route hydration gate.
- `371816c467b2de854bc14ea72384284957558cb4` — testable route-state helper.
- `4f3ddbd973c75ed2e41514211c326c83f376ebb3` — App uses route-state helper.
- `472dc594a5cb0ea2d945918fad1189085cdb0522` — route-state regression tests.

## Project and board contract review

Reviewed:
- `frontend/src/components/boards/BoardsManager.tsx`
- `frontend/src/utils/persistedBoards.ts` and its tests
- `frontend/src/utils/projectProvisioning.ts` and its tests
- `frontend/src/App.tsx` board create/update handlers
- `backend/index.js` project and board endpoints
- `backend/boardPatch.js`, `backend/boardSerialization.js`, `backend/projectProvisioningOrder.js`
- Backend tests for board patch validation, board create idempotency SQL, project ordering and serialization (source review only).

**Contract findings:**
1. Frontend board creation uses one UUID request key for the logical create operation and preserves it across retries; successful creation rotates the key. The backend validates UUID shape, verifies project ownership, persists a request fingerprint and uses the unique `(project_id, create_request_id)` conflict target to make retries converge on one row. Reusing the key for a different payload returns conflict rather than mutating the original.
2. Project provisioning is coalesced per user within the browser runtime. The frontend reads the user's existing projects before creating one; backend `GET /projects` scopes by `req.userId` and returns a deterministic oldest-first order, so both sides select the same default project.
3. Backend `PATCH /boards/:id` first performs an owner check, rejects unknown fields, validates and bounds title/description/category, and rejects an empty patch.
4. Board serialization strips internal idempotency request/fingerprint fields and nested project `user_id`. Frontend board mapping rejects malformed arrays/rows rather than silently presenting a partial list as complete.
5. Static review did not reveal a new contract defect in this path. This is not a claim that the endpoints or SQL constraints have passed live integration tests.

## Static readback and verification

After the commits, all changed source/test files and relevant board/backend contract files were fetched again from GitHub `main`. Fifteen targeted static assertions passed, including:
- initial auth readiness is exposed and set after initial hydration;
- Login does not navigate after `refreshUser() === false`;
- both new messages exist in all seven locales;
- protected route uses the state helper and does not mount before hydration;
- helper covers redirect/loading/authenticated branches and tests cover all states;
- frontend board request-key flow, malformed response rejection and per-user project request coalescing remain present;
- backend project ownership check, board owner check, strict patch allow-list, internal-field serialization and deterministic project ordering remain present.

The new route-state test is part of the configured frontend test glob. **No TypeScript check, frontend unit test command, production build, browser test, backend runtime test, SQL integration test or PostgreSQL replay was executed in this environment.** The Vercel combined status for test commit `472dc594a5cb0ea2d945918fad1189085cdb0522` is still `failure` with target `build-rate-limit`; it is not a build log or test result.

## Remaining risks / boundaries

- JWT remains in localStorage; HttpOnly cookie migration still requires coordinated backend/CORS/CSRF design.
- A failed initial `/me` request now prevents the app shell from rendering and redirects to login after the loading state. The token is retained on transient failures, but the login page currently requires the user to retry sign-in rather than offering an in-place profile retry.
- The complete frontend source audit remains open.
- The mandatory NEXT in `docs/PROJECT_STATE.md` remains clean disposable PostgreSQL replay of `001_baseline.sql` + active migrations `010–148`, followed by SQL integration tests and backend runtime suite. User action UA-001 (read-only PostgreSQL binary/version/disk check) remains pending in `docs/USER_ACTIONS.md`. Do not mark these gates complete based on static checks.

No production data, production database, payment provider, Pinterest account or deployed configuration was changed.
