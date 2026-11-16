# PIN_TRIAL database migration status

Last updated: 2026-11-16

## User-confirmed execution history

- [x] Migrations `001–028` were successfully executed on the new test database `PIN_TRIAL`, according to the user's confirmation on 2026-11-16.
- [ ] Migrations after `028` have not yet been confirmed as applied; verify the actual database state before proceeding.
- [ ] Reconcile the applied history and live schema with the repository's current canonical migration chain (`001_baseline.sql` + active migrations `010+`).

## Read-only inspection results

- [x] Queried `information_schema.tables` for tables with names matching migration.
- [x] Found only Supabase-managed tables: `auth.schema_migrations`, `realtime.schema_migrations`, and `storage.migrations`.
- [!] These are subsystem migration tables, not evidence of the user's application SQL migration history. The result does not establish whether application migrations `001–028` or later files were applied.
- [ ] Inspect user/application schemas and compare their objects with the repository's expected schema.

## Application schema inventory (user-provided, 2026-11-16)


- [x] Queried application tables in non-system schemas.
- [x] Found the PinPosy application tables in `public` (including users, projects, boards, pins, credits, billing, Pinterest, queues, and account-deletion objects); `vault.secrets` is also present.
- [!] No application table with a name matching `%migration%` appeared in the prior inventory; the custom application migration ledger has therefore not been identified. The table inventory alone does not prove which migration files ran.
- [ ] Capture the live column definitions for all `public` tables and compare them with the canonical migration chain.

## Column inventory (user-provided, 2026-11-16; partial)

- [x] Received the first segment of the `information_schema.columns` inventory, covering tables from `account_deletion_events` through `email_outbox` (15 listed columns for `email_outbox`).
- [!] The supplied result currently ends at `email_outbox`; it is not yet a complete inventory of all `public` table columns.
- [x] Recorded observations for later migration comparison: `auth_tokens.user_id`, `credit_purchases.user_id`, and `credit_transactions.user_id` are `text`; `account_deletion_requests.user_id` is `uuid`; `boards.created_at` and `credit_transactions.created_at` are `timestamp without time zone`.
- [ ] Receive the remaining rows, then compare complete live columns against the canonical migrations.

## Column inventory — continuation 2 (user-provided, 2026-11-16)

- [x] Received the next alphabetic segment, from `gptunnel_provider_cost_ledger` through `pin_image_object_lifecycle`.
- [x] Recorded observed structures for provider-cost accounting, payment creation idempotency, generation credit reservations, generation requests/tasks/text usage, and image-object lifecycle tracking.
- [!] This segment is still partial: the query output ends at `pin_image_object_lifecycle`; later alphabetic tables remain to be collected.
- [ ] Continue the read-only column inventory after `pin_image_object_lifecycle`.

## Development activity log

- **2026-11-16 — PIN_TRIAL inventory, step 1:** Queried `information_schema.tables` for migration-named tables and Supabase migration schemas. Purpose: locate an application migration ledger without changing the database. Result: only Supabase subsystem tables were found; no application migration ledger was identified.
- **2026-11-16 — PIN_TRIAL inventory, step 2:** Queried non-system base tables. Purpose: identify the application schemas and objects present. Result: PinPosy tables were found in `public`, plus `vault.secrets`; this did not establish which migration files ran.
- **2026-11-16 — PIN_TRIAL inventory, step 3:** Queried `information_schema.columns` for `public` tables. Purpose: capture live column names, order, types, nullability, and defaults for comparison with canonical migrations. Result: first user-supplied segment covered `account_deletion_events` through `email_outbox`.
- **2026-11-16 — PIN_TRIAL inventory, step 4:** Continued the same read-only column query after `email_outbox`. Purpose: collect the remaining column metadata in manageable chunks. Result: second user-supplied segment covered `gptunnel_provider_cost_ledger` through `pin_image_object_lifecycle`; output remains incomplete.
- **Documentation policy:** Record each inspection action, its purpose, observed result, and next step here before asking the user to perform the next database inspection. Do not claim a query was executed by the assistant when it was run by the user. Do not record unverified assumptions as database facts.

