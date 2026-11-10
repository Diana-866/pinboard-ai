# AUD-171 — Resilient generation identity when browser session storage is unavailable

## Finding

The image-generation API already has a durable server-side task journal. It records the provider task outcome and source URL before attempting to copy the image into permanent Storage. If Storage fails, a retry with the same request identity can rehost the saved result without submitting a second billable image task. The atomic completion RPC also keeps pin insertion and credit settlement in one transaction.

A separate browser-side availability issue remained: `PinGenerator` accessed `sessionStorage` directly before sending the generation request and after completion. Browsers can deny access to session storage (for example, privacy/security settings or a restricted embedded context). In that case the exception interrupted generation before the backend could use its recovery journal.

## Implementation

- Added `frontend/src/utils/pendingGenerationRequest.ts` to safely read, write, and clear the generation fingerprint/idempotency key.
- Store the fingerprint and key together in one JSON entry, avoiding a partial two-key write that could pair a new fingerprint with an old idempotency key.
- Retain the active identity in page memory if session storage is unavailable or rejects a write. This allows a same-page retry/remount to reuse the same key.
- Continue reading the two legacy session keys for compatibility with sessions created by the previous frontend.
- Update `PinGenerator` to use the safe helper instead of directly accessing `sessionStorage`.
- Preserve the existing behavior: a definitive pre-provider failure rotates the key; an ambiguous/in-progress result retains it; successful completion clears it.
- Added three focused utility tests for normal persistence, blocked storage fallback, and cleanup.
- Corrected the storage-recovery regression assertion in `backend/test/pins-provider-boundary.test.js`: after a successful provider result and a failed Storage copy, recovery must rehost the saved provider URL without a second provider create call. The test now expects exactly one provider create and two Storage attempts.

## User-visible effect

If the browser blocks session storage, PinPosy no longer fails before starting image generation. The current page keeps the request identity in memory, so the user can retry an ambiguous request without accidentally creating a second paid image task. When browser storage is available, the same identity also survives a page reload in that tab.

If storage is blocked and the page is fully reloaded or closed, the in-memory fallback cannot survive that reload. The backend still retains its journal, but the browser may no longer possess the key needed to retrieve it. This change does not claim cross-device or post-restart recovery in that restricted-browser case.

## Verification and scope

- Source-level review confirms the generator no longer directly reads/writes/removes `sessionStorage` for generation identity.
- Added three tests in `frontend/src/utils/pendingGenerationRequest.test.ts`.
- Updated the backend Storage-recovery regression to assert no duplicate provider create.
- Node/tsx test suites, frontend TypeScript check, Vite build, and browser-level storage-denial tests have not been executed in this environment.
- No database migration, production data, provider call, deployment, or PR merge was performed.
