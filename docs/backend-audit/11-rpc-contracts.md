# Backend audit 11 — SQL/RPC contracts

Date: 2026-11-16. Branch: main.

This is a focused reconciliation of selected high-risk backend RPC calls against the active SQL migration definitions. It does not complete the full backend or migration audit.

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
