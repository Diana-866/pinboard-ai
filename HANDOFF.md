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


## Дополнение к handoff — 2026-11-07 (AUD-016)

- Text-plan GPTunnel call теперь считается платной/неопределённой provider boundary: `generatePins` вызывает `onTextProviderSubmission` непосредственно перед `generateText`.
- Route выставляет общий `providerGenerationStarted` до вызова text provider. Если provider call завершился неоднозначно или последующая запись image-plan journal не удалась, `fail_pin_generation_request` получает `p_outcome_unknown=true`; тот же idempotency key не запускает повторную генерацию текста.
- Автоматическое восстановление text response не реализовано: для text endpoint не подтверждена поддержка idempotency key/task lookup. Повтор возможен только как явная новая попытка с новым ключом, то есть новый provider call.
- Добавлен unit regression test, проверяющий callback до вызова text provider. AUD-016: FIXED_UNVERIFIED до Node/HTTP/PostgreSQL CI и staging проверки. Production не менялся.


## Дополнение к handoff — 2026-11-07 (AUD-017 partial)

- Если task journal уже содержит `status=succeeded`, `provider_result_url` и `provider_price`, но `storage_url` отсутствует, retry теперь повторно переносит исходный сохранённый URL в Supabase Storage с тем же детерминированным object key. Повторный GPTunnel create не вызывается.
- Добавлен unit regression test: успешный provider result восстанавливается из journal без нового provider call; цена и provider URL остаются исходными.
- Не закрыто: автоматический фоновый recovery/sweeper и alerting до возможного 48-часового истечения URL не реализованы. AUD-017 остаётся OPEN до внедрения мониторинга и проверки TTL у GPTunnel.


## Дополнение к handoff — 2026-11-07 (AUD-019 partial)

- Перед локальным отключением Pinterest UI показывает подтверждение на 7 языках: PinPosy удалит локальные токены, но не отзывает OAuth grant в Pinterest; будущие queued schedules выбранного аккаунта станут failed; уже выполняющийся внешний запрос может завершиться.
- Изменённые локали: ru/en/de/es/fr/pt/zh; добавлен обязательный ключ `pinterestDisconnectWarning` в i18n types.
- Не закрыто: официальный revoke flow Pinterest не реализован/не подтверждён; in-flight race и legacy schedules без account_id требуют отдельной проверки. AUD-019 остаётся OPEN.


## Дополнение к handoff — 2026-11-07 (AUD-018 product decision required)

- Повторно проверены `/projects/:id/analyze` и `/projects/:id/boards/generate`: оба вызывают GPTunnel text generation без списания credits и durable idempotency journal. Analyze не имеет `requireTariff`, board generation ограничен тарифами standard/pro/agency/start. Общий `aiLimiter` — 12 запросов/минуту на ключ limiter, не per-user quota и не финансовый ledger.
- Не менял тарификацию: неизвестно, обещаны ли эти функции как бесплатные, включённые в тариф или оплачиваемые кредитами. AUD-018 переведена в BLOCKED до явного решения владельца по квотам/стоимости каждой операции.


## Дополнение к handoff — 2026-11-07 (AUD-020 partial coverage)

- `billing.handleWebhook` и `creditsBilling.handleCreditsWebhook` получили необязательный третий аргумент `dependencies` для изолированного тестирования; production поведение по умолчанию использует прежний Supabase singleton и email outbox dispatcher.
- Добавлены handler-level regressions: два одновременных subscription success callbacks; commit-then-error и повтор subscription webhook; concurrent credit callbacks с ambiguous commit и replay; cancel callback после уже успешного credit purchase не перезаписывает success.
- Тесты подписывают payload HMAC тем же canonical serializer, который используется в production.
- Это не реальные HTTP/PostgreSQL integration tests: для них нужны Express harness и PostgreSQL. AUD-020 остаётся partially covered; CI/staging не подтверждены.


## Дополнение к handoff — 2026-11-07 (AUD-021 partial mitigation)

- Подтверждено по коду: activation email уже получает стабильный Message-ID на основе subscription_id; повтор после неясного SMTP/DB результата сохраняет тот же идентификатор.
- dispatchPendingSubscriptionEmails(limit, dependencies) поддерживает injection Supabase и mail adapter; без dependencies production defaults остаются прежними.
- Добавлен backend/test/email-outbox.test.js: SMTP adapter принимает письмо, mark_email_outbox_sent возвращает ошибку соединения, retry повторно отправляет письмо с тем же Message-ID, затем подтверждение проходит.
- Это тест at-least-once поведения, а не доказательство дедупликации SMTP. Message-ID не является гарантированным idempotency key для SMTP; exactly-once не обещается.
- AUD-021: PARTIALLY MITIGATED; требуется подтвердить provider-level idempotency/reconciliation у фактического SMTP-провайдера. Тест локально и в CI пока не запускался/не подтверждён.


## Дополнение к handoff — 2026-11-07 (AUD-022 partial mitigation)

- В backend/imageValidation.js определён единый MAX_IMAGE_BYTES = 5 MiB; validateImageBuffer отклоняет файл больше лимита до upload.
- backend/storage.js использует тот же лимит для Axios maxContentLength и при создании pin-images bucket; createBucket задаёт allowed MIME types.
- ensureBucket теперь fail-closed при ошибке чтения/создания bucket и блокирует upload, если metadata существующего bucket указывает лимит ниже 5 MiB. Прежнее поведение, при котором ошибка проверки проглатывалась и upload продолжался, удалено.
- Добавлен тест ровно на границу 5 MiB и 1 байт сверх неё. В index.js Multer уже был ограничен 5 MiB; расхождение 8 MiB против 5 MiB устранено.
- AUD-022: PARTIALLY MITIGATED. Политики существующего production bucket и реальные MIME policies не проверялись; тесты/CI ещё не подтверждены.


## Дополнение к handoff — 2026-11-07 (AUD-023 partial coverage)

- Подтверждён immutable snapshot: изменение title/description/image у live pin после создания расписания не переписывает сохранённый snapshot.
- Расширен backend/test/pinterest-account-publication.integration.sql: удаление pin до begin reservation каскадно удаляет queued schedule без attempt; удаление после begin оставляет processing attempt, а complete_pinterest_publish_v2 сохраняет remote ID в publication ledger.
- Зафиксировано ожидаемое поведение: после durable begin внешний Pinterest POST нельзя гарантированно отменить. Если локальный pin удаляется уже после этой точки, внешний publish может завершиться; schedule row каскадно исчезает, но attempt/publication history остаётся для аудита.
- AUD-023: PARTIALLY COVERED. SQL сценарии ещё не исполнены в CI; отдельный worker-level test с искусственной паузой прямо перед POST остаётся незакрытым.


## Дополнение к handoff — 2026-11-07 (AUD-024 partial coverage)

- Проверил существующие multi-account SQL regressions: reconnect external Pinterest ID сохраняет тот же internal account UUID; повторный callback не перезаписывает сохранённые credentials; новая OAuth попытка supersedes старую; callback после disconnect отклоняется; legacy schedule с publication history нельзя перепривязать; schedule без истории можно явно назначить выбранному active account.
- Добавлен сценарий в backend/test/pinterest-account-publication.integration.sql: попытка привязать legacy schedule к уже отключённому Pinterest account возвращает account_unavailable и не пишет pinterest_account_id.
- AUD-024 теперь PARTIALLY COVERED. Реальной конкурентной гонки двух DB connections пока нет: имеющийся replay test последовательный, хотя SQL RPC блокирует OAuth state row и потребляет attempt транзакционно. Нужен двухсессионный PostgreSQL harness и подтверждённый CI run.
- Production не затрагивался; миграции не применялись.

## Дополнение к handoff — 2026-11-07 (AUD-024 concurrency regression)

- Добавлен `backend/test/pinterest-oauth-concurrency.sh`: две независимые PostgreSQL-сессии одновременно конкурируют за одну OAuth state row — callback повторного подключения и отключение Pinterest-аккаунта.
- Тест удерживает row lock отдельной сессией, подтверждает наличие двух реальных lock waiters в `pg_stat_activity`, затем отпускает блокировку и проверяет итоговое состояние.
- Допустимы оба порядка победы: callback → disconnect (токены удалены) или disconnect → callback (callback отклонён как stale). В обоих случаях аккаунт обязан остаться отключённым, без access/refresh token, а OAuth attempt — потреблённым.
- Скрипт подключён к `.github/workflows/atomic-payment-integration.yml` после SQL multi-account OAuth/publication regressions.
- Это тестовый harness, не production-изменение логики OAuth. AUD-024: concurrency coverage добавлена; результат остаётся FIXED_UNVERIFIED до фактического успешного CI выполнения.

## Дополнение к handoff — 2026-11-07 (AUD-025 generation reservation migration repair)

- При аудите миграции `054_pin_generation_credit_reservations.sql` обнаружена критическая порча SQL: тело `save_generated_pins_and_charge` было оборвано посередине regex-литерала, а два определения `complete_pin_generation_request` оказались вклеены внутрь тела другой функции. Несколько PL/pgSQL функций использовали одиночный `$` как dollar-quote delimiter вместо `$$`. Такая миграция не могла корректно примениться.
- Полностью восстановлена миграция 054: единый user-row lock для reserve/debit/settlement; проверка ownership доски и состава пинов; защита legacy debit от расходования зарезервированных кредитов; проверка charge against reservation; атомарное сохранение пинов, списание и перевод reservation в settled.
- Триггер переводит reservation в `settled` при completed, освобождает её только при definitive failed и сохраняет при unknown, чтобы неоднозначный ответ billable provider не освобождал бюджет для повторного расходования.
- Добавлен `backend/test/pin-generation-credit-reservations.integration.sql`: idempotency, запрет изменения суммы, блокировка конкурирующего debit, успешный settlement, release на definitive failure и удержание резерва при unknown.
- SQL regression подключён к `.github/workflows/atomic-payment-integration.yml` после применения миграции 054.
- AUD-025: FIX IMPLEMENTED, CI UNVERIFIED. PostgreSQL runner здесь недоступен; миграция и тест пока не объявляются успешно исполненными. Production не затрагивался.


## AUD-026 — восстановление задач генерации по сохранённому provider_task_id

**Статус: FIX IMPLEMENTED / CI UNVERIFIED**

При восстановлении генерации backend ранее мог повторно вызывать `POST /api/v2/media/tasks` даже при наличии сохранённого `provider_task_id` для задачи со статусом `queued`, `running` или `unknown`. Это создавало ненужную зависимость от срока хранения idempotency key у провайдера и риск повторной отправки billable create-запроса.

Исправлено:
- `backend/gptunnel.js`: выделен `waitForImageTask(taskId)`, который продолжает опрос существующей задачи; `generateImage` использует тот же poller после создания новой задачи.
- `backend/pins.js`: при восстановлении задачи с сохранённым provider task ID и статусом queued/running/unknown используется прямой polling, а не повторное создание.
- Добавлен `backend/test/gptunnel-recovery.test.js`: проверяет переход running → done, корректный результат, отсутствие повторного POST и обновление статуса.

Проверка: изменения сохранены в ветке `feat/persisted-boards-api`. Тест добавлен в стандартный `node --test` suite через `backend/package.json` (скрипт уже настроен на обнаружение тестов). Фактическое выполнение теста и PostgreSQL/CI пока не подтверждены.

## AUD-027 — восстановление уже отправленной перегенерации при изменившемся балансе

**Статус: FIX IMPLEMENTED / CI UNVERIFIED**

- В `POST /pins/:id/regenerate` проверка доступного баланса перенесена непосредственно перед новым вызовом GPTunnel create.
- Если журнал уже содержит `provider_task_id`, backend теперь продолжает проверять существующую задачу даже при уменьшившемся балансе. Это важно, поскольку внешний provider-запрос мог уже быть принят и тарифицирован.
- Если результат уже записан в журнал, восстановление Storage также выполняется без повторного provider create. Фактическое списание по-прежнему выполняет атомарный `complete_pin_regeneration_request`; при нехватке средств completion отклоняется, а сохранённый provider result остаётся доступен для последующей попытки после пополнения баланса.
- Новый provider create по-прежнему требует достаточного баланса до отправки.
- Изменён `backend/index.js`. Статус проверки: изменение проверено по контрольным участкам до/после патча; Node/HTTP/PostgreSQL tests и CI для этого коммита не запускались/не подтверждены. Production не затрагивался.

## AUD-028 — регрессионные тесты порядка платёжных вебхуков подписки

**Статус: TEST ADDED / CI UNVERIFIED**

- Проверены обработчики подписок и пакетов кредитов: успешная активация выполняется атомарными PostgreSQL RPC; повторные credit callbacks защищены `balance_credited_at` и атомарным `credit_paid_purchase`; неверная сумма/валюта уходит в журнал исключений.
- В обработчике подписок terminal cancel/deny обновляет строку только если она ещё не `success`. При этом SQL `activate_paid_subscription` допускает подтверждённый поздний `success` для ранее помеченной `denied/canceled` покупки. Это согласованная политика: поздний реальный платёж не теряется, но отмена после подтверждённой оплаты не отзывает доступ.
- Добавлены два регрессионных теста в `backend/test/prodamus-webhook.test.js`: cancel после success не понижает статус; корректный поздний success активирует ранее denied заказ.
- Production/payment credentials не затрагивались. Тесты добавлены, но фактически не запускались в этом окружении; CI для коммита не подтверждён.



### AUD-029 — серверные тарифные ограничения и ownership audit

**Результат: CONFIRMED STATIC REVIEW; no confirmed entitlement bypass.**

Проверены серверные маршруты `backend/index.js`, тарифная логика `backend/tariff.js` и интеграционные маршруты `backend/pinterest.js`.

- Генерация досок, генерация пинов и перегенерация требуют `requireTariff` с активным тарифом `start/pro/agency` (legacy alias `standard` нормализуется в `pro`).
- Планирование и retry публикации ограничены тарифами `start/pro/agency`; прямой publish endpoint также защищён тарифным middleware.
- Site analysis остаётся отдельной аналитической операцией; её отсутствие в generation guard согласуется с разделением аналитики и генерации в тарифной модели.
- OAuth callback Pinterest проверяет активность тарифа; лимит аккаунтов вычисляется на сервере и повторно проверяется атомарной DB-функцией при commit OAuth.
- Проверки досок и пинов сверяют владельца через связанный project.user_id; маршруты проектов фильтруют по req.userId. Списки/операции расписания и Pinterest-аккаунтов используют user_id из проверенного JWT.
- `requireAuth` проверяет подпись JWT, наличие userId и актуальную token_version из БД; ошибка проверки версии возвращает 503, а не открывает доступ.
- Dev tariff self-select отключён в production независимо от `ALLOW_TARIFF_SELF_SELECT`; production-изменения тарифа требуют admin.

**Ограничения аудита:** это статический обзор кода, не полноценный runtime/API security test. SQL-функция лимита Pinterest проверена по вызываемому контракту и результатам предыдущего аудита, но в этом проходе не запускалась. Распределённый rate-limit store не подтверждён: текущий `express-rate-limit` использует стандартное in-memory хранилище процесса, поэтому лимиты не являются глобальными между несколькими инстансами и сбрасываются при рестарте. Это эксплуатационное ограничение, не доказанный обход тарифа; при горизонтальном масштабировании следует подключить общий store (например, Redis).

Изменения прикладного кода в AUD-029 не вносились: подтверждённого дефекта тарифного обхода по проверенным маршрутам не найдено.


### AUD-030 — generation credit ceiling regression coverage

**Result: additional SQL regression case added; execution pending CI.**

Reviewed `backend/index.js`, `backend/pins.js`, `backend/credits.js`, `backend/creditsBilling.js`, `backend/devTopup.js`, and migration `054_pin_generation_credit_reservations.sql`.

- Generation validates requested pin count at 1–10, estimates the full request ceiling, and atomically reserves it before provider work.
- Reservation creation is serialized on the user row, idempotent by (user_id, idempotency_key), and rejects attempts to resize an existing reservation.
- Final settlement validates that actual charge is positive and does not exceed the reservation; it atomically saves pins, debits credits, and completes the request. A transaction failure rolls the whole settlement back.
- Definitive provider failure releases a reservation; ambiguous provider outcomes keep it reserved. Legacy generation debits also account for active reservations.
- Paid credit packs use server-side package IDs/prices and signed Prodamus callbacks; user-provided amounts are not trusted. The development top-up route is unavailable in production and requires a configured 32+ character ADMIN_SECRET outside production.

Added a SQL integration regression case to `backend/test/pin-generation-credit-reservations.integration.sql`: a completion attempt charging more than its reservation must fail without changing the balance or releasing the reservation. Existing test also covers idempotency, mismatch, reserved-balance protection, settlement, definitive failure, and ambiguous outcomes.

No confirmed credit-spending bypass was found in the reviewed paths. This remains static review plus test authoring; PostgreSQL integration test has not yet been executed locally. Do not interpret as production verification.


### AUD-031 — authentication and account recovery review (2026-11-07)

**Reviewed:** `backend/index.js`, `backend/auth.js`, `backend/password-reset.js`,
`backend/email-verify.js`, `backend/bearerToken.js`, `backend/validate.js`,
`backend/supabase.js`, and `backend/mail.js`.

**Controls confirmed by static inspection**
- Registration and login validate normalized email and enforce an 8–128 character password length.
- Password hashes use bcrypt; login performs a dummy bcrypt comparison when the account does not exist.
- Registration handles the database unique-email race (`23505`) rather than relying only on the preliminary lookup.
- Password-reset and email-verification tokens are generated from 32 random bytes; only SHA-256 hashes are sent to the database. Raw tokens are placed in email links.
- Password-reset and email-verification consumption are delegated to atomic SQL RPCs; the backend rejects malformed/oversized tokens and does not issue JWTs before email verification.
- Public forgot-password and anonymous resend-verification responses do not disclose whether an email exists.
- JWT verification checks signature/expiry; protected routes additionally compare JWT `tokenVersion` with the current database `token_version`. Database lookup failure returns 503 (fail closed).
- Authenticated resend-verification independently applies the same token-version fence.
- SMTP errors and database errors are not returned verbatim in 5xx API responses.

**Finding / operational limitation**
- `authLimiter` is an IP-based, in-memory limiter (10 requests per 15 minutes) shared by register/login/forgot-password/reset-password. `verifyLimiter` is also in-memory (30 requests per 15 minutes). This is not a distributed/global limit: separate backend instances have separate counters, and counters reset on process restart.
- No persistent per-account failed-login counter or account-level lockout was confirmed in the reviewed backend files. A distributed attacker can therefore spread password guesses across IPs; IP throttling alone is not a complete brute-force defense.
- Do not add a naive email-only lockout: it would let an attacker deny service to a victim by intentionally exhausting the victim's counter. A robust follow-up should use a shared store and carefully designed account+IP risk controls.
- `app.set("trust proxy", 1)` assumes exactly one trusted reverse proxy in front of the service. Deployment must preserve that topology; if the app is directly reachable or proxy depth differs, IP-based rate-limit identity may be spoofable or inaccurate.

