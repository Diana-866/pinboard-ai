# PinPosy — HANDOFF после шага 01 (БД-харденинг + тарифное чтение)

Дата: 2026-11-03. Исходник: `APP PIN.zip` (проект PinPosy: React 19 + Vite `frontend/`,
Express 4 `backend/`, Supabase). Файл `HANDOFF.md` в переданном архиве **отсутствовал** —
этот написан с нуля по итогам шага 01.

## 1. Что сделано

### 1.1. `db/migrations/001_baseline.sql` — НОВЫЙ, полная идемпотентная baseline
Заменяет разрозненную `001_base_schema.sql` (перенесена в `db/archive/`).
Фиксирует фактическое состояние живой базы (сверено с дампом
information_schema от 2026-11-03):

- **10 таблиц**: `users`, `projects`, `boards`, `pins`, `credit_transactions`,
  `auth_tokens`, `subscriptions`, `credit_purchases`, `pinterest_accounts`,
  `pinterest_publications` — все `create table if not exists`, набор колонок и
  типы совпадают с живой базой (включая исторические особенности:
  `credit_transactions.user_id` — TEXT, `credit_transactions.amount` — numeric,
  `pins.credits_cost` — numeric, `pins.scheduled_date` — date,
  `created_at` у users/projects/boards/pins/credit_transactions —
  `timestamp without time zone`, у остальных — timestamptz).
- **Констрейнты** (все через DO-блоки с проверкой `pg_constraint` — идемпотентно):
  `users_email_key` (unique), `users_tariff_plan_check`, `auth_tokens_token_hash_key`
  (unique), `subscriptions_plan_check`, `subscriptions_status_check`,
  `credit_purchases_package_check`, `credit_purchases_status_check` + PK всех таблиц.
- **Все индексы живой базы** (25 шт.): частичные unique на `provider_payment_id`
  (subscriptions, credit_purchases), unique на `uniq_pinterest_accounts_user`,
  `uniq_pinterest_publications_pin/remote`, `idx_users_id_text` (выражение
  `(id::text)` — под RPC `adjust_credits_balance`) и т.д.
- **`adjust_credits_balance(p_user_id text, p_amount integer)` SECURITY DEFINER** —
  тело идентично живой базе (атомарный UPDATE…RETURNING, запрет минуса,
  сравнение `id::text = p_user_id`); execute отозван у public/anon/authenticated,
  выдан service_role.
- **RLS включён на всех 10 таблицах**, политики «только своя строка»:
  users/projects/boards/pins/credit_transactions — по образцу живой базы
  (boards/pins — через EXISTS-джойн по projects);
  subscriptions/credit_purchases/pinterest_accounts/pinterest_publications —
  `for select` (как в живой базе); auth_tokens — без клиентских политик.
  Прямой доступ anon/authenticated к таблицам отозван (`revoke`).
  Политики для user_id-таблиц используют приведение `(user_id)::text` — работают
  и с TEXT, и с uuid (важно для идемпотентного цикла с 009, см. ниже).

### 1.2. `db/migrations/009_hardening.sql` — НОВЫЙ, идемпотентный харденинг
1. **Политика `users_own_row`**: убран `FOR ALL` → только `for select using
   (auth.uid()::text = id::text)`. Запись в `users` — только service_role
   (бэкенд, RLS обходится).
2. **FK `users(id) ON DELETE CASCADE`** на все 6 таблиц с `user_id text`:
   `auth_tokens`, `credit_transactions`, `subscriptions`, `credit_purchases`,
   `pinterest_accounts`, `pinterest_publications`. Реализовано **конвертацией
   `user_id text → uuid`**:
   - перед конвертацией: не-uuid значения → NULL (где колонка nullable) или
     удаление строк (где NOT NULL), осиротевшие uuid → удаление (всё с
     NOTICE-логом); на текущей базе чистить было нечего (не сработало ни одно
     удаление — при локальном тесте 0 удалений);
   - снятие/пересоздание политик, ссылающихся на `user_id` (PostgreSQL не даёт
     менять тип колонки, использованной в политике);
   - **`projects_user_id_fkey`** пересоздан с `ON DELETE CASCADE` (был без cascade);
   - **бонус-достройка**: `pinterest_publications.pin_id → pins(id) ON DELETE
     CASCADE` — ссылки на пины раньше никак не защищались;
   - старые текстовые индексы `idx_auth_tokens_user`, `idx_credit_transactions_user_id`
     заменены на uuid-версии (`idx_auth_tokens_user_uuid`, `idx_credit_transactions_user_uuid`).
3. **Триггер `trg_pinterest_accounts_updated_at`** (`before update`) —
   `pinterest_accounts.updated_at` обновляется автоматически.
