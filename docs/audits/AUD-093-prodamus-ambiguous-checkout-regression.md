# AUD-093 — Regression coverage for ambiguous checkout creation

Date: 2026-11-07

## Scope

AUD-091 changed subscription and credit-purchase creation so that a timeout or lost response from Prodamus does not incorrectly mark the local order denied. This audit adds direct regression coverage for both flows.

## Test

Added `backend/test/prodamus-ambiguous-checkout.test.js`.

The test replaces the Prodamus link-creation call with simulated socket-reset and gateway-timeout failures, while using a disposable in-memory Supabase adapter. It verifies that:

- the original request error is propagated to the caller;
- a subscription row has already been created and remains `pending`;
- a credit purchase row has already been created and remains `pending`;
- each row retains its provider order ID;
- no credit fulfillment marker is written.

The test uses Node's built-in test runner and is included automatically by the existing `node --test` command in `backend/package.json`; the existing Prodamus webhook workflow runs `npm test`.

## Verification

- Reviewed the test's mocked database methods against the exact query chains used by both creation functions.
- Confirmed the workflow runs all backend tests through `npm test`.
- The test was not executed in this environment; CI status must be checked after GitHub schedules the workflow.
- No live Prodamus requests, Supabase writes, production deployment, or PR merge were performed.
