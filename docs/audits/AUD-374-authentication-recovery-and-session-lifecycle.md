# AUD-374 — Authentication, recovery and session lifecycle review

**Date:** 2026-11-11  
**Status:** source review and narrow hardening complete  
**Runtime validation:** not executed

## Scope

Rechecked registration/login, email verification, password reset, JWT issuance and verification, token-version invalidation, browser token storage, auth routes, rate-limit configuration, and prior findings AUD-105–108 and AUD-326.

## Change made

### Registration optional profile input validation

The registration route previously passed `name`, `surname` and `preferred_language` directly to the auth service. The service calls string operations on profile values; a non-string JSON value could therefore become an internal 500.

- Reused existing `optionalString` validator at the route boundary.
- `name` and `surname` are now optional strings bounded to 80 characters.
- `preferred_language` is an optional string bounded to 16 characters; locale normalization remains in the existing auth/email-locale layer.
- Added `backend/test/registration-input-validation.test.js` for missing values, trimming, bounds, non-string rejection and route wiring.

This is a narrow input-validation change; no registration, verification, login or token semantics were otherwise changed.

## Confirmed protections

- JWTs are explicitly HS256, expire after 7 days, and contain user ID plus token version.
- Protected API requests reload current `token_version` from the database. A mismatch rejects stale tokens; DB errors fail closed with 503.
- Registration does not issue a session before email verification.
- Login compares the submitted password against a dummy bcrypt hash when the account is absent, and returns a generic credential error for unknown email/wrong password.
- Password reset tokens are 256-bit random values; only SHA-256 hashes are stored. Token consumption, password update and token-version increment are atomic. Reset tokens are one-use and have a bounded lifetime.
- New verification/reset links use URL fragments, avoiding initial HTTP request and Referer leakage of the raw token. Verification requires explicit user action.
- Anonymous reset and resend-verification responses are generic; database cooldowns serialize issuance and throttle repeated requests.
- Bearer parsing accepts one credential, and protected routes enforce token-version fencing.

## Residual risks (carried forward)

### AUD-374-01 — Registration reveals whether an email already exists

The route returns 409 for an existing email (including a unique-constraint collision). This is an account-enumeration signal, previously recorded in AUD-108/AUD-326. Changing to a generic response requires a clear UX for existing users (sign-in/resend recovery); not changed here.

### AUD-374-02 — Browser JWT is stored in localStorage

Same-origin injected JavaScript can read the bearer token. This is a SPA storage trade-off, not evidence of a confirmed XSS in the reviewed code. Moving to HttpOnly Secure SameSite cookies requires coordinated CORS, CSRF, API and frontend changes; do not change storage in isolation.

### AUD-374-03 — No individual session registry or authenticated password-change flow

Logout removes the browser's local token only. There is no server-side revoke-current-session, revoke-one-device or session-list capability in the reviewed routes. A copied token remains valid until its 7-day expiry or a global token-version increment (password reset). Password reset provides global invalidation but is not a substitute for session management.

### AUD-374-04 — Auth rate limiting is process-local and IP-centric

Existing auth/verification rate limits use the in-process limiter store and therefore do not coordinate across multiple instances or restarts. Login does not have an account-aware failed-attempt counter. Before horizontal scaling, use a shared store and keyed-HMAC account throttling; avoid permanent account lockouts that attackers can weaponize.

### AUD-374-05 — Browser-level auth regression coverage remains incomplete

Source and unit contracts do not prove browser behavior for fragment-token capture/history replacement, email scanner non-consumption, expired links, transient API failures, or cross-account isolation. Add browser/API integration tests before production release.

## Recommended next steps

1. Decide whether signup should disclose an existing email; if not, design generic response and recovery UX.
2. Plan server-side session management: revoke current/all sessions, list devices, and authenticated password change with recent reauthentication.
3. Introduce shared rate-limit storage and account-aware login throttling before scaling.
4. Evaluate HttpOnly cookie migration as a coordinated architecture change, not a local storage toggle.
5. Add browser/API integration tests for reset/verification replay, stale JWTs, transient network errors and two-user isolation.
6. Verify production JWT secret configuration, migration 055 and reset RPC definitions through non-destructive deployment/database checks.

## Validation and safety

- Source review only. Unit tests, browser tests, SQL integration, lint, build and CI were not run.
- No live user account, password, JWT, email token, SMTP setting, production database, secret, deployment or session was accessed or changed.
