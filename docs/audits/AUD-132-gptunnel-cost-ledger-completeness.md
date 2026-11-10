# AUD-132 — GPTunnel cost capture, quote settlement, and ledger completeness

**Branch:** `feat/persisted-boards-api`  
**Scope:** static review of the image quote/settlement paths, regeneration settlement, text usage adapter and migration 069. No provider API, database, CI, or production operation was executed.

## Executive result

The reviewed image paths have a meaningful quote-to-actual settlement safeguard. The backend reserves against a pre-submission quote and then resizes the reservation to the provider's terminal image price before committing user credits. This is present for both multi-pin generation and single-pin regeneration.

The remaining accounting weakness is the text-plan call and the absence of a unified provider-cost ledger. Text usage is stored separately and can explicitly be marked `cost_missing`; the generation path does not block image work solely because the text cost is missing. Also, the reviewed text request does not carry a provider idempotency key or persist a request identifier before submission, so a lost response can leave an actual provider charge that cannot be reconciled from the application journal alone.

## Verified safeguards

### 1. Multi-pin image tasks

- GPTunnel price is requested for the exact prompt, model and aspect ratio before task submission.
- The quote is persisted with currency/model/aspect ratio and checked against the immutable task.
- The reservation is resized to the sum of quoted user-credit prices before billable image tasks are submitted.
- After provider success, the terminal provider price is persisted in the task journal.
- Before final completion, the backend recalculates the user-credit charge from actual provider prices and resizes the reservation again.
- If actual price is higher and the user has insufficient available credits, the result remains journaled and the same idempotency key can retry settlement without generating another image.

### 2. Single-pin regeneration

- A new task is quoted and the quote metadata is persisted before submission.
- The reservation is created/resized against the quote.
- The provider task ID, terminal status and actual price are persisted.
- The reservation is resized again against the terminal provider price before the atomic pin update and user-credit debit.
- If the final top-up cannot be reserved, the already-created provider result is retained for same-key recovery.

These controls prevent the quote from being treated as the final provider invoice. They also keep provider RUB cost distinct from the application's user-credit amount.

## Findings and residual risks

### F1 — Text usage may be explicitly missing while image generation proceeds

Migration 069 supports `usage_status = 'cost_missing'` when the provider response contains no usable `total_cost`. The backend passes a null total cost in that case, records the usage row, and `generatePins` continues to parse the text plan and proceed to image quotes/tasks.

This is fail-visible in the ledger, not silently converted to zero, which is good. However, it means an image generation can complete while its text-planning provider expense is unknown. A finance report must treat `cost_missing` as an unresolved expense, never as zero.

**Recommended control:** make missing text cost a separately visible unresolved-cost state. Decide explicitly whether it blocks image submission or permits a capped platform-subsidized continuation. If continuation is allowed, add a hard daily/weekly exposure limit and alerting.

### F2 — Text provider response loss has no durable pre-submission provider identity

The text path marks the parent generation request as having crossed a billable boundary before calling GPTunnel. Once a response arrives, it stores provider request ID, model, token usage and RUB cost in migration 069. This correctly avoids blindly retrying a potentially billed text call.

But the request ID is only available in the response. In the reviewed request construction, no provider idempotency key or client-generated operation ID is sent and persisted before submission. If GPTunnel accepts and bills the text request but the HTTP response is lost, the app can mark the generation unknown but cannot query that exact text operation using a saved provider request ID.

**Recommended control:** check whether GPTunnel supports idempotency/client metadata or request-history lookup for text completions. If supported, persist a stable operation key before submission. If not, document this as an irreducible unknown-cost case and provide a provider-dashboard reconciliation procedure; do not auto-retry.

### F3 — Provider cost is split across separate records

Image costs live on generation task rows and regeneration request rows. Text cost lives in `pin_generation_text_usage`. Refund facts are stored on image outcome rows. There is no single provider-operation ledger in the reviewed migrations that unifies operation type, provider task/request ID, quote, gross actual cost, refund, net cost, and reconciliation evidence.

This is not proof that any one charge is duplicated or lost. It does make portfolio-level reporting and automated reconciliation harder, especially when a generation has one text call plus several image tasks.

**Recommended control:** introduce a read-only reporting view first, unioning text usage, generation image tasks and regeneration requests into one normalized cost view. Keep the source journals authoritative and avoid copying financial facts into a second writable ledger until reconciliation semantics are designed.

### F4 — Usage validation and accounting completeness need dedicated regression coverage

The migration enforces nonnegative token/cost values and idempotent replay for the text usage row. However, the inspected tests do not establish a complete lifecycle for:
- response with known RUB cost;
- response with missing cost;
- response received but usage journal write fails;
- ambiguous timeout after provider acceptance;
- exact replay versus conflicting provider request ID;
- cross-check of total text + image RUB cost against provider-side account statements.

These should be tested with synthetic provider fixtures and a disposable PostgreSQL database.

## Proposed next implementation slice

1. Add a read-only SQL view that normalizes text usage, generation image-task costs and regeneration image costs, preserving source IDs and refund/reconciliation state.
2. Add a report query that totals gross provider cost, known refunds, net known cost, and separately counts unresolved/missing-cost operations. Never coalesce unknown cost to zero.
3. Add unit tests for text usage persistence failure and missing-cost continuation behavior.
4. Verify GPTunnel's current text-completion idempotency and request-history capabilities from its official contract before changing the request adapter.
5. Only after those checks, decide whether a new durable text-operation journal is possible without inventing unsupported provider semantics.

## Verification limits

- Source review only; no tests were executed.
- No current GPTunnel contract/API call or provider account statement was inspected in this pass.
- No PostgreSQL view or migration was created/applied.
- No customer balance, payment, or production service was accessed or changed.

**Status:** IMAGE_QUOTE_TO_ACTUAL_SETTLEMENT_SOURCE_CONFIRMED / TEXT_USAGE_MISSING_COST_EXPLICIT / TEXT_AMBIGUOUS_RESPONSE_RECOVERY_GAP / UNIFIED_COST_REPORTING_GAP / RUNTIME_UNVERIFIED.


## Reporting groundwork added — migration 079

Added `db/migrations/079_gptunnel_provider_cost_reporting_view.sql`, which defines the read-only `public.gptunnel_provider_cost_ledger` view over the three existing source journals:

- multi-pin generation image tasks;
- single-pin regeneration requests;
- text-plan usage rows.

The normalized output includes source row ID, request key, provider task/request ID, model, quoted RUB cost, gross RUB cost, refund fact, net known RUB cost, accounting status, reconciliation timestamp, and creation timestamp.

Important semantics:
- A confirmed refunded failed image task has net known cost 0 while retaining any gross price.
- A confirmed unrefunded failed image task retains its gross price as net known provider expense.
- A failed task with unknown refund state has NULL net known cost and `refund_unknown`.
- Missing text cost has NULL net known cost and `cost_missing`.
- Pending/legacy outcomes remain unresolved; NULL is never converted to zero.
- SELECT is granted only to `service_role`; no source journal is modified.

Suggested aggregate query after applying the migration to a disposable database:

```sql
select
  operation_type,
  accounting_status,
  count(*) as operation_count,
  sum(gross_cost_rub) as gross_known_rub,
  sum(net_known_cost_rub) as net_known_rub,
  count(*) filter (where net_known_cost_rub is null) as unresolved_count
from public.gptunnel_provider_cost_ledger
group by operation_type, accounting_status
order by operation_type, accounting_status;
```

The view is reporting groundwork, not a verified financial reconciliation: it must be compared with GPTunnel account statements, and its SQL has not yet been executed in PostgreSQL.
