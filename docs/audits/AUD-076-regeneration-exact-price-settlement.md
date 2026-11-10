# AUD-076 — Single-pin regeneration quote and settlement mismatch

Date: 2026-11-07  
Branch: `feat/persisted-boards-api`  
Scope: static review of `POST /pins/:id/regenerate` and migrations 053/063/066.

## Finding R1 — Regeneration reserves and charges a model-list estimate, not the provider quote

The route calculates `cost = ceil(MODEL_PRICES[model] * MARKUP)`, starts the regeneration journal with that amount, and reserves it before image submission. Unlike the multi-pin route now wired to `quoteImageTask`, regeneration does not request a GPTunnel media-price quote for the exact prompt/model/aspect-ratio payload.

The provider's actual price is persisted by `record_pin_regeneration_provider_outcome`, and later by `update_pin_regeneration_request`, but migration 066's `complete_pin_regeneration_request` still debits `v_request.amount` and requires the reservation amount to equal that value. It does not reconcile the charge to the recorded `provider_price`.

This creates a financial reconciliation gap:
- if actual provider price exceeds the list estimate, the user-credit debit may understate the intended marked-up charge;
- if actual price is lower, the route may over-reserve and overcharge relative to the exact-price policy;
- a price drift cannot currently resize the regeneration reservation/request amount before settlement.

This is a static code-path finding, not evidence of a production incident.

## Relevant code

- `backend/index.js`: `POST /pins/:id/regenerate`, especially the estimate at route start, reservation before submission, provider outcome recording, and completion RPC.
- `db/migrations/053_pin_regeneration_journal.sql`: request amount and provider-price journal fields.
- `db/migrations/063_pin_regeneration_provider_outcomes.sql`: terminal provider outcome persistence.
- `db/migrations/066_pin_regeneration_credit_reservations.sql`: reservation amount equality and settlement based on `pin_regeneration_requests.amount`.

## Recommended safe implementation

1. Keep the request fingerprint stable for idempotency; do not silently change its original identity when a quote is added.
2. After claim acquisition and before reservation/provider submission, request and validate the exact quote for prompt, model and aspect ratio.
3. Persist the quote under the claim token and update the request's reserved retail-credit amount atomically.
4. Create/reuse the reservation at that quote-based amount before the first image submission.
5. After terminal provider outcome, calculate the final marked-up charge from the actual provider price and atomically resize both request amount and reservation before completion.
6. If actual-price top-up is unaffordable, retain the terminal provider result and reservation for same-key recovery after the user tops up; never submit a second image task.
7. Preserve legacy recovery for rows that already have a provider task ID but predate quote persistence.

## Status

`REGENERATION_EXACT_QUOTE_NOT_WIRED` / `PROVIDER_PRICE_RECORDED_BUT_NOT_USED_FOR_CHARGE` / `STATIC_REVIEW_ONLY` / `NO_PRODUCTION_ACTIONS`.

No code, migration, provider call, payment, deployment, or database mutation was performed for this finding.
