-- 087_pinterest_schedule_snapshot_and_pin_retention.sql
-- A queued publication is durable work and must survive edits to its source pin.
-- Protect the approved snapshot and prevent source-pin deletion from cascading
-- away the queue, publication history, or the worker's durable identity.

create or replace function public.guard_pinterest_schedule_snapshot_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  -- Permit a one-time legacy backfill from NULL, but never rewrite a value
  -- already captured by the scheduling flow.
  if (old.snapshot_title is not null and new.snapshot_title is distinct from old.snapshot_title)
     or (old.snapshot_description is not null and new.snapshot_description is distinct from old.snapshot_description)
     or (old.snapshot_image_url is not null and new.snapshot_image_url is distinct from old.snapshot_image_url)
     or (old.snapshot_destination_url is not null and new.snapshot_destination_url is distinct from old.snapshot_destination_url) then
    raise exception 'Pinterest schedule content snapshot is immutable'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_pinterest_schedule_snapshot_immutability()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_pinterest_schedule_snapshot_immutable on public.pin_schedules;
create trigger trg_pinterest_schedule_snapshot_immutable
before update of snapshot_title, snapshot_description, snapshot_image_url, snapshot_destination_url
on public.pin_schedules
for each row execute function public.guard_pinterest_schedule_snapshot_immutability();

-- ON DELETE CASCADE silently removed queued and historical schedules when a
-- local pin was deleted. Retain the pin identity until its schedule history is
-- explicitly purged under a separate retention policy.
alter table public.pin_schedules
  drop constraint if exists pin_schedules_pin_id_fkey;

alter table public.pin_schedules
  add constraint pin_schedules_pin_id_fkey
  foreign key (pin_id) references public.pins(id) on delete restrict;

comment on constraint pin_schedules_pin_id_fkey on public.pin_schedules is
  'Retain source pins while any Pinterest schedule/history references them; never cascade-delete publication work.';
