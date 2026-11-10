-- 120_harden_manual_review_queue_privileges.sql
-- AUD-309: keep durable manual-review queue data accessible only through the
-- backend service role. RLS without client grants is the explicit boundary.
begin;

alter table public.pin_review_queue enable row level security;

revoke all on table public.pin_review_queue
  from public, anon, authenticated;

grant select, insert, update, delete on table public.pin_review_queue
  to service_role;

commit;