4. **CHECK на статусы** — списки расширены автоматически по факту данных:
   - `boards_status_check`: `('new','in_progress','done')`;
   - `pins_status_check`: `('pending','approved','rejected','scheduled','published')`
     (включает backend-значения `/pins/:id/status` → approved|rejected и
     планировщик scheduled/published). На живой базе перед применением DO-блок
     сам делает `SELECT DISTINCT status` и **добавляет** в список любые
     встреченные значения вне перечня — данные не ломаются (в NOTICE печатается
     итоговый список).
5. **Индексы**: `idx_pins_scheduled (scheduled_date, status)`, `idx_pins_status`.
6. **`credit_transactions.amount` numeric → integer**: сначала проверка
   `amount <> round(amount)`; если есть дробные — колонка НЕ меняется
   (NOTICE с количеством), иначе конвертация. На тестовой базе — конвертирован.

### 1.3. Бэкенд: чтение тарифа переведено на `tariff_plan`
- `backend/admin.js`: `getStats()` читает `tariff_plan` вместо
  `subscription_tier`; в ответ добавлен `tariffPlanBreakdown` — эквивалент
  `select tariff_plan, count(*) from users group by 1` (нормализация алиасов
  через `normalizePlan` из `backend/tariff.js`). `/admin/stats` больше не
  требует legacy-колонку.
- `backend/index.js`: `GET /me` больше не читает `row.subscription_tier` —
  значение поля `subscription_tier` в ответе теперь **производится** от
  `row.tariff_plan` через `normalizePlan` (free↔none совместимость для фронта);
  `PATCH /me` выбирает `tariff_plan` вместо `subscription_tier`.
- Legacy-колонка `users.subscription_tier` в схеме сохранена (удаление —
  отдельное решение после проверки админки на живой базе).

## 2. Проверка (воспроизведено локально на PostgreSQL 16)

Ставился чистый PostgreSQL 16, роли `anon`/`authenticated`/`service_role` и стаб
`auth.uid()` как в Supabase. Цикл **`001 → 009 → 001 → 009` на пустой базе —
все 4 запуска без единой ошибки** (ON_ERROR_STOP). Контрольные проверки после цикла:

| Проверка | Ожидание | Факт |
|---|---|---|
| `select count(*) from pg_constraint where contype='f'` | ≥10 | **10** (auth_tokens_user_id, boards_project_id, credit_purchases_user_id, credit_transactions_user_id, pins_board_id, pinterest_accounts_user_id, pinterest_publications_pin_id, pinterest_publications_user_id, projects_user_id, subscriptions_user_id — все `_fkey`) |
| `select indexname from pg_indexes where tablename='pins'` | видны 2 новых | `pins_pkey, idx_pins_board_id, idx_pins_scheduled, idx_pins_status` ✓ |
| Политики `users` | только SELECT | `users_own_row [SELECT]` — единственная политика ✓ |
| Триггер `pinterest_accounts` | есть | `trg_pinterest_accounts_updated_at` ✓ |
| `credit_transactions.amount` | integer | `integer` ✓ (после повторного запуска NOTICE «уже integer») |
| Типы `user_id` после 009 | uuid везде | uuid во всех 7 таблицах ✓ |
| Регрессия бэкенда | тесты зелёные | `node test/credits-flow.js` и `node test/billing-flow.js` — «ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ ✓» ✓ |

## 3. Как применить на живой базе (Supabase SQL Editor)

1. **Бэкап** (Supabase Dashboard → Database → Backups, или `pg_dump`).
2. `001_baseline.sql` → Run (ошибок быть не должно; объекты уже существуют —
   всё `if not exists` / `drop if exists`).
3. `009_hardening.sql` → Run. Прочитать NOTICES:
   - списки CHECK статусов (расширены ли значениями из живых данных);
   - было ли удаление сирот/не-uuid (ожидается 0);
   - конвертирован ли `amount` в integer.
4. Повторить шаги 2–3 ещё раз — вторая пара запусков обязана пройти без ошибок.
5. Контроль: `select count(*) from pg_constraint where contype='f';` → ≥10;
   `select indexname from pg_indexes where tablename='pins';` → есть
   `idx_pins_scheduled`, `idx_pins_status`;
   `select tariff_plan, count(*) from users group by 1;` — сверить с админкой
   (блок «по тарифам» после деплоя бэкенда должен совпасть).
6. Задеплоить бэкенд (Render) с патчами `backend/admin.js`, `backend/index.js`.

## 4. Что НЕ проверено на живой базе (важно)

- **Живая база не трогалась** — всё воспроизведено на локальном PostgreSQL 16.
  Поведение Supabase-специфики (`auth.uid()`, роли, права service_role,
  частичные индексы в SQL Editor) совпадает по документации, но не прогонялось
  на реальном Supabase-инстансе.
