-- 028_pinterest_oauth_attempt_fencing.sql
-- Make OAuth attempts single-use and fence callbacks against disconnect/reconnect.
-- The per-user row is retained after disconnect so its generation never resets.

create table if not exists public.pinterest_oauth_connection_state (
  user_id text primary key,
  generation bigint not null default 0 check (generation >= 0),
  current_attempt_id uuid,
  token_version bigint,
  attempt_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.pinterest_oauth_connection_state enable row level security;
revoke all on public.pinterest_oauth_connection_state from public, anon, authenticated;
grant select, insert, update, delete on public.pinterest_oauth_connection_state to service_role;

create or replace function public.begin_pinterest_oauth_attempt(
  p_user_id text,
  p_attempt_id uuid,
  p_token_version bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_generation bigint;
begin
  insert into public.pinterest_oauth_connection_state (
    user_id, generation, current_attempt_id, token_version, attempt_expires_at, updated_at
  ) values (
    p_user_id, 1, p_attempt_id, p_token_version, now() + interval '15 minutes', now()
  )
  on conflict (user_id) do update
    set generation = public.pinterest_oauth_connection_state.generation + 1,
        current_attempt_id = excluded.current_attempt_id,
        token_version = excluded.token_version,
        attempt_expires_at = excluded.attempt_expires_at,
        updated_at = now()
  returning generation into v_generation;
  return v_generation;
end;
$$;

create or replace function public.commit_pinterest_oauth_attempt(
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
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.pinterest_oauth_connection_state%rowtype;
  v_user_token_version bigint;
begin
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
    return false;
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
    return false;
  end if;

  insert into public.pinterest_accounts (
    user_id, pinterest_user_id, username, access_token, refresh_token,
    scopes, expires_at, updated_at
  ) values (
    p_user_id, p_pinterest_user_id, p_username, p_access_token, p_refresh_token,
    coalesce(p_scopes, ''), p_expires_at, now()
  )
  on conflict (user_id) do update set
    pinterest_user_id = excluded.pinterest_user_id,
    username = excluded.username,
    access_token = excluded.access_token,
    refresh_token = excluded.refresh_token,
    scopes = excluded.scopes,
    expires_at = excluded.expires_at,
    updated_at = now();

  -- Consume the attempt in the same transaction as saving credentials.
  update public.pinterest_oauth_connection_state
    set current_attempt_id = null, token_version = null,
        attempt_expires_at = null, updated_at = now()
    where user_id = p_user_id;
  return true;
end;
$$;

create or replace function public.disconnect_pinterest_account(
  p_user_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pinterest_oauth_connection_state (
    user_id, generation, current_attempt_id, token_version, attempt_expires_at, updated_at
  ) values (p_user_id, 1, null, null, null, now())
  on conflict (user_id) do update
    set generation = public.pinterest_oauth_connection_state.generation + 1,
        current_attempt_id = null,
        token_version = null,
        attempt_expires_at = null,
        updated_at = now();

  delete from public.pinterest_accounts where user_id = p_user_id;
  return true;
end;
$$;

revoke all on function public.begin_pinterest_oauth_attempt(text,uuid,bigint) from public, anon, authenticated;
revoke all on function public.commit_pinterest_oauth_attempt(text,uuid,bigint,bigint,text,text,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.disconnect_pinterest_account(text) from public, anon, authenticated;
grant execute on function public.begin_pinterest_oauth_attempt(text,uuid,bigint) to service_role;
grant execute on function public.commit_pinterest_oauth_attempt(text,uuid,bigint,bigint,text,text,text,text,text,timestamptz) to service_role;
grant execute on function public.disconnect_pinterest_account(text) to service_role;
