# 2026-11-18 — Payment fulfillment user-first lock order and account lifecycle fence

**Repository:** `Diana-866/pinboard-ai`  
**Branch:** `main`  
**Starting HEAD:** `88b55b917859b7a8de4a120394b26e44bbad5266`  
**Code/test/CI change HEAD:** `63c02f2e7540e8f510e819c5728957c25e065931`  
**Status:** published; static verification complete; PostgreSQL runtime verification NOT RUN / BLOCKED by Actions runner allocation and owner-local runner requirement.

## 1. Root cause

The account deletion acceptance RPC in migration 127 locks `public.users` first and commits `account_status='deletion_pending'`. The paid fulfillment RPCs created earlier used the opposite order:

- `credit_paid_purchase` locked `credit_purchases` first and then updated/locked `users`.
- `activate_paid_subscription` locked `subscriptions` first and then locked `users`.

This creates a lock-order inversion against the account deletion lifecycle. More importantly, neither fulfillment RPC checked the account lifecycle state, so a valid late provider success could still grant credits or activate a subscription after the account deletion fence had committed.

AUD-400 and AUD-401 already described the larger design problem: a provider receipt must be recorded independently of whether PinPosy grants the corresponding entitlement. The receipt/decision journal is not implemented by this change; this migration is a narrowly scoped first safety boundary, not a complete payment-vs-deletion reconciliation solution.

## 2. Implemented migration

Added `db/migrations/157_payment_fulfillment_user_first_lifecycle_fence.sql`.

Both fulfillment RPCs now:
1. Read the payment's owner ID without taking a payment-row lock.
2. Lock the owning `users` row `FOR UPDATE`.
3. Lock the payment row (`credit_purchases` or `subscriptions`) only after the user lock.
4. Revalidate the payment owner against the locked user.
5. Reject fulfillment unless `users.account_status = 'active'`.
6. Preserve existing eligible payment statuses, late success for active accounts, duplicate credit marker behavior, subscription period extension, and newest-created subscription plan precedence.

The functions retain SECURITY DEFINER with fixed `search_path = pg_catalog, public`; EXECUTE remains service_role-only. The migration is additive/replacement-function-only; it does not delete or rewrite existing financial rows.

Migration blob: `3ca8d1a8c21afecfe0d61131da7168bfe1dff1e8`.  
Migration commit: `2f7ef442872c4c16d501f2d19a5ba9f0601533da`.

## 3. Regression test

Added `backend/test/payment-deletion-lifecycle-fence.integration.sql`.

It creates synthetic users in `deletion_pending` and:
- attempts a late success against a locally canceled credit purchase;
- asserts the RPC rejects it, user balance stays unchanged, purchase remains canceled/uncredited, and no top-up ledger row is inserted;
- attempts a late success against a locally canceled subscription;
- asserts the RPC rejects it, no paid period is written, and the user's tariff remains at its baseline `none`.

The fixture initially asserted `tariff_plan IS NULL`; inspection of `001_baseline.sql` showed the actual default is `'none'`. The fixture was corrected before final verification. Final test blob: `5712883351ab84a914704578507bc8c12f910b4d`. Initial test commit `4987f082a1f676eff399b01999f059688e43ddfa`; fixture correction commit `63c02f2e7540e8f510e819c5728957c25e065931`.

## 4. Migration and CI chain updates

Extended all canonical migration guards/replayers from 010–156 (147 files) to 010–157 (148 files):
- `.github/workflows/atomic-payment-integration.yml` applies migration 157 and runs the new SQL integration test. Blob `524317f02b88939780056831f1e75ed555a44b03`, commit `825e206c091b224ad39c044f0884be366fac86dc`.
- `scripts/verify-integration.ps1` now expects 148 migrations and 47 SQL tests. Final blob `2a6a671649ececdfbe91cd6edfeb3cb641533589`; commits `50189f5840717e20012e7beee06b3fe18dd60fd5`, `c9e284357b0c14b5bccf35585335c4a207f48827`.
- `scripts/verify.sh` now validates 010–157 / 148 migrations. Blob `792e7de4b730f4540ef612892905be67edb2c10f`, commit `1dd0a9e6a2ead5ffc2103100b2d36965de910fe2`.
- `scripts/verify.ps1` now validates 010–157 / 148 migrations. Blob `2a34f9e50b60c17e98e42295801b0060acca397b`, commit `00f75480033ac9c4bf194158a61718e0a10e5263`.
- `backend/test/db-migration-chain.test.js` now requires exactly one migration for every prefix 010–157. Blob `7a36289cf8ad038873fcd05a984590b23be99767`, commit `706a32f482aa96db150a4947dbc1f0b3ed8755e3`.
- `backend/test/postgres-integration-sql-manifest.txt` now lists 47 SQL tests including the new test. Blob `e95890a97fe1da8cdbecd02f20cfab1fc57e2034`, commit `0a14ad9d1caca487ef7bba0cb1595906f091fefb`.
- `backend/test/postgres-integration-runner-contract.test.js` now asserts 148 migration entries, 47 SQL tests, and the migration's user-first lock/lifecycle guard. Final blob `1a97bd975a1629e62c82433e5c1f1ae9861861fa`, commits `5e247bcd72ed640d7b2a845cc3c2747af9f23e69`, `13f18d0d8d47847591854081b9887cb1f5f60de9`, `3bb5aaa296a6381cfff9e5b49551dec7d27b34cf`.
- `backend/test/verify-script-migration-chain.test.js` updated for 010–157 / 148. Blob `7208d40d2b20fbc564103c36be58affe4c7a273d`, commit `7ef51a34fc884658231df520a38c5e8717f246a6`.

