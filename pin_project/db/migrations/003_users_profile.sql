-- Миграция 003: профиль пользователя (имя, фамилия) + поля онбординга
-- Supabase Dashboard → SQL Editor → вставить → Run
alter table users add column if not exists name text;
alter table users add column if not exists surname text;