## Column inventory — continuation 3 (user-provided, 2026-11-16)

- [x] Received the next alphabetic segment, from `pin_image_retention_queue` through the first three columns of `pinterest_oauth_connection_state`.
- [x] Recorded the observed queue and workflow structures for image retention, pin regeneration, pin review, scheduling, Pinterest account refresh leases, and Pinterest account OAuth state.
- [!] This segment is incomplete: the output ends at `pinterest_oauth_connection_state.current_attempt_id`; remaining columns in that table and later tables have not yet been supplied.
- [ ] Continue the read-only column inventory after `pinterest_oauth_connection_state`.

## Development activity log — continuation

- **2026-11-16 — PIN_TRIAL inventory, step 5:** Received the next user-run read-only `information_schema.columns` result, beginning after `pin_image_object_lifecycle`. Purpose: continue capturing the full live schema in alphabetic chunks without querying application row data or modifying the database. Result: columns for `pin_image_retention_queue`, `pin_regeneration_requests`, `pin_review_queue`, `pin_schedules`, `pins`, `pinterest_account_refresh_leases`, and `pinterest_accounts` were supplied; `pinterest_oauth_connection_state` was only partially supplied. Next: request the remaining table columns and later tables.
- **Documentation rule reaffirmed by user:** Maintain a chronological, auditable record of actions, reasons, results, decisions, and next steps so the complete development sequence can later be reconstructed. For every subsequent work unit, update the relevant project documentation with the actual action and outcome. Attribute user-run SQL execution accurately; do not imply the assistant executed it.

## Column inventory — continuation 4 (user-provided, 2026-11-16)

- [x] Received the next alphabetic segment, from `pinterest_operator_reconciliations` through `users`.
- [x] Captured the supplied columns for Pinterest operator reconciliation, publications, publish attempts, scheduler monitoring, token-refresh leases, projects, provider-refund operator actions/audit, subscriptions, and users.
- [!] Important completeness gap: the prior segment included only the first three columns of `pinterest_oauth_connection_state`; this query used `table_name > 'pinterest_oauth_connection_state'` and therefore skipped the remaining columns of that table. Do not mark the full column inventory complete yet.
- [ ] Query the remaining columns of `pinterest_oauth_connection_state` explicitly, then verify that every table in the earlier table inventory has a complete column listing.

## Development activity log — continuation

- **2026-11-16 — PIN_TRIAL inventory, step 6:** Received the user-run read-only `information_schema.columns` query for table names alphabetically after `pinterest_oauth_connection_state`. Purpose: continue the schema inventory without reading application records or changing database objects. Result: supplied definitions for `pinterest_operator_reconciliations`, `pinterest_publications`, `pinterest_publish_attempts`, `pinterest_scheduler_monitor`, `pinterest_token_refresh_leases`, `projects`, `provider_refund_operator_actions`, `provider_refund_reconciliation_audit`, `subscriptions`, and `users`. The query boundary excluded the rest of `pinterest_oauth_connection_state`, so the overall inventory remains incomplete.
- **Next action rationale:** Retrieve only the missing columns from `pinterest_oauth_connection_state`; this closes a known gap without asking the user to repeat the full inventory.

## Column inventory — completion (user-provided, 2026-11-16)

- [x] Received the missing columns 4–6 of `public.pinterest_oauth_connection_state` from the user's read-only query restricted to `ordinal_position > 3`.
- [x] Recorded the returned definitions: `token_version bigint NULL`; `attempt_expires_at timestamp with time zone NULL`; `updated_at timestamp with time zone NOT NULL DEFAULT now()`.
- [x] Closed the previously documented column-inventory gap: the supplied segments now cover the full alphabetic range of the 35 application tables listed in the `public` table inventory, including all six columns of `pinterest_oauth_connection_state`.
- [!] Completeness here means that column metadata was supplied for all inventoried tables; it does not establish migration execution history or prove that the live schema matches repository migrations.
- [ ] Inspect table constraints (primary keys, foreign keys, unique constraints, check constraints) using read-only catalog queries.

