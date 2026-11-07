-- Run only in disposable PostgreSQL CI after migrations 026-032.
-- Exercises identity-based OAuth upsert, reconnect stability and plan caps.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_attempt uuid;
  v_generation bigint;
  v_account_a uuid;
  v_account_a_reconnected uuid;
  v_account_b uuid;
  v_account_c uuid;
  v_result jsonb;
  v_count integer;
  v_refresh_token text;
  v_expires_at timestamptz;
begin
  insert into public.users(id, email, token_version, tariff_plan)
  values (v_user, 'pinterest-multi-oauth-' || v_user || '@example.invalid', 0, 'start');

  -- When successful subscriptions share the same period end, the newest
  -- created_at (then id) must determine the effective plan in both SQL and API.
  insert into public.subscriptions(
    user_id, plan, status, amount, currency, period_start, period_end, created_at
  ) values
    (v_user::text, 'pro', 'success', 0, 'rub', now(), now() + interval '30 days', now() - interval '2 days'),
    (v_user::text, 'start', 'success', 0, 'rub', now(), now() + interval '30 days', now() - interval '1 day');

  -- First Pinterest identity.
  v_attempt := gen_random_uuid();
  v_generation := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt, 0);
  v_result := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt, v_generation, 0,
    'external-a-' || v_user, 'account_a', 'enc:a1', 'enc:ar1',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_result->>'ok' <> 'true' then
    raise exception 'first Pinterest identity was not connected: %', v_result;
  end if;
  v_account_a := (v_result->>'account_id')::uuid;

  -- A second, distinct external identity is allowed up to the plan limit.
  v_attempt := gen_random_uuid();
  v_generation := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt, 0);
  v_result := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt, v_generation, 0,
    'external-b-' || v_user, 'account_b', 'enc:b1', 'enc:br1',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_result->>'ok' <> 'true' then
    raise exception 'second Pinterest identity was not connected: %', v_result;
  end if;
  v_account_b := (v_result->>'account_id')::uuid;

  -- Start plan allows a third distinct identity.
  v_attempt := gen_random_uuid();
  v_generation := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt, 0);
  v_result := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt, v_generation, 0,
    'external-c-' || v_user, 'account_c', 'enc:c1', 'enc:cr1',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_result->>'ok' <> 'true' then
    raise exception 'third Pinterest identity was not allowed on Start: %', v_result;
  end if;
  v_account_c := (v_result->>'account_id')::uuid;

  select count(*) into v_count
    from public.pinterest_accounts
   where user_id = v_user::text
     and disconnected_at is null
     and access_token is not null;
  if v_count <> 3 then
    raise exception 'expected three active Pinterest identities on Start, got %', v_count;
  end if;

  -- Reconnecting identity A updates the same row and does not consume a slot.
  v_attempt := gen_random_uuid();
  v_generation := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt, 0);
  v_result := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt, v_generation, 0,
    'external-a-' || v_user, 'account_a_new', 'enc:a2', 'enc:ar2',
    'boards:read,pins:write', now() + interval '2 hours'
  );
  if v_result->>'ok' <> 'true' then
    raise exception 'reconnecting existing identity incorrectly hit account cap: %', v_result;
  end if;
  v_account_a_reconnected := (v_result->>'account_id')::uuid;
  if v_account_a_reconnected <> v_account_a then
    raise exception 'reconnect changed stable Pinterest account id';
  end if;

  -- Some OAuth responses omit refresh_token and expires_in on reconnect.
  -- Such a response must not erase the last known usable refresh credentials.
  v_attempt := gen_random_uuid();
  v_generation := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt, 0);
  v_result := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt, v_generation, 0,
    'external-a-' || v_user, 'account_a_new', 'enc:a3-no-refresh', null,
    null, null
  );
  if v_result->>'ok' <> 'true' then
    raise exception 'reconnect without rotated refresh token failed: %', v_result;
  end if;
  select refresh_token, expires_at
    into v_refresh_token, v_expires_at
    from public.pinterest_accounts
   where id = v_account_a;
  if v_refresh_token <> 'enc:ar2' or v_expires_at is null then
    raise exception 'reconnect erased existing refresh token or expiry: %, %', v_refresh_token, v_expires_at;
  end if;

  -- OAuth reconnect must clear an in-flight refresh uncertainty fence.
  -- The stale refresh worker must not overwrite the newly reconnected credentials,
  -- even when the OAuth response preserves the previous refresh token.
  <<oauth_refresh_race>>
  declare
    v_refresh_lease uuid := gen_random_uuid();
    v_refresh_expected_updated_at timestamptz;
    v_lease_acquired boolean;
    v_stale_commit boolean;
    v_current_access text;
    v_current_refresh text;
    v_refresh_state text;
  begin
    select public.acquire_pinterest_account_refresh_lease(
      v_user::text, v_account_a, v_refresh_lease, 30
    ) into v_lease_acquired;
    if not coalesce(v_lease_acquired, false) then
      raise exception 'could not acquire refresh lease for OAuth reconnect race';
    end if;

    update public.pinterest_accounts
       set refresh_state = 'uncertain', updated_at = clock_timestamp()
     where id = v_account_a and user_id = v_user::text
     returning updated_at into v_refresh_expected_updated_at;

    v_attempt := gen_random_uuid();
    v_generation := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt, 0);
    v_result := public.commit_pinterest_oauth_attempt_v2(
      v_user::text, v_attempt, v_generation, 0,
      'external-a-' || v_user, 'account_a_reconnected', 'enc:a4-reconnected', null,
      null, null
    );
    if v_result->>'ok' <> 'true' then
      raise exception 'OAuth reconnect failed while refresh was in flight: %', v_result;
    end if;

    select refresh_state, access_token, refresh_token
      into v_refresh_state, v_current_access, v_current_refresh
      from public.pinterest_accounts where id = v_account_a;

    if v_refresh_state <> 'ready'
       or v_current_access <> 'enc:a4-reconnected'
       or v_current_refresh <> 'enc:ar2' then
      raise exception 'OAuth reconnect did not restore ready state and preserve refresh token';
    end if;

    select public.commit_pinterest_account_token_refresh(
      v_user::text, v_account_a, v_refresh_lease, v_refresh_expected_updated_at,
      'enc:stale-refresh-access', 'enc:stale-refresh-token',
      'boards:read,pins:write', now() + interval '1 hour'
    ) into v_stale_commit;

    if coalesce(v_stale_commit, false) then
      raise exception 'stale refresh worker overwrote OAuth reconnect credentials';
    end if;

    select access_token, refresh_token, refresh_state
      into v_current_access, v_current_refresh, v_refresh_state
      from public.pinterest_accounts where id = v_account_a;

    if v_current_access <> 'enc:a4-reconnected'
       or v_current_refresh <> 'enc:ar2'
       or v_refresh_state <> 'ready' then
      raise exception 'stale refresh worker changed credentials after OAuth reconnect';
    end if;

    perform public.release_pinterest_account_refresh_lease(
      v_user::text, v_account_a, v_refresh_lease
    );
  end oauth_refresh_race;

  -- A fourth identity is rejected at the transactional Start-plan cap.
  v_attempt := gen_random_uuid();
  v_generation := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt, 0);
  v_result := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt, v_generation, 0,
    'external-d-' || v_user, 'account_d', 'enc:d1', 'enc:dr1',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_result->>'ok' <> 'false' or v_result->>'reason' <> 'account_limit_reached' then
    raise exception 'fourth Pinterest identity bypassed account cap: %', v_result;
  end if;

  -- Disconnect keeps the stable identity row but removes credentials.
  if public.disconnect_pinterest_account_v2(v_user::text, v_account_a) is distinct from true then
    raise exception 'account-scoped disconnect failed';
  end if;
  if not exists (
    select 1 from public.pinterest_accounts
     where id = v_account_a and user_id = v_user::text
       and disconnected_at is not null
       and access_token is null and refresh_token is null
  ) then
    raise exception 'soft-disconnected account row or credential clearing is missing';
  end if;

  -- Reconnect after disconnect reactivates the same row.
  v_attempt := gen_random_uuid();
  v_generation := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt, 0);
  v_result := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt, v_generation, 0,
    'external-a-' || v_user, 'account_a_returned', 'enc:a3', 'enc:ar3',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_result->>'ok' <> 'true' or (v_result->>'account_id')::uuid <> v_account_a then
    raise exception 'reconnect did not reactivate stable account row: %', v_result;
  end if;

  if has_function_privilege(
       'anon',
       'public.commit_pinterest_oauth_attempt_v2(text,uuid,bigint,bigint,text,text,text,text,text,timestamptz)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.commit_pinterest_oauth_attempt_v2(text,uuid,bigint,bigint,text,text,text,text,text,timestamptz)',
       'EXECUTE'
     ) then
    raise exception 'v2 OAuth commit RPC is executable by untrusted roles';
  end if;

  raise notice 'Pinterest multi-account OAuth checks passed: %, %', v_account_a, v_account_b;
