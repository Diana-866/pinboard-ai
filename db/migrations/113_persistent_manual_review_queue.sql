-- Durable manual-review queue. This is distinct from pin_schedules:
-- review items are drafts awaiting a human decision and are never auto-published.
create table if not exists public.pin_review_queue (
  id text not null,
  user_id text not null,
  pin_id text null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pin_review_queue_user_id_id_pk primary key (user_id, id),
  constraint pin_review_queue_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint pin_review_queue_id_length check (char_length(id) between 1 and 100)
);

create index if not exists pin_review_queue_user_created_idx
  on public.pin_review_queue (user_id, created_at);

create index if not exists pin_review_queue_pin_idx
  on public.pin_review_queue (user_id, pin_id)
  where pin_id is not null;

alter table public.pin_review_queue enable row level security;
-- The application accesses this table through the backend service-role client.
-- No anon/authenticated policies are intentionally created.
