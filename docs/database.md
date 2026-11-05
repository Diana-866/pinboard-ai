# База данных PinPosy: как собирать с нуля

База — Supabase (PostgreSQL). Миграции применяются **вручную**: Supabase Dashboard →
SQL Editor → New query → вставить файл целиком → **Run**.

Все миграции идемпотентны — повторный запуск безопасен.

---

## Порядок применения (полная сборка с нуля)

```
000_check_schema.sql   — диагностика (ничего не меняет, можно не запускать на пустой базе)
001_base_schema.sql    — users, projects, boards, pins, credit_transactions,
                         функция adjust_credits_balance, RLS
002_auth_tokens.sql    — одноразовые токены (сброс пароля, подтверждение email)
003_users_profile.sql  — users.name, users.surname
004_onboarding.sql     — users.onboarded, users.tariff_plan (+ CHECK тарифов)
005_email_verified.sql — users.email_verified (бэкфилл старых аккаунтов)
006_subscriptions.sql  — таблица subscriptions + users.tariff_period_end
007_credit_purchases.sql — разовые покупки пакетов кредитов
008_pinterest_accounts.sql — Pinterest-аккаунты и журнал публикаций
```

Команды ниже — для Windows (Git Bash). Файлы применяются по одному, в этом порядке.

## Что делает каждая миграция

| Файл | Что делает |
|---|---|
| `000_check_schema.sql` | Только select к системным каталогам: какие таблицы/колонки реально есть, есть ли функция `adjust_credits_balance`, сводка «чего не хватает по ожиданиям кода». Ничего не меняет — можно запускать на рабочей базе в любой момент. |
| `001_base_schema.sql` | Базовая схема. Таблицы `users`, `projects`, `boards`, `pins`, `credit_transactions`; индексы; функция `adjust_credits_balance(p_user_id text, p_amount integer)` (security definer, execute только у `service_role`); RLS «только своя строка» на всех пяти таблицах. |
| `002_auth_tokens.sql` | Таблица `auth_tokens` (sha256-хэши одноразовых токенов: сброс пароля, подтверждение email). RLS включён, политик нет — таблица обслуживается только сервисным ключом. |
| `003_users_profile.sql` | `alter table users add column if not exists name/surname text`. |
| `004_onboarding.sql` | `users.onboarded boolean default false`, `users.tariff_plan text default 'none'` + CHECK `('none','analytics','start','pro','agency')`; переносит старый тариф `standard` → `pro`. |
| `005_email_verified.sql` | `users.email_verified boolean default false`. Колонка добавляется только если её ещё нет; при первом добавлении существующим пользователям ставится `true` (чтобы никого не отрезать от кабинета). Повторный запуск бэкфилл не повторяет. |
| `006_subscriptions.sql` | Таблица `subscriptions` (Prodamus, один платёж = одна строка по `provider_payment_id`) + `users.tariff_period_end timestamptz`. |
| `007_credit_purchases.sql` | Таблица `credit_purchases` — разовые покупки пакетов кредитов (`pack_100/500/1000`), защита от двойного зачисления (`balance_credited_at`). |
| `008_pinterest_accounts.sql` | `pinterest_accounts` (один аккаунт на пользователя, upsert по `user_id`) и `pinterest_publications` (журнал публикаций, защита от двойного пина). |

## Последующие миграции 009–030

Список выше описывает только первоначальную схему 000–008. Для текущей версии PinPosy после неё нужно последовательно применить **все** файлы `db/migrations/009_*.sql` … `030_*.sql` в порядке номеров, а не запускать только последнюю миграцию. Они добавляют ограничения и атомарные операции для платежей/кредитов, подтверждение email и сброс пароля, Pinterest OAuth и публикации, аудит вебхуков и transactional email outbox.

Особенно важно для платёжных писем:

- `018_preferred_language.sql` добавляет `users.preferred_language`, используемый локализованным шаблоном.
- `019_prevent_late_subscription_downgrade.sql` защищает текущий тариф от запоздавшего вебхука.
- `030_transactional_email_outbox.sql` зависит от `subscriptions` и `users.preferred_language`; заменяет `activate_paid_subscription`, чтобы событие письма записывалось атомарно с активацией тарифа, и создаёт служебные RPC для очереди.

Миграция 030 находится в feature branch и **не применялась** к рабочей Supabase базе. Не запускай её в production отдельно от согласованного rollout backend-кода: сначала резервная копия и проверка всей цепочки на отдельной базе.

## Как проверить, что всё применилось

1. Запусти `000_check_schema.sql` — раздел 4 («чего не хватает») должен вернуть **0 строк**.
2. Функция:
   ```sql
   select proname from pg_proc where proname = 'adjust_credits_balance';
   ```
   → ровно одна строка.
