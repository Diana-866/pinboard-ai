# AUD-399 — Cross-domain lock-order map for account deletion

**Date:** 2026-11-11  
**Status:** source audit and remediation design only. No code, SQL, test or production change.

## Executive summary

The proposed deletion transaction uses the owner row as the lifecycle serialization point. The current application does not yet share one lock order across payment fulfillment, Pinterest OAuth, Pinterest publication and GPTunnel generation. Three concrete inversions are confirmed in canonical source:

1. Prodamus subscription fulfillment locks `subscriptions` before `users`; credit fulfillment locks `credit_purchases` before `users`.
2. Pinterest OAuth commit locks `pinterest_oauth_connection_state` before `users`.
3. GPTunnel generation completion locks `pin_generation_requests` before it calls the credit/pin persistence function that updates `users`.

These paths can deadlock against a deletion transaction that locks `users` first and then reaches the corresponding domain row. The correct remediation is not to weaken the deletion lock order. Refactor domain transactions to acquire the user row first, while preserving idempotency and remote-outcome evidence.

## Source-grounded lock map

| Domain path | Current lock/write order | Finding | Required target |
|---|---|---|---|
| Prodamus subscription | subscription row `FOR UPDATE` → user row `FOR UPDATE` → subscription/user writes | Confirmed inversion | user → subscription → payment-creation request / journal |
| Prodamus credit purchase | credit_purchase row `FOR UPDATE` → user balance update → ledger/purchase writes | Confirmed inversion; UPDATE implicitly locks user | user → credit_purchase → ledger/purchase |
| Prodamus checkout creation | payment_creation_requests idempotency row is locked; backend separately reads user, inserts subscription and calls provider | No atomic user lifecycle gate across checkout creation; provider call is outside SQL transaction | user gate + durable intent transaction; no DB lock during provider HTTP |
| Prodamus checkout settlement | payment_creation_requests row `FOR UPDATE` → reads subscription/credit purchase | Potential inversion if combined with user-first webhook fulfillment / deletion | user → payment creation request → local payment row, or split immutable provider receipt from entitlement |
| Pinterest OAuth commit | OAuth state row `FOR UPDATE` → user row `FOR UPDATE` → Pinterest account upsert | Confirmed inversion | user → OAuth state → Pinterest account |
| Pinterest OAuth begin | Upsert/lock OAuth state; no user lifecycle lock in RPC | Can begin a new attempt after lifecycle fence unless caller's earlier read is stale | user lock + active lifecycle check → OAuth state |
| Pinterest refresh | Refresh lease RPC and account token commit are account-scoped; external refresh occurs outside transaction | Account lease is useful; add owner lifecycle gate before lease and at commit, without losing rotated-token evidence | user → Pinterest account / lease; provider call outside locks; owner-gated commit |
| Pinterest publish reservation | Account `FOR UPDATE` → publication attempt / schedule | Account-scoped ordering already established; owner lifecycle row is not first | user → Pinterest account → schedule → attempt |
| Pinterest publish completion | Account → schedule → attempt; late success reconciles known remote publication | Preserve this order after adding user first; completion must still record remote success for non-active user | user → account → schedule → attempt; receipt-only reconciliation permitted |
| Pinterest scheduler claim | Candidate schedules claimed without first locking/checking owner lifecycle | New work can be claimed for deletion-pending account | owner lifecycle gate in claim RPC; skip/release claims safely |
| GPTunnel generation begin/reservation | Generation request and credit reservation paths; user balance/active reservation accounting | Needs owner-first serialization before new spend/provider work | user → generation request → reservation/ledger |
| GPTunnel generation completion | Generation request `FOR UPDATE` → nested `save_generated_pins_and_charge` updates user and persists pins | Confirmed inversion | user → generation request → reservation/ledger → pins |
| GPTunnel provider poll/recovery | Provider calls outside DB transaction; task/request claim fencing protects local ownership | Do not hold user lock over HTTP; late provider result must be journaled independently | short user-first DB fence before dispatch; remote call; receipt/reconciliation transaction |

## Exact evidence

### Prodamus

