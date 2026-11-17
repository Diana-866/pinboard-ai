-- 152_revoke_direct_execution_of_regeneration_reservation_trigger.sql
-- This SECURITY DEFINER function is invoked only by its table trigger.
-- Trigger execution does not require client EXECUTE privileges; revoke the
-- default PUBLIC grant and all explicit client/service-role grants.

begin;

revoke all on function public.release_failed_pin_regeneration_reservation()
  from public, anon, authenticated, service_role;

commit;
