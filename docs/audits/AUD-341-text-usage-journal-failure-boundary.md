# AUD-341 — Text-usage journal failure provider-boundary regression

**Date:** 2026-11-10  
**Branch:** `feat/persisted-boards-api`  
**Status:** REGRESSION TEST COMMITTED — runtime tests not executed  
**Related:** AUD-339, AUD-340

## Finding

The pin-generation flow awaits `onTextProviderUsage()` immediately after the GPTunnel text response and before parsing the plan. Quote validation and image submission happen later. The route's usage callback throws if `record_pin_generation_text_usage` fails.

This ordering is a critical spend-safety boundary: if the text usage record cannot be persisted, the route must not proceed into image quoting or image task creation.

## Change

Added a regression test to `backend/test/pins-provider-boundary.test.js`:
- provider returns a valid pin plan;
- the usage-journal callback throws;
- quote validation callback must not run;
- image provider submission must not run.

This locks in the existing safe ordering without changing runtime behavior or choosing AUD-339's missing-cost policy.

## Related source observations

- Migration 069 records `cost_missing` with `total_cost_rub=NULL`; its check constraint distinguishes missing cost from recorded cost.
- Migration 079 explicitly documents that NULL net cost means unresolved/unknown, not zero.
- The adapter's documented GPTunnel cost contract and ledger currently assume RUB; the route only passes a total cost as RUB when the adapter marks it RUB.
- Missing cost itself is still allowed by the pin-plan path (`requireUsage:false`) and continues to image quote/submission under current policy. This remains the unresolved AUD-339 decision.

## Validation

- Regression test content was read back from GitHub after commit.
- Tests, lint, typecheck, build, CI, and live database/provider behavior were not executed.
- No live data, payment, or deployment changed.
