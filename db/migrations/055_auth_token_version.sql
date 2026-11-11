-- 055_auth_token_version.sql
-- Add the session-revocation counter consumed by backend requireAuth.
-- Existing accounts start at version 0; password-reset RPCs must increment it
-- atomically when they change a password (their deployed definitions are audited separately).

alter table public.users
  add column if not exists token_version integer;

update public.users
   set token_version = 0
 where token_version is null;

alter table public.users
  alter column token_version set default 0,
  alter column token_version set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.users'::regclass
       and conname = 'users_token_version_nonnegative'
  ) then
    alter table public.users
      add constraint users_token_version_nonnegative
      check (token_version >= 0);
  end if;
end;
$$;
