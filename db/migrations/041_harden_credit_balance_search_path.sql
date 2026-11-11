-- 041_harden_credit_balance_search_path.sql
-- The baseline SECURITY DEFINER balance helper is restricted to service_role,
-- but should also use a trusted catalog-first search path.
alter function public.adjust_credits_balance(text, integer)
  set search_path = pg_catalog, public;
