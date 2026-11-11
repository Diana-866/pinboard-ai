-- 144_account_deletion_stage_completion_guards.sql
-- A queue stage cannot be marked complete unless its durable prerequisites hold.
begin;

create or replace function public.finish_account_deletion_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_error_code text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_request_id uuid;
  v_request_state text;
  v_job public.account_deletion_jobs%rowtype;
  v_next_status text;
  v_delay integer;
begin
  if p_job_id is null or p_claim_token is null or p_outcome is null
     or p_outcome not in ('succeeded','retry','blocked') then
    raise exception 'invalid account deletion job result';
  end if;
  if p_error_code is not null and p_error_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'invalid account deletion error code';
  end if;

  select r.user_id, r.id into v_user_id, v_request_id
    from public.account_deletion_jobs j
    join public.account_deletion_requests r on r.id = j.request_id
   where j.id = p_job_id;
  if not found then return false; end if;

  perform 1 from public.users where id = v_user_id for update;
  if not found then return false; end if;

  select r.state into v_request_state
    from public.account_deletion_requests r
   where r.id = v_request_id for update;
  if not found or v_request_state <> 'pending' then return false; end if;

  select * into v_job from public.account_deletion_jobs
   where id = p_job_id for update;
  if not found or v_job.status <> 'running'
     or v_job.claim_token is distinct from p_claim_token
     or v_job.lease_expires_at <= clock_timestamp() then
    return false;
  end if;

  if p_outcome = 'succeeded' and v_job.step_key = 'preflight'
     and v_job.storage_manifest_recorded_at is null then
    raise exception 'account deletion Storage manifest is required';
  end if;

  if p_outcome = 'succeeded' and v_job.step_key = 'erase_content' then
    if exists (
      select 1 from public.account_deletion_storage_objects
       where request_id=v_request_id and state <> 'deleted'
    ) then return false; end if;
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
  end if;

  v_next_status := case
    when p_outcome = 'succeeded' then 'succeeded'
    when p_outcome = 'blocked'
      or (v_job.step_key = 'preflight' and v_job.attempts >= 8)
      or (v_job.step_key = 'erase_content' and v_job.attempts >= 100)
      or (v_job.step_key = 'finalize' and v_job.attempts >= 8) then 'blocked'
    else 'retry_wait'
  end;
  v_delay := least(3600, 30 * (2 ^ least(v_job.attempts, 7))::integer);

  update public.account_deletion_jobs
     set status = v_next_status,
         claim_token = null,
         lease_expires_at = null,
         next_attempt_at = case when v_next_status = 'retry_wait'
           then clock_timestamp() + make_interval(secs => v_delay)
           else next_attempt_at end,
         safe_error_code = case when v_next_status = 'succeeded' then null
           else coalesce(p_error_code, 'deletion_step_unresolved') end,
         finished_at = case when v_next_status in ('succeeded','blocked')
           then clock_timestamp() else null end,
         updated_at = clock_timestamp()
   where id = p_job_id;

  if p_outcome = 'succeeded' and v_job.step_key = 'preflight' then
    insert into public.account_deletion_jobs(request_id,step_key)
    values (v_request_id,'erase_content')
    on conflict (request_id,step_key) do nothing;
  elsif p_outcome = 'succeeded' and v_job.step_key = 'erase_content' then
    insert into public.account_deletion_jobs(request_id,step_key)
    values (v_request_id,'finalize')
    on conflict (request_id,step_key) do nothing;
  end if;

  insert into public.account_deletion_events(request_id,event_key,actor_class,reason_code)
  values (
    v_request_id,
    v_job.step_key || '_' || v_job.attempts::text || '_' || v_next_status,
    'worker',
    case when v_next_status = 'succeeded' then v_job.step_key || '_completed'
         else coalesce(p_error_code, 'deletion_step_unresolved') end
  ) on conflict (request_id,event_key) do nothing;

  return true;
end;
$$;

revoke all on function public.finish_account_deletion_job(uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.finish_account_deletion_job(uuid,uuid,text,text)
  to service_role;

commit;
