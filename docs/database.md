# База данных PinPosy: как собирать с нуля

База — Supabase (PostgreSQL). Миграции применяются **вручную**: Supabase Dashboard →
SQL Editor → New query → вставить файл целиком → **Run**.

Не все SQL-файлы в папке являются применяемыми миграциями. Для новой базы используй только канонический порядок ниже. Исторические файлы 002–008 сохранены для справки и не входят в установочную цепочку; повторный запуск миграций на рабочей базе не считать безопасным без отдельной проверки.

## Как выполнять миграции в Supabase SQL Editor

1. Открой Supabase Dashboard именно того проекта, с которым работаешь, затем **SQL Editor → New query**.
2. Открой SQL-файл в GitHub или локальном репозитории и скопируй его содержимое целиком.
3. Вставь один файл в отдельный запрос и нажми **Run**.
4. Убедись, что запрос завершился без ошибок, прежде чем переходить к следующему файлу.
5. Если появилась ошибка — **остановись**, сохрани полный текст ошибки и номер миграции. Не запускай последующие миграции «на удачу» и не исправляй production-схему вручную без проверки причины.

Для новой пустой базы используй только последовательность ниже. Для уже работающей базы сначала получи резервную копию и read-only снимок текущей схемы; не запускай baseline поверх существующих таблиц и не считай эту инструкцию планом обновления production.


---

## Канонический порядок применения (полная сборка с нуля)

> ⚠️ Используй только этот сценарий для новой пустой базы. Не запускай старые файлы `001_base_schema.sql` и `002–008`: они заменены полным baseline-файлом `001_baseline.sql`.

1. `db/migrations/000_check_schema.sql` — необязательная read-only диагностика; она ничего не создаёт и на пустой базе ожидаемо покажет отсутствующие объекты.
2. `db/migrations/001_baseline.sql` — единая базовая схема: все 10 базовых таблиц, их базовые колонки, индексы, RLS/политики и `adjust_credits_balance`. Заменяет прежнюю цепочку `001_base_schema.sql` + `002–008`.
3. Затем последовательно примени файлы `db/migrations/010_*.sql` … `db/migrations/147_*.sql` в числовом порядке. Миграция 009 исключена и архивирована: она меняла `user_id TEXT` на UUID и удаляла некорректные/осиротевшие строки. Не запускай её.

Файлы применяются по одному в Supabase SQL Editor. Эта инструкция описывает сборку схемы на пустой базе; она не является разрешением запускать миграции на рабочей Supabase базе. Для production сначала нужен backup, staging-прогон всей цепочки и отдельное подтверждение владельца.

## Назначение базовых файлов

| Файл | Назначение |
|---|---|
| `000_check_schema.sql` | Только SELECT к системным каталогам. Ничего не меняет. На пустой базе список отсутствующих объектов ожидаем; после полного применения цепочки он должен быть пустым. |
| `001_baseline.sql` | Единственная каноническая базовая схема для новой установки. Создаёт базовые таблицы/колонки и заменяет старую цепочку `001_base_schema.sql` + `002–008`. |
| `db/archive/001_base_schema.sql` | Архивная копия старой базовой миграции. Не запускать в новой установке и не применять вместе с `001_baseline.sql`. |
| `db/archive/009_hardening.sql` | Архивная версия миграции с преобразованием TEXT → UUID и очисткой строк. Не запускать. Для безопасной установки используется TEXT-контракт из baseline. |

## Последующие миграции 010–147

После `001_baseline.sql` нужно последовательно применить файлы `db/migrations/010_*.sql` … `147_*.sql` в порядке номеров. Не запускай старые `002–008`: их базовые объекты уже включены в baseline. Не запускай `009_hardening.sql`: он перенесён в `db/archive/` из-за преобразования `user_id` и удаления данных. Последующие миграции добавляют ограничения и атомарные операции платежей/кредитов, auth recovery, Pinterest OAuth/publication lifecycle, журналирование, административные операции и дополнительные проверки безопасности.

