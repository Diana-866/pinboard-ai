-- 043_harden_schedule_claim_search_path.sql
-- Migration 034 replaced claim_due_pin_schedules after migration 040 and
-- reset its SECURITY DEFINER search_path to public only. Restore a trusted,
-- catalog-first path without changing the function's business logic or grants.
alter function public.claim_due_pin_schedules(integer)
  set search_path = pg_catalog, public;
