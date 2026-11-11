-- LEGACY / NOT PART OF THE CANONICAL INSTALL: do not run after 001_baseline.sql.
-- The complete current baseline already creates this object's current form.
-- This historical file is retained for reference only; later migrations may
-- have changed its constraints or semantics (notably Pinterest multi-account).
-- Миграция 003: профиль пользователя (имя, фамилия) + поля онбординга
-- Supabase Dashboard → SQL Editor → вставить → Run
alter table users add column if not exists name text;
alter table users add column if not exists surname text;
