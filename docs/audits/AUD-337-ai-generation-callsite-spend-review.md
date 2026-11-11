# AUD-337 — Remaining AI generation entrypoints and spend-accounting review

**Date:** 2026-11-10  
**Branch:** `feat/persisted-boards-api`  
**Status:** SOURCE REVIEW COMPLETE — no source changes  
**Related:** AUD-329–AUD-336

## Scope

Reviewed the AI routes in `backend/index.js`, the generation pipeline in `backend/pins.js`, the GPTunnel adapter in `backend/gptunnel.js`, and relevant provider/pricing/recovery tests. This is a source-level review; production traffic, provider account usage, and live DB state were not available.

## Confirmed call-site map

The reviewed backend has three text-generation paths:

1. Website analysis: `analyzeSite()` -> legacy `generateText()`.
2. AI board suggestions: `generateBoards()` -> legacy `generateText()`.
3. Pin content plan: `generatePins()` -> `generateTextWithUsage()`.

The image-generation paths are:
- `POST /boards/:id/pins/generate`: durable request idempotency, credit reservation, text usage callback, task quote journal, provider task journal, recovery and atomic completion/debit.
- `POST /pins/:id/regenerate`: durable idempotency, exact image quote, credit reservation, task ID persistence, recovery and atomic completion/debit.

No additional direct call to `generateText()` was found in the route/helper modules inspected for this audit. This does not establish the absence of indirect or external consumers.

## Findings

### 1. Pin-plan output has weaker schema validation than the newly hardened legacy endpoints

In `backend/pins.js`:
- It parses a JSON array and rejects only malformed JSON or an empty/non-array result.
- It takes the first `count` entries, then filters for truthy `title` and `image_prompt`.
- It coerces arbitrary values to strings and truncates title to 200, description to 2,000, and image prompt to 12,000 characters.
- It does not require these fields to be strings, reject whitespace-only values, or bound the returned item count to the exact request after filtering.

This is not a demonstrated exploit; however, model output is less strictly validated here than analysis and board suggestions. Malformed data can be coerced into low-quality task inputs, and fewer tasks than requested can be silently planned.

### 2. Pin-plan usage is captured, but missing cost metadata does not stop the workflow

- `generatePins()` calls `generateTextWithUsage(prompt, { requireUsage: false })`.
- The route's `onTextProviderUsage` callback writes provider request ID, model and token usage to `record_pin_generation_text_usage`.
- `p_total_cost_rub` is passed as null when GPTunnel omits/does not return a valid `total_cost`.
- The pipeline can continue into image quoting/submission after the usage record is written with unknown cost.

The existing design therefore records unknown text cost as unknown (not zero), but it does not impose a fail-closed spend policy for that text operation. A missing-cost response may be acceptable for availability, but it weakens strict cost observability and budget enforcement. This is consistent with the residual risk already identified in AUD-329/330.

### 3. Image-generation accounting and recovery are comparatively strong

The reviewed route/helper flow:
- marks the text-provider submission boundary before making the request;
- persists text usage before parsing the model response;
- reserves credits before image submissions;
- obtains and journals exact per-image quotes;
- persists provider task IDs and terminal price/result;
- resumes known tasks rather than creating duplicate tasks;
- settles against actual provider price and atomically saves pins/debits credits.

Relevant focused tests exist for usage capture, missing-cost behavior in the adapter, reservation rounding, provider task recovery, storage recovery and no duplicate provider create on a journaled task.

### 4. Legacy analysis and board ideas remain the unjournaled spend gap

As established by AUD-329–AUD-333, those two operations still call the compatibility `generateText()` wrapper and discard provider usage/request identity. Analysis has no tariff gate; board suggestions have a tariff gate. Both rely on a process-local rate limiter rather than durable spend accounting.

## Recommendations

1. Extend bounded schema validation to pin-plan ideas, preserving the existing JSON-with-surrounding-prose compatibility and current partial-success semantics unless product requirements say otherwise.
2. Make the missing text-cost policy explicit. Safer strict-budget behavior is to stop before image quotes/submissions when text usage cost is missing; if availability is preferred, retain an explicit `cost_missing` state and expose it to operational reconciliation rather than treating it as zero.
3. Add durable usage/idempotency journal support to analysis and board ideas only after confirming those endpoints remain supported product/API capabilities.
4. Do not change image credit tariffs or settlement logic as part of this hardening.

## Validation and limitations

- Relevant source and tests were read from the branch.
- No tests, lint, typecheck, build, HTTP tests, or production log checks were executed.
- No GPTunnel calls, Supabase reads/writes, migrations, payments or deployment occurred.
- No production provider usage/cost report was available.

## Next

AUD-338: add a dedicated bounded validator/parser for pin-plan JSON output and focused unit tests, preserving the existing response/partial-task semantics. Separately record a product decision on whether missing text cost should block image generation or remain a visible reconciliation state.