**Verification limits**
- This pass was static. Auth/API integration tests were not executed.
- The SQL definitions for `issue_password_reset_token`, `consume_password_reset_token`, `issue_email_verification_token`, and `consume_email_verification_token` were not available at the reviewed repository paths in this pass; their transaction/locking internals and token-version increment behavior remain unverified here. Backend comments and call contracts are not a substitute for inspecting those SQL definitions.
- No production database, email provider, JWT secret, or deployment setting was changed.

**Status:** STATIC_REVIEW_COMPLETE / AUTH_RUNTIME_AND_SQL_UNVERIFIED. No confirmed authentication bypass was established. Recommended next action: inspect the exact deployed SQL RPC definitions and add auth integration tests, then implement a shared rate-limit store before horizontal scaling.


### AUD-032 — auth schema contract discrepancy (2026-11-07)

- Cross-checked the auth backend against `db/migrations/001_baseline.sql`, `db/migrations/009_hardening.sql`, and `docs/database.md`.
- `backend/index.js` reads `users.token_version` in `requireAuth` and in authenticated `/resend-verification`. However, the checked-in baseline `users` definition does not declare `token_version`; the documented expected users-column list also omits it. No addition was found in migration 009.
- If no later/deployment-only migration adds this column, protected API requests fail closed with 503 when PostgREST cannot select it. This is a potentially critical schema/code mismatch, but production impact is **not confirmed** because the complete later migration chain and live schema were not available in this pass.
- Added `backend/test/auth-schema-contract.sql`, a read-only SQL contract check requiring a NOT NULL integer/bigint `users.token_version` and the four auth RPC names used by the backend. It performs no DDL or data changes.
- The SQL contract test was not executed; no production database was accessed or modified.
- Next: run the contract check against staging/read-only database; inspect the exact definitions of `consume_password_reset_token` and `consume_email_verification_token`, confirming password reset increments `token_version` atomically. If the column is absent, add an idempotent migration before treating the auth rollout as ready.

**Status:** SCHEMA_DRIFT_SUSPECTED / LIVE_IMPACT_UNVERIFIED. Do not claim auth schema is production-ready until the contract passes.


### AUD-033 — исправление контракта users.token_version (2026-11-07)

- AUD-032 выявил расхождение: backend читает `users.token_version`, но baseline-схема не создавала колонку.
- Добавлена идемпотентная миграция `db/migrations/055_auth_token_version.sql`: существующим аккаунтам назначается версия 0; колонка получает DEFAULT 0, NOT NULL и CHECK >= 0.
- `db/migrations/001_baseline.sql` обновлена, чтобы новая установка сразу содержала ту же колонку.
- `backend/test/auth-schema-contract.sql` усилен проверкой DEFAULT 0 наряду с типом и NOT NULL.
- Миграция не применялась к production или staging. SQL-тест не запускался. Порядок применения: после предыдущих миграций схемы и до выкладки backend-кода, который читает token_version.
- На момент AUD-033 поведение SQL RPC ещё не было проверено. Это ограничение закрыто статическим аудитом миграций 020–025 в AUD-036: миграция 023 атомарно увеличивает `token_version` при успешной смене пароля; добавлены PostgreSQL regression/concurrency tests, их выполнение ожидает CI.

**Статус:** SCHEMA FIX IMPLEMENTED / SQL AND RUNTIME UNVERIFIED. Production не затрагивался.


### AUD-035 — auth recovery RPC trace (2026-11-07)

**Additional files inspected:** `backend/password-reset.js`, `backend/email-verify.js`,
`backend/auth.js`, `db/migrations/002_auth_tokens.sql`, and
`db/migrations/055_auth_token_version.sql`.

**Confirmed at the backend boundary**
- Password reset creates a 32-byte random base64url token, stores only its SHA-256 hash through `issue_password_reset_token`, and passes only the SHA-256 hash to `consume_password_reset_token`.
- The reset RPC receives `p_token_hash` and a bcrypt password hash. The backend changes no password row directly; it trusts the RPC boolean result.
- Email verification follows the same hash-only token pattern. Its consume RPC receives `p_token_hash`; the backend trusts its boolean result.
- Password-reset token TTL is 60 minutes; email-verification token TTL is 24 hours. Backend requests a 5-minute resend interval for both flows.
- Login signs JWTs with the current `user.token_version` (defaulting to 0 if absent). Migration 055 adds the NOT NULL integer counter with DEFAULT 0 and a nonnegative CHECK.

**Unresolved SQL verification**
- The actual bodies of all four RPCs remain unavailable in the checked-out branch paths. The documented database guide describes migrations 009–033 as a numbered chain but does not provide the exact RPC migration filenames. Guesses such as `020_password_reset.sql` and `021_email_verification.sql` return 404 on this branch.
- GitHub code search for the four RPC names returned no indexed matches; that search covers the default branch, so it is not proof that the definitions are absent from this feature branch or deployed database.
- Therefore we cannot yet establish whether token consumption uses row locks/conditional updates, whether issuance enforces cooldown and revokes older tokens atomically, or—most importantly—whether successful password reset increments `users.token_version` in the same transaction.
- Migration 055 only creates the counter; it does not change any RPC. The existing read-only schema contract test checks column presence/default and RPC names, but does not inspect function bodies or behavior.

**Decision:** no speculative SQL or concurrency test was added. Without exact function signatures and bodies, such a test could validate the wrong contract or give false confidence. Next required input is the exact migration(s) that define these four RPCs, or read-only function definitions from the target Supabase database. Then add tests for concurrent token consumption, expired/reused tokens, issuance cooldown/revocation, and password-reset session invalidation.

**Status:** BACKEND_CALL_CONTRACT_REVIEWED / RPC_IMPLEMENTATION_UNVERIFIED. No production database, credentials, or deployment were accessed or changed.


### AUD-036 — password-reset and email-verification SQL audit + regression tests (2026-11-07)

**Previously missing migration bodies located and reviewed:** migrations 020–025.

**Confirmed final migration-chain behavior**
- `020_atomic_password_reset.sql` defines atomic reset-token consumption and issuance. Consumption locks the user row before the token row, rechecks the token after acquiring locks, updates password and marks token used in one transaction.
- `023_revoke_sessions_after_password_reset.sql` replaces the consumer so password update and `token_version = coalesce(token_version, 0) + 1` happen in the same transaction before token consumption commits. This confirms old JWTs are invalidated by the existing `requireAuth` version comparison after a successful reset.
- `024_password_reset_email_cooldown.sql` replaces issuance with per-user row locking, cooldown validation, and invalidation of older live reset links. `025_drop_legacy_password_reset_overload.sql` removes the old three-argument overload, closing the earlier cooldown bypass.
- `021_atomic_email_verification.sql` locks user then token, checks expiry, sets `email_verified`, and consumes the token atomically. Repeated use returns idempotent success only if that account is already verified.
- `022_atomic_email_verification_issuance.sql` serializes issuance per user, enforces the configured cooldown, and invalidates older unused verification links.
- The final RPCs are SECURITY DEFINER with fixed `search_path = pg_catalog, public`; execute is revoked from public/anon/authenticated and granted to service_role.

**Tests added**
- `backend/test/auth-recovery.integration.sql`: PostgreSQL regression coverage for password-reset cooldown, preservation of current link during cooldown, successful password update + token_version increment, token reuse rejection, post-cooldown reissue, expired reset rejection, email-verification cooldown, successful/idempotent verification, and expired verification rejection.
- `backend/test/auth-recovery-concurrency.sh`: two independent PostgreSQL sessions contend on the same user row and consume the same reset token; asserts exactly one succeeds, token_version increments once, and token is consumed.
- Updated `.github/workflows/atomic-payment-integration.yml` to apply migration 055 after 054 and execute both auth recovery integration tests.

**Verification status**
- Source-level review confirms the intended lock ordering and transaction boundaries.
- GitHub connector writes were read back in the next verification step; CI result must be reported separately.
- Tests have not been run locally in this environment. No production/staging database or secrets were accessed; no migration was applied outside the disposable CI workflow.

**Status:** SQL_RPC_IMPLEMENTATION_REVIEWED / REGRESSION_TESTS_ADDED / CI_PENDING.


### AUD-037 — auth route enumeration and rate-limit deployment review (2026-11-07)

**Files inspected:** `backend/index.js`, `backend/auth.js`, `backend/password-reset.js`, `backend/email-verify.js`, `backend/validate.js`, `backend/mail.js`, `backend/bearerToken.js`, and `backend/package.json`.

**Confirmed protections**
- Login performs bcrypt comparison against a fixed dummy hash when the email lookup returns no user; wrong-password and unknown-user cases return the same 401 message.
- Password-reset requests return the same public success payload whether the account exists, the cooldown blocks issuance, or no transactional SMTP is configured. The reset URL base is taken from server configuration, not the caller-supplied frontendUrl.
- Anonymous email-verification resend returns a generic response; token application rejects malformed/oversized tokens and delegates consumption to the atomic SQL RPCs reviewed in AUD-036.
- Protected requests compare JWT tokenVersion with the current database token_version; lookup failure is fail-closed (503). Authenticated resend applies the same version fence.
- Reset and verification tokens are random 32-byte values; only SHA-256 hashes are stored through the RPC boundary.

**Finding — registration email enumeration**
- `POST /register` returns HTTP 409 with the explicit message “Пользователь с таким email уже существует” when the email is already registered, while a new address returns a success response. An unauthenticated caller can therefore test whether an address has an account.
- This is a confirmed account-enumeration surface, not an authentication bypass. No change was made in this pass because changing duplicate-registration semantics can affect the frontend's registration/recovery UX; frontend handling must be inspected before choosing a generic response or alternate flow.

**Operational limitation — rate limiting**
- `authLimiter` (10 requests / 15 minutes) and `verifyLimiter` (30 / 15 minutes) use express-rate-limit's default in-memory store. `backend/package.json` contains no Redis client or shared-store dependency. Counters are process-local and reset on restart, so the limits are not global across multiple backend instances.
- `app.set("trust proxy", 1)` assumes exactly one trusted reverse proxy. Deployment topology must match that assumption; otherwise client-IP attribution for IP rate limiting may be inaccurate or spoofable.
- No persistent per-account failed-login counter was found in the inspected auth module. Do not add a naive email-only lockout because it can be abused to deny service to a victim.

**Decision / next steps**
- Before changing registration behavior, inspect the frontend's duplicate-email handling and decide whether a generic registration response is compatible.
- Before horizontal scaling, configure a shared rate-limit store and verify the actual proxy chain. Do not add Redis as an assumed dependency without confirming deployment support and environment configuration.
- No code, dependency, rate-limit, production, or deployment changes were made in this pass. This is a static review only; no runtime tests were executed.

**Status:** STATIC_REVIEW_COMPLETE / REGISTRATION_ENUMERATION_CONFIRMED / DISTRIBUTED_RATE_LIMIT_NOT_CONFIGURED.


### AUD-038 — registration enumeration: frontend flow compatibility review (2026-11-07)

**Frontend files inspected:** `frontend/src/pages/Register.tsx`, `frontend/src/pages/CheckEmail.tsx`, `frontend/src/pages/Login.tsx`, `frontend/src/pages/ForgotPassword.tsx`, and `frontend/src/lib/api.ts`.

**Confirmed behavior**
- Registration submits to `POST /register`; on any successful response the UI navigates to `/check-email?email=...`.
- On an API error, the registration page renders `err.message` directly. Therefore backend HTTP 409 and “Пользователь с таким email уже существует” are exposed verbatim to an unauthenticated visitor.
- The check-email page supports anonymous resend via `POST /resend-verification`; the backend returns a generic public response for this mode. The login and password-reset screens provide alternate recovery paths.
- There is no frontend-specific handling for duplicate registration (no neutral duplicate state or explicit sign-in/recovery guidance).

**Remediation decision**
- Do not simply change duplicate registration from 409 to 200: the frontend would navigate to a “check your email” screen even though no account was created, creating a misleading flow.
- Do not blindly resend verification for every duplicate: verified accounts do not need a verification message, and that still leaves an unclear UI state.
- A correct remediation should make duplicate and fresh-address public outcomes indistinguishable while presenting a neutral next-step screen that offers sign-in and password recovery; the UI must not claim an account was created or that an email was sent unless that is true. This requires a coordinated backend + frontend change and regression tests.

**Status:** ROOT_CAUSE_CONFIRMED / FRONTEND_IMPACT_CONFIRMED / FIX_DEFERRED_PENDING_NEUTRAL_FLOW_DESIGN. No source code changes or tests in this pass.



### AUD-039 — Pinterest OAuth callback, state fencing, and CORS review (2026-11-07)

**Files inspected:** `backend/pinterest.js`, `backend/index.js`, and the existing `backend/test/pinterest-oauth-concurrency.sh`. The separate `backend/pinterestOAuth.js` module does not exist at this branch path; OAuth implementation is in `backend/pinterest.js`.

**OAuth protections confirmed by static inspection**
- OAuth initiation is authenticated. It reads the current user's `token_version`, creates a cryptographically random UUID attempt ID, and calls `begin_pinterest_oauth_attempt` before returning the Pinterest authorization URL.
- The OAuth `state` is a JWT signed with `JWT_SECRET`, expires after 15 minutes, and includes user ID, session token version, attempt ID, generation, and a purpose discriminator. Callback verifies signature/expiry and validates required claim shapes.
- Callback reloads the user's current `token_version` and rejects a missing user or stale session before exchanging the authorization code.
- Successful callback persistence is delegated to `commit_pinterest_oauth_attempt_v2`, with the exact attempt ID, generation, token version, Pinterest identity, and encrypted credentials. The returned result is checked; stale/invalid attempts are not treated as successful connections.
- The callback redirect destination is built from server-side `FRONTEND_URL` (first comma-separated value) or the fixed default `https://pinposy.com`; callback query parameters select only fixed status values. No caller-controlled redirect URL is accepted.
- Existing `backend/test/pinterest-oauth-concurrency.sh` exercises a real two-session database race between callback commit and disconnect, asserting that disconnect wins and credentials remain cleared. This test is wired into the existing integration workflow from earlier work; it has not been executed in this review.

**CORS configuration reviewed**
- Browser origins are checked against an exact allowlist: the two production PinPosy hostnames, the Vercel frontend hostname, localhost:3000, and comma-separated `FRONTEND_URL` values.
- No wildcard origin is configured and the CORS middleware does not enable credentialed cookies. Requests without an Origin header are allowed; this is normal for server-to-server clients and is not an authentication control. API authorization remains the responsibility of route middleware.
- The allowlist is constructed per request. Deployment must keep `FRONTEND_URL` values as bare origins (scheme + host + optional port, without a path or trailing slash), otherwise an otherwise legitimate browser origin may fail the exact string comparison. The actual deployed environment values and proxy topology were not available, so live-origin compatibility is unverified.
- `app.set("trust proxy", 1)` remains a deployment assumption noted in AUD-037; this review did not establish the actual production proxy chain.

**Assessment / limits**
- No confirmed OAuth state-forgery, callback open-redirect, cross-user account-binding, or CORS-origin bypass was identified in the inspected code paths.
- This is a source-level review. SQL function bodies were not re-audited in this pass; the existing concurrency test demonstrates the intended database contract but is not proof of a successful CI execution.
- No production/staging configuration, database, credentials, deployment, or external Pinterest account was accessed or changed. No source-code change was justified by the findings.

**Status:** STATIC_REVIEW_COMPLETE / OAUTH_STATE_AND_CALLBACK_GUARDS_CONFIRMED / CORS_ALLOWLIST_CONFIRMED / DEPLOYED_ORIGINS_AND_RUNTIME_UNVERIFIED.



### AUD-040 — Pinterest refresh reconciliation after uncertainty fencing (2026-11-07)

**Confirmed defect:** `refreshAccessToken()` writes `refresh_state = 'uncertain'` and advances `updated_at` before calling Pinterest. Both ambiguous-commit recovery branches then compared the current row's `updated_at` to the pre-fence `latest.updated_at`. Therefore the timestamp change caused solely by installing the uncertainty fence could be mistaken for evidence that rotated credentials had been committed. This could return an account still fenced as uncertain as if refresh recovery had succeeded. The fence still prevented replaying the old refresh token, so this was a recovery/consistency bug rather than a demonstrated credential-replay bypass.

**Fix**
- Added `backend/pinterestRefreshRecovery.js` with a pure `isCommittedTokenRefresh(previous, current)` predicate.
- Reconciliation now succeeds only if the row has returned to `refresh_state = 'ready'` and at least one stored credential differs from the pre-refresh snapshot. A timestamp-only change or a changed token set that remains uncertain is not accepted.
- Both ambiguous RPC-error and false-commit-result paths use the same predicate.
- Added `backend/test/pinterest-refresh-recovery.test.js` covering timestamp-only uncertainty fence, successful rotated credentials, unchanged ready credentials, and changed credentials still marked uncertain.

**Verification:** source files and the AUD-040 handoff entry were fetched back from the branch; their content SHAs matched the successful writes. GitHub Actions runs associated with the code commits reported failures in existing workflows (Atomic payment fulfillment integration, Prodamus webhook tests, and Persisted boards integration checks). The GitHub API listed failed jobs, but downloading their logs returned `BlobNotFound`; therefore the failure causes cannot be attributed to this change or diagnosed from available evidence. The repository defines `npm test` as `node --test`, but this review environment did not execute the project test suite. The final documentation commit had no associated PR workflow run.

**Status:** FIX_IMPLEMENTED / REGRESSION_TEST_ADDED / TESTS_AND_CI_UNVERIFIED. No production/staging database, Pinterest credentials, deployment, or external account was accessed or changed.


### AUD-041 — Pinterest refresh lease and disconnect fencing (2026-11-07)

**Files inspected:** `backend/pinterest.js`, `backend/pinterestAccountRequest.js`, and migrations `026`, `027`, `031`, `032`, and `036`.

**Confirmed invariants**
- The active account-scoped lease is keyed by `pinterest_account_id`, not merely by PinPosy user. Distinct Pinterest identities can refresh independently.
- Lease acquisition verifies that the account belongs to the supplied user and is active. Token commit requires the same user, account, live lease ID, active account row, and expected `updated_at`.
- Disconnect removes the account-scoped lease before clearing credentials and setting `disconnected_at`. A refresh worker that returns after disconnect therefore cannot satisfy the commit RPC's live-lease check.
- OAuth reconnect updates the same stable identity row and its `updated_at`; a refresh commit based on the old row version cannot overwrite the reconnect.
- `executeWithAccountToken` limits recovery to one 401 refresh and one optional 429 retry. Publishing disables 429 replay because creating a pin is non-idempotent. A 401 retry is distinct: the rejected unauthorized request is not treated as a successful create.

**Regression test added**
- Added `backend/test/pinterest-refresh-disconnect-fencing.integration.sql`. It acquires a real account-scoped lease, disconnects the account, simulates a late refresh worker attempting to commit rotated credentials, and asserts that commit returns false, credentials remain null, the account remains disconnected, and no refresh lease remains.
- Wired the SQL test into `.github/workflows/atomic-payment-integration.yml` after the Pinterest uncertainty-fence check.

