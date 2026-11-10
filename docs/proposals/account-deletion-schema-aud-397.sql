-- AUD-397 PROPOSAL ONLY — NOT A NUMBERED PRODUCTION MIGRATION.
-- Review against the deployed Supabase catalog and test on disposable PostgreSQL first.
-- Additive schema only: no existing rows are deleted or rewritten.
begin;

alter table public.users
  add column if not exists account_status text not null default 'active',
  add column if not exists lifecycle_version bigint not null default 0,
  add column if not exists deletion_requested_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'users_account_status_check'
       and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_account_status_check
      check (account_status in (
        'active', 'deletion_pending', 'reconciling',
        'cleanup_pending', 'anonymized', 'retained_financial_only'
      ));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'users_lifecycle_version_check'
       and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_lifecycle_version_check
      check (lifecycle_version >= 0);
  end if;
end $$;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique
    references public.users(id) on delete restrict,
  state text not null default 'accepted'
    check (state in (
      'accepted', 'reconciling', 'cleanup_pending',
      'blocked', 'completed', 'completed_with_retention'
    )),
  lifecycle_version bigint not null check (lifecycle_version > 0),
  requested_by text not null
    check (requested_by in ('user', 'operator')),
  confirmation_method text not null
    check (confirmation_method in ('recent_reauth', 'one_time_confirmation', 'operator_review')),
  requested_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  manifest_version integer,
  terminal_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (manifest_version is null or manifest_version > 0)
);

create table if not exists public.account_deletion_events (
  id bigint generated always as identity primary key,
  request_id uuid not null
    references public.account_deletion_requests(id) on delete restrict,
  event_key text not null,
  from_state text,
  to_state text,
  actor_class text not null
    check (actor_class in ('user', 'system', 'worker', 'operator')),
  reason_code text not null,
  lifecycle_version bigint not null check (lifecycle_version > 0),
  created_at timestamptz not null default clock_timestamp(),
  unique (request_id, event_key)
);

create table if not exists public.account_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null
    references public.account_deletion_requests(id) on delete restrict,
  phase smallint not null check (phase between 0 and 10),
  step_key text not null,
  depends_on text[] not null default '{}'::text[],
  status text not null default 'pending'
    check (status in ('pending', 'running', 'retry_wait', 'blocked', 'succeeded', 'skipped')),
  lifecycle_version bigint not null check (lifecycle_version > 0),
  claim_token uuid,
  lease_expires_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default clock_timestamp(),
  safe_error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (request_id, step_key),
  check (
    (status = 'running' and claim_token is not null and lease_expires_at is not null)
    or status <> 'running'
  )
);

create table if not exists public.account_deletion_manifest (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null
    references public.account_deletion_requests(id) on delete restrict,
  manifest_version integer not null check (manifest_version > 0),
  resource_type text not null,
  resource_key text not null,
  owner_proof_source text not null,
  disposition text not null
    check (disposition in (
      'delete', 'anonymize', 'retain_restricted',
      'provider_action', 'backup_expiry', 'manual_review'
    )),
  depends_on text[] not null default '{}'::text[],
  status text not null default 'pending'
    check (status in ('pending', 'running', 'blocked', 'succeeded', 'skipped')),
  claim_token uuid,
  attempts integer not null default 0 check (attempts >= 0),
  safe_error_code text,
  terminal_evidence_ref text,
  retention_until timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (request_id, manifest_version, resource_type, resource_key)
);

create index if not exists account_deletion_requests_state_idx
  on public.account_deletion_requests (state, requested_at);
create index if not exists account_deletion_jobs_due_idx
  on public.account_deletion_jobs (next_attempt_at, phase, created_at)
  where status in ('pending', 'retry_wait');
create index if not exists account_deletion_jobs_lease_idx
  on public.account_deletion_jobs (lease_expires_at)
  where status = 'running';
create index if not exists account_deletion_manifest_pending_idx
  on public.account_deletion_manifest (request_id, manifest_version, status);
create index if not exists account_deletion_manifest_retention_idx
  on public.account_deletion_manifest (retention_until)
  where disposition in ('retain_restricted', 'backup_expiry');

alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_events enable row level security;
alter table public.account_deletion_jobs enable row level security;
alter table public.account_deletion_manifest enable row level security;

-- Access only through narrowly scoped SECURITY DEFINER RPCs added in a later,
-- separately reviewed implementation migration. No direct table access.
revoke all on public.account_deletion_requests from public, anon, authenticated, service_role;
revoke all on public.account_deletion_events from public, anon, authenticated, service_role;
revoke all on public.account_deletion_jobs from public, anon, authenticated, service_role;
revoke all on public.account_deletion_manifest from public, anon, authenticated, service_role;
revoke all on sequence public.account_deletion_events_id_seq from public, anon, authenticated, service_role;

commit;
