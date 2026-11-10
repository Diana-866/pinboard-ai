-- 036_pinterest_refresh_uncertainty_fence.sql
-- Never replay a Pinterest refresh token after an ambiguous network outcome.
-- The marker is written before the outbound request and is cleared only when
-- fresh credentials are committed or an OAuth reconnect replaces credentials.

alter table public.pinterest_accounts
  add column if not exists refresh_state text not null default 'ready';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.pinterest_accounts'::regclass
       and conname = 'pinterest_accounts_refresh_state_check'
  ) then
    alter table public.pinterest_accounts
      add constraint pinterest_accounts_refresh_state_check
      check (refresh_state in ('ready', 'uncertain'));
  end if;
end;
$$;

create index if not exists pinterest_accounts_refresh_uncertain_idx
  on public.pinterest_accounts(user_id, id)
  where refresh_state = 'uncertain' and disconnected_at is null;

create or replace function public.reset_pinterest_refresh_state_on_token_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- The trigger fires only when an UPDATE statement explicitly writes one of
  -- the credential columns. This includes a valid refresh response that keeps
  -- the same refresh token but rotates the access token or its metadata.
  new.refresh_state := 'ready';
  return new;
end;
$$;

drop trigger if exists pinterest_accounts_reset_refresh_state on public.pinterest_accounts;
create trigger pinterest_accounts_reset_refresh_state
before update of access_token, refresh_token on public.pinterest_accounts
for each row
execute function public.reset_pinterest_refresh_state_on_token_change();

revoke all on function public.reset_pinterest_refresh_state_on_token_change() from public, anon, authenticated;

comment on column public.pinterest_accounts.refresh_state is
  'ready: refresh token may be used; uncertain: a refresh request may have rotated it but its response was not durably committed; OAuth reconnect required.';