- `db/migrations/011_atomic_subscription_activation.sql`: `activate_paid_subscription` locks `subscriptions` at lines 21–24, then `users` at lines 28–31.
- `db/migrations/010_atomic_credit_ledger.sql`: `credit_paid_purchase` locks `credit_purchases` at lines 83–86, then updates `users` at lines 107–110.
- `backend/billing.js`: webhook validates the signed callback and order/amount, then calls `activate_paid_subscription`; payment activation and checkout settlement are separate RPC calls.
- `db/migrations/116_idempotent_prodamus_checkout_creation.sql`: checkout begin locks `payment_creation_requests`; complete/unknown/fail RPCs also lock/update that row.
- `db/migrations/118_settle_payment_creation_after_webhook.sql`: settlement locks `payment_creation_requests` before reading the local payment row. It is not an entitlement grant itself.

### Pinterest

- `db/migrations/028_pinterest_oauth_attempt_fencing.sql`: `commit_pinterest_oauth_attempt` locks OAuth state at lines 65–68, then locks `users` at lines 80–83, then upserts account credentials.
- `backend/pinterest.js`: callback exchanges code and fetches profile outside a DB transaction, then calls commit RPC. A lifecycle rejection must discard in-memory credentials; provider exchange cannot be assumed canceled.
- `db/migrations/056_pinterest_account_lock_before_publish_reservation.sql`: publication reservation locks Pinterest account before schedule/attempt.
- `db/migrations/057_pinterest_publish_completion_lock_order.sql`: completion deliberately preserves account → schedule → attempt so late remote success can be reconciled.
- `backend/pinterest.js`: scheduler claims due schedules and renews claim leases before calling publication flow; lifecycle predicate must be added in claim/reservation, not just Express authentication.

### GPTunnel

- `db/migrations/046_pin_generation_claim_fencing.sql`: `complete_pin_generation_request` locks `pin_generation_requests` at lines 146–147, then calls `save_generated_pins_and_charge` at line 153.
- `db/migrations/012_atomic_generation_charge.sql`: nested persistence updates `users` while saving generated pins and charging credits.
- `db/migrations/054_pin_generation_credit_reservations.sql`: reservations are durable and participate in balance protection; deletion must not release uncertain reservations just to make cleanup complete.
- Existing claim tokens and provider outcome journals must remain intact. A late result must be recorded as a fact even when the original request can no longer settle normally.

## Target lock hierarchy

The hierarchy must be explicit and consistent:

1. `users` — lifecycle fence; always first for a user-scoped transaction.
2. Domain root:
   - `subscriptions` / `credit_purchases` / `payment_creation_requests`
   - `pinterest_oauth_connection_state` / `pinterest_accounts`
   - `pin_generation_requests`
3. Domain child rows:
   - payment ledger / checkout journal / outbox
   - schedules → publication attempts → publication receipt
   - generation tasks → credit reservations → generated pins / usage journal
4. Deletion request/job/manifest rows must be placed consistently in the hierarchy. For a deletion worker transaction, use `users → deletion request → deletion job → domain root → domain child`. A normal domain transaction must never acquire the deletion request/job after already holding a domain root. If cross-linking is required, use a separate short transaction or a receipt journal that does not create a reverse lock edge.

This is a hierarchy, not permission to lock every listed row. Acquire only rows needed by that transaction, in the listed relative order.

## Provider calls: two-phase fence, no locks over network

All external work must follow this pattern:

**Before dispatch (short DB transaction):**
- lock user first;
- require `account_status='active'` and expected lifecycle_version;
- lock domain request/account row(s);
- create/claim durable operation identity and idempotency key;
- commit.

**External call:** perform HTTP without holding DB locks.

**After response (short DB transaction):**
- persist immutable provider receipt / remote ID / outcome classification first;
- lock order must remain user → domain request → attempt/journal;
- if account became non-active, do not grant new entitlement, activate future schedule, or make credentials usable;
- preserve late success / late payment as an external fact for reconciliation;
- ambiguous outcome remains unknown and must not be blindly retried.

For a provider receipt that must be retained after lifecycle fence, use a narrow receipt-only path that does not wait on the user while holding a payment/account/request lock. It must never grant access, credits or publication permission. A later reconciliation worker can lock user first and apply the correct disposition.

## Remediation sequence (dependency ordered)

### Phase 0 — contract and staging harness
- Freeze the target hierarchy and map every RPC called transitively by each route/worker.
- Add disposable PostgreSQL concurrency tests with two-session lock inversion reproduction.
- Capture baseline behavior for duplicate webhook, late payment, OAuth reconnect, publication late success and generation unknown spend.

