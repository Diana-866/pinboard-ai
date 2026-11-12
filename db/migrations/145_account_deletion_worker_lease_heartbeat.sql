-- 145_account_deletion_worker_lease_heartbeat.sql
-- Allow a running deletion worker to extend its lease without changing its claim token.
-- A worker that has already lost or expired its lease can never revive it.
begin;

create or replace function public.renew_account_deletion_job_lease(
  p_job_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer default 300
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid;
  v_request_id uuid;
  v_account_status text;
  v_request_state text;
  v_job public.account_deletion_jobs%rowtype;
begin
  if p_job_id is null or p_claim_token is null
     or p_lease_seconds is null or p_lease_seconds < 60 or p_lease_seconds > 900 then
    raise exception 'invalid account deletion lease renewal parameters';
  end if;

  select r.user_id, r.id into v_user_id, v_request_id
    from public.account_deletion_jobs j
    join public.account_deletion_requests r on r.id = j.request_id
   where j.id = p_job_id;
  if not found then return false; end if;

  -- Keep the global lock order used by claim, finish and finalization:
  -- owner -> request -> job.
  select account_status into v_account_status
    from public.users where id = v_user_id for update;
  if not found or v_account_status <> 'deletion_pending' then return false; end if;

  select state into v_request_state
    from public.account_deletion_requests where id = v_request_id for update;
  if not found or v_request_state <> 'pending' then return false; end if;

  select * into v_job
    from public.account_deletion_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'running'
     or v_job.claim_token is distinct from p_claim_token
     or v_job.lease_expires_at is null
     or v_job.lease_expires_at <= clock_timestamp() then
    return false;
  end if;

  update public.account_deletion_jobs
     set lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
         updated_at = clock_timestamp()
   where id = p_job_id
     and status = 'running'
     and claim_token = p_claim_token;

  return found;
end;
$function$;

revoke all on function public.renew_account_deletion_job_lease(uuid,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.renew_account_deletion_job_lease(uuid,uuid,integer)
  to service_role;

commit;
