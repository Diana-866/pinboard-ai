# AUD-365 — Pinterest backend security boundaries

**Date:** 2026-11-11  
**Status:** source audit complete; route security regression contract added

## Reviewed

- Pinterest OAuth start, callback, browser binding and one-time attempt lifecycle.
- Session and OAuth JWT algorithms/claims.
- Pinterest access/refresh token encryption, key rotation and public account projection.
- Account refresh lease and account-scoped API request retry behavior.
- Pinterest authenticated routes, scheduler secret route and schedule ownership checks.
- URL fetching used by site analysis and image rehosting.
- Pinterest API rate-limit configuration.

## Confirmed protections

1. OAuth state is signed with the application JWT secret, has a 15-minute expiry, purpose claim, token version, attempt UUID/generation and browser-binding hash. Callback requires the same browser's HttpOnly/Secure/SameSite=Lax cookie. Database attempt generation and token version are checked before committing OAuth credentials.
2. Pinterest credentials are encrypted using AES-256-GCM with a fresh 12-byte IV and authentication tag. A previous encryption key is supported for controlled rotation. Invalid/missing key fails closed for encryption.
3. Public account and disconnect response projections whitelist metadata and omit access token, refresh token and internal user ID.
4. User-facing Pinterest account, board, publish and schedule routes require authenticated user context. Schedule lookup/mutation includes user ownership predicates; publication additionally verifies selected account and board against that user.
5. Internal scheduler requires a 32-byte minimum secret and timing-safe equality check.
6. Site analysis and image rehosting validate all resolved DNS addresses, reject non-public addresses, pin the validated lookup to the HTTP agent, disable proxy use and automatic redirects, and enforce response size/time limits. Image rehosting additionally requires HTTPS.
7. Non-idempotent publish does not replay on HTTP 429. Account refresh rotation uses a database lease to serialize across backend instances.

## Operational limitation found

Pinterest rate limits use Express's default in-memory store. The source explicitly documents that this is process-local. If the API is scaled to multiple instances, each instance will maintain its own counter, so effective limits multiply and reset independently. This is not an authentication bypass, but it weakens abuse protection under horizontal scaling. Before scaling, configure a shared rate-limit store (for example, Redis-compatible storage) and verify trusted proxy/IP configuration for unauthenticated OAuth callback and scheduler routes. No shared-store dependency is added in this audit.

## Regression guard

Added `backend/test/pinterest-security-contract.test.js` to assert authentication middleware on user routes, OAuth state/browser binding, scheduler secret checks, token-free public projection, and the documented process-local limiter limitation. Existing focused tests cover encryption, browser binding, public projections, account refresh and SSRF address pinning.

## Verification limits

Source and tests were reviewed from the feature branch. Node tests, lint, build, CI, staging, live DB, Pinterest API and deployment were not run. No credentials were accessed or changed.

## Rollout note

No production action is required for the verified protections. Before horizontal scaling, use a shared rate-limit store. Continue to keep the Pinterest encryption key and scheduler secret only in backend secret storage; never put either in frontend build-time variables.
