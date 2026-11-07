# AUD-077 — GPTunneL text-generation usage accounting

**Date:** 2026-11-07  
**Scope:** Multi-pin text-plan generation (POST /boards/:id/pins/generate)

## Finding

backend/pins.js previously called generateText() and retained only the generated content. The provider adapter already received token and cost usage from GPTunneL, but the generation journal did not store that usage. This prevented reliable per-request text-provider cost accounting.

## Currency verification

GPTunneL's official Chat Completions documentation shows usage.total_cost and explicitly describes it as the amount charged in rubles. The ledger therefore stores this provider expense as RUB. It remains separate from PinPosy's internal user credits and from image-generation costs.

## Implemented

- backend/gptunnel.js exposes token counters, prompt/completion/total cost, cache counters, provider model, request ID, and costCurrency: RUB.
- backend/pins.js now calls generateTextWithUsage() and awaits the persistence callback immediately after the text response, before parsing the returned ideas or submitting image tasks.
- backend/index.js persists usage through claim-fenced RPC record_pin_generation_text_usage.
- New migration 069_gptunnel_text_usage_ledger.sql creates a service-role-only ledger keyed by (user_id, idempotency_key). It stores no prompt or generated content, only provider metadata, token counters and RUB amounts.
- If GPTunneL returns usage counters but no authoritative total_cost, the ledger records cost_missing rather than inventing a cost.
- Exact replay is idempotent; conflicting replay and stale claim tokens are rejected.
- CI applies migration 069 and runs backend/test/pin-generation-text-usage.integration.sql.
- backend/test/pins-provider-boundary.test.js checks that usage persistence is awaited before image generation.

## Verification status

- JavaScript syntax checks: pending final pass.
- PostgreSQL integration: pending GitHub Actions execution.
- No real GPTunneL request, production database migration, payment, deployment or merge was performed.

**Status:** TEXT_USAGE_CAPTURE_WIRED / RUB_CURRENCY_DOCUMENTED / USER_CREDITS_SEPARATE / CI_UNVERIFIED.