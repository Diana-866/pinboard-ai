# AUD-326 — Registration, login, email verification, password recovery, and browser session review

Date: 2026-11-10
Branch: `feat/persisted-boards-api`

## Scope

Reviewed current `backend/auth.js`, `backend/index.js` authentication middleware and routes, `backend/validate.js`, `backend/email-verify.js`, `backend/password-reset.js`, `backend/sessionToken.js`, `backend/bearerToken.js`, frontend `AuthContext`, `apiRequest`, login/registration/reset/verification pages, and existing auth audit notes/tests (AUD-081, AUD-105, AUD-107, AUD-108). Source-only review; no live accounts, production database, SMTP, or browser session was accessed.

## Positive controls confirmed

- Session JWTs use explicit HS256 signing and verification, a 7-day expiry, and only the user ID plus token version. Protected routes reload the current token version from the database on each request; database failure returns 503 and stale/missing accounts return 401.
- Password reset uses 256-bit random tokens; only SHA-256 hashes are stored. Issuance is account-serialized with a five-minute cooldown; consumption, password update, token use, and token-version increment are transactional. Passwords are bcrypt-hashed before the database RPC; reset does not issue a new session.
- New password-reset and email-verification links place tokens in URL fragments, which are not sent in the initial HTTP request or Referer header. Frontend captures the token and replaces the visible URL. Legacy query tokens remain accepted for compatibility until expiry.
- Email verification is explicit-user-gesture rather than automatic page-load consumption, reducing accidental consumption by mail-security scanners. The SQL consumer is atomic and one-time.
- Registration does not issue a JWT before email confirmation. Login performs bcrypt comparison against a dummy hash when the account is absent and uses the same 401 message for unknown email and wrong password.
- Forgot-password and anonymous resend-verification responses are generic. Reset tokens are one-use and previous live tokens are invalidated on a successful new issuance.
- Bearer parsing accepts one token only. Protected route middleware and the authenticated resend path both enforce token-version fencing.
- Frontend stores only the opaque session JWT in localStorage; pending verification email is kept in sessionStorage, not placed in the URL. A transient network/5xx failure during `refreshUser` does not erase the local session; 401 does.
- Auth endpoints use a dedicated IP rate limiter; verification endpoints use a separate limiter; the database reset/verification issuance functions provide per-account cooldowns.

## Findings / residual risks

### AUD-326-01 — Registration account enumeration remains possible

`POST /register` returns HTTP 409 with an explicit existing-account message, including when the insert hits the unique-email constraint. An unauthenticated caller can distinguish registered addresses. This was already recorded in AUD-108-03 and remains present. Fixing it requires a deliberate signup UX decision (generic response and a clear resend/sign-in recovery path); no behavior change was made without product approval.

### AUD-326-02 — Browser session bearer is accessible to same-origin JavaScript

The frontend reads and writes the session JWT in `localStorage` and sends it as a Bearer token. Any successful same-origin script injection can read and exfiltrate that token. This is a common SPA trade-off, not proof of an XSS vulnerability in the reviewed files. A move to HttpOnly Secure SameSite cookies would require coordinated API, CORS/CSRF, deployment, and frontend changes; do not switch storage in isolation. No HttpOnly-cookie migration was made.

### AUD-326-03 — Logout is local-only; no per-device revocation or authenticated password-change route

Frontend logout removes the localStorage token and navigates to login, but the server has no session registry/revoke-one-session endpoint in the inspected implementation. A copied token remains valid until its 7-day expiry or global token-version increment (e.g. password reset). There is no authenticated change-password flow or "log out all devices" UI. These are product/security capabilities to plan; password reset currently provides the all-session recovery mechanism.

### AUD-326-04 — Authentication rate limits remain process-local and IP-only

The auth limiter is 10 requests per 15 minutes per IP; verification limiter is 30 per 15 minutes. As previously documented in AUD-108, default in-memory stores do not coordinate across instances/restarts. Login has no separate account-aware failed-attempt counter, so distributed credential-stuffing can evade a per-IP budget. Database cooldowns protect reset/verification issuance but do not replace login throttling. Add a shared store and keyed-HMAC account counter before scaling; do not permanently lock accounts solely on failures.

### AUD-326-05 — Registration optional profile fields are not type-validated at service boundary

The route passes `name` and `surname` directly to `register`. The function calls `.trim()` on any truthy value; malformed JSON values (e.g. an object instead of a string) can throw a TypeError and become a generic 500 rather than a clean 422. Normal browser form submissions send strings, and this is not an authorization bypass. Add bounded optional-string validation at the route/service boundary and regression tests in a separate narrow fix.

### AUD-326-06 — Token storage and frontend auth error behavior require browser-level regression coverage

Current source behavior is coherent, but no automated browser tests were found here for token fragment capture/history replacement, email scanner non-consumption, login failure UX, expired token cleanup, or transient API failure preserving a valid session. Add focused frontend tests before release.

## No confirmed authentication bypass

No route-level path was established in this bounded review that bypasses JWT signature verification, the current token-version check, one-time reset/verification token consumption, or the admin gate. This does not substitute for live penetration testing or two-user HTTP integration tests.

## Recommended next steps

1. Decide whether signup should intentionally reveal an existing email; if not, make the response generic and test the recovery UX.
2. Validate `name` and `surname` as bounded optional strings and test malformed input.
3. Plan session hardening: shared rate-limit storage, account-aware login throttling, and a considered HttpOnly-cookie migration if feasible.
4. Add explicit session management (revoke current/all sessions, change password with recent authentication) with transactional token-version fencing.
5. Add browser/API integration coverage for two-user isolation, stale JWTs, reset/verification replay, and the fragment-based email-link flows.

## Verification and safety

- Source review only; no tests, browser automation, live requests, SQL migrations, or npm commands were executed.
- No user account, password, JWT, email token, production database, SMTP configuration, secret, deployment, or repository setting was changed.
- Previously documented AUD-105/AUD-107/AUD-108 controls and risks were rechecked; this report distinguishes carried-forward findings from the additional malformed-profile-input robustness issue.
