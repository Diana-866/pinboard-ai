# Targeted payment-path review — Prodamus receipt and webhook boundary

Date: 2026-11-18  
Repository: `Diana-866/pinboard-ai`, branch `main`  
Reviewed HEAD: `f03aa6410c388e08d14d00887959a5fe7599ac58`  
Scope: targeted static review of Prodamus webhook parsing/signature verification, immutable receipt persistence, receipt-bound credit/subscription fulfillment, migration 161 grant guard, and the atomic-payment Actions workflow.

## Evidence collected

The following current-main files were fetched and inspected:

- `backend/prodamus.js` — HMAC-SHA256 verification, canonical payload normalization, HTTPS payment-form URL validation, demo-mode gate, and payment status/amount normalization.
- `backend/prodamusWebhookBody.js` — bounded multipart field parser, duplicate/conflicting field rejection, depth/index limits, and prototype-key denylist.
- `backend/paymentProviderReceipts.js` — immutable event fingerprint construction, receipt RPC persistence, and explicit rejection of JavaScript-level direct `granted` decisions.
- `backend/billing.js` and `backend/creditsBilling.js` — payment order creation, idempotency, provider failure handling, webhook receipt-first persistence, and receipt-bound fulfillment call path.
- `db/migrations/159_atomic_prodamus_receipt_entitlement_fulfillment.sql` and `db/migrations/161_restrict_granted_decisions_to_atomic_fulfillment.sql` — transaction-bound entitlement changes, lifecycle fencing, private grant helper, decision allowlist, and ACL changes.
- `backend/test/payment-provider-receipts.integration.sql` and `backend/test/payment-provider-receipt-fulfillment.integration.sql` — receipt immutability, idempotent delivery, mismatch/withheld outcomes, exactly-once credit assertion, rebinding rejection, and direct-grant denial.
- `.github/workflows/atomic-payment-integration.yml` — ordered migration and SQL integration commands, including migration 161 and the payment fulfillment regression.

## Static findings

1. The reviewed webhook path verifies the provider signature before receipt/entitlement handling. The immutable provider receipt is persisted before order lookup and fulfillment; receipt persistence failure returns an error rather than granting an entitlement.
2. The receipt event fingerprint excludes the transport retry counter and signature aliases, while retaining the payment payload. The multipart parser rejects duplicate fields, conflicting structures, dangerous prototype keys, excessive nesting, and out-of-range array indexes.
3. The application receipt-decision helper rejects `granted` decisions. Migration 161 also restricts the database decision RPC to non-grant states, revokes direct execution of the private grant helper, and routes the credit/subscription wrappers through that helper after verifying a successful receipt and committed local entitlement.
4. The SQL integration test includes both credit and subscription fulfillment paths, duplicate receipt delivery, exactly-once credit ledger checks, mismatch and account-lifecycle withholding, conflicting receipt rebinding, role privilege checks, and a forbidden direct-grant attempt.
5. No confirmed new source defect was established in this targeted slice. This is not a declaration that the entire payment system is secure or production-ready; provider behavior, full database execution, concurrency and runtime integration remain separate release gates.

## CI and verification boundary

- `get_commit_combined_status` for reviewed HEAD returned Vercel `failure`, target `build-rate-limit`. This is a platform status, not a source build log.
- The available commit-workflow lookup returned an empty list; that connector operation is documented to return only pull-request-triggered runs. Therefore this result does **not** establish that no push-triggered workflow ran.
- No Bash, Node, PostgreSQL, PowerShell, CI job, Vercel build, or live Prodamus request was executed in this review. No runtime PASS is claimed.
- No production database, production data, external payment account, DNS, or deployment was accessed or changed.

## Required next step

The owner-controlled verification already described in UA-052 remains mandatory: execute the 152-migration canonical replay and 49 SQL integration tests on a disposable PostgreSQL database, then the 52 Node preflight tests and ten disposable concurrency scripts. Inspect actual GitHub Actions job steps/logs once runner allocation is available. Keep first-user invitations and live payments blocked until runtime gates and production configuration are independently confirmed.


## Follow-up finding and hardening on the newer mainline HEAD

After the initial review, main advanced with receipt-binding and evidence checks in migration 161. Reviewing that follow-up exposed an asymmetry: the private grant helper rejected a missing local credit amount, but the subscription branch did not explicitly reject a NULL local amount before evaluating the amount difference. The canonical baseline currently declares `subscriptions.amount NOT NULL`, so this state is prevented by the present schema; nevertheless, the helper is a security boundary and both payment kinds must enforce the same invariant rather than rely on a distant schema constraint.

Changes published on main:

- `db/migrations/161_restrict_granted_decisions_to_atomic_fulfillment.sql`: added `v_payment_amount is null` to the subscription branch as well as the credit branch. Current blob: `039b778b89f8d592eda92a7f199176030a1eeb49`; commit `2d3a478d17e4c17995cd2ba407f31b93224a906f`.
- `backend/test/postgres-integration-runner-contract.test.js`: changed the static regression to require exactly two missing-amount guards, one for each payment kind. Current blob: `252ab03a5146605a28cb01f465c17d7bf8947f97`; commit `4c02b2afcd2240f08bb9903e5b9afb3cd7442f27`.
- This follow-up builds on concurrent mainline fix `b9b3d92257b9b26a8962495044faa197f6101ddf`, which binds the private helper to the exact receipt/payment/user and verifies amount/currency evidence, and `6360f302eb5ef6a93c8c624523f1d5ea07eef852`, which explicitly rejects a missing local credit amount.

Static verification after publication: re-fetched both current files; migration contains exactly two `v_payment_amount is null` guards and the Node contract requires a count of 2. This was a source-level check only. Node test, PostgreSQL replay, SQL integration, and CI runtime remain NOT VERIFIED. No production DB or payment service was used.
