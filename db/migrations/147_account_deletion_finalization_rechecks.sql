-- 147_account_deletion_finalization_rechecks.sql
-- Re-check asynchronous and dependent data at the irreversible tombstone boundary.
begin;

create or replace function public.finalize_account_deletion(
  p_job_id uuid,
  p_claim_token uuid
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
  v_content_status text;
begin
  if p_job_id is null or p_claim_token is null then
    raise exception 'invalid account deletion finalization claim';
  end if;

  select r.user_id,r.id into v_user_id,v_request_id
    from public.account_deletion_jobs j
    join public.account_deletion_requests r on r.id=j.request_id
   where j.id=p_job_id;
  if not found then return false; end if;

  -- Global lock order: owner -> request -> job.
  select account_status into v_account_status
    from public.users where id=v_user_id for update;
  if not found or v_account_status <> 'deletion_pending' then return false; end if;

  select state into v_request_state
    from public.account_deletion_requests where id=v_request_id for update;
  if not found or v_request_state <> 'pending' then return false; end if;

  select * into v_job from public.account_deletion_jobs
   where id=p_job_id for update;
  if not found or v_job.step_key <> 'finalize' or v_job.status <> 'running'
     or v_job.claim_token is distinct from p_claim_token
     or v_job.lease_expires_at <= clock_timestamp() then
    return false;
  end if;

  select status into v_content_status
    from public.account_deletion_jobs
   where request_id=v_request_id and step_key='erase_content';
  if not found or v_content_status is distinct from 'succeeded' then return false; end if;

  -- Never mark the account deleted while any managed image is pending or blocked.
  if exists (
    select 1 from public.account_deletion_storage_objects
     where request_id=v_request_id and state <> 'deleted'
  ) then return false; end if;

  -- Fail closed if any known operational or credential-bearing rows survived.
  if exists(select 1 from public.projects where user_id=v_user_id)
     or exists(select 1 from public.pin_schedules where user_id=v_user_id::text)
     or exists(select 1 from public.pin_review_queue where user_id=v_user_id::text)
     or exists(select 1 from public.pinterest_publish_attempts where user_id=v_user_id::text)
     or exists(select 1 from public.pinterest_publications where user_id=v_user_id::text)
     or exists(select 1 from public.pinterest_accounts where user_id=v_user_id::text)
     or exists(select 1 from public.pinterest_token_refresh_leases where user_id=v_user_id::text)
     or exists(select 1 from public.pinterest_oauth_connection_state where user_id=v_user_id::text)
     or exists(select 1 from public.pinterest_account_refresh_leases where user_id=v_user_id::text)
     or exists(select 1 from public.pin_generation_requests where user_id=v_user_id::text)
     or exists(select 1 from public.pin_generation_tasks where user_id=v_user_id::text)
     or exists(select 1 from public.pin_regeneration_requests where user_id=v_user_id::text)
     or exists(select 1 from public.auth_tokens where user_id=v_user_id::text)
     or exists (
       select 1 from public.email_outbox e
       join public.subscriptions s on s.id=e.subscription_id
       where s.user_id=v_user_id::text
     ) then
    return false;
  end if;

  -- Defense in depth: re-check asynchronous financial/provider operations at
  -- the irreversible tombstone boundary. The erasure stage checks these too,
  -- but finalization must never rely on a stale earlier observation.
  if exists (
    select 1 from public.credit_purchases
     where user_id=v_user_id::text and status='pending'
  ) or exists (
    select 1 from public.subscriptions
     where user_id=v_user_id::text and status='pending'
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.pin_generation_credit_reservations
     where user_id=v_user_id::text and status in ('reserved','settling')
  ) or exists (
    select 1 from public.email_outbox e
    join public.subscriptions s on s.id=e.subscription_id
     where s.user_id=v_user_id::text and e.status='sending'
       and e.locked_until > clock_timestamp()
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.pin_generation_requests
     where user_id=v_user_id::text and status='processing'
  ) or exists (
    select 1 from public.pin_generation_tasks
     where user_id=v_user_id::text and status in ('submitting','queued','running','unknown')
  ) or exists (
    select 1 from public.pin_regeneration_requests
     where user_id=v_user_id::text and status in ('processing','unknown')
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.pinterest_publish_attempts
     where user_id=v_user_id::text and status in ('processing','unknown')
  ) or exists (
    select 1 from public.pin_schedules
     where user_id=v_user_id::text and status in ('publishing','unknown')
  ) then
    return false;
  end if;

  -- Projects normally cascade to boards and pins. Explicit checks protect
  -- against orphaned legacy rows or a future FK/schema change.
  if exists (
    select 1 from public.boards b
    join public.projects p on p.id=b.project_id
     where p.user_id=v_user_id
  ) or exists (
    select 1 from public.pins pin
    join public.boards b on b.id=pin.board_id
    join public.projects p on p.id=b.project_id
     where p.user_id=v_user_id
  ) or exists (
    select 1 from public.projects where user_id=v_user_id
  ) then
    return false;
  end if;

  -- Retain the stable user UUID for accounting references, but remove direct
  -- identifiers, credentials, profile data, privileges and unused credits.
  update public.users
     set email='deleted+'||v_user_id::text||'@deleted.invalid',
         password_hash=null,
         credits_balance=0,
         subscription_tier='free',
         is_admin=false,
         name=null,
         surname=null,
         onboarded=false,
         tariff_plan='none',
         email_verified=false,
         tariff_period_end=null,
         account_status='deleted'
   where id=v_user_id;

  update public.account_deletion_requests
     set state='completed',
         completed_at=clock_timestamp(),
         updated_at=clock_timestamp()
   where id=v_request_id;

  update public.account_deletion_jobs
     set status='succeeded',
         claim_token=null,
         lease_expires_at=null,
         safe_error_code=null,
         finished_at=clock_timestamp(),
         updated_at=clock_timestamp()
   where id=p_job_id;

  insert into public.account_deletion_events(request_id,event_key,actor_class,reason_code)
  values(v_request_id,'account_deleted','worker','account_erasure_completed')
  on conflict(request_id,event_key) do nothing;

  return true;
end;
$function$;


revoke all on function public.finalize_account_deletion(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.finalize_account_deletion(uuid,uuid)
  to service_role;

commit;