**Verification limits**
- The test and workflow changes were written to the feature branch. They have not been executed in this environment; CI must confirm SQL behavior against the full migration chain.
- This pass found no additional confirmed implementation defect in the inspected refresh/disconnect/reconnect paths. The new test is regression coverage for the database fencing contract, not proof of a live multi-process race test.
- No Pinterest credentials, external Pinterest account, production/staging database, deployment, or live API call was accessed or changed.

**Status:** STATIC_REVIEW_COMPLETE / DISCONNECT_FENCING_REGRESSION_ADDED / CI_PENDING.


### AUD-042 — recover an ambiguous Pinterest token-commit response (2026-11-07)

**Confirmed gap:** After Pinterest returned a complete rotated token pair, a transient/ambiguous response from `commit_pinterest_account_token_refresh` caused the backend to reconcile once and then return an error if the database had not committed. This could force OAuth reconnect even though the new token pair was still available in process memory.

**Change:** `backend/pinterest.js` now retries the exact same account-scoped database commit once when the first RPC returns an error. It reuses the same lease ID, expected account-row version, and provider-returned token pair. It does not call Pinterest again and never replays the old refresh token. The SQL commit function serializes through the lease row and consumes the lease on success:
- If the original RPC did not commit, the retry can commit the same rotated pair while the lease remains valid.
- If the original RPC committed but its response was lost, the retry returns false because the lease was consumed; the backend then reconciles by checking that stored credentials changed and `refresh_state` is `ready`.
- If reconnect/disconnect wins, account version / active-row / lease checks prevent the stale commit from overwriting it.

**Regression coverage:** Extended `backend/test/pinterest-refresh-disconnect-fencing.integration.sql` with a second scenario: commit the rotated pair, repeat the identical commit as if the first success response was lost, assert the duplicate is rejected and the already-committed credentials remain intact and ready. The same integration SQL file remains wired into `.github/workflows/atomic-payment-integration.yml`.

**Verification:** Changes were fetched back from GitHub and confirmed. PostgreSQL and Node tests were not run locally. CI status for the new commits is pending/unknown; prior workflow logs returned `BlobNotFound`, so no pass is claimed. No live Pinterest request, credentials, production/staging database, deployment, or merge was performed.

**Status:** AMBIGUOUS_COMMIT_RECOVERY_IMPROVED / SQL_REGRESSION_ADDED / CI_PENDING.


## Дополнение к handoff — 2026-11-07 (AUD-042)

- Проверен сценарий параллельного 401 на одном Pinterest-аккаунте. Первый backend-инстанс получает account-scoped refresh lease и выставляет `refresh_state='uncertain'` перед запросом к Pinterest.
- Найден UX/availability дефект: второй инстанс, не получивший lease, при первом чтении `refresh_state='uncertain'` немедленно возвращал 409 с требованием OAuth reconnect. Это происходило даже при действующем lease другого инстанса, то есть пока корректное обновление ещё выполнялось.
- Исправлено: ожидающий инстанс проверяет `pinterest_account_refresh_leases` и продолжает polling только при действующем lease. После успешного commit он получает свежие credentials; если lease отсутствует/истёк, неопределённый исход остаётся fenced и безопасно требует reconnect. Ошибка чтения lease приводит к 503, а не к ложному утверждению, что аккаунт нужно подключить заново.
- `backend/pinterestRefreshRecovery.js` получил чистую проверку активного lease; добавлены 3 unit cases (активный, истёкший, отсутствующий/некорректный lease).
- Также подтверждено, что account-scoped RPC действительно создаются migration 031 и эта миграция применяется atomic-payment workflow; первоначальное подозрение о пропущенной миграции было ошибочным.
- AUD-042: FIXED_UNVERIFIED. Node tests и PostgreSQL integration не запускались в этом этапе; CI необходимо проверить по PR. Никаких production DB/API credentials, Pinterest accounts, deployments или merges не затрагивалось.


## Дополнение к handoff — 2026-11-07 (AUD-043)

- Проверена гонка reconnect vs refresh для одной Pinterest identity. OAuth reconnect использует стабильную строку аккаунта и может заменить access token, но сохранить прежний refresh token, если провайдер не прислал новый.
- Найден ложноположительный результат reconciliation: helper `isCommittedTokenRefresh` считал изменение только access token достаточным доказательством, что завершился именно refresh. В гонке reconnect это неверно: credentials могли измениться из-за OAuth reconnect, а не из-за ответа refresh endpoint.
- Исправлено: успешное reconciliation refresh теперь требует `refresh_state='ready'` И изменения обоих токенов относительно pre-refresh snapshot. Это соответствует строгой проверке полного rotated token pair в ответе Pinterest. Добавлен regression test для reconnect с новым access token и сохранённым прежним refresh token.
- AUD-043: FIXED_UNVERIFIED. Node и PostgreSQL tests не запускались в этом этапе; CI результаты предыдущих запусков остаются failure с недоступными логами BlobNotFound. Никаких production DB/API credentials, Pinterest accounts, deployments или merges не затрагивалось.

## Дополнение к handoff — AUD-044 (2026-11-07)
- Проверено соотношение времени: Pinterest token request использует `TIMEOUT_MS = 10000` (10 секунд); refresh lease запрашивается на 30 секунд, а SQL-функция ограничивает срок lease диапазоном 10–60 секунд.
- При штатном выполнении provider request должен завершиться раньше lease. Если процесс/сеть/БД задерживаются настолько, что lease истекает, новый backend может получить новый lease. Старый backend не может сохранить ответ: `commit_pinterest_account_token_refresh` сверяет lease ID и срок действия. Поскольку refresh уже помечен как `uncertain`, новый backend не повторяет старый refresh token, а завершает операцию безопасной ошибкой. Это fail-closed поведение: возможна повторная OAuth-авторизация, но устаревший worker не должен перезаписать credentials.
- Добавлен SQL regression scenario: истёкший lease заменяется новым; commit от старого lease обязан вернуть false и не менять токены/снимать `uncertain`.
- AUD-044: FIXED_TEST_ADDED_UNVERIFIED. SQL integration не запускался в этой среде; требуется CI/локальный disposable PostgreSQL. Node unit tests также не запускались. Production DB/API, Pinterest accounts, deployment и merge не затрагивались.

## Дополнение к handoff — AUD-045 (2026-11-07)
- Проверена связка migration 036 (trigger `pinterest_accounts_reset_refresh_state`) и migration 032/038 (OAuth identity upsert). Reconnect явно обновляет access token; trigger сбрасывает `refresh_state` в `ready`, даже если provider не прислал новый refresh token и SQL сохранил прежний.
- Account-scoped refresh commit дополнительно fenced через lease ID и `p_expected_updated_at`: после reconnect timestamp строки меняется, поэтому старый refresh worker не должен записать свой ответ поверх OAuth credentials.
- Добавлен SQL integration regression block в `backend/test/pinterest-multi-account-oauth.integration.sql`: имитируется in-flight refresh (`uncertain` + действующий lease), OAuth reconnect с сохранением прежнего refresh token, проверка возврата в `ready`, затем попытка stale commit и проверка неизменности reconnect credentials.
- AUD-045: TEST_ADDED_UNVERIFIED. SQL integration не запускался локально; требуется CI на disposable PostgreSQL после migrations 026–038. Никакие production credentials/accounts, deployment или merge не затрагивались.


## Дополнение к handoff — AUD-046 (2026-11-07)
- Повторно проверена конкурентность OAuth callback, disconnect и account-scoped refresh по migrations 028, 031, 032, 038, backend route handlers и `backend/test/pinterest-oauth-concurrency.sh`.
- Подтверждено: OAuth state хранится на уровне PinPosy user, поэтому одновременно допускается одна актуальная попытка привязки на пользователя. `begin_pinterest_oauth_attempt` увеличивает generation; новая вкладка/попытка вытесняет предыдущую. Это намеренно и соответствует комментарию migration 032.
- `commit_pinterest_oauth_attempt_v2` блокирует state row, проверяет generation + attempt_id + token_version + TTL, затем блокирует user row и account row; запись credentials и потребление попытки выполняются в одной транзакции.
- `disconnect_pinterest_account_v2` также сначала блокирует/обновляет state row и инвалидирует текущую OAuth-попытку, затем удаляет refresh lease и очищает только выбранную account row. Поэтому disconnect одного Pinterest-аккаунта отменяет текущую OAuth-попытку пользователя целиком (в том числе попытку привязать другой аккаунт). Это следует из user-scoped OAuth state и является существующим поведением, а не доказанным дефектом.
- Сверен порядок блокировок: OAuth commit = state → user → account; disconnect = state → lease → account; refresh commit = lease → account. В просмотренных функциях не найдено обратного захвата этих строк, который подтверждал бы цикл deadlock. Предварительный `exists` в disconnect не удерживает row lock; окончательный UPDATE повторно проверяет `disconnected_at is null`.
- Существующий shell integration test действительно создаёт двух независимых contenders под общей блокировкой state row, дожидается обоих lock waiters и проверяет конечный инвариант: после disconnect токены очищены, аккаунт помечен отключённым, OAuth attempt не остаётся активной. Workflow применяет migrations 028–038 и запускает этот test.
- Небольшая особенность UX: callback с отказом пользователя или ранним `plan_required` redirect не потребляет attempt немедленно; запись остаётся до TTL (15 минут) либо до следующего begin/disconnect. Новая попытка всё равно может стартовать и увеличит generation, поэтому блокировки пользователя нет. Отдельный фикс не обоснован.
- Дополнительный кодовый фикс не вносился: подтверждённой гонки/уязвимости не обнаружено. Это статический аудит; shell/SQL integration и CI в этой сессии не запускались.

**Status:** STATIC_REVIEW_COMPLETE / OAUTH_DISCONNECT_FENCING_CONFIRMED / LOCK_ORDER_REVIEWED / NO_CONFIRMED_DEFECT.


## Дополнение к handoff — AUD-047 (2026-11-07)
- Проверены migrations 032/033/038, backend `tariff.js` и Pinterest routes/service, а также SQL integration cases multi-account OAuth и account-scoped publication.
- Подтверждена согласованность тарифного gate в актуальной migration 038 и backend `getTariffState`: aliases standard→pro/free→none; при наличии successful subscription берётся последняя запись с одинаковой сортировкой period_end DESC NULLS LAST, created_at DESC, id DESC; expiry вычисляется через subscription period_end с fallback на users.tariff_period_end. Для ручного тарифа без subscription explicit expiry также соблюдается. В migration 032 это было не так для ручного тарифа; migration 038 уже исправляет это forward-only.
- Лимиты аккаунтов в RPC: analytics=1, start=3, pro=10, agency=unlimited. OAuth callback блокирует user-scoped state row и user row до подсчёта активных аккаунтов; параллельные OAuth callbacks не могут одновременно обойти cap. Повторное подключение той же Pinterest identity переиспользует строку и не расходует дополнительный слот. SQL integration покрывает Start cap, reconnect stability и manual-expiry cases.
- Backend account resolution не выбирает аккаунт произвольно при нескольких подключённых профилях: без account_id возвращается 422; account_id разрешается только внутри текущего user_id и только для активного аккаунта. Boards endpoint и publish route передают выбранный account_id; доска проверяется запросом от имени того же аккаунта. Фоновая публикация использует account_id, сохранённый в schedule.
- Account-scoped publication SQL проверяет владельца локального pin и активность Pinterest account; idempotency/publication unique keys привязаны к pin+account. Legacy attempts/publications без account mapping fail closed и не приписываются новому профилю. Disconnect оставляет историю публикаций, а будущие расписания выбранного профиля переводятся в failed; уже отправленный внешний запрос может завершиться, что явно отражено в UX предупреждении.
- Найденной подтверждённой ошибки в рассмотренной backend/SQL логике нет; новый код и миграции не добавлялись. Проверка не включала полное визуальное тестирование frontend account picker и не запускала Node/PostgreSQL/CI.

**Status:** STATIC_REVIEW_COMPLETE / TARIFF_CAPS_AND_ACCOUNT_SCOPING_REVIEWED / NO_CONFIRMED_BACKEND_DEFECT.


## Дополнение к handoff — AUD-048 (2026-11-07)

- Начат статический аудит фоновой публикации и восстановления расписаний: `backend/pinterest.js`, `backend/pinterestSchedule.js`, `backend/test/pinterest-schedule.test.js`, migration 033.
- Подтверждено: `claim_due_pin_schedules` использует `FOR UPDATE SKIP LOCKED`, ограничивает batch до 10 записей, помечает просроченные задания без активного Pinterest-аккаунта как failed, а после 20 минут пытается сверить зависшие `publishing` по журналу публикаций. Если журнал уже `published`, расписание восстанавливается как `published`; иначе оно переводится в `unknown`, а не отправляется повторно автоматически.
- Backend после обработки обновляет расписание только при совпадении `id`, `status='publishing'` и `claim_token`; это intended stale-worker fencing. Worker проверяет тариф повторно непосредственно перед публикацией, а account_id/board_id берёт из сохранённой записи расписания. Snapshot полей title/description/image/destination сохраняет запланированный creative при последующем редактировании исходного pin.
- Retry policy в `pinterestSchedule.js` закрытая: неизвестный/processing журнал не повторяется; journal failure разрешает retry только при `status='failed' AND retry_safe=true`; без journal допускаются только определённые transient pre-publication ошибки. Unit tests описывают эти политики, но в этом аудите не запускались.
- Важный оставшийся вопрос для следующего прохода: в видимой реализации `claim_due_pin_schedules` из migration 033 переход `scheduled → publishing` обновляет `status`, `attempts`, `updated_at`, но не присваивает новый `claim_token`, хотя backend требует claim_token для `begin_scheduled_pinterest_publish` и для guarded status update. Предыдущую migration, создающую таблицу/trigger/default для `claim_token`, в этом проходе найти и проверить не удалось. Поэтому нельзя пока заключить, что token отсутствует или не ротируется; необходимо проверить исходное DDL/trigger и SQL-функцию `begin_scheduled_pinterest_publish` до любого исправления.
- Ветка `feat/persisted-boards-api`; production/стейджинг, Pinterest API, публикации и deployment не затрагивались. Это частичный static review; Node/PostgreSQL/CI не запускались. Кодовых изменений не сделано.

**Status:** PARTIAL_STATIC_REVIEW / SCHEDULE_RECOVERY_AND_RETRY_POLICY_REVIEWED / CLAIM_TOKEN_ROTATION_REQUIRES_SCHEMA_VERIFICATION.


### AUD-048 — продолжение: claim fencing и исправление миграции

- По дереву репозитория найдены исходные миграции 015/017 и поздние исправления 047–052. Миграция 049 полностью реализует claim fencing: добавляет `claim_token`, создаёт токен через `gen_random_uuid()` при каждом claim, сбрасывает токен trigger-ом при любом переходе из `publishing`, очищает токен при stale recovery и проверяет точный токен в `begin_scheduled_pinterest_publish` под `FOR UPDATE` блокировкой строки расписания.
- Race analysis: claim RPC блокирует schedule row; `begin_scheduled_pinterest_publish` берёт ту же row lock и создаёт durable publish attempt в той же транзакции. Если recovery выигрывает первым, старый token очищен и старый worker не может зарезервировать attempt/отправить POST. Если reservation выигрывает первым, recovery увидит attempt journal и поставит `unknown`, не requeue; поздний подтверждённый ответ `complete_pinterest_publish_v2` (migration 047) атомарно обновит publication ledger и schedule из `publishing`/`unknown` в `published`.
- Найден реальный дефект migration 049: тело trigger function `clear_nonpublishing_pin_schedule_claim_token` было обрамлено одинарным `$` вместо корректного `$$`. Это невалидный PostgreSQL dollar-quote delimiter и могло остановить последовательное применение миграций на шаге 049.
- Исправлено в `db/migrations/049_pinterest_schedule_claim_fencing.sql`: `as $$ ... $$;`. Файл повторно загружен из ветки и проверен; blob SHA `5ade3e2e7a3bd2c3161ef537486fb9101c7c2c05`. Commit исправления: `36106529ef71f87aa199cdac1e0422f636938fd2`.
- Существующий `backend/test/pinterest-account-publication.integration.sql` уже покрывает stale pre-journal recovery, очистку старого token, выпуск нового token и отказ старому worker, а также успешную reservation текущим token. Workflow `atomic-payment-integration.yml` применяет миграции 015–055 и запускает этот SQL integration test после применения миграций 031–052.
- PostgreSQL/Node/CI не запускались в этой сессии; `psql` отсутствует в рабочем окружении. CI нужно дождаться на PR. Production/стейджинг не затрагивались; никаких публикаций, миграций или deployment вне GitHub не выполнялось.

**Status:** STATIC_REVIEW_COMPLETE / CLAIM_FENCING_CONFIRMED / MIGRATION_049_SQL_QUOTING_FIXED / CI_PENDING.

## Дополнение к handoff — 2026-11-07 (AUD-049: disconnect / publish reservation race)

- В статическом анализе выявлена гонка между `disconnect_pinterest_account_v2` и `begin_scheduled_pinterest_publish`: disconnect сначала обновляет строку Pinterest-аккаунта, затем переводит только queued schedules в failed; worker ранее блокировал schedule row, а проверка активности account в `begin_pinterest_publish_v2` выполнялась без row lock. При конкурентном выполнении проверка могла увидеть активный аккаунт, пока disconnect уже завершался, и durable attempt мог быть создан после того, как отключение выиграло гонку.
- Добавлена migration 056 `db/migrations/056_pinterest_account_lock_before_publish_reservation.sql`: `begin_pinterest_publish_v2` теперь удерживает `FOR UPDATE` lock на активном account row до создания/повторной резервации durable attempt. `begin_scheduled_pinterest_publish` сначала блокирует account, затем schedule, после чего проверяет claim token и резервирует attempt. Это выравнивает lock order с disconnect и manual retry: account → schedule → publication journal.
- Добавлена SQL integration regression в `backend/test/pinterest-account-publication.integration.sql`: после commit отключения аккаунта worker с прежним claim token не может зарезервировать attempt; тест отдельно проверяет отсутствие journal row.
- Workflow `.github/workflows/atomic-payment-integration.yml` теперь применяет migration 056 перед integration tests.
- GitHub commits: migration 056 `25eed8d5a23d0e1fb7a81cf4293330c015e4c803`; integration regression `b66ed2f394724100e1151f2d90110008e5609d47`; workflow `b371b4ecdcbc57a2f7824e17952f41eda41639ad`.
- CI для commit `b371b4ecdcbc57a2f7824e17952f41eda41639ad` запустился, но три workflow завершились failure: Persisted boards integration checks, Atomic payment fulfillment integration, Prodamus webhook tests. Job summaries не вернули step details; попытка получить логи завершилась BlobNotFound, поэтому причина падения пока не установлена. Это не считается прохождением CI и не доказывает регрессию migration 056.
- PostgreSQL integration SQL в этой сессии локально не запускался. Production/staging DB, Pinterest API, реальные публикации и deployment не затрагивались. PR #4 остаётся открытым; merge не выполнялся.

