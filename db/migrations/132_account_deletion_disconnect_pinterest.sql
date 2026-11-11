-- 132_account_deletion_disconnect_pinterest.sql
-- Idempotently revoke all locally stored Pinterest credentials for a fenced account.
-- The existing disconnect RPC owns OAuth-generation and refresh-lease fencing.
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

  select account_status into v_status
    from public.users
   where id = p_user_id
   for update;
  if not found or v_status <> 'deletion_pending' then
    raise exception 'account is not pending deletion';
  end if;

  -- Deterministic account order; each disconnect uses the established OAuth
  -- generation fence and deletes its refresh lease before clearing credentials.
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
      raise exception 'Pinterest account disconnect was not confirmed';
    end if;
  end loop;

  return v_count;
end;
$disconnect_pinterest$;

revoke all on function public.disconnect_pinterest_for_account_deletion(uuid)
  from public, anon, authenticated;
grant execute on function public.disconnect_pinterest_for_account_deletion(uuid)
  to service_role;

commit;
