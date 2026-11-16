# Backend audit 11 — SQL/RPC contracts

Date: 2026-11-16. Branch: main.

This is a static reconciliation of all direct Supabase RPC call sites found across the backend runtime modules, including dynamic RPC wrappers in Pinterest publication and admin provider-refund services. It compares backend argument names/order/types with the latest active SQL definitions and execution grants. It does not replace runtime PostgreSQL replay or integration tests.

## Reconciled groups

| Backend module | RPC group | Active SQL definitions | Result |
|---|---|---|---|
| credits.js | adjust_credits_balance_and_log; credit_paid_purchase | 010_atomic_credit_ledger.sql | Names, argument names/types and service_role grants align |
| billing.js | activate_paid_subscription; claim_email_outbox; mark_email_outbox_sent; retry_email_outbox | 011_atomic_subscription_activation.sql; 030_transactional_email_outbox.sql | Latest definitions and backend arguments align |
| password-reset.js | issue_password_reset_token; consume_password_reset_token | 020_atomic_password_reset.sql; 024_password_reset_email_cooldown.sql | Backend cooldown argument matches latest definition |
| email-verify.js | issue_email_verification_token; consume_email_verification_token | 021_atomic_email_verification.sql; 022_atomic_email_verification_issuance.sql | Argument contracts align |
| pinterest.js | account-scoped refresh lease acquire/release and token commit | 031_pinterest_account_scoped_foundation.sql | Backend correctly uses later account-scoped names, not superseded 026/027 names |
| pinterest.js | OAuth begin/commit and account disconnect | 028, 031, 032, 133 | Inspected signatures align |
| pinterest.js | manual and scheduled publish begin/complete/failure | 033, 047, 148 | Backend arguments align; migration 148 adds database pin-status fencing |
| pinterest.js | scheduler run begin/complete | 122, 123 | Run ID and summary arguments align |
| adminPinterestInventory.js | admin_list_pinterest_schedule_inventory | 084_admin_pinterest_inventory_latest_attempt.sql | Argument contract aligns |
| adminPinterestReconciliation.js | admin_reconcile_pinterest_unknown_publication | 082_pinterest_operator_publication_reconciliation.sql | Inspected wrapper aligns |
| adminProviderRefundActions.js | four admin provider-refund wrappers | 078_operator_action_journal.sql | Names, argument order/types align; wrappers delegate to existing 073/077 workflow functions |
| accountLifecycle.js | request_account_deletion | 127, 129, 130 | Latest three-argument version fence matches backend |
| accountDeletionWorker.js | claim/finish, preflight, erasure, disconnect and Storage-manifest RPCs | 130–147 | Inspected names and key argument shapes align |

## Security and concurrency observations

- Sensitive mutations are implemented through database RPCs; inspected functions restrict execution to service_role.
- Pinterest refresh moved from the older generic RPC names in 026/027 to account-scoped functions in 031; the backend calls the later definitions.
- Account deletion's RPC evolved from two arguments in 127 to three arguments with token-version fencing in 129/130; the backend uses the latest contract.
- Migration 148 fences pin rejection, schedule insertion and manual/scheduled publication under database row locks.

## Test coverage

Existing coverage includes Prodamus webhook/settlement, email outbox, account-deletion worker and SQL fixtures, Pinterest OAuth/schedule, admin refund actions, admin Pinterest reconciliation, and pin-publication fencing.

This pass extended `backend/test/pin-status-publication-fencing.integration.sql` to claim a due schedule and call `begin_scheduled_pinterest_publish` with the live claim token. A Node contract assertion checks that the fixture includes this path.

## Not yet verified

- No full backend suite or PostgreSQL integration SQL was executed.
- No clean PostgreSQL replay of 001 + 010–148 was executed; psql is not installed in the available execution environment.
- This is not a complete function-by-function audit of every migration or RPC.
- Latest observed GitHub Actions jobs failed before their first step and did not provide logs; Vercel reports build-rate-limit.

## Next

Continue the remaining backend modules and dynamic RPC calls, then audit migrations 010–148 file-by-file: DDL, functions, triggers, RLS, grants, indexes and integration tests. Do not mark the SQL/RPC audit complete until runtime verification succeeds on disposable PostgreSQL.


## Follow-up: pin generation and regeneration RPC contracts

The API call sites in `backend/index.js` were cross-checked against the latest function definitions in migrations 046, 053–054, 063–069, 105 and 121. No name/argument-count mismatch was found in the inspected paths.

