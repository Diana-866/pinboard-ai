# AUD-338 — Bounded validation for pin-generation plans

**Date:** 2026-11-10  
**Branch:** `feat/persisted-boards-api`  
**Status:** SOURCE CHANGE COMMITTED — execution of tests not yet confirmed  
**Related:** AUD-334–AUD-337

## Changes

### 1. Shared bounded parser

Extended `backend/textOutputValidation.js` with:
- `validatePinIdeas(value, requestedCount)`
- `parsePinIdeasResponse(raw, requestedCount)`
- limits: 1–10 requested ideas, title up to 200 chars, optional description up to 2,000 chars, image prompt up to 12,000 chars;
- string type checks, trimming, rejection of empty required fields, and rejection of malformed entries;
- only the supported public fields are returned; provider extras are discarded;
- JSON arrays surrounded by provider prose remain supported.

The parser validates every item within the requested batch. Ideas beyond the requested count remain ignored, matching the previous `slice(0, count)` behavior. A short but valid response remains a partial plan, matching the previous behavior; it is not padded with fabricated ideas.

### 2. Generation pipeline integration

`backend/pins.js` now parses and validates `textResult.content` before building task records or invoking quote validation. It no longer silently filters malformed entries or coerces arbitrary field values to strings.

The public generation route already validates `count` as an integer from 1 to 10 (default 6), matching the validator's accepted range.

### 3. Tests added

Extended `backend/test/text-output-validation.test.js` to cover:
- valid and normalized pin ideas;
- optional description;
- wrong types, blank required fields and overlong fields;
- invalid count and empty arrays;
- prose-wrapped JSON and requested-count truncation;
- malformed JSON and malformed array entries.

Extended `backend/test/pins-provider-boundary.test.js` to verify:
- malformed ideas are rejected before quote validation and image-provider submission;
- a valid partial response remains a partial plan and uses an empty optional description.

## Spend-policy decision intentionally deferred

AUD-337 identified that pin-plan text generation uses `requireUsage: false` and that a missing/non-RUB text cost is recorded as `null`; image quoting/submission may still proceed. AUD-338 does not change this policy because choosing between strict fail-closed behavior and availability with explicit reconciliation is a product/operational decision, not a safe incidental parser change.

No unknown cost is converted to zero. No credit reservation, tariff, quote, settlement, provider recovery, or payment logic was changed.

## Validation status and limitations

- Source files and test files were written to the branch and read back.
- The repository's Node test suite has not been executed from this GitHub-only workflow.
- No claim is made that tests, lint, typecheck, build, or deployment passed.
- No GPTunnel requests, Supabase reads/writes, migrations, payments, or production actions occurred.

## Next

AUD-339: review the missing text-cost behavior end-to-end (provider response shape, usage journal, request recovery and settlement) and present a narrowly scoped fail-closed vs reconciliation decision with consequences. Separately verify CI execution when GitHub reports a workflow run; do not infer test success from the presence of test files.