3. Колонки users (все должны существовать):
   ```sql
   select column_name from information_schema.columns
   where table_schema='public' and table_name='users'
   order by ordinal_position;
   ```
   Ожидается: `id, email, password_hash, credits_balance, subscription_tier, is_admin, created_at, name, surname, onboarded, tariff_plan, email_verified, tariff_period_end`.

## Восстановление базы с нуля (полный сценарий)

1. Создай проект Supabase (или очисти текущий: Table Editor → удалить все таблицы схемы `public`).
2. Примени по очереди `001 → 002 → 003 → 004 → 005 → 006 → 007 → 008` (см. порядок выше).
3. Запусти `000_check_schema.sql` — раздел 4 пустой.
4. Проверь RPC (см. «ПРОВЕРКА ДЛЯ ВЛАДЕЛЬЦА» в отчёте).
5. Настройки проекта Supabase, которые НЕ живут в миграциях и их надо вернуть руками:
   - Storage bucket `pin-images` (public, limit 5 МБ) — создаётся бэкендом автоматически
     при первом рехостинге картинки (backend/storage.js), руками делать не обязательно;
   - строки подключения / сервисный ключ — в панели Render (переменные `SUPABASE_URL`,
     `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`).

## Откат одной миграции вручную

Миграции не содержат down-скриптов (опасно их запускать автоматом). Откат делается руками
в SQL Editor. Полезные команды:

```sql
-- откатить 008
drop table if exists pinterest_publications;
drop table if exists pinterest_accounts;

-- откатить 007
drop table if exists credit_purchases;

-- откатить 006 (внимание: удалит и users.tariff_period_end)
drop table if exists subscriptions;
alter table users drop column if exists tariff_period_end;

-- откатить 005
alter table users drop column if exists email_verified;

-- откатить 004
alter table users drop constraint if exists users_tariff_plan_check;
alter table users drop column if exists tariff_plan;
alter table users drop column if exists onboarded;

-- откатить 003
alter table users drop column if exists surname;
alter table users drop column if exists name;

-- откатить 002
drop table if exists auth_tokens;

-- откатить 001 (внимание: удалит ВСЕ данные пользователей, проектов, пинов, истории кредитов)
drop table if exists credit_transactions;
drop table if exists pins;
drop table if exists boards;
drop table if exists projects;
drop function if exists adjust_credits_balance(text, integer);
-- таблицу users не дропать, если она управляется Supabase Auth в этом проекте
drop table if exists users;
```

Порядок откатов — строго обратный применению (008 → 001).

---

## Решения (почему 001 выглядит именно так)

1. **users.name / surname / onboarded / tariff_plan / email_verified / tariff_period_end
   не создаются в 001** — их добавляют миграции 003, 004, 005 и 006 (все через
   `add column if not exists`). Так повторный прогон всей цепочки 001→008 не конфликтует,
   а на уже существующей базе 001 не перетирает применённые миграции.
2. **users.subscription_tier создаётся в 001**: код читает её (backend/admin.js,
   backend/index.js `/me`), но ни 002–008, ни что-либо ещё её не добавляет. Без этого
   новая база соберётся с дыркой.
3. **projects: goal, language, site_summary, analyzed_at; boards: status** — код пишет
   эти колонки (backend/index.js: онбординг вставляет `goal`, `language`; `POST /projects`
   — то же; `POST /projects/:id/analyze` — `site_summary`, `analyzed_at`; генерация досок —
   `status: 'new'`), а в миграциях 002–008 их нет. Добавлены в 001.
4. **credit_transactions.user_id — TEXT** без FK на users.id (uuid): backend/credits.js
   вставляет text и вызывает `rpc` с `p_user_id text`. Менять тип/имя существующего поля
   запрещено правилом №3; целостность обеспечивает приложение. То же — в auth_tokens,
   subscriptions, credit_purchases, pinterest_* (user_id text) — там так задумано
   исходными миграциями.
5. **Нет CHECK на `credit_transactions.type`, `pins.status`, `boards.status`**:
   код пишет значения за пределами любых перечней (pins.status: pending/approved/rejected;
   type: generation/topup/refund) — CHECK сломал бы рабочие сценарии.
6. **Функция сравнивает `id::text = p_user_id`**, а не кастует аргумент в uuid:
   текстовое сравнение не падает на не-uuid входе и опирается на выражение-индекс
   `idx_users_id_text` — скорость та же, отказоустойчивость выше.
7. **RLS «только своя строка» + revoke у anon/authenticated**: PinPosy авторизует своим
   JWT, а не Supabase Auth, поэтому для реальных запросов `auth.uid()` всегда NULL и
   политики блокируют прямой клиентский доступ; весь доступ идёт сервисным ключом
   (service_role, bypassrls).