## Development activity log — continuation

- **2026-11-16 — PIN_TRIAL inventory, step 7:** Received the user's read-only query result for `public.pinterest_oauth_connection_state` columns with `ordinal_position > 3`. Purpose: close the explicit gap left by the earlier query that returned only the first three columns. Result: columns 4–6 are `token_version bigint NULL`, `attempt_expires_at timestamptz NULL`, and `updated_at timestamptz NOT NULL DEFAULT now()`. Attribution: the user executed the SQL and supplied the output; no database query was executed by the assistant.
- **2026-11-16 — Column inventory milestone:** The supplied column-result segments now cover all 35 application tables in the previously recorded `public` table inventory. This is a metadata-coverage milestone only; no conclusion is made about which migrations ran or whether the live schema is migration-equivalent.
- **Next action rationale:** Inspect constraints before comparing the live schema to canonical migrations. Primary/foreign keys and unique/check constraints reveal structural relationships and invariants that column metadata alone cannot show. Keep this phase read-only and avoid querying application row contents.

## Constraint inventory — continuation 1 (user-provided file, 2026-11-16)

- [x] Received the first portion of the read-only `pg_constraint` inventory for schema `public`.
- [x] Parsed 100 constraint rows across 18 tables, from `account_deletion_events` through `pin_regeneration_requests`.
- [x] Observed constraint types in this supplied portion: 17 primary keys, 10 foreign keys, 12 unique constraints, and 61 check constraints.
- [!] The supplied text file ends after the fourth listed constraint for `pin_regeneration_requests`; it does not contain the remaining alphabetic tables. This is a partial result and must not be treated as a complete constraint inventory.
- [ ] Obtain the remaining constraints for tables alphabetically after `pin_regeneration_requests`, then verify coverage against the complete list of 35 `public` application tables.

## Development activity log — continuation

- **2026-11-16 — PIN_TRIAL inventory, step 8:** Received the user's uploaded text file containing the output of the read-only `pg_constraint` query. Purpose: inventory primary keys, foreign keys, unique constraints, and check constraints without modifying the test database or reading application row data. Result: 100 rows across 18 tables (`account_deletion_events` through `pin_regeneration_requests`): 17 PRIMARY KEY, 10 FOREIGN KEY, 12 UNIQUE, and 61 CHECK rows. The file ends at `pin_regeneration_requests_quote_valid`, so later tables are not represented in this supplied portion. Attribution: the user supplied the query output; the assistant inspected the uploaded text file, but did not execute SQL against the database.
- **Next action rationale:** Continue from the first table after `pin_regeneration_requests` to avoid repeating already supplied rows. Do not begin index comparison until the full constraint inventory is received and its table coverage checked.

## Constraint inventory — completion (user-provided, 2026-11-16)

- [x] Received the remaining read-only `pg_constraint` rows for tables alphabetically after `pin_regeneration_requests`.
- [x] This continuation contains 70 rows across 16 tables: `pin_review_queue`, `pin_schedules`, `pins`, `pinterest_account_refresh_leases`, `pinterest_accounts`, `pinterest_oauth_connection_state`, `pinterest_operator_reconciliations`, `pinterest_publications`, `pinterest_publish_attempts`, `pinterest_scheduler_monitor`, `pinterest_token_refresh_leases`, `projects`, `provider_refund_operator_actions`, `provider_refund_reconciliation_audit`, `subscriptions`, and `users`.
- [x] Combined with continuation 1, the supplied query output contains 170 constraint rows across 34 of the 35 inventoried `public` tables: 33 PRIMARY KEY, 22 FOREIGN KEY, 16 UNIQUE, and 99 CHECK constraints.
- [!] `gptunnel_provider_cost_ledger` is the one inventoried table with no row in the supplied `pg_constraint` output. This indicates no constraints were returned for it by this query; it does not establish whether indexes or other database objects exist.
- [x] Constraint query coverage is now accounted for across all 35 inventoried application tables: 34 tables with returned constraints and one table with none returned.
- [ ] Inspect indexes separately, including unique and partial indexes, because index inventory is distinct from the constraint catalog.

