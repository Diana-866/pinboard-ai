# AUD-391 — authentication and recovery gates for account deletion

**Date:** 2026-11-11  
**Status:** source and migration review; design-only follow-up to AUD-390.

## Scope

Reviewed registration, login, email verification, password-reset issuance/consumption, JWT session validation, the protected-route middleware, and the relevant SQL migrations and integration tests. No runtime or production database was accessed.

## Confirmed current protections

- Registration creates an unverified user and does not issue a JWT.
- Password verification uses a dummy bcrypt hash for nonexistent users, reducing timing-based account enumeration.
- Login rejects unverified email and issues a seven-day HS256 JWT only after password and verification checks.
- JWT carries user ID and token version. Protected requests reload token_version from users and fail closed on database errors.
- Reset links use 32 random bytes; only SHA-256 hashes are stored. The token is one-use and expires after 60 minutes.
- Migration 023 makes password change, token consumption and token_version increment atomic.
- Migration 024 serializes issuance on the user row and enforces a per-account cooldown.
- Reset and anonymous resend responses are generic.
- Email-verification and password-reset SQL functions are SECURITY DEFINER with fixed search_path and execute grants restricted to service_role.

## Findings

### AUD-391-01 — No account lifecycle gate in authentication

**Evidence:** backend/auth.js login and register query users without an account lifecycle predicate. backend/index.js requireAuth selects only token_version. The current AUD-390 design proposes account_status, but it is not yet part of the deployed/canonical schema.

**Risk:** once deletion states exist, a pending/deleting account could still log in and receive a fresh JWT; an existing JWT could pass middleware if token_version were not incremented or if only the version were checked. Registration may also interact unpredictably with retained tombstones.

**Required fix:** login and requireAuth must read lifecycle status from the authoritative row and accept only active. DB errors must fail closed. The deletion-request RPC must atomically transition state and increment token_version. Apply the same gate to every token-bearing route that does not use requireAuth (notably authenticated resend-verification).

### AUD-391-02 — Password-reset RPCs can restore credentials unless lifecycle-aware

**Evidence:** migrations 020/023 define consume_password_reset_token. It locks the user row before the auth_tokens row, changes password_hash and increments token_version, but does not check account status. issue_password_reset_token in migrations 020/024 also locks the user and only checks existence and cooldown. backend/password-reset.js uses these service-role RPCs.

**Risk:** a reset link issued before deletion can still change the password after deletion starts. That does not automatically reactivate a row, but it creates a credential mutation and can complicate tombstone cleanup or future email reuse.

**Required fix:** in the final canonical RPC definitions, issuance must require account_status='active'. Consumption must lock the user row first, re-check status after obtaining the lock, and return the same generic invalid/expired result for non-active accounts. Do not rely on a preceding application lookup. Add a race test: reset consumption vs deletion request must serialize; after deletion commits, no reset may succeed.

### AUD-391-03 — Email verification can mutate a non-active account

**Evidence:** backend/email-verify.js issues tokens through issue_email_verification_token and consumes them through consume_email_verification_token. The auth flow's verification SQL functions are not lifecycle-aware in the reviewed implementation; applyVerification is public and calls the SECURITY DEFINER RPC.

**Risk:** a stale verification link can set email_verified on an account whose deletion is pending. Resend-by-email and login-triggered resend can also attempt to issue new verification tokens.

**Required fix:** gate verification-token issuance and consumption inside their SQL RPCs using the same user-row-first lock order and active-state predicate. For a pending deletion, consume should fail generically and never mark email_verified. Both authenticated and anonymous resend paths must suppress token issuance for non-active users without revealing account existence.

### AUD-391-04 — Registration and email reuse policy is unresolved

**Evidence:** register performs an email lookup and returns HTTP 409 for an existing email; the insert also maps unique violation 23505 to 409. The code does not define a separate tombstone/alias registry or a reuse window.

**Risk:** deleting or anonymizing the email in place may permit a new identity to register with an address that still appears in retained payment/support records. Keeping the email indefinitely in a tombstone may conflict with minimization commitments. Reusing the same address can also make old payment, support or verification events ambiguous.

**Required decision:** specify one policy before implementing deletion:
1. email remains reserved while deletion is pending and during an explicitly approved tombstone/retention period; or
2. email is released after anonymization, while all retained evidence uses a non-reversible account reference and never treats the email as identity.
The policy must cover case normalization, unique constraints, pending verification, duplicate requests, and support recovery. Do not silently change current 409 behavior.

### AUD-391-05 — Session invalidation is global, not per-device

**Evidence:** JWT version is per-user. Password reset increments it globally; there is no server-side per-device session registry in the reviewed auth design.

**Risk:** token_version is suitable for immediate all-session revocation on deletion, but it cannot selectively revoke one device or explain active sessions. Logout from the SPA only removes the local token.

**Required decision:** for deletion, global revocation is mandatory and can reuse token_version. A separate session-management feature is optional and should not delay deletion safety.

### AUD-391-06 — Registration enumeration remains a known trade-off

**Evidence:** existing email returns 409, as previously recorded in AUD-374. Reset and anonymous verification resend remain generic.

**Risk:** email existence can be discovered through registration. This is not newly introduced by account deletion, but tombstones and email reuse make response consistency more important.

**Required decision:** retain explicit 409 with sign-in/recovery UX, or change to a generic registration response with a safe existing-account path. Do not change behavior without product decision and browser regression coverage.

## Required implementation order

1. Add lifecycle columns and durable deletion request/event/job schema via additive migration only.
2. Introduce a shared lifecycle predicate and use it in login, requireAuth, register collision handling, resend-verification, password-reset request and verification routes.
3. Replace the final SQL definitions for reset/verification issue and consume RPCs so they check active status under the user-row lock. Preserve service_role-only grants and fixed search_path.
4. Make deletion request and credential revocation atomic: status transition, token_version increment, revoke all unused auth_tokens and append event/job receipt.
5. Resolve email reservation/reuse policy before anonymization.
6. Add disposable-Postgres race tests for deletion vs login, reset issue/consume, verification issue/consume, and duplicate registration. Add browser tests for generic messages and stale links.
7. Only then connect these gates to all billing, generation, Pinterest, upload and worker paths listed in AUD-390.

## Test cases required before release

- Login before/after deletion transition; no JWT issued after transition.
- Existing JWT rejected immediately after deletion request.
- Reset issuance after transition returns generic failure and sends no email.
- Reset token issued before transition cannot be consumed after transition.
- Verification issuance/consumption after transition cannot mutate account.
- Concurrent reset consume vs deletion request has one serializable outcome; no credential mutation after deletion commits.
- Concurrent verification consume vs deletion request cannot verify after deletion commits.
- Duplicate registration racing with deletion/anonymization obeys the documented email policy.
- Anonymous forgot-password and resend-verification remain non-enumerating.
- Auth database outage fails closed for login and protected routes.

## Safety and validation

Source/migration review only. No code, migration, test, CI, deployment, account, email, password, JWT, secret or production data was changed or exercised. The migration files reviewed are repository history; live production schema and applied migration state were not verified.
