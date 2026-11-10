-- A stale refresh worker must not restore credentials after account disconnect.
-- Run after migrations 026-036 in the disposable PostgreSQL integration workflow.
do $body$
declare
  v_user_id text := gen_random_uuid()::text;
  v_account_id uuid;
  v_lease_id uuid := gen_random_uuid();
  v_expected_updated_at timestamptz;
  v_acquired boolean;
  v_disconnected boolean;
  v_committed boolean;
  v_access_token text;
  v_refresh_token text;
  v_disconnected_at timestamptz;
begin
  insert into public.users(email, tariff_plan)
  values ('pinterest-refresh-disconnect-' || v_user_id || '@example.invalid', 'start');

  insert into public.pinterest_accounts(
    user_id, pinterest_user_id, username, access_token, refresh_token, expires_at
  ) values (
    v_user_id, 'refresh-disconnect-' || v_user_id, 'refresh-disconnect',
    'access-before-disconnect', 'refresh-before-disconnect', now() + interval '1 hour'
  ) returning id, updated_at into v_account_id, v_expected_updated_at;

  select public.acquire_pinterest_account_refresh_lease(
    v_user_id, v_account_id, v_lease_id, 30
  ) into v_acquired;
  if not coalesce(v_acquired, false) then
    raise exception 'could not acquire account-scoped refresh lease';
  end if;

  select public.disconnect_pinterest_account_v2(v_user_id, v_account_id)
    into v_disconnected;
  if not coalesce(v_disconnected, false) then
    raise exception 'account disconnect did not succeed';
  end if;

  -- Simulate the original refresh worker returning late from Pinterest.
  select public.commit_pinterest_account_token_refresh(
    v_user_id,
    v_account_id,
    v_lease_id,
    v_expected_updated_at,
    'late-access-token',
    'late-refresh-token',
    'boards:read,pins:write',
    now() + interval '1 hour'
  ) into v_committed;

  if coalesce(v_committed, false) then
    raise exception 'stale refresh worker committed credentials after disconnect';
  end if;

  select access_token, refresh_token, disconnected_at
    into v_access_token, v_refresh_token, v_disconnected_at
    from public.pinterest_accounts
   where id = v_account_id and user_id = v_user_id;

  if not found or v_disconnected_at is null
     or v_access_token is not null or v_refresh_token is not null then
    raise exception 'disconnect did not keep Pinterest credentials cleared';
  end if;

  if exists (
    select 1 from public.pinterest_account_refresh_leases
     where pinterest_account_id = v_account_id
  ) then
    raise exception 'disconnect left a refresh lease active';
  end if;

  delete from public.pinterest_accounts where id = v_account_id;
  delete from public.pinterest_oauth_connection_state where user_id = v_user_id;
  delete from public.users where id::text = v_user_id;
end;
$body$;

-- A lost success response is recoverable by retrying the same database commit.
-- The first commit consumes the lease; the duplicate must not overwrite it.
do $body$
declare
  v_user_id text := gen_random_uuid()::text;
  v_account_id uuid;
  v_lease_id uuid := gen_random_uuid();
  v_expected_updated_at timestamptz;
  v_acquired boolean;
  v_first_commit boolean;
  v_duplicate_commit boolean;
  v_access_token text;
  v_refresh_token text;
  v_state text;
