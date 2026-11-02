-- Заглушка для теста: 008_pinterest_accounts.sql — аккаунты Pinterest.
create table if not exists public.pinterest_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  pinterest_user_id text,
  username text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.pinterest_accounts enable row level security;
