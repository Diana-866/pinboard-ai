# AUD-352 — safe structured logging foundation

**Date:** 2026-11-11  
**Status:** PARTIAL IMPLEMENTATION — central HTTP error handler migrated; remaining call sites are follow-up work

## Implemented

- Added `backend/safeLogger.js` with structured JSON events and a strict field allowlist.
- Logger accepts only a normalized event name, optional valid HTTP status, and a bounded machine-style error code.
- It deliberately excludes error messages, stacks, nested causes, request/response objects, provider payloads, headers, tokens, and arbitrary metadata.
- Added `backend/test/safe-logger.test.js` covering allowlisted output, nested secret omission, unsafe error codes, invalid statuses, and hostile error objects.
- Migrated the central `handleError` path in `backend/index.js`: 5xx errors now use safe error events; 4xx rejections use safe warning events. Public HTTP response behavior is unchanged.

## Remaining work

- Other modules still contain direct `console.error`/`console.warn` calls, including auth, billing, Pinterest, storage, generation and worker paths. They must be migrated incrementally.
- The webhook wrapper and startup warnings are outside the central `handleError` path.
- The logger currently has no request correlation ID because the central handler does not receive the request object. A later middleware change should add a random request ID and pass only that ID through an explicit allowlisted API.
- External hosting log retention and access control remain unverified.

## Safety notes

- No raw error messages are emitted by the new logger. The optional error code is accepted only when it matches a narrow uppercase alphanumeric/underscore/hyphen format.
- The logger is intentionally minimal; do not extend it to serialize arbitrary metadata or whole error objects.
- This change does not alter payment, credit, OAuth, database, or user data flows.

## Validation

- Source files and test were saved to branch `feat/persisted-boards-api` and read back from GitHub.
- The Node test suite was not executed in this environment; test coverage is authored but not yet runtime-verified.
- No lint, build, CI, deployment, database migration, provider call, or production log access was performed.
- PR #4 remains Draft/open; Vercel previously reported `build-rate-limit`; GitHub Actions workflow runs were not present for the checked commit.
