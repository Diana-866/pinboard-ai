# AUD-368 — generation spend, reservations and recovery

**Date:** 2026-11-11  
**Status:** source audit and targeted correction committed

## Confirmed financial safeguards

- Image generation creates a per-user/idempotency-key reservation before billable image submissions. User-row locking serializes competing reservations and legacy balance debits; only unreserved balance is spendable.
- Reservation retries must use the same amount. Exact GPTunnel quotes are stored against immutable task model/aspect-ratio payloads, then the reservation is resized before image submission.
- Final settlement resizes to the authoritative provider price and markup. The completion RPC locks user → request → reservation, verifies claim fencing and reservation ceiling, and atomically inserts pins, debits credits, writes the ledger and completes the request.
- A terminal failure releases a reservation. An uncertain provider outcome keeps the reservation protected. A request with no persisted image task can release its unused image reservation while remaining non-replayable/unknown.
- Provider idempotency keys and durable task IDs prevent a recovery request from creating a replacement task. Recovery polls the saved task, and a saved provider result can be rehosted without resubmission.
- Completion journal trigger requires terminal task states, complete provider outcome/price/storage facts, and a one-to-one match between successful tasks and saved pins.
- Text-generation usage is separately recorded with a unique per-request key. Missing usage cost is represented as `cost_missing` / NULL, not silently converted to zero; cost reporting preserves unknown amounts as NULL.
- Reconciliation distinguishes provider failures that were refunded, not refunded, or remain unknown.

## Correction made

`imageTaskResult` previously accepted a successful image task with a zero provider price, while exact quote pricing and SQL pin settlement require a strictly positive price. That mismatch could record a provider success but make the normal settlement path reject the pin. The parser now rejects zero and negative successful-task prices before they enter the journal/settlement path. Added a regression test for positive, zero and negative prices.

## Operational caveats

- The code includes database integration scripts for reservations and concurrency, but they were not executed here. They require a disposable PostgreSQL database with the ordered migrations applied.
- This audit cannot establish which migrations are active in production Supabase. Confirm migrations 054, 065, 067, 069, 071, 074, 079 and 088 are applied before relying on these controls in production.
- Text-generation responses are intentionally allowed to continue if GPTunnel omits usage metadata; the ledger marks the cost as unknown. This preserves generated work but means actual provider spend cannot be fully reconciled until provider usage data is obtained.
- The 30-second provider HTTP timeout does not prove the provider rejected a task. The durable request state and provider idempotency key are therefore essential; an ambiguous create must remain fenced pending reconciliation.

## Regression coverage

Added a targeted parser test in `backend/test/gptunnel-pricing.test.js`. Existing focused tests cover polling a persisted provider task without creating a replacement, synchronous task journaling, price quote validation, and reservation/claim concurrency. Integration scripts are present but not executed.

## Verification limits

Only source inspection and GitHub file read-back performed. Node tests, lint, build, CI, live Supabase, GPTunnel requests, real generation, credit balances and deployment were not run. No production state or credentials were changed.