Текущая ветка содержит цепочку миграций вплоть до 147. Отдельные миграции feature-ветки могут требовать согласованного backend/frontend rollout; наличие файла не означает, что его можно без проверки применять к production. Для auth recovery особенно важны:
- `020_atomic_password_reset.sql` — атомарный выпуск/погашение reset-токена;
- `021_atomic_email_verification.sql` и `022_atomic_email_verification_issuance.sql` — атомарное подтверждение email и выпуск verification-ссылок с cooldown;
- `023_revoke_sessions_after_password_reset.sql` — добавляет `users.token_version` и увеличивает его в той же транзакции, что меняет пароль и погашает reset-токен;
- `024_password_reset_email_cooldown.sql` и `025_drop_legacy_password_reset_overload.sql` — per-account cooldown и удаление старой трёхпараметрической RPC-сигнатуры, обходившей cooldown;
- `055_auth_token_version.sql` — идемпотентно закрепляет колонку, DEFAULT 0, NOT NULL и CHECK >= 0 для baseline/схем, где колонка ещё не была создана.

Не путать наличие колонки с наличием RPC: функции auth recovery определяются миграциями 020–025. Применять всю цепочку по порядку; 055 не заменяет миграции 020–025. Миграции 034–083 присутствуют в репозитории; статус их применения к рабочей базе не подтверждён. Не применяй их к production отдельно от согласованного rollout, резервной копии и проверки на staging.

Жизненный цикл аккаунта (приватность/self-service):
- `127_account_lifecycle.sql` — самообслуживание аккаунта. Добавляет `users.account_status` (DEFAULT `active`, CHECK `active|deletion_pending|deleted`) и `users.deletion_requested_at`, создаёт таблицу `account_deletion_requests` (RLS без клиентских грантов, доступ только для `service_role`) и SECURITY DEFINER RPC `request_account_deletion(uuid, text)` с захардкоженным `search_path=pg_catalog,public`. RPC принимает запрос на удаление и **ограничивается блокировкой доступа**: инкрементирует `token_version` (аннулируя все активные JWT) и ставит `account_status='deletion_pending'`. Строки НЕ удаляются — физическая очистка данных вынесена в отдельный контролируемый этап.
  - Миграция **аддитивна и безопасна для деплоя по частям**: код backend/frontend уже умеет работать до её применения. Экспорт данных пропускает отсутствующие колонки, а запрос на удаление возвращает 503, пока RPC не создан; вход в аккаунт не меняется, т.к. проверка `account_status` пропускается при `undefined`.
  - Порядок выката: сначала backend/frontend (уже в `main`), затем применить 127 в Supabase SQL Editor. Перед применением к рабочей базе — резервная копия и staging-прогон всей цепочки.
  - Проверка после применения:
    ```sql
    select proname from pg_proc where proname = 'request_account_deletion';
    select column_name from information_schema.columns
     where table_schema='public' and table_name='users'
       and column_name in ('account_status','deletion_requested_at');
    ```
- `128_account_deletion_stops_publications.sql` — замораживает публикации удаляемого аккаунта. Переопределяет `claim_due_pin_schedules`, `renew_pin_schedule_claim` и `begin_scheduled_pinterest_publish`, добавляя единое правило: владелец существует и `users.account_status <> 'active'` (join `users.id::text = pin_schedules.user_id`). Claim отменяет ещё не опубликованные расписания такого аккаунта (`status='cancelled'`) и никогда не отдаёт их worker'у; renewal in-flight claim возвращает `false`, из-за чего worker прерывается перед `POST /pins`; резервация расписания отклоняется до создания journal-строки. Требует применения `127` (колонка `account_status`).
  - Миграция **не удаляет данные** и не трогает уже опубликованные/`publishing`/`unknown` строки. Активные аккаунты работают как прежде.
  - Порядок выката: применить вместе с `127` в Supabase SQL Editor (после `127`). Код backend/frontend не зависит от неё: без `128` future-публикации удаляемого аккаунта просто продолжают обрабатываться, прямой сценарий пользователя это не ломает.
  - Проверка после применения:
    ```sql
    select proname from pg_proc
     where proname in ('claim_due_pin_schedules','renew_pin_schedule_claim','begin_scheduled_pinterest_publish');
    ```

