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