end;
$$;


-- A manual tariff with an explicit expired end date must not authorize OAuth.
-- NULL expiry remains the separate unlimited-manual-grant case.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_attempt uuid := gen_random_uuid();
  v_generation bigint;
  v_result jsonb;
  v_unlimited_user uuid := gen_random_uuid();
  v_unlimited_attempt uuid := gen_random_uuid();
  v_unlimited_generation bigint;
begin
  insert into public.users(id, email, token_version, tariff_plan, tariff_period_end)
  values (
    v_user,
    'pinterest-expired-manual-' || v_user || '@example.invalid',
    0,
    'start',
    now() - interval '1 day'
  );

  v_generation := public.begin_pinterest_oauth_attempt(v_user::text, v_attempt, 0);
  v_result := public.commit_pinterest_oauth_attempt_v2(
    v_user::text, v_attempt, v_generation, 0,
    'expired-manual-' || v_user, 'expired_manual', 'enc:expired', 'enc:refresh',
    'boards:read,pins:write', now() + interval '1 hour'
  );

  if v_result->>'ok' <> 'false' or v_result->>'reason' <> 'plan_required' then
    raise exception 'expired manual tariff incorrectly authorized Pinterest OAuth: %', v_result;
  end if;

  insert into public.users(id, email, token_version, tariff_plan, tariff_period_end)
  values (
    v_unlimited_user,
    'pinterest-unlimited-manual-' || v_unlimited_user || '@example.invalid',
    0,
    'start',
    null
  );
  v_unlimited_generation := public.begin_pinterest_oauth_attempt(
    v_unlimited_user::text, v_unlimited_attempt, 0
  );
  v_result := public.commit_pinterest_oauth_attempt_v2(
    v_unlimited_user::text, v_unlimited_attempt, v_unlimited_generation, 0,
    'unlimited-manual-' || v_unlimited_user, 'unlimited_manual', 'enc:unlimited', 'enc:refresh',
    'boards:read,pins:write', now() + interval '1 hour'
  );
  if v_result->>'ok' <> 'true' then
    raise exception 'unlimited manual tariff was incorrectly rejected: %', v_result;
  end if;
end;
$$;
