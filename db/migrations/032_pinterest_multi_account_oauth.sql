-- 032_pinterest_multi_account_oauth.sql
-- Enable multiple distinct Pinterest identities per PinPosy user.
-- OAuth state remains per PinPosy user (one in-flight link attempt at a time).

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
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state public.pinterest_oauth_connection_state%rowtype;
  v_user_token_version bigint;
  v_user_plan text;
  v_user_period_end timestamptz;
  v_subscription_plan text;
  v_subscription_period_end timestamptz;
  v_effective_plan text;
  v_effective_period_end timestamptz;
  v_active boolean := false;
  v_max_accounts integer;
  v_account_id uuid;
  v_account_active boolean := false;
  v_active_count integer;
begin
  if nullif(trim(coalesce(p_pinterest_user_id, '')), '') is null
     or nullif(trim(coalesce(p_access_token, '')), '') is null then
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

  select coalesce(token_version, 0), coalesce(tariff_plan, 'none'), tariff_period_end
    into v_user_token_version, v_user_plan, v_user_period_end
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

  -- Derive the cap from the locked user + latest successful subscription in
  -- this transaction; do not trust a stale plan value sent by the API server.
  v_effective_plan := lower(trim(coalesce(v_user_plan, 'none')));
  if v_effective_plan = 'standard' then
    v_effective_plan := 'pro';
  elsif v_effective_plan in ('free', '') then
    v_effective_plan := 'none';
  end if;

  if v_effective_plan <> 'none' then
    select plan, period_end
      into v_subscription_plan, v_subscription_period_end
      from public.subscriptions
     where user_id = p_user_id
       and status = 'success'
     order by period_end desc nulls last, created_at desc
     limit 1;

    if found then
      v_effective_plan := lower(trim(coalesce(v_subscription_plan, v_effective_plan)));
      if v_effective_plan = 'standard' then
        v_effective_plan := 'pro';
      elsif v_effective_plan in ('free', '') then
        v_effective_plan := 'none';
      end if;
      v_effective_period_end := coalesce(v_subscription_period_end, v_user_period_end);
      v_active := v_effective_plan <> 'none'
        and (v_effective_period_end is null or v_effective_period_end > now());
    else
      -- Match getTariffState: a manually granted plan without a successful
      -- subscription row is active while users.tariff_plan is not "none".
      v_active := v_effective_plan <> 'none';
    end if;
  end if;

  if not v_active then
    update public.pinterest_oauth_connection_state
       set current_attempt_id = null, token_version = null,
           attempt_expires_at = null, updated_at = now()
     where user_id = p_user_id;
    return jsonb_build_object('ok', false, 'reason', 'plan_required');
  end if;

  v_max_accounts := case v_effective_plan
    when 'analytics' then 1
    when 'start' then 3
    when 'pro' then 10
    when 'agency' then null
    else 0
  end;

  if v_max_accounts = 0 then
    update public.pinterest_oauth_connection_state
       set current_attempt_id = null, token_version = null,
           attempt_expires_at = null, updated_at = now()
     where user_id = p_user_id;
    return jsonb_build_object('ok', false, 'reason', 'plan_required');
  end if;

  -- A reconnect of the same external Pinterest identity reuses its stable row.
  select id, (disconnected_at is null and access_token is not null)
    into v_account_id, v_account_active
    from public.pinterest_accounts
   where user_id = p_user_id
     and pinterest_user_id = p_pinterest_user_id
   for update;

  select count(*)::integer into v_active_count
    from public.pinterest_accounts
   where user_id = p_user_id
     and disconnected_at is null
     and access_token is not null;

  if (v_account_id is null or not coalesce(v_account_active, false))
     and v_max_accounts is not null
     and v_active_count >= v_max_accounts then
    update public.pinterest_oauth_connection_state
       set current_attempt_id = null, token_version = null,
           attempt_expires_at = null, updated_at = now()
     where user_id = p_user_id;
    return jsonb_build_object(
      'ok', false,
      'reason', 'account_limit_reached',
      'active_accounts', v_active_count,
      'max_accounts', v_max_accounts
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

revoke all on function public.commit_pinterest_oauth_attempt_v2(text,uuid,bigint,bigint,text,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.commit_pinterest_oauth_attempt_v2(text,uuid,bigint,bigint,text,text,text,text,text,timestamptz)
  to service_role;

-- Remove the legacy constraint only after the account-aware callback RPC is installed.
drop index if exists public.uniq_pinterest_accounts_user;
