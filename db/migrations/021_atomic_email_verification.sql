-- 021_atomic_email_verification.sql
-- Consume an email-verification token and mark the account verified atomically.
-- The user row is always locked before the token row, matching password-reset lock order.

create or replace function public.consume_email_verification_token(
  p_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id text;
  v_token public.auth_tokens%rowtype;
  v_verified boolean;
  v_updated integer;
begin
  if p_token_hash is null or length(p_token_hash) <> 64 then
    return false;
  end if;

  select user_id
    into v_user_id
    from public.auth_tokens
   where token_hash = p_token_hash
     and purpose = 'email_verify';

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
     and purpose = 'email_verify'
   for update;

  if not found then
    return false;
  end if;

  select email_verified
    into v_verified
    from public.users
   where id::text = v_token.user_id;

  -- Idempotent success for a link already consumed to verify this account.
  if v_token.used_at is not null then
    return coalesce(v_verified, false);
  end if;

  if v_token.expires_at <= now() then
    return false;
  end if;

  update public.users
     set email_verified = true
   where id::text = v_token.user_id;

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
    raise exception 'email verification token could not be consumed';
  end if;

  return true;
end;
$$;

revoke all on function public.consume_email_verification_token(text)
  from public, anon, authenticated;
grant execute on function public.consume_email_verification_token(text)
  to service_role;
