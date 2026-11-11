-- LEGACY / NOT PART OF THE CANONICAL INSTALL: do not run after 001_baseline.sql.
-- The complete current baseline already creates this object's current form.
-- This historical file is retained for reference only; later migrations may
-- have changed its constraints or semantics (notably Pinterest multi-account).
-- Миграция 004: онбординг и тарифные замочки
-- Запустить в: Supabase Dashboard → SQL Editor → New query → вставить → Run
-- Идемпотентна: можно запускать повторно, в том числе поверх ранней версии 004.

-- 1. Флаг онбординга: false у новых пользователей (показываем визард),
--    true выставляется бэкендом после прохождения визарда (PATCH /me/onboarding)
alter table users add column if not exists onboarded boolean not null default false;

-- 2. Тарифный план для «замочков» в кабинете (4 реальных тарифа, как на лендинге):
--    none (не выбран) | analytics (только аналитика) | start | pro | agency
alter table users add column if not exists tariff_plan text not null default 'none';

-- 3. Если применялась ранняя версия 004 с тарифом 'standard' — переносим на 'pro'
update users set tariff_plan = 'pro' where tariff_plan = 'standard';

-- 4. Допустимые значения тарифа (заменяем старый список на актуальный)
alter table users drop constraint if exists users_tariff_plan_check;
alter table users add constraint users_tariff_plan_check
  check (tariff_plan in ('none', 'analytics', 'start', 'pro', 'agency'));
