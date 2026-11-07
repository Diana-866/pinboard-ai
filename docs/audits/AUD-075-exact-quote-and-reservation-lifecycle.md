# AUD-075 — Exact quote pricing and reservation lifecycle

Date: 2026-11-07  
Branch: `feat/persisted-boards-api`  
Scope: static review plus a pure pricing helper. No provider API calls, SQL execution, deployment, or production changes.

## Current flow observed

The `POST /boards/:id/pins/generate` route currently:
1. claims the idempotent generation request;
2. estimates and reserves image credits from local `MODEL_PRICES` for the requested count;
3. calls `generatePins`, which may first call billable `gpt-4o` to create the plan;
4. persists the plan, submits/polls image tasks, and records actual provider image prices;
5. converts each actual image price to user credits with `Math.ceil(providerPrice * MARKUP)`;
6. settles via `complete_pin_generation_request`, which rejects charges greater than the existing reservation.

This ordering has two separate accounting issues:
- GPTunnel text-plan usage is not captured in the route; the current `generateText()` compatibility wrapper deliberately discards `usage.total_cost`.
- Exact image quotes can only be requested after the prompt/ratio plan exists, but the reservation is currently created before the plan. The reservation RPC is immutable/idempotent for one amount: repeating it with a different amount raises `generation reservation amount mismatch`. Settlement also refuses a charge above the reservation.

## Work completed

- Added `calculateQuotedGenerationPricing(quotes, markup)` to `backend/generationPricing.js`.
- Added tests to `backend/test/generation-pricing.test.js` for per-image rounding parity, separate provider RUB vs user credits, invalid currencies/prices (including zero, which current pin settlement rejects), count bounds and markup validation.
- The helper intentionally has no DB/provider side effects and does not change current route behavior or product pricing.

## Safe integration design (not yet wired)

1. Keep the current initial conservative reservation before any billable text planning call.
2. Add a provider-operation journal for text and image operations with unique local operation IDs, request fingerprint, provider model, prompt/params hash, state (`prepared/submitting/unknown/succeeded/failed`), provider task/request ID, gross RUB cost, refund state, usage token details, and timestamps.
3. For text-plan calls, set an explicit bounded `max_tokens`, capture `usage.total_cost` and provider request ID via `generateTextWithUsage`, and persist the outcome. A timeout after submission must remain `unknown`; do not blindly repeat a billable chat request because the chat API does not currently expose a verified idempotency contract in this code.
4. Persist the immutable image plan first. Quote each exact `{model,prompt,params,inputs}` task using `quoteImageTask`; store the returned RUB quote, applied params and ignored params before task submission.
5. Convert those quotes through `calculateQuotedGenerationPricing`; add a versioned atomic reservation-resize RPC. It must lock the user row first, then reservation, count other active reservations, permit only a still-reserved current request, and fail if the available balance cannot cover the new ceiling. Do not resize/requote a request with already-submitted provider tasks; recovery must use its stored quotes and task IDs.
6. Only after quote persistence and successful reservation adjustment may prepared image tasks be submitted. Use the exact same model/prompt/params as quoted.
7. On settlement, verify per-task final provider price against the quote. If actual provider price exceeds quote, do not silently undercharge platform cost or overdraw the user reservation: preserve provider outcome, leave request recoverable/unknown, and require an explicit policy path.
8. Reconcile text and image provider RUB spend independently from user-credit transactions. Do not introduce new user charges for text generation without product/pricing approval.

## Important provider-quote caveat

GPTunnel's media quote endpoint cannot necessarily calculate every input-dependent metric (for example, source image megapixels or input video duration) before actual processing. Quote results must retain ignored/defaulted parameters and identify any task where the quote is approximate. Current helper rejects ignored parameters and aspect-ratio mismatches for the supported image flow; it is not a universal guarantee for all media models.

## Verification and deployment gate

Only static source review was performed. New helper tests were added but not run; no Node, PostgreSQL, Bash, provider, or CI execution is claimed. No migration or route wiring was added in this audit because the safe split between text planning, quote persistence, reservation resize, and task submission requires a larger state-machine change. No production DB, balances, tariffs, payment settings, credentials, DNS, or deployment were touched.

**Status:** AUD-075 / QUOTED_PRICING_HELPER_ADDED / FLOW_AUDITED / BILLABLE_TEXT_JOURNAL_REQUIRED / RESERVATION_RESIZE_REQUIRED / NOT_DEPLOYABLE_AS_FULL_QUOTE_BILLING.


## AUD-075 follow-up — migration 065 groundwork

- Added `db/migrations/065_resize_pin_generation_credit_reservation.sql`: claim-token-fenced `resize_pin_generation_credit_reservation`.
- RPC uses the settlement-compatible lock order (user row → generation request → reservation), requires a processing request and active reservation, and computes other active reservations before changing the amount.
- Both increasing and decreasing are supported; an increase fails atomically when available balance cannot cover it. A stale claim or settled/released reservation is rejected.
- Added `backend/test/generation-reservation-resize.sh` covering increase with another reservation protected, over-budget rejection without mutation, decrease, and stale claim rejection.
- This is DB groundwork only. It is not yet wired into the route and must not be used until tested against a disposable database. Exact quote persistence, quote-vs-final price reconciliation, and billable text-operation journal remain unimplemented.
