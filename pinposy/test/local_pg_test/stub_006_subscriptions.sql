-- Заглушка для теста: 006_subscriptions.sql — таблица подписок.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan text not null,
  status text,
  started_at timestamptz not null default now(),
  expires_at timestamptz
);
alter table public.subscriptions enable row level security;
