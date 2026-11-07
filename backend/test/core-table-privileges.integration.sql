-- AUD-101: run after migrations 001_baseline, 009, 039 and 076
-- in disposable PostgreSQL CI. Read-only: this script does not change grants.
do $$
declare
  v_table text;
  v_role text;
  v_privilege text;
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
  v_client_roles text[] := array['public', 'anon', 'authenticated'];
  v_privileges text[] := array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
begin
  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'AUD-101 missing core table public.%', v_table;
    end if;

    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relrowsecurity
    ) then
      raise exception 'AUD-101 RLS is not enabled on public.%', v_table;
    end if;

    foreach v_role in array v_client_roles loop
      foreach v_privilege in array v_privileges loop
        if has_table_privilege(v_role, format('public.%I', v_table), v_privilege) then
          raise exception 'AUD-101 client role % retains % on public.%', v_role, v_privilege, v_table;
        end if;
      end loop;
    end loop;

    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if not has_table_privilege('service_role', format('public.%I', v_table), v_privilege) then
        raise exception 'AUD-101 service_role is missing % on public.%', v_privilege, v_table;
      end if;
    end loop;
  end loop;
end;
$$;
