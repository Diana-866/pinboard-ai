-- 127_account_lifecycle.sql
-- Self-service account data export + account deletion request.
--
-- Scope: let a signed-in user (a) download their own data and (b) request
-- deletion of their account. This migration only ACCEPTS the request and
-- fences the account: it never deletes rows. Physical cleanup of user content
-- and retained financial evidence is a separate, audited worker phase so a
-- single endpoint can never destroy production data by accident.
--
-- Safety notes:
--   * Additive only. No existing row is updated or removed by the DDL below.
--   * Existing users default to account_status = 'active', so nothing changes
--     for current accounts until an explicit deletion request is accepted.
--   * The request RPC runs no network calls; it only touches local rows.
--   * Request acceptance is idempotent: a duplicate call returns the same
--     receipt instead of creating a second request.

begin;

alter table public.users
  add column if not exists account_status text not null default 'active',
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
      check (account_status in ('active', 'deletion_pending', 'deleted'));
  end if;
end $$;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique
    references public.users (id) on delete restrict,
  state text not null default 'pending'
    check (state in ('pending', 'completed', 'canceled')),
  confirmation_method text not null
    check (confirmation_method in ('password_reauth')),
  -- token_version minted together with the request. Every JWT issued before
  -- acceptance carries a lower version and is rejected by requireAuth.
  token_version bigint not null check (token_version > 0),
  requested_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists account_deletion_requests_state_idx
  on public.account_deletion_requests (state, requested_at);

alter table public.account_deletion_requests enable row level security;

-- Reached only through the SECURITY DEFINER RPC below; no direct table access.
revoke all on public.account_deletion_requests
  from public, anon, authenticated;
grant select, insert, update on public.account_deletion_requests
  to service_role;

-- Accept a deletion request for one account and fence future access.
--   * locks the user row first (single writer per account);
--   * rejects unknown / already deleted accounts;
--   * returns the existing receipt when a request is already open;
--   * raises one discrete code per failure so the API can map a stable status.
create or replace function public.request_account_deletion(
  p_user_id uuid,
  p_confirmation_method text default 'password_reauth'
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_user public.users%rowtype;
  v_request public.account_deletion_requests%rowtype;
  v_new_version integer;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_confirmation_method is null
     or p_confirmation_method <> 'password_reauth' then
    raise exception 'unsupported confirmation method';
  end if;

  select * into v_user
    from public.users
   where id = p_user_id
   for update;

  if not found then
    raise exception 'user not found';
  end if;

  if v_user.account_status = 'deleted' then
    raise exception 'account already deleted';
  end if;

  select * into v_request
    from public.account_deletion_requests
   where user_id = p_user_id;

  if found then
    return jsonb_build_object(
      'requestId', v_request.id,
      'state', v_request.state,
      'requestedAt', v_request.requested_at,
      'alreadyRequested', true
    );
  end if;

  v_new_version := coalesce(v_user.token_version, 0) + 1;

  update public.users
     set account_status = 'deletion_pending',
         token_version = v_new_version,
         deletion_requested_at = clock_timestamp()
   where id = p_user_id;

  insert into public.account_deletion_requests
    (user_id, state, confirmation_method, token_version)
  values
    (p_user_id, 'pending', p_confirmation_method, v_new_version)
  returning * into v_request;

  return jsonb_build_object(
    'requestId', v_request.id,
    'state', v_request.state,
    'requestedAt', v_request.requested_at,
    'alreadyRequested', false
  );
end;
$$;

revoke all on function public.request_account_deletion(uuid,text)
  from public, anon, authenticated;
grant execute on function public.request_account_deletion(uuid,text)
  to service_role;

commit;
