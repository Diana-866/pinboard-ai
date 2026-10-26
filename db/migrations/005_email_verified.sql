-- Миграция 005: подтверждение email при регистрации
-- Запустить в: Supabase Dashboard → SQL Editor → New query → вставить → Run

-- Флаг подтверждения. Новые пользователи получают false (default),
-- вход запрещён, пока флаг не станет true (см. backend/auth.js).
alter table users add column if not exists email_verified boolean not null default false;

-- ВАЖНО: все СУЩЕСТВУЮЩИЕ пользователи уже подтвердили почту фактическим входом —
-- отмечаем их подтверждёнными, чтобы никто не потерял доступ к аккаунту.
update users set email_verified = true where email_verified = false;

-- Ускоряет проверку троттлинга повторной отправки письма
-- («не чаще раза в 5 минут») — берём последний токен пользователя по purpose.
create index if not exists idx_auth_tokens_user_purpose on auth_tokens (user_id, purpose);
