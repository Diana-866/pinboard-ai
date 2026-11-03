-- Preflight audit for 009_hardening.sql
-- READ ONLY: this script does not modify or delete data.
-- Run against a COPY / staging database first. Do not use the output as
-- permission to run 009 on production without a reviewed backup and plan.

-- 1) user_id values that 009 would delete or null before converting TEXT -> UUID.
-- Invalid values in credit_transactions are nullable and will be set to NULL.
-- Invalid values in the other listed tables are NOT NULL and will be deleted.
with source_tables(table_name, invalid_action) as (
  values
    ('auth_tokens', 'DELETE (NOT NULL)'),
    ('credit_transactions', 'SET NULL (nullable)'),
    ('subscriptions', 'DELETE (NOT NULL)'),
    ('credit_purchases', 'DELETE (NOT NULL)'),
    ('pinterest_accounts', 'DELETE (NOT NULL)'),
    ('pinterest_publications', 'DELETE (NOT NULL)')
)
select
  s.table_name,
  s.invalid_action,
  count(*) filter (
    where t.user_id is not null
      and t.user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) as invalid_user_id_rows,
  count(*) filter (
    where t.user_id is not null
      and t.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not exists (
        select 1 from public.users u where u.id = t.user_id::uuid
      )
  ) as orphan_user_id_rows
from source_tables s
cross join lateral (
  select user_id from public.auth_tokens where s.table_name = 'auth_tokens'
  union all
  select user_id from public.credit_transactions where s.table_name = 'credit_transactions'
  union all
  select user_id from public.subscriptions where s.table_name = 'subscriptions'
  union all
  select user_id from public.credit_purchases where s.table_name = 'credit_purchases'
  union all
  select user_id from public.pinterest_accounts where s.table_name = 'pinterest_accounts'
  union all
  select user_id from public.pinterest_publications where s.table_name = 'pinterest_publications'
) t
group by s.table_name, s.invalid_action
order by s.table_name;

-- 2) Fractional credit transaction amounts.
-- 009 converts amount numeric -> integer only when no fractional values exist.
select count(*) as fractional_credit_amount_rows
from public.credit_transactions
where amount is not null and amount <> trunc(amount);

-- 3) Values that the status CHECK constraints in 009 will preserve by
-- extending the accepted value list. Review unexpected values manually.
select 'boards.status' as field, status as value, count(*) as rows
from public.boards
group by status
union all
select 'pins.status' as field, status as value, count(*) as rows
from public.pins
group by status
order by field, value;

-- 4) Snapshot counts to record before any migration.
select 'users' as table_name, count(*) as rows from public.users
union all select 'projects', count(*) from public.projects
union all select 'boards', count(*) from public.boards
union all select 'pins', count(*) from public.pins
union all select 'credit_transactions', count(*) from public.credit_transactions
union all select 'auth_tokens', count(*) from public.auth_tokens
union all select 'subscriptions', count(*) from public.subscriptions
union all select 'credit_purchases', count(*) from public.credit_purchases
union all select 'pinterest_accounts', count(*) from public.pinterest_accounts
union all select 'pinterest_publications', count(*) from public.pinterest_publications
order by table_name;
