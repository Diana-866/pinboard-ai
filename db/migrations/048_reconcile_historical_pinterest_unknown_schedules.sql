-- 048_reconcile_historical_pinterest_unknown_schedules.sql
-- Repair schedules already stranded in unknown before migration 047 was applied.
-- A row is promoted only when both the attempt journal and publication ledger
-- independently agree on owner, pin, account, and the exact remote Pinterest ID.

update public.pin_schedules s
   set status='published',
       pinterest_pin_id=a.pinterest_pin_id,
       published_at=coalesce(s.published_at,a.updated_at,p.updated_at,now()),
       last_error=null,
       next_attempt_at=null,
       updated_at=now()
  from public.pinterest_publish_attempts a
  join public.pinterest_publications p
    on p.user_id=a.user_id
   and p.pin_id=a.pin_id
   and p.pinterest_account_id=a.pinterest_account_id
   and p.pinterest_pin_id=a.pinterest_pin_id
 where s.user_id=a.user_id
   and s.pin_id=a.pin_id
   and s.pinterest_account_id=a.pinterest_account_id
   and s.status='unknown'
   and a.status='published'
   and a.pinterest_pin_id is not null;