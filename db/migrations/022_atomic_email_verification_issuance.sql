-- 022_atomic_email_verification_issuance.sql
-- Serialize verification-email issuance per user so parallel requests cannot
-- bypass the five-minute cooldown or leave multiple valid links.

create or replace function public.issue_email_verification_token(
  p_user_id text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_min_interval_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id text;
  v_last_created timestamptz;
begin
  if p_token_hash is null or length(p_token_hash) <> 64
     or p_expires_at is null or p_expires_at <= now()
     or p_min_interval_seconds is null or p_min_interval_seconds < 0
     or p_min_interval_seconds > 3600 then
    return false;
  end if;

  select id::text
    into v_user_id
    from public.users
   where id::text = p_user_id
   for update;

  if not found then
    return false;
  end if;

  select max(created_at)
    into v_last_created
    from public.auth_tokens
   where user_id = v_user_id
     and purpose = 'email_verify';

  if v_last_created is not null
     and v_last_created > now() - make_interval(secs => p_min_interval_seconds) then
    return false;
  end if;

  update public.auth_tokens
     set used_at = now()
   where user_id = v_user_id
     and purpose = 'email_verify'
     and used_at is null;

  insert into public.auth_tokens(user_id, token_hash, purpose, expires_at)
  values (v_user_id, p_token_hash, 'email_verify', p_expires_at);

  return true;
end;
$$;

revoke all on function public.issue_email_verification_token(text, text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.issue_email_verification_token(text, text, timestamptz, integer)
  to service_role;
