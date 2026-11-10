# AUD-391 — registration, login and recovery under account deletion

**Date:** 2026-11-11  
**Status:** source audit; design-only follow-up to AUD-390.

## Scope

Reviewed `backend/auth.js`, `backend/password-reset.js`, `backend/email-verify.js`, `backend/sessionToken.js`, authentication middleware/routes in `backend/index.js`, migrations 020–024 and 055, and existing auth recovery SQL integration and schema-contract tests. Rechecked prior AUD-326 and AUD-374 findings.

## Existing controls confirmed

- Registration creates an unverified user and does not issue a JWT; verification token hashes are stored, raw tokens are emailed, and verification is explicit rather than automatic on page load.
- Login compares against a dummy bcrypt hash for missing accounts, returns the same credential error for unknown email/wrong password, and requires email verification.
- Password reset uses random tokens with SHA-256 hashes, per-user serialized issuance/cooldown, one-time atomic consumption, password update and `token_version` increment in one transaction.
- Email verification issuance is serialized per user and rate-limited in SQL; consumption is transactional and repeat clicks are idempotent.
- `requireAuth` reloads `token_version` on every request and fails closed on database errors. Password reset invalidates previously issued JWTs.
- Existing SQL integration test covers cooldown, single-use reset, session version increment, email verification, repeat click and expired token.

## AUD-391-01 — No lifecycle-state gate in login or protected middleware

`login()` selects the user and issues a JWT without an account lifecycle predicate. `requireAuth` selects only `token_version`; it does not read or reject `account_status`. Consequently, once AUD-390 adds a deletion state, neither layer will enforce it unless both are explicitly changed. Incrementing token_version revokes old JWTs once, but it does not stop a still-valid JWT from being minted by a login path that ignores lifecycle state.

**Required:** login must refuse every non-`active` state after password verification (preserve generic credential response where appropriate). `requireAuth` must read lifecycle state and require exactly `active`, in the same DB lookup as token_version. Database errors remain fail-closed. No JWT may be issued for `deletion_pending`, `reconciling`, `cleanup_pending`, `anonymized` or `retained_financial_only`.

## AUD-391-02 — Reset token issuance and consumption can bypass deletion fence

`requestReset()` looks up a user by email and calls `issue_password_reset_token`. The current SQL RPC locks the user row, but only verifies that it exists; it does not check lifecycle state. `consume_password_reset_token` also locks the user and changes password/token_version without a lifecycle predicate. A reset request or a previously issued link can therefore remain usable after deletion begins unless the RPCs are updated.

**Required:** both issuance and consumption RPCs must check `account_status='active'` after acquiring the user row lock. A non-active account returns the same generic false result as an invalid/missing token. Token issuance must not send an email if the RPC declines. Consumption must never change password or increment a session version for a non-active account.

## AUD-391-03 — Email verification can confirm a deletion-pending account

`issue_email_verification_token` and `consume_email_verification_token` also lock the user row but only check existence. A delayed verification link can mark an account verified after deletion has started. `resendVerification` can also attempt to issue a new link for a non-active account.

**Required:** gate SQL issuance and consumption on active state. Gate both authenticated and anonymous resend paths; retain generic anonymous response to avoid account enumeration. The account lock makes the lifecycle transition race deterministic: whichever transaction locks and commits first wins; after deletion state commits, later token operations must decline.

## AUD-391-04 — Re-registration and email reuse need an explicit tombstone policy

Registration currently returns 409 when the normalized email already exists, both on pre-check and unique-index race. AUD-390 proposes retaining a pseudonymous tombstone rather than hard-deleting `users`. If the tombstone keeps the original email, the same person cannot register again with it. If the email is scrubbed/released, a new account must receive a new UUID and must never reactivate or inherit the deleted account's credits, subscriptions, Pinterest tokens, projects, journals or old JWT authority.

**Required product/security decision before M5:** choose whether deleted email addresses can be reused and after what approved delay. If reuse is allowed, scrub the old email only after all legal/financial and support checks, and ensure a fresh UUID plus no cross-account data transfer. If reuse is prohibited, retain only a keyed irreversible lookup value (not plaintext email) under a documented purpose and retention period. Do not implement an ordinary deterministic hash of email; email addresses are guessable and vulnerable to dictionary reversal. Prefer a separately managed HMAC key and strict access control if a tombstone lookup is necessary.

## AUD-391-05 — Existing enumeration behavior must not become a deletion-state oracle

Registration returns 409 for an existing email. Anonymous reset and verification resend responses are generic. A future lifecycle implementation must not introduce distinct public responses for active, pending-deletion, anonymized or financially-retained accounts. The existing registration 409 is already a known enumeration risk (AUD-326/AUD-374), not a newly introduced deletion bug.

**Required:** preserve generic public reset/resend responses. Decide whether registration remains 409 or moves to a generic recovery flow as a separate product/security change. Never reveal `deletion_pending` via unauthenticated status or timing differences.

## Locking and race semantics

Reset/verification issuance and consumption already use user-first row locking followed by auth-token locking. AUD-390's lifecycle transition should use the same user-first order, then revoke auth tokens. This is compatible for these flows if every lifecycle RPC locks the user first and token rows second. Do not lock auth_tokens first and then users. Add explicit concurrency tests for: delete vs reset issuance, delete vs reset consumption, delete vs verification issuance, delete vs verification consumption, and simultaneous registration/email reuse.

## Required implementation and regression checklist

1. Add `account_status` in additive M1 migration with default `active`, NOT NULL, constrained allowed values and safe backfill.
2. Update login and `requireAuth` to reject every non-active state; add tests for each state and DB outage.
3. Replace all deployed overloads of `issue_password_reset_token`, `consume_password_reset_token`, `issue_email_verification_token`, and `consume_email_verification_token` with lifecycle-aware definitions; verify function signatures, SECURITY DEFINER search_path and service_role-only grants.
4. Gate authenticated and anonymous resend paths; never send a token email when issuance RPC returns false.
5. At deletion request, revoke all unused auth tokens and increment token_version in the same user-first transaction that commits deletion_pending.
6. Test old JWT, new login, existing reset link, new reset request, existing verification link and resend after deletion request.
7. Add a policy decision and test for deleted-email reuse, fresh account UUID, no inherited balance/entitlements/content, and no resurrection by stale token.
8. Keep anonymous reset/resend responses generic and verify no deletion-state enumeration.

## Validation and safety

- Source review only; no code, SQL migration, live account, email, session, database or deployment was changed.
- SQL integration tests exist but were not executed in this review. No claim is made that staging/production has the exact migration definitions in this branch.
- The source tree's migrations describe intended schema; actual deployed RPC definitions and account rows must be checked separately with read-only schema-contract queries before rollout.
- This audit is a design dependency for AUD-390 M2/M5, not authorization to enable account deletion.

## Next recommended task

Implement the additive lifecycle schema and SQL auth gates in a separate reviewed migration, first extending disposable PostgreSQL integration tests. Do not implement account cleanup or user anonymization in the same change.