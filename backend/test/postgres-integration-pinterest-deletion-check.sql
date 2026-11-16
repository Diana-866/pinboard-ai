-- CI inline assertion: Pinterest credentials are disconnected for deletion-pending accounts.
do $body$
declare
  v_user_id uuid;
  v_account_id uuid;
  v_disconnected integer;
  v_access_token text;
  v_refresh_token text;
  v_disconnected_at timestamptz;
begin
  insert into public.users(email, account_status)
  values ('deletion-pinterest-test@example.invalid', 'deletion_pending')
  returning id into v_user_id;

  insert into public.pinterest_accounts(
    user_id, pinterest_user_id, username, access_token, refresh_token
  ) values (
    v_user_id::text, 'deletion-pinterest-user', 'deletion-pinterest-user',
    'encrypted-access-placeholder', 'encrypted-refresh-placeholder'
  ) returning id into v_account_id;

  v_disconnected := public.disconnect_pinterest_for_account_deletion(v_user_id);
  if v_disconnected <> 1 then
    raise exception 'expected one disconnected Pinterest account, got %', v_disconnected;
  end if;

  select access_token, refresh_token, disconnected_at
    into v_access_token, v_refresh_token, v_disconnected_at
    from public.pinterest_accounts where id = v_account_id;

  if v_access_token is not null or v_refresh_token is not null or v_disconnected_at is null then
    raise exception 'Pinterest credentials were not revoked';
  end if;

  if public.disconnect_pinterest_for_account_deletion(v_user_id) <> 0 then
    raise exception 'repeated Pinterest disconnect must be idempotent';
  end if;
end;
$body$;
