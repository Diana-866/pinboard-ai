# AUD-073 — Single-pin regeneration billing and provider outcome audit

Date: 2026-11-07  
Branch: `feat/persisted-boards-api`  
Scope: static review of migration 053, migration 013, regeneration route, GPTunnel adapter and SQL integration test; official GPTunnel task lifecycle docs reviewed. No code/runtime test, database migration, provider API call, deployment, or production change.

## 1. Existing regeneration lifecycle

The endpoint `POST /pins/:id/regenerate`:
1. Validates a user idempotency key and loads the owned pin.
2. Computes a fixed user-credit amount from local `MODEL_PRICES` and `MARKUP`.
3. Calls `begin_pin_regeneration_request`, which persists a request fingerprint, generated provider idempotency key and claim token.
4. Submits the GPTunnel image task using the provider idempotency key, and records provider task ID before polling.
5. On recovery, polls a recorded task ID or resubmits with the same provider idempotency key.
6. Persists provider result URL and provider price; rehosts the image.
7. Calls `complete_pin_regeneration_request`, which atomically updates the pin and debits the precomputed user-credit amount.
8. On errors, marks provider-confirmed failures `failed`, other outcomes `unknown`.

This has useful protections: user ownership check, request fingerprint, provider idempotency key, claim-token fencing, task ID persistence, retry/poll path, and atomic user credit/pin update.

## 2. Gaps and risks found

### R1 — Provider price is recorded but not reconciled
- `pin_regeneration_requests.provider_price` is written after a successful provider task.
- `complete_pin_regeneration_request` debits `v_req.amount`, not `provider_price`.
- `amount` is computed from the local `MODEL_PRICES` table, not an exact GPTunnel quote.
- This can be a valid product policy for user credits, but it is not an accurate provider-cost ledger. There is no recorded margin, subsidy, or price-drift incident when actual cost exceeds the configured assumption.

### R2 — Failed-task refund outcome is discarded
- GPTunnel's task API exposes `refunded: boolean` for failed tasks.
- `generateImage()` and `waitForImageTask()` throw an error for a failed task but do not preserve `refunded` or the provider's final `price` on the error object.
- The route's catch block stores only an error code and status. The journal therefore cannot distinguish a refunded provider failure from a non-refunded provider failure.
- The user is not charged because the completion RPC is not called, but a non-refunded provider expense may be silently absorbed by the platform and omitted from financial reporting.

### R3 — No explicit provider outcome fields in the journal
Migration 053 has `provider_price`, but no `provider_refunded`, provider final status, provider error code/title, or reconciliation timestamp. The stored `error_code` is an internal short label, not the provider's structured outcome.

### R4 — Fixed price assumption can drift
The local amount uses `MODEL_PRICES`; the endpoint does not call `quoteImageTask()`. A changed provider price, discount, alias model, or parameter-based rate can create a margin loss or inconsistent unit economics.

### R5 — Credit completion and provider accounting are separate concepts
The atomic completion function correctly treats the amount as a user-credit debit and writes a credit transaction. It should not be repurposed to store provider spend as though both currencies were interchangeable. User credits are an application pricing unit; GPTunnel price is RUB provider cost. The system needs separate columns/ledger dimensions and an explicit markup policy.

## 3. GPTunnel contract confirmed

Official docs reviewed:
- Task creation accepts `idempotency_key`; replay with the same key and identical body returns the existing task; a different body with the same key returns 409. This makes the existing stable provider key a meaningful recovery mechanism.
- With `wait: true`, the request may still return `queued` or `running` after its roughly 30-second wait window. Poll `GET /api/v2/media/tasks/:id` or use a webhook.
- Task retrieval returns terminal `done` or `failed`; task data includes `price`, and failed tasks include `refunded`.
- The media price endpoint accepts the same model/prompt/params/inputs payload before task submission and returns the RUB price; the quote and task payload must match.

References:
- https://docs.gptunnel.ru/creative-lab/create-task/
- https://docs.gptunnel.ru/creative-lab/get-task/
- https://docs.gptunnel.ru/creative-lab/price/

## 4. Safe follow-up implementation plan

1. Extend the provider-operation accounting model independently of the user-credit transaction:
   - provider name, provider task ID, provider idempotency key;
   - requested model and served model/header where available;
   - exact payload fingerprint and quote amount/currency;
   - final provider status, actual price, `refunded`, structured provider error code/title;
   - reconciliation state and timestamps.
