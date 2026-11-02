-- Заглушка для теста: 004_onboarding.sql добавляет onboarded.
alter table public.users add column if not exists onboarded boolean not null default false;
