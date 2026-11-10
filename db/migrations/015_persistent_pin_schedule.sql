-- 015_persistent_pin_schedule.sql
-- Durable publication queue. A scheduled row is NOT a published Pinterest pin.
create table if not exists public.pin_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  pin_id uuid not null references public.pins(id) on delete cascade,
  scheduled_at timestamptz not null,
  timezone text not null default 'Europe/Moscow',
  destination_url text,
  pinterest_board_id text,
  status text not null default 'scheduled'
    check (status in ('scheduled','publishing','published','failed','cancelled')),
  pinterest_pin_id text,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pin_schedules_one_active_per_pin
  on public.pin_schedules(pin_id)
  where status in ('scheduled','publishing','published');

create index if not exists pin_schedules_due_idx
  on public.pin_schedules(status, scheduled_at)
  where status = 'scheduled';

create index if not exists pin_schedules_user_date_idx
  on public.pin_schedules(user_id, scheduled_at desc);

alter table public.pin_schedules enable row level security;
revoke all on public.pin_schedules from public, anon, authenticated;
grant select, insert, update, delete on public.pin_schedules to service_role;
