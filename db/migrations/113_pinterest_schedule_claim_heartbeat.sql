-- 113_pinterest_schedule_claim_heartbeat.sql
-- Keep a live worker claim fresh so stale recovery cannot classify a long
-- Pinterest preflight/publication as abandoned while its owner is active.
create or replace function public.renew_pin_schedule_claim(
  p_schedule_id uuid,
  p_claim_token uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_renewed boolean := false;
begin
  if p_schedule_id is null or p_claim_token is null then
    return false;
  end if;

  update public.pin_schedules
     set updated_at = clock_timestamp()
   where id = p_schedule_id
     and status = 'publishing'
     and claim_token = p_claim_token;

  get diagnostics v_renewed = row_count;
  return v_renewed;
end;
$$;

revoke all on function public.renew_pin_schedule_claim(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.renew_pin_schedule_claim(uuid,uuid)
  to service_role;
