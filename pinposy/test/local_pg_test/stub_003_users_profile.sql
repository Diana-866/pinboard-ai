-- Заглушка для теста: 003_users_profile.sql добавляет name, surname.
alter table public.users add column if not exists name text;
alter table public.users add column if not exists surname text;