- **Дробные значения `credit_transactions.amount`** на живой базе неизвестны.
  Если 009 в NOTICE напишет «НЕ конвертирован» — решения по каждой строке
  принимает владелец (округление/удаление), миграция данные не ломает.
- **Фактические значения `boards.status` / `pins.status`** на живой базе
  неизвестны — DO-блок расширит CHECK-списки автоматически (см. NOTICE),
  но итоговые списки стоит просмотреть глазами.
- **Удаление сирот**: если на живой базе найдутся строки с несуществующим
  `user_id` (или не-uuid значениями), 009 их **удалит** (с NOTICE-количеством).
  Перед запуском можно оценить объём:
  `select count(*) from subscriptions s where not exists (select 1 from users u where u.id::text = s.user_id);` (и аналогично для остальных таблиц).
- **Регистрация/логин/флоу тарифов на живом API** после деплоя бэкенда не
  прогонялись (e2e не запускался) — прогнать вручную: логин, `/me`,
  проверка блокировки генерации на тарифе `none`.
- **Триггер на живой базе** проверится только после применения 009: сделать
  `update pinterest_accounts set username = username where id = <id>;` и убедиться,
  что `updated_at` обновился.
- Статические файлы `frontend/dist` в архиве не пересобирались (фронтенд
  не менялся).
- Файлы `db/archive/001_base_schema.sql` и прочие миграции 002–008 оставлены
  как история; повторно применять их ПОСЛЕ 009 не нужно (001_baseline + 009
  покрывают всё; 005 при повторном запуске бэкфилл не делает — это ожидаемо).

## 5. Изменённые файлы (сводка)

```
db/migrations/001_baseline.sql        НОВЫЙ — полная идемпотентная baseline (10 таблиц)
db/migrations/009_hardening.sql       НОВЫЙ — харденинг (RLS users select-only, FK, триггер, CHECK, индексы, amount→int)
db/archive/001_base_schema.sql        Перенос: прежняя частичная базовая схема (заменена baseline)
backend/admin.js                      getStats читает tariff_plan + tariffPlanBreakdown
backend/index.js                      /me и PATCH /me читают тариф из tariff_plan (normalizePlan)
HANDOFF.md                            Этот файл
```


## Дополнение к handoff — 2026-11-07 (AUD-005 / AUD-006)

- AUD-005: migration 051 сохраняет snapshot Pinterest title/description/image/destination для новых расписаний; worker и календарь используют snapshot. Старые строки без snapshot оставлены в режиме совместимости.
- AUD-006: migration 052 добавляет атомарное восстановление старого расписания без `pinterest_account_id`. Backend проверяет, что выбранный аккаунт принадлежит пользователю, и проверяет сохранённую Pinterest-доску через этот аккаунт; SQL разрешает восстановление только для scheduled/failed записей без любой attempt/publication history и при одобренном исходном пине.
- При одном активном аккаунте он является единственным кандидатом, но пользователь запускает восстановление явно. При нескольких аккаунтах требуется выбрать один; без аккаунта операция невозможна. Календарь получил UI для этого сценария.
- Добавлены unit tests на выбор аккаунта, PostgreSQL integration cases на безопасную привязку и блокировку legacy attempt history; migration 052 включена в atomic-payment CI.
- Проверки на текущем этапе: синтаксический разбор backend JS-файлов и ручные проверки pure account-selection helper прошли. Реальные Node/PostgreSQL tests пока не подтверждены CI. Production DB, cron и Pinterest API credentials не менялись.
- Последний HEAD при добавлении этой записи: `da00b77d2c9ceafedf3c338ecbbae04696bd012f`. PR #4 остаётся открытым Draft.


## Дополнение к handoff — 2026-11-07 (AUD-007)

- Удалены неподдержанные UI-обещания автоматической генерации: чекбокс ночного запуска, время запуска, быстрые временные пресеты и React callback, который менял только состояние приложения.
- Диапазоны min/max теперь обозначены как локальные ориентиры ручного планирования; хранятся в localStorage текущего браузера и не используются worker. Текст календаря обновлён на 7 языках. Часовой пояс остался локальной настройкой календаря.
- Автоматическая генерация не считается реализованной; worker выполняет только заранее созданные расписания пользователя.
- Статус AUD-007: FIXED_UNVERIFIED до успешного frontend typecheck/CI.


## Дополнение к handoff — 2026-11-07 (AUD-009)

- ScheduledPinItem и mapping календаря сохраняют pinterest_pin_id из /schedule.
- Добавлен helper buildPinterestPinUrl: URL создаётся только для числового ID, произвольные path/query/host значения не формируют ссылку.
- В деталях календаря ссылка отображается только для published и валидного URL; открывается в новой вкладке с noopener noreferrer.
- Добавлены frontend unit tests, npm test script и CI step. Реальный CI/typecheck пока не подтверждён.
- AUD-009: FIXED_UNVERIFIED.


