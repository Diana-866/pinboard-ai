-- 040_harden_security_definer_search_paths.sql
-- Keep trusted system objects ahead of application objects for legacy
-- SECURITY DEFINER RPCs. These functions remain server-only; this migration
-- changes name resolution only and does not change their business logic.

alter function public.begin_pinterest_publish(text, uuid, text)
  set search_path = pg_catalog, public;
alter function public.complete_pinterest_publish(text, uuid, text, text)
  set search_path = pg_catalog, public;
alter function public.fail_pinterest_publish(text, uuid, text, boolean)
  set search_path = pg_catalog, public;

alter function public.claim_due_pin_schedules(integer)
  set search_path = pg_catalog, public;

alter function public.acquire_pinterest_token_refresh_lease(text, uuid, integer)
  set search_path = pg_catalog, public;
alter function public.release_pinterest_token_refresh_lease(text, uuid)
  set search_path = pg_catalog, public;

alter function public.commit_pinterest_token_refresh(
  text, uuid, timestamptz, text, text, text, timestamptz
) set search_path = pg_catalog, public;

alter function public.begin_pinterest_oauth_attempt(text, uuid, bigint)
  set search_path = pg_catalog, public;
alter function public.commit_pinterest_oauth_attempt(
  text, uuid, bigint, bigint, text, text, text, text, text, timestamptz
) set search_path = pg_catalog, public;
alter function public.disconnect_pinterest_account(text)
  set search_path = pg_catalog, public;
