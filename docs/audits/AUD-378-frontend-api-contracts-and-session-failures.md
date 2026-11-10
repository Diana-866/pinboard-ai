# AUD-378 — Frontend/backend contracts and browser-session failure handling

**Date:** 2026-11-11  
**Status:** source audit complete; focused auth-storage fix committed  
**Scope:** frontend API wrapper, AuthContext, login flow, persisted boards/projects, generation recovery contracts and selected frontend response validators.

## Summary

The reviewed board and generation contracts are aligned: the frontend loads `GET /boards` as an array, provisions a project through `GET/POST /projects`, creates boards with a UUID `create_request_id`, and retrieves generation recovery through `GET /generation/requests/:key`. Backend routes return the corresponding shapes and enforce owner scoping. Board create retries reuse a request UUID; backend binds that UUID to a payload fingerprint and rejects reuse for different board content.

Existing frontend validators deliberately reject malformed board/pin/schedule payloads instead of rendering malformed responses as empty user data. Generation recovery treats 404 as a distinct not-found state and transient network/5xx failures as unknown, preserving the local idempotency identity.

## AUD-378-01 — Fixed: localStorage exceptions escaped auth/API boundaries

**Before:** `apiRequest` read and removed the JWT through `localStorage` outside its fetch/error boundary. `AuthContext.refreshUser` read the token and language preference without protection; 401 cleanup and logout also removed the token directly. In privacy-restricted, sandboxed or browser-policy contexts, a `SecurityError` could escape before a request, prevent a successful `/me` response from hydrating the user, or interrupt logout/401 handling. Login could receive a valid server token but fail while persisting it without a clear explanation.

**Fix:** added `frontend/src/lib/authStorage.ts` with safe read/write/clear helpers and a safe preference read. API requests, session refresh, 401 cleanup, logout and login now use these helpers. If token persistence is unavailable, login stops and shows a clear error rather than navigating into an unauthenticated session. Authentication fails closed: unavailable storage is not treated as a valid authenticated session.

Regression coverage added in `frontend/src/lib/authStorage.test.ts` for normal read/write/clear, blocked localStorage property access, throwing storage methods and invalid tokens.

## Confirmed contracts

- `GET /boards` returns an array, scoped through the authenticated user's project IDs; frontend `mapPersistedBoards` rejects malformed records and preserves the distinction between empty and invalid.
- `POST /projects` returns a serialized project; `getOrCreateProject` validates the array/ID and coalesces concurrent provisioning within one browser runtime. If a create response is lost, a later attempt first reloads the project list before creating.
- `POST /boards` accepts `project_id`, `title`, `description`, `create_request_id`; backend fingerprints the request payload, upserts idempotently and rejects a reused UUID with changed content.
- `GET /generation/requests/:key` matches the frontend recovery route `/generation/requests/{key}`; backend scopes lookup by user and exposes a constrained recovery projection.
- Persisted board/pin/schedule validators reject malformed responses rather than silently showing empty collections.

## Remaining limitations / follow-up

1. Project provisioning coalescing is in-memory per browser runtime, not cross-tab or cross-device. Concurrent first-board creation in separate tabs can still race to create multiple project rows unless the database enforces a one-project policy or the API adds durable idempotency. This is not changed here because existing users may legitimately have multiple projects.
2. API requests currently assume JSON responses; a successful non-JSON response is returned as null. Current reviewed endpoints are JSON APIs, but a proxy/hosting HTML success page will surface later as a contract-validation error rather than a specific content-type diagnostic.
3. Local pending-generation identities remain browser-local; cross-device recovery requires the original idempotency key or a server-side user recovery listing endpoint.
4. No live deployed backend or migration state was inspected.

## Validation and safety

- Source-level route/consumer comparison and readback of committed files.
- No frontend tests, TypeScript lint, production build, CI or browser tests were executed in this environment.
- No database/provider/storage requests, payment operations, production writes, migrations or deployment were performed.
