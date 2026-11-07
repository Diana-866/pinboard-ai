# AUD-075 — Exact provider quotes in multi-pin generation

Date: 2026-11-07  
Branch: `feat/persisted-boards-api`  
Scope: implementation of exact image quote reservation and durable quote recovery.

## Implemented

1. `backend/index.js` now requests a GPTunnel quote for each non-failed task after the immutable generation plan is saved and before any image task is submitted.
2. Quote requests are performed in bounded batches of three to avoid serial 30-second timeouts for a batch of up to ten pins.
3. The route validates saved quote currency, model, aspect ratio, and finite positive price before reusing it.
4. Quote facts are persisted with a claim-fenced SQL RPC. A quote cannot be overwritten with conflicting price/model/currency/aspect data.
5. Migration 067 adds quote columns to `pin_generation_tasks` and includes them in `get_pin_generation_plan`, so a same-key recovery reuses the saved quote instead of silently replacing the reservation basis.
6. The route resizes the active credit reservation to the sum of per-image quoted retail credits before the first image submission.
7. After image tasks finish, the route resizes again to the exact final user-credit charge derived from actual GPTunnel task prices. If actual price drift requires more credits than are available, the journaled results remain recoverable; a same-key retry after balance replenishment can settle without creating images again.
8. The atomic-payment workflow now applies migrations 063–067 in order and runs a dedicated PostgreSQL integration script for quote persistence, immutable replay, claim fencing, and reservation resizing.
9. Backend provider-boundary tests cover that quote validation runs before image submission and that a quote failure prevents any image provider call.

## Files changed

- `backend/index.js`
- `backend/pins.js`
- `backend/test/pins-provider-boundary.test.js`
- `backend/test/pin-generation-provider-quotes.integration.sql` (new)
- `db/migrations/067_pin_generation_exact_provider_quotes.sql` (new)
- `.github/workflows/atomic-payment-integration.yml`

## Verification

- JavaScript syntax parsing succeeded for `backend/index.js`, `backend/pins.js`, `backend/test/pins-provider-boundary.test.js`, and `backend/generationPricing.js`.
- A mocked execution of `generatePins` confirmed the order `quote validation -> submission boundary -> image provider` and confirmed the returned image path.
- The existing `calculateQuotedGenerationPricing` helper was executed with a RUB quote; a 1.25 RUB quote at 1.5 markup correctly produced 2 user credits.
- GitHub Actions runs on the current PR HEAD still fail before exposing any job steps or logs (`steps=null`, `logs_url=null`). These failures do not establish that the new tests ran. Do not mark Node or PostgreSQL integration tests as passed.
- Vercel reports `build-rate-limit`; no preview build is confirmed.

## Remaining gaps / cautions

- Text-provider usage and RUB cost from the idea-generation call are still not persisted. This remains a separate accounting task; current user credit pricing still covers image tasks only.
- A provider quote is a pre-submission estimate, not a guarantee. The second reservation resize against actual task prices is retained for this reason.
- Migration 067 has not been applied to the production Supabase database.
- No live GPTunnel quote, image generation, payment, production deployment, or PR merge was performed.

**Status:** `EXACT_IMAGE_QUOTES_WIRED` / `QUOTE_JOURNAL_DURABLE` / `RESERVATION_RESIZED_BEFORE_SUBMISSION_AND_AT_SETTLEMENT` / `CI_UNVERIFIED` / `TEXT_PROVIDER_COST_PENDING`.