**Status:** STATIC_RACE_FOUND / MIGRATION_056_ADDED / DISCONNECT_RESERVATION_FENCED / SQL_REGRESSION_ADDED / CI_FAILURE_LOGS_UNAVAILABLE.

## Дополнение к handoff — 2026-11-07 (AUD-050: publication completion lock order)

- Дополнительный статический анализ обнаружил lock-order inversion: `begin_scheduled_pinterest_publish` удерживает account → schedule и затем входит в `begin_pinterest_publish_v2`, где блокирует publication attempt; `complete_pinterest_publish_v2` в migration 047 ранее блокировал attempt первым и только затем обновлял schedule. При совпадении pin/account и конкурентном late-success completion это создавало цикл ожидания между schedule и attempt.
- Добавлена migration 057 `db/migrations/057_pinterest_publish_completion_lock_order.sql`: completion теперь блокирует account row (включая отключённый account — подтверждённый remote success всё равно должен быть reconciled), затем matching active/unknown schedule row, затем attempt row. Это согласует completion с reservation/manual retry и сохраняет позднюю reconciliation после disconnect.
- В completion schedule lock ограничен статусами `publishing`/`unknown`; direct publish и completion после удаления локального pin продолжают работать без schedule row. Существующая SQL integration regression уже вызывает completion после удаления pin и проверяет сохранение remote publication ledger.
- Integration test header обновлён до migrations 031–057; workflow применяет migration 057 после 056.
- GitHub commits: migration 057 initial `0362f857871418eac6c9ccfbc9194aa8e8b48a9c`; test header `bb6d5bdca7dfb5505c01e7ed828877f7bfd35b4a`; workflow `501118d5f3d34dd446337b6e6478715147c5a008`; schedule lock predicate refinement `bb895e01a156adc2a867d54362b4479a81ae4370`.
- Это статический lock-order fix; параллельный PostgreSQL stress/deadlock test не запускался. Предыдущие CI runs на commit `b371b4ecdcbc57a2f7824e17952f41eda41639ad` завершились failure без доступных job logs (BlobNotFound); причина не установлена. Production/staging, Pinterest API и deployment не затрагивались.

**Status:** STATIC_DEADLOCK_CYCLE_FOUND / MIGRATION_057_ADDED / COMPLETION_LOCK_ORDER_ALIGNED / SQL_TEST_SEQUENCE_UPDATED / CI_UNVERIFIED.

- Дополнительная проверка CI после изменения workflow: commit `501118d5f3d34dd446337b6e6478715147c5a008` запустил те же три PR workflows; все завершились `failure` почти сразу. Для всех четырёх job (backend, frontend, postgres-atomicity, backend-tests) API вернул `steps: null`, а скачивание job logs — `BlobNotFound`. Commit `bb895e01a156adc2a867d54362b4479a81ae4370` и handoff commit `b43c0d0f9f1751f2b01a3d6de812b0a0ee5444dd` не имеют отдельных workflow runs. Combined status показывает Vercel `failure` с target `upgradeToPro=build-rate-limit`; это отдельный build-rate-limit сигнал, не доказательство ошибки миграции.


## Дополнение к handoff — 2026-11-07 (AUD-051: выбор active schedule при completion)

- Повторная проверка migration 057 выявила неполное условие блокировки schedule: completion выбирал последнюю по updated_at запись для pin/account без фильтра статуса, а затем обновлял только publishing/unknown. Если более новая запись была failed или cancelled, блокировалась не та строка, которую completion собирался reconciliate. Это ослабляло гарантию lock order AUD-050.
- Добавлена forward-only migration 058 db/migrations/058_pinterest_publish_completion_active_schedule_lock.sql: запрос schedule row теперь фильтрует status in ('publishing','unknown') до ORDER BY/LIMIT/FOR UPDATE. Прямые публикации и completion после удаления pin по-прежнему допускают отсутствие schedule row; отключённый account по-прежнему блокируется для корректной late-success reconciliation.
- Добавлен SQL integration scenario: для одного pin/account создаются более новая запись failed и более старая publishing; scheduled attempt завершается успешно, активная запись должна стать published, а failed history должна остаться failed. Header test обновлён до migrations 031–058.
- Workflow .github/workflows/atomic-payment-integration.yml применяет migration 058 после 057.
- GitHub commits: migration 058 3067644201cb8a8b9fc72abf9d51e2f4679c30cf; SQL regression a9d9476fc0d13edd7d130a18f46b9b76208cbc73; workflow 951d72e854281d3c998606d7a0395f3bcfb3c2b0.
- Это статическое исправление + добавленный SQL regression; PostgreSQL integration не запускался в этой сессии. Предыдущие CI runs завершались failure, но GitHub connector не отдавал job logs (BlobNotFound); поэтому migration 058 пока не считается проверенной CI. Production/staging DB, Pinterest API, реальные публикации, deployment и merge не затрагивались.

**Status:** STATIC_DEFECT_FOUND / MIGRATION_058_ADDED / ACTIVE_SCHEDULE_LOCK_FILTERED / SQL_REGRESSION_ADDED / CI_UNVERIFIED.


## Дополнение к handoff — 2026-11-07 (AUD-052: блокировка полного набора schedule rows)

- В ходе продолжения AUD-051 найдено, что complete_pinterest_publish_v2 обновляет все строки pin_schedules со статусами publishing/unknown для pin/account, но блокировала заранее только одну строку через LIMIT 1. При нескольких unknown строках оставшиеся UPDATE targets могли блокироваться уже после блокировки publication attempt, нарушая заявленный порядок account -> schedule(s) -> attempt.
- Добавлена forward-only migration 059 db/migrations/059_pinterest_completion_lock_all_reconcilable_schedules.sql. Completion теперь блокирует весь набор подходящих publishing/unknown строк через PERFORM ... ORDER BY id FOR UPDATE до блокировки attempt. Стабильный порядок уменьшает риск deadlock между параллельными completion-вызовами; итоговый UPDATE выполняется уже по заблокированному набору.
- При дополнительной проверке схемы обнаружено, что migration 033 задаёт partial unique index `pin_schedules_one_active_per_account_pin` для статусов scheduled/publishing/published/unknown. Поэтому несколько reconcilable строк для одного pin/account невозможны в штатной схеме; первоначальный fixture с двумя unknown и одной publishing был некорректен и нарушал индекс. Regression fixture исправлен: одна publishing + более новая failed history; completion должен опубликовать active row и сохранить failed row. Migration 059 оставлена как защитное блокирование полного набора строк, если будущие изменения схемы допустят несколько активных записей. Header теста остаётся migrations 031–059.
- Workflow .github/workflows/atomic-payment-integration.yml применяет migration 059 после 058.
- GitHub commits: migration 059 704e3948bc0bf09df3615b09d92c6ec43da9bc8b; SQL regression da78bb2443d9ad97473d30935388eb4a21efb8d8; workflow 5f0aa9723d581e4041b3be13e7cb7acd3d5f7989.
- Статические проверки содержимого файлов выполнены после записи; PostgreSQL integration/CI не подтверждены. Предыдущие CI logs недоступны через connector (BlobNotFound), Vercel build status ранее показывал build-rate-limit. Не утверждать, что migration/test прошли runtime.

**Status:** AUD-052 / MIGRATION_059_ADDED / LOCK_ALL_RECONCILABLE_SCHEDULES / REGRESSION_FIXTURE_ALIGNED_WITH_UNIQUE_INDEX / CI_UNVERIFIED.


## Дополнение к handoff — 2026-11-07 (AUD-053: recovery сохраняет safe failure journal)

- Найден crash window: worker мог успешно записать `pinterest_publish_attempts.status='failed', retry_safe=true`, но завершиться до обновления `pin_schedules.status`. Старая stale-claim recovery считала наличие любой попытки признаком неоднозначного исхода и переводила расписание в `unknown`, хотя журнал уже доказывал безопасный отказ до создания удалённого пина.
- Добавлена forward-only migration 060 `db/migrations/060_pinterest_schedule_recovery_respects_safe_failure_journal.sql`. При stale recovery:
  - `failed AND retry_safe=true` → `scheduled` с backoff 1 минута;
  - `failed AND retry_safe=false` → `failed` без автоматического повтора;
  - `processing/unknown` и другие существующие неуспешные/неопределённые журналы → `unknown`;
  - отсутствие durable attempt → прежняя безопасная постановка в очередь с backoff.
  Успешные публикации по-прежнему reconciled предыдущим recovery UPDATE до этой ветки.
- Добавлены SQL regression fixtures для обоих видов failed journal: safe failure возвращается в очередь, unsafe failure остаётся failed. Test header обновлён до migrations 031–060.
- Workflow `.github/workflows/atomic-payment-integration.yml` применяет migration 060 после 059.
- GitHub commits: migration 060 `0b73ce4bfec29c837e7a42e7503e8a262c6c1c2d`; SQL regression `9e5aeffa7eba8b61dc604f68e923982cba8dfccc`; workflow update `23f5b9185951001cb13e9195099c45048783127d`.
- Статические проверки файлов обязательны после записи; PostgreSQL integration/CI пока не подтверждены. Не утверждать, что runtime tests прошли. Production/staging DB, Pinterest API, реальные публикации, deployment и merge не затрагивались.

**Status:** AUD-053 / MIGRATION_060_ADDED / SAFE_FAILURE_CRASH_RECOVERY / UNSAFE_FAILURE_TERMINAL / SQL_REGRESSION_ADDED / CI_UNVERIFIED.


## Дополнение к handoff — 2026-11-07 (AUD-054: восстановлен порядок блокировок scheduled publish)

- В статическом аудите обнаружена регрессия: migration 060 повторно определила `begin_scheduled_pinterest_publish` и заменила account-first реализацию из migration 056 на старую реализацию, блокирующую schedule до account. Это нарушало общий порядок `account → schedule → attempt`, используемый disconnect/manual retry/completion, и возвращало риск deadlock при конкурирующих операциях.
- Добавлена forward-only migration 061 `db/migrations/061_pinterest_scheduled_publish_account_lock_order.sql`: функция снова блокирует активную строку Pinterest account (`disconnected_at is null`, access token present) через `FOR UPDATE` до блокировки schedule; затем проверяет status/claim token/identity и вызывает атомарную reservation функцию. Повторная блокировка account в вызываемой функции является reentrant в рамках той же транзакции.
- Добавлена regression assertion в `backend/test/pinterest-account-publication.integration.sql`: через `pg_get_functiondef` проверяется, что account lock расположен до schedule lock и что проверяются активность/наличие access token. Header теста обновлён до migrations 031–061.
- Workflow `.github/workflows/atomic-payment-integration.yml` применяет migration 061 после 060.
- Commits: migration 061 `c4c1513dd019884a26ba6d2d0798fd85f53a103c`; SQL regression `53a44913951fb9e074eb8c5522bdc6da90656bd8`; workflow `49b3959819b0dbea561064441230e2640c0d9d75`.
- Это статически подготовленная SQL regression; PostgreSQL/CI runtime ещё не подтверждены. Production/staging DB, Pinterest API, реальные публикации, deployment и merge не затрагивались.

**Status:** AUD-054 / MIGRATION_061_ADDED / ACCOUNT_FIRST_LOCK_ORDER_RESTORED / SQL_REGRESSION_ADDED / CI_UNVERIFIED.

## Дополнение к handoff — 2026-11-07 (AUD-055: retryability учитывает immutable image snapshot)

- При аудите UI/API повторной публикации найдено несоответствие: getScheduleRetryability блокировал кнопку безопасного повтора, если у связанного live pin отсутствовал image_url, даже когда у расписания был сохранён snapshot_image_url.
- Worker использует resolvePinScheduleSnapshot и способен публиковать по сохранённому snapshot, поэтому live pins.image_url не должен быть обязательным, если snapshot image существует.
- Исправлен backend/pinterestSchedule.js: retryability теперь принимает schedule.snapshot_image_url либо live schedule.pins.image_url; если отсутствуют оба — сохраняется причина pin_unavailable.
- Добавлен unit regression в backend/test/pinterest-schedule.test.js: failed schedule со snapshot image и pins.image_url = null остаётся доступным для безопасного retry.
- Это backend/helper + unit-test изменение; миграции БД не нужны. Локальный npm test в этой сессии не запускался; CI ещё не подтверждён. Production/staging, Pinterest API, реальные публикации, deployment и merge не затрагивались.

**Status:** AUD-055 / SNAPSHOT_AWARE_RETRYABILITY / UNIT_REGRESSION_ADDED / RUNTIME_TEST_UNVERIFIED.

## Дополнение к handoff — 2026-11-07 (AUD-056: per-user Pinterest API rate limits)

- В аудите внешних вызовов Pinterest найдено отсутствие отдельного throttling на пользовательских Pinterest routes. В частности, один запрос списка досок мог выполнить до 8 последовательных Pinterest API GET calls (до 2 000 досок), а повторные вызовы не ограничивались отдельным budget Pinterest-интеграции.
- Добавлен backend/pinterestRateLimit.js на express-rate-limit: authenticated routes используют key `user:<req.userId>`, чтобы пользователи за общим NAT/IP не делили общий лимит; OAuth callback и секретный worker сохраняют стандартный IP key с IPv6-aware обработкой библиотеки.
- Введены отдельные buckets: boards read 10/min/user; direct publish 5/min/user; schedule create/reconcile/retry/cancel 10/min/user; OAuth start 5/15min/user; OAuth callback 10/15min/IP; worker 6/min/IP. Бюджеты чтения, публикации и операций расписания независимы.
- Middleware подключён к Pinterest OAuth link/callback, boards, direct publish, internal schedule worker, а также schedule reconcile/create/retry/cancel routes. Authentication выполняется до user-keyed limiter на защищённых маршрутах.
- Добавлен backend/test/pinterest-rate-limit.test.js для изоляции ключей по userId и проверки конфигурации бюджетов.
- Важное ограничение текущей реализации: express-rate-limit использует стандартный process-local MemoryStore. Он ограничивает повторные запросы в рамках каждого backend process, но лимит не общий между несколькими Render instances и сбрасывается при перезапуске. При масштабировании/нескольких инстансах следует подключить shared store (например, Redis/совместимое хранилище); не считать этот слой распределённой защитой.
- Изменены backend/pinterestRateLimit.js, backend/pinterest.js, backend/index.js, добавлен backend/test/pinterest-rate-limit.test.js. Runtime unit tests/CI в этой сессии не запускались/не подтверждены. Production, Pinterest API, deployment и merge не затрагивались.

**Status:** AUD-056 / PINTEREST_ROUTE_RATE_LIMITS_ADDED / PER_USER_BUCKETS / PROCESS_LOCAL_STORE_LIMITATION_DOCUMENTED / RUNTIME_TEST_UNVERIFIED.


## Дополнение к handoff — 2026-11-07 (AUD-057: uncertainty fence требует нового refresh token)

- В аудите OAuth reconnect обнаружено, что trigger из migration 036 снимал `refresh_state='uncertain'` при любом UPDATE access_token/refresh_token. OAuth RPC при отсутствии нового `refresh_token` сохраняет прежнее значение через `coalesce`; если прежний токен уже был ротирован Pinterest во время неоднозначного refresh, новый access token ошибочно делал старый refresh token снова доступным для повторного использования.
- Добавлена forward-only migration 062 `db/migrations/062_pinterest_refresh_fence_requires_rotated_refresh_token.sql`: trigger снимает uncertainty только если в строке действительно появился непустой refresh token, отличный от прежнего. Одной смены access token недостаточно. Обычный успешный refresh с новым refresh token и OAuth reconnect с новым refresh token по-прежнему переводят состояние в ready.
- Обновлён `backend/test/pinterest-multi-account-oauth.integration.sql`: reconnect без нового refresh token сохраняет uncertain; поздний refresh worker не может перезаписать credentials; следующий OAuth reconnect с новым refresh token очищает fence. Workflow применяет migration 062 и проверяет оба поведения на disposable PostgreSQL.
- Это статический анализ + подготовленная SQL regression. PostgreSQL/CI runtime ещё не подтверждены; production/staging DB, Pinterest API, реальные публикации, deployment и merge не затрагивались.

**Status:** AUD-057 / MIGRATION_062_ADDED / UNCERTAINTY_FENCE_ONLY_CLEARS_ON_NEW_REFRESH_TOKEN / SQL_REGRESSION_UPDATED / RUNTIME_UNVERIFIED.


## Дополнение к handoff — 2026-11-07 (AUD-058: безопасная ротация ключа шифрования Pinterest)

- Аудит хранения токенов выявил операционный риск: AES-256-GCM ciphertext не содержит key id, а decrypt использовал только текущий `PINTEREST_TOKEN_ENCRYPTION_KEY`. Простая смена ключа делала все уже сохранённые Pinterest credentials нечитаемыми.
- Добавлена поддержка `PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS`: при ошибке расшифровки активным ключом допускается предыдущий ключ. Новые записи шифруются только активным ключом. `decodeAccountRecord` распознаёт ciphertext, который не открывается активным ключом, и перешифровывает пару credentials при следующем чтении аккаунта; для `refresh_state='uncertain'` миграция токенов намеренно пропускается, чтобы не снять uncertainty fence.
- Обновлены unit tests для fallback/перешифровки и README с процедурой ротации. Предыдущий ключ нельзя удалять, пока все существующие Pinterest-аккаунты не прочитаны и не перешифрованы; ленивое обновление означает, что давно неиспользуемые аккаунты могут продолжать зависеть от предыдущего ключа.
- Runtime Node tests/CI пока не подтверждены. Production env и реальные токены не менялись.

**Status:** AUD-058 / PREVIOUS_KEY_FALLBACK / LAZY_REENCRYPTION / ROTATION_RUNBOOK_ADDED / RUNTIME_UNVERIFIED.


## Дополнение к handoff — 2026-11-07 (AUD-059: безопасные публичные проекции Pinterest-аккаунтов)

- Проверка маршрутов `/integrations/pinterest/status` и `/integrations/pinterest/disconnect` показала, что текущие ответы уже исключали access/refresh tokens, но проекция была inline и не имела регрессионного теста.
- Вынесены явные allowlist-проекции в `backend/pinterestPublicAccount.js`: status отдаёт только id, Pinterest identity, username, expiry и needs_reauth; disconnect отдаёт только id и username. Обе проекции гарантированно не включают access_token, refresh_token и user_id.
- Добавлен `backend/test/pinterest-public-account.test.js` для проверки отсутствия секретов и расчёта needs_reauth.
- Это защитное укрепление уже безопасного поведения, а не подтверждение найденной утечки. Runtime unit tests/CI не запускались успешно.

**Status:** AUD-059 / PUBLIC_ACCOUNT_ALLOWLIST / TOKEN_FIELDS_EXCLUDED / REGRESSION_TEST_ADDED / RUNTIME_UNVERIFIED.


## Дополнение к handoff — 2026-11-07 (AUD-060: GitHub Actions jobs не получили runner)

