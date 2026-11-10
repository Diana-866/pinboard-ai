-- LEGACY / NOT PART OF THE CANONICAL INSTALL: do not run after 001_baseline.sql.
-- The complete current baseline already creates this object's current form.
-- This historical file is retained for reference only; later migrations may
-- have changed its constraints or semantics (notably Pinterest multi-account).
-- Миграция 006: подписки и платежи (Prodamus)
-- Запустить в: Supabase Dashboard → SQL Editor → New query → вставить → Run
-- Идемпотентна: можно запускать повторно.

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,                         -- users.id (text — совместимо с uuid и bigint)
  plan text not null,                            -- analytics | start | pro | agency
  status text not null default 'pending',        -- pending | success | canceled | denied | expired
  provider_payment_id text,                      -- order_id в Prodamus (он же ключ идемпотентности)
  amount numeric(12, 2) not null default 0,
  currency text not null default 'rub',          -- rub | usd | eur | kzt
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now()
);

-- Один платёж — одна строка: вебхук может прийти дважды, второй раз ничего не активирует
create unique index if not exists uniq_subscriptions_provider_payment_id
  on subscriptions (provider_payment_id)
  where provider_payment_id is not null;

create index if not exists idx_subscriptions_user on subscriptions (user_id, created_at desc);
create index if not exists idx_subscriptions_status on subscriptions (status);
create index if not exists idx_subscriptions_period_end on subscriptions (user_id, period_end desc);

-- Допустимые значения (идемпотентно)
alter table subscriptions drop constraint if exists subscriptions_plan_check;
alter table subscriptions add constraint subscriptions_plan_check
  check (plan in ('analytics', 'start', 'pro', 'agency'));

alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in ('pending', 'success', 'canceled', 'denied', 'expired'));

-- RLS: таблицу обслуживает только сервисный ключ бэкенда
alter table subscriptions enable row level security;

-- Доступ пользователя к своим подпискам (если понадобится читать из клиента напрямую).
-- Бэкенд ходит сервисным ключом и RLS игнорирует.
drop policy if exists subscriptions_select_own on subscriptions;
create policy subscriptions_select_own on subscriptions
  for select using (auth.uid()::text = user_id);

-- Дата окончания текущего оплаченного периода в users — чтобы кабинет мог показать
-- «активен до …» одним запросом /me, без доп. обращения к subscriptions.
alter table users add column if not exists tariff_period_end timestamptz;
