# Financial balance reconciliation — AUD-373

**Mode:** read-only first. Never run automatic balance repair.

## Preconditions

- Use an approved read-only database role or consistent snapshot.
- Confirm the opening-balance baseline and ledger cutover date from migration/history evidence.
- Classify legacy adjustments, imports and migration corrections before computing an expected balance.
- Exclude active generation reservations from debits: reservations are holds, not ledger charges.

## Reconciliation

1. Compare `users.credits_balance` with opening balance plus validated post-cutover `credit_transactions.amount`.
2. Check purchase-linked ledger rows against `credit_purchases.balance_credited_at`, purchase status and unique purchase_id.
3. Check generation debits against completed requests, settlement journal and reservation terminal state.
4. Inventory uses of `adjust_credits_balance` and `adjust_credits_balance_and_log`, including service-role jobs outside the repository.
5. Check refunds and chargebacks separately; current product schema does not automatically represent provider refunds.
6. Produce a restricted report with internal user reference, stored balance, expected balance, delta and evidence references only.
7. Repeat against a consistent snapshot after in-flight payment and generation operations settle.
8. Open a reviewed incident/case for each discrepancy. Preserve query, snapshot timestamp and evidence.

## Prohibited actions

- Do not set `users.credits_balance` directly to the calculated sum.
- Do not claw back the face value of a credit pack if credits may have been consumed.
- Do not revoke a current subscription because an older payment was refunded.
- Do not revoke the legacy RPC until deployed callers have been inventoried.
- Do not log customer email, raw webhook payload, access token, API secret or payment credential in a general report.

## Exit criteria

Every delta has an explained source or an approved ledger correction; a second reviewer signs off; reconciliation is rerun and the result is retained in the restricted audit trail.