- Проверен HEAD `930fd05e6ba17ec6ff437ef82dbc2bb0cb79ccf3`.
- Workflow runs: `42375727081` (Prodamus webhook tests), `42375727148` (Persisted boards integration checks), `42375727098` (Atomic payment fulfillment integration). Все завершились failure.
- Jobs: `128412779877`, `128412779940`, `128412780113`, `128412779973`. У каждого `runner_id=0`, пустое имя runner, `steps=[]`; завершение произошло через 1–2 секунды после старта. Запуск npm/psql/node команд не подтверждён.
- Получение логов каждого job возвращает Azure `BlobNotFound`; логов для анализа тестовых ошибок нет.
- Просмотренные workflow YAML используют `ubuntu-latest`, корректные PR triggers и минимальные `contents: read` permissions. Нет признака, что job-level YAML намеренно пропускает все шаги.
- Отдельно Combined status сообщает Vercel `build-rate-limit`. Это ограничение Vercel build, не причина отсутствия GitHub runner.
- Вероятнее всего, workflow jobs не были назначены hosted runner; точную причину (Actions permissions, billing/spending limit, доступность runner или кратковременный сбой GitHub) нельзя подтвердить доступным read API. Нужна проверка Settings → Actions и Billing/usage в GitHub UI, когда пользователь будет у компьютера.
- Не менять workflow на фиктивный зелёный статус и не убирать тестовые jobs. После устранения runner проблемы повторить workflow и анализировать реальные логи.
- Runtime unit tests, frontend tests, build и PostgreSQL integration tests по-прежнему НЕ подтверждены.
- Production, merge, migrations, DNS, payments и Pinterest publication не затрагивались.

**Status:** AUD-060 / RUNNER_ID_ZERO / NO_STEPS_EXECUTED / LOG_BLOBS_MISSING / VERCEL_BUILD_RATE_LIMIT_SEPARATE / ROOT_CAUSE_UNCONFIRMED.


## Дополнение к handoff — 2026-11-07 (AUD-061: OAuth encryption and regression coverage)

- Повторно проверены crypto module, account decoding, public account projections, migrations 036/062, SQL OAuth regression и PostgreSQL workflow.
- Подтверждено, что migration 062 применяется после 061 в disposable PostgreSQL workflow; отдельный SQL block проверяет, что обычный UPDATE и смена только access_token не снимают `uncertain`, а новый refresh_token снимает. Дополнительно выполняется `backend/test/pinterest-multi-account-oauth.integration.sql`, где проверяется reconnect без refresh token, fence и stale worker.
- `backend/pinterestTokenCrypto.js` поддерживает active/previous keys; новые токены пишутся active key, старые читаются через previous key и перешифровываются при следующем чтении аккаунта. `decodeAccountRecord` пропускает lazy rewrite для `refresh_state='uncertain'`.
- `pinterestPublicAccount.js` — allowlist для status/disconnect; unit tests проверяют отсутствие токенов и user_id в публичном ответе.
- Остаётся незакрытый test gap: нет изолированного DB/runtime regression на optimistic re-encryption race в `decodeAccountRecord`. Нужен mock Supabase test или disposable Postgres integration test, включая конкурирующее изменение updated_at/refresh_state.
- Все выводы статические; runtime Node/PostgreSQL tests не подтверждены из-за runner_id=0 на текущих Actions jobs. Production credentials/data не менялись.

**Status:** AUD-061 / OAUTH_CRYPTO_STATIC_REVIEWED / MIGRATION_062_IN_CI / PUBLIC_ALLOWLIST_TESTED_IN_SOURCE / OPTIMISTIC_REENCRYPTION_RACE_TEST_GAP / RUNTIME_UNVERIFIED.


## Дополнение к handoff — 2026-11-07 (AUD-062: тестируемая optimistic token migration)
- Выделен модуль `backend/pinterestAccountRecord.js`: `decodePinterestAccountRecord(data, dependencies)` получает Supabase и crypto-функции через DI; основной `decodeAccountRecord` в `backend/pinterest.js` теперь вызывает этот модуль с production dependencies.
- Новый `backend/test/pinterest-account-record.test.js` содержит 6 регрессий для optimistic row-version fence, проигранной гонки (no returned row), сохранения uncertainty fence, пропуска уже active-key ciphertext и ошибки БД.
- При проигранной гонке код не делает безусловный повторный update: использует ранее прочитанный snapshot и расшифровывает его прежним ключом. Это безопасно только пока previous encryption key остаётся настроенным до завершения ленивой миграции всех аккаунтов.
- Статус проверки: временный изолированный Node.js harness для 6 сценариев выполнен: 6 passed, 0 failed. Harness собран в `/tmp/pinposy-aud062` по текущим helper/test source; это не полный `backend/npm test`, не PostgreSQL integration и не GitHub Actions. Они не подтверждены. GitHub Actions runner_id=0 blocker остаётся открытым. Не отмечать тесты зелёными.
- Изменения в ветке `feat/persisted-boards-api`; production и открытые PR не объединялись/не деплоились.

**Status:** AUD-062 / ACCOUNT_RECORD_DECODER_EXTRACTED / OPTIMISTIC_RACE_REGRESSION_ADDED / RUNTIME_UNVERIFIED.


- Уточнение AUD-062: добавлен шестой тест успешного optimistic CAS — функция использует возвращённую БД строку и расшифровывает именно committed ciphertext, включая новое `updated_at`. Коммит теста: `6401be2a41932f1e4360d11cfb0897ce7b919b81`. Runtime test всё ещё не запускался.


- Дополнительный результат AUD-062: изолированный Node.js harness — 6/6 passed (0 failed). Полный backend suite, PostgreSQL integration и GitHub Actions остаются непроверенными.


- После AUD-062 повторно проверены три свежих Actions runs `42376959908`, `42376959739`, `42376959704`: все jobs завершились за 1–2 секунды с `runner_id=0`, пустым runner name и нулём steps. CI не выполнялся; root cause не установлен.


## Дополнение к handoff — 2026-11-07 (AUD-063: boards persistence + honest UI)
- Static route audit: `/projects` и `/projects/:id` owner scoped; board generation/listing first validates project ownership; `getBoardWithOwnerCheck` / `getPinWithOwnerCheck` resolve owner via joined project; write routes constrain updates to board/project relation.
- Frontend persistence path in `App.tsx`: load from `GET /boards`; create project for current user if none exists; create board through `POST /boards`; replace temporary client ID with DB ID in state.
- Removed deceptive BoardManager UI: no fabricated SEO score, mock keyword suggestions, local-only fake optimize action or invented performance cards. Added empty state and neutral zero values for non-available metrics.
- Changed `frontend/src/components/boards/BoardsManager.tsx` and `frontend/src/App.tsx`.
- Static assertions passed for expected source structure only. No TypeScript lint, frontend unit tests, Vite build, API E2E or live Supabase test executed; GitHub Actions hosted runner remains unassigned (runner_id=0).
- Production untouched; PR #4 remains Draft and unmerged.

**Status:** AUD-063 / OWNER_SCOPED_ROUTE_STATIC_REVIEW / BOARDS_API_PERSISTENCE_PATH_CONFIRMED_IN_SOURCE / FAKE_ANALYTICS_REMOVED / RUNTIME_UNVERIFIED.


## Дополнение к handoff — 2026-11-07 (AUD-064: безопасный повтор генерации)
- Исправлен frontend dead-end после окончательной ошибки генерации: backend возвращает `generation_request_failed` для definitive failed state и требует новый idempotency key, но UI ранее сохранял прежний ключ. Теперь при точном коде `generation_request_failed` `PinGenerator` генерирует и сохраняет новый ключ, позволяя повторить запрос с теми же параметрами.
- Для `generation_in_progress` и `generation_outcome_unknown` ключ не меняется: unknown provider outcome может означать уже оплаченную задачу, поэтому новый ключ способен вызвать дублирующую генерацию.
- Добавлены `frontend/src/utils/generationRetry.ts` и `frontend/src/utils/generationRetry.test.ts` (4 сценария). Обновлён `frontend/src/components/pins/PinGenerator.tsx`.
- Тесты добавлены, но runtime execution, typecheck и build не подтверждены из-за текущего CI runner blocker. Production не менялся.

**Status:** AUD-064 / FIXED_UNVERIFIED.


## Дополнение к handoff — 2026-11-07 (AUD-065: сохранение формата пина)
- Выбор aspect ratio в PinGenerator ранее менял только локальный React state; после reload формат терялся. Теперь handler отправляет `PATCH /pins/:id { aspect_ratio }` и обновляет UI только после успешного ответа; кнопки блокируются на время запроса.
- Backend PATCH route принимает только `2:3, 9:16, 4:5, 3:4, 1:1`; проверка владельца выполняется до записи, update ограничен `id + board_id`. Колонка `pins.aspect_ratio` есть в baseline schema.
- Изменены `frontend/src/components/pins/PinGenerator.tsx` и `backend/index.js`. Source-level assertions подтверждают основные условия. TypeScript/runtime/API/Postgres tests не запускались; CI runner blocker остаётся.
- Production не затронут.

**Status:** AUD-065 / FIXED_UNVERIFIED.


## 2026-11-07 — AUD-066: pin edit / scheduling race
- Fixed in `frontend/src/components/pins/PinGenerator.tsx`: serialize PATCH writes per pin, commit title to UI only after server success, save the textarea's actual blur value, and wait for pending pin edits before submitting a schedule request.
- On a pending-save failure, scheduling is aborted rather than creating a schedule from a stale database snapshot.
- Static source review only. TypeScript, browser E2E, and live API tests were not run; Actions runner blocker remains. No production deployment, DB migration, or PR merge.


## 2026-11-07 — AUD-067: restore persisted pins in generator
- `PinGenerator` now loads `GET /boards/:id/pins` when opened and when the selected board changes, mapping DB id/title/description/image_url/aspect_ratio back into editor state.
- Added loading/error UI, disabled generation while restoration is pending, ignores stale responses after board changes/unmount, and routes aspect-ratio PATCH through the per-pin serialized save queue.
- Backend endpoint already existed and performs a board-owner check. Static source assertions only; no TypeScript/build/browser/API/Postgres execution. No production or DB changes.


## 2026-11-07 — AUD-068: align generation concurrency test with credit reservations
- Исправлен `backend/test/generation-concurrency.sh`: добавлены вызовы `reserve_pin_generation_credits(..., 5)` для основного запроса и для failure/completion race-запроса перед вызовом `complete_pin_generation_request`.
- Причина: миграция 054 требует активную резервацию в completion RPC; shell test не обновили при введении этого контракта и мог падать ещё до проверки concurrency.
- Проверка только статическая по исходнику: обе completion ветки имеют резервирование. Bash syntax/PostgreSQL/CI не запускались; runtime остаётся unverified.
- Изменён тестовый файл и документация; production/backend runtime/БД не затрагивались. PR #4 Draft, без merge/deploy.
- Commit с тестом: `c02fb9b1d2ddce40ed6da3c6d5da72e2bd1c8e8e`; docs commit: `16473d6d75deb743aea56fea7842ad35393e334d`.


## 2026-11-07 — AUD-069: generation reservation rounding
- Исправлено недорезервирование из-за разницы округления: итоговый charge округляет цену каждого изображения отдельно, а estimate округлял сумму всего пакета. Добавлен `backend/generationPricing.js`; `backend/index.js` использует `calculateGenerationReservation`; тесты в `backend/test/generation-pricing.test.js`.
- Важно: локальный `MODEL_PRICES` может отставать от фактической цены GPTunnel (в тестовых ответах встречаются разные цены); это исправление покрывает округление только относительно настроенной цены, а не provider price drift. До запуска платежей/масштабной генерации нужно установить безопасный потолок цены из официального API каталога и корректно резервировать его.
- Runtime тесты не запускались, только статическая проверка исходников; CI runner blocker остаётся. Production не менялся.
- Commits: helper `69675f0d3d4338d66470ceff925548996b2698e8`, tests `c2d39f3ef9a31693be7bdb6cb4b06496644f0988`, integration `6f56422c2ac7f9f41270db53a59e081774325cc9`, launch notes `5a12dd34ca0d31385f46a8f1ca08ac0c8a13764d`.
- Административная оговорка: по ошибке первый вариант заметки был добавлен в `main`; файл удалён отдельным revert-коммитом `f61c65f7c09f2ad8ec94fad8fb84861a72dbe8c0`. На `main` не осталось содержимого этой заметки; рабочие изменения остаются в feature branch.


## Дополнение к handoff — 2026-11-07 (AUD-070: GPTunnel pricing + text usage)
- Официальные GPTunnel docs проверены: media catalog GET /api/v2/media/models?type=IMAGE возвращает ставки и price_unit; точная котировка media-задачи доступна через POST /api/v2/media/price до запуска без списания, в RUB, с учётом скидок; LLM catalog — GET /v1/models; chat response содержит usage.total_cost. Ссылки: https://docs.gptunnel.ru/creative-lab/price/, https://docs.gptunnel.ru/creative-lab/models/, https://docs.gptunnel.ru/api/models/, https://docs.gptunnel.ru/api/chat-completions/.
- backend/gptunnel.js сейчас не использует media quote и возвращает из generateText только текст, теряя provider usage/стоимость.
- Все три найденных text generation paths используют generateText без учёта стоимости: pins.js (внутри image-generation workflow), boards.js (generate boards endpoint), analyze.js (site analysis endpoint).
- Migration 054 фиксирует сумму резерва: idempotent повтор с другой суммой — ошибка; complete_pin_generation_request отклоняет списание сверх активного резерва. Безопасное добавление фактической LLM-стоимости требует изменения reservation lifecycle/SQL и чёткой политики лимитов токенов, а не только прибавления usage.total_cost к charge.
- AUD-070 — аудит и план следующего этапа, без кода/миграций. Никаких provider API запросов с ключом, production изменений, DB migrations, CI или runtime tests не было.


## Дополнение к handoff — 2026-11-07 (AUD-071: GPTunnel billing adapter groundwork)
- backend/gptunnel.js exports quoteImageTask, normalizeMediaQuote, generateTextWithUsage; image quote uses /api/v2/media/price, validates code/currency/numeric price/model and that aspect_ratio was not ignored. LLM adapter captures request id, model, token usage and total_cost; strict mode rejects missing total_cost. maxTokens option supported.
- Existing generateText() remains backward-compatible and does not require usage metadata yet; three existing text call sites are not wired to strict accounting. New adapters are not yet used by user-facing flows. No claim of billing correctness.
- Added backend/test/gptunnel-pricing.test.js for media quote validation, LLM usage capture, strict missing-cost failure and legacy compatibility. Tests not executed (no local Node runtime; Actions runner issue). Static review only.
- No SQL migration. Migration 054 still has fixed idempotent reservation amount and cannot atomically top up; no generalized charge journal exists. Next design must cover atomic reserve adjustment, provider operation journal, quote/final price reconciliation, LLM token caps/usage, definitive vs unknown outcomes, and atomic settlement. Avoid changing user credit prices without product policy.
- No GPTunnel authenticated API call, production change, DB change, deployment or PR merge.


## 2026-11-07 — AUD-072: GPTunnel quote validation + billing lifecycle audit
- Исправлена проверка `ignored_params` в `backend/gptunnel.js`: GPTunnel описывает ignored params вместе с причиной, поэтому ответ может быть объектной записью, а не строкой. Теперь нормализуются string/object формы, отклоняется любой ignored param и проверяется, что применённый `params.aspect_ratio` совпадает с запрошенным.
- Добавлены regression tests для object-form ignored params и несовпадающего применённого ratio. Runtime не запускался.
- Повторно подтверждены billing gaps: generation reservation всё ещё использует локальный `MODEL_PRICES`; текстовый LLM-план в `pins.js` не включён в резерв/settlement; `boards.js` и `analyze.js` используют платный LLM без учёта provider usage; image regeneration имеет отдельный fixed-price path. Новые GPTunnel adapters не подключены к пользовательским маршрутам.
- Официальные GPTunnel docs уточняют: media `/price` возвращает итоговую цену и применённые params, скидки учтены; `ignored_params` содержит причины; некоторые input-media метрики в котировку не входят; media task сообщает фактические `price` и `refunded`; LLM `usage.total_cost` — фактическая стоимость, а каталог ставок не следует самостоятельно трактовать без точных единиц/учёта кэша.
- Создан `docs/audits/AUD-072-gptunnel-billing-lifecycle.md` с последовательностью безопасной реализации: продуктовая политика → provider-operation journal → atomic reservation top-up → exact quotes before media submission → bounded LLM cost → unknown/refund reconciliation → atomic settlement → disposable PostgreSQL fault/concurrency tests.
- Не добавлялась миграция, не менялись цены/балансы/тарифы; не тронуты production, GPTunnel credentials, deploy, DB, DNS, Prodamus, Pinterest и PR merge.

**Status:** AUD-072 / QUOTE_VALIDATION_HARDENED / TESTS_ADDED_RUNTIME_UNVERIFIED / PROVIDER_BILLING_NOT_YET_WIRED.


## 2026-11-07 — AUD-073: single-pin regeneration provider accounting
- Migration 053 + route `POST /pins/:id/regenerate` reviewed. Existing protections: owner check, request fingerprint, stable provider idempotency key, claim-token fence, provider task ID persisted before polling, recovery by polling/reusing same key, atomic user-credit debit + pin update.
- Confirmed accounting gap: journal stores `provider_price`, but completion debits fixed `amount` from local `MODEL_PRICES`; this may be valid user-credit policy but is not actual provider-cost accounting and can drift from GPTunnel RUB price.
- Confirmed refund gap: GPTunnel failed task response includes `refunded`, but `generateImage()/waitForImageTask()` errors and route catch do not persist it. Non-refunded provider failures can be platform expenses invisible to current journal. Migration 053 has no provider terminal status/refund/error detail/reconciliation timestamp.
- Official docs reviewed: task creation idempotency replay rules; wait:true can still return queued/running after ~30 sec; GET task returns price/refunded; quote endpoint prices exact model/prompt/params before task submission. See AUD-073 for detailed design and sources.
- Created `docs/audits/AUD-073-regeneration-provider-accounting.md` with separate provider-cost ledger vs user-credit accounting, claim-fenced terminal outcome RPC, quote/reconciliation policy and disposable PostgreSQL test matrix.
- No code or migration changed; no user credits/tariffs changed; no authenticated provider API call, runtime/SQL test, production change, deploy or PR merge.

**Status:** AUD-073 / REGENERATION_ACCOUNTING_GAPS_DOCUMENTED / DESIGN_ONLY / RUNTIME_UNVERIFIED.


## AUD-073 follow-up — failed task metadata adapter groundwork
- Added `providerTaskError(task)` in `backend/gptunnel.js` and routed both direct and polled failed-task paths through it. It preserves provider task ID, valid gross price, strict `refunded` boolean (missing/invalid => null), provider error code and bounded title.
- Added 3 test definitions for refunded=false, missing refund metadata, and invalid price. Not executed.
- These fields are not yet persisted by the regeneration route into migration 053. No schema/route change; provider-cost reconciliation remains incomplete.


