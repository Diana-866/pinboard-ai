-- 039_pinterest_sensitive_table_privileges.sql
-- Pinterest credentials are server-only. Do not rely on Supabase project's
-- default table grants or on auth.uid()-based RLS for this custom-JWT app.
revoke all on table public.pinterest_accounts
  from public, anon, authenticated;
revoke all on table public.pinterest_publications
  from public, anon, authenticated;

-- The backend uses the service-role client for all Pinterest persistence.
grant select, insert, update, delete on table public.pinterest_accounts
  to service_role;
grant select, insert, update, delete on table public.pinterest_publications
  to service_role;
