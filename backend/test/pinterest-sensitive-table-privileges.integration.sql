-- Run in disposable PostgreSQL CI after migration 039.
-- Simulate permissive Supabase default grants, then ensure the hardening
-- migration removes client access while preserving backend service access.
do $$
begin
  if has_table_privilege('anon', 'public.pinterest_accounts', 'SELECT')
     or has_table_privilege('authenticated', 'public.pinterest_accounts', 'SELECT')
     or has_table_privilege('public', 'public.pinterest_accounts', 'SELECT') then
    raise exception 'untrusted role can SELECT Pinterest credentials';
  end if;

  if has_table_privilege('anon', 'public.pinterest_accounts', 'INSERT')
     or has_table_privilege('authenticated', 'public.pinterest_accounts', 'UPDATE')
     or has_table_privilege('public', 'public.pinterest_accounts', 'DELETE') then
    raise exception 'untrusted role retains write access to Pinterest credentials';
  end if;

  if has_table_privilege('anon', 'public.pinterest_publications', 'SELECT')
     or has_table_privilege('authenticated', 'public.pinterest_publications', 'SELECT')
     or has_table_privilege('public', 'public.pinterest_publications', 'INSERT') then
    raise exception 'untrusted role retains direct access to Pinterest publication records';
  end if;

  if not has_table_privilege('service_role', 'public.pinterest_accounts', 'SELECT')
     or not has_table_privilege('service_role', 'public.pinterest_accounts', 'UPDATE')
     or not has_table_privilege('service_role', 'public.pinterest_publications', 'INSERT') then
    raise exception 'service_role lost required Pinterest persistence privileges';
  end if;
end;
$$;