## Дополнение к handoff — 2026-11-07 (AUD-073: provider outcome persistence)
- Создана миграция `db/migrations/063_pin_regeneration_provider_outcomes.sql`. Она добавляет provider terminal status, gross provider price (существующая колонка), nullable `provider_refunded`, structured provider error code/title и `provider_reconciled_at`.
- Новый RPC `record_pin_regeneration_provider_outcome` требует текущий claim token и task ID; одинаковый повтор разрешён, конфликтующие terminal facts и stale claims отклоняются. Missing refund остаётся NULL/unreconciled; false не трактуется как refund.
- `backend/index.js`: successful outcome сохраняется до rehosting, failed outcome — до request status=failed. При ошибке сохранения failed outcome request переводится в unknown, а не в failed; восстановление failed task использует `providerTaskError`.
- Добавлен `backend/test/pin-regeneration-provider-outcome.sh` с SQL integration scenarios. Ни migration, ни script не запускались. Не подтверждены Bash syntax, Node tests, PostgreSQL, CI. **Не деплоить код до применения 063 и успешной проверки на disposable PostgreSQL.**
- Остаточные billing задачи: quote exact task before provider submission; unify provider-operation ledger for multi-pin generation and regeneration; separate provider RUB spend from user-credit debit. No live DB/provider/deploy/merge action.


## Дополнение к handoff — 2026-11-07 (AUD-074: multi-pin provider outcomes)
- Создана миграция `db/migrations/064_pin_generation_provider_outcomes.sql`: добавлены terminal outcome/refund/error/reconciliation fields в `pin_generation_tasks`, versioned RPC `record_pin_generation_provider_outcome` и расширен recovery snapshot `get_pin_generation_plan`.
- RPC блокирует parent request затем task (тот же lock order, что migration 046), требует текущий claim token и task ID, сохраняет identical replay, отклоняет conflicting replay и stale claim.
- `backend/pins.js`: успешная задача фиксируется до storage rehosting; failed task сохраняет gross provider price, refund boolean и структурированную ошибку. Если task ID отсутствует, результат остаётся unknown. `backend/index.js` подключает новый RPC.
- Добавлен `backend/test/pin-generation-provider-outcome.sh` с PostgreSQL integration cases; не запускался. Migration 064 не применялась. До disposable PostgreSQL verification и теста не деплоить.
- Остаточные задачи: exact media quote before submission; учёт LLM `usage.total_cost` для pins/boards/analyze; общий append-only provider-operation ledger и reconciliation. Provider RUB spend не смешивать с user-credit debit.


## Дополнение к handoff — 2026-11-07 (AUD-075: quote and reservation lifecycle)
- В основном generation route порядок такой: reserve local model estimate → paid GPTunnel text plan → save plan → image provider tasks → final image provider price → user-credit settlement. Text LLM usage.total_cost теряется через legacy `generateText()`.
- Media quote появляется только после plan prompts. Existing reservation RPC rejects changed amount for same idempotency key; settlement rejects charge > reservation. Не подключать quote directly до split prepare/submit and safe atomic resize.
- Добавлен pure helper `calculateQuotedGenerationPricing(quotes, markup)` в `backend/generationPricing.js`, тесты в `backend/test/generation-pricing.test.js`. Per-image rounding matches existing settlement; provider RUB and user credits remain distinct.
- AUD-075: `docs/audits/AUD-075-exact-quote-and-reservation-lifecycle.md`. Tests not executed.
- Safe next sequence: provider-operation journal for billable text/image work; bounded LLM usage capture; immutable task plan; exact quotes persisted; atomic reservation resize (user row → reservation lock, account for other reservations); submit only after reserve covers exact quoted user credits; compare actual vs quote on settlement; unknown outcomes never resubmitted blindly.


### AUD-075 follow-up — reservation resize groundwork
- Migration `065_resize_pin_generation_credit_reservation.sql` adds `resize_pin_generation_credit_reservation(user,key,claim,amount)`. It locks user → request → reservation, checks current claim and processing state, accounts for other active reservations, and changes only a still-reserved reservation. Upward resize is atomic and fails if available balance is insufficient; downward resize is allowed.
- Added `backend/test/generation-reservation-resize.sh`; not executed. RPC is not wired into the route. Do not deploy/use until disposable PostgreSQL verification.

### AUD-076 — single-pin regeneration reservation

- Static review found that single-pin regeneration directly debited the user's balance after provider success and ignored active multi-pin reservations. This could consume credits already promised to another in-flight generation.
- Added migration `066_pin_regeneration_credit_reservations.sql`: single-pin regeneration reserves credits in the shared reservation table, settles its reservation atomically with debit/pin update, and releases only on definitive `failed`. `unknown` retains the hold. Legacy in-flight requests with an existing provider task ID use a guarded unreserved-balance fallback at settlement.
- Wired `POST /pins/:id/regenerate` to reserve before a new provider task submission; an existing recorded task is recovered without creating a duplicate reservation.
- Added `backend/test/pin-regeneration-credit-reservations.sh` for reservation contention, over-budget rejection, settlement and failure release.
- **Not verified at runtime:** migration and PostgreSQL script were not executed; Bash/Node/CI were not run. Apply migration 066 only to a disposable test database first and run the SQL integration script before any staging rollout. No production changes or PR merge.

**Status:** AUD-076 / REGENERATION_RESERVATION_WIRED / SQL_RUNTIME_UNVERIFIED / DO_NOT_DEPLOY.


## Дополнение к handoff — 2026-11-08 (AUD-165: Pinterest publication + OAuth refresh audit)

- Продолжен статический аудит Pinterest lifecycle: ручной retry, классификация provider errors, 429/rate-limit, multi-instance pacing, справедливость очереди, stale-claim recovery, fencing, uniqueness/reconciliation и OAuth refresh concurrency.
- Подтверждённые риски публикационного lifecycle уже описаны в `docs/audits/AUD-165-pinterest-publication-lifecycle-concurrency.md`: permanent 4xx ранее классифицировались как retry-safe; 429 reset headers не учитывались; разные задания одного аккаунта могут отправляться параллельно разными backend instances; due queue не имеет стабильного tie-breaker/tenant fairness; stale-claim recovery не ограничен размером batch и не имеет отдельного partial index по publishing.updated_at; ручной retry мог разрешить расписание с не-approved pin. Это audit findings/design recommendations, а не утверждение, что production уже испытывает эти сбои.
- Проверен OAuth refresh path: account-scoped PostgreSQL lease, lease ID fencing, optimistic `updated_at` compare, `refresh_state='uncertain'` до внешнего запроса, fail-closed при неоднозначном исходе, OAuth callback generation/session fencing. Новая гонка с подтверждённым риском потери/перезаписи токена не обнаружена.
- Остаточный тестовый пробел: нет отдельного теста с двумя независимыми PostgreSQL-сессиями/процессами, одновременно обновляющими один Pinterest account, включая lease expiry и reconnect-vs-refresh. Runtime/CI тесты на этом HEAD не выполнялись.
- Обновлён `docs/audits/AUD-165-pinterest-publication-lifecycle-concurrency.md`, последний audit-only commit: `3b5ec27bb86fb54fe4c5fb09fc16754814baee69`.
- Изменялись только документы аудита/передачи контекста. В рамках сегодняшнего аудита не менялись пользовательские маршруты, React UI, backend logic, SQL migrations, production DB, environment secrets, DNS, billing, deployment или Pinterest credentials. Не запускались реальные публикации и платежи.
- PR #4 остаётся Draft/open/unmerged; `mergeable=false`. Для commit `3b5ec27` GitHub Actions workflow runs не обнаружены, combined status пустой. Не считать проверки зелёными.
- Следующие автономные задачи: аудит OAuth callback/state reuse и reconnect/disconnect races; затем продолжить аудит payment/refund lifecycle, provider cost accounting, storage/backup/restore, auth/permissions, UX and release readiness. До запуска отдельно требуется disposable PostgreSQL CI, Pinterest sandbox/Standard access проверки и ручная проверка production env/cron/keys владельцем.
- **Запрет на запуск:** текущий код/миграции не считать готовыми к production deploy только на основании статического аудита. Не применять новые миграции к рабочей БД, не включать cron и не переключать DNS до завершения аудита, тестов, резервного копирования и согласованного cutover.

## Дополнение к handoff — 2026-11-08 (AUD-211: защита от параллельного создания счетов)

- В `frontend/src/components/pricing/PricingView.tsx` устранён UX-риск: во время создания любого счёта блокируются все кнопки покупки тарифов и пакетов кредитов, а не только кнопка выбранного тарифа/пакета.
- Добавлен общий синхронный checkout-lock через `useRef`, который не позволяет двум обработчикам стартовать параллельно до следующего React render. При ошибке создания счёта lock снимается, пользователь может повторить действие.
- Практический эффект: быстрое нажатие «Купить Start», затем «Купить Pro» или другой пакет кредитов больше не создаст второй независимый счёт в рамках одного экземпляра экрана. Это уменьшает риск случайно оплатить несколько счетов.
- Ограничение: защита действует в текущем экземпляре PricingView. Она не заменяет серверную идемпотентность между вкладками/устройствами и не защищает прямые API-вызовы. Не стал повторно использовать pending-счета: в БД не сохраняется подтверждённая ссылка Prodamus, а поведение срока действия старой ссылки нужно отдельно согласовать с провайдером.
- Изменён файл UI и добавлен `docs/audits/AUD-211-pricing-checkout-concurrency-guard.md`.
- Коммиты: `89c101669258b8a9e03518b0ef467aa24e9e869c` (код), `3ef9c7d7e427765270b5f85e1b3d4bb317c18bce` (аудит).
- Source-level проверка выполнена повторным чтением UI-файла. Frontend test/build/lint не запускались: локального checkout и установленных зависимостей нет. Не было запросов к Prodamus, реальных оплат, production DB изменений, deployment или merge.
- Следующий приоритет: продолжить поиск подтверждённого риска в generation/credit settlement и платежном lifecycle; не добавлять speculative refund webhook или server-side order reuse без подтверждённого контракта Prodamus.

## Дополнение к handoff — 2026-11-08 (AUD-212: честный preview AI Strategist)

- Обнаружено несоответствие продукта интерфейсу: блок AI Strategist на странице тарифов выглядел как работающий онлайн-чат (зелёный индикатор «online» и поле ввода), но ответы формировались локальным `setTimeout` и несколькими проверками ключевых слов. Запрос к AI/backend не выполнялся.
- Удалены фальшивый ввод, локальная имитация переписки и canned-response handler. Вместо них показан статический пример диалога с явным бейджем «Демонстрация / Demo» и пояснением на русском/английском, что сообщения не отправляются на сервер и ответы не генерируются ИИ.
- Пользовательский эффект: посетитель видит пример будущего интерфейса, но не принимает демонстрационный текст за реальный ответ работающего AI-сервиса. Для восстановления интерактивного чата нужен отдельный настоящий backend endpoint с авторизацией, тарифными/кредитными ограничениями и защитой от злоупотреблений.
- Изменён `frontend/src/components/pricing/PricingView.tsx`; добавлен `docs/audits/AUD-212-transparent-ai-assistant-preview.md`.
- Коммиты: `a78ae393248fd4a90a3608cfb953d1c709ce4c25` (UI), `c4635a78d259a6e5d10ec42ee05f3ef06bd7592c` (аудит).
- Компонент повторно загружен с GitHub; JSX closing structure и статический preview просмотрены. Frontend lint/tests/build не запускались: локального checkout и зависимостей нет. Не было AI-запросов, production изменений, deployment или merge.

## Дополнение к handoff — 2026-11-08 (AUD-213: плавающий ИИ-стратег больше не выдаёт выдуманную аналитику)

- Нашёл отдельную проблему, которую не закрыл AUD-212: плавающий помощник в приложении всё ещё утверждал, что анализирует Pinterest-аккаунт `@botanika_nordic`, и показывал выдуманные показы, сохранения, CTR, демографию аудитории, рост досок, SEO-оценки и тренды. Реального подключения к данным Pinterest у этого виджета нет.
- Во всех 7 языках интерфейса (de/en/es/fr/pt/ru/zh) переписаны приветствие, подзаголовок, статус, подсказки и ответы: теперь явно указано, что это демонстрация без доступа к данным Pinterest и без AI-аналитики. Удалены фиктивные числа и утверждения об анализе аккаунта.
- Виджет оставлен полезным как навигационный помощник: пользователь может написать, какой раздел ищет, и получить кнопку перехода. Распознавание вынесено в `frontend/src/utils/demoNavigation.ts`; оно поддерживает распространённые запросы на всех семи языках и восемь разделов (доски, календарь, генератор, конкуренты, ключевые слова, аналитика, тарифы, настройки). Нераспознанный текст не превращается в выдуманный ответ.
- Убрана искусственная задержка «ИИ печатает» — навигационная подсказка появляется сразу. Локализованы кнопки открытия/сворачивания помощника.
- Добавлены тесты `frontend/src/utils/demoNavigation.test.ts`: десять маршрутов на разных языках и проверки пустого/неизвестного запроса. Добавлен документ `docs/audits/AUD-213-floating-strategist-demo-honesty-and-navigation.md`.
- Пользовательский эффект: если человек спросит «какой у меня лучший пин», интерфейс больше не покажет придуманные цифры как его личную статистику. Если спросит, где аналитика или календарь, помощник сможет открыть соответствующий раздел. Пока это именно демонстрационный навигатор, а не подключённый AI-аналитик.
- Проверено повторным чтением с GitHub: компонент использует вынесенный helper, все семь языковых блоков содержат новые ключи, старые sample metrics и account claims в bot-блоках отсутствуют, искусственный typing timer удалён. Тесты, TypeScript lint и production build не запускались — локального checkout и зависимостей нет. Нужно будет выполнить `npm test` и `npm run lint` в frontend при доступной среде.
- Не было Pinterest API-запросов, production изменений, deployment или merge.
- Коммиты: `e9ec39a1177c3c06c69e76cbf6ab992e1cc7bcf2` (компонент), `5b5c71d0181b7273e0dde22379cb4d9b984814e1` (helper), `05bc016114d776e62830b6924e190ded0b8f428d` (тесты), `128d4fa0a4a07a43b34baa41573685ed83a6b6bc` (подключение helper), `7a96b9e50cc8e2631b61b68d3f7334039228bf74` (AUD-213).

## Дополнение к handoff — 2026-11-09 (AUD-214: защита календаря от некорректного часового пояса)

- Нашёл проблему: `getDefaultTimezone()` без проверки принимал любое сохранённое значение из localStorage. Некорректный идентификатор IANA мог попасть в `Intl.DateTimeFormat` и сломать отображение календаря или преобразование времени публикации.
- Добавлена `isValidIanaTimezone()`: проверяет значение через встроенную поддержку IANA timezone в Intl.
- `getDefaultTimezone()` теперь принимает сохранённую настройку только если она валидна; испорченную удаляет и возвращается к корректному часовому поясу браузера. Если и он недоступен, остаётся прежний языковой fallback: Москва для русского интерфейса, UTC для остальных.
- `saveUserTimezone()` больше не сохраняет невалидные значения; корректные значения сохраняются после trim.
- Добавлен `frontend/src/utils/timezone.test.ts`: валидные/невалидные зоны, восстановление после испорченного localStorage, защита записи, летнее/зимнее время Лондона и несуществующее время во время весеннего перевода часов.
- Важное: существующее преобразование расписания через `localDateTimeToDate(date,time,timezone)` уже учитывает DST на дату самой публикации; его не заменял упрощённым текущим UTC-offset.
- Пользовательский эффект: испорченная настройка часового пояса больше не должна блокировать календарь или планирование; время публикации продолжает переводиться с учётом сезонного перевода часов.
- Документ: `docs/audits/AUD-214-timezone-preference-validation.md`.
- Тесты, TypeScript lint и Vite build не запускались: в текущей среде нет локального checkout и установленных зависимостей. Тесты добавлены, но не объявляются пройденными. Production, Pinterest API, deployment и merge не затрагивались.
- Коммиты: `9b6971d9a39f2ff09847fd045719dbed33b3887c` (код), `801ef7d161a11542aa575f9e1bc68ad12879cda4` (тесты), `e5826d25dde88784385b63013b029f8eb1b72827` (AUD-214).

## Дополнение к handoff — 2026-11-09 (AUD-215: безопасный выбор Pinterest-аккаунта и доски перед публикацией)

- Нашёл реальный риск в `PublishPinButton.tsx`: при переключении между Pinterest-аккаунтами старый `selectedBoard` оставался в состоянии до завершения загрузки досок нового аккаунта. При быстром клике можно было отправить запрос с ID нового аккаунта и ID доски предыдущего аккаунта.
- Исправил переключение: доска и список досок очищаются сразу в обработчике выбора аккаунта; кнопка публикации блокируется, пока загружаются аккаунт/доски; поздний ответ старого запроса игнорируется.
- Добавил синхронный ref-lock, который не позволяет дважды войти в обработчик публикации быстрыми повторными кликами до обновления React state.
- Если компоненту передали конкретный `boardId`, он теперь должен присутствовать в списке досок выбранного аккаунта. Если не найден — публикация блокируется с сообщением. Больше нет тихого переключения на первую попавшуюся доску. Если конкретная доска не передана, по умолчанию выбирается первая доступная.
- Добавил сообщение, если Pinterest-аккаунт ещё не подключён. Созданы helper `frontend/src/utils/publishBoardSelection.ts` и тесты `frontend/src/utils/publishBoardSelection.test.ts`.
- Пользовательский эффект: при переключении аккаунта пин не должен случайно уйти на доску другого аккаунта; пока список досок не загружен, кнопка не активна; двойной клик не запускает две параллельные UI-операции.
- Документ: `docs/audits/AUD-215-pinterest-publish-account-board-selection.md`.
- Проверено повторным чтением GitHub: helper используется компонентом, проверки и блокировки присутствуют. Тесты, TypeScript lint и Vite build не запускались — в текущей среде нет локального checkout с установленными зависимостями. Не утверждаю, что они прошли.
- Не отправлял запросы на публикацию в Pinterest, не менял production, не деплоил и не сливал PR.
- Коммиты: `1f69202a8125131afdc5ae14b7033b54423d954d` (защита account/board switch и двойного клика), `26aa0014f39b1b4700c0f3b533d77d0de2965858` (helper), `e11059659a6c9bb6757706a168cf9cc0b4794452` (тесты), `1be720309a041d87fac4b37886b1e5b88e522d1e` (проверка explicit board), `9f76b02c1ebd0d9eb805296d6a7f2bb51ac3082a` (селектор явной замены доски).


## Дополнение к handoff — 2026-11-09 (AUD-216)

- Ужесточена обработка ситуации, когда Pinterest мог принять публикацию, но PinPosy не смог записать итог в журнал попыток.
- Ошибка записи журнала (как возвращённая Supabase, так и rejected transport promise) теперь нормализуется в HTTP 503 с кодом `PUBLISH_JOURNAL_PERSISTENCE_FAILED`. Пользователь получает явное указание: публикация заблокирована до сверки, повторять её нельзя.
- Путь охватывает сетевые ошибки POST, non-2xx ответы Pinterest и успешный ответ без remote pin ID. При ошибке локального completion исходная ошибка остаётся основной, вторичная диагностическая ошибка логируется.
- Добавлены unit tests для возвращённой DB-ошибки, rejected promise и успешной записи.
- Тесты, lint, интеграционные SQL и сборка фактически не запускались. Production DB, Pinterest API, deployment и merge не затрагивались.
- Подробности: `docs/audits/AUD-216-pinterest-failure-journal-write-safety.md`.


