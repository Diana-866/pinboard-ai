-- 032_pinterest_multi_account_oauth.sql
-- Enable multiple distinct Pinterest identities per PinPosy user.
-- OAuth state remains per PinPosy user (one in-flight link attempt at a time).

-- Remove the legacy one-account-per-user constraint only after the v2 callback
-- RPC exists in this same migration.
drop index if exists public.uniq_pinterest_accounts_user;

create unique index if not exists pinterest_accounts_user_external_identity_uidx
  on public.pinterest_accounts(user_id, pinterest_user_id)
  where pinterest_user_id is not null;

create or replace function public.commit_pinterest_oauth_attempt_v2(
  p_user_id text,
  p_attempt_id uuid,
  p_generation bigint,
  p_token_version bigint,
  p_pinterest_user_id text,
  p_username text,
  p_access_token text,
  p_refresh_token text,
  p_scopes text,
  p_expires_at timestamptz,
  p_max_accounts integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state public.pinterest_oauth_connection_state%rowtype;
  v_user_token_version bigint;
  v_account_id uuid;
  v_active_count integer;
begin
  if nullif(trim(coalesce(p_pinterest_user_id, '')), '') is null
     or nullif(trim(coalesce(p_access_token, '')), '') is null
     or p_max_accounts is not null and p_max_accounts < 1 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_account');
  end if;

  -- Keep the established OAuth lock order: state row, then PinPosy user row.
  select * into v_state
    from public.pinterest_oauth_connection_state
   where user_id = p_user_id
   for update;

  if not found
    or v_state.generation <> p_generation
    or v_state.current_attempt_id is distinct from p_attempt_id
    or v_state.token_version is distinct from p_token_version
    or v_state.attempt_expires_at is null
    or v_state.attempt_expires_at <= now()
  then
    return jsonb_build_object('ok', false, 'reason', 'stale_attempt');
  end if;

  select coalesce(token_version, 0) into v_user_token_version
    from public.users
   where id::text = p_user_id
   for update;

  if not found or v_user_token_version <> p_token_version then
    update public.pinterest_oauth_connection_state
       set current_attempt_id = null, token_version = null,
           attempt_expires_at = null, updated_at = now()
     where user_id = p_user_id;
    return jsonb_build_object('ok', false, 'reason', 'stale_session');
  end if;

  -- A reconnect of the same external Pinterest identity reuses its stable row.
  select id into v_account_id
    from public.pinterest_accounts
   where user_id = p_user_id
     and pinterest_user_id = p_pinterest_user_id
   for update;

  select count(*)::integer into v_active_count
    from public.pinterest_accounts
   where user_id = p_user_id
     and disconnected_at is null
     and access_token is not null;

  if v_account_id is null
     and p_max_accounts is not null
     and v_active_count >= p_max_accounts then
    update public.pinterest_oauth_connection_state
       set current_attempt_id = null, token_version = null,
           attempt_expires_at = null, updated_at = now()
     where user_id = p_user_id;
    return jsonb_build_object(
      'ok', false,
      'reason', 'account_limit_reached',
      'active_accounts', v_active_count,
      'max_accounts', p_max_accounts
    );
  end if;

  insert into public.pinterest_accounts (
    user_id, pinterest_user_id, username, access_token, refresh_token,
    scopes, expires_at, disconnected_at, updated_at
  ) values (
    p_user_id, p_pinterest_user_id, p_username, p_access_token, p_refresh_token,
    coalesce(p_scopes, ''), p_expires_at, null, now()
  )
  on conflict (user_id, pinterest_user_id)
    where pinterest_user_id is not null
  do update set
    username = excluded.username,
    access_token = excluded.access_token,
    refresh_token = excluded.refresh_token,
    scopes = excluded.scopes,
    expires_at = excluded.expires_at,
    disconnected_at = null,
    updated_at = now()
  returning id into v_account_id;

  -- Consume the attempt in the same transaction as saving credentials.
  update public.pinterest_oauth_connection_state
     set current_attempt_id = null, token_version = null,
         attempt_expires_at = null, updated_at = now()
   where user_id = p_user_id;

  select count(*)::integer into v_active_count
    from public.pinterest_accounts
   where user_id = p_user_id
     and disconnected_at is null
     and access_token is not null;

  return jsonb_build_object(
    'ok', true,
    'account_id', v_account_id,
    'active_accounts', v_active_count
  );
end;
$$;

revoke all on function public.commit_pinterest_oauth_attempt_v2(text,uuid,bigint,bigint,text,text,text,text,text,timestamptz,integer)
  from public, anon, authenticated;
grant execute on function public.commit_pinterest_oauth_attempt_v2(text,uuid,bigint,bigint,text,text,text,text,text,timestamptz,integer)
  to service_role;
