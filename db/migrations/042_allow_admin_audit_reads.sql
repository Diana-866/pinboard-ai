-- 042_allow_admin_audit_reads.sql
-- The service-role key is server-only. Admin reads are exposed only through
-- the authenticated /admin route guarded by requireAdmin.
grant select on public.billing_webhook_exceptions to service_role;
