# AUD-276 — pin editing and concurrent deletion handling

Date: 2026-11-09  
Branch: `feat/persisted-boards-api`

## Findings

- `PATCH /pins/:id` used the generic optional-string helper for descriptions. Empty descriptions were therefore normalized as “field omitted” in some paths, and patch validation was embedded in the route.
- The pin status route destructured `req.body` directly, so a missing/null body could become an unexpected server error instead of a validation response.
- Both pin update routes used `.single()` after the ownership lookup. If the pin was deleted between lookup and update, the empty update result was surfaced as a generic database error rather than a clear not-found response.

## Changes

- Added `backend/pinPatch.js` with presence-aware patch construction.
- Empty, whitespace-only, or explicit null descriptions now clear the description; omitted descriptions remain untouched.
- Titles are trimmed, capped at 100 characters, and cannot be empty.
- Aspect ratio is validated against the server's allowlist.
- Empty/unknown-only patches and invalid description types return HTTP 422.
- `PATCH /pins/:id` and `POST /pins/:id/status` now use `.maybeSingle()` and return HTTP 404 if the pin disappeared after ownership was checked.
- The status route safely handles missing or non-object request bodies and returns HTTP 422 for invalid status.
- Existing ownership checks and board-scoped updates remain intact.
- Added `backend/test/pin-patch.test.js` covering field presence, description clearing, title validation, and aspect ratio validation.

## Verification

- Read back the updated route, helper, and tests from the PR branch.
- Tests have not been executed in this environment.
- No database migration, production data change, deployment, or merge was performed.
