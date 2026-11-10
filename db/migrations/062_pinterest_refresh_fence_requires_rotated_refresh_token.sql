-- 062_pinterest_refresh_fence_requires_rotated_refresh_token.sql
-- A new access token alone cannot prove that an ambiguous refresh-token rotation
-- was recovered. Keep the uncertainty fence until a fresh refresh token arrives.

create or replace function public.reset_pinterest_refresh_state_on_token_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- Pinterest refresh rotation must replace the refresh token itself. An OAuth
  -- reconnect that omits refresh_token may preserve an old, already-rotated
  -- value; changing access_token alone must not make that credential reusable.
  if new.refresh_token is not null
     and new.refresh_token is distinct from old.refresh_token then
    new.refresh_state := 'ready';
  end if;
  return new;
end;
$$;

revoke all on function public.reset_pinterest_refresh_state_on_token_change()
  from public, anon, authenticated;

comment on column public.pinterest_accounts.refresh_state is
  'ready: refresh token may be used; uncertain: a refresh request may have rotated it but its response was not durably committed; only a newly persisted refresh token clears uncertainty.';