Pinterest multi-account rollout:
- `031_pinterest_account_scoped_foundation.sql` adds stable account references, nullable credentials for soft disconnect, and per-account refresh leases.
- `032_pinterest_multi_account_oauth.sql` replaces the unique-per-user account index and enforces account caps in the OAuth commit transaction.
- `033_pinterest_account_scoped_publication.sql` scopes publication idempotency and schedules to the selected account, updates the worker, and fails future schedules when an account is disconnected. Legacy rows without a verified account mapping remain unmapped and non-retryable.

Особенно важно для платёжных писем:

- `018_preferred_language.sql` добавляет `users.preferred_language`, используемый локализованным шаблоном.
- `019_prevent_late_subscription_downgrade.sql` защищает текущий тариф от запоздавшего вебхука.
- `030_transactional_email_outbox.sql` зависит от `subscriptions` и `users.preferred_language`; заменяет `activate_paid_subscription`, чтобы событие письма записывалось атомарно с активацией тарифа, и создаёт служебные RPC для очереди.

Миграции 030–083 присутствуют в текущем репозитории, но их применение к рабочей Supabase базе не подтверждено. Не запускай их в production отдельно от согласованного rollout backend/frontend-кода: сначала резервная копия, проверка всей цепочки на отдельной базе и явное подтверждение владельца проекта.

## Как проверить, что всё применилось

1. Запусти `db/migrations/000_check_schema.sql` — раздел 4 («чего не хватает») должен вернуть **0 строк**.
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
   Ожидается: `id, email, password_hash, credits_balance, subscription_tier, is_admin, created_at, name, surname, onboarded, tariff_plan, email_verified, tariff_period_end, token_version, preferred_language, account_status, deletion_requested_at`.

## Восстановление базы с нуля (полный сценарий)

1. Создай отдельный проект Supabase для проверки. Не очищай рабочую базу ради теста.
2. Примени `001_baseline.sql`.
3. Примени миграции `010–147` по порядку, пропуская архивную `009_hardening.sql`.
4. Запусти `000_check_schema.sql` — после полной цепочки раздел 4 должен вернуть 0 строк.
5. Проверь RPC и таблицы по контрольным запросам ниже.
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

## Исторические заметки о старой миграции 001 (не инструкция к запуску)

Следующие пояснения относятся к архивному `db/archive/001_base_schema.sql`. Для новой установки используй `001_baseline.sql`.

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


### Миграции 121–147 (текущая ветка main)

- `121_atomic_pin_generation_text_plan.sql` — атомарная запись факта использования текста и нормализованного плана генерации пинов.
- `122_pinterest_scheduler_health_monitor.sql` — singleton-метаданные запусков Pinterest scheduler и RPC для фиксации начала/завершения.

Миграции 121–147 входят в текущую цепочку main. Для новой пустой базы применяй их в общем порядке 010–147. Наличие файла в main не означает, что миграция уже применена к рабочей Supabase базе. Для существующей базы сначала получи резервную копию, список уже применённых изменений и read-only снимок схемы; составь отдельный delta-план и проверь его на staging. Не запускай весь диапазон 121–147 поверх production вслепую.


### Миграции 121–147 — актуальная цепочка main

- `121_atomic_pin_generation_text_plan.sql` — атомарная запись факта использования текста и нормализованного плана генерации пинов.
- `122_pinterest_scheduler_health_monitor.sql` и `123_pinterest_scheduler_completion_fencing.sql` — heartbeat Pinterest scheduler и защита от повторного/запоздавшего завершения.
- `124–126` — категории досок и восстановление подтверждённых Pinterest-публикаций без повторного внешнего POST.
- `127–145` — жизненный цикл удаления аккаунта, остановка публикаций при удалении, поэтапное и повторяемое удаление данных/изображений с проверками ссылок.
- `146_pinterest_board_reassignment_uses_immutable_snapshot.sql` — перенос доски с использованием неизменяемого снимка публикации.
- `147_account_deletion_storage_batch_retry.sql` — безопасное повторение пакетной очистки Storage.

Это краткие назначения по именам миграций, а не утверждение об их применении в production. Для новой пустой базы применяй всю цепочку 010–147 строго по номеру. Для существующей базы нужен отдельный delta-план.