| RPC | Latest definition | Args | API use |
|---|---:|---:|---|
| `begin_pin_generation_request` | 105 | 4 | board, idempotency key, fingerprint |
| `reserve_pin_generation_credits` | 054 | 3 | user, key, amount |
| `get_pin_generation_plan` | 067 | 2 | user, key |
| `record_pin_generation_text_usage` | 069 | 7 | usage fallback when text output is invalid or cost is missing |
| `record_pin_generation_text_plan` | 121 | 8 | valid text result: atomically writes usage + normalized task plan |
| `record_pin_generation_task_quote` | 067 | 8 | per-task provider quote |
| `resize_pin_generation_credit_reservation` | 065 | 4 | exact quote/settlement amount |
| `record_pin_generation_provider_outcome` | 064 | 11 | per-task provider result/refund/error facts |
| `update_pin_generation_task` | 046 | 10 | task state and provider/storage identifiers |
| `complete_pin_generation_request` | 054 | 6 | terminal journal + pin insert + credit settlement |
| `fail_pin_generation_request` | 046 | 5 | definitive/ambiguous failure fencing |
| `begin_pin_regeneration_request` | 105 | 7 | pin, key, fingerprint, model, prompt, estimate |
| `update_pin_regeneration_request` | 053 | 9 | claim-fenced processing/unknown/failed state |
| `record_pin_regeneration_quote` | 068 | 8 | exact quote and user-credit amount |
| `reserve_pin_regeneration_credits` | 066 | 3 | user, key, claim token |
| `record_pin_regeneration_provider_outcome` | 063 | 9 | provider result/refund/error facts |
| `resize_pin_regeneration_credit_reservation` | 068 | 4 | actual settlement amount |
| `complete_pin_regeneration_request` | 066 | 4 | claim-fenced image update and settlement |

The two text-accounting callbacks are mutually exclusive in `backend/pins.js`: invalid/cost-missing text output calls `record_pin_generation_text_usage`; valid parsed output calls `record_pin_generation_text_plan`, whose SQL body calls `record_pin_generation_text_usage` and `save_pin_generation_plan` in one transaction. This avoids a duplicate unique-key insert while retaining provider spend when output cannot become a plan.

Related SQL integration tests present:
- `pin-generation-credit-reservations.integration.sql`
- `pin-generation-provider-quotes.integration.sql`
- `pin-generation-text-usage.integration.sql`
- `pin-generation-completion-guard.integration.sql`
- `pin-regeneration-journal.integration.sql`
- `pin-regeneration-exact-quote.integration.sql`
- `legacy-regeneration-reservation-guard.integration.sql`

Pin-image lifecycle RPCs remain covered by `docs/backend-audit/07-image-storage-lifecycle.md`; their call sites use dynamic fallback/retry helpers, so real PostgreSQL execution is still required to prove current deployment schema and overload resolution.


## Expanded call-site reconciliation — generation, billing, Pinterest and image lifecycle

### Pin generation and regeneration

