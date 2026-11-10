# AUD-105 — JWT policy and session lifecycle audit

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`  
Scope: login token issuance, Bearer parsing, protected-route middleware, password-reset invalidation, email-verification resend, rate limiting and JWT configuration.

## Findings

### 1. Session lifetime and claims

- Login issues signed JWTs with a 7-day lifetime.
- The token carries the application `userId` and `tokenVersion`; no password hash, email, tariff, role or credit balance is embedded in the token.
- Protected routes re-read the account's `token_version` from Supabase on each request. A database lookup error fails closed with HTTP 503; missing accounts or mismatched versions return HTTP 401.
- Existing tokens without a `tokenVersion` claim are treated as version 0, matching the migration's documented compatibility behavior.

### 2. Password reset revokes prior sessions

- Password-reset links are random one-time tokens; only SHA-256 hashes are stored.
- The reset flow calls the atomic `consume_password_reset_token` database function.
- Migration 023 updates the password and increments `users.token_version` in the same transaction that consumes the reset token.
- Concurrent reset consumption is covered by `backend/test/auth-recovery-concurrency.sh`; the source test expects exactly one successful consumer.
- Migration 055 enforces a non-negative, non-null token version.
- Migration 025 removes the obsolete three-argument token-issuance overload that could bypass the per-account cooldown.
- The four-argument issuance function serializes requests per user and enforces the account-level cooldown in addition to the HTTP limiter.

### 3. JWT algorithm hardening — fixed in this audit

Previously, `auth.js` relied on the JWT library's default signing and verification algorithm selection. The library already constrains supported algorithms for symmetric secrets, but an explicit application policy is clearer and more robust.

Changes:
- Added `backend/sessionToken.js`.
- Session tokens are now explicitly signed with `HS256`.
- Verification explicitly allows only `HS256`.
- Existing tokens remain compatible: the previous `jsonwebtoken` default for a string HMAC secret was HS256, and claim names and expiry are unchanged.
- `backend/auth.js` now delegates session signing and verification to this module.
- Added `backend/test/session-token.test.js` to cover expected signing, rejection of HS384, and tampered-signature rejection.

### 4. Bearer parsing and resend behavior

- Bearer extraction accepts one token only and rejects malformed or multi-token authorization headers.
- `/resend-verification` is intentionally public to support unauthenticated recovery. When a bearer token is supplied, it verifies the signature and current token version before treating the request as authenticated. Invalid or revoked tokens fall back to the generic anonymous email mode; the endpoint does not grant account access.
- The anonymous response does not reveal whether an email exists.
- Login, registration, password reset and email-verification endpoints use dedicated rate limiters; email resend also applies a per-account cooldown.

## Residual risks and product trade-offs

1. There is no server-side per-device session registry or single-session logout endpoint. Clearing a token in the browser removes that local copy, but cannot invalidate a stolen copy immediately. A stolen JWT remains usable until expiry or until the account's token version changes.
2. Password reset invalidates all sessions for the account, not just one device. This is a safe recovery behavior but is not granular session management.
3. No authenticated change-password route or "log out all devices" UI was found in the inspected route inventory. If added, it should use a transactional token-version increment and require the current password or recent reauthentication.
4. JWT secret strength and rotation procedure are deployment configuration concerns. This source audit did not inspect live Render environment values and did not rotate secrets.
5. `requireAuth` performs a database read for each protected request. This supports immediate revocation but means a Supabase outage temporarily blocks authenticated API calls; this is fail-closed behavior.
6. No live JWT replay, password-reset, rate-limit or multi-device test was run against production.

## Change and verification status

- Code changed: explicit HS256 signing and verification.
- Tests added: three focused unit tests.
- Tests were not executed in a local checkout in this session. GitHub Actions status is checked separately after the commit.
- No production secret, database schema, account password, session, deployment or provider setting was changed.
- No PR merge was performed.
