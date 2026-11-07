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

## Implemented on 2026-11-07

- `backend/index.js` now requests a validated GPTunnel quote after claim acquisition and before reservation/provider submission.
- Existing saved quotes are reused on same-key recovery; the route does not silently obtain a different quote for an already reserved request.
- Migration `068_exact_quote_single_pin_regeneration.sql` persists quote price/currency/model/aspect ratio and provides claim-fenced RPCs to update the request amount and active reservation.
- The reservation is created using the quote-based retail credit amount.
- After the provider reports a terminal result, the route resizes both request amount and reservation to `ceil(actual_provider_price * MARKUP)` before atomic completion.
- If the actual-price top-up is unaffordable, the terminal task/result remains journaled and the reservation remains active. A same-key retry can settle after the user replenishes credits without creating a second provider task.
- Existing tasks with a durable provider task ID skip new quote/submission and remain recoverable under the legacy path.
- Reservation failures before provider submission now leave the request resumable (`unknown`) instead of permanently marking it failed.

## Verification

- JavaScript syntax parsing succeeded for `backend/index.js`.
- Added `backend/test/pin-regeneration-exact-quote.integration.sql` covering quote persistence, reservation sizing, actual-price resizing, conflicting quote replay and stale-claim rejection.
- Updated `.github/workflows/atomic-payment-integration.yml` to apply migration 068 and run the new PostgreSQL integration script.
- PostgreSQL integration and full CI remain unverified until a GitHub Actions job completes successfully.
- No live GPTunnel call, production migration, payment, deployment or PR merge was performed.

**Status:** `EXACT_REGENERATION_QUOTE_WIRED` / `ACTUAL_PROVIDER_PRICE_USED_FOR_SETTLEMENT` / `RECOVERY_PRESERVED` / `CI_UNVERIFIED` / `NO_PRODUCTION_ACTIONS`.

