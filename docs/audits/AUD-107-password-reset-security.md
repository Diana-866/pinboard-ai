# AUD-107 — Password reset, brute-force resistance and link exposure

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`

## Findings

### Correct protections observed

- Reset tokens are generated with 32 cryptographically random bytes (256 bits), SHA-256 hashed before storage, scoped to `password_reset`, and expire after 60 minutes.
- The public forgot-password endpoint returns the same success message for existing and unknown email addresses.
- Issuance is serialized on the account row and enforces a five-minute per-account cooldown in PostgreSQL. The caller cannot bypass this by rotating IP addresses or issuing concurrent requests.
- Only one unused reset token per account is retained: a successful new issuance invalidates earlier live links.
- Consumption locks the account before the token, updates the password hash, consumes the token, and increments `token_version` in one transaction.
- Incrementing `token_version` revokes all earlier application JWTs. The reset endpoint does not automatically log the user in.
- Reset passwords are validated at 8–128 characters and bcrypt-hashed with cost 10 before the SQL RPC.
- The reset page stores the token in a React ref and removes it from browser history after initial capture.

### Finding fixed: reset token in URL query string

Previously, the email link used `/reset-password?token=...`. The frontend replaced the URL after mounting, but the initial navigation still sent the token in the HTTP request URL to the frontend host and could expose it to edge/access logs or browser diagnostics.

Changed the new email link format to `/reset-password#token=...`. URL fragments are not sent in the HTTP request, so the raw credential is no longer included in the initial page request. The frontend reads the fragment and immediately replaces the visible URL. Legacy query-string links remain accepted for compatibility until they expire.

### Remaining risks / operational limitations

1. The shared `authLimiter` allows 10 requests per 15 minutes per IP and is applied to register, login, forgot-password, and reset-password. The separate token-verification limiter allows 30 requests per 15 minutes. These express-rate-limit defaults are process-local; multiple backend instances/restarts can weaken aggregate IP throttling. The database account cooldown remains authoritative for reset email issuance.
2. Existing and unknown emails receive the same response body, but request timing can still differ because a real account may trigger SMTP delivery. The per-IP limiter and per-account cooldown reduce abuse; strict timing equalization would require a queued delivery path and carefully bounded response timing.
3. Issuance commits before SMTP send. If delivery fails, the newest token remains active and older tokens have been invalidated. The user can request a replacement after five minutes. This is recoverable but not durable delivery; a transactional email outbox would improve it.
4. The reset form uses bcrypt cost 10 before the token is checked by SQL. This is intentional to avoid storing unhashed passwords and is bounded by the endpoint limiter, but a distributed attacker can still consume CPU across many source IPs.
5. The frontend immediately strips the fragment/query after React mounts. Browser extensions or client-side instrumentation with access to the page before the component runs remain outside this protection.
6. `FRONTEND_URL` is trusted server configuration; the request body's `frontendUrl` is ignored. Deployment configuration must remain restricted to approved HTTPS frontend origins.
7. No live Render, Supabase, SMTP, CDN/access-log, or browser telemetry configuration was inspected.

## Regression coverage added

- Added `backend/test/password-reset-issuance-concurrency.sh`, which creates two independent PostgreSQL sessions contending on the same account row and asserts that exactly one issuance succeeds during the cooldown and exactly one live token remains.
- Added the script to the PostgreSQL atomic-payment integration workflow.
- Existing `backend/test/auth-recovery-concurrency.sh` already verifies that two simultaneous consumers cannot both apply one reset token and that `token_version` increments exactly once.
- Existing `backend/test/auth-recovery.integration.sql` covers expiry, replay rejection, cooldown, token invalidation, password change and session revocation.

## Verification status

The source changes and test wiring were committed to the existing Draft PR. The SQL concurrency scripts were not executed in this environment; they require the disposable PostgreSQL CI service. No production database, SMTP credentials, secrets, deployments or user accounts were changed.
