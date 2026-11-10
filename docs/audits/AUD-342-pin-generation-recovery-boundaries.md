# AUD-342 — Pin-generation recovery boundaries and unjournaled text-plan failure

**Date:** 2026-11-10  
**Branch:** `feat/persisted-boards-api`  
**Status:** REVIEW + REGRESSION TEST COMMITTED — runtime tests not executed

## Confirmed recovery protections

1. `begin_pin_generation_request` returns completed results idempotently, blocks active processing requests, and only resumes unknown requests when a durable task plan exists.
2. The request fingerprint prevents reusing an idempotency key with changed generation parameters.
3. `save_pin_generation_plan` is claim-token fenced and persists a complete validated plan before task quotes or image submissions.
4. Each task has a durable provider idempotency key. A saved provider task ID is polled directly; it is not replaced with a new create call.
5. Provider success and provider price are journaled before Storage rehosting; recovery can rehost the saved provider result URL.
6. Exact image quotes are persisted and validated on resume; reservation resizing is performed before image submission.
7. Final image charge, pin insert, and request completion are committed through the completion RPC.

## Gap: text provider success without durable plan

The text provider call is marked as started before submission. The response usage is journaled, then `persistPlan` saves the task plan. If the text provider succeeds but `save_pin_generation_plan` fails before any task rows are committed, the route marks the parent request outcome unknown. The migration's resume path intentionally allows resumption only when a task plan exists; an unknown request without a plan remains blocked.

This prevents a duplicate paid GPTunnel text call, but the user cannot self-recover this request. A crash after provider success but before plan persistence has the same fundamental gap. The current text-usage ledger records usage metadata, not the generated plan content, so it is insufficient to reconstruct image tasks.

## Regression test added

`backend/test/pins-provider-boundary.test.js` now asserts the sequence:
- mark text provider submission;
- receive text response;
- persist text usage;
- plan journal write fails;
- quote callback and image provider are never reached.

This locks in the safe no-duplicate/no-image-spend behavior. It does not make the orphaned request automatically recoverable.

## Recommended next design

Introduce a durable text-plan journal that stores the validated normalized plan atomically with the text usage fact, or a separate claim-token-fenced plan payload written before allowing any image quote. Retention, encryption/access, size limits, and idempotent replay must be designed. Do not automatically retry GPTunnel text generation for this failure class. An admin reconciliation path may be needed for existing orphaned requests.

## Validation and scope

- Regression test and report read back from GitHub.
- Node tests, lint, typecheck, build, CI, and live database/provider checks were not run.
- No migrations, production DB writes, provider calls, payments, merge, or deployment were performed.
