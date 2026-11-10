# AUD-081 — Authentication and user-data isolation review

Date: 2026-11-07
Branch: `feat/persisted-boards-api`
Reviewed HEAD before this report: `4e6b04adc3c45e1aa3be78271fa8293ec660f430`

## Scope

Reviewed `backend/auth.js`, `backend/index.js`, `backend/admin.js`,
`backend/password-reset.js`, `backend/bearerToken.js`,
`backend/pinterest.js`, `backend/pinterestTokenCrypto.js`,
`backend/pinterestAccountRecord.js`, `backend/devTopup.js`,
`backend/supabase.js`, baseline and hardening migration 009, and existing
auth/OAuth/security integration tests.

## Positive controls found

1. Authenticated routes use `requireAuth`, which verifies the signed JWT,
   requires a user id, loads the current `token_version`, and rejects stale
   sessions. Database lookup failure returns 503 (fail closed).
2. Password reset consumes a one-time hashed token in a database function and
   increments `token_version`; the concurrency script asserts exactly one
   consumer succeeds.
3. Pinterest OAuth state is signed, short-lived (15 minutes), purpose-bound,
   and contains an attempt id/generation and session token version. Callback
   reloads the user's current token version and the commit RPC fences stale or
   superseded attempts.
4. Pinterest access and refresh tokens are encrypted with AES-256-GCM using a
   32-byte environment key. Key rotation supports a previous key. Public
   account serializers are used by integration routes; tokens are intended to
   remain server-side.
5. Projects are selected by `user_id=req.userId`. Board and pin routes call
   owner-check helpers that traverse board -> project -> user before reads or
   writes. Admin routes require both authentication and a database-backed
   `is_admin` check.
6. Baseline RLS is enabled on core tables; migration 009 hardens users to
   SELECT-only for authenticated clients, adds ownership foreign keys, and
   restricts sensitive service functions.

## Findings / remaining risks

### P1 — Service-role backend makes route-level authorization a critical boundary

`backend/supabase.js` initializes the Supabase client with
`SUPABASE_SERVICE_ROLE_KEY` when configured. That role bypasses RLS. The
application therefore cannot rely on RLS alone to protect one user's rows:
every backend route and every helper must enforce ownership before reading,
mutating, publishing, or returning private data.

The inspected project/board/pin routes generally do this, but current automated
tests do not provide broad HTTP-level two-user isolation coverage across all
routes. Add an integration matrix with two users and attempts to access each
other's project, board, pin, image, schedule, billing history, and Pinterest
account. Treat this as a release gate.

### P2 — Pinterest token encryption depends on runtime key management

The code correctly refuses to treat missing encryption configuration as a
configured Pinterest integration. However, operational safety depends on
backing up `PINTEREST_TOKEN_ENCRYPTION_KEY` securely and retaining the previous
key during rotation until all legacy ciphertext has been migrated. Losing both
keys makes stored credentials unrecoverable. This is an operations requirement,
not a code defect established in this review.

### P2 — Auth route regression coverage is narrower than the attack surface

Existing SQL tests cover password-reset single-use/concurrency and hardened
SECURITY DEFINER function privileges. Existing Node tests cover token
encryption and OAuth flows. I did not find a comprehensive HTTP test suite
that proves stale JWT rejection, non-admin denial, cross-user resource denial,
or absence of Pinterest tokens in every API response. Add those tests before
production launch.

### P2 — Development top-up is intentionally unauthenticated at the route layer

`POST /credits/dev-topup` does not use `requireAuth`; instead it is gated by
`NODE_ENV !== production`, `ENABLE_DEV_TOPUP=true`, and a timing-safe
comparison against an `ADMIN_SECRET` of at least 32 characters. The route
returns 404 in production. Keep the flag disabled in every deployed
environment and never reuse the secret for other services. This was not
classified as an exploit because the implementation has explicit gates.

## No confirmed cross-user access exploit found

In the inspected project, board, pin, admin, and Pinterest route paths, I did
not establish a path that returns another user's data without an ownership
check. This conclusion is limited to source review; it is not a substitute for
two-user integration tests or live penetration testing.

## Verification limitations

- No production database was queried.
- No live Pinterest OAuth flow or API request was performed.
- PostgreSQL integration tests were not executed in this review.
- GitHub Actions for the prior HEAD had failed runs with unavailable job logs;
  the current report commit still requires fresh CI evidence.
- No deployment or PR merge was performed.

## Required next steps

1. Add two-user HTTP integration tests for every resource family.
2. Add tests for stale JWTs after password reset and non-admin access to every
   `/admin/*` route.
3. Assert Pinterest access/refresh tokens never appear in status, account,
   board, schedule, or error responses.
4. Document encrypted-token key backup and rotation procedure, and verify
   recovery before production.
5. Keep `ENABLE_DEV_TOPUP` unset/false in production and staging deployments.

## Conclusion

The reviewed code has several strong controls: session-version fencing,
single-use password reset, OAuth state fencing, encrypted Pinterest tokens,
explicit owner checks, and admin authorization. The main unresolved security
work is automated two-user HTTP isolation coverage and operational key
recovery. No code change was justified by this source review alone; the next
best change is to build those regression tests rather than modify functioning
authorization logic without a reproduced defect.
