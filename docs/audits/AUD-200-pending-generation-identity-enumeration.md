# AUD-200 — Enumerate recoverable generation identities

## Problem
The authenticated generation-recovery endpoint added in AUD-199 could not yet be used by the frontend: the browser persistence helper supported reading one request only when its original fingerprint was known. After a reload or when the user changed generation settings, the UI no longer necessarily knew those fingerprints.

## Change
- Added `listPendingGenerationRequests()` to enumerate scoped v2 records from persistent storage and the tab-scoped fallback.
- Merged in-memory, local-storage, and session-storage identities without mutating or deleting any record.
- Deduplicated by compact fingerprint and rejected malformed fingerprints or idempotency keys that do not satisfy the server endpoint's key format.
- Added regression tests for enumeration, storage merging, deduplication, malformed records, and read-only behavior.

## User impact
This is the client-side foundation for showing the user completed generations after a reload, even when the current topic or settings have changed. It does not start a new generation or spend credits.

## Scope / verification
- This change only adds a read-only enumeration helper and tests; it does not yet display recovered results in the PinGenerator UI.
- Full frontend tests/build have not been run in this environment because the project dependencies are not installed.
- No production database, deployment, or payment configuration was changed.
