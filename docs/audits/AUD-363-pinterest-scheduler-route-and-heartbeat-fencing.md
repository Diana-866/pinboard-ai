# AUD-363 — Pinterest scheduler route and heartbeat completion fencing

**Date:** 2026-11-11  
**Status:** route verified; terminal heartbeat completion fenced; staging required

## Correction to AUD-362

The previous audit incorrectly stated that `POST /internal/pinterest/schedule/run` did not exist. The route is implemented in `backend/pinterest.js` and is registered by `backend/index.js` through `require("./pinterest").registerRoutes(app, ...)`. The worker URL matches the route. The earlier claim that the worker did not reach the heartbeat RPCs was also incorrect.

## Verified existing flow

- Worker sends HTTPS POST to the route, with scheduler secret header and one-row limit.
- Route applies an IP rate limit and verifies the configured secret with `crypto.timingSafeEqual`.
- Run starts through monitor RPC, then checks Pinterest configuration.
- It reconciles only confirmed publication successes, claims one due row, renews its claim, checks paid-plan eligibility, and calls the established `publishPin()` path.
- Publish failure resolution consults the exact attempt journal and publication ledger. Ambiguous outcomes remain non-retryable/unknown.
- The route records aggregate completion counts; admin health is a separate read-only endpoint.
- The endpoint does not create a parallel publication implementation.

## New race condition addressed

Migration 122's completion RPC matched only `last_run_id`. If a completion transaction committed but its response was lost, the route's catch path could retry completion for the same run UUID with `failed`, overwriting a previously committed `succeeded` state.

Added `123_pinterest_scheduler_completion_fencing.sql`. The replacement completion RPC updates only the current run whose monitor status is still `running`. A terminal result cannot be overwritten by a duplicate completion, and a superseded run UUID cannot complete a newer run.

The route now keeps run counters outside the try block and passes accumulated counters into failure completion rather than writing zeroes after work has already been done.

## Regression guard

Added a source-contract test checking route registration, worker URL agreement, timing-safe secret check, monitor start/completion RPCs, claim, claim renewal, established publish path, and migration 123's terminal fence. This is not a substitute for PostgreSQL integration tests.

## Rollout boundary

Migrations 122 and 123 have not been applied to Supabase. The worker/cron has not been activated in production. Apply both migrations to staging with the exact backend commit, run Node and PostgreSQL integration tests, then require explicit owner approval before any production rollout.

## Verification limits

Source changes and documentation were read back from the feature branch. Node tests, lint, build, CI, staging, production database, and Pinterest API were not run.
