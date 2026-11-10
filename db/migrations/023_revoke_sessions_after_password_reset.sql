-- 023_revoke_sessions_after_password_reset.sql
-- A per-user token version invalidates every previously issued JWT after reset.
-- Existing JWTs without the claim are treated as version 0 until the first reset.

alter table public.users
  add column if not exists token_version integer not null default 0;

create or replace function public.consume_password_reset_token(
  p_token_hash text,
  p_password_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_token public.auth_tokens%rowtype;
  v_user_id text;
  v_updated integer;
begin
  if p_token_hash is null or length(p_token_hash) <> 64
     or p_password_hash is null or length(p_password_hash) < 20 then
    return false;
  end if;

  select user_id
    into v_user_id
    from public.auth_tokens
   where token_hash = p_token_hash
     and purpose = 'password_reset'
     and used_at is null
     and expires_at > now();

  if not found then
    return false;
  end if;

  perform 1
    from public.users
   where id::text = v_user_id
   for update;

  if not found then
    return false;
  end if;

  select *
    into v_token
    from public.auth_tokens
   where token_hash = p_token_hash
     and purpose = 'password_reset'
     and used_at is null
     and expires_at > now()
   for update;

  if not found then
    return false;
  end if;

  update public.users
     set password_hash = p_password_hash,
         token_version = coalesce(token_version, 0) + 1
   where id::text = v_token.user_id::text;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return false;
  end if;

  update public.auth_tokens
     set used_at = now()
   where id = v_token.id
     and used_at is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'password reset token could not be consumed';
  end if;

  return true;
end;
$$;

revoke all on function public.consume_password_reset_token(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_password_reset_token(text, text)
  to service_role;