## Дополнение к handoff — 2026-11-09 (AUD-217)

- Публичный статус Pinterest-аккаунта теперь fail-closed обрабатывает некорректную непустую дату истечения токена: такой аккаунт помечается `needs_reauth`, а не выглядит исправным.
- Состояние `refresh_state=uncertain` и ранее истёкший срок также требуют повторной авторизации. Отсутствующая дата сама по себе не объявляется просроченной.
- Добавлены unit tests для malformed, missing, expired и future expiry.
- Тесты/сборка/lint фактически не запускались. Production, Pinterest API, deployment и merge не затрагивались.
- Подробности: `docs/audits/AUD-217-malformed-pinterest-token-expiry.md`.


## Дополнение к handoff — 2026-11-09 (AUD-218: единый статус переподключения Pinterest)

- После AUD-217 обнаружил, что endpoint `GET /integrations/pinterest/status` формировал legacy-поле `needs_reauth` собственной старой проверкой даты. Поэтому массив `accounts` уже мог показывать некорректную дату как требующую переподключения, а backward-compatible поле верхнего уровня — как здоровое подключение.
- Исправлено: legacy-поле теперь использует общую `isPinterestReauthRequired`, то есть обе формы ответа одинаково обрабатывают `refresh_state=uncertain`, просроченную и malformed дату.
- В `PinterestCard.tsx` добавлен явный сценарий для выбранного аккаунта с `needs_reauth`: доски не запрашиваются, вместо пустого списка досок показывается предупреждение и кнопка повторного OAuth-подключения. Кнопка ручной синхронизации досок для такого аккаунта скрыта.
- Пользовательский эффект: испорченная дата или неопределённый refresh больше не выглядят как нормальное подключение; пользователь видит следующий шаг прямо в настройках и не получает бессмысленную ошибку загрузки досок.
- Source-level проверка выполнена повторным чтением изменённых файлов с feature branch. Существующие backend unit tests уже покрывают malformed/missing/expired/future expiry через общую функцию, но тесты фактически не запускались. Frontend lint/build не запускались.
- Не было Pinterest API-запросов, production DB изменений, deployment или merge. PR #4 остаётся Draft/open/unmerged.
- Коммиты: `7425d86b7d6ee5918d123ccd2355c8081e3a4c52` (единая backend-проверка), `584ad5f628bbe12e061b41d0264243ab1ec69937` (UX переподключения).


## Дополнение к handoff — 2026-11-09 (AUD-219: локализованное восстановление Pinterest)

- В продолжение AUD-218 обнаружен UX-дефект: предупреждение и описание повторной авторизации было частично зашито на русском прямо в компоненте настроек, хотя PinPosy поддерживает семь языков.
- Добавлен ключ `pinterestReauthDescription` в типы i18n и все семь локалей: ru/en/de/es/fr/pt/zh. Компонент `PinterestCard.tsx` теперь получает текст через `t.settings`, а не показывает русскую строку всем пользователям.
- Пользовательский эффект: при проблеме Pinterest пользователь получает объяснение и действие переподключения на выбранном языке интерфейса.
- Изменения проверены повторным чтением исходников после коммитов. TypeScript build/lint и тесты не запускались; полноту переводов подтвердил source-level поиском по семи локалям и типам.
- Production, Pinterest API, база данных, deployment и merge не затрагивались.
- Коммиты: `2435bc7e3fcbcc2ccdd2265b509008d6ddf4706b` (тип), `fa520921ed63a334d8436004e8a787b4e5bb0e59` (ru), `4e37d97341181e4e453742e3da9863bdc319ec4c` (en), `efb5c0a955b1d9ad83f971c7bf23abc23bccb221` (de), `9a72cb7929fe35a31b5a0f08c26abc0c6d9ea4ae` (es), `e3d211d66bb62a28cef867ebfe5c2584730aa949` (fr), `ab52baa8e687b853fffd1096f220641c1fa2e96f` (pt), `08f8f9a8aaf3681ee28aeae9f63b795ad8b57fe0` (zh), `c240eb90cdad69382d865fd1add356ef4ef4ff90` (component).


## Дополнение к handoff — 2026-11-09 (AUD-220: проверка срока действия Pinterest OAuth-токена)

- Исправлен OAuth callback: раньше любое truthy `expires_in` сразу преобразовывалось в дату. Строка вроде `"abc"`, бесконечное/отрицательное/нулевое значение или число за пределами диапазона Date могло вызвать исключение, а отсутствие значения смешивалось с некорректным значением.
- Добавлен pure helper `backend/pinterestOAuth.js`. Отсутствующий/null/пустой срок по-прежнему даёт `null`; если поле передано, оно должно быть конечным положительным числом и давать валидную дату.
- Некорректный срок теперь останавливает OAuth callback до RPC сохранения аккаунта и даёт контролируемую ошибку 502; токены с испорченной датой не записываются.
- Добавлены `backend/test/pinterest-oauth.test.js` для отсутствующего, числового, строкового, malformed, NaN/Infinity, нулевого, отрицательного и выходящего за диапазон срока.
- Пользовательский эффект: некорректный ответ Pinterest больше не может незаметно сохранить сломанный срок действия токена; при отсутствии необязательного поля прежняя совместимость сохранена.
- Исходники и тесты проверены повторным чтением после записи. Node tests, полный backend suite, lint и build фактически не запускались. Production DB, Pinterest API, deployment и merge не затрагивались.
- Документ: `docs/audits/AUD-220-pinterest-oauth-token-expiry-validation.md`.


## Дополнение к handoff — 2026-11-09 (AUD-221: устойчивость пакета фоновых Pinterest-публикаций)

- В worker обнаружено, что rejected network promise при чтении журнала публикации или записи статуса расписания мог выйти из per-schedule catch и оборвать весь HTTP-запуск worker. Остальные уже захваченные задания оставались без обработки до stale-claim recovery.
- Добавлен pure helper `buildScheduleWorkerFailureState`: он централизует безопасную классификацию результата, ограничение повторов пятью попытками и расчёт задержки.
- Ошибка чтения журнала теперь перехватывается независимо от того, вернул Supabase объект с error или promise был отклонён. В обоих случаях исход помечается unknown и автоматический повтор запрещён.
- Ошибка сохранения статуса одного расписания теперь также перехватывается внутри обработки конкретного задания. Worker продолжает следующие строки; текущая строка остаётся fenced claim token и будет обработана существующим механизмом stale-claim recovery.
- Добавлены unit tests для сбоя чтения журнала, разрешённого безопасного повтора, исчерпания лимита и приоритета подтверждённой публикации.
- Пользовательский эффект: временный сетевой сбой базы при обработке одного пина больше не должен останавливать весь пакет. Неопределённый результат не превращается в повторную публикацию и не создаёт риск дубля.
- Файлы: `backend/pinterestSchedule.js`, `backend/pinterest.js`, `backend/test/pinterest-schedule.test.js`, `docs/audits/AUD-221-pinterest-worker-batch-resilience.md`.
- Исходники повторно прочитаны после записи; тесты, полный backend suite, SQL integration, lint и build фактически не запускались. Production, Pinterest API, deployment и merge не затрагивались.


## Дополнение к handoff — 2026-11-09 (AUD-222: повторная сверка подтверждённых Pinterest-публикаций)

- Найден пробел: migration 048 исправляла старые расписания `unknown` только один раз при применении миграции. Повторный worker tick не выполнял такую положительную сверку. Если расписание оставалось `unknown`, хотя журнал попытки и ledger уже подтверждали одну и ту же публикацию, оно могло застрять навсегда.
- Добавлена migration 091 с RPC `reconcile_confirmed_pinterest_schedule_successes()`. Она переводит только `unknown` → `published`, если совпадают владелец, pin, Pinterest account, board и remote pin ID в обоих независимых записях: attempt journal и publication ledger.
- RPC не меняет cancelled/failed/scheduled/publishing и не снимает неопределённость при отсутствии или расхождении доказательств. Это только восстановление подтверждённого успеха, а не повторная публикация.
- Worker вызывает сверку перед захватом новых заданий; если сверка не прошла, новые задания не захватываются.
- Добавлен PostgreSQL integration test: подтверждённая публикация восстанавливается, повторный запуск идемпотентен, несовпадающий remote ID не продвигает расписание. Миграция и тест подключены к atomic-payment workflow.
- Пользовательский эффект: расписание, которое зависло в «неизвестно», но фактически уже опубликовано и имеет точное подтверждение в базе, сможет автоматически перейти в «опубликовано» при следующем запуске worker. Без подтверждения оно останется заблокированным — дубли не создаются.
- Исходники повторно прочитаны после коммитов. CI ещё не подтверждён; локальный PostgreSQL test не запускался. Production DB, Pinterest API, deployment и merge не затрагивались.
- Коммиты: migration `b77169cfaea6a4f5f18ecc4ca16aa687f635e754`, SQL test `0293c6a3447cee27b6c0624a26659cdb357d0181`, worker `426d48b413dc4487618385152ac00e61b7751d12`, workflow `f389f9ade75fb9d074b9b8b3be09566be49a7b7e`.


### AUD-222 — дополнительная проверка схемы миграции

- При повторном чтении baseline обнаружено, что `pinterest_publications` имеет `created_at`, но не имеет `updated_at`. Исправлена ссылка в migration 091: время публикации берётся из `p.created_at`, а не из несуществующего столбца. Это предотвращает падение миграции на реальной схеме.
- Повторно сверены migration 091, baseline 001, SQL integration test, worker hook и workflow hooks. Схема таблицы подтверждает отсутствие `updated_at`; migration теперь использует существующий `created_at`.
- GitHub Actions для трёх workflow завершились failure, но GitHub не отдал логи job (BlobNotFound), а шаги вернулись пустыми. Поэтому причину failure нельзя честно приписать SQL или коду; это пока не подтверждённые проверки.
- Исправление: `ad93235bbca2699fa13e64c601ead44fd0aa9cc6`.


## Дополнение к handoff — 2026-11-09 (AUD-223: точная идентичность журнала Pinterest-расписания)

- При проверке восстановления worker обнаружено, что чтение журнала попытки фильтровалось по pin и Pinterest account, но не проверяло в возвращённой записи владельца и целевую Pinterest-доску.
- Исправлено: lookup дополнительно фильтруется по `user_id`; перед тем как доверять статусу `published`, worker требует точного совпадения user, pin, account и board с текущим захваченным расписанием.
- При несовпадении журнал считается недостоверным: статус остаётся `unknown`, remote ID не переносится в расписание, автоматический повтор не разрешается.
- Добавлен pure helper `hasMatchingScheduleAttemptIdentity` и тесты на совпадение/несовпадение каждого из четырёх полей.
- Пользовательский эффект: PinPosy не покажет расписание опубликованным на основании чужой или относящейся к другой доске записи; при конфликте данных безопасно остановится вместо ложного успеха или потенциального дубля.
- Файлы: `backend/pinterest.js`, `backend/pinterestSchedule.js`, `backend/test/pinterest-schedule.test.js`, `docs/audits/AUD-223-pinterest-schedule-journal-identity.md`.
- Исходники повторно прочитаны после коммитов. Unit tests, SQL integration, lint и build фактически не запускались; CI workflow runs на предыдущем HEAD завершались failure без доступных job logs. Production, Pinterest API, deployment и merge не затрагивались.
- Коммиты: `8e827b45dba271d8fdbb6a235f2ce49af2e6a349`, `86bc7519405360544b7b60cdeb5436d0d08620dd`, `3035da95f315e33d54213e9355883a762356cb2b`, документ `daa6904833637ce46213ed92a40eef08e2dee6d3`.


## Дополнение к handoff — 2026-11-09 (AUD-224: подтверждение записи статуса Pinterest-расписания)

- Найден дефект: worker делал условный UPDATE по id/status/claim_token, но проверял только SQL error. Если claim уже сменился, UPDATE мог успешно выполниться с нулём затронутых строк; worker ошибочно сообщал, что расписание переведено в scheduled/failed.
- Исправлено: UPDATE теперь возвращает изменённую строку через `.select("id").maybeSingle()`. Добавлен `isScheduleClaimUpdateConfirmed`; статус считается сохранённым только при наличии реально возвращённой строки.
- Если строка не затронута (например, claim уже принадлежит новому worker), текущий worker сообщает unknown и не утверждает, что переход состоялся.
- Добавлен unit test для подтверждённой записи, нулевого результата, SQL error и отсутствующего ответа.
- Пользовательский эффект: старый worker больше не сможет показывать ложный результат обработки задания, если другой worker уже получил право на него. Календарь и отчёт worker опираются на фактически сохранённое состояние.
- Файлы: `backend/pinterest.js`, `backend/pinterestSchedule.js`, `backend/test/pinterest-schedule.test.js`, `docs/audits/AUD-224-pinterest-worker-claim-update-confirmation.md`.
- Исходники повторно прочитаны после коммитов. Unit tests, SQL integration, lint и build фактически не запускались; CI не подтверждён. Production, Pinterest API, deployment и merge не затрагивались.
- Коммиты: `f1af1cbf6212e87efe9685e09c4349609cedb8e8`, `d4ab191e71351db5cb94e7ecc1131a0ff467da63`, `67d0da922ee594e8eb154aa59199efad9d8c41c6`, документ `9d9bd1a32f10a89e2b4d2795ac86bc8d6d8f68f9`.


## Дополнение к handoff — 2026-11-09 (AUD-225: финализация расписания при уже существующей публикации)

- Обнаружен путь восстановления: reservation RPC может вернуть `published`, если запись Pinterest-публикации уже существует. Раньше backend сразу возвращал успех, не завершая текущую строку расписания, поэтому календарь мог оставаться в `publishing` до следующей stale-reconciliation.
- Добавлена строгая проверка существующей публикации: remote pin ID обязателен, Pinterest board должен точно совпадать с назначением расписания.
- Для worker claim теперь выполняется условное обновление только конкретной строки расписания с точным user/pin/account/board и действующим claim token. Если строку уже завершил конкурентный процесс, успех принимается только после повторного чтения и подтверждения точного статуса/remote ID/board.
- При ошибке БД, несовпадении доски или потерянном claim backend не запускает повторный Pinterest POST и не сообщает ложный успех.
- Добавлены unit tests на корректный identity, неправильную доску и пустой remote ID. Изменения записаны в `docs/audits/AUD-225-existing-publication-schedule-finalization.md`.
- Исходники повторно прочитаны после коммитов; Node/PostgreSQL tests, lint и build фактически не запускались. Production, Pinterest API, deployment и merge не затрагивались.
- Коммиты: helper `3767a4a38366fa790904e7e5e8ce384941682c37`, tests `15cddc6a4de7052e36d89aba4c80834951b85446`, backend integration `e26169abaa3b62f7684ff973392cff277aefd2c2`.


## Дополнение к handoff — 2026-11-09 (AUD-226: полная идентичность при фиксации ошибок Pinterest worker)

- В failure/retry ветке worker обновление строки расписания раньше ограничивалось schedule ID, статусом `publishing` и claim token. Токен уже был основным fencing-механизмом, но эта ветка была слабее success/reconciliation веток: не фильтровала user, pin, Pinterest account и board.
- Добавлен `hasCompleteScheduleClaimIdentity`: обязательны непустые schedule ID, user ID, pin ID, Pinterest account ID, Pinterest board ID и claim token. Если чего-либо не хватает, worker отказывается менять запись.
- Conditional UPDATE теперь фильтруется по всем этим значениям, плюс `status=publishing` и точный claim token. Это не позволяет некорректному/устаревшему результату снять claim или изменить статус не той записи.
- Добавлены unit tests для каждого обязательного поля. Документация: `docs/audits/AUD-226-pinterest-worker-full-identity-fencing.md`.
- Коммиты: route `db49112ecb495cdc70845e5476f47775b447f7a4`, helper `db3e48ad928187420d9d7c6b27036437c0163508`, worker guard `799c95042122eba2fb03553f78003a370036bb80`, tests `01cf780fd183c0b6952ff88d51b1d8c78ea6a104`.
- Node/PostgreSQL tests, lint и build не запускались. Production, Pinterest API, deployment и merge не затрагивались.

## AUD-227 — Stop schedule retries when subscription is inactive
- The Pinterest worker now marks the local inactive-subscription gate as explicitly non-retryable. This prevents an older `failed/retry_safe=true` publication journal from repeatedly requeueing a schedule while the user has no eligible plan.
- Added a regression test: expired subscription + old retry-safe journal => terminal `failed`, no retry timestamp.
- Details: `docs/audits/AUD-227-inactive-subscription-schedule-retry.md`.
- No Pinterest request is sent when the tariff gate rejects the schedule. Transient backend/database errors and confirmed safe Pinterest rejections retain their existing retry behavior.
- Tests have not been executed locally; no production migration, deployment, or merge was performed.

## AUD-228 — Exact evidence for stale Pinterest schedule recovery
- Added migration 092 to override `claim_due_pin_schedules`: a stale `publishing` schedule becomes `published` only when the publication attempt and durable publication ledger match the schedule's exact user, pin, account, board, and remote pin ID.
- Mismatched board or missing publication ledger remains `unknown` and non-retryable. A safe failure is requeued only for the exact board recorded in its journal.
- Added `backend/test/pinterest-stale-schedule-recovery.integration.sql` and wired migration/test into PostgreSQL CI.
- Not applied to production; SQL integration test not yet executed; no deployment or merge.


## Дополнение к handoff — 2026-11-09 (AUD-229: полная сверка remote Pinterest Pin ID)

- Найден недостающий элемент identity: автоматическая сверка сравнивала remote Pin ID между attempt journal и publication ledger, но не сверяла его с уже заполненным `pin_schedules.pinterest_pin_id`.
- Добавлена migration 093: обе автоматические ветки восстановления (unknown → published и stale publishing recovery) теперь требуют, чтобы ID в расписании был пустым либо точно совпадал с remote ID в обоих независимых источниках.
- Если в расписании уже записан другой remote ID, запись остаётся unknown; существующий ID не перезаписывается, повторная публикация не разрешается.
- Добавлены регрессионные SQL-сценарии для обоих механизмов и подключение migration 093 к atomic-payment PostgreSQL CI после 091/092.
- Пользовательский эффект: PinPosy больше не сможет молча заменить уже сохранённый Pinterest Pin ID другим только потому, что attempt и publication ledger согласны между собой. Неопределённость остаётся заблокированной до отдельного расследования.
- Тесты SQL не запускались локально; CI должен подтвердить исполнение. Production DB, Pinterest API, deployment и merge не затрагивались.
- Документ: `docs/audits/AUD-229-pinterest-schedule-remote-pin-identity-fencing.md`.


## Дополнение к handoff — 2026-11-09 (AUD-230: точная идентичность журнала при смене доски failed-расписания)

