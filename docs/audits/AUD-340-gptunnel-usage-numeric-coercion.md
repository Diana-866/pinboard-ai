# AUD-340 — GPTunnel usage numeric coercion hardening

**Date:** 2026-11-10  
**Branch:** `feat/persisted-boards-api`  
**Status:** SOURCE CHANGE COMMITTED — runtime tests not executed  
**Related:** AUD-337–AUD-339

## Finding

The shared `finiteUsageNumber()` helper previously called JavaScript `Number(value)` for every non-null input. JavaScript converts an empty string, whitespace-only string, and booleans to numeric zero. The `total_cost` path repeated the same coercion directly.

Consequently malformed provider metadata such as `usage.total_cost: ""` or `false` could be normalized as a real zero-RUB cost. This is materially different from the intended `NULL / cost_missing` accounting state.

## Change

- `backend/gptunnel.js`: accept finite numbers and non-empty numeric strings only; reject booleans, empty/whitespace strings, objects, and non-finite values as missing.
- Route `total_cost` through the same strict parser as token and component-cost fields.
- Preserve valid numeric strings for compatibility with providers that serialize numeric values as strings.
- Preserve a literal numeric zero as a valid reported value; this patch does not assume that zero is impossible.

## Regression coverage added

- malformed cost values (`""`, whitespace, booleans, object, nonnumeric string) must reject under strict mode and normalize to `null` when `requireUsage:false`;
- valid numeric-string cost remains accepted;
- actual numeric zero remains accepted.

## Scope and safety

No database schema, RPC, migration, pricing policy, tariff, credit reservation, payment, or deployment behavior changed. This patch does not select between AUD-339 policy A (fail closed when cost is missing) and policy B (continue with reconciliation). It only prevents malformed values from being silently recorded as zero.

## Validation

- GitHub source read-back confirmed the parser change and regression cases are present.
- Node tests, lint, typecheck, build, and live GPTunnel/DB checks were not executed in this GitHub-only session.
- No production database writes, provider requests, payments, or deployment occurred.
