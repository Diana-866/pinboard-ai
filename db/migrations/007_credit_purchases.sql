-- LEGACY / NOT PART OF THE CANONICAL INSTALL: do not run after 001_baseline.sql.
-- The complete current baseline already creates this object's current form.
-- This historical file is retained for reference only; later migrations may
-- have changed its constraints or semantics (notably Pinterest multi-account).
-- Миграция 007: разовые покупки пакетов кредитов (Prodamus)
-- Запустить в: Supabase Dashboard → SQL Editor → New query → вставить → Run
-- Идемпотентна: можно запускать повторно.
--
-- Отличие от subscriptions (006): это НЕ подписка, а разовая покупка.
-- Кредиты пакета НЕ СГОРАЮТ: вебхук зачисляет их на users.credits_balance один раз
-- и ставит balance_credited_at — повторные вебхуки баланс не удваивают.

create table if not exists credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,                         -- users.id (text — совместимо с uuid и bigint)
  package_id text not null,                      -- pack_100 | pack_500 | pack_1000 (серверный каталог backend/creditPacks.js)
  pack_title text,                               -- человекочитаемое название пакета на момент покупки
  credits integer not null,                      -- сколько кредитов зачислить (из каталога, не от клиента)
  status text not null default 'pending',        -- pending | success | canceled | denied
  provider_payment_id text,                      -- order_id в Prodamus (он же ключ идемпотентности)
  amount numeric(12, 2) not null default 0,      -- сумма платежа из каталога
  currency text not null default 'rub',
  paid_at timestamptz,                           -- когда пришёл success-вебхук
  balance_credited_at timestamptz,               -- когда кредиты реально зачислены на баланс
  created_at timestamptz not null default now()
);

-- Один платёж — одна строка: вебхук может прийти дважды, второй раз ничего не зачисляет
create unique index if not exists uniq_credit_purchases_provider_payment_id
  on credit_purchases (provider_payment_id)
  where provider_payment_id is not null;

create index if not exists idx_credit_purchases_user on credit_purchases (user_id, created_at desc);
create index if not exists idx_credit_purchases_status on credit_purchases (status);

-- Допустимые значения (идемпотентно)
alter table credit_purchases drop constraint if exists credit_purchases_package_check;
alter table credit_purchases add constraint credit_purchases_package_check
  check (package_id in ('pack_100', 'pack_500', 'pack_1000'));

alter table credit_purchases drop constraint if exists credit_purchases_status_check;
alter table credit_purchases add constraint credit_purchases_status_check
  check (status in ('pending', 'success', 'canceled', 'denied'));

-- RLS: таблицу обслуживает только сервисный ключ бэкенда (RLS сервисным ключом игнорируется)
alter table credit_purchases enable row level security;

drop policy if exists credit_purchases_select_own on credit_purchases;
create policy credit_purchases_select_own on credit_purchases
  for select using (auth.uid()::text = user_id);