begin
  insert into public.users(email, tariff_plan)
  values ('pinterest-refresh-commit-retry-' || v_user_id || '@example.invalid', 'start');

  insert into public.pinterest_accounts(
    user_id, pinterest_user_id, username, access_token, refresh_token, expires_at
  ) values (
    v_user_id, 'refresh-commit-retry-' || v_user_id, 'refresh-commit-retry',
    'access-before', 'refresh-before', now() + interval '1 hour'
  ) returning id into v_account_id;

  select public.acquire_pinterest_account_refresh_lease(
    v_user_id, v_account_id, v_lease_id, 30
  ) into v_acquired;
  if not coalesce(v_acquired, false) then
    raise exception 'could not acquire lease for commit retry test';
  end if;

  update public.pinterest_accounts
     set refresh_state = 'uncertain', updated_at = clock_timestamp()
   where id = v_account_id and user_id = v_user_id
   returning updated_at into v_expected_updated_at;

  select public.commit_pinterest_account_token_refresh(
    v_user_id, v_account_id, v_lease_id, v_expected_updated_at,
    'access-rotated', 'refresh-rotated', 'boards:read,pins:write',
    now() + interval '1 hour'
  ) into v_first_commit;
  if not coalesce(v_first_commit, false) then
    raise exception 'first rotated-token commit did not succeed';
  end if;

  select public.commit_pinterest_account_token_refresh(
    v_user_id, v_account_id, v_lease_id, v_expected_updated_at,
    'access-rotated', 'refresh-rotated', 'boards:read,pins:write',
    now() + interval '1 hour'
  ) into v_duplicate_commit;
  if coalesce(v_duplicate_commit, false) then
    raise exception 'duplicate commit unexpectedly succeeded after lease consumption';
  end if;

  select access_token, refresh_token, refresh_state
    into v_access_token, v_refresh_token, v_state
    from public.pinterest_accounts
   where id = v_account_id and user_id = v_user_id;

  if v_access_token <> 'access-rotated'
     or v_refresh_token <> 'refresh-rotated'
     or v_state <> 'ready' then
    raise exception 'duplicate commit recovery did not preserve the rotated credential pair';
  end if;

  delete from public.pinterest_accounts where id = v_account_id;
  delete from public.pinterest_oauth_connection_state where user_id = v_user_id;
  delete from public.users where id::text = v_user_id;
end;
$body$;

-- An expired lease may be replaced, but the stale worker must not commit.
-- This is the fencing guarantee for a refresh response arriving after lease expiry.
do $body$
declare
  v_user_id text := gen_random_uuid()::text;
  v_account_id uuid;
  v_old_lease_id uuid := gen_random_uuid();
  v_new_lease_id uuid := gen_random_uuid();
  v_expected_updated_at timestamptz;
  v_old_acquired boolean;
  v_new_acquired boolean;
  v_stale_commit boolean;
  v_access_token text;
  v_refresh_token text;
  v_state text;
begin
  insert into public.users(email, tariff_plan)
  values ('pinterest-refresh-expired-lease-' || v_user_id || '@example.invalid', 'start');

  insert into public.pinterest_accounts(
    user_id, pinterest_user_id, username, access_token, refresh_token, expires_at
  ) values (
    v_user_id, 'refresh-expired-lease-' || v_user_id, 'refresh-expired-lease',
    'access-before-expiry', 'refresh-before-expiry', now() + interval '1 hour'
  ) returning id into v_account_id;

  select public.acquire_pinterest_account_refresh_lease(
    v_user_id, v_account_id, v_old_lease_id, 30
  ) into v_old_acquired;
  if not coalesce(v_old_acquired, false) then
    raise exception 'could not acquire original refresh lease';
  end if;

  update public.pinterest_accounts
     set refresh_state = 'uncertain', updated_at = clock_timestamp()
   where id = v_account_id and user_id = v_user_id
   returning updated_at into v_expected_updated_at;

  update public.pinterest_account_refresh_leases
     set lease_until = now() - interval '1 second'
   where pinterest_account_id = v_account_id
     and user_id = v_user_id
     and lease_id = v_old_lease_id;

  select public.acquire_pinterest_account_refresh_lease(
    v_user_id, v_account_id, v_new_lease_id, 30
  ) into v_new_acquired;
  if not coalesce(v_new_acquired, false) then
    raise exception 'expired refresh lease could not be replaced';
  end if;

  select public.commit_pinterest_account_token_refresh(
    v_user_id, v_account_id, v_old_lease_id, v_expected_updated_at,
    'stale-access-token', 'stale-refresh-token', 'boards:read,pins:write',
    now() + interval '1 hour'
  ) into v_stale_commit;

  if coalesce(v_stale_commit, false) then
    raise exception 'stale worker committed after another lease replaced its lease';
  end if;

  select access_token, refresh_token, refresh_state
    into v_access_token, v_refresh_token, v_state
    from public.pinterest_accounts
   where id = v_account_id and user_id = v_user_id;

  if v_access_token <> 'access-before-expiry'
     or v_refresh_token <> 'refresh-before-expiry'
     or v_state <> 'uncertain' then
    raise exception 'stale worker changed credentials or cleared the uncertainty fence';
  end if;

  perform public.release_pinterest_account_refresh_lease(
    v_user_id, v_account_id, v_new_lease_id
  );

  delete from public.pinterest_accounts where id = v_account_id;
  delete from public.pinterest_oauth_connection_state where user_id = v_user_id;
  delete from public.users where id::text = v_user_id;
