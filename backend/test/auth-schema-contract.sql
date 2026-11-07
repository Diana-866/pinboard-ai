-- AUD-032: read-only authentication schema contract.
-- Run against a staging database (or SQL Editor) to verify that the schema
-- required by backend/index.js and the auth RPC callers is actually installed.
-- This file does not modify any database objects or user data.

do $$
declare
  v_missing text[] := array[]::text[];
  v_has_token_version boolean;
  v_token_version_default text;
  v_required_functions text[] := array[
    'issue_password_reset_token',
    'consume_password_reset_token',
    'issue_email_verification_token',
    'consume_email_verification_token'
  ];
  v_function text;
begin
  select exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'users'
       and column_name = 'token_version'
       and data_type in ('integer', 'bigint')
       and is_nullable = 'NO'
  ) into v_has_token_version;

  select column_default
    into v_token_version_default
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'users'
     and column_name = 'token_version';

  if not v_has_token_version then
    v_missing := array_append(v_missing,
      'public.users.token_version (NOT NULL integer/bigint required by requireAuth)');
  end if;

  if v_token_version_default is null
     or v_token_version_default not like '%0%' then
    v_missing := array_append(v_missing,
      'public.users.token_version DEFAULT 0');
  end if;

  foreach v_function in array v_required_functions loop
    if not exists (
      select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = v_function
    ) then
      v_missing := array_append(v_missing,
        format('public.%s(...) RPC', v_function));
    end if;
  end loop;

  if cardinality(v_missing) > 0 then
    raise exception E'AUTH SCHEMA CONTRACT FAILED:\n - %',
      array_to_string(v_missing, E'\n - ');
  end if;

  raise notice 'AUTH SCHEMA CONTRACT PASSED: token_version and all four auth RPCs exist.';
end;
$$;