## Дополнение к handoff — 2026-11-07 (AUD-010)

- GET /schedule теперь вычисляет retryable/retry_reason по attempt journal, publication ledger, активному Pinterest account, board/image и дублирующим active schedules.
- Кнопка Retry в календаре появляется только при retryable=true. При недоступных metadata повтор блокируется. POST retry/RPC остаётся окончательной серверной проверкой на случай гонки.
- Добавлены unit tests для безопасного повтора без журнала, retry_safe=true, ambiguous/unsafe attempts, отсутствующих зависимостей, публикации и дубликата.
- AUD-010: FIXED_UNVERIFIED до успешного CI.


## Дополнение к handoff — 2026-11-07 (AUD-012)

- Добавлена reference-aware очистка старых managed pin-image объектов после успешной DB замены изображения/перегенерации и после отмены schedule.
- Перед удалением проверяются ссылки в pins, неотменённых schedule snapshots и активных/unknown generation requests; ошибка любой DB-проверки блокирует удаление. Storage cleanup failure логируется и не ломает успешный пользовательский запрос.
- Добавлены path/reference unit tests и docs/storage-lifecycle.md.
- AUD-012 частично закрыт: исторические orphan objects не сканируются, registry/sweeper не реализован, узкая гонка check→remove ещё не сериализована.


## Дополнение к handoff — 2026-11-07 (AUD-013)

- Для generation tasks `rehostImage` получает стабильный provider_idempotency_key; `uploadPinImage` хеширует его в deterministic object key и использует Supabase Storage upsert.
- Если Storage upload прошёл, а запись storage_url в task journal не прошла, повтор использует тот же object path и не создаёт второй объект.
- Добавлены unit tests на стабильность/различие ключей и распознавание deterministic path в cleanup. Реальный Storage/DB failure сценарий требует runtime CI/integration подтверждения.
- AUD-013: FIXED_UNVERIFIED.


## Дополнение к handoff — 2026-11-07 (AUD-014)

- Migration 053 добавляет `pin_regeneration_requests`: пользовательский idempotency key, fingerprint параметров, стабильный provider key, provider task/result/storage URLs и claim-token fencing.
- `POST /pins/:id/regenerate` теперь требует `Idempotency-Key`; завершение операции атомарно обновляет изображение пина, списывает кредиты и записывает ledger transaction.
- Provider task ID записывается callback-ом сразу после принятия задачи GPTunnel, до первого polling; восстановление после timeout может опрашивать сохранённую задачу, а не полагаться только на повторный create с тем же ключом. Подтверждённый отказ GPTunnel фиксируется как terminal `failed`; только неопределённые сетевые/Storage/DB исходы остаются `unknown` и допускают восстановление.
- Повтор завершённого ключа возвращает сохранённый pin. Неопределённый запрос восстанавливается с прежним provider key; если provider task ID уже сохранён, backend опрашивает эту задачу вместо создания новой.
- Исправлена ошибка миграции: `claim_token` объявлен NOT NULL и теперь не обнуляется при завершении.
- Добавлен PostgreSQL integration test на одно списание при повторе, fingerprint mismatch и claim fencing; добавлены unit tests парсинга восстановленного provider result. Migration 053 и SQL test включены в atomic-payment workflow.
- AUD-014: FIXED_UNVERIFIED. Последние GitHub Actions на текущем HEAD завершаются failure до старта runner (steps пусты), Vercel preview сообщает `build-rate-limit`. CI/runtime не подтверждены; production DB не менялась.


## Дополнение к handoff — 2026-11-07 (AUD-015)

- Migration 054 добавляет `pin_generation_credit_reservations` и атомарный RPC `reserve_pin_generation_credits`: блокировка строки пользователя + сумма действующих резервов предотвращают двойное резервирование разными generation idempotency keys.
- Backend резервирует полный расчётный лимит до обращения к provider; recovery использует тот же резерв. Резерв выше фактического списания не допускает превышения зарезервированного лимита; `save_generated_pins_and_charge` вычитает активные резервы, чтобы конкурирующий generation debit не мог потратить чужой резерв. Для reserve/settlement используется единый порядок блокировок user → request → reservation.
- Trigger переводит резерв в `settled` при завершении, освобождает при подтверждённом `failed`, сохраняет при `unknown`. Добавлен SQL integration сценарий для отказа второго резерва, запрета конкурирующего debit сверх свободного остатка, release и удержания неопределённого результата.
- AUD-015: FIXED_UNVERIFIED. CI/staging пока не подтверждены; production migration не применялась. Старые in-flight generation requests, созданные до migration 054, требуют отдельной сверки перед rollout.
