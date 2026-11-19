-- 164_login_attempt_lockout.sql
-- Durable per-account login lockout.
--
-- Why: /login has two in-memory budgets (per address and, since the §54 change, per account),
-- but an in-memory counter multiplies with the number of instances and resets on every restart,
-- so a distributed password guess against one account had no durable ceiling. This migration adds
-- the durable ceiling and nothing else.
--
-- Safety notes:
--   * Additive only. No existing row is rewritten; the new columns default to "no failures" and
--     "not locked", so every current account keeps working unchanged.
--   * The counters are only touched by the SECURITY DEFINER RPCs below, granted to service_role
--     alone: a customer's own token cannot clear its lock counter.
--   * The lock window is short (15 minutes by default, passed by the caller) on purpose: an
--     account lockout is also a denial-of-service vector against a known address, so it must not
--     be long-lived and it must reset on the first correct password.
--   * record_failed_login returns the new state in one statement, so concurrent guesses cannot
--     each read "attempt number 1" and escape the limit.
--
-- Rollback: drop the three functions and the two columns; the API treats a missing function as
-- "feature not deployed yet" and keeps working with the in-memory limits alone.

begin;

alter table public.users
  add column if not exists failed_login_count integer not null default 0,
  add column if not exists login_locked_until timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'users_failed_login_count_check'
       and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_failed_login_count_check
      check (failed_login_count >= 0);
  end if;
end $$;

create index if not exists users_login_locked_until_idx
  on public.users (login_locked_until)
  where login_locked_until is not null;

-- Current lock state for one address. Unknown addresses answer "not locked" so that the pre-check
-- cannot be used to discover which addresses exist.
create or replace function public.login_lock_state(
  p_email text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user public.users%rowtype;
begin
  if v_email = '' then
    return jsonb_build_object('locked', false, 'failed_attempts', 0, 'retry_after_seconds', 0);
  end if;

  select * into v_user from public.users
   where lower(email) = v_email
   order by created_at nulls last, id
   limit 1;
  if not found then
    return jsonb_build_object('locked', false, 'failed_attempts', 0, 'retry_after_seconds', 0);
  end if;

  if v_user.login_locked_until is not null and v_user.login_locked_until > now() then
    return jsonb_build_object(
      'locked', true,
      'failed_attempts', v_user.failed_login_count,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_user.login_locked_until - now())))::integer)
    );
  end if;

  return jsonb_build_object(
    'locked', false,
    'failed_attempts', v_user.failed_login_count,
    'retry_after_seconds', 0
  );
end;
$$;

-- Count one failed password attempt and lock the account when the ceiling is reached.
-- Returns the resulting state; the caller does not have to read it back (and must not trust a
-- client-supplied count).
create or replace function public.record_failed_login(
  p_email text,
  p_max_attempts integer,
  p_lock_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_max integer := greatest(1, coalesce(p_max_attempts, 5));
  v_lock integer := greatest(1, coalesce(p_lock_seconds, 900));
  v_user public.users%rowtype;
begin
  if v_email = '' then
    return jsonb_build_object('locked', false, 'failed_attempts', 0, 'retry_after_seconds', 0);
  end if;

  -- One statement, so two concurrent failures cannot both read the same previous count.
  update public.users
     set failed_login_count = failed_login_count + 1,
         login_locked_until = case
           when failed_login_count + 1 >= v_max then now() + make_interval(secs => v_lock)
           else login_locked_until
         end
   where id = (
     select id from public.users
      where lower(email) = v_email
      order by created_at nulls last, id
      limit 1
   )
  returning * into v_user;

  if not found then
    -- An unknown address is not an error: the caller must answer the same way as a wrong password.
    return jsonb_build_object('locked', false, 'failed_attempts', 0, 'retry_after_seconds', 0);
  end if;

  if v_user.login_locked_until is not null and v_user.login_locked_until > now() then
    return jsonb_build_object(
      'locked', true,
      'failed_attempts', v_user.failed_login_count,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_user.login_locked_until - now())))::integer)
    );
  end if;

  return jsonb_build_object(
    'locked', false,
    'failed_attempts', v_user.failed_login_count,
    'retry_after_seconds', 0
  );
end;
$$;

-- Forget the failures after a successful login. Locked accounts cannot reach this point, because
-- the password is only compared after the lock check.
create or replace function public.clear_login_failures(
  p_user_id text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.users
     set failed_login_count = 0,
         login_locked_until = null
   where id::text = btrim(coalesce(p_user_id, ''))
     and (failed_login_count <> 0 or login_locked_until is not null);
  return true;
end;
$$;

revoke all on function public.login_lock_state(text) from public, anon, authenticated;
revoke all on function public.record_failed_login(text, integer, integer) from public, anon, authenticated;
revoke all on function public.clear_login_failures(text) from public, anon, authenticated;
grant execute on function public.login_lock_state(text) to service_role;
grant execute on function public.record_failed_login(text, integer, integer) to service_role;
grant execute on function public.clear_login_failures(text) to service_role;

commit;
