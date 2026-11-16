-- CI inline assertion: refresh uncertainty is cleared only by a new refresh token.
do $body$
declare
  v_account_id uuid;
  v_state text;
begin
  insert into public.pinterest_accounts(
    user_id, pinterest_user_id, username, access_token, refresh_token
  ) values (
    'refresh-fence-test', 'pinterest-refresh-fence-test', 'refresh-fence-test',
    'access-before', 'refresh-before'
  ) returning id into v_account_id;

  update public.pinterest_accounts
     set refresh_state = 'uncertain'
   where id = v_account_id;
  update public.pinterest_accounts
     set username = 'still-uncertain'
   where id = v_account_id;
  select refresh_state into v_state
    from public.pinterest_accounts where id = v_account_id;
  if v_state <> 'uncertain' then
    raise exception 'ordinary account update cleared refresh uncertainty';
  end if;

  update public.pinterest_accounts
     set access_token = 'access-reconnected', refresh_token = 'refresh-before'
   where id = v_account_id;
  select refresh_state into v_state
    from public.pinterest_accounts where id = v_account_id;
  if v_state <> 'uncertain' then
    raise exception 'access-token-only replacement cleared refresh uncertainty';
  end if;

  update public.pinterest_accounts
     set refresh_token = 'refresh-after'
   where id = v_account_id;
  select refresh_state into v_state
    from public.pinterest_accounts where id = v_account_id;
  if v_state <> 'ready' then
    raise exception 'new refresh-token replacement did not clear uncertainty';
  end if;
end;
$body$;
