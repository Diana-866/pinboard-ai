# AUD-399 — Cross-domain lock-order remediation runbook

**Source audit only. No SQL or deployment authorized.**

## Confirmed inversions
- [ ] `activate_paid_subscription`: subscription → user.
- [ ] `credit_paid_purchase`: credit purchase → user.
- [ ] `commit_pinterest_oauth_attempt`: OAuth state → user.
- [ ] `complete_pin_generation_request`: generation request → nested user balance/pin charge.

## Required target order
`users → deletion request/job (only in deletion workflow) → domain root → domain child`

Domain child examples: payment ledger/outbox; Pinterest schedule → publication attempt; generation task → credit reservation → pins/usage.

Do not let normal domain paths acquire deletion job/request after taking a domain lock. Use a separate receipt/reconciliation transaction if a cross-workflow reference is needed.

## Implementation order
1. Prodamus subscription and credit fulfillment; preserve immutable paid receipt but withhold entitlement for non-active owner.
2. Checkout creation/settlement lifecycle gate; provider HTTP outside locks.
3. Pinterest OAuth begin/commit and refresh owner-first; discard callback credentials if lifecycle changed.
4. Pinterest scheduler claim/reservation owner-first; completion still records late remote success.
5. GPTunnel generation begin/reserve/complete/regeneration owner-first; preserve unknown provider spend.
6. Only after all race tests pass, implement deletion acceptance/worker.

## Tests
- [ ] Two-session deadlock reproduction for each confirmed inversion.
- [ ] Deletion fence racing payment webhook, credit purchase, checkout completion.
- [ ] Deletion fence racing OAuth begin, callback exchange, token refresh.
- [ ] Deletion fence racing schedule claim, publish reservation, in-flight POST, late success.
- [ ] Deletion fence racing generation begin, reserve, provider completion, recovery and regeneration.
- [ ] Duplicate provider receipt remains idempotent.
- [ ] Unknown provider outcome never blindly retries.
- [ ] Verify no HTTP request occurs while DB locks are held.
- [ ] Verify direct service_role path is lifecycle-gated; middleware alone is insufficient.

## Rollout gates
No production deletion feature flag until domain migrations, backend gates, disposable DB concurrency tests, provider receipt reconciliation and explicit approval are complete.
