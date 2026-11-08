-- 088_release_image_credit_reservation_without_image_tasks.sql
-- An ambiguous text-idea request can have no image task plan yet. In that
-- state no billable image-provider submission is possible, so retaining the
-- image-credit reservation forever is unnecessary. Keep reservations fenced
-- whenever even one durable image task exists.
create or replace function public.sync_pin_generation_credit_reservation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    update public.pin_generation_credit_reservations
       set status = 'settled', updated_at = clock_timestamp()
     where user_id = new.user_id and idempotency_key = new.idempotency_key
       and status in ('reserved', 'settling');
  elsif new.status = 'failed' and old.status <> 'failed' then
    update public.pin_generation_credit_reservations
       set status = 'released', updated_at = clock_timestamp()
     where user_id = new.user_id and idempotency_key = new.idempotency_key
       and status = 'reserved';
  elsif new.status = 'unknown' and old.status <> 'unknown'
        and not exists (
          select 1 from public.pin_generation_tasks t
           where t.generation_request_id = new.id
        ) then
    -- The image-task plan is persisted before the first image-provider call.
    -- No task rows therefore prove that this reservation never covered an
    -- image submission. Preserve the request's unknown status (text-provider
    -- outcome may still need reconciliation), but return unused image credits.
    update public.pin_generation_credit_reservations
       set status = 'released', updated_at = clock_timestamp()
     where user_id = new.user_id and idempotency_key = new.idempotency_key
       and status = 'reserved';
  end if;
  return new;
end;
$$;

revoke all on function public.sync_pin_generation_credit_reservation()
  from public, anon, authenticated;
