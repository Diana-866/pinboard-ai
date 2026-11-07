# AUD-074 — Multi-pin generation provider-cost reconciliation audit

Date: 2026-11-07  
Branch: `feat/persisted-boards-api`  
Scope: static review of `backend/index.js`, `backend/pins.js`, `backend/gptunnel.js`, and migrations 054, 064, and 065. No runtime tests, database migration, authenticated provider request, deployment, or production change.

## 1. Confirmed findings

### F1 — Exact image quote path exists but is not wired into multi-pin generation

- `backend/gptunnel.js` exports `quoteImageTask(prompt, model, aspectRatio)`.
- It calls GPTunnel's media-price endpoint and rejects a quote if the returned model, currency, or aspect ratio does not match the requested payload, or if parameters were ignored.
- Migration 065 adds `resize_pin_generation_credit_reservation(...)`, which can safely resize an active reservation while locking user, request, and reservation rows.
- Static search of the current branch found no call to `quoteImageTask` and no call to `resize_pin_generation_credit_reservation`.
- The multi-pin route instead reserves `calculateGenerationReservation(MODEL_PRICES[model], count, MARKUP)` before the text plan is generated. Per-task user-credit charges are later derived from actual GPTunnel task prices and markup.
- Therefore the current reservation ceiling is based on a local model-price estimate, while final settlement uses actual task prices. If actual marked-up prices exceed the estimate, `complete_pin_generation_request` rejects the charge because it exceeds the reservation. Since provider work may already have succeeded, the request can remain fenced as unknown with billable work completed but no saved pins/user debit. This is a conditional failure mode, not evidence that it has occurred in production.

### F2 — Text-generation provider cost is not captured by the current multi-pin flow

- `backend/pins.js` calls `generateText(prompt)` to create the pin plan.
- `generateText` calls `generateTextWithUsage(..., requireUsage: false)` and returns only the content string.
- The text response's usage, model, request ID, and `usage.total_cost` are discarded by this path.
- The route marks the provider boundary before the call, which correctly fences an ambiguous outcome, but no text-provider price is persisted into the generation journal or a provider-cost ledger.
- This is an accounting/visibility gap. It does not mean the user is incorrectly charged: user credits are still calculated from image-task prices and markup.

### F3 — Image task outcomes and user-credit settlement remain separate

- Migration 064 stores per-image terminal provider status, gross provider price, refund metadata, structured error fields, and reconciliation timestamp.
- Migration 054 reserves user credits and settles the reservation with the atomic pin insert/debit RPC.
- This separation is appropriate: GPTunnel RUB cost and application credits are different accounting units and must not be combined as if they were the same currency.

## 2. Recommended implementation sequence

1. After the text plan is persisted, quote every prepared image task using the exact prompt, model, and aspect ratio that will be submitted.
2. Reject the plan if any quote is invalid, mismatched, or reports ignored parameters. Do not submit image tasks until every required quote is validated.
3. Compute the maximum user-credit reservation from the product's explicit markup policy and the validated quotes; resize the existing reservation through migration 065 before the first image submission.
4. Keep the quote amount/currency/model/parameters and payload fingerprint in the task journal. Compare the final provider task price with its quote and record any drift explicitly.
5. Capture text-generation usage and cost separately, including provider model and request ID where returned. Define whether this is platform overhead or included in the product's credit price; do not silently mix RUB with user credits.
6. Add disposable PostgreSQL and mocked-adapter tests for quote mismatch, ignored parameters, price increase/decrease, resize failure before image submission, actual-price drift, and text usage missing/available.
7. Only after tests run successfully in CI and the required migrations are applied to a disposable database should this be considered verified.

## 3. Explicit non-actions and status

- No code or schema changed in this audit.
- No migration was applied.
- No real GPTunnel quote or task was requested.
- No user balance, product price, markup, or credit pack was changed.
- No production service was changed.
- Full Node/PostgreSQL integration tests remain unverified because the current branch's recent CI runner attempts have not executed job steps.

**Status:** `MULTI_PIN_EXACT_QUOTE_NOT_WIRED` / `TEXT_PROVIDER_COST_NOT_RECORDED` / `STATIC_REVIEW_ONLY` / `RUNTIME_UNVERIFIED`.