end;
$body$;


-- An explicit provider 429 may clear only the exact uncertainty fence it started.
-- A reconnect that replaces credentials while the 429 response is being handled
-- must win; stale cleanup must not touch the newer account row.
do $body$
declare
  v_user_id text := gen_random_uuid()::text;
  v_account_id uuid;
  v_fence_updated_at timestamptz;
  v_restored uuid;
  v_stale_cleanup uuid;
  v_access_token text;
  v_refresh_token text;
  v_state text;
begin
  insert into public.users(email, tariff_plan)
  values ('pinterest-refresh-429-' || v_user_id || '@example.invalid', 'start');

  insert into public.pinterest_accounts(
    user_id, pinterest_user_id, username, access_token, refresh_token, expires_at
  ) values (
    v_user_id, 'refresh-429-' || v_user_id, 'refresh-429',
    'access-before-429', 'refresh-before-429', now() + interval '1 hour'
  ) returning id into v_account_id;

  update public.pinterest_accounts
     set refresh_state = 'uncertain', updated_at = clock_timestamp()
   where id = v_account_id and user_id = v_user_id
   returning updated_at into v_fence_updated_at;

  update public.pinterest_accounts
     set refresh_state = 'ready', updated_at = clock_timestamp()
   where id = v_account_id and user_id = v_user_id
     and updated_at = v_fence_updated_at
     and refresh_state = 'uncertain'
   returning id into v_restored;

  if v_restored is distinct from v_account_id then
    raise exception 'explicit 429 could not safely restore its own uncertainty fence';
  end if;

  update public.pinterest_accounts
     set refresh_state = 'uncertain', updated_at = clock_timestamp()
   where id = v_account_id and user_id = v_user_id
   returning updated_at into v_fence_updated_at;

  -- Simulate a successful reconnect before the old 429 cleanup reaches storage.
  update public.pinterest_accounts
     set access_token = 'access-from-reconnect',
         refresh_token = 'refresh-from-reconnect',
         updated_at = clock_timestamp()
   where id = v_account_id and user_id = v_user_id;

  update public.pinterest_accounts
     set refresh_state = 'ready', updated_at = clock_timestamp()
   where id = v_account_id and user_id = v_user_id
     and updated_at = v_fence_updated_at
     and refresh_state = 'uncertain'
   returning id into v_stale_cleanup;

  if v_stale_cleanup is not null then
    raise exception 'stale 429 cleanup overwrote a newer reconnect';
  end if;

  select access_token, refresh_token, refresh_state
    into v_access_token, v_refresh_token, v_state
    from public.pinterest_accounts
   where id = v_account_id and user_id = v_user_id;

  if v_access_token <> 'access-from-reconnect'
     or v_refresh_token <> 'refresh-from-reconnect'
     or v_state <> 'ready' then
    raise exception 'stale 429 cleanup changed the reconnected account';
  end if;

  delete from public.pinterest_accounts where id = v_account_id;
  delete from public.pinterest_oauth_connection_state where user_id = v_user_id;
  delete from public.users where id::text = v_user_id;
end;
$body$;
