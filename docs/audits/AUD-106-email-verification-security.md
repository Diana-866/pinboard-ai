# AUD-106 — Email verification security and concurrency audit

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`  
Scope: `backend/email-verify.js`, registration/login, verification and resend routes, migrations 002/005/021/022, and existing email-verification E2E coverage.

## Result

No confirmed token-forgery, replay-to-unverified-account, cooldown-bypass, or cross-account verification flaw was found in the inspected implementation.

### Token lifecycle

- Tokens are generated with `crypto.randomBytes(32)` and encoded as base64url (256 bits of entropy).
- Only SHA-256 hashes are stored in `auth_tokens`; raw tokens appear in the verification URL sent by email.
- Tokens are scoped by `purpose='email_verify'`, expire after 24 hours, and have unique hashes.
- `issue_email_verification_token` locks the user row, checks the last issuance timestamp, revokes previous unused verification tokens and inserts the new token in one database transaction.
- `consume_email_verification_token` locks the user row before the token row, verifies expiry and purpose, then updates `users.email_verified` and `auth_tokens.used_at` in the same transaction.
- Repeated clicks are deliberately idempotent: a used token succeeds only if its account is already verified. A consumed token cannot verify a different account or change account state again.
- Both RPCs revoke execution from PUBLIC/anon/authenticated and grant it only to `service_role`.

### Registration and resend

- Registration does a preflight email lookup, but the actual insert handles PostgreSQL unique-constraint conflict (23505), so concurrent duplicate registrations cannot create two accounts if the users email uniqueness constraint is present.
- Registration returns no JWT before verification. Login checks the password before returning the unverified-account response, avoiding a simple 401/403 account-state oracle.
- Anonymous resend returns the same message whether the email exists or not.
- Authenticated resend checks the JWT's current `token_version`; invalid/revoked tokens fall back to anonymous generic behavior.
- Registration/login are protected by a 10-request / 15-minute limiter; verification and resend share a 30-request / 15-minute limiter.
- The resend RPC enforces cooldown atomically. The application-side `secondsUntilResend` check is advisory/UI behavior, not the security boundary.

### Delivery behavior and residual risks

1. Issuance commits before SMTP delivery. If SMTP is unavailable or delivery fails, the just-issued token remains the only active link and the previous link has been revoked. The account is not locked out permanently: a new link can be requested after the five-minute cooldown. This is a recoverable delivery trade-off, not a token-validation bypass.
2. The E2E test uses a mock Supabase RPC implementation. It validates application flow, but does not prove PostgreSQL row-lock behavior under true concurrent sessions.
3. Express rate limiting is process-local unless a shared store is configured. Multiple backend instances or restarts can weaken aggregate IP limits; the database per-account issuance cooldown remains authoritative for email sends.
4. Registration deliberately returns 409 for an already-used email. This reveals account existence to a caller who submits a registration attempt; rate limiting reduces abuse, but does not make this endpoint enumeration-resistant.
5. `FRONTEND_URL` controls the verification link origin. It is server configuration, not accepted from the request body; it must remain a trusted deployment value.
6. This was a source review. No live Supabase, SMTP, Render environment, DNS, or production behavior was queried.

## Added regression coverage

Added `backend/test/email-verification-concurrency.sh`, which uses two independent PostgreSQL sessions and real row-lock contention to check:

- Two simultaneous issuers for one user cannot both bypass the five-minute cooldown; exactly one token is issued and exactly one remains active.
- Two simultaneous consumers serialize safely; the account is verified once, the token is consumed, and the second click returns the intended idempotent success.
- The test cleans up its temporary user and tokens.

Run against a disposable PostgreSQL database after applying the project's schema and migrations:

```bash
PGDATABASE=pinposy_test bash backend/test/email-verification-concurrency.sh
```

The existing `backend/test/auth-recovery.integration.sql` already covers normal issuance, cooldown, expiry, successful consumption and idempotent repeat-click behavior. The new script complements it with actual concurrent database sessions.

## Change and verification status

- Added the PostgreSQL concurrency regression script and this audit document.
- Tests were not run in this environment; the script requires a disposable PostgreSQL database with the project migrations applied.
- No production SQL was applied, no secrets or environment variables were changed, no emails were sent, and no deployment or merge was performed.
