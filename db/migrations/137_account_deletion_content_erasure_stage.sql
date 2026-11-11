-- 137_account_deletion_content_erasure_stage.sql
-- Advance accepted requests from inventory to a separately leased content-erasure stage.
-- Financial evidence and the account tombstone are intentionally retained.
begin;

alter table public.account_deletion_jobs
  add column if not exists storage_manifest_recorded_at timestamptz;

create or replace function public.mark_account_deletion_storage_manifest(
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
begin
  select r.user_id,r.id into v_user_id,v_request_id
    from public.account_deletion_jobs j
    join public.account_deletion_requests r on r.id=j.request_id
   where j.id=p_job_id;
  if not found then return false; end if;

  select account_status into v_account_status
    from public.users where id=v_user_id for update;
  if not found or v_account_status <> 'deletion_pending' then return false; end if;

  select state into v_request_state
    from public.account_deletion_requests where id=v_request_id for update;
  if not found or v_request_state <> 'pending' then return false; end if;

  select * into v_job from public.account_deletion_jobs
   where id=p_job_id for update;
  if not found or v_job.step_key <> 'preflight' or v_job.status <> 'running'
     or v_job.claim_token is distinct from p_claim_token
     or v_job.lease_expires_at <= clock_timestamp()
     or v_job.inventory_recorded_at is null then
    return false;
  end if;

  update public.account_deletion_jobs
     set storage_manifest_recorded_at=clock_timestamp(),
         updated_at=clock_timestamp()
   where id=p_job_id;
  return true;
end;
$function$;

revoke all on function public.mark_account_deletion_storage_manifest(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mark_account_deletion_storage_manifest(uuid,uuid)
  to service_role;

alter table public.account_deletion_jobs
  drop constraint if exists account_deletion_jobs_step_key_check;
alter table public.account_deletion_jobs
  add constraint account_deletion_jobs_step_key_check
  check (step_key in ('preflight','erase_content'));

insert into public.account_deletion_jobs(request_id,step_key)
select request_id,'erase_content'
  from public.account_deletion_jobs
 where step_key='preflight' and status='succeeded'
on conflict (request_id,step_key) do nothing;

create or replace function public.claim_account_deletion_jobs(
  p_limit integer default 5,
  p_lease_seconds integer default 300
) returns table(
  job_id uuid, request_id uuid, user_id uuid, step_key text,
  claim_token uuid, attempts integer, lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_candidate record;
  v_status text;
  v_request_state text;
  v_job public.account_deletion_jobs%rowtype;
  v_claim uuid;
  v_count integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 10
     or p_lease_seconds is null or p_lease_seconds < 60 or p_lease_seconds > 900 then
    raise exception 'invalid account deletion claim parameters';
  end if;

  for v_candidate in
    select r.id as request_id, r.user_id
      from public.account_deletion_requests r
      join public.account_deletion_jobs j on j.request_id = r.id
     where r.state = 'pending'
       and ((j.status in ('pending','retry_wait') and j.next_attempt_at <= clock_timestamp())
         or (j.status = 'running' and j.lease_expires_at <= clock_timestamp()))
     order by r.requested_at, j.created_at
  loop
    exit when v_count >= p_limit;

    -- Global lock order: owner -> request -> job. Each step's database work
    -- is transactional; an expired lease can safely retry the idempotent step.
    select u.account_status into v_status
      from public.users u
     where u.id = v_candidate.user_id
     for update skip locked;
    if not found or v_status <> 'deletion_pending' then continue; end if;

    select r.state into v_request_state
      from public.account_deletion_requests r
     where r.id = v_candidate.request_id
     for update;
    if not found or v_request_state <> 'pending' then continue; end if;

    select j.* into v_job
      from public.account_deletion_jobs j
     where j.request_id = v_candidate.request_id
              and ((j.status in ('pending','retry_wait') and j.next_attempt_at <= clock_timestamp())
         or (j.status = 'running' and j.lease_expires_at <= clock_timestamp()))
     for update skip locked;
    if not found then continue; end if;

    v_claim := gen_random_uuid();
    update public.account_deletion_jobs j
       set status = 'running',
           claim_token = v_claim,
           lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
           attempts = j.attempts + 1,
           started_at = coalesce(j.started_at, clock_timestamp()),
           safe_error_code = null,
           updated_at = clock_timestamp()
     where j.id = v_job.id
    returning * into v_job;

    job_id := v_job.id;
    request_id := v_job.request_id;
    user_id := v_candidate.user_id;
    step_key := v_job.step_key;
    claim_token := v_claim;
    attempts := v_job.attempts;
    lease_expires_at := v_job.lease_expires_at;
    return next;
    v_count := v_count + 1;
  end loop;
end;
$$;

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
    when p_outcome = 'blocked' or v_job.attempts >= 8 then 'blocked'
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

create or replace function public.erase_account_deletion_content(
  p_job_id uuid,
  p_claim_token uuid
) returns jsonb
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
  v_preflight_status text;
  v_schedules integer := 0;
  v_review integer := 0;
  v_publications integer := 0;
  v_generation_tasks integer := 0;
  v_regenerations integer := 0;
  v_generation_requests integer := 0;
  v_auth_tokens integer := 0;
  v_pinterest_accounts integer := 0;
  v_publish_attempts integer := 0;
  v_refresh_leases integer := 0;
  v_oauth_state integer := 0;
  v_account_refresh_leases integer := 0;
  v_email_outbox integer := 0;
  v_projects integer := 0;
begin
  if p_job_id is null or p_claim_token is null then
    raise exception 'invalid account content erasure claim';
  end if;

  select r.user_id,r.id into v_user_id,v_request_id
    from public.account_deletion_jobs j
    join public.account_deletion_requests r on r.id=j.request_id
   where j.id=p_job_id;
  if not found then return jsonb_build_object('erased',false,'reason','job_missing'); end if;

  -- Keep the same lock order used by request/claim/finalize RPCs.
  select u.account_status into v_account_status
    from public.users u where u.id=v_user_id for update;
  if not found or v_account_status <> 'deletion_pending' then
    return jsonb_build_object('erased',false,'reason','account_not_pending');
  end if;

  select r.state into v_request_state
    from public.account_deletion_requests r where r.id=v_request_id for update;
  if not found or v_request_state <> 'pending' then
    return jsonb_build_object('erased',false,'reason','request_not_pending');
  end if;

  select * into v_job from public.account_deletion_jobs
   where id=p_job_id for update;
  if not found or v_job.step_key <> 'erase_content' or v_job.status <> 'running'
     or v_job.claim_token is distinct from p_claim_token
     or v_job.lease_expires_at <= clock_timestamp()
     or v_job.inventory_recorded_at is null
     or v_job.storage_manifest_recorded_at is null then
    return jsonb_build_object('erased',false,'reason','claim_or_manifest_lost');
  end if;

  select status into v_preflight_status
    from public.account_deletion_jobs
   where request_id=v_request_id and step_key='preflight';
  if v_preflight_status <> 'succeeded' then
    return jsonb_build_object('erased',false,'reason','preflight_not_complete');
  end if;

  if not exists (
    select 1 from public.account_deletion_storage_objects
     where request_id=v_request_id
  ) and not exists (
    select 1 from public.projects where user_id=v_user_id
  ) then
    -- Empty accounts are valid. The existence of a completed preflight is the
    -- authorization; an empty manifest does not mean missing preparation.
    null;
  end if;

  -- Remove local operational/user content in dependency order. The durable
  -- Storage manifest was committed before any source rows are removed.
  delete from public.pin_schedules where user_id=v_user_id::text;
  get diagnostics v_schedules = row_count;

  delete from public.pin_review_queue where user_id=v_user_id::text;
  get diagnostics v_review = row_count;

  delete from public.pinterest_publish_attempts where user_id=v_user_id::text;
  get diagnostics v_publish_attempts = row_count;

  delete from public.pinterest_publications where user_id=v_user_id::text;
  get diagnostics v_publications = row_count;

  delete from public.pinterest_token_refresh_leases where user_id=v_user_id::text;
  get diagnostics v_refresh_leases = row_count;

  delete from public.pinterest_oauth_connection_state where user_id=v_user_id::text;
  get diagnostics v_oauth_state = row_count;

  delete from public.pinterest_account_refresh_leases where user_id=v_user_id::text;
  get diagnostics v_account_refresh_leases = row_count;

  -- Email outbox rows contain the recipient address and event payload. Keep
  -- subscription/payment evidence, but remove queued/sent message content.
  delete from public.email_outbox e
   using public.subscriptions s
   where e.subscription_id=s.id and s.user_id=v_user_id::text;
  get diagnostics v_email_outbox = row_count;

  delete from public.pin_generation_tasks where user_id=v_user_id::text;
  get diagnostics v_generation_tasks = row_count;

  delete from public.pin_regeneration_requests where user_id=v_user_id::text;
  get diagnostics v_regenerations = row_count;

  delete from public.pin_generation_requests where user_id=v_user_id::text;
  get diagnostics v_generation_requests = row_count;

  delete from public.auth_tokens where user_id=v_user_id::text;
  get diagnostics v_auth_tokens = row_count;

  delete from public.pinterest_accounts where user_id=v_user_id::text;
  get diagnostics v_pinterest_accounts = row_count;

  delete from public.projects where user_id=v_user_id;
  get diagnostics v_projects = row_count;

  insert into public.account_deletion_events(request_id,event_key,actor_class,reason_code)
  values (v_request_id,'content_erasure_'||v_job.attempts::text,'worker','local_content_erased')
  on conflict (request_id,event_key) do nothing;

  return jsonb_build_object(
    'erased',true,
    'schedules',v_schedules,
    'review_items',v_review,
    'publications',v_publications,
    'generation_tasks',v_generation_tasks,
    'regenerations',v_regenerations,
    'generation_requests',v_generation_requests,
    'auth_tokens',v_auth_tokens,
    'pinterest_accounts',v_pinterest_accounts,
    'pinterest_publish_attempts',v_publish_attempts,
    'token_refresh_leases',v_refresh_leases,
    'oauth_connection_state',v_oauth_state,
    'account_refresh_leases',v_account_refresh_leases,
    'email_outbox',v_email_outbox,
    'projects',v_projects,
    'financial_records_retained',true
  );
end;
$function$;

revoke all on function public.erase_account_deletion_content(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.erase_account_deletion_content(uuid,uuid)
  to service_role;

commit;
