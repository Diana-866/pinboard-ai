# AUD-343 — Atomic persistence of GPTunnel text usage and pin plan

**Date:** 2026-11-10  
**Status:** IMPLEMENTED IN SOURCE + SQL INTEGRATION TEST ADDED  
**Runtime validation:** not executed

## Change

Added migration `121_atomic_pin_generation_text_plan.sql` with service-role-only RPC `record_pin_generation_text_plan`. In one PostgreSQL transaction it:
1. records immutable GPTunnel usage/cost through the existing `record_pin_generation_text_usage` function;
2. saves the validated normalized task plan through the existing claim-token-fenced `save_pin_generation_plan` function;
3. returns the persisted task plan.

If plan validation or insertion fails, PostgreSQL rolls back the usage insert from that same RPC call. Existing usage replay conflict checks and claim-token checks remain in force.

## Backend integration

- `backend/pins.js` parses provider output and normalizes task rows, then prefers the new `persistTextPlan(textResult, tasks)` callback.
- `backend/index.js` now calls the combined RPC for valid plans.
- Invalid model output is not eligible for an image plan, but the paid text usage fact is still recorded through the existing usage-only RPC before the parse error is returned.
- Existing callback fallback remains available for tests/other callers.
- Quote checks and image provider calls occur only after the combined journal operation returns successfully.

## Regression coverage added

- Provider-boundary test verifies the combined journal receives provider usage plus normalized task data before quote/image work; legacy separate persistence callbacks are bypassed.
- SQL integration test verifies the combined RPC writes both usage and plan, and verifies invalid task-plan validation rolls back the usage insert.
- Existing failure-boundary test still covers separate usage/plan journal failure behavior.

## Recovery behavior and limitations

This closes the identified valid-plan orphan window: successful text usage and the corresponding normalized task plan commit together or neither commits. It does not recover a process crash after GPTunnel accepts the text request but before the backend receives its response; in that case there is no durable response payload to journal and the existing unknown/no-auto-retry protection remains necessary. Invalid text output retains usage accounting but has no image plan by design.

## Deployment / validation requirements

- Apply migration 121 before deploying backend code that calls the new RPC.
- Ensure migration runner applies it after migrations 045, 046, and 069.
- Run backend provider-boundary tests and the SQL integration script against a disposable PostgreSQL/Supabase-compatible test database.
- Runtime tests, SQL integration, lint, build, CI, and live DB checks were not run in this session.
- No production database writes, provider calls, payment actions, merge, or deployment were performed.
