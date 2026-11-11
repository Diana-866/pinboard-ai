-- LEGACY / NOT PART OF THE CANONICAL INSTALL: do not run after 001_baseline.sql.
-- The complete current baseline already creates this object's current form.
-- This historical file is retained for reference only; later migrations may
-- have changed its constraints or semantics (notably Pinterest multi-account).
-- Миграция 008: подключение Pinterest API v5 (OAuth) и публикация пинов
-- Запустить в: Supabase Dashboard -> SQL Editor -> New query -> вставить -> Run
-- Идемпотентна: можно запускать повторно. Существующие таблицы НЕ меняются.

-- 1. Подключённые аккаунты Pinterest (одна строка на пользователя)
create table if not exists pinterest_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,                          -- users.id (text — совместимо с uuid и bigint)
  pinterest_user_id text,                         -- id аккаунта в Pinterest
  username text,                                  -- @логин для отображения в кабинете
  access_token text not null,                     -- только на сервере, во фронтенд не отдаётся
  refresh_token text,
  scopes text,                                    -- что именно разрешил пользователь
  expires_at timestamptz,                         -- когда истекает access_token
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Один Pinterest-аккаунт на пользователя: повторное подключение перезаписывает токены
create unique index if not exists uniq_pinterest_accounts_user on pinterest_accounts (user_id);

alter table pinterest_accounts enable row level security;

-- Пользователь видит только свою строку. Бэкенд ходит сервисным ключом и RLS игнорирует.
drop policy if exists pinterest_accounts_select_own on pinterest_accounts;
create policy pinterest_accounts_select_own on pinterest_accounts
  for select using (auth.uid()::text = user_id);

-- 2. Журнал публикаций: защита от двойной публикации одного пина
create table if not exists pinterest_publications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  pin_id uuid not null,                           -- pins.id в PinPosy
  pinterest_pin_id text not null,                 -- id пина в Pinterest
  pinterest_board_id text not null,               -- доска Pinterest
  created_at timestamptz not null default now()
);

-- Один локальный пин публикуется в Pinterest ровно один раз
create unique index if not exists uniq_pinterest_publications_pin on pinterest_publications (pin_id);
create unique index if not exists uniq_pinterest_publications_remote on pinterest_publications (pinterest_pin_id);
create index if not exists idx_pinterest_publications_user on pinterest_publications (user_id, created_at desc);

alter table pinterest_publications enable row level security;

drop policy if exists pinterest_publications_select_own on pinterest_publications;
create policy pinterest_publications_select_own on pinterest_publications
  for select using (auth.uid()::text = user_id);
