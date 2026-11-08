-- READ-ONLY preflight for db/migrations/009_hardening.sql.
-- Run against a restored copy or read-only production connection BEFORE migration 009.
-- This file contains SELECT statements only. Export the detailed result sets before
-- approving any cleanup. It does not archive, repair, delete, update, or alter data.
--
-- The first result summarizes rows that migration 009 may null or delete.
-- The following result sets expose the exact candidate rows for external export.
-- A zero count is not a substitute for a verified backup.

with source_rows as (
  select 'auth_tokens'::text as table_name, id::text as row_id, user_id::text as user_id,
         false as nullable_user_id
    from public.auth_tokens
  union all
  select 'credit_transactions', id::text, user_id::text, true
    from public.credit_transactions
  union all
  select 'subscriptions', id::text, user_id::text, false
    from public.subscriptions
  union all
  select 'credit_purchases', id::text, user_id::text, false
    from public.credit_purchases
  union all
  select 'pinterest_accounts', id::text, user_id::text, false
    from public.pinterest_accounts
  union all
  select 'pinterest_publications', id::text, user_id::text, false
    from public.pinterest_publications
),
classified as (
  select s.*,
    case when user_id is not null
      then user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      else true end as valid_uuid
  from source_rows s
)
select table_name,
       count(*) filter (where user_id is not null and not valid_uuid) as malformed_user_id_rows,
       count(*) filter (
         where user_id is not null and valid_uuid
           and not exists (
             select 1 from public.users u where u.id::text = classified.user_id
           )
       ) as orphaned_user_rows,
       count(*) filter (where user_id is not null and not valid_uuid and nullable_user_id)
         as rows_migration_would_set_null,
       count(*) filter (where user_id is not null and not valid_uuid and not nullable_user_id)
         as rows_migration_would_delete_for_malformed_id
from classified
group by table_name
order by table_name;

-- Exact malformed user_id candidates. credit_transactions rows in this result
-- are updated to NULL by 009; the other tables' rows are deleted.
select 'auth_tokens'::text as table_name, to_jsonb(t) as candidate_row
  from public.auth_tokens t
 where user_id is not null
   and user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
union all
select 'credit_transactions', to_jsonb(t)
  from public.credit_transactions t
 where user_id is not null
   and user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
union all
select 'subscriptions', to_jsonb(t)
  from public.subscriptions t
 where user_id is not null
   and user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
union all
select 'credit_purchases', to_jsonb(t)
  from public.credit_purchases t
 where user_id is not null
   and user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
union all
select 'pinterest_accounts', to_jsonb(t)
  from public.pinterest_accounts t
 where user_id is not null
   and user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
union all
select 'pinterest_publications', to_jsonb(t)
  from public.pinterest_publications t
 where user_id is not null
   and user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Exact orphaned user_id candidates that 009 deletes before adding user FKs.
select 'auth_tokens'::text as table_name, to_jsonb(t) as candidate_row
  from public.auth_tokens t
 where user_id is not null
   and user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and not exists (select 1 from public.users u where u.id::text=t.user_id::text)
union all
select 'credit_transactions', to_jsonb(t)
  from public.credit_transactions t
 where user_id is not null
   and user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and not exists (select 1 from public.users u where u.id::text=t.user_id::text)
union all
select 'subscriptions', to_jsonb(t)
  from public.subscriptions t
 where user_id is not null
   and user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and not exists (select 1 from public.users u where u.id::text=t.user_id::text)
union all
select 'credit_purchases', to_jsonb(t)
  from public.credit_purchases t
 where user_id is not null
   and user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and not exists (select 1 from public.users u where u.id::text=t.user_id::text)
union all
select 'pinterest_accounts', to_jsonb(t)
  from public.pinterest_accounts t
 where user_id is not null
   and user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and not exists (select 1 from public.users u where u.id::text=t.user_id::text)
union all
select 'pinterest_publications', to_jsonb(t)
  from public.pinterest_publications t
 where user_id is not null
   and user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and not exists (select 1 from public.users u where u.id::text=t.user_id::text);

-- Exact publication rows that 009 deletes because pin_id has no matching pin.
select to_jsonb(pp) as candidate_row
  from public.pinterest_publications pp
 where not exists (select 1 from public.pins p where p.id=pp.pin_id);

-- Review values that 009 preserves by expanding CHECK constraints to include them.
select 'boards'::text as table_name, status, count(*) as row_count
  from public.boards
 where status is not null and status not in ('new','in_progress','done')
 group by status
union all
select 'pins', status, count(*)
  from public.pins
 where status is not null and status not in ('pending','approved','rejected','scheduled','published')
 group by status
order by table_name,status;

-- Migration 009 changes amount numeric -> integer only when no fractional values
-- exist. It rounds during conversion; this also reports integer-range overflow.
select
  count(*) filter (where amount is not null and amount <> round(amount)) as fractional_amount_rows,
  count(*) filter (where amount is not null and (round(amount) < -2147483648 or round(amount) > 2147483647))
    as rounded_amount_outside_integer_range,
  min(amount) as minimum_amount,
  max(amount) as maximum_amount
from public.credit_transactions;
