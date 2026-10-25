-- Миграция 004: онбординг и тарифные замочки
-- Запустить в: Supabase Dashboard → SQL Editor → New query → вставить → Run
-- Идемпотентна: можно запускать повторно.

-- 1. Флаг онбординга: false у новых пользователей (показываем визард),
--    true выставляется бэкендом после прохождения визарда (PATCH /me/onboarding)
alter table users add column if not exists onboarded boolean not null default false;

-- 2. Тарифный план для «замочков» в кабинете:
--    none (тариф не выбран) | start | standard | pro
alter table users add column if not exists tariff_plan text not null default 'none';

-- 3. Допустимые значения тарифа (идемпотентно)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_tariff_plan_check' and conrelid = 'users'::regclass
  ) then
    alter table users add constraint users_tariff_plan_check
      check (tariff_plan in ('none', 'start', 'standard', 'pro'));
  end if;
end $$;
