-- LEGACY / NOT PART OF THE CANONICAL INSTALL: do not run after 001_baseline.sql.
-- The complete current baseline already creates this object's current form.
-- This historical file is retained for reference only; later migrations may
-- have changed its constraints or semantics (notably Pinterest multi-account).
-- Миграция 005: подтверждение email при регистрации
-- Запустить в: Supabase Dashboard → SQL Editor → New query → вставить → Run
-- Миграция идемпотентна: повторный запуск безопасен.

-- 1) Флаг подтверждения. Новые пользователи получают false (default),
--    вход запрещён, пока флаг не станет true (см. backend/auth.js, /login → 403).
--
--    Бэкфилл существующих пользователей выполняется ТОЛЬКО при первом применении
--    (когда колонки ещё нет). Иначе повторный запуск миграции молча «подтвердил» бы
--    всех новых неподтверждённых пользователей и сломал бы защиту.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'email_verified'
  ) then
    alter table public.users add column email_verified boolean not null default false;

    -- Существующие аккаунты уже работают в сервисе — считаем их подтверждёнными,
    -- чтобы миграция никого не отрезала от кабинета.
    update public.users set email_verified = true;
  end if;
end $$;

-- 2) Индекс для троттлинга повторной отправки письма («не чаще раза в 5 минут»):
--    берём последний токен пользователя по purpose (email_verify).
create index if not exists idx_auth_tokens_user_purpose on auth_tokens (user_id, purpose);

-- 3) Индекс для быстрой выборки неподтверждённых (баннер в кабинете, аудит).
create index if not exists idx_users_email_verified on public.users (email_verified);

-- Проверка после применения:
--   select email_verified, count(*) from users group by 1;
--   \d users           -- колонка email_verified boolean not null default false
