-- 130_account_deletion_durable_queue.sql
-- Durable, leased orchestration for accepted account-deletion requests.
-- This migration does not erase user data or call external providers.
begin;

create table if not exists public.account_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.account_deletion_requests(id) on delete restrict,
  step_key text not null check (step_key in ('preflight')),
  status text not null default 'pending'
    check (status in ('pending','running','retry_wait','blocked','succeeded')),
  attempts integer not null default 0 check (attempts >= 0),
  claim_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  safe_error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (request_id, step_key),
  check ((status = 'running' and claim_token is not null and lease_expires_at is not null)
      or status <> 'running')
);

create table if not exists public.account_deletion_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.account_deletion_requests(id) on delete restrict,
  event_key text not null,
  actor_class text not null check (actor_class in ('user','system','worker','operator')),
  reason_code text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (request_id, event_key)
);

create index if not exists account_deletion_jobs_due_idx
  on public.account_deletion_jobs(next_attempt_at, created_at)
  where status in ('pending','retry_wait');
create index if not exists account_deletion_jobs_expired_lease_idx
  on public.account_deletion_jobs(lease_expires_at)
  where status = 'running';

alter table public.account_deletion_jobs enable row level security;
alter table public.account_deletion_events enable row level security;

revoke all on public.account_deletion_jobs from public, anon, authenticated, service_role;
revoke all on public.account_deletion_events from public, anon, authenticated, service_role;
revoke all on sequence public.account_deletion_events_id_seq from public, anon, authenticated, service_role;

create or replace function public.prevent_account_deletion_event_mutation()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'account deletion events are append-only';
end;
$$;

drop trigger if exists account_deletion_events_immutable on public.account_deletion_events;
create trigger account_deletion_events_immutable
before update or delete on public.account_deletion_events
for each row execute function public.prevent_account_deletion_event_mutation();

-- Backfill one durable preflight job for requests accepted before this migration.
insert into public.account_deletion_jobs(request_id, step_key)
select id, 'preflight'
  from public.account_deletion_requests
 where state = 'pending'
on conflict (request_id, step_key) do nothing;

create or replace function public.request_account_deletion(
  p_user_id uuid,
  p_confirmation_method text,
  p_expected_token_version bigint
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user public.users%rowtype;
  v_request public.account_deletion_requests%rowtype;
  v_new_version bigint;
begin
  if p_user_id is null then raise exception 'p_user_id is required'; end if;
  if p_confirmation_method is distinct from 'password_reauth' then
    raise exception 'unsupported confirmation method';
  end if;
  if p_expected_token_version is null or p_expected_token_version < 0 then
    raise exception 'expected token version is required';
  end if;

  select * into v_user from public.users where id = p_user_id for update;
  if not found then raise exception 'user not found'; end if;
  if v_user.account_status = 'deleted' then raise exception 'account already deleted'; end if;

  select * into v_request from public.account_deletion_requests where user_id = p_user_id;
  if found then
    if v_request.state = 'pending' then
      insert into public.account_deletion_jobs(request_id, step_key)
      values (v_request.id, 'preflight')
      on conflict (request_id, step_key) do nothing;
    end if;
    return jsonb_build_object(
      'requestId', v_request.id, 'state', v_request.state,
      'requestedAt', v_request.requested_at, 'alreadyRequested', true
    );
  end if;

  if coalesce(v_user.token_version, 0)::bigint <> p_expected_token_version then
    raise exception 'reauthentication expired';
  end if;
  if v_user.account_status <> 'active' then raise exception 'account is not active'; end if;

  v_new_version := coalesce(v_user.token_version, 0)::bigint + 1;
  update public.users
     set account_status = 'deletion_pending',
         token_version = v_new_version,
         deletion_requested_at = clock_timestamp()
   where id = p_user_id;

  insert into public.account_deletion_requests(user_id,state,confirmation_method,token_version)
  values (p_user_id,'pending',p_confirmation_method,v_new_version)
  returning * into v_request;

  insert into public.account_deletion_jobs(request_id,step_key)
  values (v_request.id,'preflight');

  insert into public.account_deletion_events(request_id,event_key,actor_class,reason_code)
  values (v_request.id,'request_accepted','user','password_reauthentication');

  return jsonb_build_object(
    'requestId', v_request.id, 'state', v_request.state,
    'requestedAt', v_request.requested_at, 'alreadyRequested', false
  );
end;
$$;

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

    -- Global lock order: owner -> request -> job. The preflight operation has
    -- no external side effects, so an expired lease is safe to reclaim.
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
       and j.step_key = 'preflight'
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
  if p_job_id is null or p_claim_token is null
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
           else coalesce(p_error_code, 'preflight_unresolved') end,
         finished_at = case when v_next_status in ('succeeded','blocked')
           then clock_timestamp() else null end,
         updated_at = clock_timestamp()
   where id = p_job_id;

  insert into public.account_deletion_events(request_id,event_key,actor_class,reason_code)
  values (
    v_request_id,
    'preflight_' || v_job.attempts::text || '_' || v_next_status,
    'worker',
    case when v_next_status = 'succeeded' then 'preflight_completed'
         else coalesce(p_error_code, 'preflight_unresolved') end
  ) on conflict (request_id,event_key) do nothing;

  return true;
end;
$$;

revoke all on function public.request_account_deletion(uuid,text,bigint)
  from public, anon, authenticated;
revoke all on function public.claim_account_deletion_jobs(integer,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.finish_account_deletion_job(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.request_account_deletion(uuid,text,bigint) to service_role;
grant execute on function public.claim_account_deletion_jobs(integer,integer) to service_role;
grant execute on function public.finish_account_deletion_job(uuid,uuid,text,text) to service_role;
revoke all on function public.prevent_account_deletion_event_mutation() from public, anon, authenticated, service_role;

commit;
