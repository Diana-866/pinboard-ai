-- LEGACY / NOT PART OF THE CANONICAL INSTALL: do not run after 001_baseline.sql.
-- The complete current baseline already creates this object's current form.
-- This historical file is retained for reference only; later migrations may
-- have changed its constraints or semantics (notably Pinterest multi-account).
-- Миграция 002: одноразовые токены (сброс пароля, будущие подтверждения email)
-- Запустить в: Supabase Dashboard → SQL Editor → New query → вставить → Run

create table if not exists auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,                 -- id пользователя (текст — совместим и с uuid, и с bigint)
  token_hash text not null unique,       -- SHA-256 хэш токена (сам токен в БД не храним)
  purpose text not null default 'password_reset',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_auth_tokens_hash on auth_tokens (token_hash);
create index if not exists idx_auth_tokens_user on auth_tokens (user_id);

-- RLS: таблица обслуживается только сервисным ключом бэкенда
alter table auth_tokens enable row level security;
