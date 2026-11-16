# Frontend audit 01 — auth shell, API transport and account-scoped browser storage

- Date: 2026-11-16
- Branch: `main`
- Scope: `frontend/src/App.tsx`, `frontend/src/lib/api.ts`, `frontend/src/lib/authStorage.ts`, `frontend/src/lib/authStorage.test.ts`, `frontend/src/lib/userScopedStorage.ts`, `frontend/src/lib/userScopedStorage.test.ts`, `frontend/src/context/AuthContext.tsx`, `frontend/src/lib/billing.ts`, login/registration/password-reset/email-verification pages and `frontend/package.json`.
- Nature: source-level review and targeted defensive fix. This is not a complete line-by-line frontend audit and not a runtime/browser certification.

## Files and contracts reviewed

| File | Reviewed contract / result |
|---|---|
| `frontend/src/lib/api.ts` | Shared JSON fetch wrapper attaches bearer token from defensive storage helper; network failures map to ApiError status 0; non-JSON successful responses become null; protected-route 401 clears token and redirects except login/register attempts. |
| `frontend/src/lib/authStorage.ts` | Safe access to localStorage property and methods; blocked storage returns no token and does not throw. Added `hasStoredAuthToken()` as the shared route-guard predicate. |
| `frontend/src/lib/authStorage.test.ts` | Existing tests cover read/write/clear, property getter failures, throwing methods and invalid token values. Added test for the route predicate with blocked storage and a valid token. |
| `frontend/src/context/AuthContext.tsx` | Session hydration calls `/me`; transient failures preserve token for retry, 401 clears token; account-switch cleanup removes user-scoped caches while retaining device preferences; logout clears token and user-scoped local/session storage. |
| `frontend/src/lib/userScopedStorage.ts` and test | Collect-before-remove avoids index shifting; removes `pinposy_` and `pinposy.` user caches while preserving language/theme/timezone/content-language device preferences. |
| `frontend/src/App.tsx` | Protected `/app/*` route, main shell, board/schedule load boundaries and account-change clearing. Found one unguarded localStorage access in `RequireAuth`; fixed as below. |
| `frontend/src/pages/Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `VerifyEmail.tsx`, `CheckEmail.tsx` | Registration does not issue JWT; verification requires explicit user gesture; new verification/reset links keep one-time token in URL fragment and pages replace token-bearing URL after capturing it; registration email is kept in tab session storage rather than query string. Login fails clearly if token cannot be persisted. |
| `frontend/src/lib/billing.ts` | Payment idempotency keys are persisted where possible, memory fallback is per browser runtime; keys are released only for backend-declared safe terminal/reusable errors; payment URLs are checked for presence before redirect. |
| `frontend/package.json` | Frontend scripts: `lint=tsc --noEmit`, `test=tsx --test ...`, `build=vite build`. No frontend script was run in this environment. |

## Finding FE-01 — protected route could throw when localStorage is blocked

**Severity:** Low/Medium availability defect in privacy-restricted or sandboxed browser contexts; authentication must fail closed.

**Evidence before fix:** `RequireAuth` in `frontend/src/App.tsx` read `localStorage.getItem('token')` directly. Accessing the `localStorage` property itself can throw `SecurityError` in restricted contexts. This bypassed the defensive handling already present in `authStorage.ts` and could crash route rendering instead of redirecting unauthenticated users to login.

**Fix on main:**
- Added `hasStoredAuthToken()` to `frontend/src/lib/authStorage.ts`, implemented only through the existing safe `readAuthToken()`.
- Updated `RequireAuth` to use that predicate and fail closed with the login redirect.
- Added regression coverage for blocked storage and valid token.

**Commits:**
- `701e41a1c0bd182f7fef297aba6905fb11e06475` — safe session predicate.
- `fcdc0b7a4111122ec7e3a6e6045c67b48e7fa0cb` — regression test.
- `5ee28b947fd976eab977c9f768cffd02677e9f47` — protected route uses safe predicate.

## Static readback

After commits, fetched all three changed files from GitHub `main` and checked:
- App imports the helper.
- `RequireAuth` calls the helper.
- The old direct `localStorage.getItem('token')` route-guard code is absent.
- Helper delegates to `readAuthToken()`.
- Regression test asserts blocked storage returns false and valid stored token returns true.

All six static assertions passed. Blob SHAs at readback:
- `frontend/src/App.tsx`: `77ca5f1ad2299b122756bed07ad549d2c3f926a6`
- `frontend/src/lib/authStorage.ts`: `4aafeec6f16993e3984fc0ae991bfcd2c73b4c32`
- `frontend/src/lib/authStorage.test.ts`: `c04c00dc83b8b1647c8e21044032a50df3256edd`

## Remaining risks / not certified

1. The JWT remains in localStorage. A same-origin XSS can steal it; migrating to HttpOnly cookies requires coordinated backend, CORS and CSRF design and is not safe as a frontend-only change.
2. `VITE_API_URL` is public build-time configuration and controls where the bearer token is sent. Production deployment configuration must be constrained to the intended HTTPS API origin; no allow-list was added because preview policy needs explicit design.
3. The login hydration navigation defect described in FE-02 was corrected: Login now checks the `refreshUser()` result and stays on the sign-in page with localized feedback when profile hydration fails. A browser-level retry/recovery experience and transient `/me` failure test remain useful follow-up work.
4. The frontend has many other components and utilities not reviewed in this package. Full source-by-source review remains open.
5. No TypeScript check, frontend unit tests, production build, browser test, live backend, or deployed configuration was run/inspected in this environment.

## Next

Continue the frontend source audit in small documented packages, prioritizing the login/session hydration edge above and then the user-facing project/board/pin, generation, calendar/scheduling, Pinterest account, billing, admin and legal/consent surfaces. Separately, complete the required clean disposable PostgreSQL replay and runtime test gates; static review cannot replace them.


## FE-29 — auth storage route-guard regression test had a missing import

During a fresh source read of `frontend/src/lib/authStorage.test.ts`, the final test called `hasStoredAuthToken()` but the module import omitted that named export. The helper is exported by `authStorage.ts`, so the test would fail at runtime with `ReferenceError` when that test case executes. This was a test-source defect, not evidence of a production authentication failure.

**Fix on main:** added `hasStoredAuthToken` to the named import in `authStorage.test.ts`. No production code or authentication behavior changed.

**Commit:** `d4c65ad9ad3e7ed192a41fcc0b0eb9e75df53f98`.

**Static readback:** fetched the updated test and helper from current main; confirmed the test imports the symbol and `authStorage.ts` exports it. This is a source-level consistency check only. The test, complete frontend suite, TypeScript check and build were NOT executed because GitHub Actions jobs are failing before runner allocation and the user's Windows checkout is not available in this environment.

**Remaining:** retain the frontend test/runtime/build gates as open. No production, database, payment, Pinterest or deployment configuration was changed.