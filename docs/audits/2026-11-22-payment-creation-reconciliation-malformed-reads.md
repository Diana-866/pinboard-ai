# AUD-413 — payment-creation reconciliation malformed reads

Date: 2026-11-22  
Base: `b28a6db7c3cf55dbba748ccffc6f11d52cd63edb`

## Root cause

The administrator's read-only payment-creation inventory in `backend/adminPaymentCreationRequests.js` used three unchecked `data || []` fallbacks:

- payment creation request rows (`unknown` / `creating`);
- matching subscription rows;
- matching credit purchase rows.

A successful but malformed PostgREST response could therefore appear as an empty queue, or as a payment request with no local record. That can mislead financial reconciliation operators about an uncertain provider checkout.

## Fix

- Use shared `readArrayQueryResult` for all three query results.
- Keep database errors propagated through existing error handling.
- Malformed successful envelopes now fail with HTTP 502; no invented empty queue/match.
- Added regression iterating malformed `null` data for each of the three query stages.
- Inventory 1447 → 1448; admin payment creation request tests 10 → 11.

## Commits and blobs

- Source commit: `866a82064770f545c2444cc510cf513c0a6f5c5e`
- Regression commit: `188a2e95daf9bfd6369f2f1b6671abae6b2c221b`
- Inventory commit: `82e84cfed96c1b685ec18614489a5428957ea445`
- Source blob: `fc5b15c820b672ebf34f7e7bbdef4438abc32f04`
- Test blob: `a8797af161bfa6350f3f33de922c4f0464121baa`
- Inventory blob: `a9686d81cd4c7ec8277b024e668459a66b0b9657`

## Verification

- Re-fetch and static source/test/inventory consistency check planned at closeout.
- Runtime NOT RUN: Actions runner issue remains and local Node execution is not available through the GitHub connector. No PASS claimed.

## Safety

No production DB, Prodamus, provider calls, live payments, or deployment touched.

## Next

Continue audit of adjacent admin payment/reconciliation read paths; owner/local runtime acceptance remains tracked in UA-081/082.
