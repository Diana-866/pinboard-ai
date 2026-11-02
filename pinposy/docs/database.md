# База данных PinPosy — порядок применения миграций

Supabase (PostgreSQL). Миграции применяются **вручную**: Supabase Dashboard →
SQL Editor → New query → вставить файл целиком → Run.

## Порядок применения (на пустой базе)

```
000_check_schema.sql        диагностика, ничего не меняет (опционально, можно в любой момент)
001_base_schema.sql         users, projects, boards, pins, credit_transactions, adjust_credits_balance, RLS
002_auth_tokens.sql
003_users_profile.sql
004_onboarding.sql
005_email_verified.sql
006_subscriptions.sql
007_credit_purchases.sql
008_pinterest_accounts.sql
```

Все миграции идемпотентны (`create table if not exists`, `alter table ... add column if not exists`,
`drop policy if exists`): повторный запуск файла целиком не даёт ошибок и не меняет данные.

## Что делает каждая миграция

| Файл | Что делает |
|---|---|
| `001_base_schema.sql` | Базовая схема: таблицы `users`, `projects`, `boards`, `pins`, `credit_transactions`; функция `adjust_credits_balance(p_user_id text, p_amount integer)` (security definer, execute только у `service_role`); RLS на всех таблицах с политиками «только своя строка»; revoke прямого доступа у `anon`/`authenticated`. |
| `002_auth_tokens.sql` | Токены (подтверждение e-mail, сброс пароля) — существующая миграция. |
| `003_users_profile.sql` | Колонки профиля `users.name`, `users.surname` — существующая миграция. |
| `004_onboarding.sql` | Колонка `users.onboarded` — существующая миграция. |
| `005_email_verified.sql` | Колонка `users.email_verified` — существующая миграция. |
| `006_subscriptions.sql` | Подписки (`billing.js`) — существующая миграция. |
| `007_credit_purchases.sql` | Покупки пакетов кредитов (`creditPacks.js`, order_id с префиксом `ppc-`) — существующая миграция. |
| `008_pinterest_accounts.sql` | Аккаунты Pinterest (OAuth) — существующая миграция. |

## Осознанные решения в 001 (почему так)

1. **`name`/`surname`/`onboarded`/`email_verified` в 001 НЕ создаются.**
   Их добавляют 003, 004, 005. Если бы 001 создавал их тоже, повторный запуск
   цепочки мог бы конфликтовать по NOT NULL/DEFAULT, а главное — нарушил бы
   правило «001 не дублирует то, что добавляют поздние миграции». Код
   (`backend/auth.js`, `backend/index.js`) ожидает эти колонки только после
   применения 003–005, что и отражает порядок применения.
2. **`credit_transactions.user_id` — `text`, без FK на `users.id`.**
   `backend/credits.js` вставляет туда text и вызывает
   `rpc("adjust_credits_balance", { p_user_id: <text> })`. `users.id` — uuid,
  FK между text и uuid невозможен без изменения типа существующей колонки
   (запрещено правилом №3). Целостность обеспечивает приложение; для скорости
   поиска по `id::text` в 001 есть выражение-индекс `idx_users_id_text`.
3. **У `credit_transactions.type` нет CHECK-ограничения.** Код и 007 могут
   писать значения за пределами перечня `generation | topup | refund | admin`
   (например, пометки покупок пакетов). CHECK сломал бы существующие записи.
4. **RLS фактически инертен для запросов бэкенда — и это ожидаемо.**
   Авторизация PinPosy — собственный JWT (`jsonwebtoken`), а не Supabase Auth,
   поэтому `auth.uid()` для реальных запросов всегда NULL, и политики
   «auth.uid()::text = user_id» блокируют anon/authenticated. Бэкенд ходит
   сервисным ключом (`SUPABASE_SERVICE_ROLE_KEY`, `backend/supabase.js`),
   который RLS обходит. Политики оставлены как защита от случайного
   клиентского доступа (например, через Supabase REST) и как требование ТЗ.
5. **`boards` и `pins` не имеют `user_id`** — их политики проверяют владельца
   через EXISTS-джойн `pins → boards → projects → users`.
6. **Функция запрещает уход в минус**: при отрицательном `p_amount` и
   нехватке баланса `raise exception 'insufficient credits'`; UPDATE
   атомарный (`update ... returning`), исключение откатывает транзакцию.
   Отдельная ошибка — `user not found: <id>`, чтобы отличать «нет юзера»
   от «нет кредитов».

## Как проверить, что применилось

Запустите `000_check_schema.sql` в SQL Editor:

- **Блок 1** — таблицы `users`, `projects`, `boards`, `pins`,
  `credit_transactions` (+ `auth_tokens`, `subscriptions`, `credit_purchases`,
  `pinterest_accounts` после 002–008), у всех `rls_enabled = true`.
- **Блок 2** — все строки `present = true`. Любая строка `present = false` —
  колонки не хватает, бэкенд по ней может упасть (в колонке `provided_by`
  указано, какая миграция её должна дать).
- **Блок 3** — `adjust_credits_balance` с аргументами
  `p_user_id text, p_amount integer`, `security_definer = true`.
- **Блок 4** — `can_execute = true` только у `service_role`.
- **Блок 5** — политики `*_own_row` на всех пяти таблицах.

Быстрая проверка функции:

```sql
select proname from pg_proc where proname = 'adjust_credits_balance';
-- ожидается: одна строка
```

## Что применить после восстановления базы (с нуля)

1. Порядок выше: 001 → 002 → … → 008 (000 — только диагностика).
2. Проверить `000_check_schema.sql`: все `present = true`, функция на месте.
3. Функция и RLS создаются 001 автоматически — отдельно применять нечего.
4. Данные восстановятся из бэкапа/реестра приложения; структура
   `credit_transactions.user_id` (text) рассчитана на существующий код.

## Откат одной миграции вручную

Скриптов отката нет (Supabase SQL Editor + ручной порядок). Откат — обратные
DDL-операции, аккуратно, с сохранением данных:

```sql
-- откат 008: drop table if exists public.pinterest_accounts;
-- откат 007: drop table if exists public.credit_purchases;
-- откат 006: drop table if exists public.subscriptions;
-- откат 005: alter table public.users drop column if exists email_verified;
-- откат 004: alter table public.users drop column if exists onboarded;
-- откат 003: alter table public.users drop column if exists name, drop column if exists surname;
-- откат 002: drop table if exists public.auth_tokens;
-- откат 001 (ПОСЛЕДНИЙ, уничтожает данные):
--   drop function if exists public.adjust_credits_balance(text, integer);
--   drop table if exists public.credit_transactions;
--   drop table if exists public.pins;
--   drop table if exists public.boards;
--   drop table if exists public.projects;
--   drop table if exists public.users cascade;
```

Порядок отката — строго от старших номеров к 001 (иначе FK заблокирует drop).
Перед откатом сделайте бэкап: Supabase Dashboard → Database → Backups.
