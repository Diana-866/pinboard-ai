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
