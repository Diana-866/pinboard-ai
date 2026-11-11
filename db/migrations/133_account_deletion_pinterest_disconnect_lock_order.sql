-- 133_account_deletion_pinterest_disconnect_lock_order.sql
-- Avoid taking the users row lock before the OAuth state row: OAuth callback
-- commits lock OAuth state first and then users. Deletion request already
-- fences callbacks by changing token_version/account_status.
begin;

create or replace function public.disconnect_pinterest_for_account_deletion(
  p_user_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $disconnect_pinterest$
declare
  v_status text;
  v_account record;
  v_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- Read without FOR UPDATE. The deletion request has already transitioned
  -- the account and advanced token_version; taking this lock before the OAuth
  -- state lock would invert the established callback lock order.
  select account_status into v_status
    from public.users
   where id = p_user_id;
  if not found or v_status <> 'deletion_pending' then
    raise exception 'account is not pending deletion';
  end if;

  for v_account in
    select id
      from public.pinterest_accounts
     where user_id = p_user_id::text
       and disconnected_at is null
     order by id
  loop
    if public.disconnect_pinterest_account_v2(p_user_id::text, v_account.id) then
      v_count := v_count + 1;
    else
      -- A concurrent disconnect is an acceptable idempotent outcome only
      -- when the row is already disconnected; any other mismatch fails closed.
      if exists (
        select 1 from public.pinterest_accounts
         where id = v_account.id
           and user_id = p_user_id::text
           and disconnected_at is null
      ) then
        raise exception 'Pinterest account disconnect was not confirmed';
      end if;
    end if;
  end loop;

  return v_count;
end;
$disconnect_pinterest$;

commit;
