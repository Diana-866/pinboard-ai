# AUD-334 — Bounded validation for legacy GPTunnel text outputs

**Date:** 2026-11-10  
**Branch:** `feat/persisted-boards-api`  
**Status:** IMPLEMENTED IN SOURCE — execution checks pending  
**Related:** AUD-331, AUD-332, AUD-333

## Changes

Added `backend/textOutputValidation.js` with dependency-free validators and explicit limits:

- Analysis: `niche` must be a non-empty string up to 80 characters; `summary` up to 1,200 characters.
- Board ideas: result must be an array containing 1–5 entries.
- Each board: non-empty `title` up to 40 characters and non-empty `description` up to 500 characters.
- Surrounding whitespace is trimmed.
- Only the supported public fields are returned; extra model-generated keys are discarded.
- Invalid provider output raises HTTP 502 instead of being persisted.

Integrated the validators into `backend/analyze.js` and `backend/boards.js`. The analysis JSON parse fallback no longer stores raw provider text as a project summary. Both helpers convert malformed model output into controlled 502 errors.

Prompts now explicitly describe fetched site/project data as untrusted context and instruct the model not to follow commands embedded in it. This is a prompt-level mitigation, not a security boundary; schema validation remains the enforcement layer.

Added `backend/test/text-output-validation.test.js` covering valid results, trimming, missing/wrong-type/empty fields, overlong strings, malformed entries, and array size boundaries.

## Compatibility and behavior

- No route paths, auth, tariff gates, database columns, success response shapes, or credit rules changed.
- Board generation accepts between one and five valid suggestions rather than requiring exactly five; this avoids rejecting a partial but useful provider response.
- Analysis still returns only `niche` and `summary`.
- Existing website-fetch SSRF controls were preserved.

## Validation status and limitations

- Source files and test file were read back from the branch after writing.
- Automated test execution, lint, typecheck, build, and HTTP integration tests were not run in this environment. Do not interpret the added tests as passing.
- No GPTunnel request, production database write, migration, deployment, or live payment action occurred.
- Character limits are application-level bounds; database column limits/schema were not independently queried in this change.

## Next

AUD-335: inspect existing DB column types/constraints and route error handling against the new limits; add focused tests for helper-level parse/error behavior where practical. Then arrange a real backend test run in CI or a supported runtime before considering merge.
