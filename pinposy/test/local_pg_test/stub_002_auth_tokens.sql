-- Заглушка для теста (содержимое реальной 002 недоступно — приватный репо).
-- По описанию владельца: таблица auth_tokens.
create table if not exists public.auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null,
  purpose text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.auth_tokens enable row level security;
