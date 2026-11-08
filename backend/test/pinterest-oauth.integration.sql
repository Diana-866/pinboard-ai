-- Run only in disposable PostgreSQL CI after migrations 026-032.
-- Covers stale tabs, single-use callback consumption, disconnect fencing,
-- reconnect generation monotonicity, and password-reset session invalidation.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_generation_a bigint;
  v_generation_b bigint;
  v_generation_c bigint;
  v_generation_d bigint;
  v_generation_e bigint;
  v_generation_f bigint;
  v_attempt_a uuid := gen_random_uuid();
  v_attempt_b uuid := gen_random_uuid();
  v_attempt_c uuid := gen_random_uuid();
  v_attempt_d uuid := gen_random_uuid();
  v_attempt_e uuid := gen_random_uuid();
  v_attempt_f uuid := gen_random_uuid();
  v_committed jsonb;
  v_account_id uuid;
  v_count integer;
begin
  insert into public.users(id, email, token_version, tariff_plan)
  values (v_user, 'pinterest-oauth-' || v_user || '@example.invalid', 0, 'start');

  -- Starting a second browser tab supersedes the first attempt.
  v_generation_a := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt_a, 0);
  v_generation_b := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt_b, 0);
  if v_generation_b <= v_generation_a then
    raise exception 'new OAuth attempt did not advance generation';
  end if;

  v_committed := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt_a, v_generation_a, 0,
    'pinterest-user-old', 'old_user', 'enc:old-access', 'enc:old-refresh',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_committed->>'ok' <> 'false' then
    raise exception 'superseded OAuth attempt was allowed to commit';
  end if;
  if exists (select 1 from public.pinterest_accounts where user_id = v_user::text) then
    raise exception 'superseded OAuth attempt created an account row';
  end if;

  -- Current attempt commits exactly once; replay cannot overwrite credentials.
  v_committed := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt_b, v_generation_b, 0,
    'pinterest-user-current', 'current_user', 'enc:current-access', 'enc:current-refresh',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_committed->>'ok' <> 'true' then
    raise exception 'current OAuth attempt did not commit';
  end if;
  v_committed := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt_b, v_generation_b, 0,
    'pinterest-user-replay', 'replay_user', 'enc:replay-access', 'enc:replay-refresh',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_committed->>'ok' <> 'false' then
    raise exception 'OAuth attempt replay was accepted';
  end if;
  if (select username from public.pinterest_accounts where user_id = v_user::text) <> 'current_user' then
    raise exception 'replayed OAuth callback overwrote current credentials';
  end if;

  -- A callback whose exchange is in flight cannot recreate a disconnected account.
  v_generation_c := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt_c, 0);
  select id into v_account_id from public.pinterest_accounts
   where user_id = v_user::text and pinterest_user_id = 'pinterest-user-current';
  if public.disconnect_pinterest_account_v2(v_user::text, v_account_id) is distinct from true then
    raise exception 'account-scoped disconnect RPC did not report success';
  end if;
  v_committed := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt_c, v_generation_c, 0,
    'pinterest-user-after-disconnect', 'resurrected', 'enc:access', 'enc:refresh',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_committed->>'ok' <> 'false' then
    raise exception 'pre-disconnect callback resurrected Pinterest connection';
  end if;
  if not exists (
    select 1 from public.pinterest_accounts
     where id = v_account_id and disconnected_at is not null
       and access_token is null and refresh_token is null
  ) then
    raise exception 'disconnect did not retain identity with credentials cleared';
  end if;

  -- The generation row must survive disconnect; the next attempt advances it.
  v_generation_d := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt_d, 0);
  if v_generation_d <= v_generation_c then
    raise exception 'OAuth generation reset after disconnect';
  end if;

  -- Reconnect the same Pinterest identity with a fresh attempt. A delayed
  -- callback from the pre-disconnect attempt must not overwrite the new tokens,
  -- username, or stable account row even when it reports the same external ID.
  v_committed := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt_d, v_generation_d, 0,
    'pinterest-user-current', 'reconnected_user', 'enc:reconnected-access', 'enc:reconnected-refresh',
    'boards:read,pins:write', now() + interval '2 hours'
  );
  if v_committed->>'ok' <> 'true'
     or (v_committed->>'account_id')::uuid <> v_account_id then
    raise exception 'fresh reconnect did not restore the stable Pinterest account row: %', v_committed;
  end if;

  v_committed := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt_c, v_generation_c, 0,
    'pinterest-user-current', 'stale_callback_user', 'enc:stale-access', 'enc:stale-refresh',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_committed->>'ok' <> 'false'
     or (select username from public.pinterest_accounts where id = v_account_id) <> 'reconnected_user'
     or (select access_token from public.pinterest_accounts where id = v_account_id) <> 'enc:reconnected-access'
     or (select refresh_token from public.pinterest_accounts where id = v_account_id) <> 'enc:reconnected-refresh'
     or (select disconnected_at from public.pinterest_accounts where id = v_account_id) is not null then
    raise exception 'delayed pre-reconnect callback overwrote the current Pinterest credentials: %', v_committed;
  end if;

  -- Expired attempts cannot commit, even if the signed state is otherwise valid.
  v_generation_e := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt_e, 0);
  update public.pinterest_oauth_connection_state
     set attempt_expires_at = now() - interval '1 second'
   where user_id = v_user::text;
  v_committed := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt_e, v_generation_e, 0,
    'pinterest-user-expired', 'expired_attempt', 'enc:expired-access', 'enc:expired-refresh',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_committed->>'ok' <> 'false' then
    raise exception 'expired OAuth attempt was accepted';
  end if;

  -- Start a fresh current attempt after the expiry test. This isolates the
  -- password-reset assertion from generation/attempt mismatch failures.
  v_generation_f := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt_f, 0);
  if v_generation_f <= v_generation_e then
    raise exception 'new OAuth attempt did not advance generation after expiry test';
  end if;

  -- Password reset invalidates this still-current pending attempt by token_version.
  update public.users set token_version = token_version + 1 where id = v_user;
  v_committed := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt_f, v_generation_f, 0,
    'pinterest-user-old-session', 'old_session', 'enc:access2', 'enc:refresh2',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_committed->>'ok' <> 'false' then
    raise exception 'OAuth callback from a revoked session was accepted';
  end if;

  -- A failed/stale callback consumes no current credentials and cannot be replayed.
  select count(*) into v_count from public.pinterest_accounts
   where user_id = v_user::text
     and disconnected_at is null and access_token is not null;
  if v_count <> 0 then
    raise exception 'stale OAuth callback left active credentials after token-version change';
  end if;

  -- RPCs must not be executable by untrusted API roles.
  if has_function_privilege('anon', 'public.begin_pinterest_oauth_attempt(text,uuid,bigint)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.commit_pinterest_oauth_attempt_v2(text,uuid,bigint,bigint,text,text,text,text,text,timestamptz)', 'EXECUTE')
     or has_function_privilege('anon', 'public.disconnect_pinterest_account_v2(text,uuid)', 'EXECUTE')
     or exists (
       select 1
         from pg_proc p
         cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid in (
          'public.begin_pinterest_oauth_attempt(text,uuid,bigint)'::regprocedure,
          'public.commit_pinterest_oauth_attempt_v2(text,uuid,bigint,bigint,text,text,text,text,text,timestamptz)'::regprocedure,
          'public.disconnect_pinterest_account_v2(text,uuid)'::regprocedure
        )
          and a.grantee = 0
          and a.privilege_type = 'EXECUTE'
     ) then
    raise exception 'OAuth lifecycle RPC is executable by an untrusted role';
  end if;

  if has_table_privilege('anon', 'public.pinterest_oauth_connection_state', 'SELECT')
     or has_table_privilege('authenticated', 'public.pinterest_oauth_connection_state', 'SELECT')
     or has_table_privilege('service_role', 'public.pinterest_oauth_connection_state', 'SELECT')
     or has_table_privilege('service_role', 'public.pinterest_oauth_connection_state', 'INSERT')
     or has_table_privilege('service_role', 'public.pinterest_oauth_connection_state', 'UPDATE')
     or has_table_privilege('service_role', 'public.pinterest_oauth_connection_state', 'DELETE') then
    raise exception 'OAuth connection-state table has direct grants to an API role';
  end if;

  raise notice 'Pinterest OAuth fencing integration checks passed for user %', v_user;
end;
$$;
