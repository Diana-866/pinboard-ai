-- 076_harden_core_table_client_privileges.sql
-- AUD-101: PinPosy uses its own JWT, not Supabase Auth JWTs. The backend is
-- the only supported data-access boundary and uses the server-only service
-- role. RLS policies based on auth.uid() are defense-in-depth, not a reason
-- to leave table grants available to anon/authenticated.
--
-- Revoke all direct client access consistently from every core account/data
-- table. Preserve backend access explicitly. This migration is idempotent.

do $$
declare
  v_table text;
  v_tables text[] := array[
    'users',
    'projects',
    'boards',
    'pins',
    'credit_transactions',
    'auth_tokens',
    'subscriptions',
    'credit_purchases',
    'pinterest_accounts',
    'pinterest_publications'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'AUD-101 expected core table public.% to exist', v_table;
    end if;

    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', v_table);
  end loop;
end;
$$;
