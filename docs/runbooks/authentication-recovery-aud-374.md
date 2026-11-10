# Authentication recovery and session response — AUD-374

## If a user reports a suspected account compromise

1. Confirm identity through the approved support process; never request their password, active JWT, reset link or verification token.
2. Direct the user to request a password reset from the official PinPosy domain.
3. The current password-reset transaction changes the password and increments `token_version`, invalidating all existing JWTs on the next protected request.
4. Ask the user to sign in again with the new password and review their email account security. Compromise of the email inbox can defeat email-based recovery.
5. Preserve relevant request IDs and timestamps. Do not copy raw tokens, passwords, webhook bodies or secrets into support notes.
6. If the reset email does not arrive, verify mail delivery and account ownership through restricted operational logs; do not reveal whether an arbitrary email exists.
7. Escalate suspicious billing, Pinterest OAuth or data-export activity through their separate audited incident procedures.

## Current limitations

- Logout is local browser cleanup, not server-side per-device revocation.
- Password reset is the current global JWT invalidation mechanism.
- There is no reviewed UI/API for listing devices, revoking one session or authenticated password change.
- Auth rate limiting is process-local; do not assume limits coordinate across multiple app instances.
- Registration currently returns a conflict for an existing email; this can disclose account existence.

## Operator safety

Never manually edit `token_version` or password hashes without an approved, auditable recovery procedure. Do not ask a user to send an active session token. Production JWT secret rotation requires a coordinated deployment plan and will invalidate sessions signed with the old secret.
