# AUD-202 — Validate persisted generation recovery identities

## Problem
The browser-side recovery store validated fingerprints and idempotency keys when enumerating records for the recovery panel, but its direct read path accepted any non-empty idempotency key. The write path also accepted malformed keys and malformed values that claimed to be versioned fingerprints. A corrupted or manually modified browser-storage record could therefore be restored by the generation form and sent as an invalid retry identity.

## Product changes
- Added shared format checks for versioned fingerprints (`fp1:` plus 16 lowercase hexadecimal characters) and idempotency keys (16–128 URL-safe characters).
- The storage parser now rejects malformed identities before they can enter the in-memory cache or legacy migration path.
- The write helper refuses malformed identities and does not persist them.
- The enumeration path uses the same validators, so the recovery panel and direct retry path enforce one consistent contract.
- Legacy raw fingerprints remain supported: they are hashed into the current compact format before validation, preserving existing migration behavior.

## User impact
If browser storage contains a damaged or manually altered generation key, PinPosy will no longer blindly reuse it for a retry. The app will treat that record as unavailable rather than sending a malformed request. Valid existing recovery keys continue to work, and this change does not clear unrelated requests or alter credit balances.

## Verification and limitations
- Added regression tests for malformed persisted keys, invalid writes, and malformed versioned fingerprints.
- Tests, TypeScript check, and frontend build were not executed in this environment because project dependencies are not installed.
- No database migration, production change, deployment, real generation, or PR merge was performed.
