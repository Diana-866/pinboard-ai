-- 031_pinterest_account_scoped_foundation.sql
-- Additive foundation for multi-account Pinterest support.
-- This migration deliberately keeps the legacy one-account unique index and
-- legacy RPCs in place. It does not enable multi-account OAuth or publishing.
-- Deploy the matching backend before switching callers to the v2 RPCs.

-- Retain disconnected account identity/history while removing credentials.
alter table public.pinterest_accounts
  add column if not exists disconnected_at timestamptz;

alter table public.pinterest_accounts
  alter column access_token drop not null;

-- Stable identity per PinPosy user. The old unique(user_id) index remains until
-- the backend and all account-scoped RPCs have been deployed.
create unique index if not exists pinterest_accounts_user_external_identity_uidx
  on public.pinterest_accounts(user_id, pinterest_user_id)
  where pinterest_user_id is not null;

create index if not exists pinterest_accounts_active_user_idx
  on public.pinterest_accounts(user_id, created_at desc)
  where disconnected_at is null;

-- Nullable during the compatibility window: existing records are backfilled
-- only after each historical publication/schedule is mapped unambiguously.
alter table public.pinterest_publications
  add column if not exists pinterest_account_id uuid
  references public.pinterest_accounts(id) on delete restrict;

alter table public.pinterest_publish_attempts
  add column if not exists pinterest_account_id uuid
  references public.pinterest_accounts(id) on delete restrict;

alter table public.pin_schedules
  add column if not exists pinterest_account_id uuid
  references public.pinterest_accounts(id) on delete restrict;

create index if not exists pinterest_publications_account_idx
  on public.pinterest_publications(pinterest_account_id, created_at desc)
  where pinterest_account_id is not null;

create index if not exists pinterest_publish_attempts_account_idx
  on public.pinterest_publish_attempts(pinterest_account_id, updated_at desc)
  where pinterest_account_id is not null;

create index if not exists pin_schedules_account_due_idx
  on public.pin_schedules(pinterest_account_id, status, scheduled_at)
  where pinterest_account_id is not null;