| Backend RPC call | Latest active SQL definition | Contract result |
|---|---|---|
| `begin_pin_generation_request(text, uuid, text, text)` | `046_pin_generation_claim_fencing.sql` (later uncertainty behavior in 105) | Four arguments match; owner/board/idempotency fingerprint validated |
| `reserve_pin_generation_credits(text, text, integer)` | `054_pin_generation_credit_reservations.sql` | Three arguments match |
| `save_pin_generation_plan(text, text, uuid, jsonb)` | `046_pin_generation_claim_fencing.sql` | Four arguments including claim token match the call made by the atomic text-plan wrapper |
| `record_pin_generation_text_usage(text, text, uuid, text, text, jsonb, numeric)` | `069_gptunnel_text_usage_ledger.sql` | Seven arguments match; service_role only |
| `record_pin_generation_text_plan(text, text, uuid, text, text, jsonb, numeric, jsonb)` | `121_atomic_pin_generation_text_plan.sql` | Eight arguments match; function calls usage ledger + task-plan save transactionally |
| `record_pin_generation_task_quote(text, text, uuid, integer, numeric, text, text, text)` | `067_pin_generation_exact_provider_quotes.sql` | Eight arguments match |
| `resize_pin_generation_credit_reservation(text, text, uuid, integer)` | `065_resize_pin_generation_credit_reservation.sql` | Four arguments match |
| `record_pin_generation_provider_outcome(...)` | `064_pin_generation_provider_outcomes.sql` | Eleven arguments, including provider result URL, match |
| `update_pin_generation_task(...)` | `046_pin_generation_claim_fencing.sql` | Ten arguments including claim token match |
| `get_pin_generation_plan(text, text)` | `045`, latest result shape extended by `064` and `067` | Two arguments match |
| `complete_pin_generation_request(text, uuid, text, uuid, jsonb, integer)` | `054_pin_generation_credit_reservations.sql` | Six arguments including claim token match |
| `fail_pin_generation_request(text, text, uuid, text, boolean)` | `046_pin_generation_claim_fencing.sql` | Five arguments including claim token and unknown-outcome flag match |
| `begin_pin_regeneration_request(text, uuid, text, text, text, text, integer)` | `053_pin_regeneration_journal.sql` | Seven arguments match |
| `record_pin_regeneration_quote(text, text, uuid, numeric, text, text, text, integer)` | `068_exact_quote_single_pin_regeneration.sql` | Eight arguments, including user-credit amount, match |
| `reserve_pin_regeneration_credits(text, text, uuid)` | `066_pin_regeneration_credit_reservations.sql` | Three arguments match |
| `update_pin_regeneration_request(...)` | `053_pin_regeneration_journal.sql` | Nine arguments including claim token match |
| `record_pin_regeneration_provider_outcome(...)` | `063_pin_regeneration_provider_outcomes.sql` | Nine arguments match |
| `resize_pin_regeneration_credit_reservation(text, text, uuid, integer)` | `068_exact_quote_single_pin_regeneration.sql` | Four arguments match |
| `complete_pin_regeneration_request(text, text, uuid, text)` | `066_pin_regeneration_credit_reservations.sql` | Four arguments match |

All inspected generation/regeneration RPCs revoke client/public execution and grant the relevant functions to `service_role`. Older signatures in migrations 014/045/053 are superseded by later claim-token versions; the backend uses the current signatures.

### Payment-creation idempotency

| Backend RPC call | Latest active SQL definition | Contract result |
|---|---|---|
| `begin_payment_creation_request(text, text, text, text)` | `116_idempotent_prodamus_checkout_creation.sql` | Four arguments match |
| `attach_payment_creation_order(text, text, text)` | `117_payment_creation_provider_order_reference.sql` | Three arguments match |
| `complete_payment_creation_request(text, text, jsonb)` | `118_settle_payment_creation_after_webhook.sql` (redefined after 116/117) | Three arguments match |
| `mark_payment_creation_unknown(text, text, text)` | `116_idempotent_prodamus_checkout_creation.sql` | Three arguments match |
| `fail_payment_creation_request(text, text, text)` | `116_idempotent_prodamus_checkout_creation.sql` | Three arguments match |
| `settle_payment_creation_request(text, text, uuid)` | `118_settle_payment_creation_after_webhook.sql` | Three arguments match |

The reviewed payment RPCs are restricted to `service_role`. During this pass a real backend bug was found in `backend/paymentCreationIdempotency.js`: `failPaymentCreation` read `data` without destructuring it from the RPC response. After a successful SQL transition it threw `ReferenceError`, causing the caller to incorrectly retain the request as `unknown`. Fixed by capturing `data`; added `backend/test/payment-creation-idempotency.test.js` to verify true/false RPC confirmation. Commits: `90c06e24` (fix), `a408d94d` (test). Runtime tests remain unexecuted.

### Pinterest publication, schedule recovery and scheduler monitor

- Manual publish reservation/completion/failure: `begin_pinterest_publish_v2`, `complete_pinterest_publish_v2`, `fail_pinterest_publish_v2` in migration 033; completion is later replaced in 047/125; current claim/status fences are applied in later migrations including 148. Argument shapes match backend.
- Unknown result with a known remote Pinterest pin ID: `record_pinterest_publish_unknown_v2(text, uuid, uuid, text, text, text)` in migration 119; six arguments match `persistKnownRemotePublishOutcome`.
- Failure journaling is dynamically invoked by `persistPublishFailureJournal` as `fail_pinterest_publish_v2`; five arguments match migration 033.
- Scheduled reservation: `begin_scheduled_pinterest_publish(text, uuid, uuid, uuid, uuid, text)` in migrations 060/061 and later refinements; six arguments including live claim token match.
- Scheduler: `begin_pinterest_scheduler_run(uuid)` / `complete_pinterest_scheduler_run(uuid, text, integer, integer, integer, integer, integer)` in 122/123; backend arguments match.
- Queue/recovery: `claim_due_pin_schedules(integer)`, `renew_pin_schedule_claim(uuid, uuid)`, `reconcile_confirmed_pinterest_schedule_successes()`, `retry_failed_pin_schedule(text, uuid)`, `change_failed_pin_schedule_board(text, uuid, text)`, and `reconcile_legacy_pinterest_schedule_account(text, uuid, uuid)` match migrations 034/035, 049/052, 086, 093/114 and 122–126.
- Pinterest OAuth/account and token refresh: account-scoped lease acquire/commit/release, OAuth begin/commit and disconnect calls match migrations 028/031/032 and their later refinements. Backend uses the latest account-scoped signatures, not superseded 026/027 variants.

