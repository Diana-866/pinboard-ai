-- 026_pinterest_refresh_token_lease.sql
-- Serialize refresh-token rotation across backend instances. The lease is short
-- and self-expiring so a crashed process cannot permanently block reconnects.
create table if not exists public.pinterest_token_refresh_leases (
  user_id text primary key,
  lease_id uuid not null,
  lease_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pinterest_token_refresh_leases enable row level security;
revoke all on public.pinterest_token_refresh_leases from public, anon, authenticated;
grant select, insert, update, delete on public.pinterest_token_refresh_leases to service_role;

create or replace function public.acquire_pinterest_token_refresh_lease(
  p_user_id text,
  p_lease_id uuid,
  p_lease_seconds integer default 30
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acquired boolean := false;
begin
  insert into public.pinterest_token_refresh_leases(user_id, lease_id, lease_until, updated_at)
  values (
    p_user_id,
    p_lease_id,
    now() + make_interval(secs => greatest(10, least(coalesce(p_lease_seconds, 30), 60))),
    now()
  )
  on conflict (user_id) do update
    set lease_id = excluded.lease_id,
        lease_until = excluded.lease_until,
        updated_at = now()
    where public.pinterest_token_refresh_leases.lease_until < now()
  returning true into v_acquired;
  return coalesce(v_acquired, false);
end;
$$;

create or replace function public.release_pinterest_token_refresh_lease(
  p_user_id text,
  p_lease_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.pinterest_token_refresh_leases
    where user_id = p_user_id and lease_id = p_lease_id;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

revoke all on function public.acquire_pinterest_token_refresh_lease(text,uuid,integer) from public, anon, authenticated;
revoke all on function public.release_pinterest_token_refresh_lease(text,uuid) from public, anon, authenticated;
grant execute on function public.acquire_pinterest_token_refresh_lease(text,uuid,integer) to service_role;
grant execute on function public.release_pinterest_token_refresh_lease(text,uuid) to service_role;
