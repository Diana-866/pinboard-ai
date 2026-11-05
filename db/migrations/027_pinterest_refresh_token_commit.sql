-- 027_pinterest_refresh_token_commit.sql
-- Persist rotated credentials only while the caller still owns a live lease
-- and the account row has not been replaced by a concurrent OAuth reconnect.
create or replace function public.commit_pinterest_token_refresh(
  p_user_id text,
  p_lease_id uuid,
  p_expected_updated_at timestamptz,
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
  v_updated integer := 0;
begin
  if not exists (
    select 1
      from public.pinterest_token_refresh_leases
      where user_id = p_user_id
        and lease_id = p_lease_id
        and lease_until > now()
    for update
  ) then
    return false;
  end if;

  update public.pinterest_accounts
    set access_token = p_access_token,
        refresh_token = p_refresh_token,
        scopes = coalesce(p_scopes, scopes),
        expires_at = p_expires_at,
        updated_at = now()
    where user_id = p_user_id
      and updated_at = p_expected_updated_at;
  get diagnostics v_updated = row_count;

  if v_updated = 1 then
    delete from public.pinterest_token_refresh_leases
      where user_id = p_user_id and lease_id = p_lease_id;
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.commit_pinterest_token_refresh(text,uuid,timestamptz,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.commit_pinterest_token_refresh(text,uuid,timestamptz,text,text,text,timestamptz) to service_role;