### Pin-image lifecycle

| Backend RPC | SQL migration | Contract result |
|---|---|---|
| `begin_pin_image_upload(text, text, integer)` | `070`, final guard strengthened in `145` | Three arguments match |
| `finalize_pin_image_upload(text, text, uuid, boolean, text)` | `070`, idempotent finalization in `100` | Five arguments match |
| `list_stale_pin_image_uploads(integer, integer)` | `070` | Two arguments match |
| `quarantine_stale_pin_image_upload(text, text, uuid)` | `070` | Three arguments match |
| `claim_pin_image_deletion(text, text, integer)` | `070`, refinements in `083`/`135` | Three arguments match |
| `finalize_pin_image_deletion(text, text, uuid, boolean, text)` | `070`, idempotent finalization in `100` | Five arguments match |
| `list_failed_pin_image_deletions(integer)` | `101` | One argument matches |
| `claim_pin_image_retention_queue(integer, integer)` | `109` | Two arguments match |
| `finalize_pin_image_retention_queue_item(text, text, uuid, boolean, text)` | `109` | Five arguments match |
| `list_blocked_pin_image_retention_queue(integer)` | `110` | One argument matches |
| `list_quarantined_pin_image_objects(integer)` | `099` | One argument matches |
| `find_completed_pin_image_upload(text, text)` | `089` | Two arguments match |
| `list_pin_image_retention_candidates(integer, integer)` | `103` | Two arguments match |
| `expire_pin_image_replay_results(integer, integer)` | `105` | Two arguments match |
| `retire_expired_pin_image_replay_references(integer)` | `108` | One argument matches |

The inspected image lifecycle RPCs are service_role-only. Their limits are validated in SQL; the backend passes bounded limits. The dynamic finalization helper only retries idempotent DB finalization, not the external Storage operation.

### Administrative reconciliation and account deletion

- The four dynamic provider-refund RPC wrappers in `adminProviderRefundActions.js` map to the generation/regeneration refund reconciliation and finalization functions introduced in migrations 073/077 and the operator-action journal in 078; the wrapper's `p_operator_user_id` plus action payload match.
- Pinterest unknown-publication reconciliation `admin_reconcile_pinterest_unknown_publication` matches migration 082.
- Pinterest schedule inventory `admin_list_pinterest_schedule_inventory` matches migration 084.
- Account lifecycle/deletion worker calls (`request_account_deletion`, claim/finish, preflight inventory, content erasure, Pinterest disconnect and Storage-manifest RPCs) match the latest definitions in migrations 127–147; account request uses the three-argument token-version fence introduced in 129/130.

## Full static pass result and limitations

- Re-scanned backend runtime JS modules for direct `.rpc(` call sites and followed dynamic RPC dispatchers in Pinterest schedule journaling, pin-image finalization and admin provider-refund operations.
- All identified backend RPC names, argument shapes and relevant `service_role` grants were reconciled to the latest active migration definitions.
- This is a source-level/signature/grant reconciliation only. It does not prove the database currently has these migrations applied, nor that PostgreSQL can replay the entire chain.
- No full backend test suite or PostgreSQL integration SQL was executed.
- No clean PostgreSQL replay of 001 + 010–148 was executed; `psql` is unavailable in the current execution environment.
- GitHub Actions latest jobs continue to fail before the first step; Vercel reports `build-rate-limit`.

## Next

Run a clean disposable PostgreSQL replay of 001 + 010–148 and all SQL integration tests. If the local environment still lacks `psql`, resolve the Actions runner/billing restriction or arrange an isolated PostgreSQL runner before proceeding to frontend file-by-file review. Never apply the fresh-install baseline/full chain over an existing production database.
