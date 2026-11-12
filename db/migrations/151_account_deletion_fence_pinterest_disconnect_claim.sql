-- 151_account_deletion_fence_pinterest_disconnect_claim.sql
-- A stale preflight worker must not revoke Pinterest credentials after its
-- durable job lease has been reclaimed by another worker.
begin;

create or replace function public.disconnect_pinterest_for_account_deletion(
  p_job_id uuid,
  p_claim_token uuid,
  p_user_id uuid
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_request_user_id uuid;
  v_request_id uuid;
  v_step_key text;
  v_job_status text;
  v_claim_token uuid;
  v_lease_expires_at timestamptz;
  v_account_status text;
  v_account record;
  v_count integer := 0;
begin
  if p_job_id is null or p_claim_token is null or p_user_id is null then
    raise exception 'invalid Pinterest account deletion claim';
  end if;

  -- This is a read-only fence, intentionally not a row lock: OAuth callbacks
  -- lock OAuth state before users, while deletion claim/heartbeat use the
  -- owner -> request -> job order. The operation remains idempotent and the
  -- worker renews/checks its lease immediately before and after this RPC.
  select r.user_id, r.id, j.step_key, j.status, j.claim_token,
         j.lease_expires_at
    into v_request_user_id, v_request_id, v_step_key, v_job_status,
         v_claim_token, v_lease_expires_at
    from public.account_deletion_jobs j
    join public.account_deletion_requests r on r.id = j.request_id
   where j.id = p_job_id;

  if not found
     or v_request_user_id is distinct from p_user_id
     or v_step_key is distinct from 'preflight'
     or v_job_status is distinct from 'running'
     or v_claim_token is distinct from p_claim_token
     or v_lease_expires_at is null
     or v_lease_expires_at <= clock_timestamp() then
    return -1;
  end if;

  select account_status into v_account_status
    from public.users
   where id = p_user_id;
  if not found or v_account_status <> 'deletion_pending' then
    return -1;
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
      -- A concurrent disconnect is acceptable only if the same account row
      -- is already disconnected. Any other mismatch fails the transaction.
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
$function$;

revoke all on function public.disconnect_pinterest_for_account_deletion(uuid)
  from public, anon, authenticated, service_role;
drop function public.disconnect_pinterest_for_account_deletion(uuid);

revoke all on function public.disconnect_pinterest_for_account_deletion(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.disconnect_pinterest_for_account_deletion(uuid,uuid,uuid)
  to service_role;

commit;