## Development activity log — continuation

- **2026-11-16 — PIN_TRIAL inventory, step 9:** Received the user's second uploaded text file containing the remaining read-only `pg_constraint` output. Purpose: complete the constraint inventory after the prior file ended at `pin_regeneration_requests`. Result: 70 rows across 16 tables, from `pin_review_queue` through `users`: 38 CHECK, 16 PRIMARY KEY, 12 FOREIGN KEY, and 4 UNIQUE rows. Attribution: the user supplied the SQL output; the assistant inspected the file and counted the returned rows, but did not execute SQL against the database.
- **2026-11-16 — Constraint inventory milestone:** Combined both supplied result segments: 170 rows across 34 tables, consisting of 33 PRIMARY KEY, 22 FOREIGN KEY, 16 UNIQUE, and 99 CHECK constraints. The original 35-table inventory includes `gptunnel_provider_cost_ledger`, for which the supplied `pg_constraint` query returned no rows. Record this as no constraints returned by that catalog query, not as proof that the table has no indexes or other supporting objects.
- **Next action rationale:** Query indexes separately. Indexes may enforce uniqueness or support query paths without appearing as standalone constraint rows; inspect definitions and predicates before comparing against canonical migrations.

## Index inventory — continuation 1 (user-provided, 2026-11-16)

- [x] Received the next read-only `pg_indexes` result for schema `public`.
- [x] Recorded the supplied index definitions in the conversation context, covering alphabetically from `account_deletion_events` through the first returned index for `subscriptions` (`idx_subscriptions_period_end`).
- [!] This is a partial index inventory: the supplied output stops in the middle of the `subscriptions` table and does not include the remaining subscription indexes or later tables such as `users`. Do not treat it as a complete index inventory.
- [!] Index names and definitions have been received, but no migration-by-migration comparison, query-plan analysis, redundancy assessment, or performance conclusion has been performed.
- [ ] Continue the same read-only index query from the remaining `subscriptions` rows onward, then verify coverage against all 35 inventoried `public` application tables.

## Development activity log — continuation

- **2026-11-16 — PIN_TRIAL inventory, step 10:** Received the user's next read-only `pg_indexes` query result for `schemaname = 'public'`, ordered by table and index name. Purpose: inventory index definitions separately from constraints, including partial and unique indexes, before comparing the live database with canonical migrations. Result: the supplied segment starts at `account_deletion_events` and ends at `subscriptions.idx_subscriptions_period_end`; it therefore cuts off during the `subscriptions` table. The segment includes primary-key/unique indexes and ordinary/partial indexes across the represented tables. No claim is made that all expected indexes are present, and no index redundancy or performance conclusion has yet been established. Attribution: the user ran the SQL and supplied its output; the assistant recorded the observed range and did not query the database directly.
- **Next action rationale:** Continue from the remaining `subscriptions` indexes and subsequent table names. This avoids repeating the supplied portion and is necessary before any complete index comparison. Keep the query read-only; do not create, drop, or rebuild indexes during inventory.

## Safety rules

- This record concerns the test database `PIN_TRIAL`, not production.
- Do not rerun migrations `001–028` or apply later migrations until the database's migration history and schema have been inspected.
- Start with read-only inspection queries. Do not drop, reset, truncate, or alter database objects during inventory.
- A successful execution report for a migration file is distinct from proving that the resulting schema matches the current repository.

## Next action

Continue the partial `pg_indexes` inventory from the remaining `subscriptions` rows through the later tables (including `users`); then inspect functions and compare the collected live schema objects with the canonical migration chain before deciding which migrations, if any, remain to be applied.
