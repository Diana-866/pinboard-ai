-- 129_account_deletion_reauth_version_fence.sql
-- Close the password re-authentication race: a password check is only valid
-- for the exact session/token version read with the password hash.
-- This is an additive RPC contract change; no account data is modified.

begin;

drop function if exists public.request_account_deletion(uuid, text);

create or replace function public.request_account_deletion(
  p_user_id uuid,
  p_confirmation_method text,
  p_expected_token_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user public.users%rowtype;
  v_request public.account_deletion_requests%rowtype;
  v_new_version bigint;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_confirmation_method is null
     or p_confirmation_method <> 'password_reauth' then
    raise exception 'unsupported confirmation method';
  end if;

  if p_expected_token_version is null or p_expected_token_version < 0 then
    raise exception 'expected token version is required';
  end if;

  -- All lifecycle writers lock users first. Password re-authentication must
  -- still match the version observed when the password hash was verified.
  select * into v_user
    from public.users
   where id = p_user_id
   for update;

  if not found then
    raise exception 'user not found';
  end if;

  if v_user.account_status = 'deleted' then
    raise exception 'account already deleted';
  end if;

  select * into v_request
    from public.account_deletion_requests
   where user_id = p_user_id;

  if found then
    return jsonb_build_object(
      'requestId', v_request.id,
      'state', v_request.state,
      'requestedAt', v_request.requested_at,
      'alreadyRequested', true
    );
  end if;

  if coalesce(v_user.token_version, 0)::bigint <> p_expected_token_version then
    raise exception 'reauthentication expired';
  end if;

  if v_user.account_status <> 'active' then
    raise exception 'account is not active';
  end if;

  v_new_version := coalesce(v_user.token_version, 0)::bigint + 1;

  update public.users
     set account_status = 'deletion_pending',
         token_version = v_new_version,
         deletion_requested_at = clock_timestamp()
   where id = p_user_id;

  insert into public.account_deletion_requests
    (user_id, state, confirmation_method, token_version)
  values
    (p_user_id, 'pending', p_confirmation_method, v_new_version)
  returning * into v_request;

  return jsonb_build_object(
    'requestId', v_request.id,
    'state', v_request.state,
    'requestedAt', v_request.requested_at,
    'alreadyRequested', false
  );
end;
$$;

revoke all on function public.request_account_deletion(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.request_account_deletion(uuid, text, bigint)
  to service_role;

commit;
