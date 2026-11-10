# AUD-331 — Design for durable accounting of legacy GPTunnel text operations

**Date:** 2026-11-10  
**Branch:** `feat/persisted-boards-api`  
**Status:** DESIGN REVIEW — implementation deliberately not started  
**Scope:** safe migration path for website analysis and board-idea generation to durable provider usage accounting and retry protection.

## Why this design exists

AUD-329/AUD-330 identified two legacy text operations:
- `POST /projects/:id/analyze`
- `POST /projects/:id/boards/generate`

Both call `generateText()`, which discards the provider request ID and usage/cost. The second route is tariff-gated; the first is not. Neither has durable request idempotency.

The repository already has:
- `pin_generation_text_usage` created by migration 069;
- `record_pin_generation_text_usage(...)`, which is coupled to `pin_generation_requests` and its claim token;
- normalized provider cost reporting view `gptunnel_provider_cost_ledger` created by migration 079;
- established claim-token / fencing patterns in generation, publication, payment and storage workflows.

Therefore, creating a parallel generic text-usage table without a clear source-of-truth contract would fragment cost reporting. Conversely, inserting analysis/board operations into the existing pin-generation journal would falsify their operation identity and couple unrelated business workflows.

## Required design

### 1. Keep the existing provider usage table as the normalized usage fact store

Extend the existing `pin_generation_text_usage` semantics with an explicit `operation_type` discriminator and an operation-specific identifier, rather than inventing a second cost ledger:
- `pin_generation_plan` — current pin-generation text usage;
- `project_analysis` — website analysis;
- `board_ideas` — board suggestion generation.

Preserve existing rows with a safe default for historical pin-generation usage. Keep provider, request ID, model, token counts, RUB costs, cost status and timestamps. The unique key must become operation-scoped; retain the existing uniqueness behavior for pin-generation rows during rollout.

Migration must be additive, reversible where practical, and safe with current production data. It must not rewrite balances or generation journals.

### 2. Add a separate durable operation state journal

A usage fact is only written after a provider response. It cannot protect a request that times out before its response arrives. Add a separate `gptunnel_text_operations` journal with:
- UUID operation ID;
- user ID and operation type;
- resource ID (project);
- client idempotency key and request fingerprint;
- state: `claimed`, `submitting`, `succeeded`, `unknown`, `failed`;
- fenced claim token / generation number;
- provider request ID/model when available;
- timestamps and bounded failure classification.

Unique constraint: `(user_id, operation_type, idempotency_key)`. Fingerprint mismatch must reject key reuse. State transitions must be performed only through SECURITY DEFINER RPCs with explicit grants to service_role and fixed search_path. RLS enabled; no client roles.

### 3. Fail closed on ambiguous provider outcomes

No provider-side text idempotency or lookup-by-client-key contract was verified. Therefore:
- Before the outbound call, atomically transition `claimed → submitting`.
- If the process dies or the HTTP request times out after submission may have started, retain `unknown` (or a stale `submitting` state treated as unknown); do not automatically call GPTunnel again.
- Same-key retry returns the saved completed result, a processing response, or an explicit unknown-outcome response. It must never silently issue a second billable provider request.
- A new key means a new intentional operation, not a retry of the uncertain operation.
- Only a confirmed provider response may be recorded as success/failure with provider request ID and usage. Provider error semantics must be classified conservatively; transport errors are ambiguous.

This deliberately favors no duplicate provider spend over automatic recovery until GPTunnel documents a safe idempotency or request-history mechanism.

### 4. Preserve exact outputs for safe response replay

The journal should store the validated normalized result needed for idempotent HTTP replay:
- project analysis: niche + summary;
- board ideas: bounded JSON array of title + description.

Avoid storing full prompts, website page content, secrets, or unbounded raw provider responses. Use bounded JSON schema validation before persistence.

For board generation, couple operation completion and board insertion in one database RPC/transaction, or use a durable two-phase state that can safely resume insertion without re-calling GPTunnel. Prefer atomic completion+insert. Enforce project ownership inside the RPC and unique operation linkage on created boards.

For analysis, couple project update and operation completion atomically, with project owner predicate and compare/fencing token.

### 5. Usage accounting and reporting

Record provider usage for both operations in `pin_generation_text_usage` using the operation ID/type. Preserve `cost_missing` as NULL; never coerce unknown cost to zero. Update migration 079 view to include operation types while preserving its existing columns and semantics. Ensure provider request IDs are not assumed globally unique unless GPTunnel guarantees that; source identity remains the local operation ID.

### 6. Product charging policy remains unchanged

This engineering work must not silently debit user credits or change tariff entitlements:
- `project_analysis`: retain current availability until product policy is explicitly decided; separately expose its provider cost.
- `board_ideas`: retain existing tariff gate.
- No new credit debit, reservation, refund, or package change in this stage.

A future product decision may define included monthly allowances or credit prices. That is separate from provider-cost accounting and needs explicit approval.

## API contract proposal

Both routes should require `Idempotency-Key` (16–128 safe characters), hash a canonical validated input fingerprint, and use the durable journal:
- new request: claim then execute once;
- same key + same fingerprint + completed: replay result;
- same key + same fingerprint + active claim: HTTP 409 with Retry-After;
- same key + same fingerprint + unknown: HTTP 409 `provider_outcome_unknown`, no provider call;
- same key + different fingerprint: HTTP 409 `idempotency_key_reused`;
- missing/invalid key: HTTP 422.

For backward compatibility, rollout should be staged: deploy DB migration and backend support first, update frontend clients to send keys, then enforce required keys only after client support is confirmed. Until then, server may derive a per-request key only if the route is explicitly documented as non-replayable; it must not pretend that such a key protects client retries.

## Security / correctness invariants

1. One logical operation key can submit to GPTunnel at most once unless provider-side idempotency is verified.
2. A lost response cannot cause a blind second submission.
3. A stale worker cannot overwrite a newer operation claim.
4. Operation user and project owner must match in every state transition and completion RPC.
5. Board insertion and successful operation completion are atomic.
6. Missing cost remains visible as unknown.
7. Provider usage fact and operation result are written transactionally where possible.
8. No customer credit balance changes in this implementation.
9. No raw prompt, fetched webpage content, API key, or provider authorization header is persisted or logged.

## Implementation sequence

1. Inspect all current frontend callers and request retry behavior for these routes.
2. Add migration for operation journal and operation-scoped usage rows, including grants, RLS, constraints and RPCs.
3. Add backend operation coordinator and usage-aware provider call path.
4. Refactor analysis and board generation handlers to use the coordinator.
5. Add atomic completion RPCs for project update and board insertion.
6. Add tests for same-key replay, fingerprint conflict, concurrent claim, stale claim fencing, provider timeout ambiguity, missing usage, journal-write failure, ownership mismatch, and transactional result persistence.
7. Update normalized reporting view and HANDOFF.
8. Run Node tests and disposable-Postgres integration suite in CI; do not apply migrations to production without explicit user authorization.

## Deliberate non-goals

- No user credit debit or tariff changes.
- No automatic retry after ambiguous text-provider submission.
- No production SQL execution or provider calls.
- No claims about GPTunnel idempotency until verified against current official provider documentation or a controlled test.

**Decision:** reuse the existing normalized text-usage fact store, add a distinct operation state journal, and fail closed on uncertain provider submissions. This is safer than a superficial retrofit that merely adds a request key in Express while still risking duplicate paid provider calls.