Static cross-file assertions after publication confirmed: migration 157 present; all migration runner ranges/counts agree; SQL manifest contains 47 entries; workflow includes the migration and test; runner contract expects 148 migrations and 47 SQL tests; the SQL fixture uses the baseline tariff default. These are source-level consistency checks, not execution of Node or PostgreSQL tests.

## 5. CI/runtime evidence

GitHub Actions run `44308754607` for code/test HEAD `63c02f2e7540e8f510e819c5728957c25e065931` ended FAILURE in approximately two seconds. Job `134817075814` returned no steps; the steps endpoint returned an empty list and log download returned HTTP 404 `BlobNotFound`. Therefore no evidence shows that checkout, PostgreSQL provisioning, migration 157, or any SQL test ran. Do not classify the SQL regression as pass or source failure; runtime result is UNKNOWN / NOT RUN. No blind rerun was initiated.

Vercel combined status on the code/test HEAD is FAILURE with target `build-rate-limit`; this is a deployment rate-limit status, not a frontend build log. No deployment is confirmed.

The three Node preflight files currently contain 31 + 2 + 17 = 50 top-level `test()` cases by static source count. They have not been executed. The disposable PostgreSQL suite contains 47 SQL tests, also not executed in this session.

## 6. Safety boundary and remaining work

- No production or staging database was connected.
- No production migration was applied.
- No real payment, Prodamus account, webhook, refund, Pinterest API, or external service was used.
- No secrets or production environment variables were read or changed.
- No real user/account rows were touched.

**Critical remaining work:**
1. Implement the immutable Prodamus provider receipt journal and separate entitlement decision state from AUD-400. Without it, valid late success for a canceled/denied payment may not be durably preserved if the account is already fenced; migration 157 only prevents entitlement mutation and may leave the provider callback retrying.
2. Add a two-session PostgreSQL regression for deletion acceptance racing credit/subscription fulfillment. The current SQL test proves inactive-account rejection, not lock-wait ordering or deadlock freedom.
3. Owner must sync main, run the 50-test Node preflight, then the guarded disposable PostgreSQL runner with 148 migrations and 47 SQL tests. Stop at first failure and retain cleanup evidence.
4. Resolve the GitHub Actions runner allocation failure via owner-visible logs/annotations; no repeated blind reruns.
5. Keep live payments and first-user launch blocked until receipt journaling, concurrency tests, SQL runtime, full backend/frontend checks, external webhook configuration and deployment gates are green.

## 7. Assistant action chronology

1. Re-fetched current main, project state, owner actions, documentation register, recent commit history, Prodamus checkout source, payment RPCs, account lifecycle migration, deletion worker financial guard and integration workflow.
2. Read AUD-400 and AUD-401; confirmed the receipt/entitlement split was a design-only proposal and no matching receipt table or RPC existed in the current migration directory.
3. Compared migration 010 credit RPC and migration 019 subscription RPC with migration 127 deletion acceptance and migration 143 deletion financial-outcome guard.
4. Implemented migration 157 with user-first lock order and active-account gate for both payment fulfillment RPCs.
5. Added SQL regression for canceled credit purchase and canceled subscription against deletion-pending users.
6. Extended workflow, SQL manifest, both shell migration replayers, Windows integration runner, migration chain test and runner contract test.
7. Detected and corrected an initial runner-count omission (`for $i -lt 147`, SQL count 46) to 148 migrations / 47 SQL tests; detected and corrected the fixture's incorrect null tariff assumption.
8. Re-fetched all changed source/test/workflow/runner files, inspected final blobs and cross-file counts; checked latest Actions run, job steps/log and Vercel status.
9. Recorded runtime verification as NOT RUN / UNKNOWN; no unsafe environment was accessed.
