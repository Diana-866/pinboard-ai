-- 138_account_deletion_finalize_tombstone.sql
-- Complete deletion only after all local content and managed Storage objects are gone.
-- Keep the user row as a pseudonymous tombstone for retained financial ledgers.
begin;

alter table public.account_deletion_jobs
  drop constraint if exists account_deletion_jobs_step_key_check;
alter table public.account_deletion_jobs
  add constraint account_deletion_jobs_step_key_check
  check (step_key in ('preflight','erase_content','finalize'));

insert into public.account_deletion_jobs(request_id,step_key)
select request_id,'finalize'
  from public.account_deletion_jobs
 where step_key='erase_content' and status='succeeded'
on conflict (request_id,step_key) do nothing;

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

create or replace function public.list_account_deletion_storage_manifest(
  p_job_id uuid,
  p_claim_token uuid,
  p_limit integer default 100
) returns table(bucket_id text,object_path text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid;
  v_request_id uuid;
  v_job public.account_deletion_jobs%rowtype;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid account deletion Storage manifest limit';
  end if;
  select r.user_id,r.id into v_user_id,v_request_id
    from public.account_deletion_jobs j
    join public.account_deletion_requests r on r.id=j.request_id
   where j.id=p_job_id;
  if not found then raise exception 'account deletion Storage job missing' using errcode='P0002'; end if;
  perform 1 from public.users
   where id=v_user_id and account_status='deletion_pending' for update;
  if not found then raise exception 'account deletion Storage owner fence lost' using errcode='40001'; end if;
  perform 1 from public.account_deletion_requests
   where id=v_request_id and state='pending' for update;
  if not found then raise exception 'account deletion Storage request fence lost' using errcode='40001'; end if;
  select * into v_job from public.account_deletion_jobs
   where id=p_job_id for update;
  if not found or v_job.step_key <> 'erase_content' or v_job.status <> 'running'
     or v_job.claim_token is distinct from p_claim_token
     or v_job.lease_expires_at <= clock_timestamp() then
    raise exception 'account deletion Storage claim lost' using errcode='40001';
  end if;
  return query
    select o.bucket_id,o.object_path
      from public.account_deletion_storage_objects o
     where o.request_id=v_request_id and o.state='pending'
     order by o.object_path
     limit p_limit;
end;
$function$;

create or replace function public.mark_account_deletion_storage_object_deleted(
  p_job_id uuid,
  p_claim_token uuid,
  p_bucket_id text,
  p_object_path text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid;
  v_request_id uuid;
  v_job public.account_deletion_jobs%rowtype;
begin
  select r.user_id,r.id into v_user_id,v_request_id
    from public.account_deletion_jobs j
    join public.account_deletion_requests r on r.id=j.request_id
   where j.id=p_job_id;
  if not found then return false; end if;
  perform 1 from public.users
   where id=v_user_id and account_status='deletion_pending' for update;
  if not found then return false; end if;
  perform 1 from public.account_deletion_requests
   where id=v_request_id and state='pending' for update;
  if not found then return false; end if;
  select * into v_job from public.account_deletion_jobs
   where id=p_job_id for update;
  if not found or v_job.step_key <> 'erase_content' or v_job.status <> 'running'
     or v_job.claim_token is distinct from p_claim_token
     or v_job.lease_expires_at <= clock_timestamp() then
    return false;
  end if;
  if not exists (
    select 1 from public.pin_image_object_lifecycle l
     where l.bucket_id=p_bucket_id and l.object_path=p_object_path and l.state='deleted'
  ) then
    return false;
  end if;
  update public.account_deletion_storage_objects
     set state='deleted',last_error_code=null,updated_at=clock_timestamp()
   where request_id=v_request_id and bucket_id=p_bucket_id
     and object_path=p_object_path and state='pending';
  return found;
end;
$function$;

revoke all on function public.list_account_deletion_storage_manifest(uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.list_account_deletion_storage_manifest(uuid,uuid,integer)
  to service_role;
revoke all on function public.mark_account_deletion_storage_object_deleted(uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.mark_account_deletion_storage_object_deleted(uuid,uuid,text,text)
  to service_role;

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
  if v_content_status <> 'succeeded' then return false; end if;

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
