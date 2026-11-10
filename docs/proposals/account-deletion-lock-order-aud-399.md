# AUD-399 — Lock-order remediation plan

This companion summarizes the confirmed source-level lock inversions and the dependency-ordered remediation sequence. Full source map and exact evidence: `docs/audits/AUD-399-cross-domain-lock-order-map.md`.

## Confirmed
- Prodamus subscription: subscription row → users row.
- Prodamus credit purchase: credit purchase row → users balance update.
- Pinterest OAuth commit: OAuth state row → users row.
- GPTunnel generation completion: generation request row → nested user balance/pin charge.

## Target
All user-scoped DB transactions: users → domain root → domain child. Provider HTTP calls happen outside transactions. Late provider receipts are preserved independently from entitlement or new work.

## Sequence
1. Prodamus fulfillment and checkout lifecycle fencing.
2. Pinterest OAuth / refresh owner-first fencing.
3. Pinterest scheduler claim/reservation and late-success reconciliation.
4. GPTunnel generation / reservations / regeneration owner-first fencing.
5. Account deletion acceptance and worker rollout only after all race tests.

No code, migration, SQL, tests or production changes in AUD-399.
