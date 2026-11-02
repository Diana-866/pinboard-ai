-- Заглушка для теста: 005_email_verified.sql добавляет email_verified.
alter table public.users add column if not exists email_verified boolean not null default false;