### Phase 1 — Prodamus (financial correctness first)
1. Refactor subscription fulfillment to resolve owner ID without locking the subscription, then lock user, then subscription and validate owner identity under lock.
2. Refactor credit fulfillment similarly: resolve purchase owner, lock user, lock purchase, then perform exactly-once ledger + balance update.
3. Add lifecycle disposition: active user receives entitlement; non-active user receives immutable paid receipt but no credits/subscription activation.
4. Refactor checkout begin/attach/complete/unknown/fail to take a user-first lifecycle gate. Do not hold locks over Prodamus HTTP. A checkout that crossed the fence may still be paid; preserve webhook receipt and route to refund/manual reconciliation.
5. Split checkout settlement from payment fulfillment if necessary; no payment_creation_requests → user reverse lock edge.
6. Preserve old orders without a payment_creation_requests row and existing idempotency semantics.

### Phase 2 — Pinterest OAuth and refresh
1. OAuth begin: lock user and check active before creating/replacing attempt.
2. OAuth commit: read user ID from signed state; lock user first, then OAuth state; compare token_version + lifecycle_version + generation + attempt ID; only then persist encrypted credentials.
3. If callback's external exchange succeeds after deletion fence, discard tokens from memory, do not persist, and record only a safe outcome code. Provider token revocation is a separate best-effort operation with independent evidence.
4. Refresh: owner-first gate before lease; commit checks owner lifecycle again. Preserve rotated refresh token and uncertain status if provider rotation occurred but commit was rejected; never restore stale token.

### Phase 3 — Pinterest publication
1. Add user lifecycle check to due-schedule claim so deletion-pending accounts cannot get new claims.
2. Add owner-first lock to manual/scheduled reservation, then keep account → schedule → attempt ordering.
3. Recheck lifecycle immediately before HTTP dispatch; no DB lock during Pinterest HTTP.
4. Completion records known remote success even after deletion fence, but never reactivates schedules or credentials. Retain publication history / remote IDs as restricted evidence.
5. Distinguish not-yet-sent, in-flight, confirmed success, known safe failure and unknown POST outcome. Unknown blocks destructive cleanup until reconciled.

### Phase 4 — GPTunnel generation
1. Owner-first lifecycle check in generation begin and credit reservation.
2. Completion resolves owner, locks user → generation request → reservation/ledger, validates claim token and lifecycle.
3. If provider result arrives after fence, persist task/provider outcome receipt; do not create new usable pin, debit/refund incorrectly, or release uncertain spend. Route to restricted reconciliation.
4. Regeneration and single-pin paths require parity; no partial gate only on bulk generation.
5. Preserve idempotency keys, task IDs, quote snapshots and exactly-once settlement.

### Phase 5 — account deletion integration
Only after phases 1–4 are deployed and concurrency-tested:
- enable deletion acceptance with user-first transaction;
- disable new user operations;
- enqueue reconciliation and cleanup;
- never treat worker lease expiry as proof that external action did not occur.

## Non-negotiable invariants

- User row is the serialization point; no domain transaction locks a domain row then waits for that user's row.
- No network call inside a DB transaction or while holding row locks.
- Provider receipt persistence is independent of granting new entitlements.
- No double credit, duplicate checkout, duplicate Pinterest POST or duplicate generation settlement.
- Unknown external outcome never becomes safe failure based only on timeout.
- Deletion does not erase financial/publication/generation evidence needed for legal, security or reconciliation obligations.
- A late provider success cannot restore an account or entitlement.
- All security-definer RPCs retain fixed search_path, exact grants and explicit actor/lifecycle checks.

## Exit criteria

- [ ] Inventory every route, worker, nested RPC and trigger touching users and each domain root.
- [ ] Reproduce the three confirmed inversions in a disposable DB before refactoring.
- [ ] Refactor one domain at a time with regression tests and migrations.
- [ ] Race deletion fence against each domain's begin/complete/late-outcome paths.
- [ ] Verify lock waits/deadlocks under concurrent workers.
- [ ] Verify payment ledger, provider receipts, Pinterest remote IDs, generation reservations and task journals remain consistent.
- [ ] Verify no provider HTTP is executed while a transaction is open.
- [ ] Verify non-active lifecycle blocks new entitlement, OAuth persistence, publish reservation and generation spend.
- [ ] Only then authorize account-deletion implementation and staged rollout.

## Safety

No SQL was run. No migration or source file was changed. No provider request, payment, OAuth, publication, credit balance, deletion job or production setting was touched.
