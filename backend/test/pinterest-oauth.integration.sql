-- Run only in disposable PostgreSQL CI after migrations 026-028.
-- Covers stale tabs, single-use callback consumption, disconnect fencing,
-- reconnect generation monotonicity, and password-reset session invalidation.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_generation_a bigint;
  v_generation_b bigint;
  v_generation_c bigint;
  v_generation_d bigint;
  v_attempt_a uuid := gen_random_uuid();
  v_attempt_b uuid := gen_random_uuid();
  v_attempt_c uuid := gen_random_uuid();
  v_attempt_d uuid := gen_random_uuid();
  v_committed boolean;
  v_count integer;
begin
  insert into public.users(id, email, token_version)
  values (v_user, 'pinterest-oauth-' || v_user || '@example.invalid', 0);

  -- Starting a second browser tab supersedes the first attempt.
  v_generation_a := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt_a, 0);
  v_generation_b := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt_b, 0);
  if v_generation_b <= v_generation_a then
    raise exception 'new OAuth attempt did not advance generation';
  end if;

  v_committed := public.commit_pinterest_oauth_attempt(
    v_user::text, v_attempt_a, v_generation_a, 0,
    'pinterest-user-old', 'old_user', 'enc:old-access', 'enc:old-refresh',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_committed is distinct from false then
    raise exception 'superseded OAuth attempt was allowed to commit';
  end if;
  if exists (select 1 from public.pinterest_accounts where user_id = v_user::text) then
    raise exception 'superseded OAuth attempt created an account row';
  end if;

  -- Current attempt commits exactly once; replay cannot overwrite credentials.
  v_committed := public.commit_pinterest_oauth_attempt(
    v_user::text, v_attempt_b, v_generation_b, 0,
    'pinterest-user-current', 'current_user', 'enc:current-access', 'enc:current-refresh',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_committed is distinct from true then
    raise exception 'current OAuth attempt did not commit';
  end if;
  v_committed := public.commit_pinterest_oauth_attempt(
    v_user::text, v_attempt_b, v_generation_b, 0,
    'pinterest-user-replay', 'replay_user', 'enc:replay-access', 'enc:replay-refresh',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_committed is distinct from false then
    raise exception 'OAuth attempt replay was accepted';
  end if;
  if (select username from public.pinterest_accounts where user_id = v_user::text) <> 'current_user' then
    raise exception 'replayed OAuth callback overwrote current credentials';
  end if;

  -- A callback whose exchange is in flight cannot recreate a disconnected account.
  v_generation_c := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt_c, 0);
  if public.disconnect_pinterest_account(v_user::text) is distinct from true then
    raise exception 'disconnect RPC did not report success';
  end if;
  v_committed := public.commit_pinterest_oauth_attempt(
    v_user::text, v_attempt_c, v_generation_c, 0,
    'pinterest-user-after-disconnect', 'resurrected', 'enc:access', 'enc:refresh',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_committed is distinct from false then
    raise exception 'pre-disconnect callback resurrected Pinterest connection';
  end if;
  if exists (select 1 from public.pinterest_accounts where user_id = v_user::text) then
    raise exception 'disconnect left or recreated Pinterest credentials';
  end if;

  -- The generation row must survive disconnect; the next attempt advances it.
  v_generation_d := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt_d, 0);
  if v_generation_d <= v_generation_c then
    raise exception 'OAuth generation reset after disconnect';
  end if;

  -- Password reset invalidates a pending OAuth attempt even without disconnect.
  update public.users set token_version = token_version + 1 where id = v_user;
  v_committed := public.commit_pinterest_oauth_attempt(
    v_user::text, v_attempt_d, v_generation_d, 0,
    'pinterest-user-old-session', 'old_session', 'enc:access2', 'enc:refresh2',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_committed is distinct from false then
    raise exception 'OAuth callback from a revoked session was accepted';
  end if;

  -- A failed/stale callback consumes no current credentials and cannot be replayed.
  select count(*) into v_count from public.pinterest_accounts where user_id = v_user::text;
  if v_count <> 0 then
    raise exception 'stale OAuth callback left credentials after token-version change';
  end if;

  -- RPCs must not be executable by untrusted API roles.
  if has_function_privilege('anon', 'public.begin_pinterest_oauth_attempt(text,uuid,bigint)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.commit_pinterest_oauth_attempt(text,uuid,bigint,bigint,text,text,text,text,text,timestamptz)', 'EXECUTE')
     or has_function_privilege('public', 'public.disconnect_pinterest_account(text)', 'EXECUTE') then
    raise exception 'OAuth lifecycle RPC is executable by an untrusted role';
  end if;

  raise notice 'Pinterest OAuth fencing integration checks passed for user %', v_user;
end;
$$;
