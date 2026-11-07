-- 051_pinterest_schedule_content_snapshot.sql
-- Preserve the approved creative and resolved destination selected at schedule time.
alter table public.pin_schedules
  add column if not exists snapshot_title text,
  add column if not exists snapshot_description text,
  add column if not exists snapshot_image_url text,
  add column if not exists snapshot_destination_url text;

comment on column public.pin_schedules.snapshot_title is
  'Immutable Pinterest title captured when the schedule is created.';
comment on column public.pin_schedules.snapshot_description is
  'Immutable Pinterest description captured when the schedule is created.';
comment on column public.pin_schedules.snapshot_image_url is
  'Immutable public image URL captured when the schedule is created.';
comment on column public.pin_schedules.snapshot_destination_url is
  'Resolved destination link captured at schedule creation, including project website fallback.';