2. Preserve provider failure metadata in the adapter error:
   - `providerStatus`, `providerTaskId`, `providerPrice`, `providerRefunded`, provider error code/title.
   - Validate booleans strictly; unknown/missing refund status remains unknown, never infer `true`.
3. Add a claim-fenced SQL RPC to persist terminal provider outcome without completing/debiting the user's pin. Replays with the same provider task ID and identical outcome must be idempotent; conflicting terminal facts must fail closed.
4. Use the exact quote before a new provider submission, with the same prompt/model/params as task creation. Keep user-credit amount separate and derived from the approved product price policy. If the quote cannot be trusted, block submission or explicitly account the operation as platform-subsidized under a strict budget.
5. Reconcile successful and failed outcomes:
   - done: record actual price and task ID before image rehosting; only then complete the pin and debit user credits in one SQL transaction.
   - failed + refunded=true: record zero net provider cost (retain gross task price if returned).
   - failed + refunded=false: record provider spend as platform loss; do not charge the user unless the published product policy explicitly says otherwise.
   - missing/ambiguous refund metadata: mark reconciliation pending and do not silently mark it free.
6. Ensure timeout after provider acceptance recovers by provider task ID or the exact same idempotency key and payload; never mint a new provider key for the same logical regeneration.
7. Extend disposable PostgreSQL integration tests for refunded/unrefunded failures, missing refund field, conflicting replay, stale claim, provider price drift, duplicate completion and concurrent retries.
8. Review the main multi-pin generator and regeneration together against one shared provider-operation ledger before claiming provider costs are fully accounted.

## 5. Explicit non-actions

- No migration 063+ created or applied.
- No user-credit formula, tariff, credit pack or public price changed.
- No changes to route, adapter, database schema, user balances or production services.
- No authenticated GPTunnel request.
- No runtime/SQL integration test executed; GitHub Actions runner blocker remains.

**Status:** AUD-073 / REGENERATION_PROVIDER_COST_GAP_CONFIRMED / REFUND_METADATA_NOT_PERSISTED / DESIGN_ONLY / RUNTIME_UNVERIFIED.


### AUD-073 follow-up code groundwork
- `backend/gptunnel.js` now exports `providerTaskError(task)`; both immediate failed task responses and polled failed task responses preserve provider task ID, finite nonnegative gross price, strict boolean `refunded` (otherwise null), provider numeric error code and bounded error title on the thrown error.
- Added three tests for refunded=false + price + structured provider error, missing refund metadata remaining null, and invalid price being treated as unknown. Test definitions only; not executed.
- Important: `backend/index.js` catch still does not persist these new fields into migration 053's journal. This is intentionally only adapter groundwork; no claim that financial reconciliation is complete.


## AUD-073 implementation follow-up — migration 063
- Added `db/migrations/063_pin_regeneration_provider_outcomes.sql`: nullable provider terminal status, strict refund boolean, provider error code/title and reconciliation timestamp; new versioned RPC `record_pin_regeneration_provider_outcome` is claim-token fenced and idempotent for an identical replay. Conflicting replay/task ID mismatch/stale claim fail closed.
- Failed outcomes with `refunded=false` retain gross provider price and are marked reconciled; missing refund metadata remains `NULL` and `provider_reconciled_at=NULL`. This does not charge the user or modify user credits.
- Wired `POST /pins/:id/regenerate` to persist successful provider outcome before rehosting, including recovered tasks and legacy rows with a provider result URL. Failed-task metadata is persisted before the request transitions to `failed`; if that write fails, request remains `unknown` to prevent a fresh billable submission. Recovered failed tasks now use the same `providerTaskError` adapter.
- Added `backend/test/pin-regeneration-provider-outcome.sh` with PostgreSQL cases for non-refunded failure, missing refund, success, identical replay, conflicting replay and stale claim.
- Static review only. The SQL migration has NOT been applied; the integration script, Node tests, PostgreSQL, backend suite and GitHub Actions have NOT been executed. The new columns are not visible to the running backend until migration 063 is applied, so this feature must not be deployed before the migration is applied and tested in a disposable database.
- Provider RUB price remains separate from user-credit debit. Exact quote-before-submit and the shared multi-pin provider-operation ledger remain open; this follow-up closes only the single-pin terminal-outcome/refund metadata gap.