- Найден пробел в RPC смены доски для failed schedule: перед повторной постановкой в очередь проверялись `status='failed'` и `retry_safe=true`, но не проверялись владелец и исходная доска самой попытки.
- Добавлена migration 094: retry-safe журнал разрешает смену доски только если его `user_id` и `pinterest_board_id` совпадают с заблокированной строкой расписания. Несовпадение возвращает `attempt_identity_mismatch`, оставляет запись failed и не меняет доску.
- Backend переводит эту причину в понятный HTTP 409: автоматическая смена доски заблокирована, требуется сверка.
- Добавлен PostgreSQL regression test: чужая доска не может разрешить переназначение; точное совпадение владельца/исходной доски и retry_safe=true разрешает переход на новую проверенную доску.
- CI теперь явно применяет исходную migration 086, затем 094, и запускает новый SQL test.
- SQL tests не запускались локально; CI должен подтвердить их. Production DB, Pinterest API, deployment и merge не затрагивались.
- Документ: `docs/audits/AUD-230-pinterest-failed-board-reassignment-attempt-identity.md`.

## Дополнение к handoff — 2026-11-09 (AUD-231: точная идентичность журнала при ручном повторе Pinterest-расписания)

- Найден пробел: ручной retry RPC и расчёт доступности кнопки «Повторить» доверяли журналу по pin/account и retry_safe, но не проверяли владельца и исходную Pinterest-доску журнала.
- Добавлена migration 095: retry_failed_pin_schedule теперь блокирует существующий журнал, если user_id или pinterest_board_id не совпадает с failed schedule. Статус должен быть строго failed, retry_safe строго true. Сохраняется порядок блокировок account → schedule → attempt и service_role-only доступ.
- GET /schedule теперь загружает user_id и pinterest_board_id попытки; helper getScheduleRetryability проверяет полную идентичность owner/pin/account/board. Календарь не предлагает повтор при конфликте.
- Endpoint ручного retry переводит attempt_identity_mismatch в HTTP 409 с понятным сообщением о необходимости сверки.
- Добавлены unit regression tests на несовпадение каждого identity-поля и PostgreSQL integration test: чужая доска блокирует retry и не меняет статус; точный retry-safe журнал разрешает повтор.
- Migration 095 и SQL test подключены к atomic-payment integration workflow после migration 094.
- Пользовательский эффект: нельзя случайно повторить публикацию на основании чужого/устаревшего журнала другой доски. Серверная кнопка скрывается, а БД независимо блокирует запрос даже от старого клиента.
- Тесты локально не запускались; CI ещё должен подтвердить фактическое выполнение. Production DB, Pinterest API, deployment и merge не затрагивались.
- Документ: docs/audits/AUD-231-pinterest-failed-schedule-retry-identity.md.

- CI follow-up по HEAD с изменениями кода и workflow: atomic-payment integration, Prodamus webhook tests и persisted-boards integration завершились failure. GitHub API вернул steps=null и logs_url=null; причина неизвестна, новые Node/SQL regression tests не считать пройденными. После обновления документации требуется учитывать отдельный новый HEAD/повторный CI.

## Дополнение к handoff — 2026-11-09 (AUD-232: повтор расписания по неизменяемому снимку)

- Найдена несогласованность: UI разрешал retry, если у расписания есть snapshot_image_url, но retry_failed_pin_schedule в БД требовал актуальный pins.image_url. После удаления/замены изображения исходного пина пользователь видел доступный повтор, который БД отклоняла.
- Добавлена migration 096: функция требует существующую принадлежащую пользователю запись pin и принимает непустой pins.image_url ИЛИ непустой snapshot_image_url расписания. Проверки аккаунта, расписания, attempt identity, retry_safe, уже существующей публикации и активных дубликатов сохранены; lock order account → schedule → attempt и service_role-only grant сохранены.
- Integration test расширен: после проверки блокировки чужой доски он устанавливает точную доску в журнале, удаляет pins.image_url и проверяет, что snapshot_image_url позволяет безопасный retry. Если нет ни live image, ни snapshot — retry по-прежнему блокируется.
- Migration 096 добавлена в atomic-payment integration workflow после 095; SQL regression test уже подключён в предыдущей задаче и теперь проверяет оба сценария.
- Пользовательский эффект: пользователь может повторить безопасную неудачную публикацию по сохранённому изображению, даже если оригинальный пин впоследствии отредактировали или у него удалили изображение. Повтор использует зафиксированный при планировании креатив.
- Локальные тесты не запускались; требуется CI-подтверждение. Production DB, deploy, Pinterest API и merge не затрагивались.
- Документ: docs/audits/AUD-232-pinterest-retry-immutable-snapshot.md.

- Regression SQL дополнен отрицательным случаем: если одновременно отсутствуют pins.image_url и snapshot_image_url, retry возвращает pin_unavailable и оставляет расписание failed.
- CI по HEAD после AUD-232: Prodamus webhook tests, atomic-payment integration и persisted-boards integration — failure. Все failed jobs вернули logs_url=null и steps=null; fetch logs завершился BlobNotFound 404. Причина failure неизвестна, тесты не считать пройденными.

## AUD-233 — скрытие worker claim token из API расписаний (2026-11-09)

- Найдено: API возвращал `pin_schedules.claim_token` вместе с полями расписания. Это внутренний fencing token, который нужен только worker для подтверждения владения заданием.
- `sanitizeScheduleForClient` теперь удаляет `last_error` и `claim_token`; sanitizer применён к ответам календаря, созданию расписания, восстановлению legacy account, смене доски, ручному retry и отмене.
- Unit regression расширен: публичный объект не содержит `claim_token`/`last_error`, исходная DB-shaped запись не мутируется.
- Статус: FIX IMPLEMENTED / CI UNVERIFIED. Node/CI фактическое выполнение не подтверждено; GitHub jobs на текущем PR завершаются failure без шагов/логов (BlobNotFound). Production не менялся, PR #4 остаётся Draft/open, merge/deploy не выполнялись.

## AUD-234 — тест восстановления stale Pinterest worker (2026-11-09)

- Расширен `backend/test/pinterest-stale-schedule-recovery.integration.sql`: проверяется, что stale claim переочередится только при `failed + retry_safe=true` для точной той же доски; безопасный отказ для другой доски оставляет расписание в `failed` без `next_attempt_at`.
- Исправлена очистка fixture: удаляется также publication ledger для сценария несовпадающего remote pin ID.
- Workflow уже применяет миграции 091–096 и запускает этот SQL test; workflow/production migration не менялись.
- Статус: TEST ADDED / CI UNVERIFIED. SQL не выполнялся локально; GitHub Actions по-прежнему без runner steps/logs. Production/deploy/merge не затрагивались.

## AUD-235 — восстановление неоднозначного ответа финализации Pinterest (2026-11-09)

- Найден реальный риск: Pinterest уже вернул remote Pin ID, а `complete_pinterest_publish_v2` ответил сетевой/PostgREST ошибкой. Такой ответ не доказывает rollback: транзакция могла уже сохранить publication ledger, attempt=`published` и schedule=`published`.
- Старый error path сразу вызывал `fail_pinterest_publish_v2` с `outcome_unknown=true`. Если completion уже commit-нулся, этот вызов мог понизить успешную попытку до `unknown` и стереть положительное доказательство для последующей reconciliation.
- Добавлен `matchesConfirmedPublicationLedger`: точное совпадение user, local pin, Pinterest account, board и remote Pinterest Pin ID.
- После неоднозначной ошибки completion backend теперь сначала читает `pinterest_publications`. Если точная строка найдена, он возвращает уже подтверждённый успех и НЕ вызывает failure-journal RPC. Если чтение не удалось, строки нет или identity расходится — остаётся прежний безопасный путь `unknown`, без повторного POST.
- Добавлены unit regression cases: точное совпадение, несовпадение каждого identity-поля, null ledger/expected.
- Пользовательский эффект: при потере ответа БД после уже сохранённой публикации PinPosy не должен сам стирать подтверждение успеха и оставлять календарь в неопределённости. Повторная публикация не запускается.
- Файлы: `backend/pinterestSchedule.js`, `backend/pinterest.js`, `backend/test/pinterest-schedule.test.js`, `docs/audits/AUD-235-pinterest-ambiguous-completion-ledger-recovery.md`.
- Статус: FIX IMPLEMENTED / STATIC READ-BACK COMPLETE / CI FAILURE UNDIAGNOSED. Node/SQL tests, lint и build локально не запускались. На текущем HEAD GitHub Actions atomic-payment integration, Prodamus webhook tests и persisted-boards integration завершились failure; GitHub вернул `steps=null` и `logs_url=null`, поэтому причина неизвестна и тесты не считать пройденными. Vercel status — `build-rate-limit` (лимит сборок, не установленная ошибка исходников). Production DB, Pinterest API, deployment и merge не затрагивались.

## AUD-236 — контекст креатива для ручного восстановления Pinterest (2026-11-09)

- Найден UX-пробел в уже существующей безопасной ручной сверке: если backend упал после создания пина Pinterest, но до сохранения remote ID, администратор видел локальный Pin ID/аккаунт/доску, но не видел неизменяемые заголовок и описание, с которыми создавалась публикация. Поиск правильного пина в Pinterest был затруднён.
- Добавлена миграция `097_admin_pinterest_inventory_creative_context.sql`: admin inventory RPC возвращает `creative_title` (snapshot title, fallback на live title, до 200 символов) и `creative_description` (snapshot description, fallback на live description, до 500 символов).
- Не возвращаются image URL, destination URL, storage paths, claim token и прочие приватные поля.
- Backend allowlists/truncates новые поля; Admin Pinterest Schedules показывает заголовок и описание запланированного креатива.
- Добавлен Node unit regression на поля/лимиты и PostgreSQL integration test на snapshot precedence и отсутствие утечки URL/private fields.
- Migration 097 и integration test добавлены в `.github/workflows/atomic-payment-integration.yml`.
- Пользовательский эффект: оператору легче найти именно тот уже созданный Pinterest-пин в нужном профиле и на нужной доске, когда remote ID потерян из-за падения backend. Это не включает автоматический retry и не помечает публикацию успешной без внешнего подтверждения.
- Статус: IMPLEMENTED / STATIC READ-BACK COMPLETE / CI FAILURE UNDIAGNOSED. Локально Node/SQL tests, lint/build не выполнялись. На текущем HEAD Prodamus webhook, persisted-boards frontend/backend и atomic-payment PostgreSQL workflows завершились failure; GitHub вернул `steps=null` и `logs_url=null`, поэтому причину определить нельзя и новые проверки не считать пройденными. Vercel сообщает `build-rate-limit`. Production migration/deploy/Pinterest API/merge не выполнялись.


## AUD-237 — конкурентный захват Pinterest-расписаний (2026-11-09)

- Проверена текущая DB coordination: `claim_due_pin_schedules` использует `FOR UPDATE SKIP LOCKED`, атомарно переводит строку в `publishing` и назначает уникальный `claim_token`. Последующие записи worker ограждены identity расписания и токеном. Process-local mutex не заменялся наугад: он не решает межсерверную конкуренцию.
- Добавлен `backend/test/pinterest-schedule-claim-concurrency.sh`: два независимых PostgreSQL worker-вызова одновременно конкурируют за очередь из двух заданий при удерживаемой блокировке первой строки. Проверяется, что доступное второе задание получает ровно один worker, второй не получает дубликат, а после снятия блокировки первая строка забирается отдельно.
- Финальная проверка требует для обоих заданий `publishing`, `attempts=1`, непустые и разные `claim_token`.
- Новый regression script подключён в `.github/workflows/atomic-payment-integration.yml` после Pinterest publication concurrency test. Отдельная миграция не нужна: тест проверяет уже существующий атомарный DB claim.
- Пользовательский эффект: при одновременном пробуждении двух экземпляров PinPosy одна запланированная публикация не должна обрабатываться обоими; заблокированная строка не блокирует обработку следующей свободной.
- Статус: TEST ADDED / STATIC READ-BACK COMPLETE / CI UNVERIFIED. Локальная PostgreSQL среда недоступна, shell/SQL test не запускался. Production DB, Pinterest API, deployment и merge не затрагивались.
- Документ: `docs/audits/AUD-237-pinterest-schedule-claim-concurrency.md`.


## AUD-238 — гонки отмены и публикации Pinterest (2026-11-09)

- Проверена точка синхронизации отмены: API обновляет только `status='scheduled'`; worker claim переводит запись в `publishing` с fencing token. Если отмена первая — worker не должен claim-ить строку; если worker первый — отмена не должна сбросить токен или изменить статус.
- Исправлен UX `POST /schedule/:id/cancel`: после неуспешного условного UPDATE backend различает отсутствующую/чужую запись (404) и существующую запись с уже изменившимся статусом (409). Для `publishing` и `published` пользователь получает объяснение, что отмена уже невозможна. Повторное чтение не меняет состояние.
- Добавлен `backend/test/pinterest-schedule-cancellation-race.integration.sql`: cancel-first подтверждает, что worker не забирает cancelled запись; worker-first подтверждает, что cancel не изменяет publishing status и не очищает claim token. Тест транзакционный и заканчивается rollback.
- SQL test подключён в `.github/workflows/atomic-payment-integration.yml`.
- Смена доски проверена по backend flow: разрешена только для failed, а RPC повторяет проверку актуального состояния в БД перед изменением; completion/failure worker fenced точной identity и claim token. Не менял уже защищённую логику без найденного дефекта.
- Пользовательский эффект: вместо ложного «не найдено» пользователь видит конфликт, если публикация уже началась; запрос отмены не может перезаписать worker-owned состояние, а отменённая заранее запись не попадёт в очередь.
- Статус: FIX + REGRESSION TEST ADDED / CI UNVERIFIED. Локальная PostgreSQL среда отсутствует, SQL не запускался. Production DB, Pinterest API, deployment и merge не затрагивались.
- Документ: `docs/audits/AUD-238-pinterest-cancellation-publication-race.md`.


## AUD-239 — подтверждённая публикация после отключения Pinterest (2026-11-09)

- Проверена граница отключения: новая публикация резервируется только при активном аккаунте под блокировкой account row; disconnect синхронизирован с этой же строкой. Если disconnect фиксируется первым, новый publish не стартует.
- Уже отправленный внешний HTTP-запрос невозможно отменить локальным disconnect. Поэтому `complete_pinterest_publish_v2` намеренно допускает финализацию по сохранённой identity даже после отключения аккаунта, сохраняя фактический remote success и предотвращая риск повторной публикации после reconnect.
- Найден пробел в тестах: прежний integration test проверял сохранение статуса in-flight schedule при disconnect, но не проверял поздний успешный ответ Pinterest после disconnect.
- Расширен `backend/test/pinterest-account-publication.integration.sql`: durable attempt создаётся до disconnect; после очистки токенов и отключения аккаунта вызывается completion; проверяется точная запись publication ledger, attempt/schedule = published, claim_token очищен, токены остаются null.
- Workflow уже запускает этот SQL test; дополнительная migration не нужна.
- Пользовательский эффект: отключение блокирует новые публикации, но не стирает подтверждённый результат уже начатого запроса. PinPosy сможет помнить, что пин уже создан в Pinterest, и не провоцировать дубликат после повторного подключения.
- Статус: REGRESSION TEST ADDED / STATIC READ-BACK + CI PENDING. SQL локально не запускался. Production DB, Pinterest API, deployment и merge не затрагивались.
- Документ: `docs/audits/AUD-239-pinterest-late-success-after-disconnect.md`.


## AUD-240 — устаревший OAuth callback после повторного подключения (2026-11-09)

- Статически проверен OAuth fencing: state содержит attempt ID, generation, token version и browser binding; commit RPC блокирует OAuth state row и сверяет все fence-поля до изменения account row. Новый attempt/disconnect инвалидирует старые callbacks. Та же external Pinterest identity reconnect использует прежний account UUID.
- Нового runtime-дефекта не найдено; существующий fencing не переписывался.
- Усилен `backend/test/pinterest-oauth.integration.sql`: attempt C стартует до disconnect; после disconnect новый attempt D подключает ту же внешнюю identity в прежнюю account row; запоздавший callback C приходит с тем же external ID, но старыми username/access/refresh tokens. Тест требует stale rejection и сохранения свежего username/token pair, connected state и account UUID.
- CI workflow уже запускает этот SQL test, отдельный workflow step/migration не нужен.
- Пользовательский эффект: запоздавшая OAuth-вкладка не может затереть токены нового подключения того же Pinterest-аккаунта.
- Статус: REGRESSION TEST ADDED / STATIC READ-BACK + CI PENDING. SQL локально не запускался. Production DB, Pinterest API, deploy и merge не затрагивались.
- Документ: `docs/audits/AUD-240-pinterest-stale-oauth-callback-after-reconnect.md`.


## AUD-241 — восстановление Pinterest refresh после HTTP 429 (2026-11-09)
- Исправлен UX-сбой: явный HTTP 429 от Pinterest больше не переводит аккаунт в состояние, требующее повторного OAuth-подключения.
- После 429 backend снимает `refresh_state='uncertain'` только условным UPDATE точной строки (account/user/updated_at/uncertain); при гонке с reconnect или изменением аккаунта очистка не затрагивает новое состояние.
- Возвращается HTTP 503 с понятным сообщением подождать и повторить действие; автоматический повтор refresh не запускается.
- Сетевые ошибки, таймауты, 5xx и неполные ответы остаются fenced: старый refresh token не переиспользуется, требуется безопасная OAuth-авторизация.
- Добавлены unit-регрессии классификации 429 и PostgreSQL-сценарий условного снятия fence + защита от stale cleanup после reconnect. Существующий workflow уже запускает SQL-файл.
- Изменения: `backend/pinterest.js`, `backend/pinterestRefreshRecovery.js`, `backend/test/pinterest-refresh-recovery.test.js`, `backend/test/pinterest-refresh-disconnect-fencing.integration.sql`, `docs/audits/AUD-241-pinterest-refresh-rate-limit-recovery.md`.
- Тесты Node/PostgreSQL локально не запускались; CI на новом HEAD требует отдельной проверки. Не считать проверки пройденными до реального зелёного запуска. Production не менялся, миграции не применялись, deployment и merge не выполнялись.


## AUD-242 — не требовать повторный OAuth при истечении access token (2026-11-09)
- `expires_at` относится к access token, который можно обновить существующим refresh token. Раньше любой истёкший/некорректный expiry преждевременно включал `needs_reauth` и блокировал загрузку досок в настройках.
- Теперь OAuth reconnect требуется, если refresh state `uncertain`, либо access token уже истёк/expiry повреждён и refresh token отсутствует. При наличии refresh token штатный API flow может выполнить безопасное обновление по 401.
- Отсутствующий expiry для legacy-записей остаётся нейтральным.
- Добавлены регрессии для истёкшего/некорректного expiry с refresh token и без него; существующий backend test workflow покрывает этот файл.
- Изменения: `backend/pinterestPublicAccount.js`, `backend/test/pinterest-public-account.test.js`, `docs/audits/AUD-242-pinterest-expired-access-token-refresh.md`.
- Node/Frontend/PostgreSQL tests локально не запускались. CI на новом HEAD требует проверки. Production, реальные Pinterest API-вызовы, миграции, deployment и merge не затрагивались.
