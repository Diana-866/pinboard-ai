-- Run only in disposable PostgreSQL CI after migrations 026-031.
-- Verifies the additive account-scoped refresh/disconnect foundation.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_account uuid;
  v_lease_a uuid := gen_random_uuid();
  v_lease_b uuid := gen_random_uuid();
  v_updated_at timestamptz;
  v_result boolean;
  v_access_token text;
  v_refresh_token text;
  v_disconnected_at timestamptz;
  v_generation bigint;
begin
  insert into public.users(id, email, token_version)
  values (v_user, 'pinterest-account-foundation-' || v_user || '@example.invalid', 0);

  insert into public.pinterest_accounts(
    user_id, pinterest_user_id, username, access_token, refresh_token,
    scopes, expires_at
  ) values (
    v_user::text, 'pinterest-foundation-' || v_user, 'foundation_test',
    'enc:old-access', 'enc:old-refresh', 'boards:read,pins:write',
    now() + interval '1 hour'
  ) returning id, updated_at into v_account, v_updated_at;

  -- A lease is exclusive for this Pinterest account.
  v_result := public.acquire_pinterest_account_refresh_lease(
    v_user::text, v_account, v_lease_a, 30
  );
  if v_result is distinct from true then
    raise exception 'first account refresh lease was not acquired';
  end if;

  v_result := public.acquire_pinterest_account_refresh_lease(
    v_user::text, v_account, v_lease_b, 30
  );
  if v_result is distinct from false then
    raise exception 'concurrent account refresh lease was acquired';
  end if;

  v_result := public.release_pinterest_account_refresh_lease(
    v_user::text, v_account, v_lease_a
  );
  if v_result is distinct from true then
    raise exception 'account refresh lease was not released';
  end if;

  v_result := public.acquire_pinterest_account_refresh_lease(
    v_user::text, v_account, v_lease_b, 30
  );
  if v_result is distinct from true then
    raise exception 'account refresh lease was not reacquired after release';
  end if;

  v_result := public.commit_pinterest_account_token_refresh(
    v_user::text, v_account, v_lease_b, v_updated_at,
    'enc:new-access', 'enc:new-refresh', 'boards:read,pins:write',
    now() + interval '2 hours'
  );
  if v_result is distinct from true then
    raise exception 'account-scoped token refresh did not commit';
  end if;

  select access_token, refresh_token, updated_at
    into v_access_token, v_refresh_token, v_updated_at
    from public.pinterest_accounts
   where id = v_account and user_id = v_user::text;
  if v_access_token <> 'enc:new-access' or v_refresh_token <> 'enc:new-refresh' then
    raise exception 'account-scoped refresh did not persist the rotated credentials';
  end if;

  -- Disconnect must invalidate OAuth attempts, clear credentials, and retain
  -- the stable account row for publication/schedule history.
  v_result := public.disconnect_pinterest_account_v2(v_user::text, v_account);
  if v_result is distinct from true then
    raise exception 'account-scoped disconnect did not report success';
  end if;

  select access_token, refresh_token, disconnected_at
    into v_access_token, v_refresh_token, v_disconnected_at
    from public.pinterest_accounts
   where id = v_account and user_id = v_user::text;
  if not found or v_disconnected_at is null then
    raise exception 'disconnect deleted the account instead of retaining its history';
  end if;
  if v_access_token is not null or v_refresh_token is not null then
    raise exception 'disconnect left usable credentials in the account row';
  end if;

  select generation into v_generation
    from public.pinterest_oauth_connection_state
   where user_id = v_user::text;
  if v_generation < 1 then
    raise exception 'disconnect did not advance the OAuth generation fence';
  end if;

  if has_function_privilege(
       'anon',
       'public.disconnect_pinterest_account_v2(text,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.commit_pinterest_account_token_refresh(text,uuid,uuid,timestamptz,text,text,text,timestamptz)',
       'EXECUTE'
     ) then
    raise exception 'account lifecycle RPC is executable by an untrusted role';
  end if;

  raise notice 'Pinterest account-scoped foundation checks passed for account %', v_account;
end;
$$;
