# AUD-072 — GPTunnel quote validation and billing lifecycle audit

Date: 2026-11-07  
Branch: `feat/persisted-boards-api`  
Scope: static source review + official GPTunnel documentation review. No provider key/API call, runtime test, database migration, deployment, or production change.

## 1. Concrete adapter defect fixed

The GPTunnel `POST /api/v2/media/price` contract says `ignored_params` reports ignored parameter names together with reasons. The existing adapter treated the field as an array of strings and used `includes("aspect_ratio")`. If the provider returns entries as objects (for example, `{ key, reason }`), the check would miss an ignored `aspect_ratio`.

Changes in this audit:
- `normalizeIgnoredParams()` now normalizes string and object forms (recognizing `key`, `param`, or `name`).
- `quoteImageTask()` now rejects any ignored parameter because the current request contains only the required `aspect_ratio` setting.
- It also checks the provider's applied `params.aspect_ratio` equals the requested ratio. A missing or defaulted/different applied ratio fails closed.
- Added regression cases for object-form ignored parameters and mismatched applied aspect ratio.

Files changed:
- `backend/gptunnel.js`
- `backend/test/gptunnel-pricing.test.js`

Runtime tests were NOT executed. These are source changes and test definitions only.

## 2. Current billing gaps confirmed

### Main image-generation flow
- `backend/index.js` reserves credits using `calculateGenerationReservation(MODEL_PRICES[model], count, MARKUP)`.
- `MODEL_PRICES` is a local static table; it is not refreshed from GPTunnel and does not represent the exact price for every model/parameter combination.
- The actual image provider price is only known after task completion and is used for final settlement.
- The request's text-plan call in `backend/pins.js` happens after the reservation but is not included in that reserve or the final pin charge. `generateText()` discards provider usage metadata.
- `quoteImageTask()` and `generateTextWithUsage()` remain unused by user-facing routes.

### Other paid LLM routes
- `backend/boards.js` calls the paid LLM to create five boards.
- `backend/analyze.js` calls the paid LLM to analyze a site.
- Both currently use legacy `generateText()`; there is no provider-cost ledger or explicit user-credit charge in these paths. Do not silently add user charges: product policy must decide whether these operations are included in a plan, rate-limited/free, or billed in credits.

### Separate image regeneration
- `POST /pins/:id/regenerate` has a separate fixed local model-price estimate and its own journal. It must be included in the same pricing audit before declaring all image-provider spending covered.

## 3. Provider contract details to preserve

Official GPTunnel docs reviewed:
- Media quote `POST /api/v2/media/price` accepts the future task's `model`, `prompt`, `params`, and `inputs`; it does not create a task or charge the provider balance. Returned `price` is RUB, discounts included, and `params` contains the values actually applied.
- `ignored_params` reports ignored parameters and reasons. A quote is not exact for all possible input-media metrics: documented examples include input-image megapixels and input-video duration. Such model/input combinations must be marked unsupported for strict pre-reservation or conservatively bounded.
- Media task completion exposes actual `price` and `refunded`; a failed task may or may not have been refunded, so settlement must use the actual provider outcome rather than assume every failure is free.
- `GET /v1/models` exposes LLM rates such as `cost_context` and `cost_completion`, but the adapter should not invent their units or compute a user charge from raw token counts where cache/pricing details can alter the charge.
- Chat completion `usage.total_cost` is the authoritative actual cost returned for a completed request; usage can include cache details. The response's `id` is useful for reconciliation, but does not by itself make an uncertain network retry safe.

References:
- https://docs.gptunnel.ru/creative-lab/price/
- https://docs.gptunnel.ru/creative-lab/models/
- https://docs.gptunnel.ru/creative-lab/get-task/
- https://docs.gptunnel.ru/api/models/
- https://docs.gptunnel.ru/api/chat-completions/

## 4. Safe implementation sequence — do not skip

1. **Define billing policy first.** Decide which user-facing actions consume credits (image generation, text plan generation, board suggestions, site analysis, image regeneration), whether plan entitlements include any of them, and whether partial generation is charged per successful output. Preserve existing public credit-pack prices unless explicitly approved.
2. **Add an append-only provider-operation journal.** Unique operation key per generation request + operation kind + task index; record exact request fingerprint, provider, model, preflight quote, currency, applied params, provider request/task ID, status, actual cost, refund flag, usage metadata, and timestamps. Enforce immutable identity and legal status transitions in SQL.
3. **Add atomic reservation adjustment.** Extend the existing reservation under the same user-row lock and reservation-row lock order. Same idempotency key + same requested total is a no-op; a lower total never releases funds already backing unresolved provider operations; an increase is atomic and fails before the next billable provider submission if balance is insufficient.
4. **Plan before image submissions.** Generate and persist the text plan once; do not repeat it on recovery. Quote every exact image task using its persisted prompt/model/ratio. Validate applied params and unsupported pricing dimensions. Aggregate the quotes plus any explicit conservative LLM budget, then atomically top up the reservation before the first image task is submitted.
5. **Bound LLM requests.** Set explicit `max_tokens`; obtain an upper-bound reservation from a verified GPTunnel pricing contract and the exact bounded prompt. Capture `usage.total_cost`, token/cache metadata, model and request ID. If the provider cannot offer a defensible upper bound, treat the LLM call as platform-subsidized with a strict platform budget or do not launch it; never reserve zero and hope actual cost is small.
6. **Reconcile media cost.** Compare each completed task's actual `price` and `refunded` against its quote and reserved amount. Never charge the user above the approved reserve. If actual exceeds reserve, record a billing incident and absorb the difference/platform-pause further work; do not silently overcharge.
7. **Handle uncertain outcomes safely.** Persist a submission intent before network I/O. After timeout/connection loss, do not issue a new billable request with a new key. Recover by provider task ID or the same provider idempotency key and exact payload. Keep funds reserved while outcome is unknown; release only after confirmed no-charge/refund or a definitive pre-submission failure.
8. **Settle atomically.** One SQL transaction should settle the final user charge, create the credit ledger entry, persist pins/results, and close the reservation/journal. Idempotent replay must return the existing settlement.
9. **Test against disposable PostgreSQL.** Cover concurrent top-ups, insufficient balance, duplicate operation keys, process death at every provider boundary, refunded/non-refunded failures, actual > quote, partial success, and idempotent settlement. Do not treat static tests or current broken Actions runner as runtime evidence.

## 5. Explicit non-actions

- No migration 063+ created or applied.
- No billing behavior wired into `pins.js`, `boards.js`, `analyze.js`, or regeneration route.
- No change to credit pack prices, tariffs, or balances.
- No authenticated GPTunnel call; no secret accessed.
- No production DB, deployment, DNS, payment, Pinterest, or PR merge action.

**Status:** AUD-072 / QUOTE_IGNORED_PARAMS_VALIDATION_HARDENED / TESTS_ADDED_RUNTIME_UNVERIFIED / BILLING_POLICY_AND_LEDGER_DESIGN_REQUIRED.