-- A refresh lease belongs to one connected Pinterest identity, not to the
-- whole PinPosy user. This allows independent refresh-token rotation.
create table if not exists public.pinterest_account_refresh_leases (
  pinterest_account_id uuid primary key
    references public.pinterest_accounts(id) on delete cascade,
  user_id text not null,
  lease_id uuid not null,
  lease_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pinterest_account_refresh_leases_expiry_idx
  on public.pinterest_account_refresh_leases(lease_until);

alter table public.pinterest_account_refresh_leases enable row level security;
revoke all on public.pinterest_account_refresh_leases from public, anon, authenticated;
revoke all on public.pinterest_account_refresh_leases from service_role;
grant select, insert, update, delete on public.pinterest_account_refresh_leases to service_role;

create or replace function public.acquire_pinterest_account_refresh_lease(
  p_user_id text,
  p_pinterest_account_id uuid,
  p_lease_id uuid,
  p_lease_seconds integer default 30
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_acquired boolean := false;
begin
  if not exists (
    select 1 from public.pinterest_accounts
     where id = p_pinterest_account_id
       and user_id = p_user_id
       and disconnected_at is null
       and access_token is not null
  ) then
    return false;
  end if;

  insert into public.pinterest_account_refresh_leases(
    pinterest_account_id, user_id, lease_id, lease_until, updated_at
  ) values (
    p_pinterest_account_id,
    p_user_id,
    p_lease_id,
    now() + make_interval(secs => greatest(10, least(coalesce(p_lease_seconds, 30), 60))),
    now()
  )
  on conflict (pinterest_account_id) do update
    set user_id = excluded.user_id,
        lease_id = excluded.lease_id,
        lease_until = excluded.lease_until,
        updated_at = now()
    where public.pinterest_account_refresh_leases.lease_until < now()
      and public.pinterest_account_refresh_leases.user_id = p_user_id
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

create or replace function public.release_pinterest_account_refresh_lease(
  p_user_id text,
  p_pinterest_account_id uuid,
  p_lease_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.pinterest_account_refresh_leases
   where pinterest_account_id = p_pinterest_account_id
     and user_id = p_user_id
     and lease_id = p_lease_id;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

create or replace function public.commit_pinterest_account_token_refresh(
  p_user_id text,
  p_pinterest_account_id uuid,
  p_lease_id uuid,
  p_expected_updated_at timestamptz,
  p_access_token text,
  p_refresh_token text,
  p_scopes text,
  p_expires_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated integer := 0;
  v_lease_id uuid;
begin
  select lease_id into v_lease_id
    from public.pinterest_account_refresh_leases
   where pinterest_account_id = p_pinterest_account_id
     and user_id = p_user_id
     and lease_until > now()
   for update;

  if not found or v_lease_id <> p_lease_id then
    return false;
  end if;

  update public.pinterest_accounts
     set access_token = p_access_token,
         refresh_token = p_refresh_token,
         scopes = coalesce(p_scopes, scopes),
         expires_at = p_expires_at,
         updated_at = now()
   where id = p_pinterest_account_id
     and user_id = p_user_id
     and disconnected_at is null
     and access_token is not null
     and updated_at = p_expected_updated_at;

  get diagnostics v_updated = row_count;

  if v_updated = 1 then
    delete from public.pinterest_account_refresh_leases
     where pinterest_account_id = p_pinterest_account_id
       and user_id = p_user_id
       and lease_id = p_lease_id;
    return true;
  end if;

  return false;
end;
$$;

-- Soft-disconnect exactly one account. The user-level OAuth generation fence
-- is advanced first, matching the lock order used by the OAuth callback.
create or replace function public.disconnect_pinterest_account_v2(
  p_user_id text,
  p_pinterest_account_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated integer := 0;
begin
  if not exists (
    select 1 from public.pinterest_accounts
     where id = p_pinterest_account_id
       and user_id = p_user_id
       and disconnected_at is null
  ) then
    return false;
  end if;

  insert into public.pinterest_oauth_connection_state (
    user_id, generation, current_attempt_id, token_version, attempt_expires_at, updated_at
  ) values (
    p_user_id, 1, null, null, null, now()
  )
  on conflict (user_id) do update
    set generation = public.pinterest_oauth_connection_state.generation + 1,
        current_attempt_id = null,
        token_version = null,
        attempt_expires_at = null,
        updated_at = now();

  update public.pinterest_accounts
     set access_token = null,
         refresh_token = null,
         expires_at = null,
         disconnected_at = now(),
         updated_at = now()
   where id = p_pinterest_account_id
     and user_id = p_user_id
     and disconnected_at is null;

  get diagnostics v_updated = row_count;

  delete from public.pinterest_account_refresh_leases
   where pinterest_account_id = p_pinterest_account_id
     and user_id = p_user_id;

  return v_updated = 1;
end;
$$;

revoke all on function public.acquire_pinterest_account_refresh_lease(text,uuid,uuid,integer)
  from public, anon, authenticated;
revoke all on function public.release_pinterest_account_refresh_lease(text,uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.commit_pinterest_account_token_refresh(text,uuid,uuid,timestamptz,text,text,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.disconnect_pinterest_account_v2(text,uuid)
  from public, anon, authenticated;

grant execute on function public.acquire_pinterest_account_refresh_lease(text,uuid,uuid,integer) to service_role;
grant execute on function public.release_pinterest_account_refresh_lease(text,uuid,uuid) to service_role;
grant execute on function public.commit_pinterest_account_token_refresh(text,uuid,uuid,timestamptz,text,text,text,timestamptz) to service_role;
grant execute on function public.disconnect_pinterest_account_v2(text,uuid) to service_role;
