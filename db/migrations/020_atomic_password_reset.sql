-- 020_atomic_password_reset.sql
-- Consume a password-reset token and change the password in one transaction.
-- A row lock prevents two concurrent requests from using the same token.

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
  v_updated integer;
begin
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
     set password_hash = p_password_hash
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
