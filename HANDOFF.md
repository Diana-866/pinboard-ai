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


## AUD-243 — учитывать Retry-After Pinterest при безопасном повторе (2026-11-09)
- Исправлен общий Pinterest request wrapper: при HTTP 429 безопасные повторные запросы теперь учитывают `Retry-After` в секундах или HTTP-date вместо безусловной паузы 2 секунды.
- Некорректный/отсутствующий заголовок сохраняет fallback 2 секунды; задержка ограничена 60 секундами, отрицательное ожидание невозможно.
- Повтор по-прежнему выполняется максимум один раз. Для POST публикации `retryRateLimit:false` остаётся обязательным: автоматического повтора после 429 нет, чтобы не создавать дубли.
- Добавлены unit-регрессии и отдельный Node test step в `.github/workflows/atomic-payment-integration.yml`.
- Пользовательский эффект: чтение досок после rate limit не будет преждевременно повторяться вопреки сроку Pinterest; безопасная защита публикаций от дубликатов сохранена.
- Статус: FIX + TEST + CI WIRING ADDED / EXECUTION UNVERIFIED. Локальный Node test не запускался; дождаться реального CI. Production, реальные Pinterest API, БД, deployment и merge не затрагивались.
- Документ: `docs/audits/AUD-243-pinterest-retry-after-rate-limit.md`.

- Дополнительная проверка AUD-243 выявила JS edge case: `Date.parse("-1")` может принять отрицательное число за дату. Парсер теперь отклоняет числовые значения со знаком и использует fallback 2 секунды. Изолированный Node smoke test для seconds/date/malformed values прошёл; это не заменяет полный `node --test` suite.


## AUD-244 — надёжная загрузка списка Pinterest-досок (2026-11-09)
- Исправлена пагинация `GET /integrations/pinterest/boards`: вместо прежнего потолка 8×250 (2 000) поддерживается до 20×250 (5 000) досок.
- Вынесен helper `backend/pinterestBoardsPagination.js`: обнаруживает повторный bookmark до повторного запроса, не отдаёт частичный список как полный при ошибке/исчерпании лимита и сохраняет provider errors.
- Добавлены тесты `backend/test/pinterest-boards-pagination.test.js` на полный список, повтор cursor, лимит и ошибку Pinterest; тест включён в atomic-payment workflow.
- Пользовательский эффект: большой аккаунт может получить полный список большего числа досок; при сбое пагинации PinPosy не выдаёт неполный список за полный и не зацикливает повторные страницы.
- Статус: IMPLEMENTED / STATIC READ-BACK PENDING / CI UNVERIFIED. Локальный Node test не запускался. Production, реальные Pinterest API, deployment и merge не затрагивались.
- Документ: `docs/audits/AUD-244-pinterest-board-pagination-guard.md`.


## AUD-245 — ошибки загрузки Pinterest-досок видны пользователю (2026-11-09)
- В `frontend/src/components/settings/PinterestCard.tsx` ошибка загрузки досок больше не превращается в пустой список. Добавлены отдельные состояния loading/error, alert с сообщением API и кнопка повторной синхронизации.
- Пустое состояние показывается только после успешного ответа с нулём досок; временная ошибка Pinterest/сети больше не выглядит как отсутствие досок.
- Сохранена защита от гонок между переключением аккаунтов и ручными повторами: обновлять UI может только последний запрос.
- Статус: IMPLEMENTED / STATIC READ-BACK PENDING / FRONTEND BUILD UNVERIFIED. Полный frontend build и component tests не запускались. Production, Pinterest API, deployment и merge не затрагивались.
- Документ: `docs/audits/AUD-245-pinterest-boards-fetch-error-ui.md`.


## AUD-246 — календарь передаёт выбранный слот в генератор (2026-11-09)
- Исправлен разрыв между календарём и генератором: ранее дата передавалась, но выбранное время и рабочая доска терялись. Теперь callback передаёт тему, дату, время и ID выбранной доски.
- Генератор применяет переданные дату/время и сохраняет явный выбор доски вместо автоматической тематической рекомендации. Удалён фиктивный fallback ID `b-1`, который мог запускать загрузку пинов несуществующей доски до появления реальных данных.
- Контекст календаря очищается при переходах без календарных параметров, чтобы не переносить старое время/доску в следующую независимую генерацию.
- Изменения: `frontend/src/components/calendar/PublishingCalendar.tsx`, `frontend/src/App.tsx`, `frontend/src/components/pins/PinGenerator.tsx`.
- Статус: IMPLEMENTED / STATIC READ-BACK PASSED / FRONTEND BUILD UNVERIFIED. Локальный frontend build, TypeScript и component tests не запускались. Production, рабочая БД, Pinterest API, deployment и merge не затрагивались.
- Документ: `docs/audits/AUD-246-calendar-slot-context-to-generator.md`.


## AUD-247 — корректное время режима «Опубликовать сейчас» (2026-11-09)
- Ранее дата рассчитывалась по часовому поясу устройства, а время форматировалось локалью интерфейса. При 12-часовой локали получалось значение вроде `5:30 PM`, не соответствующее контракту API `HH:mm`; при отличии сохранённого часового пояса PinPosy от часового пояса устройства дата могла расходиться со временем.
- Теперь дата и время вычисляются из одного instant через `formatInstantInTimezone` в выбранном часовом поясе PinPosy. Это гарантирует согласованную пару и 24-часовое `HH:mm`.
- Добавлен regression test: полночь в Лондоне и предыдущий календарный день в Нью-Йорке.
- Изменения: `frontend/src/components/pins/PinGenerator.tsx`, `frontend/src/utils/timezone.test.ts`, `docs/audits/AUD-247-publish-now-timezone-format.md`.
- Статус: IMPLEMENTED / STATIC READ-BACK PENDING / NODE TEST AND FRONTEND BUILD UNVERIFIED. Production, рабочая БД, Pinterest API, deployment и merge не затрагивались.
- Документ: `docs/audits/AUD-247-publish-now-timezone-format.md`.

## Дополнение к handoff — 2026-11-09 (AUD-248)

- Усилена проверка ответа `GET /boards/:id/pins` на фронтенде: кроме массива теперь проверяются объект каждой записи, непустой уникальный `id`, непустой абсолютный HTTPS `image_url`.
- Пустой массив по-прежнему считается корректной пустой доской. Некорректная запись больше не превращается в карточку с пустой картинкой или неоднозначным ID: загрузка доски показывает ошибку и предлагает повторить запрос.
- Добавлены unit regression tests для пустого списка, неверного формата ответа, null/не-объектных записей, отсутствующего/повторного ID, отсутствующей/битой/HTTP-ссылки изображения.
- Статическая проверка исходников после записи выполнена. Node tests, frontend build и TypeScript не запускались в этой среде; CI на новом HEAD ещё не подтверждён. Production и база данных не менялись.
- AUD-248: FIXED_UNVERIFIED до выполнения тестов в CI.

## Дополнение к handoff — 2026-11-09 (AUD-249)

- Исправлена привязка статуса автосохранения описания к конкретному пину в `PinGenerator.tsx`. Ранее общий state-компонент мог показывать «Сохранено»/«Не сохранено» для другой открытой карточки, потому что завершение PATCH предыдущего пина обновляло общий статус.
- Теперь состояние содержит ID пина, к которому относится; при просмотре другого пина показывается его собственное состояние (или ошибка, если для него остался локальный recovery draft). Восстановление черновиков на доске также сохраняет ID первого пина с черновиком, а остальные черновики выявляются по локальному хранилищу.
- Статическая запись/чтение исходника выполнены. Unit/build/TypeScript не запускались; CI ещё не подтверждён.
- AUD-249: FIXED_UNVERIFIED.


## AUD-250 — ограничение длины описания пина в редакторе (2026-11-09)
- Найдено несоответствие: счётчик редактора показывал лимит 500 символов, а backend PATCH /pins/:id также принимает описание максимум 500 символов, но textarea не имела maxLength. Пользователь мог ввести более 500 символов, получить отказ сохранения и видеть текст как несохранённый.
- Исправлено: добавлен maxLength={500} к полю описания пина. Ограничение интерфейса теперь совпадает с серверным контрактом; текст можно редактировать и сохранять без заведомо отклоняемого из-за длины запроса.
- Проверка: статически сверены поле редактора, счётчик 500 и backend-валидация description max 500. Изменение записано в commit 96d0745641af2e21784b6f1775428082f6db14ae.
- Не запускались локальный frontend build, TypeScript и браузерные тесты; CI ещё не подтверждён. Production и база не затрагивались.


## AUD-251 — согласование MIME-фильтра загрузки изображений пинов (2026-11-09)
- Найдено несоответствие: постоянное хранилище, проверка сигнатуры файла и конфигурация bucket поддерживали GIF, но Multer-фильтр маршрута `POST /pins/:id/image` пропускал только PNG/JPEG/WebP. GIF отклонялся до проверки содержимого, несмотря на поддержку формата остальной системой.
- Исправлено: создан `backend/imageUploadValidation.js` с единым allowlist PNG/JPEG/WebP/GIF; маршрут использует helper. MIME нормализуется (регистр, пробелы, параметры после `;`).
- Добавлен `backend/test/image-upload-validation.test.js`: поддерживаемые типы, нормализация и отказ SVG/BMP/не-image. Тест включён в atomic-payment workflow.
- Пользовательский эффект: загрузка анимированных GIF-пинов больше не блокируется только из-за устаревшего MIME-фильтра; SVG и неподдерживаемые типы по-прежнему отклоняются, а содержимое всё равно проходит проверку сигнатуры.
- Проверка: статически сверены allowlist маршрута, валидатор сигнатуры и конфигурация bucket. Node-тест не запускался локально; CI для нового HEAD ожидает запуска/результата. Production и Storage не затрагивались.


## AUD-252 — понятные ошибки загрузки изображения пина (2026-11-09)

- Найдено два UX-дефекта в цепочке Multer: неподдерживаемый MIME отбрасывался через `cb(null, false)`, из-за чего пользователь получал общий ответ «передайте файл»; превышение лимита 5 МиБ и неверное multipart-поле возникали в middleware до async route handler и могли уходить в стандартный Express error handler вместо JSON API-ответа.
- Исправлено: неподдерживаемый тип теперь получает явную ошибку; middleware переводит известные ошибки Multer в JSON с корректными статусами: 415 для неподдерживаемого типа, 413 для файла больше 5 МиБ, 422 для неожиданного поля. Неизвестные ошибки передаются дальше штатному обработчику, не маскируются.
- Текст ошибки для отсутствующего файла теперь перечисляет все поддерживаемые форматы, включая GIF, и использует согласованный лимит 5 МиБ.
- Добавлены `backend/imageUploadErrors.js` и `backend/test/image-upload-errors.test.js`; workflow запускает новые тесты вместе с MIME-тестами.
- Пользовательский эффект: вместо непонятного «передайте файл» или HTML/500 при большом файле пользователь получает понятную причину и может исправить загрузку.
- Статус: IMPLEMENTED / STATIC READ-BACK PENDING / NODE TEST AND CI UNVERIFIED. Локальные Node-тесты, backend build и реальные HTTP multipart-проверки не запускались. Production, Storage, база данных, deployment и merge не затрагивались.
- Документ: `docs/audits/AUD-252-pin-image-upload-error-responses.md`.


## AUD-253 — защита лимита загрузки изображений от IPv6-ротации (2026-11-09)

- Найдено: `imageUploadLimiter` использовал пользовательский ключ `req.userId || req.ip`. В отличие от стандартного key generator `express-rate-limit`, этот вариант не нормализовал IPv6 по подсети. Клиент мог менять IPv6-адреса внутри одной подсети и получать отдельные IP-бакеты, обходя лимит загрузок.
- Исправлено: добавлен `backend/pinImageRateLimitKey.js`; для авторизованных запросов ключ стабилен по user ID, для остальных применяется официальный `ipKeyGenerator` из зафиксированной в lockfile версии `express-rate-limit@8.7.0` (IPv6 subnet normalization). Пространства ключей `user:` и `ip:` разделены; отсутствующий IP попадает в консервативный общий бакет.
- Добавлены тесты: два IPv6 адреса в одном /56 дают один бакет; разные /56 разделяются; пользовательский ID переживает смену IP; IPv4 остаётся адресным; отсутствующий IP безопасно обработан.
- CI теперь устанавливает backend зависимости через `npm ci --prefix backend` и запускает новый тест вместе с тестами загрузки.
- Пользовательский эффект: смена IPv6-адреса в пределах своей подсети больше не должна давать дополнительные попытки загрузки. Авторизованный пользователь ограничивается единым лимитом независимо от смены IP.
- Статус: IMPLEMENTED / STATIC READ-BACK PENDING / CI UNVERIFIED. Unit-тесты локально не запускались. Не менялись лимит 20 загрузок за 15 минут, production, Storage, БД, deployment или merge.
- Документ: `docs/audits/AUD-253-ipv6-upload-rate-limit-bypass.md`.


## AUD-254 — ограничение multipart-запроса загрузки изображений (2026-11-09)

- Найдено: маршрут загрузки пина ограничивал размер файла до 5 МиБ, но не ограничивал число/размер дополнительных текстовых полей и общее число multipart-частей. Это позволяло авторизованному клиенту отправлять ненужные большие multipart-формы и расходовать память/ресурсы backend.
- Исправлено: Multer теперь ограничивает один файл, 10 текстовых полей, 16 КиБ на поле и 11 частей суммарно (одно изображение + максимум 10 полей). Лимит файла 5 МиБ сохранён.
- Ошибки LIMIT_FIELD_VALUE, LIMIT_FIELD_COUNT, LIMIT_PART_COUNT и LIMIT_FILE_COUNT преобразуются в предсказуемые JSON-ответы 413/422 с понятными сообщениями; неизвестные ошибки по-прежнему передаются штатному Express error handler.
- Добавлены регрессионные тесты сериализатора ошибок. Тесты загрузки уже входят в atomic-payment workflow с npm ci --prefix backend.
- Пользовательский эффект: endpoint принимает только компактную форму с одним изображением и не расходует память на неограниченные дополнительные поля; корректные загрузки PNG/JPG/WebP/GIF до 5 МиБ не затронуты.
- Статус: IMPLEMENTED / STATIC READ-BACK AND CI EXECUTION PENDING. Node-тесты и реальные multipart HTTP-проверки не запускались в этой среде. Production, Storage, БД, deployment и merge не затрагивались.
- Документ: docs/audits/AUD-254-multipart-upload-limits.md.


## AUD-255 — защита от гонки при одновременной замене изображения пина (2026-11-09)

- Найдено: два параллельных POST /pins/:id/image могли прочитать один и тот же старый image_url, загрузить два объекта, а затем оба безусловно обновить строку. Более медленный запрос мог перезаписать результат более нового запроса; проигравший объект мог остаться сиротой в Storage.
- Исправлено: обновление pins.image_url теперь compare-and-swap — WHERE дополнительно проверяет ранее прочитанный image_url. Для исходного NULL применяется IS NULL. Если строка уже изменилась, UPDATE не затрагивает запись, новый объект очищается через защищённый reference-aware lifecycle, клиент получает HTTP 409 с просьбой обновить карточку.
- Добавлен helper backend/pinImageCompareAndSwap.js и unit regression tests для существующего URL и NULL; тест включён в atomic-payment CI.
- Пользовательский эффект: медленная параллельная загрузка больше не может молча затереть более новое изображение; конфликт виден пользователю, а лишний файл безопасно удаляется при отсутствии ссылок.
- Статус: IMPLEMENTED / STATIC READ-BACK AND CI EXECUTION PENDING. Node tests и реальный конкурентный HTTP-тест не запускались локально. Production, Storage, БД, deployment и merge не затрагивались.
- Документ: docs/audits/AUD-255-concurrent-pin-image-replacement.md.\n\n## AUD-256 — криптографически случайные адреса изображений и CI lifecycle tests (2026-11-09)\n\n- Найдено: обычные загружаемые изображения получали имена `timestamp + Math.random()`. Это не криптографический генератор; публичные URL изображений не являются секретом, но предсказуемые имена упрощают перебор адресов и создают слабый стандарт для публичного object storage.\n- Исправлено: случайный компонент пути теперь создаётся через `crypto.randomBytes(8)` (64 бита энтропии); timestamp сохранён для удобства операционной диагностики. Формат остаётся совместим с `extractManagedPinImagePath`, поэтому защищённое удаление и существующие объекты не ломаются.\n- Добавлен тест формата, уникальности двух независимых путей и совместимости с безопасным извлечением managed path.\n- Дополнительно найден пробел в CI: `backend/test/pin-image-lifecycle.test.js` существовал, но workflow не запускал его. Добавлен отдельный шаг `node --test backend/test/pin-image-lifecycle.test.js`.\n- Пользовательский эффект: имена новых загруженных изображений существенно сложнее предсказать; жизненный цикл Storage (резервирование, подтверждение/отказ, fencing и удаление) теперь будет проверяться в PR CI, а не оставаться вне автоматического набора.\n- Проверка: изменения внесены и затем будут перечитаны из GitHub; локальные Node-тесты здесь не запускались. До результата GitHub Actions считать CI-проверку неподтверждённой. Production, Storage, БД, deployment и merge не затрагивались.\n- Документ: `docs/audits/AUD-256-cryptographic-pin-image-paths-and-ci.md`.\n

## AUD-257 — согласование формата image path между backend и PostgreSQL (2026-11-09)

- При контрольной проверке AUD-256 обнаружен критичный регрессионный дефект: backend начал создавать имена `pins/<timestamp>-<32 hex>.<ext>`, но исторические SQL-функции `managed_pin_image_object_path`, `begin_pin_image_upload` и `claim_pin_image_deletion` принимали только `1..16` символов после timestamp.
- Следствие: новые обычные загрузки отклонялись бы на резервировании в БД; SQL parser также не распознавал бы эти URL как managed references. Из-за этого изменение AUD-256 нельзя было считать рабочим без синхронизации БД.
- Исправление: добавлена новая миграция `098_pin_image_paths_support_128_bit_random_ids.sql`. Она обновляет parser, upload reservation и deletion claim guards до 32 hex-символов, сохраняя поддержку старого формата. Исторические миграции не переписывались.
- Добавлен PostgreSQL regression-сценарий: 32-hex object path должен пройти SQL parser → upload reservation → upload finalization → deletion claim → deletion finalization.
- Миграция 098 добавлена в atomic-payment CI после миграции 097; SQL lifecycle integration test уже выполняется после набора миграций.
- Исправлен также дефект оформления теста AUD-256: тест теперь содержит корректный JavaScript и проверяет 32 hex-символа в обоих независимых путях. Комментарий в lifecycle helper приведён к обычным строкам.
- Проверка: изменённые файлы повторно читаются из GitHub; локальные Node/PostgreSQL тесты здесь не запускались. До полноценного GitHub Actions прогона считать runtime-проверки неподтверждёнными. Миграция не применялась к рабочей Supabase БД; production, Storage, deployment и merge не затрагивались.
- Документ: `docs/audits/AUD-257-image-path-database-compatibility.md`.
- Дополнение по CI на HEAD `58c8f2d`: два workflow появились. `Persisted boards integration checks` после повторного запуска находится в `queued`; `Prodamus webhook tests` остался `failure`, GitHub Jobs API не предоставил шаги (`steps=null`) и логи (`logs_url=null`), поэтому причина неизвестна. Успешный прогон AUD-257 пока не подтверждён. Vercel preview по-прежнему сообщает `build-rate-limit`.


## AUD-258 — инвентаризация quarantined изображений (2026-11-09)

- Найден эксплуатационный пробел: зависшие/неоднозначные Storage операции безопасно переводят object path в `quarantined`, но администратор не мог проверить, остался ли объект физически в бакете.
- Добавлена миграция `099_pin_image_quarantine_inventory.sql`: read-only RPC показывает quarantined пути, число попыток, код причины, дату изменения и наличие ссылок в пинах, расписаниях и журналах генерации. Доступ только через `service_role`; прямой доступ к lifecycle-таблице не расширяется.
- Backend добавил `inspectQuarantinedPinImageObjects` и admin endpoint `GET /admin/storage/quarantined-objects?limit=50`. Endpoint ограничивает выборку 1–100, проверяет формат каждого пути и сверяет точное имя в Storage.
- Добавлены Node unit tests, SQL integration assertions и применение миграции 099 в atomic-payment CI.
- Важно: инвентаризация ничего не удаляет и не снимает quarantine. Наличие объекта и отсутствие ссылок сами по себе не доказывают, что старый удалённый запрос завершился; автоматическое удаление могло бы нарушить fencing.
- Проверки: изменения внесены в ветку; локальные Node/PostgreSQL тесты не запускались. CI на текущем HEAD требуется проверить. Миграция не применялась к production; Storage, deployment и merge не затрагивались.
- Документ: `docs/audits/AUD-258-quarantined-image-inventory.md`.


## AUD-259 — точная классификация Storage 404 при удалении (2026-11-09)

- Исправлен дефект: ранее любой Storage HTTP 404 трактовался как доказательство отсутствия именно объекта, после чего lifecycle мог выставить `deleted`. 404 от отсутствующего бакета/endpoint не подтверждает успешное удаление целевого файла.
- Добавлена `isStorageObjectNotFound(error)`: успех только при статусе 404, object-specific code (`not_found`, `object_not_found`, `no_such_key`) и сообщении, явно указывающем на отсутствие object/key.
- Общий 404 (например, `Bucket not found`) теперь token-checked финализируется как `delete_failed`, после чего ошибка возвращается вызывающему коду. 5xx и transport errors остаются fenced без финализации.
- Добавлены регрессионные тесты на object-specific 404, generic 404 и поведение deletion lifecycle. Обновлён `docs/storage-lifecycle.md`.
- Проверка: изменения перечитаны из GitHub. Локальный Node/PostgreSQL запуск не выполнялся; GitHub Actions на текущем HEAD возвращает failure без доступных логов/steps. Production DB/Storage, deploy и merge не затрагивались.
- Документ: `docs/audits/AUD-259-storage-delete-404-classification.md`.


## AUD-260 — повторяемая финализация жизненного цикла изображений (2026-11-09)

- Найден дефект потерянного подтверждения: Storage мог успешно загрузить/удалить объект, PostgreSQL мог зафиксировать финализацию, но ответ RPC терялся. Повтор того же RPC раньше возвращал false, потому что исходный claim token уже был очищен; приложение ошибочно воспринимало завершённую операцию как неудачную.
- Добавлена миграция 100_idempotent_pin_image_lifecycle_finalization.sql: lifecycle-таблица хранит last_finalized_token; повтор финализации принимается только при совпадении исходного токена и точного терминального результата (успех/ошибка и код). Чужой токен и конфликтующий исход отклоняются.
- Backend теперь делает не более одной повторной попытки RPC-финализации загрузки или удаления с теми же аргументами и тем же fencing token. Неоднозначные Storage upload/delete запросы не повторяются автоматически; их защита quarantine/fencing сохранена.
- Добавлены Node regression tests для временного отказа ответа finalize RPC и PostgreSQL integration assertions для повторного успеха/ошибки, неправильного токена и конфликтующего исхода. Миграция 100 добавлена в atomic-payment CI.
- Исправлена найденная рядом ошибка YAML: шаг теста managed image lifecycle и следующий шаг были ошибочно записаны одной строкой с буквальными `\\n`; теперь это отдельные корректные записи `name`/`run`.
- Проверка: изменённые файлы перечитаны из GitHub на HEAD 821dadbd4f739dfeccba68ccbf06a04ee7829ca9 (кодовые изменения уже находились на предыдущем source HEAD a0c132335f748a92a0676bf9abc14755193a881d; последний commit после него обновил только документацию). Три PR workflow (atomic-payment integration, persisted boards integration, Prodamus webhook tests) завершились failure; GitHub Jobs API вернул steps=null/logs_url=null, скачивание логов — BlobNotFound. Поэтому фактический запуск новых Node/PostgreSQL тестов не подтверждён; не считать их пройденными. Vercel preview сообщает build-rate-limit. Миграция не применялась к рабочей Supabase БД; production Storage, deployment и merge не затрагивались; PR #4 остаётся Draft.
- Документ: docs/audits/AUD-260-idempotent-pin-image-finalization.md.


## AUD-261 — восстановление окончательно неудачных удалений изображений (2026-11-09)

- Найден дефект операционного восстановления: Storage 4xx-отказ корректно завершал claim как `delete_failed`, но приложение не предоставляло ни инвентаря этих объектов, ни административного способа безопасно повторить удаление. Неудачные объекты могли оставаться в Storage бессрочно.
- Добавлена миграция `101_retryable_pin_image_deletion_inventory.sql`: bounded RPC `list_failed_pin_image_deletions(1..100)`, доступный только `service_role`, возвращает исключительно строки `delete_failed`; неоднозначные `deleting` и `quarantined` в список не попадают.
- Добавлен backend helper `retryFailedPinImageDeletions` и защищённый admin endpoint `POST /admin/storage/retry-failed-deletions`. Каждый объект повторно проходит через существующий `claim_pin_image_deletion`, который блокирует lifecycle row и повторно проверяет ссылки из pins, schedules, generation tasks и regeneration requests. Объекты с актуальными ссылками, активными claims или quarantine не удаляются. Ошибка одного объекта не прерывает пакет.
- Добавлены Node regression tests для успешного повтора, отказа claim при наличии ссылки, отбраковки некорректных путей, per-object error и fail-closed inventory RPC; SQL integration assertions для инвентаря и верхней границы limit. Migration 101 включена в atomic-payment integration workflow.
- Восстановление намеренно operator-triggered, а не автоматическое: неоднозначные сетевые/5xx исходы остаются fenced и quarantine не снимается. Это закрывает повторную обработку подтверждённых отказов, не ослабляя защиту от поздних удалений. SQL integration coverage также проверяет, что quarantined paths не попадают в retry inventory; Node regression test проверяет, что 503/timeout не финализируется и остаётся fenced. Путь объекта валидируется тем же форматом, что и существующий managed-path parser (включая 32-hex suffix).
- Проверка: все изменённые файлы перечитаны из GitHub на HEAD `40c2b58ec8a6ec58e22ce5a9d4b50636e73f9476`. Три PR workflow завершились `failure`; GitHub jobs вернули `steps=null`, скачивание логов — `BlobNotFound`, поэтому причина не установлена и Node/PostgreSQL tests не считать пройденными. Vercel preview сообщает `build-rate-limit`. Production migration не применялась; production Storage, deployment и merge не затрагивались.
- Документ: `docs/audits/AUD-261-failed-pin-image-deletion-recovery.md`.

### AUD-261 follow-up correction

A subsequent code review caught and fixed a runtime wiring defect: `retryFailedPinImageDeletions` had not been included in `module.exports`, although `backend/index.js` imported it and the unit tests referenced it. The export is now present. The SQL integration test also explicitly verifies that the new failed-deletion inventory RPC is restricted to `service_role`, and its prerequisite comment includes migration 101. Latest GitHub Actions runs still have `steps=null`/`logs_url=null`; tests remain unverified. No production migration, Storage mutation, deployment, or merge was performed.

## AUD-262 — совместимость удаления с 128-битными именами изображений (2026-11-09)

- Найден критический дефект согласованности миграций: генератор backend создаёт timestamp-based object paths с 32 hex-символами случайности; миграция 098 расширила parser и `begin_pin_image_upload`, но действующая `claim_pin_image_deletion` из миграции 083 всё ещё принимала только 1–16 символов. В результате новые изображения могли успешно загружаться и сохраняться, но последующий claim удаления отклонял их.
- Добавлена миграция `102_pin_image_deletion_support_128_bit_random_ids.sql`: повторно устанавливает quarantine/fencing-safe реализацию claim-функции с regex, принимающим 1–32 символа для timestamp suffix. Логика блокировки активного claim, quarantine истёкшего неопределённого delete, проверки durable references, TTL и service_role-only grants сохранена.
- Добавлен PostgreSQL integration test: резервирование, финализация upload, claim deletion и финализация удаления пути с 32-hex suffix. Миграция 102 добавлена после 101 в atomic-payment integration workflow.
- Обновлены `docs/storage-lifecycle.md` и `docs/audits/AUD-262-128-bit-image-deletion-claim-compatibility.md`.
- Проверка: изменённые файлы перечитаны из GitHub; SQL test добавлен, но локально PostgreSQL не запускался. Production migration 102 не применялась; Storage, deployment и merge не затрагивались.


## AUD-263 — generated image journal retention (2026-11-09)

- Found and corrected a documentation/implementation mismatch: `docs/storage-lifecycle.md` incorrectly claimed completed/failed generation journal rows were historical and did not block deletion. Migration 102's active deletion claim checks every `pin_generation_tasks.storage_url` and `pin_regeneration_requests.storage_url` reference, regardless of parent status.
- Effect: generated images can remain in Storage indefinitely after a visible pin is replaced/deleted, because completed idempotency journals remain replayable. This is a real storage-retention limitation, not a safe-to-ignore reference.
- Did not weaken SQL reference guards: completed generation/regeneration requests can replay saved pin responses, and deleting their image objects would return broken URLs on retries. A safe fix requires a coordinated idempotency TTL, expired-key API behavior, journal retirement, and bounded cleanup inventory.
- Updated `docs/storage-lifecycle.md` and added `docs/audits/AUD-263-generated-image-journal-retention.md`. Existing SQL integration assertions already cover completed generation and regeneration journal references after the visible pin reference is removed; they were reviewed but not executed locally.
- No migration was added, no production data/Storage was changed, and no deployment or merge was performed. Node/PostgreSQL CI execution remains to be verified.


## AUD-264 — bounded generated-image retention inventory (2026-11-09)

- Added migration `103_pin_image_retention_candidate_inventory.sql` with read-only RPC `list_pin_image_retention_candidates(30..3650 days, 1..100 rows)`, executable only by `service_role`.
- Added admin endpoint `GET /admin/storage/retention-candidates?days=90&limit=100`, protected by authentication, DB-backed admin authorization, and the admin action rate limiter.
- The inventory groups object paths from completed generation task journals, completed generation replay payloads, and completed regeneration journals. It excludes objects still referenced by live pins, non-cancelled schedule snapshots, non-terminal/recent task journals, recent regeneration journals, and recent generation replay payloads. It only lists lifecycle rows in `active` or `delete_failed` state.
- Added PostgreSQL integration coverage for old completed journals, active pin references, recent regeneration references, recent generation replay payload references, bounded inputs, and RPC privilege restrictions. Added route middleware coverage and wired migration/test into the atomic-payment integration workflow.
- This is a read-only first phase: no idempotency records are expired, no URLs are cleared, and no Storage objects are deleted. A later phase must implement durable transactional retirement plus a crash-safe deletion queue before enabling cleanup.
- Files changed: migration 103; `backend/index.js`; `backend/test/pin-image-retention-inventory.integration.sql`; `backend/test/admin-storage-rate-limit.test.js`; `.github/workflows/atomic-payment-integration.yml`; `docs/storage-lifecycle.md`.
- Local PostgreSQL/Node tests were not run. CI status must be checked on the new HEAD; no production migration, Storage operation, deployment, or merge was performed.


## AUD-265 — regeneration replay image-reference guard (2026-11-09)

- Found a gap in the existing deletion/retention guards: completed regeneration requests persist both `storage_url` and a replayable `result_pin` JSON payload. The existing claim/inventory logic only inspected `storage_url`. If a legacy or inconsistent row retained `result_pin.image_url` while `storage_url` was null/different, the saved idempotent response could reference an image that cleanup was allowed to delete.
- Added migration `104_pin_regeneration_replay_image_reference_guard.sql`: deletion claims now treat `result_pin.image_url` as a durable reference; the bounded retention inventory reports it as `regeneration_replay` and excludes paths still referenced by recent/non-terminal replay rows.
- Added a PostgreSQL integration regression case with a completed regeneration journal whose `storage_url` is null but `result_pin.image_url` contains a managed Storage URL. It verifies deletion is blocked, inventory includes the replay reference, and the path becomes claimable only after the journal is removed.
- Migration 104 and the regression test are wired into atomic-payment integration CI. Local PostgreSQL tests were not run; GitHub Actions must confirm execution. No production migration, Storage operation, deployment, or merge was performed.
- This closes one reference-consistency gap; it does not yet implement journal expiry or automatic retention cleanup.


## AUD-266 — replay-expiry tombstones and durable cleanup queue staging (2026-11-09)

- Added migration `105_pin_image_replay_expiry_tombstones.sql`. It adds `replay_expired_at` to generation and regeneration journals and creates a deduplicated, service-role-only `pin_image_retention_queue` with explicit `awaiting_reference_retirement` state. Queue rows are not yet eligible for Storage deletion.
- Added bounded RPC `expire_pin_image_replay_results(days, limit)`. It only marks definitively completed generation/regeneration rows older than the selected window (default 90 days; days 30–3650; total batch limit 1–100 across both journal types). It collects managed image paths from generation task URLs, generation replay pins, regeneration storage URLs, and regeneration replay payloads, then stages unique paths in the queue in the same transaction.
- Preserves idempotency rows and keys. The latest generation and regeneration begin RPCs now return `status=expired` when the tombstone is present. Backend maps this to HTTP 410 / `idempotency_result_expired`, so the same key cannot silently submit a new paid provider task. Generation claim fencing from migration 046 is preserved, including claim tokens on fresh/resumed requests; regression coverage asserts this.
- Added admin-only, rate-limited `POST /admin/storage/expire-replay-results` and route-level regression coverage. Added SQL integration test for generation/regeneration tombstones, shared-path queue deduplication, exclusion of unknown/processing requests, service-role-only RPC permissions, bounded parameters, and preservation of an existing queue processing lease. Migration/test added to the atomic-payment integration workflow.
- Important phase boundary: this operation does not clear `pins`, task `storage_url`, regeneration `storage_url` or `result_pin`; it does not invoke Storage and does not delete anything. Queue state is `awaiting_reference_retirement` until a later transaction safely clears replay references and checks remaining pin/schedule/journal references. Existing deletion-claim fencing remains the final safety barrier.
- Changed files: migration 105; `backend/index.js`; `backend/test/pin-image-replay-expiry.integration.sql`; `backend/test/admin-storage-rate-limit.test.js`; workflow; `docs/storage-lifecycle.md`; this handoff.
- A follow-up review caught and corrected two edge cases before handoff: migration 105 now reuses the latest generation begin RPC from migration 046 instead of reverting to the older 045 claim behavior, and queue upserts no longer rewrite a `processing` state while a worker lease/token is active. The batch limit is enforced across generation and regeneration rows together.
- Local Node/PostgreSQL tests were not run. Current PR HEAD has no reported workflow runs yet; combined status shows only the Vercel `build-rate-limit` failure. CI must confirm migration/test execution. No production migration, Storage operation, deployment, or merge was performed.


## AUD-267 — generation replay image-reference deletion guard (2026-11-09)

- Found a mismatch between retention inventory and the final deletion claim: generation replay results persist image URLs in pin_generation_requests.pins[], but claim_pin_image_deletion checked only pin_generation_tasks.storage_url. A legacy/inconsistent row with a missing task URL could therefore retain a replayable image URL without blocking deletion.
- Added migration 106_pin_generation_replay_image_reference_guard.sql, extending the final claim function with a safe JSON-array scan of generation replay payloads. Existing pin, schedule, generation-task, regeneration storage, and regeneration replay guards remain intact; service-role-only execute privileges are preserved.
- Added a PostgreSQL regression case with a completed generation journal containing a managed image URL but no task row. It verifies deletion is blocked while the replay journal exists and becomes claimable after the journal is removed.
- Updated the deletion-claims integration test prerequisite comment, storage lifecycle documentation, and atomic-payment workflow to apply migration 106 after 105.
- Local PostgreSQL tests were not run. The migration and integration test are wired into CI; current PR status must be checked for actual execution. No production migration, Storage operation, deployment, or merge was performed.


## AUD-268 — upload reservation replay-reference guard (2026-11-09)

- Found the inverse of AUD-267: the upload reservation RPC could reuse an object path if it existed only in a saved generation/regeneration replay payload but was absent from task.storage_url / regeneration.storage_url. That could overwrite an image still returned by an idempotent replay.
- Added migration 107_pin_image_upload_replay_reference_guard.sql. begin_pin_image_upload now rejects paths referenced by generation request pins[].image_url or regeneration request result_pin.image_url, while preserving existing upload lifecycle state checks and 128-bit path validation.
- Added SQL regression coverage for both generation and regeneration replay-only references; updated the test prerequisite comment, storage lifecycle docs, and atomic-payment workflow to apply migration 107 after 106.
- Local PostgreSQL tests were not run. No production migration, Storage operation, deployment, or merge was performed.


## AUD-269 — transactional retirement of expired image replay references (2026-11-09)

- Implemented migration 108 with bounded service-role-only RPC `retire_expired_pin_image_replay_references(1..100)`. It clears generation replay `pins`, generation task `storage_url`, and regeneration `storage_url` / `result_pin` only after the corresponding journal has an expiry tombstone. Idempotency rows/keys remain, and repeat use of an expired key still returns HTTP 410.
- Queue paths move from `awaiting_reference_retirement` to `pending` only when no live pin, non-cancelled schedule, generation task, generation replay payload, or regeneration journal references them. Shared paths remain blocked until all references are retired. Existing processing leases and other queue states are preserved.
- Added admin-only, rate-limited `POST /admin/storage/retire-expired-replay-references`; added SQL regression coverage for generation/regeneration payload clearing, live-pin blocking, non-terminal journal blocking, and eventual queue release, plus route middleware and generation-recovery HTTP 410 coverage. The recovery GET endpoint now returns the same machine-readable `idempotency_result_expired` response as the generation POST route; migration 108 is wired into atomic-payment integration CI.
- Safety boundary: this phase does not call Storage or delete objects. A later bounded worker must claim pending queue rows, pass each path through `claim_pin_image_deletion`, and finalize/retry durably. No scheduler is enabled.
- Local Node/PostgreSQL tests were not run. CI must confirm execution. No production migration, Storage operation, deployment, or merge was performed.
- Document: `docs/audits/AUD-269-transactional-expired-replay-reference-retirement.md`.


# AUD-270 — fenced worker for retired image replay queue (2026-11-09)

## Implemented

- Added migration 109 with bounded claim_pin_image_retention_queue (1–25 rows) and token-fenced finalize_pin_image_retention_queue_item RPCs. Both are service-role-only; direct queue table access remains revoked.
- Added processPendingPinImageRetentionQueue and admin-only, rate-limited POST /admin/storage/process-retention-queue.
- Each claimed path is validated again and passed through the existing deleteManagedPinImageObject, whose claim_pin_image_deletion RPC is the final reference/fencing barrier immediately before Supabase Storage DELETE.
- A successful Storage delete is recorded as completed only with the matching queue claim token and an unexpired lease.
- A refused claim, invalid inventory row, Storage error, or uncertain finalization becomes blocked; no automatic replay of an ambiguous remote DELETE occurs.
- An expired queue-worker lease is permanently marked blocked, never reclaimed. The remote DELETE could still be in flight after the lease expires.
- Added SQL integration coverage for claim token issuance, successful finalization, stale-token rejection, RPC privileges, and batch bounds; added Node coverage for fail-closed invalid claims and admin route middleware. Migration and test are wired into atomic-payment CI.

## Operational boundary

The worker is deliberately operator-triggered. No scheduler or automatic cron is enabled. It processes only rows already in pending, which are released by migration 108 after tombstoned replay payloads are cleared and all database references are absent. It does not process awaiting_reference_retirement, processing, blocked, or completed rows.

A blocked item requires investigation; do not manually reset it to pending unless the Storage operation's outcome and the lifecycle row state have been independently reconciled. No production migration, Storage deletion, deployment, or merge was performed in this change.

## Verification

Repository files were read back after updates. Local Node/PostgreSQL execution was unavailable; the new tests are wired into CI but are not claimed as passing until the workflow actually runs.


# AUD-271 — read-only diagnostics for blocked image-retention queue (2026-11-09)

- Added migration 110 with bounded service-role-only RPC `list_blocked_pin_image_retention_queue(1..100)`. It reports blocked queue metadata, matching image lifecycle state/error/attempts, and a fresh DB reference check across live pins, active schedule snapshots, generation tasks/replay payloads, and regeneration storage/replay payloads.
- Added `inspectBlockedPinImageRetentionQueue` and admin-only, rate-limited `GET /admin/storage/retention-queue/blocked?limit=50`. It adds read-only Storage object visibility and returns explicit safe-action guidance.
- The diagnostic deliberately never retries Storage DELETE, changes queue state, or reopens a blocked path. Storage listing is only an observation and cannot prove that an earlier timed-out request has stopped.
- Added SQL integration coverage for diagnostics, source/error/attempt metadata, reference boolean, RPC privileges and bounds; added route registration coverage plus Node tests proving the inspection only lists Storage objects (never calls remove) and rejects invalid paths before Storage access. Migration/test wired into atomic-payment integration CI.
- Updated `docs/storage-lifecycle.md`.
- Local Node/PostgreSQL execution was not available. Tests are wired into CI but not claimed as passing. No production migration, Storage deletion, deployment, or merge was performed.


**AUD-271 CI recheck:** New HEAD `e09b3ae5abc2b5bd477fcab76579212d55e8bd6e` triggered all three PR workflows. All report `failure`, but GitHub exposes no job steps/log URLs (`steps=null`, `logs_url=null`); attempts to download job logs return `BlobNotFound`. The Vercel status is separately `failure` with `build-rate-limit`. Therefore no SQL or Node test result is confirmed. Do not treat these failures as evidence of a specific code defect, but do not claim green CI either.


**AUD-271 classification refinement:** blocked queue diagnostics now emit a bounded diagnosis and safe operator action for each observed combination of DB reference, Storage visibility, and lifecycle state. Distinguishes references with missing objects, quarantined paths, deleted lifecycle records whose object remains visible, potentially in-flight deletes, previous delete failures, active lifecycle rows, and missing lifecycle records. Added Node coverage for representative combinations. No branch ever reopens a blocked item or issues Storage DELETE.


**Дополнительная проверка AUD-271 (после записи изменений):**
- Повторное чтение выявило ошибочные буквальные символы `\\n` вместо переводов строк в экспорте lifecycle-модуля, двух строках workflow и двух тестовых местах. Исправлено; затронутые файлы повторно прочитаны, в них больше нет буквальных последовательностей `\\n`.
- Диагностика дополнена классификацией по состоянию жизненного цикла, наличию ссылки в БД и видимости объекта. Добавлены проверки комбинаций: объект с живой ссылкой, отсутствующий quarantined-объект и видимый объект при lifecycle=`deleted`.
- Последний HEAD: `7af1064c82f73696bf06eb7fabea2e6019df95b1`.
- Три последних workflow на этом HEAD снова завершились `failure`, но raw GitHub Jobs API показывает для всех `runner_id=0`, `steps=[]`, длительность около двух секунд. Runner вообще не был выделен; это не результат выполнения тестов и не доказательство ошибки приложения. Vercel отдельно сообщает `build-rate-limit`.


# AUD-272 — reliable, localized board creation (2026-11-09)

- Fixed the Boards Manager create flow: it now awaits the backend save, closes only on success, disables repeat submits/dismissal while pending, and retains the entered form values with an inline accessible error on failure.
- The App save callback now validates the projects response and project ID, verifies the returned board has a persisted ID, inserts using that server ID, and propagates failures back to the form rather than swallowing them in an alert.
- Added a 100-character title limit matching the API and dialog accessibility semantics.
- Localized form labels, placeholder, category options, saving label, and fallback error across all seven supported interface languages (en, ru, es, pt, de, fr, zh); updated the shared translation type.
- Added `docs/audits/AUD-272-board-creation-retry-feedback.md`.
- Read-back verification confirms all seven locale files and the translation schema contain each new key exactly once. Source checks confirm the async-save/error path and response validation.
- Local frontend lint/tests could not be executed in this environment. Latest PR CI has no allocated runners (`runner_id=0`, empty steps); do not treat its failure state as test execution or green CI. Vercel reports `build-rate-limit`.
- No deployment, production DB change, merge, or external service mutation was performed.

**AUD-272 source-code commit:** `8b112ff576b18846e83aa7e59b3778ebf88eacf2`. **Latest branch HEAD (documentation-only follow-up):** `04e00c78469f52e5131a75d4efe8ffd6e3e99885`.


# AUD-273 — resilient persisted-board loading (2026-11-09)

- Extracted `mapPersistedBoards` into `frontend/src/utils/persistedBoards.ts`; it accepts a valid empty list, handles project relation object/array forms, trims values, and rejects malformed payloads/rows rather than misrepresenting them as an empty account.
- Added `frontend/src/utils/persistedBoards.test.ts` covering mapping, relation variants, valid empty response, non-array response, and malformed rows.
- Added a localized loading state and accessible live status to Boards Manager, plus an in-product retry button on API load failure. Retry keeps the last successfully loaded boards visible until the refresh succeeds.
- Preserved account isolation: clear board state on user switch and ignore late responses from a prior account.
- Added loading/retry/error translation keys to all seven locales (en, ru, es, pt, de, fr, zh).
- Read-back checks confirmed helper use, test coverage presence, account reset/cancellation, retry behavior, and all new translation keys exactly once per locale.
- Local `npm test` and `npm run lint` were not run (no local checkout/Node runtime). CI jobs report failure but have `runner_id=0` and zero steps, so no tests ran; Vercel's separate status is `build-rate-limit`. Do not claim green CI.
- No deployment, production DB change, merge, or external service mutation.

**AUD-273 source-code HEAD:** `133ceb0ebf195741f561dd18eaad1416b70b4ef7`.

## 2026-11-09 — AUD-275 board patch semantics

- Fixed `PATCH /boards/:id`: a supplied empty/whitespace/null description now clears the description instead of being mistaken for an omitted field.
- Added `backend/boardPatch.js` and `backend/test/board-patch.test.js`; empty titles, invalid description types, and empty patches are rejected with 422.
- Existing ownership check and project-scoped update remain in place.
- Tests have not yet been executed; no production DB changes, deploy, or merge.

## 2026-11-09 — AUD-276 pin editing and race safety

- Extracted presence-aware pin patch validation into `backend/pinPatch.js`; users can clear descriptions without changing omitted fields.
- Added strict title/aspect-ratio/empty-patch validation and `backend/test/pin-patch.test.js`.
- Pin patch/status updates now return 404 when the pin is deleted between owner lookup and update; malformed status bodies return 422.
- Ownership checks and board-scoped writes remain intact. Tests not yet executed; no production DB changes, deployment, or merge.


## 2026-11-09 — AUD-277 strict board and pin patch fields

- Board and pin PATCH handlers now reject unknown request keys with HTTP 422, including when a valid field is also present. This prevents typoed fields from being silently ignored while another part of the edit succeeds.
- Added regression assertions for mixed valid + misspelled keys in `backend/test/board-patch.test.js` and `backend/test/pin-patch.test.js`.
- Existing allow-listed updates, description clearing, title validation, and aspect-ratio validation are preserved.
- Added `docs/audits/AUD-277-strict-board-and-pin-patch-fields.md`.
- Source files and tests were written and read back; tests have not been executed in this environment. No deployment, production DB change, or merge.

## 2026-11-09 — AUD-278 board update delete race

- `PATCH /boards/:id` now uses `maybeSingle()` for the project-scoped update and returns HTTP 404 if the row disappears after the ownership lookup instead of surfacing a no-row PostgREST response as a generic server error.
- Existing ownership verification and project_id scope are preserved.
- Added `docs/audits/AUD-278-board-update-delete-race.md`.
- Route read-back confirmed the change; tests have not been run. No deployment, production DB change, or merge.


## 2026-11-09 — AUD-279 localized pin-description save feedback

- Replaced hard-coded Russian save status and retry text in the pin generator with locale keys.
- Added typed translations for saving, saved, save-error, and retry-save states across ru, en, es, pt, de, fr, and zh.
- Read-back verification confirms all seven locales contain the new keys and the UI consumes the typed translations.
- Lint, typecheck, and frontend tests have not been run; no production DB changes, deployment, or merge.


## 2026-11-09 — AUD-280 pin description label association

- Added a matching `htmlFor="pin-description"` / `id="pin-description"` relationship for the pin SEO description editor.
- This restores explicit accessible naming and label-click focus behavior without changing autosave logic.
- Component and audit report read-back verified. Automated lint, typecheck, and tests have not been run.

## 2026-11-09 — AUD-281 deterministic per-pin save queue

- Extracted the per-pin PATCH serialization into `frontend/src/utils/pendingPinSaveQueue.ts`; both regular pin edits and the board-switch/unmount description flush now share it.
- Saves for one pin remain FIFO, failures do not block later edits, and an older completion cannot clear a newer queued request.
- Added three regression tests for ordering, recovery after failure, and independence across pins.
- GitHub read-back verified the helper, tests, and both component call sites. Tests, typecheck, and build have not been run. No production DB changes, deployment, or merge.

## 2026-11-09 — AUD-282 freeze pin edits during scheduling

- Pin title, aspect-ratio, and description edits now reject interaction as soon as the synchronous scheduling lock is acquired; matching UI controls are disabled while the calendar save is running.
- Pin navigation tabs are disabled during scheduling to keep the visible editor aligned with the pin captured by the scheduling action.
- This closes a race where a new debounced/queued edit could be added after the handler captured the pending-save promise, allowing the calendar item to be created before that newer edit was persisted.
- The existing description flush, per-pin queue wait, and finally lock release remain in place.
- Added docs/audits/AUD-282-freeze-pin-edits-during-scheduling.md. Automated tests, lint, typecheck, and build have not been run. No production DB changes, deployment, or merge.

## 2026-11-09 — AUD-283 reconcile ambiguous schedule creation

- The frontend schedule handler now reconciles a rejected schedule POST against the authenticated user's persisted schedule list. This covers a committed insert whose HTTP response was lost, as well as a uniqueness conflict caused by an already-persisted request.
- Success is accepted only for exactly one row matching the same pin ID, exact scheduled instant, Pinterest board ID, and, when explicitly supplied, Pinterest account ID; if the backend selected the account, exact pin/time/board matching is still required. A failed/malformed/ambiguous read preserves and rethrows the original POST error.
- Reconciliation is read-only; it does not create schedules or weaken the backend one-active-schedule-per-pin uniqueness guard.
- Added docs/audits/AUD-283-reconcile-ambiguous-schedule-creation.md. Automated tests, lint, typecheck, and build have not been run. No production DB changes, deployment, or merge.


## 2026-11-09 — AUD-284 reconcile lost schedule retry and board-change responses

- Calendar retry and failed-schedule board-change handlers now recover from a lost HTTP response by reading the authenticated schedule list and accepting only one exact match for schedule ID, queued status, Pinterest board, and Pinterest account.
- Added `frontend/src/utils/scheduleMutationReconciliation.ts` and tests for exact match, mismatched identity/state, malformed/empty results, and ambiguous duplicates.
- The reconciliation is read-only and does not issue a second retry or board-change operation. Cancellation is not inferred from an absent row because `GET /schedule` deliberately filters cancelled schedules.
- Tests, typecheck, and build have not been executed in this environment. No production DB changes, deployment, or merge.


## 2026-11-09 — AUD-285 idempotent schedule cancellation

- Repeating cancellation for a schedule already cancelled by the same authenticated owner now returns the persisted cancelled schedule instead of HTTP 409. This recovers the common lost-response case without requiring the filtered `GET /schedule` endpoint to expose cancelled rows.
- Re-runs the existing reference-aware image cleanup on the already-cancelled path; it does not issue an unguarded Storage delete.
- Preserves the conditional scheduled-to-cancelled update as the linearization point. Publishing/published states remain non-cancellable, and owner scoping is unchanged.
- Added `docs/audits/AUD-285-idempotent-schedule-cancellation.md`. Automated tests, lint, typecheck, and build have not been executed. No production DB changes, deployment, or merge.


## 2026-11-09 — AUD-286 worker-claim-aware schedule mutation reconciliation

- Fixed the race where retry/change-board commits a schedule back to `scheduled`, but the worker claims it as `publishing` before the client's lost-response reconciliation read.
- Reconciliation accepts only an exact schedule ID + Pinterest board + Pinterest account match with status `scheduled` or `publishing`. All other/ambiguous states remain non-success.
- Calendar state preserves the persisted status using `parsePersistedScheduleStatus`, so a worker-owned row is not rendered as merely queued.
- Added regression test for the worker-claimed state. See `docs/audits/AUD-286-worker-claim-aware-schedule-reconciliation.md`.
- Automated tests, lint, typecheck, and build have not been executed in this environment. No production DB changes, deployment, or merge.


## 2026-11-09 — AUD-287 reconcile ambiguous schedule cancellation

- Calendar cancellation now recovers from a lost POST response by reading the authenticated `GET /schedule` list, which intentionally excludes cancelled rows.
- Absence is accepted only when the response is a valid array and every row has a non-empty string ID. If the target remains present, the response is malformed, or the read fails, the original cancellation error is preserved.
- The frontend removes the calendar item only after a successful POST or strict read-after-error confirmation. It does not send a second cancellation request.
- Added `isScheduleAbsentFromActiveList` and regression tests for confirmed absence, still-present schedules, and malformed/incomplete responses. The existing reconciliation test file's literal escaped newline sequences were normalized.
- Backend cancellation semantics, owner scoping, worker guards, and reference-aware Storage cleanup were not changed.
- GitHub read-back performed. Automated tests, lint, typecheck, and build have not been executed. No production DB changes, deployment, or merge.


## 2026-11-09 — AUD-288 strict schedule-list validation for cancellation recovery

- Tightened `isScheduleAbsentFromActiveList`: every row must now include non-empty schedule/pin IDs and status, a parseable scheduled timestamp, and explicit nullable Pinterest board/account identity fields.
- This prevents an incomplete or truncated list containing only unrelated IDs from being treated as proof that a cancellation committed.
- Extended regression cases for incomplete rows, invalid timestamps, and missing destination identity. The worker/cancellation database protocol is unchanged.
- GitHub read-back performed. Automated tests, lint, typecheck, and build have not been executed. No production DB changes, deployment, or merge.


# AUD-289 — safe calendar restoration after reload and API errors (2026-11-09)

- Added strict validation for persisted schedule responses: the top-level value must be an array and every row must include a non-empty schedule ID, pin ID, status, and parseable scheduled timestamp. A malformed row rejects the entire refresh instead of replacing the calendar with partial/empty data.
- Added explicit calendar loading state for the initial fetch and retries. The calendar now shows an accessible loading status; retry is disabled while a request is active.
- A failed refresh preserves the last successfully loaded schedule in memory and displays the existing retry/error notice. The queue no longer presents the ordinary “empty” state while data is loading or unavailable.
- Account-switch isolation remains: schedules are cleared immediately for the new user, and stale requests are ignored; loading is also reset safely when a request is cancelled.
- Added `frontend/src/utils/persistedSchedule.ts` and Node regression tests for empty lists, retained failure metadata, malformed top-level payloads, and invalid/incomplete rows.
- GitHub read-back and CI recheck are pending. Tests, typecheck, and build have not been executed locally. No production DB changes, deployment, merge, or worker changes were made.


# AUD-290 — explain safe-retry blockers for failed Pinterest publications

## Problem

The backend already computes safe retryability and a machine-readable reason for failed schedules. The API deliberately strips raw provider diagnostics and worker claim tokens, but the calendar only showed a generic “safe retry not confirmed” message. Users could not understand whether they needed to reconnect Pinterest, choose a board, inspect an existing publication, or wait for journal verification.

## Changes

- Added a frontend reason-to-message mapper for the backend's known retryability reason codes: account unavailable, missing board, unavailable Pin, existing publication, attempt identity mismatch, non-retryable/ambiguous attempt, active duplicate schedule, unavailable metadata, and changed status.
- Added complete RU/EN/ES/PT/DE/FR/ZH messages.
- The failed-publication details panel now shows the mapped explanation whenever retry is blocked, including schedules without an account ID.
- Unknown or missing reason codes use a safe generic explanation. Raw server/provider strings are never rendered.
- Added unit tests for known mappings, unknown secret-like input, missing reason, and unsupported locale fallback.

## Safety

- No retry eligibility was relaxed.
- No automatic retry was introduced.
- Unknown/ambiguous Pinterest outcomes remain blocked unless the existing server policy explicitly marks an attempt safe.
- Backend diagnostic redaction and worker fencing remain unchanged.

## Verification

- Changed frontend files and tests were read back from the PR branch.
- Tests, typecheck, and production build were not executed locally.
- No production migration, deployment, merge, or worker action was performed.


## 2026-11-09 — AUD-291 owner-scoped Pinterest retry metadata

- Tightened the failed-schedule metadata reads in `GET /schedule`: publication-attempt and confirmed-publication lookups now explicitly filter by the authenticated `user_id`, rather than relying only on pin IDs and implicit database row policies.
- Added a second owner-identity check when matching the returned attempt and publication rows to a failed schedule. This keeps retryability decisions tenant-scoped even if a query policy is accidentally broadened in a future change.
- Preserved the existing account, pin, and board identity checks; no retry eligibility was relaxed and no raw provider diagnostics or worker claim tokens are exposed.
- The change is limited to the read-only schedule metadata path; no schema migration is required.
- GitHub read-back confirmed the query filters and in-memory owner checks. On HEAD `6696dc11ec5500a80c544d87422b8b9dabb7d80f`, GitHub workflow-run lookup returned no runs; the only combined status is Vercel `failure` with `build-rate-limit`. Tests, lint, typecheck, and build have not been executed locally. No production DB changes, deployment, merge, or worker action was performed.
- AUD-291 code commit: `e5864fa4717b8720d79be331b10082caeee8832f`.


## 2026-11-09 — AUD-292 clear Pinterest schedule claim on confirmed publication

- Found a mismatch between the current SQL definition of `complete_pinterest_publish_v2` (migration 081) and the worker success-path assumption: the RPC marks the schedule `published` but does not clear its prior `claim_token`.
- Added forward-only migration `db/migrations/112_pinterest_publish_completion_clears_claim.sql`. It preserves account → all matching active/uncertain schedules in stable order → attempt lock ordering, exact owner/board/remote identity guards, and service-role-only execution. The schedule update now clears `claim_token` atomically with publication completion.
- Existing `backend/test/pinterest-publication-concurrency.sh` has a publishing fixture with a non-null UUID claim token and asserts that it is null after the completion/stale-recovery race; the script is wired into atomic-payment integration CI, after migration 112.
- During follow-up, detected that the draft filename's numeric prefix 100 collided with an existing migration 100. Renumbered the new migration to 112, added it after migration 111 in CI, updated the audit report, and removed the colliding draft file.
- Migration and test source were read back. The PostgreSQL integration script was not executed here. No production SQL was executed; migration 112 is not applied. No deploy or merge.


## 2026-11-09 — AUD-293 strict Pinterest publication-ledger identity

- Hardened `matchesConfirmedPublicationLedger`: confirmation now requires non-empty, trimmed, exact matches for all five identity fields (owner, local pin, Pinterest account, Pinterest board, remote Pinterest pin). Missing/blank values can no longer compare equal and falsely confirm a publication.
- Added regression tests for exact matching, null inputs, blank values on either side, and whitespace-only ledger values.
- Added `docs/audits/AUD-293-strict-pinterest-publication-ledger-identity.md`.
- Source and test files were read back after writing. Tests, lint, typecheck, and build have not been executed. No production DB changes, deployment, or merge.


## AUD-294 — fail-closed confirmation for manual Pinterest reconciliation (2026-11-09)

- Reviewed the existing admin-only manual reconciliation path for Pinterest schedules with `unknown` status. Operator identity comes from the verified request; the route and database RPC both enforce admin access.
- Fixed a response-integrity gap: the backend previously treated any truthy RPC response as proof that reconciliation was saved and returned status `published`.
- Success now requires a parseable persisted timestamp string from the RPC. The timestamp is normalized to ISO 8601; null, object, numeric, or malformed responses fail closed with HTTP 500.
- Added Node regression coverage for missing/malformed RPC confirmation. Existing valid timestamp path remains covered.
- No SQL behavior, automatic retry, Pinterest API, production DB, deployment, or merge changes.
- Files: `backend/adminPinterestReconciliation.js`, `backend/test/admin-pinterest-reconciliation.test.js`, `docs/audits/AUD-294-pinterest-reconciliation-response-integrity.md`.
- Status: FIX IMPLEMENTED / STATIC READ-BACK PENDING / TESTS NOT RUN. Local Node/SQL tests, lint, and build were not run; CI must not be treated as passing.


## AUD-295 — prevent stale Pinterest admin inventory responses (2026-11-09)

- Found a UI race in the admin Pinterest schedule inventory: a slow response for an old status filter could overwrite the latest filter's rows, and could also clear the latest request's loading/error state.
- Added request identity fencing in `frontend/src/components/admin/AdminPinterestSchedules.tsx`. Only the most recent request can update rows or request state; in-flight requests are invalidated on filter change/unmount.
- Manual unknown-publication reconciliation and its idempotency key behavior are unchanged. No API or SQL changes.
- Files: `frontend/src/components/admin/AdminPinterestSchedules.tsx`, `docs/audits/AUD-295-pinterest-admin-inventory-stale-response.md`.
- Status: FIX IMPLEMENTED / STATIC READ-BACK PENDING / TESTS NOT RUN. Frontend tests, lint, and build were not run locally; CI not confirmed. No production data, deployment, or merge.


## AUD-296 — repair idempotent board-creation migration (2026-11-09)

- Corrected malformed SQL in `db/migrations/111_idempotent_board_creation.sql`: closed and anchored the SHA-256 hex regex, balanced the CHECK/DO blocks, and removed the duplicated trailing fragment.
- Constraint accepts either both idempotency fields NULL (legacy clients) or a UUID plus a lowercase 64-character SHA-256 fingerprint.
- PostgreSQL execution/integration tests have not been run. Confirm migration 111 has not been applied before applying the corrected file; inspect an existing constraint first if it has.
- No production SQL, deployment, or merge.


## AUD-297 — omit internal board identity metadata from API responses (2026-11-09)

- Added shared `serializeBoardForClient` to sanitize board create (keyed and legacy), PATCH, list, and detail responses.
- API output no longer includes internal request UUID/fingerprint or nested project `user_id`; ownership checks retain full internal DB rows.
- Added `backend/boardSerialization.js` and `backend/test/board-serialization.test.js`.
- Tests/lint/build not run; no CI pass claimed. No production DB changes, deployment, or merge.


## AUD-298 — project API owner identity serialization (2026-11-09)

- Added a dedicated project response serializer that omits internal `user_id` while preserving public project fields.
- Applied it to project create, list, and detail endpoints. Ownership filters and internal DB rows are unchanged.
- Added `backend/projectSerialization.js` and `backend/test/project-serialization.test.js`.
- Tests, lint, typecheck, and build have not been run. No production DB changes, deployment, or merge.


## AUD-299 — single-flight default project provisioning (2026-11-09)

- Added per-user in-flight coordination for the initial project read/create path used by board creation.
- Concurrent board-create flows in one browser runtime share one provisioning operation; users remain isolated. Failed attempts release the lock and retries re-read persisted projects before creating.
- Added `frontend/src/utils/projectProvisioning.ts` and `.test.ts`; wired `App.tsx` to use it.
- This is runtime-level coordination, not a cross-tab/device database uniqueness guarantee.
- Tests, lint, and build have not been run. No production DB changes, deployment, or merge.


## AUD-300 — deterministic default-project selection (2026-11-09)

- Found that `GET /projects` returned rows without an explicit order, while board creation selects the first project. This could make a retry choose another project and bypass board idempotency scoped to `(project_id, create_request_id)`.
- Added `backend/projectProvisioningOrder.js`: projects are ordered oldest-first by `created_at`, then by ID for deterministic tie-breaking. Applied before serialization in `GET /projects`.
- Added `backend/test/project-provisioning-order.test.js` for ordering, tie-breaking, input immutability, and malformed results.
- No migration or production DB changes. Tests, lint, typecheck, and build have not been run; no CI pass claimed. No deployment or merge.


## AUD-301 — reset Pinterest generator state on user switch (2026-11-09)

- Found that Pinterest account connections were fetched only on generator mount. If auth identity changed while the generator remained mounted, the old user's account/board state could remain visible.
- Generator now observes `user.id`, clears account/board selections on identity changes, ignores stale requests, clears old Pinterest boards immediately when changing accounts, and validates returned account/board fields.
- Added `docs/audits/AUD-301-pinterest-generator-user-switch.md`.
- Tests, lint, typecheck, and build have not been run. No production DB changes, deployment, or merge.


## AUD-302 — ignore stale pin-description save completions after board switch (2026-11-09)

- Found that an in-flight description PATCH could finish after the user switched internal boards. Its captured revision could still match, allowing the old request to update the shared save-status indicator in the new board context.
- Added a synchronous ref for the currently selected board and `isCurrentPinDescriptionSave` guard. Save-start, success, and failure status updates now require both the latest edit revision and the same active board identity.
- The PATCH remains addressed by the original pin ID; the fix does not redirect writes, alter the API, or discard the persisted/local draft reconciliation behavior.
- Added unit coverage for current-board/current-revision success, previous-board completion rejection, and stale-revision rejection.
- GitHub source read-back verified. Tests, lint, typecheck, and build have not been run; no CI pass claimed. No production DB changes, deployment, or merge.


## AUD-303 — flush pin description debounce when switching cards (2026-11-09)

- Found a real data-loss race: the editor uses one debounce timer and one pending-save slot for all cards. Typing in pin A and switching to pin B before the 800 ms timer fired caused B's edit to cancel A's timer and overwrite the pending slot. A's latest text remained only as a local recovery draft and was not sent to the API during that interaction.
- The change now enqueues the previous pin's pending description before the shared debounce slot is reassigned to a different pin/board. The timer callback clears the pending slot only if it still owns that revision, preventing an old callback from clearing a newer card's pending save.
- Added `pendingPinDescriptionSwitch.ts` and regression tests for same-pin edits, switching pins on the same board, and switching boards.
- Tests, lint, typecheck, and build have not been run. No production DB changes, deployment, or merge.


## AUD-304 — title selection rollback
- Разделены последнее оптимистичное название и последнее подтверждённое сервером.
- При ошибке текущего выбора интерфейс откатывается к последнему успешно сохранённому названию, а не к предыдущему неподтверждённому выбору.
- Добавлены регрессионные сценарии в frontend/src/utils/pinTitleSelection.test.ts.
- Runtime-тесты/lint/build не запускались; GitHub Actions runner failures и Vercel build-rate-limit остаются открытыми.


## AUD-305 — queue rapid pin aspect-ratio changes safely (2026-11-09)

- Found that the aspect-ratio controls were disabled while a PATCH was pending, preventing users from correcting a choice until the network responded.
- More importantly, the existing rollback target was the previous optimistic ratio. If rapid changes were allowed and consecutive PATCHes failed, the UI could restore a ratio that the server had never confirmed.
- Ratio changes now use the existing per-pin FIFO save queue without blocking subsequent choices. A separate ref tracks the last server-confirmed ratio, and failed latest choices roll back to that value only when they are still the displayed selection.
- Saving state is retained while a newer queued ratio request remains pending.
- Added regression coverage for two consecutive failed optimistic choices returning to the original server-confirmed ratio.
- Tests, lint, typecheck, and build have not been run. No production DB changes, deployment, or merge.


## AUD-306 — clear calendar data on authenticated-user switch (2026-11-09)

- Found an account-isolation UI gap: the schedule loader cancelled stale responses, but it kept the previous user's already-rendered schedule rows while the next user's schedule request was pending.
- Added a synchronous user-identity ref and a layout-effect reset. On identity change, previously loaded schedule rows and the prior load error are cleared before the browser paints; ordinary schedule reloads for the same user retain existing rows while refreshing.
- This is a frontend visibility guard; API ownership filters remain authoritative.
- No database changes. Tests, lint, typecheck, and build have not been run. No deployment or merge.


## AUD-307 — isolate manual-review queue on authenticated-user switch (2026-11-09)

- Found that the shared `pendingReviewPins` queue in `MainApp` survived account changes, allowing one signed-in user to see the previous user's pending review cards.
- Added a layout-effect reset keyed to authenticated user identity so the queue is cleared before the next account is painted.
- Added an owner-identity guard to queue updates so callbacks from a child rendered for the previous account cannot repopulate the new user's queue after the switch.
- Removed writes to the legacy global `pinposy_pending_pins` localStorage key. The queue was not restored from that key, and a global key is unsafe for multi-account browser sessions.
- No backend, database, deployment, or merge changes. Tests, lint, typecheck, and build have not been run.


# AUD-308 — release checkout idempotency keys after terminal payment status

Date: 2026-11-10

## Finding

The frontend correctly retained subscription and credit-pack checkout idempotency keys after returning a Prodamus payment URL. This prevents a reload or retry from creating a second provider invoice while the original checkout is still pending.

However, the key was not released when the authenticated pricing view later observed that the corresponding pending order had moved to a terminal state. A later intentional purchase of the same plan or credit pack could therefore reuse the old key and receive the previous checkout result.

## Change

- Exported `releasePaymentIdempotencyKey(scope)` from `frontend/src/lib/billing.ts`; the existing safe pre-provider failure path uses the same helper.
- In `PricingView.tsx`, when a previously pending subscription or credit purchase transitions to a non-pending status, release only the matching scope:
  - `subscription:<plan>:<currency>`
  - `credits:<package_id>:rub`
- The reconciliation is transition-based: unrelated historical successful purchases do not clear a currently stored key.
- Successful transitions still trigger the existing authenticated-user refresh. Cancelled/denied terminal transitions release the checkout key without treating them as successful payments.

## Safety and verification

- No backend payment state machine, Prodamus request, webhook, database migration, or production configuration changed.
- Static GitHub read-back confirmed the helper export/import and transition-based release logic.
- Automated frontend tests, lint, typecheck, and build have not been executed in this environment. Existing GitHub Actions jobs are failing before exposing job steps/logs; Vercel reports `build-rate-limit`.
- No production payment, database mutation, deployment, or PR merge was performed.



# AUD-309 — fail-closed checkout key release on terminal payment states

Date: 2026-11-10

## Finding

AUD-308 released a subscription/credit checkout idempotency key after a previously pending order changed to any status other than `pending`. That was broader than the safe provider-confirmed terminal-state contract: an unexpected future status such as `unknown`, `processing`, or `created` could release the key while the original invoice outcome was still unresolved. The shared ID set also mixed subscription and credit-purchase records.

## Change

- Added `frontend/src/utils/paymentTerminalStatus.ts` with explicit allowlists:
  - subscriptions: `success`, `canceled`, `denied`, `expired`;
  - credit purchases: `success`, `canceled`, `denied`.
- Updated `PricingView.tsx` to release keys only when a row was previously pending and its status is in the relevant allowlist.
- Separated prior-pending subscription IDs from credit-purchase IDs so the two ledgers cannot cross-match.
- Added `paymentTerminalStatus.test.ts` covering allowed terminal states and fail-closed unknown/malformed states.

## Verification and safety

- GitHub read-back is required after the writes. Tests, lint, TypeScript check, and build have not been executed in this environment; do not treat the added tests as passing.
- No backend payment state machine, Prodamus webhook, SQL migration, production data, deployment, or PR merge was changed.


# AUD-310 — isolate billing history across account switches

Date: 2026-11-10

## Finding

The pricing view fetched subscription and credit-purchase history when the authenticated user changed, but retained the previous account's already-rendered history while the new request was pending. The old requests also had no owner guard, so a slow response for account A could complete after switching to account B and overwrite B's billing history.

## Change

- Added a layout-effect owner transition fence that clears subscription history, credit-purchase history, and tariff period end before the newly authenticated account is painted.
- Replaced unguarded history loaders with effect-scoped requests that ignore results after cleanup.
- Added a current-owner check before accepting either response, preventing a late response from a previous account from populating the new account's view.
- Applied the same owner fence to the pending-payment polling cycle, so an in-flight refresh cannot repopulate the new account's view after an identity change.
- Added `billingOwner.ts` and unit coverage for matching, changed, missing, and empty owner identities.

## Verification and safety

- GitHub read-back is required after the writes. Frontend tests, lint, and build have not been executed; no CI pass claimed.
- No API authorization rules or database records were changed. No production data, deployment, or PR merge.


# AUD-311 — scope generation recovery UI to the authenticated account

Date: 2026-11-10

## Finding

The PinGenerator recovery-status lookup read locally persisted generation idempotency keys and ran once per component mount, but its effect did not depend on the authenticated user ID. If the user switched accounts while the component remained mounted, recovery rows fetched for the previous account could remain visible or a late response could update the new account's UI. The recovery list contains board identifiers and completed pin counts, so it must be account-scoped even though the server endpoint enforces ownership.

## Change

- Added a layout-effect identity fence that clears recovery rows and the loading indicator before painting a newly authenticated account.
- Made the read-only recovery lookup depend on `userId`, so React cancels the previous account's in-flight effect on identity change.
- Captured the owner at request start and checked it again before committing results or loading-state changes.
- Avoids recovery lookups when there is no authenticated owner or token.
- Reused the existing `isCurrentBillingOwner` guard; its unit tests cover matching, switched, missing, and empty identities.

## Verification and safety

- GitHub read-back is required. Frontend test/lint/build execution is not available in this GitHub-only pass; no CI pass claimed.
- Recovery remains read-only: no generation request is started, no idempotency key is deleted, and no credits or provider tasks are changed.
- No production data, deployment, or PR merge.


# AUD-312 — cover provider polling exhaustion without duplicate submission

Date: 2026-11-10

## Audit findings

- The image provider task ID is journaled before polling; recovery uses `waitForImageTask(taskId)` rather than issuing another create call.
- Polling is deliberately bounded (maximum 30 checks). If the task is still queued/running, the helper returns a `pending` result with the same provider task ID. The generation route treats this as unresolved and does not settle credits or insert partial pins.
- A later same-key recovery loads the saved plan and polls the same provider task again. A provider timeout/network error is treated as uncertain, not as a confirmed failure.
- Storage rehosting first checks for an existing completed idempotent upload. If that lookup is unavailable, it fails closed rather than blindly uploading a duplicate.

## Change

- Added a focused `gptunnel-recovery.test.js` case for exhausting the bounded polling window while the provider task remains running.
- The test asserts the exact pending response, same task ID on every poll, and zero provider task creation calls.

## Verification and safety

- Static GitHub read-back only. Backend tests have not been executed in this pass; no test pass claimed.
- No provider requests, credit ledger operations, SQL migrations, production data, deployment, or PR merge.


# AUD-313 — journal provider tasks completed in the create response

Date: 2026-11-10

## Finding

The provider can return an image task already in `done` state directly from the task-creation POST. Previously `generateImage` returned the parsed result immediately, bypassing `onTaskUpdate`. A backend crash between receiving that response and recording the terminal provider outcome could therefore leave the durable task journal in `submitting` without the immutable provider task ID. Recovery would have to repeat the create call with the provider idempotency key.

## Change

- Parse and validate the synchronous completed result first.
- Before returning it, call the existing task-journal callback with the provider task ID and `succeeded` status.
- Preserve the normal polling path for queued/running tasks and the existing failure path.
- Added a regression test asserting the immediate task ID/status callback occurs, the same idempotency key is sent, and no unnecessary poll is issued.

## Verification and safety

- GitHub read-back only; backend tests, lint, and build have not been executed in this pass.
- No GPTunnel requests, credit operations, database migrations, production data, deployment, or PR merge.


# AUD-314 — concurrent generation and reservation isolation audit

Date: 2026-11-10

## Scope

Reviewed the generation HTTP route, provider-task journal, claim-fencing RPCs, credit reservation/resize/settlement migrations, and completion guard. No live provider or database operations were performed.

## Findings

- **Distinct simultaneous requests for one user:** reservation creation locks the user row before summing active reservations and inserting a new reservation. This serializes competing reservations and prevents both requests from reserving the same available balance.
- **Same idempotency key:** the parent request row is locked by `begin_pin_generation_request`; an active request returns `processing` rather than issuing a second claim. Replays with a different board or request fingerprint are rejected.
- **Stale worker fencing:** recovery rotates the request's UUID claim token. Plan writes, task transitions, quote/outcome writes, reservation resize, and completion validate the current token, so a prior worker cannot mutate the recovered request after the claim changes.
- **Settlement:** the completion RPC locks user -> request -> reservation, verifies the active reservation and amount ceiling, then saves pins and debits credits in the same transaction. The request completion trigger moves the reservation to `settled`; the already-completed replay returns saved pins without another debit.
- **Partial/uncertain provider outcomes:** the completion journal guard rejects completion while any task is non-terminal or a successful task lacks its durable provider outcome, price, or Storage URL; it also checks saved pins against successful task journal rows.
- **Polling lease:** the provider polling loop is bounded to 30 polls at 3 seconds, and queued/running task callbacks refresh the request timestamp. The 30-minute stale recovery threshold is therefore substantially longer than one normal polling pass.

## Result

No confirmed cross-request double-reservation, stale-claim write, or duplicate-settlement defect was found in the reviewed paths. No code change was justified by this audit; adding a code workaround without a reproducible defect would increase risk.

## Verification and safety

- Source and migration review plus GitHub read-back; no SQL migrations or tests were executed.
- No credits, provider tasks, production data, deployments, or PR merge.


# AUD-315 — long-outage recovery and provider-result retention audit

Date: 2026-11-10

## Scope

Reviewed `generatePins`, the persisted provider task plan, GPTunnel task polling, provider outcome journaling, `rehostImage`, and the managed Storage upload lifecycle. No live provider, Storage, or database calls were made.

## Findings

- **Provider result is journaled before Storage:** after GPTunnel returns a terminal result, `record_pin_generation_provider_outcome` stores the provider task ID, terminal status, authoritative price, and original result URL before the Storage rehost begins. A later Storage outage can therefore retry from the saved URL without a second provider task.
- **Storage upload retry is deterministic:** the object path is derived from a hash of the provider idempotency key. Before downloading/re-uploading, recovery checks the managed upload lifecycle for a completed object. If that lookup fails, it fails closed instead of blindly creating a second object.
- **Ambiguous Storage writes remain fenced:** transport/timeouts and server errors do not release the upload reservation because the remote write may have committed. The lifecycle uses explicit finalization and quarantine/recovery paths; a quarantined deterministic path is not reused.
- **Render restart:** the generation plan, provider task ID, result URL, price, and Storage URL are persisted in Supabase, not process memory. Recovery polls the recorded provider task or resumes rehosting the journaled URL.
- **Provider retention limitation:** the code can retry a provider task lookup and can retry a saved result URL, but it cannot guarantee GPTunnel retains task metadata/result URLs for an arbitrary outage duration. No verified provider retention SLA or expiry field is present in the repository. If GPTunnel has expired the task/result before the first durable provider outcome is written, safe recovery cannot recreate the image; the current flow blocks automatic resubmission for a terminal journal row without a recoverable URL rather than risk a duplicate charge.
- **No automatic charge duplication:** a recovered request uses its existing reservation and provider outcome; the completion RPC is the settlement boundary. If the provider result is unrecoverable, the request remains unresolved rather than silently submitting another paid task.

## Result and recommendation

No confirmed code defect was found in the reviewed recovery and Storage paths. The remaining uncertainty is external: GPTunnel's task/result retention window and availability guarantees. Before production launch, obtain the provider's retention policy and ensure the operational recovery window is shorter than that policy. For stronger resilience, consider an independent provider callback/webhook or immediate durable result transfer if supported by GPTunnel.

## Verification and safety

- Repository source review and GitHub read-back only; tests, lint, and build were not run.
- No provider calls, Storage writes, credits, SQL migrations, production data, deployments, or PR merge.


# AUD-316 — database durability, migration data-loss and restore-readiness audit

Date: 2026-11-10

## Scope

Reviewed the canonical baseline, migration ordering guidance, archived destructive migration preflight, core table privileges, database/launch documentation, and storage retention lifecycle. No database connection or production data was accessed.

## Findings

- **No verified independent backup/restore in this repository:** the infrastructure requirements explicitly list independent encrypted database and object-storage backups, retention, alerts, and restore drills as open requirements. The production-readiness audit likewise treats backup/restore rehearsal as a launch gate. Repository evidence does not establish that Supabase backups are enabled, exported independently, or restorable by the project owner. This is an operational evidence gap, not proof that the provider has no backups.
- **Migration 009 is a destructive historical hazard:** the archived migration converts TEXT user IDs to UUID and deletes malformed/orphaned rows (and publication rows without a matching pin). The read-only preflight report enumerates those candidate rows. The canonical database guide correctly excludes 009 and warns that a zero-count report is not a backup. Do not execute 009.
- **Migration workflow is manual and has no down migrations:** docs instruct applying one SQL file at a time, stopping on any error, and testing the complete chain on a disposable database before production. A rollback by dropping core tables would destroy user data; production rollback must be forward-fix or restore-based, not a casual reverse migration.
- **Baseline is for an empty database only:** `001_baseline.sql` uses create-if-not-exists and documents a specific historical schema contract. It must not be treated as a schema repair or run over an existing production database.
- **Core table client access is hardened:** migration 076 enables RLS and revokes direct grants from public/anon/authenticated for the ten core tables, granting backend service_role access. Production backend refuses to start without `SUPABASE_SERVICE_ROLE_KEY`. This protects the API boundary but makes service-role secret backup/rotation and access control especially important.
- **Object storage is not a substitute for a database backup:** lifecycle docs describe reference-aware retention and operator-triggered cleanup/reconciliation, not a complete independent backup of all Storage objects. They also document that automatic orphan sweep is not generally available and some ambiguous upload/deletion outcomes remain fenced for operator review.
- **Generation image recovery has a known time boundary:** the existing production-readiness audit records a 48-hour provider result URL lifetime from provider documentation and notes the absence of an unattended recovery/alert for succeeded tasks lacking a Storage URL. Immediate rehosting reduces exposure, but a Storage outage extending beyond that window can lose an image. The provider TTL should be re-confirmed before launch.
- **Restore has not been demonstrated:** no evidence in the reviewed repository shows a full restore of PostgreSQL plus Storage into a clean independent environment, integrity comparison, or measured RPO/RTO.

## Required controls before production

1. Enable/verify database backups and export encrypted copies to a separate provider/account under project-owner control.
2. Back up Storage objects independently, preserving object paths and metadata; verify every referenced pin/schedule image exists after restore.
3. Back up the Pinterest token encryption keys and all other required secrets separately from database dumps.
4. Maintain a migration ledger and test the complete ordered migration chain against a disposable PostgreSQL instance before any production rollout.
5. Perform a clean-room restore drill covering users, projects, boards, pins, credits, payments, generation journals, Pinterest state, and image objects. Compare row counts, foreign-key/orphan checks, image checksums or object availability, then record measured RPO/RTO.
6. Add an alert/recovery worker for successful provider tasks whose result is persisted but whose Storage URL is still missing; alert well before the documented provider URL expiry.

## Result

No safe code-only change can prove or create independent backups without access to the actual Supabase project and an external backup destination. No production or migration action was taken. The principal blocker is operational: backup configuration, independent copies, and a successful restore drill remain unverified.

## Verification and safety

- GitHub source/documentation review only; no SQL was executed and no production database or Storage was accessed.
- Tests, lint, build, backup jobs, and restore drills were not run.
- No migration, data deletion, deployment, provider call, or PR merge.


# AUD-317 — project, board, and pin ownership isolation audit

Date: 2026-11-10

## Scope

Reviewed project CRUD and analysis/generation routes, board create/list/read/update routes, pin read/update/status/image/regeneration paths, ownership helper/tests, core schema foreign keys, and the client-role privilege hardening migration. No live requests or database access were performed.

## Findings

- **Project endpoints scope reads and writes to the authenticated owner:** project list filters by `user_id`; single-project read, analysis, analysis update, and board generation all require both project ID and `req.userId`. Project creation assigns `user_id` from the verified session, never from the request body.
- **Board endpoints validate the parent project:** board creation first loads the project by ID plus authenticated owner. Board listing is scoped through the user's project IDs; legacy project-board listing checks project ownership before reading boards. Board read/update resolve the board's parent project and return 404 for another user's board.
- **Pin endpoints validate the full parent chain:** pin operations load the pin with its board and project's owner, then fail closed with 404 when the relationship is missing or belongs to another user. Updates additionally constrain the write by both pin ID and its previously checked board ID. Image replacement uses compare-and-swap to prevent stale uploads from overwriting a newer image.
- **Generation and recovery use authenticated identity:** generation and regeneration RPC calls pass the authenticated user ID; generation recovery queries are scoped to that user. Pinterest schedule/account queries similarly filter by user ID.
- **Database relationships protect hierarchy:** projects reference users; boards reference projects with cascade delete; pins reference boards with cascade delete. The service-role-only API boundary is deliberate because PinPosy uses its own JWT rather than Supabase Auth; migration 076 revokes direct client table privileges and grants backend service-role access.
- **Regression coverage exists but is not end-to-end authorization coverage:** the ownership helper tests same-user UUID normalization, cross-user rejection, and missing/invalid relationship fail-closed behavior. Patch validators are tested. The reviewed tests do not demonstrate a full HTTP-level two-user matrix for every project/board/pin route, so this remains a worthwhile additional regression suite.

## Result

No confirmed cross-user IDOR or ownership bypass was found in the reviewed project/board/pin routes. No code change was justified by the source evidence. The main remaining assurance gap is broader HTTP integration coverage proving that user A cannot read, mutate, upload to, regenerate, or recover resources owned by user B across every route.

## Recommended next hardening

Add an authenticated route-level integration matrix with two users and fixtures for two projects, boards, and pins. For each resource endpoint, assert owner success and foreign-owner 404, including mutation non-effects and image upload cleanup. Keep the service-role key server-only; do not grant client table access as a shortcut.

## Verification and safety

- GitHub source and test review only; tests, lint, and build were not run.
- No production data, provider calls, Storage writes, SQL migrations, deployment, or PR merge.


# AUD-318 — Prodamus payment and webhook security audit

Date: 2026-11-10

## Scope

Reviewed the shared webhook dispatch, Prodamus signature verification and amount parsing, subscription and credit checkout creation, payment-order identifiers, idempotency migrations 116–118, subscription activation migrations 011/019, credit fulfillment integration coverage, and webhook regression tests. Source-only review; no provider account or live callback was used.

## Findings

- **Webhook authenticity is checked before order lookup or mutation.** The handler requires the `Sign` / `x-sign` header and verifies HMAC-SHA256 using `PRODAMUS_SECRET_WEBHOOK` (falling back to `PRODAMUS_SECRET`). Comparison uses `timingSafeEqual` on fixed-length hashes. Outgoing checkout signing uses the separate shop secret.
- **Client input cannot choose the price or credited quantity.** Subscription plans/currency and credit package IDs are allowlisted; amounts and credits are computed from server-side catalogs. Credit purchases currently accept RUB only. The payment URL is validated by the provider helper.
- **Order IDs are not guessable sequence numbers.** `paymentOrderId.js` uses 96 bits from `crypto.randomBytes` in addition to a type/product prefix and timestamp. Subscription and credit prefixes are distinct (`pp-` vs `ppc-`), and the shared webhook dispatches credit orders to the credit handler.
- **Signed amount and currency are checked before fulfillment.** Foreign-currency orders require explicit currency and `currency_sum`; mismatched currency, missing/nonpositive amount, unsupported status, unknown order, or missing order ID is not fulfilled and is sent to the webhook-exception audit path. Amount mismatch is compared to the stored server-side amount with a 0.01 tolerance.
- **Credit fulfillment is transactionally idempotent.** `credit_paid_purchase` commits the balance increment, ledger row and purchase success marker together. Migration 118 only settles the matching checkout request when the exact local payment ID, user, order ID, kind and fulfilled state agree.
- **Subscription activation is transactionally serialized.** `activate_paid_subscription` locks the subscription and user rows, creates the paid period once, and migration 019 prevents a late older payment from replacing a newer plan label. Duplicate callbacks observe the existing activation.
- **Checkout creation is fenced against duplicate invoices.** Migration 116 records a per-user idempotency key and fingerprint; migration 117 stores a unique provider order ID before the remote call; ambiguous provider outcomes are fenced as unknown rather than blindly creating another invoice. Migration 118 prevents a checkout response from returning a URL after the webhook already settled the order.
- **Regression tests already cover important races:** concurrent duplicate subscription callbacks, concurrent credit callbacks, ambiguous commit retries, settlement retries, amount mismatch, cancel-after-success, late valid success, and signed nested payloads.

## Remaining assurance gaps

- Tests use locally generated HMAC signatures and mocked payment database/RPC behavior; this audit did not verify an actual Prodamus sandbox callback against the configured merchant account and provider's current signing/amount conventions.
- No tests were executed in this audit. Existing tests are source-reviewed only.
- Payment refunds/reversals after a successful fulfillment are not automatic entitlement/credit clawbacks in the reviewed webhook flow. Treat provider refund/chargeback handling as a separate operator-controlled reconciliation workflow; do not infer that a refund callback is already safely reversed by the normal paid webhook handler.
- The webhook endpoint currently returns 200 for unknown orders and several deliberately ignored/review-required callbacks after durable audit, which avoids pointless provider retries but makes the admin exception queue and reconciliation monitoring operationally important.

## Result

No confirmed path was found in the reviewed code for a forged unsigned callback, client-selected payment amount, duplicate credit grant, or duplicate subscription activation. No code change was justified from the source evidence. Actual Prodamus sandbox verification and refund/chargeback operational policy remain open checks.

## Verification and safety

- GitHub source and test review only; tests, lint, and build were not run.
- No Prodamus API calls, sandbox payments, real credits, database writes, SQL migration execution, deployment, or PR merge.


# AUD-319 — payment refund and administrator reconciliation boundary audit

Date: 2026-11-10

## Scope

Reviewed Prodamus status normalization and both subscription/credit webhook handlers, webhook regression coverage, administrator payment exception/pending-order endpoints, and the separate provider-refund reconciliation queue. Source-only review; no merchant account, sandbox, or production records were accessed.

## Findings

- **Prodamus refund/reversal statuses are not fulfillment states.** The normalizer allowlists only `success`, `order_canceled`, and `order_denied`; any other value (including a provider-specific refund/chargeback status) is recorded as unsupported for manual review and does not grant new entitlements.
- **The normal webhook path does not reverse a prior successful payment.** Subscription cancellation/denial callbacks cannot downgrade an already-successful subscription. Credit cancellation/denial callbacks cannot overwrite a credited purchase. This is correct for delayed/out-of-order cancellation notifications, but a genuine post-settlement refund requires a distinct verified workflow.
- **Administrator billing endpoints are read-only.** Pending orders and webhook exceptions are exposed only behind `requireAuth` + `requireAdmin`; no endpoint in the reviewed block marks an order failed, reverses a subscription, or removes credits. The pending-order endpoint explicitly warns that age alone is not proof of non-payment.
- **Do not confuse AI-provider refund reconciliation with customer payment refunds.** Existing provider-refund reconciliation fields and migrations 072–074 concern GPTunnel generation/regeneration cost and credit-reservation settlement, not Prodamus customer refunds.
- **No safe automatic clawback can be implemented from the currently verified contract.** The repository does not establish the exact Prodamus refund/chargeback callback fields, signature conventions, partial-refund semantics, or how subscription periods should be adjusted. Automatically revoking a whole plan or subtracting a full credit pack based only on an unverified status could harm legitimate users or create negative balances.
- **Operational gap:** an authenticated, auditable manual reconciliation procedure is still needed for full/partial refunds and chargebacks, with provider evidence, payment/order identity, operator, amount, currency, reason, and a separate idempotent entitlement/credit adjustment ledger.

## Result

No confirmed vulnerability in the existing success/cancel webhook handling was found. No automatic refund clawback or new callback status was added because provider semantics and the product's partial-refund policy are not established in repository evidence. Keep refund/chargeback cases in manual review until the exact merchant contract and policy are verified.

## Recommended next hardening

1. Confirm the merchant's actual Prodamus refund/chargeback notification contract and sandbox examples.
2. Decide policy for full versus partial credit-pack refunds and subscription refunds after partial service use.
3. Add a separate immutable refund-adjustment ledger and idempotent RPCs; never mutate the original payment/credit ledger rows in place.
4. Add operator approval, dual-control for high-value adjustments, and tests for duplicate/out-of-order refund events before enabling any automated callback.

## Verification and safety

- GitHub source and test review only; tests, lint, and build were not run.
- No Prodamus API calls, sandbox payments, credit changes, subscription changes, database writes, SQL migration execution, deployment, or PR merge.


# AUD-319 — credentials, token exposure, and administrative access audit

Date: 2026-11-10

## Scope

Reviewed Pinterest OAuth/token persistence and API serializers, browser-binding cookie flow, session JWT handling, password reset, login/register responses, schedule serialization, admin middleware and routes, Supabase service-role configuration, error logging, /me payloads, billing health, and repository ignore rules. Source-only review; no live credentials or production systems were accessed.

## Findings

- **Pinterest credentials are encrypted at rest:** access and refresh tokens use AES-256-GCM with a 32-byte deployment key, random 12-byte IV and authentication tag. Key parsing rejects malformed/noncanonical base64; a previous-key option supports rotation. Legacy plaintext rows are lazily migrated using an optimistic `updated_at` compare-and-swap. Production configuration requires the encryption key before Pinterest integration is considered configured.
- **Pinterest token fields are not part of public account serializers:** status/disconnect responses expose account IDs, Pinterest user ID, username, expiry and reauthorization state only. OAuth callback persists encrypted token values through a server-side RPC. OAuth state is signed, short-lived, purpose-bound, session-version-bound and attempt/generation-bound. Browser binding uses a random proof, stores only its hash in signed state and sets the raw proof in a Secure, HttpOnly, SameSite=Lax cookie for callback verification.
- **Session credentials are constrained:** application JWTs are signed with HS256, explicitly verified with HS256 allowlisted, expire after seven days, and carry a token version checked against the user row on authenticated requests. Password reset stores only SHA-256 token hashes, consumes tokens atomically, increments token version and invalidates old sessions. Passwords use bcrypt hashes; login uses a dummy hash for nonexistent accounts.
- **Schedule payloads remove private worker fields:** `sanitizeScheduleForClient` strips `last_error` and `claim_token`; the latter is a worker fencing capability. Generation recovery also uses an explicit allowlist serializer and omits prompts, provider task IDs, raw errors and tokens.
- **Admin endpoints are protected twice:** route middleware checks the authenticated user's `is_admin` flag from the database; sensitive reconciliation RPCs are documented to recheck/lock the operator identity. The operator ID is derived from the verified JWT, not request body fields.
- **Service-role handling is server-side:** production startup requires `SUPABASE_SERVICE_ROLE_KEY`; `.env` and `.env.*` are ignored, with only `.env.example` allowed. No credential value was found in the inspected source excerpts.
- **Public profile payload is explicit:** `/me` uses a broad DB select for schema compatibility but serializes only approved profile, entitlement and account fields; password hash, token version and other private columns are not returned. Billing health exposes configuration booleans and webhook URL, not signing keys.

## Remaining risks / follow-up

- The OAuth browser-binding secret is returned once to the authenticated SPA so it can be submitted in a top-level form POST; this is an intentional handoff, and the raw value is not placed in the Pinterest redirect URL or state. Keep the start endpoint same-origin/HTTPS and avoid analytics/session-replay capture of its response/body.
- Application error logging still logs full error objects in the common handler for 5xx responses. Reviewed paths generally pass database/provider errors, not plaintext Pinterest tokens; nevertheless, structured redaction and log-retention controls should be verified at the hosting provider. No confirmed credential leak was found in the reviewed source.
- The repository ignore rules prevent ordinary dotenv files from being added, but do not prove that a secret was never committed historically. A repository-wide secret scan and provider-side rotation review should be done before public launch; this audit did not inspect Git history or provider secret stores.
- Admin authorization relies on the integrity of the `users.is_admin` database field and service-role/RPC controls. Continue to restrict service-role credentials and admin account creation to trusted operators.
- This audit did not inspect every frontend telemetry/analytics dependency or external log sink for accidental capture of OAuth handoff payloads.

## Result

No confirmed plaintext Pinterest token in API responses, unauthenticated admin route, password-reset token disclosure, or service-role key exposure was identified in the reviewed source. No code change was justified by current evidence.

## Verification and safety

- GitHub source review only; tests, lint, build, secret-history scan and dependency audit were not run.
- No production credentials, provider calls, database reads/writes, SQL migrations, deployments or PR merge.


# AUD-320 — account authentication, password recovery, and session lifecycle audit

Date: 2026-11-10

## Scope

Reviewed backend registration/login handlers, JWT signing and verification, bearer parsing, password-reset issuance/consumption SQL, email-verification token handling, account middleware, password validation, and Express rate-limit configuration. Source-only review; no account credentials or production sessions were accessed.

## Findings

- **Password storage:** registration and reset use bcryptjs cost factor 10; login uses a dummy bcrypt hash when the email is absent to reduce account-enumeration timing differences. Password length is bounded to 8–128 characters. No evidence of plaintext password storage was found in the reviewed flows.
- **Login and registration throttling:** register, login, forgot-password and reset-password share a 10-request / 15-minute IP limiter. Email verification has a separate 30 / 15-minute limiter; resend has 5 / 15-minute. Password-reset and email-verification issuance also have per-account SQL cooldowns (5 minutes) with row-lock serialization.
- **Important deployment limitation:** Express rate limiters use the default in-memory store. Limits are therefore per backend process and reset on process restart; multiple Render instances do not share one global counter. This is acceptable as a first-layer throttle, not a durable distributed brute-force defense. trust proxy = 1 is configured for the hosting proxy topology; confirm that the production ingress really has exactly one trusted proxy hop before changing this setting.
- **JWT properties:** HS256 is pinned during verification; tokens expire after 7 days. Each protected request checks the account's current token_version against the JWT claim and fails closed on database errors. The production Supabase client requires the service-role key.
- **Password reset:** reset tokens use 32 random bytes, only SHA-256 hashes are stored, TTL is 60 minutes, and token consumption/password update/session-version increment occur atomically. Migration 023 increments token_version, invalidating all existing JWTs after a successful reset. Reuse and parallel consumption of one reset token are blocked by row locks and one-time used_at consumption.
- **Email verification:** verification tokens use 32 random bytes, hashed storage, 24-hour TTL, one-time atomic consumption, and per-account issuance cooldown. Registration does not issue a session before verification.
- **Session lifecycle gap:** no server-side logout/revoke-one-session endpoint or per-device session registry was found in the reviewed authentication routes. A client-side logout can discard its local token, but a copied JWT remains valid until expiry unless the account-wide password-reset version bump occurs. This is a product/security limitation for stolen-device response, not a bypass of current authentication checks.
- **No MFA or step-up authentication** was found in the reviewed login/admin flow. Admin routes rely on authenticated JWT plus the existing admin authorization check; this audit did not change that policy.

## Result

No confirmed authentication bypass, password-reset token replay, or password-reset session-revocation defect was found in the reviewed source. The main hardening gaps are distributed rate-limit storage and individual session revocation/device management. No code change was made because introducing session persistence/revocation requires a deliberate schema, frontend logout/device UX, and deployment-wide rate-limit store choice.

## Recommended next hardening

1. Add a shared rate-limit store (or edge/WAF protection) for login, registration, password reset, and verification before scaling backend instances.
2. Decide whether to support per-device sessions; if yes, introduce opaque session IDs with hashed server-side storage, rotation, expiry, revoke-current/revoke-all actions, and race/replay tests.
3. Consider MFA or step-up authentication for administrator accounts and sensitive financial operations.
4. Verify production proxy hop count and JWT secret rotation/backup procedure without exposing secret values.

## Verification and safety

- GitHub source and test review only; tests, lint, and build were not run.
- No login attempts, password resets, email sends, token issuance, account changes, database writes, SQL migration execution, deployment, or PR merge.


# AUD-321 — Pinterest OAuth state, browser binding, token storage, and refresh audit

Date: 2026-11-10

## Scope

Reviewed the Pinterest OAuth start/callback routes, signed state claims, browser-binding cookie, OAuth attempt SQL fencing, account-token encryption/rotation, refresh-token lease/recovery, and relevant unit/integration test sources. Source-only review; no Pinterest credentials or live OAuth flow were used.

## Findings

- **OAuth CSRF/state:** state is a JWT signed with the backend JWT secret and expires after 15 minutes. Claims include the PinPosy user ID, current session token_version, purpose, attempt UUID, monotonic generation, and SHA-256 browser-binding hash. Callback validates the claims and rechecks the current user token_version.
- **Browser binding:** start creates a 32-byte random secret; only its hash is embedded in state. The raw secret is delivered to the initiating client and then set as a __Host-Http- cookie with Secure, HttpOnly, Path=/, and SameSite=Lax. Callback requires the matching cookie before exchanging the authorization code. The cookie is cleared after a successful proof match. This binds the callback to the browser that initiated the flow, including the cross-registrable-domain SPA/API deployment case documented in code.
- **Single-use and stale-attempt fencing:** begin_pinterest_oauth_attempt increments a per-user generation and replaces the active attempt. The v2 commit RPC checks user, attempt UUID, generation, token_version, and expiry, then consumes the attempt in the same transaction as saving the Pinterest account. Disconnect also increments generation and clears the attempt. A second callback or an older tab cannot commit the same attempt after it has been consumed/superseded.
- **Authorization-code replay:** the callback exchanges the provider code before the SQL commit. The provider authorization code is short-lived and single-use by provider contract; a repeated callback cannot persist twice because the attempt is consumed transactionally. If the process fails after code exchange but before commit, the user must reconnect; no attempt is made to replay the code.
- **Token confidentiality:** account access/refresh tokens are encrypted using AES-256-GCM with random 96-bit IVs and authentication tags. The active key must be exactly 32 bytes (canonical base64 or 64-char hex). Previous-key fallback supports rotation; lazy migration uses optimistic updated_at compare-and-swap and does not rewrite rows fenced as refresh-uncertain. Legacy plaintext rows are lazily encrypted when loaded while an encryption key is configured.
- **Refresh-token rotation:** a database lease serializes refresh across backend instances. The code marks refresh state uncertain before calling Pinterest, requires both rotated credentials in the response, commits via a fenced RPC, and does not replay the old refresh token after ambiguous network/5xx outcomes. Explicit 429 is handled separately. This is a deliberate fail-closed recovery policy.
- **Logging/API exposure:** reviewed OAuth logs record status, provider error text, user ID, and Pinterest username, not access/refresh token values or authorization codes. The account-token decode path returns plaintext tokens internally for API calls; no reviewed user-facing serializer was found to return those raw credential fields. Continue auditing all account serializers whenever new routes are added.
- **Hardening opportunity:** createState relies on jsonwebtoken default signing algorithm and readStateClaims does not explicitly pass an algorithms allowlist, unlike the dedicated session-token helper which pins HS256. This is not a demonstrated exploit because signature verification still requires the server secret, but pinning HS256 explicitly would make the OAuth state contract consistent and fail closed.
- **Test coverage:** browser-binding helpers have focused unit tests; OAuth expiry normalization has unit tests; SQL integration/concurrency fixtures cover OAuth attempt fencing and reconnect behavior. pinterest-oauth.test.js does not directly test state signing/claim validation, expiry, algorithm pinning, or callback route behavior.

## Result

No confirmed OAuth CSRF, cross-user callback binding, replay-to-double-connect, plaintext token-at-rest, or refresh-token replay defect was found in the reviewed code. No automatic provider or production action was performed. The concrete low-risk code hardening is to pin HS256 for OAuth state signing and verification and add direct tests for tampered, expired, wrong-purpose, malformed, and non-HS256 state tokens.

## Recommended next hardening

1. Pin HS256 explicitly for OAuth state signing and verification, with regression tests.
2. Add callback-level integration tests for missing/mismatched browser cookie, stale session token_version, duplicate callback, and superseded attempt.
3. Verify deployment has an independently backed-up PINTEREST_TOKEN_ENCRYPTION_KEY and preserve the previous key until lazy migration is complete; losing both keys makes stored credentials unrecoverable.
4. Audit every new Pinterest account serializer/route to ensure decrypted credentials never leave the backend.

## Verification and safety

- GitHub source/test/SQL fixture review only; tests, lint, and build were not run.
- No Pinterest OAuth requests, token refreshes, API publication, database writes, SQL migration execution, deployment, or PR merge.


# AUD-322 — Pinterest publishing, schedule races, retries, and recovery audit

Date: 2026-11-10

## Scope

Reviewed manual and scheduled publication routes, publication reservation/completion/failure RPCs, schedule creation/retry/cancel routes, worker claim/heartbeat/recovery, relevant SQL migrations and test fixtures. Source-only review; no Pinterest API calls or production database actions.

## Findings

- **Duplicate publication protection:** manual and scheduled paths reserve through database RPCs before POST /pins. Publication attempts are uniquely scoped by pin and Pinterest account; current reservation logic checks exact owner, account, board, and existing remote publication identity. Concurrent `processing` requests are rejected; `unknown` and unsafe `failed` outcomes are blocked rather than resent.
- **Ambiguous network outcomes:** HTTP 408/429/5xx and transport failures are treated as potentially successful remote side effects. They are journaled as unknown/non-retryable. Explicit provider rejection is retryable only when the database journal marks it safe. A missing/unreadable journal never authorizes a retry.
- **Remote success/local DB failure:** completion records remote Pinterest ID and board through an atomic completion RPC. If its response is ambiguous, the code checks the exact durable publication ledger; if not confirmed, it writes a dedicated unknown-outcome record preserving the known remote ID, then falls back to the unknown fence. It never blindly repeats POST /pins.
- **Schedule worker concurrency:** due schedules are claimed atomically using row locks with `SKIP LOCKED`, one row per HTTP worker invocation. Each claim has a UUID fencing token, is renewed by heartbeat, and is asserted immediately before the external POST. Stale workers cannot update a newer claim. Worker claim renewal errors do not falsely prove that a remote publish did not happen.
- **Cancellation race:** cancellation is a conditional `scheduled -> cancelled` update. If cancellation commits first, the worker cannot claim it; if the worker claims first, cancellation cannot overwrite `publishing`. A dedicated SQL integration fixture covers both orderings. A started remote publication is correctly reported as no longer cancellable.
- **Retries and recovery:** retries require a failed schedule plus exact attempt identity and an explicit `retry_safe=true` journal, active account, valid board, available pin/snapshot, and no active duplicate/publication. Retry delays are bounded and attempts are capped at five. Stale `publishing` schedules are reconciled as published only with exact matching successful attempt and publication ledger evidence; uncertain or mismatched outcomes remain fenced.
- **Immutable creative:** new schedules persist a snapshot of title, description, image, and resolved destination URL. Worker publication uses that snapshot even if the source pin is later edited. Cancellation removes the snapshot image only after checking that it is no longer referenced.
- **Credits and entitlement:** manual publication and schedule worker both enforce active paid-plan access. The publication flow does not debit generation credits; credits are charged by image generation, not by publishing. No mismatch between a publication charge and a credit ledger was identified in this path.
- **Operational dependency:** scheduled publication requires an external scheduler/cron to invoke the internal worker endpoint with `PINPOSY_SCHEDULER_SECRET` of at least 32 characters. The code validates the secret with a timing-safe comparison and applies a request limiter, but repository review cannot confirm that production cron is configured, frequent enough, monitored, or that the secret is rotated.
- **Residual limitation:** Pinterest does not provide an idempotency key for the POST /pins flow in the reviewed implementation. The database journal prevents automatic duplicate retries, but when a remote request outcome is genuinely unknowable, the schedule can remain `unknown` and require manual reconciliation. This favors duplicate prevention over automatic availability.

## Result

No confirmed duplicate-publish race, cancellation-overwrites-worker race, unsafe ambiguous retry, or publication-credit double charge was found in the reviewed paths. The repository contains targeted unit and SQL integration fixtures for the critical concurrency and recovery cases. No code change was warranted by this source review.

## Recommended next hardening

1. Verify and monitor the production cron invocation, timeout, cadence, and secret rotation; alert on growing due/unknown/stale schedule counts.
2. Add an operational reconciliation playbook for `unknown` schedules, including how to verify the remote Pinterest pin before any manual retry.
3. Ensure SQL integration fixtures are run against a disposable database in CI; this audit did not execute them.
4. Keep the current fail-closed policy for ambiguous POST outcomes; do not add automatic retries without provider-side idempotency or positive proof that no remote pin was created.

## Verification and safety

- GitHub source, migration, and test-fixture review only; tests, lint, and build were not run.
- No Pinterest API requests, publication attempts, credit debits, database writes, SQL migration execution, deployment, or PR merge.


# AUD-323 — Image storage, upload validation, public URLs, and SSRF audit

Date: 2026-11-10

## Scope

Reviewed the authenticated image-upload route, Multer limits, binary image validation, Supabase Storage bucket configuration, public URL/path handling, provider-result rehosting, DNS/IP validation, lifecycle upload/deletion claims, retention queue, and relevant tests/migrations. Source-only review; no Storage objects or production settings were accessed.

## Findings

- **Upload authorization:** `POST /pins/:id/image` requires a valid session and resolves the pin through an owner check before writing its image URL. The update is additionally constrained by pin ID, board ID, and compare-and-swap against the previously observed image URL; a losing concurrent upload is cleaned up only through the reference-aware deletion protocol.
- **Upload limits and content validation:** Multer uses memory storage with one file, 5 MiB, bounded fields/parts. MIME allowlist is PNG/JPEG/WebP/GIF; server-side validation checks actual file signatures and rejects SVG, arbitrary content, and declared-MIME mismatch. The bucket enforces the same MIME allowlist and 5 MiB ceiling.
- **Public bucket is intentional:** `pin-images` is configured as public because Pinterest needs a fetchable image URL. Consequently, anyone who obtains a valid object URL can read that image; this is not a private-file store. Random 128-bit object names are used for ordinary uploads; generated-image replay paths use a deterministic SHA-256-derived key. Public visibility should be treated as publication, not access control. No user-private documents or secrets should ever be stored in this bucket.
- **Provider URL SSRF controls:** rehosting accepts HTTPS only, rejects URL credentials and non-public/invalid destinations, resolves all A/AAAA addresses and rejects the request if any address is private/reserved, then pins the validated DNS answers in the HTTP agent to prevent rebinding. Proxy use is disabled, redirects are disabled, the request has a 30-second timeout and 5 MiB response ceiling. The downloaded body is signature-validated again before upload. Existing tests cover private IPv4/IPv6 ranges, mapped IPv4, pinned lookup host/family mismatch, and embedded URL credentials.
- **No arbitrary redirect following:** a provider URL redirect does not cause a second request to a potentially untrusted destination; it fails closed. The provider must return a final HTTPS image URL.
- **Object path ownership:** deletion accepts only URLs matching the configured Supabase origin, project path, public bucket prefix, and the managed `pins/` filename grammar. Foreign/legacy URLs are not deleted by guessing. URL parsing and decode errors return no managed path.
- **Upload/delete race safety:** every managed upload reserves a path in the lifecycle table; finalization is token-fenced. Ambiguous Storage timeouts remain fenced. Reference triggers serialize pins, schedules, and generation journals against deletion. Deletion requires a database claim after rechecking all durable references; stale/ambiguous paths are quarantined rather than reused. Confirmed deleted paths are permanent tombstones.
- **Retention/replay:** replay expiry first preserves idempotency tombstones, retires replay URL references transactionally, and only then releases paths to a queue; actual Storage deletion passes through the same reference-aware claim. Administrative storage maintenance routes require authentication and admin authorization.
- **Residual hardening opportunities:** signature checks establish file format but do not decode/re-encode images or cap pixel dimensions/frame counts. A small compressed image can therefore still be computationally expensive for downstream decoders; consider a bounded image-processing pipeline if uploads become an abuse vector. The public bucket's access semantics are expected, but production bucket configuration and Storage policies were not queried directly in this source-only audit. Add an explicit operational check that anonymous reads are allowed while anonymous writes/listing/deletes remain unavailable.
- **Test gap:** current tests cover MIME allowlisting, binary signatures, 5 MiB boundary, public URL/IP classification, and pinned DNS lookup. No end-to-end HTTP test was run here for cross-user upload authorization, Storage policy behavior, redirect rejection, actual download byte limits, or public URL access.

## Result

No confirmed cross-user image upload bypass, SVG upload/XSS path, SSRF redirect/DNS-rebinding bypass, unsafe managed-object deletion, or automatic deletion of referenced images was found in the reviewed code. The bucket's public-read behavior is a deliberate Pinterest compatibility requirement and must not be described as private storage. No code change was warranted by this source review.

## Recommended next hardening

1. Verify production Storage bucket/policies independently: public GET works; anonymous upload, overwrite, listing, and delete do not.
2. Consider decoding and re-encoding uploaded images with strict pixel/frame/resource limits before making them public.
3. Add HTTP integration tests for owner isolation, redirect rejection, oversized provider responses, and the actual anonymous-read/write boundary.
4. Keep user documents and other non-public assets in a separate private bucket with signed URLs; never reuse `pin-images` for them.

## Verification and safety

- GitHub source, test, and SQL migration review only; tests, lint, and build were not run.
- No Supabase API calls, Storage reads/writes/deletes, bucket-policy changes, SQL migration execution, deployment, or PR merge.


# AUD-324 — Backend HTTP perimeter, CORS, proxy trust, rate limits, and error handling

Date: 2026-11-10

## Scope

Reviewed Express middleware ordering, CORS, Helmet, request parsers, authentication/error handling, rate-limit configuration and tests, production Supabase client initialization, environment-file ignore rules, and the prior HTTP perimeter audit notes. Source-only review; no live ingress, response-header, load, or production test was performed.

## Confirmed controls

- Helmet is installed and applied before routes. It uses package defaults; no custom CSP or explicit app-level HSTS policy is configured in this file.
- CORS uses exact origin equality, with fixed PinPosy/Vercel/local-development origins plus comma-separated `FRONTEND_URL`. It does not enable credentialed CORS. Requests without an Origin are permitted for non-browser/server-to-server clients; CORS is not authentication.
- General JSON body size is capped at 100 KB. The Prodamus webhook has a separate 32 KB JSON/urlencoded parser and a bounded multipart parser that rejects file parts. The global error handler maps malformed JSON to 400 and oversized JSON to 413.
- Authentication is bearer-token based; the API does not enable cookie-based cross-origin credentials. Sensitive routes retain route-level authentication, admin checks, provider signatures, or the dedicated worker secret. No standalone cookie-authenticated state-changing route was identified in the reviewed middleware.
- Per-route limiters cover authentication, verification, resend mail, AI generation, payment creation, admin operations, image uploads, Pinterest reads/publications/scheduling/OAuth/worker. AI/image/Pinterest authenticated quotas key on verified user identity rather than client-controlled headers.
- The common error handler returns generic 5xx messages; the final handler returns JSON 404/400/413/403/500 responses. Internal errors are logged server-side and are not serialized into generic 5xx responses.
- Production Supabase initialization fails closed if `SUPABASE_SERVICE_ROLE_KEY` is absent. Root and backend `.gitignore` files exclude `.env` files.

## Findings / residual risks

### AUD-324-01 — Proxy trust depends on ingress topology

`app.set("trust proxy", 1)` trusts exactly one proxy hop. This is only safe for correct client-IP attribution if the deployed ingress has exactly one trusted hop and sanitizes/overwrites forwarded headers, and the backend origin cannot be reached in a way that bypasses that proxy. Several IP-based rate limits depend on `req.ip`. This repository cannot prove the live Render topology or direct-origin reachability. Do not change the hop count without confirming the actual network path.

### AUD-324-02 — Rate limits are process-local

The configured `express-rate-limit` instances use the default in-memory store. Limits reset on restart and are not shared between backend instances. Per-user keys prevent simple IP rotation from bypassing user quotas on one instance, but horizontally scaled instances multiply the effective budget. This is an availability/cost-control gap, not an authentication bypass. A shared store and a global ingress/concurrency limit are needed before multi-instance scaling.

### AUD-324-03 — Localhost origin is hard-coded in the production allow-list

`http://localhost:3000` is always included, including in production. This is not a direct API access bypass: CORS is enforced by browsers and the sensitive routes still require authentication/signatures. However, it is unnecessary production cross-origin permission if local development can use a separate configuration. Remove it only after confirming the development workflow does not rely on the deployed API from localhost.

### AUD-324-04 — Effective response headers and CSP are unverified

Helmet defaults are present, but there is no explicit app CSP or custom HSTS configuration in this source. The frontend is hosted separately, so its security headers must be audited at the Vercel edge as well. Verify deployed API/frontend headers and OAuth/Pinterest navigation behavior before adding a restrictive CSP; a speculative policy could break legitimate app flows.

### AUD-324-05 — Request-body limits do not bound total concurrent memory use

JSON and multipart sizes are bounded, and image upload is capped at 5 MiB. However, image uploads use in-memory buffering and the default rate-limit store does not provide a global concurrency/memory ceiling. Instance sizing and ingress concurrency limits should be checked as traffic grows.

## Corrections / reconciliation with earlier audit notes

The older AUD-113 note said Multer's `LIMIT_FILE_SIZE` might reach the generic handler as a 500. Current code routes Multer errors through `serializePinImageUploadError`, and `LIMIT_FILE_SIZE` maps to HTTP 413. Dedicated unit tests cover that mapping. The old concern is resolved in the current branch and should not be treated as an outstanding defect.

## Result

No confirmed CORS wildcard/credential misconfiguration, missing route-level authentication boundary, unbounded JSON parser, client-facing stack trace, or production service-role fallback was found in this source review. No code change was justified without live ingress topology and deployment-header evidence. Main operational priorities are to verify one-hop proxy trust, use a shared limiter before scaling, and confirm the effective API/frontend security headers.

## Verification and safety

- Reviewed source and existing unit tests; tests, lint, build, load tests, and live HTTP checks were not run.
- No production requests, deployment settings, secrets, DNS, SQL migrations, payment operations, or PR merge were performed.


# AUD-325 — Dependency supply chain, lockfiles, CI install behavior, and secret-scanning visibility

Date: 2026-11-10

## Scope

Reviewed backend/frontend manifests and lockfiles, Dependabot configuration, GitHub Actions workflows, package registry origins, lockfile integrity metadata, install-script flags, and selected current upstream advisories for packages with security-sensitive roles. No package installation or npm audit command was run. GitHub security-alert endpoints were not accessible through the connected repository interface, so repository-level Dependabot/secret-scanning/code-scanning alert state remains unverified.

## Confirmed controls

- Both projects use npm lockfileVersion 3. CI installs dependencies with `npm ci`, which enforces the lockfile rather than resolving fresh semver ranges. Every package entry inspected in both lockfiles had an integrity hash; all resolved tarballs used `https://registry.npmjs.org/`.
- Dependabot is configured weekly for `/backend`, `/frontend`, and GitHub Actions, with a limit of five open PRs per ecosystem.
- Workflows declare `permissions: contents: read`. Checkout and setup-node actions in the persisted-board and webhook workflows are pinned to full commit SHAs. The atomic-payment workflow pins checkout to a full SHA.
- CI uses Node.js 22 in the persisted-board and webhook workflows. `npm ci` is used before lint/test/build or backend tests.
- Backend direct lock versions include axios 1.20.0, express 4.22.3, multer 2.4.0, helmet 8.3.0, jsonwebtoken 9.0.3, and Supabase JS 2.116.0. Frontend direct versions include React/React DOM 19.3.0, Vite 8.3.2, TypeScript 7.0.2, and @google/genai 2.27.0.
- Backend lockfile has no packages marked with install scripts. Frontend lockfile marks `@google/genai`, `esbuild`, `fsevents`, and `protobufjs` with install scripts. Such metadata is not proof of malicious behavior; `esbuild`/`fsevents` commonly use platform setup, while each package's exact script and provenance should be verified before adding strict install-script blocking.
- The frontend manifest directly lists `express` despite the frontend being built with Vite. This may be a leftover/unneeded dependency; no removal was made without a complete import/runtime usage audit.

## Advisory spot-checks

- **Axios:** the lock pins 1.20.0. The September 2026 upstream advisories for axios features (including HTTP/2 session handling, redirect behavior in the fetch adapter, and proxy/DNS handling) list versions below 1.20.0 as affected and 1.20.0 as patched. Current reviewed calls use ordinary Axios calls; the image rehost path sets `proxy: false`, `maxRedirects: 0`, and a timeout. No explicit `httpVersion: 2` or fetch adapter selection was found in the reviewed call sites. This is a version-level spot-check, not a complete dependency-tree audit.
- **Multer:** the lock pins 2.4.0, the fixed version for CVE-2026-88932 (aborted upload orphaned disk writes). The PinPosy upload path uses memory storage rather than disk storage, which further differs from the vulnerable configuration.
- These checks do not establish that the complete dependency graph has zero advisories. Only a current `npm audit` / OSV or GitHub Dependabot report over the exact lockfiles can do that.

## Findings / residual risks

### AUD-325-01 — Repository security-alert state not verifiable from current connector

The connected GitHub interface did not expose Dependabot alert, secret-scanning alert, or code-scanning alert endpoints for this repository. The presence of a Dependabot update schedule does not prove Dependabot alerts or security updates are enabled. Check repository Settings → Security & analysis and the Security tab. Enable dependency graph, Dependabot alerts, Dependabot security updates, secret scanning, and push protection wherever available for this repository/plan.

### AUD-325-02 — Install-script allow-list not yet reviewed

The frontend lock contains four install-script-bearing packages. No suspicious registry origin was found, but lock metadata alone does not show the actual script body. Inspect the packed manifests for `@google/genai@2.27.0`, `esbuild@0.28.2`, `fsevents@2.3.3`, and `protobufjs@7.6.6` before enforcing `ignore-scripts` or an install allow-list. Avoid disabling scripts globally without verifying that native/platform setup still works.

### AUD-325-03 — No full dependency vulnerability scan was executed

No `npm audit --json`, OSV scan, SBOM generation, or package installation was performed. The selected axios/multer advisory spot-checks are favorable but are not a clean bill of health for transitive packages. Add a lockfile-based audit to CI with an explicit severity policy and a reviewed exception process; do not fail builds indiscriminately on untriaged low-severity dev-only advisories.

### AUD-325-04 — Workflow coverage and reproducibility gaps

The atomic-payment workflow does not set up a specific Node version, unlike the other workflows, so its npm/node behavior can drift with the runner image. Standardize on the same supported Node 22 setup-node action and lockfile cache. The existing workflows cover different test subsets; a full lockfile audit and consistent `npm ci`/test/lint/build gates should run on every relevant PR target. No workflow files were changed in this audit.

## Result

No non-npm registry source, missing lockfile integrity hash, backend dependency install hook, or confirmed affected axios/multer version was found in the inspected lockfiles. No conclusion is made that the entire dependency tree is vulnerability-free or that repository secret scanning is enabled. No dependency update was warranted solely from this bounded source review.

## Recommended next steps

1. Enable/verify GitHub dependency graph, Dependabot alerts/security updates, secret scanning, and push protection in repository settings.
2. Run `npm audit --json` against both exact lockfiles (or equivalent CI job) and triage runtime versus development findings.
3. Inspect the four frontend install-script package manifests and document an allow-list before enabling install-script restrictions.
4. Pin Node 22 consistently in all workflows and ensure the main CI workflow covers both frontend and backend validation for PRs.
5. Remove frontend `express` only after confirming no build/deployment script imports it.

## Verification and safety

- GitHub source and lockfile review plus upstream advisory spot-checks only; no `npm ci`, npm audit, lint, test, build, SBOM, or secret scan was run.
- No dependency version, lockfile, workflow, repository setting, secret, deployment, or production system was changed.


# AUD-326 — Authentication, registration, email verification, password recovery, and browser sessions

Date: 2026-11-10

- Added `docs/audits/AUD-326-authentication-registration-session-review.md`.
- Rechecked backend registration/login, JWT middleware, token-version revocation, password reset and email verification issuance/consumption, frontend session storage, and auth error handling.
- Positive controls: explicit HS256 and 7-day JWT; current token-version lookup per protected request; DB failures fail closed; one-time hashed reset/verification tokens with transactional consumption; reset increments token version; email links use URL fragments; verification requires an explicit click; login uses dummy bcrypt comparison; forgot-password and anonymous resend are generic.
- Carried-forward risks: registration returns 409 for an existing email (account enumeration); localStorage bearer token is exposed to same-origin JavaScript if XSS occurs; logout is local-only and no per-device revoke/change-password flow exists; auth rate limits are process-local and IP-only; no account-aware failed-login throttle.
- New low-severity robustness finding: malformed non-string `name`/`surname` can cause `.trim()` TypeError and generic 500 during registration instead of 422. No auth bypass demonstrated.
- No code change was made because signup enumeration response is a product UX decision and the remaining session hardening requires coordinated architectural work. Recommended next steps and test matrix are in the AUD-326 report.
- Verification: source review only; no browser tests, SQL, production access, or live requests. No secrets, accounts, passwords, database, or deployments changed.


## Дополнение к handoff — 2026-11-10 (AUD-329)

- Добавлен `docs/audits/AUD-329-gptunnel-generation-spend-controls-review.md`.
- Проверены GPTunnel adapter, multi-pin image generation, single-pin regeneration, provider quote/actual settlement, provider task journaling/recovery, related tests, и все прямые GPTunnel text call sites.
- Положительные контроли: image generation и regeneration используют durable idempotency identity, точные quote, reservation до provider submission, запись provider task ID до polling, same-task recovery без повторного create, actual-price settlement и атомарное завершение.
- Найдены два legacy text-cost пути: `POST /projects/:id/analyze` → `analyzeSite()` → legacy `generateText()`; `POST /projects/:id/boards/generate` → `generateBoards()` → legacy `generateText()`. Оба не сохраняют provider request ID/usage/RUB cost, не имеют durable operation journal или явного provider-spend budget. Первый маршрут не имеет tariff gate; второй имеет tariff gate, но не usage accounting. Оба используют общий process-local `aiLimiter`, который не является durable financial cap.
- Перенесённый риск из AUD-132/AUD-119: text-plan cost может быть `cost_missing`, при этом image work может продолжиться; текстовый provider request не имеет подтверждённого provider idempotency/request-history механизма.
- Не выявлен source-level duplicate image-task submission или image-credit double charge в рассмотренных основных image flows. Это не live/runtime гарантия.
- Тесты и SQL integration harnesses просмотрены как исходники, но не запускались. Нет live GPTunnel API, PostgreSQL, production config или deployment verification.
- Никакие исходники, миграции, provider credentials, пользовательские балансы, production services или deployments не менялись.
- Следующий логичный этап: AUD-330 — проверка всех AI/provider entry points на наличие стоимости, учёта, тарифных ограничений и durable spend budget; затем отдельная реализация usage journal для двух legacy text routes после определения product charging policy.


## Дополнение к handoff — 2026-11-10 (AUD-330)

- Добавлен `docs/audits/AUD-330-ai-provider-entrypoint-spend-control-inventory.md`.
- Проведена bounded source inventory прямых GPTunnel call sites в backend JS/TS: project website analysis, board idea generation, multi-pin generation (text planning + image tasks), single-pin regeneration.
- Матрица в отчёте фиксирует auth/ownership, tariff gate, AI limiter, durable operation identity и usage/cost journal для каждого entry point.
- Подтверждены повторные риски AUD-329: `POST /projects/:id/analyze` не имеет tariff gate, durable idempotency или provider usage/cost journal; `POST /projects/:id/boards/generate` имеет tariff gate, но не имеет durable idempotency или provider usage/cost journal. Оба используют process-local `aiLimiter`, который не является финансовым бюджетом.
- Multi-pin generation и single-pin regeneration имеют более сильные DB idempotency/task journals, reservation, quote/actual settlement; text plan usage сохраняется с явным missing-cost состоянием.
- Не обнаружено дополнительных прямых GPTunnel/OpenAI call sites в bounded scan JS/TS. Это не доказательство отсутствия indirect/provider-side integration.
- Рекомендованная последовательность: определить product charging policy для analysis/board ideas; внедрить usage-aware durable operation journal; добавить shared/durable per-user и global RUB spend ceilings; расширить cost reporting и тесты ambiguous retries.
- Только source review; тесты, lint, typecheck, build, SQL и HTTP integration не запускались. Live provider, production config и deployment не проверялись. Никаких исходников, миграций, балансов или production-систем не меняли.
- Следующий логичный этап: AUD-331 — спроектировать и реализовать безопасный durable usage journal и идемпотентность для legacy analysis/board-generation text routes, начиная с проверки схемы и существующих RPC/migration conventions.


## Дополнение к handoff — 2026-11-10 (AUD-331)

- Добавлен проектный дизайн `docs/audits/AUD-331-durable-text-operation-accounting-design.md`.
- Перед проектированием проверены миграции 069/079 и текущие реализации `generateTextWithUsage`, `analyzeSite`, `generateBoards`, а также оба legacy HTTP маршрута.
- Важное решение: не создавать дублирующий provider cost ledger. Использовать существующую `pin_generation_text_usage` как normalized usage fact store, расширив её operation scope; добавить отдельный `gptunnel_text_operations` journal для claim/idempotency/state/result. Существующий usage RPC сейчас связан с `pin_generation_requests`, поэтому напрямую переиспользовать его для analysis/board ideas нельзя.
- Предложены состояния `claimed/submitting/succeeded/unknown/failed`, claim fencing, fingerprint mismatch rejection, safe replay результатов и fail-closed при неоднозначном outbound text provider call. GPTunnel text idempotency/request-history support не подтверждён; поэтому после ambiguous timeout автоматический повтор запрещён.
- Для board ideas требуется атомарная транзакция завершения операции и вставки досок; для analysis — атомарное обновление проекта и завершение операции. Ownership проверять внутри RPC.
- Существующая тарификация не меняется: analysis остаётся с текущей доступностью, board ideas сохраняет текущий tariff gate; никаких credit debit/reservation/refund не добавляется.
- Документ — design only. Исходники и SQL не менялись, миграции не применялись, provider calls не выполнялись, tests/build не запускались.
- Следующий шаг: AUD-332 — проверить frontend clients и compatibility для обязательного Idempotency-Key; затем реализовать additive DB migration + backend coordinator + route refactor + tests.


## Дополнение к handoff — 2026-11-10 (AUD-332)

- Добавлен документ `docs/audits/AUD-332-frontend-legacy-text-routes-compatibility.md`.
- Проведён targeted frontend review: `frontend/src/lib/api.ts`, `App.tsx`, `BoardsManager.tsx`, `DashboardView.tsx`, `OnboardingWizard.tsx`, `PinGenerator.tsx`, `persistedBoards.ts`.
- В проверенных frontend-путях не найден вызов `POST /projects/:id/analyze` или `POST /projects/:id/boards/generate`. Онбординг сохраняет `websiteUrl` через `PATCH /me/onboarding`, но не запускает анализ автоматически.
- Ручное создание доски использует отдельный `POST /boards` и уже передаёт `create_request_id`; не путать этот механизм с AI-генерацией идей досок.
- `apiRequest` позволяет передавать дополнительные заголовки через `options.headers`; технически будущая передача `Idempotency-Key` не требует изменения helper.
- Решение: пока не добавлять обязательный header и не менять UI/поведение. Нужна продуктовая развилка: оставить endpoint внутренним, сделать полноценной UI-функцией или удалить после проверки внешних callers/jobs. Не считать отсутствие вызова в проверенных файлах доказательством отсутствия всех внешних интеграций.
- Source code/SQL не менялись; migrations не запускались; provider calls, production writes, deployment и tests/build не выполнялись.
- Следующий этап AUD-333: проверить весь backend на регистрацию/вызов legacy routes, их потребителей и контракт; затем принять безопасное решение по endpoints и implementation scope.



## Дополнение к handoff — 2026-11-10 (AUD-333)

- Добавлен `docs/audits/AUD-333-backend-legacy-text-endpoint-consumer-review.md`.
- Подтверждены два Express endpoint в `backend/index.js`: `POST /projects/:id/analyze` и `POST /projects/:id/boards/generate`. Они вызывают `analyzeSite()` / `generateBoards()`, оба helper используют legacy `generateText()`, который отбрасывает usage/cost/request ID.
- По проверенному backend-коду не обнаружен отдельный worker/queue entry point для этих helper. Это не доказывает отсутствие внешних API consumers: production access logs и список внешних интеграций недоступны.
- Analysis: auth + aiLimiter + owner-scoped project read/write + SSRF-hardened website fetch; без tariff gate. Выход модели не валидируется по типам/длине; JSON parse fallback сохраняет raw provider text в summary.
- Board ideas: auth + aiLimiter + tariff gate + owner-scoped project read; выход только JSON.parse, без проверки array length/item schema/string bounds перед insert. Нет durable idempotency.
- Website text является недоверенным prompt input; SSRF protections не являются защитой от prompt injection. Это hardening observation, не доказанный exploit.
- Решение: не удалять endpoints и не вводить breaking Idempotency-Key до проверки external consumers и продуктового решения. Низкорисковый следующий шаг — strict bounded output validation при сохранении текущих response contracts; затем решить, сохранять ли endpoints и нужен ли durable provider journal.
- Source/SQL не менялись; миграции и production writes не выполнялись; provider calls/deploy/tests/build не запускались.
- Следующий этап AUD-334: реализовать изолированные unit-тестируемые validators для analysis и board ideas, затем безопасно подключить их в helpers/routes, сохраняя совместимость ответов.



## Дополнение к handoff — 2026-11-10 (AUD-334)

- Добавлен `backend/textOutputValidation.js`: analysis niche 1–80 символов, summary 1–1200; board ideas — массив 1–5 элементов, title 1–40, description 1–500. Строки trim; лишние поля модели отбрасываются; некорректный результат приводит к HTTP 502.
- Подключено в `backend/analyze.js` и `backend/boards.js`. Удалён опасный fallback, который сохранял raw provider text в summary при невалидном JSON. Схемы успешных ответов и маршруты сохранены.
- Промпты дополнены указанием считать содержимое сайта/проекта недоверенными данными. Это только дополнительная подсказка модели, не security boundary.
- Добавлен `backend/test/text-output-validation.test.js` с тестами валидных данных, trimming, отсутствующих/неверных/пустых полей, превышения лимитов, malformed entries и границ количества досок.
- Код и тесты перечитаны из GitHub после записи. Тесты, lint, typecheck, build и HTTP integration не запускались — прохождение не подтверждено.
- Не выполнялись GPTunnel calls, production DB writes, миграции, платежи или deploy.
- Следующий этап AUD-335: проверить реальные типы/ограничения колонок БД и обработку HTTP ошибок для новых 502, добавить helper-level parse/error tests; затем добиться реального запуска backend test suite до merge.



## Дополнение к handoff — 2026-11-10 (AUD-335)

- Проверен `db/migrations/001_baseline.sql`: `projects.niche/site_summary` и `boards.title/description` имеют тип PostgreSQL `text`; новые application limits (80/1200, 40/500) совместимы с baseline и строже типа БД. Live Supabase не опрашивался, drift/ручные изменения не исключены.
- Проверен `handleError()`: берёт `e.httpStatus`, HTTP 502 клиенту отдаёт generic 5xx message, подробность остаётся в server log. Новые validation errors соответствуют этой политике.
- Парсинг вынесен в `parseAnalysisResponse()` и `parseBoardIdeasResponse()` в `backend/textOutputValidation.js`; helpers используют единые parser функции. Добавлены тесты валидного JSON, текста вокруг JSON, malformed/empty responses и HTTP 502 классификации.
- Удалён неиспользуемый import в `backend/boards.js`.
- Все изменённые файлы перечитаны из GitHub. Тесты/lint/typecheck/build/integration не запускались; успех не заявляется.
- Не было live Supabase queries/writes, GPTunnel calls, миграций, платежей или deploy.
- Следующий этап AUD-336: проверить test runner/CI и безопасно запустить focused + backend suite; исправить только подтверждённые сбои. Не merge/deploy до тестовых результатов и устранения/объяснения Vercel build quota issue.



## Дополнение к handoff — 2026-11-10 (AUD-336)

- Проверен backend test runner: `backend/package.json` использует `node --test`; новый `test/text-output-validation.test.js` попадает в общую backend suite.
- Проверен `.github/workflows/persisted-boards-checks.yml`: backend job уже делает `npm ci`, syntax check, `npm test` и root E2E `../test/e2e-email-verify.js` (файл существует). PR #4 base входит в pull_request target branches.
- CI workflow расширен: syntax checks для `analyze.js`, `boards.js`, `textOutputValidation.js` и отдельный запуск `node --test test/text-output-validation.test.js` перед полным backend suite.
- Workflow и source read-back проверены. Доступного workflow-dispatch action нет; новый GitHub Actions run пока не получен, поэтому тесты не считаются пройденными.
- Не запускались local Node/npm, DB, GPTunnel, миграции, платежи или deploy. Vercel build-rate-limit отдельно от backend GitHub Actions.
- PR #4 остаётся Draft и unmerged. Следующий шаг — получить GitHub Actions run от PR update/maintainer, изучить focused + full backend + E2E результаты и исправить только реальные ошибки.



## Дополнение к handoff — 2026-11-10 (AUD-337)

- Проверены AI routes/helpers: website analysis -> legacy `generateText()`; board ideas -> legacy `generateText()`; pin plan -> `generateTextWithUsage()`. Основные image routes: `POST /boards/:id/pins/generate` и `POST /pins/:id/regenerate`.
- Image generation paths имеют durable idempotency, credit reservation, quote/task journals, task recovery, actual-price settlement и atomic completion/debit. Pin-plan usage сохраняется через `record_pin_generation_text_usage` до parsing.
- Finding: `backend/pins.js` валидирует только JSON array/non-empty; далее truthy filter, String coercion и truncation title 200 / description 2000 / image_prompt 12000. Нет строгой проверки типов, whitespace-only и точного количества после filter. Это schema-hardening gap, не доказанный exploit.
- Finding: pin plan вызывает `generateTextWithUsage(..., { requireUsage:false })`; если total_cost отсутствует, callback передаёт `p_total_cost_rub:null`, но image quoting/submission может продолжиться. Unknown cost не приравнивается к нулю, однако strict spend policy не fail-closed. Риск согласуется с AUD-329/330.
- Legacy analysis/board suggestions остаются без durable usage journal, поскольку legacy `generateText()` возвращает только content. См. AUD-331–333.
- Добавлен `docs/audits/AUD-337-ai-generation-callsite-spend-review.md`; source изменений нет.
- Тесты/lint/typecheck/build/HTTP не запускались. Нет GPTunnel calls, Supabase reads/writes, migrations, payments или deploy.
- Следующий этап AUD-338: bounded parser/validator для pin-plan JSON с сохранением JSON-with-prose compatibility и partial-task semantics; отдельно зафиксировать policy, должен ли missing text cost блокировать image generation или оставаться явным reconciliation state.



## Дополнение к handoff — 2026-11-10 (AUD-338)

- В `backend/textOutputValidation.js` добавлены `validatePinIdeas()` и `parsePinIdeasResponse()`: count 1–10, title до 200 символов, description optional до 2000, image_prompt до 12000; проверяются типы, пустые обязательные поля и malformed items; строки trim; лишние поля отбрасываются.
- Поддерживается JSON-массив с окружающим текстом провайдера. Элементы сверх запрошенного count игнорируются как раньше; валидный ответ с меньшим числом идей остаётся частичным планом. Никакие идеи не дополняются автоматически.
- `backend/pins.js` теперь валидирует текстовый план до quote validation и image submission; удалены молчаливый filter и String coercion malformed idea fields.
- В `backend/test/text-output-validation.test.js` добавлены проверки нормализации, optional description, неправильных типов/длин, count, prose-wrapped JSON, malformed entries.
- В `backend/test/pins-provider-boundary.test.js` добавлены проверки, что malformed plan не доходит до quote/image provider boundary, а валидный partial plan сохраняется.
- AUD-337 missing-cost policy не менялась: `requireUsage:false`, unknown/non-RUB total cost сохраняется как null, image flow может продолжиться. Выбор fail-closed vs explicit reconciliation вынесен в AUD-339, поскольку это продуктово-операционное решение.
- Добавлен `docs/audits/AUD-338-bounded-pin-plan-validation.md`.
- Тесты не запускались из GitHub-only workflow; CI execution не подтверждён. Не заявлять pass. Нет GPTunnel, Supabase, migrations, payments, deploy.
- Следующий этап AUD-339: end-to-end review missing text-cost behavior, подготовить решение с последствиями; отдельно дождаться фактического CI workflow result.



## Дополнение к handoff — 2026-11-10 (AUD-339)

- Проверен end-to-end missing GPTunnel text cost. Adapter по умолчанию strict, но pin plan передаёт `requireUsage:false`; callback записывает usage через migration 069 до parsing/quote/image submit.
- Migration 069 сохраняет `usage_status='cost_missing'` и `total_cost_rub=NULL`; migration 079 выводит `accounting_status='cost_missing'`, null не становится нулём.
- Если запись usage journal не удалась, image flow прерывается. Если journal успешно записал cost_missing, текущая реализация продолжает image quotes/submissions.
- Важный recovery detail: после provider submission catch ставит request `unknown`, и migration 054 удерживает credit reservation до reconciliation. Если policy fail-closed после известного text response, надо явно сбросить providerGenerationStarted до ошибки, иначе будет ложный unknown и удержание резерва. При корректном known failure reservation trigger освобождает его.
- AUD-339 сравнивает Option A fail-closed до image quote/submission и Option B текущий availability+reconciliation. Рекомендация: A при приоритете строгого контроля расходов; оставить cost_missing row для сверки, не трактовать null как 0.
- Behavior не менялся: policy требует решения пользователя. См. `docs/audits/AUD-339-gptunnel-missing-text-cost-policy.md`.
- Тесты/lint/typecheck/build/live DB checks не запускались. Нет GPTunnel calls, Supabase actions, payments или deploy.
- После решения — добавить тесты: cost_missing row persisted, quote callback not called, image submit not called, request failed (not unknown), reservation released; затем проверить реальный CI run.



## Дополнение к handoff — 2026-11-10 (AUD-340)

- Исправлена нормализация чисел usage в `backend/gptunnel.js`: пустые/пробельные строки, boolean, object и нечисловые значения больше не превращаются через `Number(...)` в ложный ноль; валидные числа и непустые числовые строки поддержаны.
- `usage.total_cost` использует тот же строгий парсер. Добавлены regression cases для malformed metadata, numeric-string и реального числового нуля.
- AUD-340: source change committed and read-back verified; Node tests/lint/build/CI не запускались. Политика AUD-339 (fail-closed vs continue-and-reconcile) остаётся отдельным product decision. Production не менялся.

## Дополнение к handoff — 2026-11-10 (AUD-340)

- Уточнён CI-аудит: SQL/.sh интеграционные проверки НЕ пропущены. Первый вывод по одному только npm test был неполным.
- .github/workflows/atomic-payment-integration.yml поднимает PostgreSQL 16, создаёт тестовую fixture-схему, применяет migrations 010–120 и напрямую запускает SQL/.sh проверки. Включая pin-generation-text-usage.integration.sql, credit reservation/provider quote/completion tests и concurrency scripts.
- Workflow запускается на PR в main или fix/atomic-payment-fulfillment; base PR #4 совпадает с фильтром. persisted-boards-checks.yml дополняет его JS/frontend проверками.
- Ограничение: Postgres workflow использует подготовленную fixture-схему и не прогоняет migrations 000–009 с пустой БД; это не полный clean-install bootstrap test.
- На проверенном head PR #4 GitHub workflow-run lookup вернул пусто. Workflow настроен, но результат выполнения не подтверждён. Vercel failure build-rate-limit не доказывает провал SQL tests.
- См. docs/audits/AUD-340-ci-postgres-integration-coverage.md.
- Никакие workflows не запускались, source behavior не менялся, live DB/payment/provider/deploy действий не было.


## Дополнение к handoff — 2026-11-10 (AUD-341)

- Добавлен regression test: ошибка записи GPTunnel text usage обязана остановить flow до quote callback и image provider submission.
- AUD-341 фиксирует существующую безопасную последовательность `onTextProviderUsage` → parse plan → quote → image submit; runtime поведение не менялось.
- AUD-339 policy для успешного ответа с `cost_missing` всё ещё ожидает выбор A/B. Тесты/CI не запускались.


## Дополнение к handoff — 2026-11-10 (AUD-342)

- Проверены idempotency/fingerprint, claim fencing, durable plan, task provider keys, polling saved task ID, provider outcome journal, rehosting recovery, quote persistence/reservation resize и atomic completion.
- Выявлен recovery gap: если GPTunnel уже вернул успешный текст, usage сохранён, но запись плана в `save_pin_generation_plan` не состоялась, запрос становится unknown без durable plan. Автоповтор GPTunnel блокируется (правильно для защиты от двойного расхода), но пользователь сам восстановить такой запрос не может.
- Добавлен regression test: сбой записи плана после успешного текстового ответа блокирует quote/image provider boundaries.
- Рекомендация: отдельный durable journal нормализованного текстового плана или админская сверка. Не повторять платный текстовый запрос автоматически.
- AUD-342 source/test/report readback; runtime tests/CI не запускались. Production не менялся.


## Дополнение к handoff — 2026-11-10 (AUD-343)

- Добавлена миграция `121_atomic_pin_generation_text_plan.sql`: service-role RPC `record_pin_generation_text_plan` атомарно записывает GPTunnel usage и нормализованный план задач, используя существующие claim-fenced RPC. Ошибка сохранения плана откатывает usage insert в рамках того же вызова.
- Backend теперь использует объединённый RPC для валидного плана; проверка котировок и image provider выполняются только после успешного сохранения.
- Если модель вернула некорректный JSON/план, usage сохраняется отдельно, затем запрос завершается ошибкой; неверный план не становится image tasks.
- Добавлены provider-boundary тест и SQL integration assertions для успешной атомарной записи и rollback usage при невалидном плане.
- Ограничение: crash/timeout после принятия текстового запроса провайдером, но до получения ответа backend, не может быть восстановлен без provider-side response retrieval; unknown/no-auto-retry защита сохраняется.
- Перед deploy обязательно применить migration 121. Runtime tests/SQL integration/lint/build/CI не запускались; production не менялся.


## Дополнение к handoff — 2026-11-10 (AUD-344)

- Проверен контракт GPTunneL для `POST /v1/chat/completions`: синхронный ответ содержит completion ID и usage, но документация не описывает idempotency key или lookup/retrieve completion по ID.
- В `backend/gptunnel.js` timeout 30 секунд; completion ID сохраняется только после получения полного ответа. При timeout/crash до ответа ID отсутствует, безопасно восстановить текстовый результат нечем.
- Не добавлять предположительный заголовок idempotency и не повторять автоматически платный текстовый запрос. Существующий статус unknown/no-auto-retry остаётся корректной защитой.
- Отдельная idempotency capability CreativeLab относится к image/media tasks и не переносится на chat completions.
- AUD-344 — docs/source review only; runtime tests/build/CI не запускались; код и production не менялись.


## Дополнение к handoff — 2026-11-11 (AUD-345)

- Проверен lifecycle generation credit reservations: уникальность user/idempotency key, lock пользователя, resize по quote, atomic actual-cost settlement; definitive failure release.
- Unknown без task rows освобождает image reservation (миграция 088); unknown с хотя бы одной durable task row сохраняет reservation без TTL — это безопасно, так как provider мог принять image submission. Автоматически освобождать такие резервы по времени нельзя; нужна сверка.
- Проверен Pinterest worker: одна schedule на run, heartbeat 60s, stale recovery 20m, positive-only success reconciliation по точной identity publication ledger, безопасный retry только для exact-board retry_safe failure; known remote ID сохраняется при unknown.
- Код подтверждает наличие worker implementation, но не факт его production deployment/health/secrets. Это проверяется в панели хостинга и логах; отсутствие worker оставляет due schedules в очереди, но не вызывает повторные публикации.
- Добавлен тест: malformed text plan сохраняет успешный GPTunnel usage, но не проходит к quote/image provider.
- AUD-345 report + HANDOFF сохранены. Runtime tests/SQL/lint/build/CI и production worker checks не выполнялись; live data не менялись.


## Дополнение к handoff — 2026-11-11 (AUD-346)

- Проверен Prodamus checkout: idempotency key + fingerprint, CSPRNG order ID, локальная запись и provider order reference до внешнего запроса, unknown fence при неоднозначном результате, unique provider_payment_id для подписок и кредитных покупок.
- Вебхук: подпись до обработки, только известные финальные статусы, обязательное совпадение валюты/суммы (USD использует currency_sum), append-only audit для неизвестного заказа/несовпадений без customer PII.
- Кредиты: credit_paid_purchase row-lock + atomic balance/ledger/purchase marker; unique purchase_id ledger index; duplicate и commit-then-error recovery безопасны.
- Подписки: atomic activation row-lock; повторная доставка не продлевает один order второй раз; checkout request settled только после полного fulfillment.
- Выявлен подтверждённый operational gap: Prodamus refunds остаются manual-only. Нет refund webhook consumer, refunded status или refund ledger, partial refund totals не представлены. Refund не приводит к автоматическому изменению кредитов/тарифа. Не автоматизировать без политики partial refund, уже потраченных credits и overlapping subscriptions.
- Legacy generic balance adjustment RPC требует, чтобы в production были применены поздние hardening migrations, включая 074; live grants/schema не проверялись.
- AUD-346 report сохранён. Tests/SQL/lint/build/CI и live Prodamus/Supabase checks не выполнялись; платежи/возвраты/балансы не менялись.


## Дополнение к handoff — 2026-11-11 (AUD-347)

- Проверена модель Supabase: migration 076 закрывает все 10 core tables прямым клиентским доступом (PUBLIC/anon/authenticated), включает RLS, оставляет backend service_role CRUD.
- Перепроверены более поздние таблицы/очереди: generation task/text usage, payment_creation_requests (116), append-only operator journals (078/082), pin_review_queue (113/120), reporting view (079). В просмотренных миграциях клиентские grants отозваны, серверные права/RPC заданы явно.
- Проверены SECURITY DEFINER: новые просмотренные функции используют search_path pg_catalog,public; доступ ограничен через revoke/grant. Backend production startup fails closed без SUPABASE_SERVICE_ROLE_KEY.
- RLS не заменяет API ownership: service_role обходит RLS. AUD-104 ранее не нашёл подтверждённого IDOR в изученных маршрутах, но live two-account test не проводился.
- Storage pin-images намеренно public для Pinterest. Исходники валидируют bucket config и lifecycle, но live Storage grants/policies и anon write attempts не проверялись.
- Backup/restore — P0 operational gap: в репозитории нет доказательств независимых DB/Storage backups, отдельного escrow PINTEREST_TOKEN_ENCRYPTION_KEY и previous key, измеренных RPO/RTO или успешного restore drill. DB backup без ключа шифрования Pinterest tokens может быть неполноценным.
- AUD-114 account deletion/privacy promise blockers остаются открыты.
- AUD-347 report сохранён. Live Supabase checks, tests, SQL integration, lint/build/CI, production migrations, backup changes, merge/deploy не выполнялись.


## Дополнение к handoff — 2026-11-11 (AUD-348)

- Проведён source-level failure-mode review для frontend, backend, PostgreSQL, Supabase Storage, GPTunnel, Pinterest, Prodamus, SMTP, DNS и secrets.
- Подтверждены durable generation/payment/email/scheduler journals и безопасные границы повторов; process restart recovery не равен защите от потери DB provider/account.
- Pinterest worker отдельный процесс (default poll 30s, 1 row/request), но production worker/cron и мониторинг heartbeat не подтверждены. Не включать worker и внешний cron одновременно.
- /health — только liveness {ok:true}, не readiness DB/Storage/worker. Нет подтверждённого end-to-end readiness check.
- Важнейшие P0: независимые encrypted DB backups, Storage backups/checksum, escrow current+previous PINTEREST_TOKEN_ENCRYPTION_KEY, изолированный restore drill с проверкой расшифровки тестового токена.
- RPO/RTO остаются unknown; automatic failover не подтверждён. Не обещать восстановление до фактического теста.
- AUD-348 report сохранён. Live provider checks/restore/failover/tests/lint/build/CI не выполнялись; production не менялся.


## Дополнение к handoff — 2026-11-11 (AUD-349)

- Проведён source-level аудит capacity/performance/horizontal scaling. Никакие значения одновременных пользователей (100/500/1000) нельзя подтвердить без профиля нагрузки и staging load test.
- Backend использует Supabase JS/PostgREST/Storage API, а не прямой pg pool в просмотренном manifest; размер DB connection pool приложения здесь не настраивается.
- express-rate-limit MemoryStore локален каждому процессу: при нескольких backend replicas лимиты AI/auth/payment/upload/Pinterest/admin не становятся глобальными; после рестарта счётчики сбрасываются. Shared store нужен до масштабирования.
- AI/provider и upload/rehost пути синхронны; image upload использует Multer memoryStorage, max 5 MiB/file. В коде не найден общий process-wide semaphore/admission control для дорогих операций.
- Pinterest worker ограничивает batch до 1 записи, один активный tick, polling default 30s; реальная производительность и backlog drain rate не измерялись.
- /health и текущие логи не дают достаточной readiness/metrics картины. Нужны CPU/RAM/event-loop/latency, Supabase API/DB/storage/egress, provider spend, worker heartbeat/backlog metrics.
- Стадии масштабирования и критерии load test задокументированы в docs/audits/AUD-349-capacity-performance-and-horizontal-scaling.md.
- Нет production метрик/дашбордов/нагрузочных тестов; tests/lint/build/CI не запускались. Live ресурсы/квоты/цены не проверялись; инфраструктура и production не менялись.


## Дополнение к handoff — 2026-11-11 (AUD-350)

- Сводный privacy/data-lifecycle review завершён; account deletion end-to-end отсутствует, хотя active RU/EN policies обещают 30-day deletion. Не добавлять простое hard-delete cascade: опасны late Prodamus webhooks, финансовая история, FK/outbox, Pinterest schedules и Storage references.
- Self-service export endpoint/UI отсутствует; AUD-118 — только дизайн. Требуются owner-bound DTO allowlists, secret exclusion, private expiring download и tests.
- AI website analysis отправляет извлечённые фрагменты пользовательского сайта в GPTunnel; active policy это раскрывает недостаточно явно.
- Prodamus checkout передаёт email и order/plan/amount/currency metadata. Pinterest получает approved content, destination URL, board and public image URL.
- Документированный frontend Vercel не отражён в processor inventory active policy; email provider, реальные regions, contracts/subprocessors и transfer safeguards требуют проверки оператором.
- Raw error object logging в Express и email_outbox retention/redaction требуют отдельной политики. Не доказана конкретная утечка секрета, но текущая модель затрудняет гарантию redaction.
- Pinterest OAuth token crypto: AES-256-GCM, 32-byte key, previous-key lazy rotation; legacy plaintext может оставаться до lazy migration. Нужна проверка production key, legacy inventory и независимое escrow.
- pin-images bucket intentionally public; anyone with URL may retrieve. Stale PinSprig privacy source files are maintenance hazard; remove only after repo-wide reference check.
- AUD-350 report сохранён. Нет live data/provider/legal checks; tests/lint/build/CI/deploy/production changes не выполнялись.

## Дополнение к handoff — 2026-11-11 (AUD-351)

- Проверен backend logging: central Express error handler пишет полный error object для 5xx; auth/billing/Pinterest/storage/generation call sites логируют upstream/database error.message без общего redaction allowlist.
- В routine logs встречаются Prodamus order/subscription IDs и status descriptions, Pinterest internal user ID/username; это повышает linkability. Подтверждённой утечки токенов/секретов в изученных строках не установлено.
- Рекомендация: structured allowlist logger, safe error codes, correlation IDs, sentinel-secret redaction tests; исключить request/webhook bodies, headers, tokens, raw provider payloads, usernames/email и stack traces из обычных production logs.
- RU/EN privacy notices всё ещё недостаточно конкретно раскрывают передачу извлечённых фрагментов пользовательских сайтов в GPTunnel. Обновлять после проверки актуальных условий провайдера, не угадывать retention/training/region.
- Retention внешних host logs, email outbox и operational journals не подтверждён; нужен утверждённый retention matrix и проверка live provider settings.
- AUD-351 — source review/report only. Код, policy, DB, production не менялись; tests/lint/build/CI и live logs/provider checks не выполнялись.

## Дополнение к handoff — 2026-11-11 (AUD-352)

- Добавлен backend/safeLogger.js: JSON event logger с allowlist полей (event, HTTP status, ограниченный machine error_code); error.message, stack, cause, request/response, provider payloads, headers и tokens не сериализуются.
- Добавлены backend/test/safe-logger.test.js: проверки nested secrets, unsafe error codes, invalid status и hostile error object. Тесты пока не запускались.
- Центральный handleError в backend/index.js переведён на logError/logWarning; публичные HTTP-ответы не менялись.
- Остальные direct console.* в auth/billing/Pinterest/storage/generation/worker ещё требуют поэтапной миграции. Request correlation ID пока не добавлен.
- AUD-352 partial implementation; production, БД, платежи, OAuth, deployment не затрагивались; lint/build/CI/runtime tests не выполнялись.

## Дополнение к handoff — 2026-11-11 (AUD-353)

- На safeLogger переведены все прямые console.log/error/warn/info в backend/index.js (22), auth.js (6), billing.js (24), creditsBilling.js (21), pinterest.js (29), storage.js (3).
- Используются стабильные имена событий вида module.event_NNN. Обычные логи больше не включают provider/database error messages, order IDs, суммы/описания платежей, Pinterest username/user ID, OAuth denial details и image source URLs из этих точек.
- safeLogger поддерживает error/warn/info; тест safe-logger.test.js расширен проверками warning/info и исключения email из serialized log.
- Остальные backend-модули ещё не прошли полный аудит; correlation ID и отдельный ограниченный diagnostic channel не реализованы.
- AUD-353 partial implementation. Тесты, lint, build, CI не запускались; production logs, платежи, OAuth, БД и deployment не затрагивались. Изменения платёжной/кредитной логики не планировались.

## Дополнение к handoff — 2026-11-11 (AUD-354)

- На safeLogger переведены ещё 29 прямых console-вызовов в mail.js (2), email-verify.js (8), password-reset.js (6), pins.js (5), prodamus.js (2), scheduleWorker.js (3), paymentCreationIdempotency.js (2), tariff.js (1).
- Удалён вывод сырых provider response bodies, database/provider error messages, email subjects, task indexes и shutdown metadata из этих логов. Публичные ошибки и бизнес-логику не менял намеренно.
- В source-level sweep 63 backend JavaScript modules прямые console-вызовы найдены только в уже мигрированных местах и в самих output primitives safeLogger.js. Это не аудит зависимостей или deployed logs.
- Следующий этап: безопасные request correlation IDs, затем проверка не-JavaScript/runtime/hosted logs и retention.
- Runtime tests, lint, build и CI не запускались. Production logs, платежи, email, Pinterest API/OAuth, БД и deploy не затрагивались.

## Дополнение к handoff — 2026-11-11 (AUD-355)

- `safeLogger.js` получил AsyncLocalStorage-контекст: error/warn/info события автоматически получают allowlisted `correlation_id` в пределах async request context.
- В раннем Express middleware генерируется server-owned UUID через `crypto.randomUUID()`, он возвращается в `x-request-id`; входящий client correlation header не используется.
- В `safe-logger.test.js` добавлены проверки async propagation, изоляции вне контекста и отклонения malformed ID.
- В `scheduleWorker.js` устранён остаточный raw `error.message`: production default теперь использует safeLogger и пишет только `schedule_worker.batch_failed`; тест обновлён.
- Ограничение: correlation context пока не переносится в detached jobs/самостоятельные worker ticks/provider logs; CORS expose header не включён.
- Runtime tests, lint, build и CI не запускались. Production requests/logs, платежи, email, Pinterest API/OAuth, БД и deployment не затрагивались.

## Дополнение к handoff — 2026-11-11 (AUD-356)

- Каждый независимый tick `scheduleWorker.js` получает собственный UUID-контекст; completion/failure safe-log события включают `correlation_id`.
- Worker completion event нормализован до `schedule_worker.batch_completed`; failure event остаётся `schedule_worker.batch_failed`, исходный текст исключения и HTTP config не логируются.
- Каждый запуск subscription email outbox (таймер/старт приложения/вызов после callback) получает отдельный UUID-контекст; ошибка dispatch сохраняет этот ID в safe log.
- Границы: ID worker tick и ID HTTP-запроса к backend пока независимы, поскольку backend намеренно не доверяет клиентскому correlation header. ID не сохраняются в durable generation/Pinterest rows; для этого потребовались бы отдельное решение по схеме и миграция.
- Добавлен тест safe-log UUID для worker tick. Runtime tests, lint, build и CI не запускались. Production/DB/payment/email/Pinterest/deploy не затрагивались.

## Дополнение к handoff — 2026-11-11 (AUD-357)

- `safeEventName` больше не превращает произвольный текст в event key. Разрешены только короткие namespaced static IDs `module.event_name`; свободный текст/email заменяется на `unclassified_error`, без сохранения фрагментов.
- Валидация correlation ID усилена до канонической UUID-формы с допустимыми version/variant; malformed UUID-подобные строки не попадают в лог.
- `logWarning` теперь пишет в `console.warn`, а `logError` — в `console.error` (ранее warning с уровнем warn ошибочно направлялся в stderr error channel).
- Добавлены тесты на PII/free-text event rejection, canonical UUID и warning output channel.
- Runtime tests, lint, build и CI не запускались. Это source-level проверка, не аудит production log sink/retention/access control. Production/DB/payment/email/Pinterest/deploy не затрагивались.

- Дополнительно в AUD-357: `error_code` теперь проходит не только regex, но и фиксированный allowlist известных Node/network и выбранных PostgreSQL/PostgREST кодов; неизвестные значения опускаются.

## Дополнение к handoff — 2026-11-11 (AUD-358)

- Проверены все 63 non-test JS-модуля `backend/`: дополнительных прямых `console.*`, process-level exception handlers и явных интеграций `morgan`/`winston`/`debug` не найдено. Прямые console sink-вызовы остаются в `backend/safeLogger.js`.
- В lockfile `pino` присутствует транзитивно через `imapflow`; оба `ImapFlow` клиента в `backend/mail.js` передают `logger: false`. `morgan` и `winston` отсутствуют. `debug` — транзитивная зависимость Express/HTTP-стека; в production переменная `DEBUG` должна быть unset/empty.
- Остаточный риск: `index.js` и `scheduleWorker.js` не устанавливают `uncaughtException`/`unhandledRejection` handlers. Стандартная диагностика Node может вывести message/stack мимо `safeLogger`. Не менял fatal shutdown semantics в рамках AUD-358; следующий этап AUD-359 — отдельное проектирование и тестирование безопасного завершения процесса.
- Runtime tests/lint/build/CI и реальные production DEBUG/logging settings не проверялись. Никаких production/DB/payment/email/Pinterest/deploy действий не было.

## Дополнение к handoff — 2026-11-11 (AUD-359)

- Добавлен `backend/fatalProcessHandlers.js`: `uncaughtException` и `unhandledRejection` теперь дают фиксированное событие `process.uncaught_exception` / `process.unhandled_rejection`, синхронно записывают безопасную JSON-строку через `fs.writeSync` и завершают процесс с кодом 1. Исходная ошибка/rejection reason/message/stack/cause не читаются и не сериализуются.
- Обработчики подключены в API-процессе (`backend/index.js`) и standalone scheduler worker (`backend/scheduleWorker.js`, только при запуске как main). Добавлены unit tests на fail-fast, exit code 1, повторный fatal event, сбой записи и отсутствие утечки причины.
- Принятое поведение: после fatal event процесс не продолжает работу и не пытается дренировать бизнес-операции — состояние Node может быть повреждено. Обычный SIGTERM/SIGINT worker shutdown сохраняет прежний bounded drain. Хост должен перезапустить завершившийся процесс; его restart policy не проверена.
- Runtime tests/lint/build/CI не запускались. Один черновой файл ошибочно попал в default branch и сразу удалён отдельным revert-коммитом; implementation/tests/docs находятся в feature branch. Production/DB/payment/email/Pinterest/deploy не затрагивались.

## Дополнение к handoff — 2026-11-11 (AUD-360)

- Проверены `backend/package.json`, `frontend/package.json`, `backend/scheduleWorker.js`, scheduler setup и README. Backend запускается отдельно через `npm start`; Pinterest worker — отдельной командой `npm run worker`. API не запускает worker внутри себя. Выбирать нужно только один способ scheduler: отдельный worker или внешний cron, не оба одновременно.
- В репозитории нет Render manifest/Dockerfile/Procfile/process-manager config и нет `.nvmrc`/`.node-version` или `engines`; README называет Render текущим backend host, но точные команды, число экземпляров, Node runtime, restart policy, health checks, secrets и SIGTERM grace period можно подтвердить только в панели провайдера.
- Исправлен lifecycle API в `backend/index.js`: сохранён HTTP server handle, SIGTERM/SIGINT останавливают outbox timer, закрывают idle connections и дают активным HTTP запросам до 10 секунд на завершение. При успешном закрытии выставляется exit code 0 с естественным завершением процесса; timeout/ошибка закрытия — exit code 1. AUD-359 fatal handlers остаются отдельным fail-fast путём.
- Worker уже ограничивает параллельные polling requests одним, claim batch — 1, polling interval — 30 секунд по умолчанию, drain — 20 секунд. Неопределённые Pinterest публикации не должны повторяться автоматически.
- Рекомендации для панели хостинга: restart-on-failure с bounded backoff; один scheduler вариант; API health check плюс отдельный worker heartbeat/stale-queue alert; согласовать SIGTERM grace period с 10s API / 20s worker; зафиксировать поддерживаемый Node LTS. Ничего из этого в панели не менялось и не подтверждено.
- Runtime tests/lint/build/SQL integration/production checks не запускались. Последний известный Vercel status — `build-rate-limit`; workflow runs не обнаружены. PR #4 остаётся open Draft. Production/DB/payment/email/Pinterest/deploy не затрагивались.


## Дополнение к handoff — 2026-11-11 (AUD-361)

- Проверены /health, GET /admin/pinterest/schedules, GET /admin/billing/email-outbox, adminPinterestInventory.js, billing.getEmailOutboxHealth, scheduler worker, тесты и operational setup docs.
- /health — только liveness API; он не проверяет БД, SMTP, Pinterest worker или просроченную очередь. Pinterest inventory и email outbox health — read-only admin endpoints, не публичные probes и не автоматические alerts.
- Pinterest inventory классифицирует overdue_scheduled, stale_publishing (20 минут) и unknown; сам worker polling по умолчанию 30 секунд. В отдельном worker нет HTTP health server или durable heartbeat. Отсутствие worker нельзя определить одним успешным API /health.
- Усилен billing.getEmailOutboxHealth: добавлены due_pending (pending с next_attempt_at <= now), oldest_due_pending_at и oldest_due_pending_age_seconds. Прежний oldest_pending_at сохранён, но измеряет возраст создания всех pending, включая записи, для которых retry ещё не наступил.
- Обновлён privacy-safe unit test email outbox health: проверяет due count/age и прежнюю фильтрацию PII/payload. Тесты не запускались.
- Внешний мониторинг остаётся конфигурацией оператора: API liveness, worker heartbeat/log freshness, очередь Pinterest и due/dead/stale email outbox. Нельзя включать второй scheduler только ради heartbeat. Production thresholds/provider integrations пока не задавались.
- No DB schema changes, production queries, email delivery, Pinterest calls, deployment, payment or account mutations. Runtime tests/lint/build/CI not run; PR #4 remains open Draft.

## Дополнение к handoff — 2026-11-11 (AUD-361)

- `GET /health` — только liveness API; он не подтверждает работу фонового scheduler. Существующий `GET /admin/billing/email-outbox` уже даёт privacy-safe counts/oldest pending/dead diagnostics без email и payload. Outbox dispatch выполняется in-process таймером раз в минуту и при callback; sleep/stopped API задерживает retry.
- Pin image retention queue имеет admin-triggered processing endpoint и read-only blocked inventory, но не отдельный постоянно работающий worker. `pin_review_queue` остаётся human-review queue и не должна публиковаться автоматически.
- Добавлена migration `122_pinterest_scheduler_health_monitor.sql`: singleton monitor, service-role-only begin/complete RPC, UUID fencing run completion и защита от перекрытия запусков в пределах 20 минут. В Pinterest internal schedule endpoint после проверки scheduler secret фиксируются start/completion и только агрегированные счётчики; никаких пользовательских/публикационных ID, токенов, payload или произвольного текста ошибки.
- Добавлен admin-only read-only `GET /admin/operations/pinterest-scheduler`, helper `backend/pinterestSchedulerHealth.js`, tests и документация. Статус completed run становится stale после 3 минут; незавершённый запуск допускается до 20 минут (согласовано с stale claim recovery). `not_seen` означает, что после migration 122 ещё не было вызова.
- Heartbeat подтверждает вызов защищённого endpoint, но не доступность Pinterest API и не заменяет анализ возраста очереди/unknown публикаций. Migration 122 НЕ применялась к Supabase; сначала staging, SQL/runtime tests, затем согласованный rollout. `docs/database.md` обновлён до миграции 122.
- Source readback выполнен; runtime tests/SQL/lint/build/CI/production heartbeat не запускались. PR #4 остаётся open Draft; merge/deploy/production DB/SMTP/payments/Pinterest API не выполнялись.


## Дополнение к handoff — 2026-11-11 (AUD-362)

- Проверено, что heartbeat-инфраструктура была частично подготовлена ранее: SQL migration 121 (теперь 122), pure helper `pinterestSchedulerHealth.js`, admin GET `/admin/operations/pinterest-scheduler`, unit tests.
- Найдена коллизия номеров: `121_atomic_pin_generation_text_plan.sql` и `122_pinterest_scheduler_health_monitor.sql`. Исправлено: heartbeat migration перенесена на `122_pinterest_scheduler_health_monitor.sql`; migration 121 сохранена без изменений. Docs/database.md и scheduler setup приведены к диапазону 010–122.
- Более важный gap: worker отправляет POST на `/internal/pinterest/schedule/run`, но такого Express route нет среди зарегистрированных маршрутов backend/index.js. Worker также не вызывает RPC `begin_pinterest_scheduler_run` / `complete_pinterest_scheduler_run`. Следовательно, scheduler и heartbeat нельзя считать работоспособными на текущем commit. Документация исправлена, чтобы не предлагать включать их в production.
- Следующий этап должен отдельно спроектировать и реализовать защищённый internal endpoint, обработку одной записи с сохранением claim fencing / retry-safe / unknown semantics, heartbeat start/complete и интеграционные тесты. Не переписывать бизнес-логику публикации без изучения всех существующих helpers/RPC.
- No DB migration applied, no production request, Pinterest API, payment, email delivery, or deployment. Tests/lint/build/CI not run. PR #4 remains open Draft.

**Уточнение AUD-362 после повторной проверки текущего feature branch:**

- Маршрут `POST /internal/pinterest/schedule/run` присутствует в `backend/pinterest.js` (внутри `registerRoutes`) и `backend/index.js` вызывает `require("./pinterest").registerRoutes(app, ...)`. Поэтому прежнее утверждение об отсутствующем route было ошибочным.
- На текущей ветке endpoint также вызывает `begin_pinterest_scheduler_run` / `complete_pinterest_scheduler_run`; scheduler setup и AUD-361 report исправлены с учётом этого.
- Heartbeat migration — `122_pinterest_scheduler_health_monitor.sql`, поскольку `121_atomic_pin_generation_text_plan.sql` уже занимает номер 121. Дубликат AUD-361 report удалён; итоговый отчёт консолидирован в `docs/audits/AUD-361-background-worker-and-queue-observability.md`.
- Это source-level verification; runtime/SQL tests не запускались, migration 122 не применялась.


## Дополнение к handoff — 2026-11-11 (AUD-363)

- Исправлена ошибочная формулировка AUD-362: внутренний маршрут существует в `backend/pinterest.js` и регистрируется через `require("./pinterest").registerRoutes(app, ...)` в `backend/index.js`. Маршрут проверяет scheduler secret timing-safe, начинает heartbeat, вызывает reconciliation, claim RPC, renew claim, существующий `publishPin()`, и завершает heartbeat. Worker endpoint URL совпадает с маршрутом. Предыдущий вывод об отсутствии route был неверен.
- Подтверждено, что сервер ограничивает claim до одной записи за вызов, несмотря на историческую документацию «до 10».
- Выявлен race: completion RPC из migration 122 мог повторно изменить уже терминальный статус того же run UUID. Добавлена migration 123 с условием `status='running'` при completion — терминальный результат становится неизменяемым, старый run не может завершить новый.
- Route теперь сохраняет накопленные агрегированные counters и использует их при фиксации failed completion, вместо сброса всех счётчиков в ноль.
- Добавлен source contract test на совпадение worker URL, регистрации маршрута, secret check, claim/renew/publish/monitor RPC и миграционного fencing.
- Обновлены scheduler setup, database migration guide, AUD-362 correction, AUD-363 report.
- No SQL migration applied, no live DB query, no Pinterest API, payment, email, deployment, or production worker/cron activation. Tests/lint/build/CI not run. PR #4 remains open Draft.


## Дополнение к handoff — 2026-11-11 (AUD-364)

- Проверены актуальные SQL определения claim, renew, reservation, completion, stale recovery, retry и late-success reconciliation по миграциям 033, 034, 049, 050, 056–060, 091–096, 112, 114–115, 119, 122–123.
- Подтверждён порядок блокировок account → schedules → attempt для операций завершения/late-success; reservation/disconnect сериализуются через account-first lock.
- Подтверждено, что remote ID при неуверенном локальном результате сохраняется в non-retryable unknown attempt; автоматическая reconciliation требует точного совпадения owner/pin/account/board/remote ID в attempt и publication ledger.
- Stale recovery автоматически возвращает в очередь только отсутствие durable attempt либо точный retry-safe отказ; неоднозначные попытки остаются unknown.
- Добавлен disposable PostgreSQL integration script для дублированного completion и fencing устаревшего run UUID.
- SQL script не запускался; нет доступа/запросов к staging или production DB, миграции не применялись, Pinterest API не вызывался, worker не активирован. Node tests/lint/build/CI не запускались.


## Дополнение к handoff — 2026-11-11 (AUD-365)

- Проверены Pinterest OAuth state + browser binding, attempt generation/token_version, AES-256-GCM token storage и key rotation, публичные account projections, auth middleware и user ownership на routes расписания, scheduler secret, SSRF URL fetch, non-idempotent 429 policy, refresh lease.
- Подтверждены: OAuth callback привязан к исходному браузеру через Secure/HttpOnly/SameSite=Lax cookie; public account response не содержит access/refresh token; пользовательские маршруты требуют requireAuth; scheduler secret сравнивается timing-safe; SSRF guard закрепляет DNS lookup, запрещает private/reserved IP и redirect following.
- Ограничение: express-rate-limit использует process-local MemoryStore. При масштабировании на несколько backend instances лимиты не будут глобальными. Перед горизонтальным масштабированием требуется shared store и проверка trusted proxy/IP configuration. Не добавлял внешнюю инфраструктуру в рамках аудита.
- Добавлен source contract test `backend/test/pinterest-security-contract.test.js` и отчёт `docs/audits/AUD-365-pinterest-backend-security-boundaries.md`.
- Node tests/lint/build/CI не запускались. Live DB, Pinterest API, секреты и deployment не затрагивались.


## Дополнение к handoff — 2026-11-11 (AUD-366)

- Проверены user JWT HS256 allowlist + DB token_version, owner checks project → board → pin, CRUD routes, profile/tariff patch, DB-backed requireAdmin, dev top-up guard, Supabase service-role config и SQL grants/RLS.
- Подтверждено: миграция 076 включает RLS и отзывает client grants у десяти core tables (public/anon/authenticated), оставляя CRUD только service_role; миграции 039 и 120 отдельно закрепляют Pinterest и review queue. Production backend fail-fast без SUPABASE_SERVICE_ROLE_KEY.
- Важно: наличие миграций в GitHub не доказывает, что они применены в live Supabase. Перед запуском сверить migration ledger; live DB не опрашивалась.
- Добавлен `backend/test/data-access-boundary-contract.test.js` и отчёт `docs/audits/AUD-366-data-access-and-admin-boundaries.md`.
- Node tests/lint/build/CI не запускались. Данные, баланс, платежи, админ-операции и production не менялись.


## Дополнение к handoff — 2026-11-11 (AUD-367)

- Проверены Prodamus HMAC-SHA256 + constant-time compare, ограниченный multipart/urlencoded/JSON webhook parser, маршрутизация subscription/credit orders, amount/currency checks, финальные статусы, atomic activation/credit fulfillment, checkout idempotency и settlement, webhook exception audit, provider refund workflow.
- Подтверждено: подпись проверяется до lookup заказа; неверная сумма/валюта не активирует тариф и не начисляет кредиты; кредитный RPC блокирует purchase row и атомарно фиксирует balance + ledger + balance_credited_at; повторная доставка не начисляет пакет повторно; settlement проверяет exact order/kind/local payment/user/fulfilled marker.
- Миграции 010/011/029/037/072–073/116–118 должны быть сверены с live Supabase migration ledger перед приёмом реальных платежей. Live DB и Prodamus не опрашивались.
- Добавлен `backend/test/billing-security-contract.test.js` и отчёт `docs/audits/AUD-367-prodamus-payment-integrity.md`.
- Node tests/lint/build/CI не запускались. Реальные платежи, возвраты, балансы, тарифы, секреты и deployment не затрагивались.


## Дополнение к handoff — 2026-11-11 (AUD-368)

- Проверены генерационные резервы, exact GPTunnel quotes, claim fencing, provider task idempotency, recovery/polling, atomic completion и cost ledger.
- Исправлено: `backend/gptunnel.js` теперь отклоняет successful image task с нулевой/отрицательной фактической ценой, поскольку downstream pricing и SQL settlement требуют положительную цену. Добавлен тест в `backend/test/gptunnel-pricing.test.js`.
- GPTunnel text usage без `total_cost` намеренно сохраняется как `cost_missing` / NULL, а не как нулевая стоимость. Это не блокирует результат генерации, но требует последующей сверки фактических расходов.
- Перед production нужно подтвердить применение миграций 054/065/067/069/071/074/079/088. Интеграционные SQL/shell тесты не запускались.
- Node tests/lint/build/CI и живые GPTunnel/Supabase операции не выполнялись. Production balances/credits/secrets/deployment не менялись.


## Дополнение к handoff — 2026-11-11 (AUD-369)

- Проверены восстановление генераций, durable provider task journal, Storage upload/delete fencing, stale upload reconciliation, retention tombstones, queue leases и graceful shutdown.
- Исправлена миграция 109: GRANT теперь ссылается на `finalize_pin_image_retention_queue_item(text,text,uuid,boolean,text)`, как и определение функции/REVOKE. Добавлен regression contract test в `backend/test/pin-image-lifecycle.test.js`.
- Важно: cleanup/retention маршруты admin-only и раздельные; автоматический планировщик для этих операций в исходниках не обнаружен. Не включать автоматическую очистку без сверки миграций и dry-run inventory.
- Наличие миграции 109 в репозитории не подтверждает её применение в production Supabase. Нужно проверить migration ledger и фактические RPC grants.
- Node tests/lint/build/CI и SQL integration scripts не запускались. Storage/DB/provider/production не изменялись.

- Дополнительная правка AUD-369: исправлен относительный импорт в `backend/test/pin-image-lifecycle.test.js` с `./pinImageLifecycle` на `../pinImageLifecycle`, чтобы тест действительно загружал модуль из `backend/`.


## Дополнение к handoff — 2026-11-11 (AUD-370: independent backup and restore readiness)

- Проверено: в репозитории есть инструкция сборки пустой схемы baseline + migrations до 123, но это не backup пользовательских данных и не восстановление Storage.
- В inspected tree не найден независимый scheduled PostgreSQL backup/export pipeline, Storage object backup/replication pipeline, backup alerting или evidence restore drill.
- Для восстановления нужны PostgreSQL + bytes всех нужных Storage objects + object paths/checksums + current/previous `PINTEREST_TOKEN_ENCRYPTION_KEY` + остальные секреты из отдельного vault + точный app commit/migration set.
- Добавлены `docs/audits/AUD-370-independent-backup-and-restore-readiness.md` и `docs/runbooks/backup-restore-aud-370.md`; ссылка добавлена в infrastructure checklist.
- Live Supabase plan/PITR/dashboard, bucket ACLs, backup settings, key escrow, storage copy and account recovery не проверялись. RPO/RTO неизвестны; full restore не выполнен.
- Никаких production изменений, экспорта, восстановления, миграций, deploy/merge или внешних side effects не было.


## Дополнение к handoff — 2026-11-11 (AUD-371: Pinterest key rotation and escrow readiness)

- Подтверждено по исходникам: AES-256-GCM, active + previous key, lazy re-encryption при чтении Pinterest-аккаунта, optimistic CAS по id/user_id/updated_at; uncertain refresh rows не перезаписываются.
- Выявлен операционный пробел: ротация ленивая, поэтому dormant accounts могут оставаться зашифрованными старым ключом; ciphertext format enc:v1 не содержит key ID; в репозитории не найден полный read-only inventory для подтверждения вывода previous key.
- Добавлены `docs/audits/AUD-371-pinterest-key-rotation-and-escrow-readiness.md` и `docs/runbooks/pinterest-key-rotation-aud-371.md`.
- Правило: не удалять `PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS` по сроку; сохранять соответствующие ключи в независимом vault на срок хранения совместимых DB backups. Для retirement нужен read-only scan всех ciphertexts, обработка конкурентных обновлений и evidence вне production.
- Live secrets/vault/DB rows не проверялись; Node tests не запускались; production secrets, OAuth, deploy, DB и Storage не менялись.


## Дополнение к handoff — 2026-11-11 (AUD-372: account deletion and data lifecycle)

- Подтверждено по исходникам: end-to-end account deletion endpoint/worker и lifecycle marker пользователя не обнаружены; прямой DELETE users опасен из-за каскадного удаления финансовых записей и FK email_outbox с ON DELETE RESTRICT.
- Payment webhook/RPC не учитывают deletion lifecycle; поздний успешный Prodamus webhook может выдать entitlement, если не разделить settlement и entitlement. Требуется общий SQL lock order и concurrency tests.
- Pinterest disconnect и reference-aware Storage image retention существуют как компонентные механизмы, но не составляют account deletion. Необходимо сохранять uncertain publication/generation/Storage outcomes до сверки.
- Активные RU/EN privacy notices содержат обещание удаления в течение 30 дней; репозиторий не содержит executable cleanup и backup-expiry evidence, подтверждающих срок. Нужна проверка оператора/юриста и сверка с реальными провайдерами/регионами.
- Добавлены `docs/audits/AUD-372-account-deletion-and-data-lifecycle.md` и `docs/runbooks/account-deletion-aud-372.md`.
- Не добавлялся поверхностный DELETE endpoint и не менялась схема: сначала нужны согласованные финансовые/юридические правила, lifecycle state machine, SQL lock order и тесты.
- Live DB/provider settings/users/payments/Storage не проверялись; tests/build/CI не запускались; production не менялся.


## Дополнение к handoff — 2026-11-11 (AUD-373: financial ledger reconciliation)

- Повторно проверены credit purchase webhook/RPC, subscription activation, generation reservations, generic balance adjustment, refund runbook.
- Подтверждены атомарность credit_paid_purchase (purchase lock + balance + purchase-linked ledger row + balance_credited_at), unique purchase_id, idempotent webhook retry; subscription activation транзакционная; generation reservation/settlement защищают spendable balance.
- AUD-373-01: migration 074 сохраняет service_role EXECUTE на legacy `adjust_credits_balance(text, integer)`; функция меняет users.credits_balance без credit_transactions. Текущий backend helper использует ledgered RPC, но внешние/deployed callers не проверялись. Не отзывать grant без инвентаризации.
- AUD-373-02: независимый scheduled read-only balance-vs-ledger reconciliation не найден. Нужны baseline/cutover rules, отчёт без автоисправления и human-reviewed ledger corrections.
- AUD-373-03: refunds остаются manual-only, нет first-class refund ledger/partial refund totals; автоматизация требует политики частичных возвратов, уже потраченных кредитов, перекрывающихся подписок и chargebacks.
- Добавлены `docs/audits/AUD-373-financial-ledger-and-balance-reconciliation.md` и `docs/runbooks/financial-balance-reconciliation-aud-373.md`.
- Tests/SQL/CI/live Supabase/Prodamus не запускались; финансовые данные, grants, secrets и production не менялись.


## Дополнение к handoff — 2026-11-11 (AUD-374: authentication and session lifecycle)

- Проверены регистрация/вход, email verification, password reset, JWT/token_version, frontend localStorage session, auth rate limits и предыдущие AUD-105–108/AUD-326.
- Исправлена валидация профиля регистрации в `backend/index.js`: name/surname проходят через `optionalString` с лимитом 80 символов; preferred_language — с лимитом 16. Некорректные JSON-типы теперь должны давать 422 вместо TypeError/500.
- Добавлен `backend/test/registration-input-validation.test.js`: missing/bounds/trimming/non-string и контракт вызова валидатора на маршруте.
- Добавлены `docs/audits/AUD-374-authentication-recovery-and-session-lifecycle.md` и `docs/runbooks/authentication-recovery-aud-374.md`.
- Подтверждены: HS256 JWT 7d + DB token_version check; reset token hash-only/one-use; atomic password update + token_version increment; explicit email verification; generic login/reset responses.
- Остались: registration email enumeration (409), JWT in localStorage, отсутствие server-side per-device session revoke/change-password UI, process-local IP rate limits, недостаток browser integration tests.
- Тесты/build/lint/CI/live DB/SMTP не запускались. Реальные аккаунты, пароли, JWT, токены, secrets и production не затрагивались.


## Дополнение к handoff — 2026-11-11 (AUD-375: user data access and public image privacy)

- Проверены owner checks проектов/досок/пинов, serializers, core RLS/grants, upload validation, Storage lifecycle and deletion fencing.
- Публичный bucket `pin-images` является намеренной границей продукта: любой обладатель URL может просмотреть объект без входа. Английская privacy policy обновлена; русская версия осталась без изменения из-за блокировки безопасной операции редактирования и должна быть синхронизирована до релиза.
- Добавлены `backend/test/pin-image-access-contract.test.js`, `docs/audits/AUD-375-user-data-access-and-public-image-privacy.md`, `docs/runbooks/public-pin-image-handling-aud-375.md`.
- Live Supabase bucket metadata/effective Storage policies не проверялись; anonymous GET/write/delete не тестировались. Tests/build/CI не запускались; production не менялся.

## Дополнение к handoff — 2026-11-11 (AUD-376: background workers and queue recovery)

- Проверены Pinterest schedule worker, scheduler monitor migrations 122/123, transactional email outbox, pin-image retention queue and manual-review queue.
- Подтверждены: Pinterest claim/fencing/renewal, one-row request limit, bounded worker shutdown, terminal completion fencing; email outbox uses atomic enqueue, SKIP LOCKED, 2-minute token lease and bounded retries; image retention expired leases become blocked rather than unsafe automatic reclaims.
- AUD-376-01: SMTP is at-least-once; if SMTP accepted but DB acknowledgement was lost, duplicate delivery is possible. Deterministic Message-ID aids correlation but does not guarantee deduplication.
- AUD-376-02: email outbox dispatcher runs in API process (startup + 60s timer + payment callback); sleeping host delays dispatch. Queue is durable, but delivery latency is not guaranteed.
- AUD-376-03: live deployment/migration state and scheduler service are unknown; code in branch does not prove production worker is active. AUD-376-04: blocked image-retention rows need monitoring/manual reconciliation.
- Added `docs/audits/AUD-376-background-workers-and-queue-recovery.md` and `docs/runbooks/background-queue-operations-aud-376.md`.
- No code/runtime/SQL changes, tests, build, CI, live provider checks, queue mutations, email sends, Pinterest publication, migration or deployment were performed.


## Дополнение к handoff — 2026-11-11 (AUD-377: GPTunnel generation and image recovery)

- Проверены GPTunnel text/image calls, exact quotes, durable plan/task journal, provider idempotency/task IDs, credit reservations, Storage rehosting and frontend request identity.
- Подтверждены: plan + task keys persisted before image submissions; exact quote model/currency/aspect ratio validation; credit reservation resized before provider call; provider task ID immutable; known task ID is polled without creating a replacement; provider result is journaled before Storage copy; failed Storage copy retries from saved provider result; final pin/credit settlement guarded atomically.
- SSRF boundary: HTTPS, public-IP/DNS validation, pinned lookup, redirects/proxy disabled; download max 5 MiB + 30s timeout; image signature/MIME validation; in-memory Buffer, no temporary disk files.
- AUD-377-01: ambiguous provider create timeout is not proof of failure; keep original idempotency key and reservation until provider reconciliation. Never submit a fresh task blindly.
- AUD-377-02: missing GPTunnel text cost remains NULL/unknown, not zero; text output may be retained with incomplete provider cost ledger.
- AUD-377-03: provider + polling + download work may exceed interactive HTTP lifetime; correctness depends on durable journal recovery.
- AUD-377-04: blocked sessionStorage fallback survives same-page remount only, not full reload; browser may lose retrieval key.
- AUD-377-05: live provider idempotency retention, GPTunnel task retention/cost, Supabase policies, deployed commit and applied migration ledger not verified.
- Added `docs/audits/AUD-377-gptunnel-generation-and-image-recovery.md` and `docs/runbooks/gptunnel-generation-recovery-aud-377.md`.
- No code/runtime/SQL/provider/Storage changes, tests, build, CI, generation, balance mutation, migration or deployment were performed.


## Дополнение к handoff — 2026-11-11 (AUD-378: frontend API contracts and auth storage)

- Сверены frontend/backend контракты досок, проектов и generation recovery. `GET /boards`, `GET/POST /projects`, `POST /boards` и `GET /generation/requests/:key` согласованы с frontend consumers.
- Board creation UUID + payload fingerprint обеспечивает повторяемое создание; повторное использование UUID с изменёнными данными отклоняется.
- **Исправлено:** доступ к localStorage для JWT и языка мог выбросить SecurityError до API fetch или после успешного `/me`; 401 cleanup/logout тоже могли прерваться. Добавлен `frontend/src/lib/authStorage.ts`; apiRequest, AuthContext и Login используют безопасные read/write/clear функции. Если браузер не позволяет сохранить JWT, вход останавливается с понятной ошибкой.
- Добавлен `frontend/src/lib/authStorage.test.ts` для нормального и заблокированного storage.
- Ограничение: project provisioning deduplicated только в пределах одного runtime браузера; cross-tab race сохраняется. Не меняли политику проектов, так как у пользователя может быть несколько проектов.
- Добавлены `docs/audits/AUD-378-frontend-api-contracts-and-session-failures.md` и `docs/runbooks/frontend-auth-and-api-recovery-aud-378.md`.
- Тесты, TypeScript lint, build, CI и браузерные проверки не запускались. Production, БД, миграции и внешние сервисы не затрагивались.

- Regression-test discovery: `frontend/package.json` test script now includes both `src/utils/*.test.ts` and `src/lib/*.test.ts`, so the new auth-storage test is part of the normal frontend suite.


## Дополнение к handoff — 2026-11-11 (AUD-379: pin editing, drafts and concurrency)

- Проверены PinGenerator hydration, description drafts, per-pin PATCH queue, title/aspect ratio edits, board/account switches and image replacement.
- Подтверждены: drafts scoped by board/pin UUID; per-pin writes serialized within component; old save completion cannot clear newer draft; revision/board fence protects save status; scheduling flushes description and waits for queued saves; saved-pin reads are cancelled on selection change.
- Image upload uses compare-and-swap against observed image_url; stale upload cleanup and old image deletion are reference-aware.
- **AUD-379-01:** backend PATCH has no expected revision/updated_at predicate. Two tabs/devices can overwrite each other's changes (last-write-wins). Design optimistic concurrency with 409 only after checking deployed schema and all writers.
- **AUD-379-02:** no dedicated DELETE /pins/:id route found. Safe deletion must coordinate schedules, generation replay refs, review queue and Storage image references; no bare DELETE.
- **AUD-379-03:** local description draft is browser-profile-only, not cross-device.
- **AUD-379-04:** unmount flush is best-effort; local draft remains unless exact save succeeds.
- **AUD-379-05:** image replacement is protected, but general pin deletion lifecycle remains incomplete.
- Added `docs/audits/AUD-379-pin-editing-drafts-and-concurrency.md` and `docs/runbooks/pin-editing-and-image-lifecycle-aud-379.md`.
- No code/runtime/SQL/test/build/CI/DB/Storage/provider changes or production operations were performed.


## Дополнение к handoff — 2026-11-11 (AUD-380: calendar schedule lifecycle)

- Audited create/cancel/retry/change-board/list routes, calendar controls, schedule snapshot, retry RPC and worker claim fencing.
- Confirmed create validates approved pin/image, time horizon, timezone, URL, exact Pinterest account and board; re-reads pin after remote board verification; persists immutable creative snapshot; duplicate schedule returns conflict. Frontend reconciles ambiguous create with exact read-only matching.
- Cancellation uses owner-scoped conditional UPDATE only from `scheduled`; worker-claimed `publishing` and published rows are not cancelled. Repeated cancellation is idempotent and image cleanup is reference-aware. Frontend reconciles ambiguous cancellation via strict absence from active list.
- Retry is gated by exact attempt identity, retry_safe, publication ledger absence, no active duplicate and account/pin checks. Migration 096 resets failed retry to now; this is resume-now, not date/time reschedule.
- Failed-board reassignment verifies exact connected account/board and is guarded by SQL RPC.
- Schedule creative is immutable snapshot; edits to source pin do not change queued publication.
- **AUD-380-01:** calendar has cancelled filter but GET /schedule excludes cancelled rows. Do not remove filter on active endpoint; add separate owner-scoped history endpoint to preserve cancellation reconciliation semantics.
- **AUD-380-02:** no atomic date/time reschedule route/UI. Current workaround cancel + create has a gap; design CAS/RPC restricted to scheduled rows and concurrency-test against worker claim.
- **AUD-380-03:** disclose immutable scheduled creative or add explicit safe update workflow.
- **AUD-380-04:** clarify retry copy means enqueue now, not restore original target time.
- Added `docs/audits/AUD-380-calendar-schedule-lifecycle-and-mutation-contract.md` and `docs/runbooks/pinterest-calendar-recovery-aud-380.md`.
- No code/SQL/tests/build/CI/DB/Storage/Pinterest/provider/payment changes or production operations performed.


## Дополнение к handoff — 2026-11-11 (AUD-381: calendar interactions and DST edge cases)

- Проверены календарные клики, распространение IANA timezone preference, publish-now formatting и преобразование локального времени в абсолютный instant.
- Подтверждено: календарь строит дни в выбранной timezone; генератор читает сохранённую timezone; publish-now берёт дату/время из одного instant; весенний DST gap отклоняется; offset вычисляется на целевую дату.
- **AUD-381-01:** повторяющееся время при осеннем DST rollback неоднозначно; helper выбирает один instant без выбора пользователя. Нужна явная политика earlier/later либо отказ с понятной ошибкой и тестами.
- **AUD-381-02:** schedule tiles в month view — неинтерактивные div внутри кликабельной ячейки дня. Клик по существующему пину всплывает до day cell и открывает генерацию вместо деталей. Исправить на keyboard-accessible button с stopPropagation и открыть schedule detail.
- **AUD-381-03:** timezone preference хранится в одном browser-local ключе и переносится между аккаунтами в одном браузере. Это приемлемо как device preference; для per-user setting нужна серверная настройка.
- Добавлены `docs/audits/AUD-381-calendar-interactions-and-dst-edge-cases.md` и `docs/runbooks/calendar-timezone-and-interaction-aud-381.md`.
- Статическая проверка исходников; тесты/build/lint/CI/browser не запускались. Production, DB, Storage, Pinterest, payments и внешние сервисы не затрагивались.


## Дополнение к handoff — 2026-11-11 (AUD-382: Pinterest account lifecycle and reconnect UX)

- Проверены PinterestCard, account-scoped boards loading, OAuth start/callback fencing, refresh lease/uncertainty handling, disconnect route и SQL lifecycle integration tests.
- Подтверждено: board response fenced request ID; needs_reauth account не загружает доски; OAuth callback защищён attempt/generation/token-version/browser binding; ambiguous refresh не повторяет старый refresh token; disconnect очищает credentials, переводит будущие queued schedules аккаунта в failed, сохраняет in-flight/published history и не затрагивает другой аккаунт; late remote success сохраняется; reconnect не активирует failed schedules автоматически.
- **AUD-382-01:** PinterestCard показывает success notice сразу после disconnect POST; последующий loadStatus проглатывает ошибку. При неудачном GET UI может оставить устаревшую строку подключённого аккаунта. Нужен немедленный локальный remove exact account ID + отдельное сообщение о неудаче refresh и regression component test.
- **AUD-382-02:** предупреждение disconnect корректно говорит, что queued posts станут failed, in-flight запрос может завершиться и OAuth grant не отзывается. После reconnect стоит явно напоминать, что failed schedules требуют ручного безопасного retry.
- **AUD-382-03:** локальный disconnect не отзывает grant в Pinterest; оставить это явно в UI и дать инструкции/ссылку на remote connected-app settings, не заявлять полное удаление разрешения.
- Добавлены `docs/audits/AUD-382-pinterest-account-lifecycle-and-reconnect-ux.md` и `docs/runbooks/pinterest-disconnect-and-reconnect-aud-382.md`.
- Только статический аудит. Тесты/build/lint/CI/browser, Pinterest API, SQL и production не запускались/не затрагивались.


## Дополнение к handoff — 2026-11-11 (AUD-381: Pinterest recovery and image retention)

- Audited account disconnect/reconnect, exact Pinterest account/board identity, immutable schedule snapshots, late remote success, image retention and fenced deletion queue.
- Confirmed disconnect lock order refresh lease → account → schedules; scheduled publish reservation locks account → schedule and checks connected credentials. Future queued rows fail on disconnect; in-flight `publishing` is retained for late-result reconciliation. A confirmed remote success after disconnect is persisted while credentials remain disconnected.
- Reconnect does not auto-resume failed schedules. Explicit retry requires exact safe attempt evidence.
- Create/worker/retry/board-change validate exact remote account and board; board reassignment is limited to eligible failed rows and guarded by SQL RPC.
- Migration 087 freezes schedule snapshots and uses FK RESTRICT for source pins. Migration 109 blocks expired external Storage deletion leases; migration 110 provides operator diagnostics.
- Migration 104 already fixed replay-only image references in both deletion claims and retention inventory (`result_pin.image_url`, even when `storage_url` is null). Added missing regression coverage:
  - `backend/test/pin-image-retention-inventory.integration.sql`: old completed replay-only image is inventoried; recent/in-progress replay-only reference suppresses candidacy.
  - `backend/test/pin-image-deletion-claims.integration.sql`: deletion claim is rejected while replay-only result_pin image reference exists.
- Added `docs/audits/AUD-381-pinterest-account-recovery-and-image-retention.md` and `docs/runbooks/pinterest-reconnect-and-image-retention-aud-381.md`.
- Tests are source-only additions and were not executed. No migration added/applied; no DB/Storage/Pinterest/provider/payment/production operation performed.


## Дополнение к handoff — 2026-11-11 (AUD-383: Pinterest disconnect UI reconciliation)

- Исправлена проблема AUD-382-01 в `frontend/src/components/settings/PinterestCard.tsx`: успешный disconnect немедленно обновляет локальный список аккаунтов на основе ответа mutation; при отсутствии массива используется удаление только выбранного account ID.
- Пересчитывается выбранный аккаунт, очищаются доски/ошибки/loading; увеличивается request generation, чтобы старый boards response не вернул данные отключённого аккаунта.
- `loadStatus` теперь возвращает boolean; ошибка follow-up GET показывается отдельно, но не отменяет подтверждённое локальное отключение.
- Логика вынесена в `pinterestAccountState.ts`; добавлены 3 теста `pinterestAccountState.test.ts` для multi-account, последнего аккаунта и server-authoritative list. Скрипт frontend test включает settings tests.
- Добавлены `docs/audits/AUD-383-pinterest-disconnect-ui-reconciliation.md` и `docs/runbooks/pinterest-disconnect-ui-recovery-aud-383.md`.
- Тесты/lint/build не запускались. Production/API/Pinterest/DB/Storage/payments не затрагивались.


## Дополнение к handoff — 2026-11-11 (AUD-384: Pinterest publish outcome classification)

- Унифицирована классификация non-2xx ответов POST /pins: `backend/pinterest.js` теперь использует `isPinterestPublishOutcomeUnknown` и для returned HTTP response, и для thrown error path.
- Исправлено расхождение, при котором неожиданные 3xx в response path считались определённым отказом, хотя общий классификатор считает неоднозначными все статусы вне явного allowlist 400/401/403/404/409/422.
- Обновлён `backend/test/pinterest-schedule.test.js`: 0, 3xx, 408, 429, 5xx и некорректный статус проверяются как ambiguous. 401/403 и прочие explicit client rejections остаются в отдельном allowlist test.
- POST /pins по-прежнему не повторяется автоматически после 429.
- Добавлены `docs/audits/AUD-384-pinterest-publish-outcome-classification.md` и `docs/runbooks/pinterest-publication-outcome-recovery-aud-384.md`.
- Тесты/lint/build не запускались; production/Pinterest API/DB/payments не затрагивались.


## Дополнение к handoff — 2026-11-11 (AUD-385: end-to-end Pinterest recovery audit)

- Проверены inventory RPC/UI, operator reconciliation service + SQL transaction, positive-only worker reconciliation, remote Pin ID fencing и failed-schedule retry authorization.
- Подтверждены проверки возраста unknown schedule/attempt, отсутствия claim, владельца, account/board/pin identity, уже сохранённого remote Pin ID, append-only operator receipt и idempotent action replay.
- Retry failed schedule допускается только при точном совпадении owner/pin/account/board, `retry_safe=true`, отсутствии publication ledger/active duplicate и наличии live image или immutable schedule snapshot.
- UI отделяет подтверждение уже найденного пина от повторной публикации и показывает target profile/User ID + сохранённый creative context.
- Уязвимость/основание для изменения SQL в проверенных путях не выявлены; код и миграции не менялись.
- Добавлены `docs/audits/AUD-385-pinterest-ambiguous-publication-recovery.md` и `docs/runbooks/pinterest-ambiguous-publication-recovery-aud-385.md`.
- SQL integration scripts не запускались, миграции не применялись к Supabase, Node tests/lint/build/CI/browser не запускались. Production/Pinterest API/payments не затрагивались.


## Дополнение к handoff — 2026-11-11 (AUD-386: Pinterest scheduler resilience)

- Проверены scheduleWorker.js, внутренний scheduler endpoint, claim heartbeat (60 секунд), stale recovery, monitor migrations 122–123, health summary и integration test contracts.
- Подтверждены durable queue в PostgreSQL, одна задача на запрос, overlap guard в процессе worker, DB claim-token fencing, bounded shutdown (20 секунд), HTTP timeout cap 15 минут против 20-минутного stale window, evidence-based recovery и terminal monitor completion fence.
- Исправлена неточность в docs/pinterest/scheduler-setup.md: теперь явно сказано, что backend обрабатывает ровно одну запись за вызов, а не «до 10».
- Добавлены docs/audits/AUD-386-pinterest-scheduler-worker-resilience.md и docs/runbooks/pinterest-scheduler-operations-aud-386.md.
- Остаточное ограничение: monitor — singleton latest-run heartbeat, не независимый OS/process heartbeat. При timeout HTTP клиента backend request может продолжаться; безопасность обеспечивают DB lease + journal/fencing, а не предположение об отмене запроса.
- Node tests/SQL integration/lint/build/CI/staging не запускались; migrations 122–123 не применялись; production worker не включался; Pinterest API/DB/payments/deploy не затрагивались.


## Дополнение к handoff — 2026-11-11 (AUD-387: cross-system backup consistency)

- Уточнена зависимость восстановления: PostgreSQL и байты Supabase Storage bucket pin-images должны входить в единый согласованный backup set; URL и строки БД не восстанавливают сами изображения.
- Зафиксирована необходимость manifest с единым consistency window/versioned object strategy, object paths/count/bytes/checksums, DB snapshot/schema/migration revision, commit SHA и retention.
- Pinterest AES-256-GCM token ciphertext требует точного active PINTEREST_TOKEN_ENCRYPTION_KEY; во время ротации также может требоваться PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS. Ключи должны быть в независимом secret vault.
- Добавлены AUD-387 и runbook с изолированным restore, финансовой сверкой и выключенными внешними side effects.
- AUD-370 остаётся актуальным: в репозитории не найден независимый backup pipeline для DB/Storage, backup alerting или evidence restore drill. Provider dashboards не проверялись; RPO/RTO неизвестны.
- Код не менялся: выбор поставщиков, создание backup, escrow и restore drill требуют инфраструктурных действий. Production не затрагивался.


## Дополнение к handoff — 2026-11-11 (AUD-388: financial restore reconciliation)

- Проверены атомарное начисление кредитов (`credit_paid_purchase` + unique purchase_id ledger), Prodamus HMAC/amount validation, атомарная активация подписок, checkout idempotency/settlement, refund reconciliation и service_role grants.
- Критичный пробел восстановления: не найден подтверждённый opening-balance snapshot на дату перехода к ledger. Текущий `users.credits_balance` — mutable snapshot; историческая сумма `credit_transactions` без начального остатка не доказывает корректность баланса.
- Legacy `adjust_credits_balance(text, integer)` остаётся service_role-only и меняет баланс без ledger row; migration 074 защищает active reservations, но не обеспечивает полноту журнала. В просмотренных публичных потоках вызова не найдено.
- Не найден автоматический financial reconciliation report/job. Для сверки необходимы provider exports Prodamus и opening balance snapshot; unknown payment requests нельзя автоматически закрывать/повторять.
- Добавлены AUD-388 и финансовый restore runbook. Код/миграции не менялись, так как без opening snapshot/provider evidence автоматический repair небезопасен.
- Supabase/Prodamus/production данные не открывались; SQL/тесты/CI/staging не запускались; балансы/платежи/подписки не менялись.


## Дополнение к handoff — 2026-11-11 (AUD-389: account deletion lifecycle)

- Повторно проверены auth/session gate, backend routes/workers, Prodamus, Pinterest disconnect/scheduler, Storage deletion claims, email outbox и RU/EN privacy notices.
- End-to-end account deletion request/worker/lifecycle state отсутствуют. `requireAuth` проверяет только JWT `token_version`; login и фоновые/платёжные процессы не имеют общего lifecycle predicate.
- Pinterest disconnect уже безопасно инвалидирует OAuth generation и очищает credentials, но не заменяет account erasure. Image retention worker не является account-wide object inventory.
- Email outbox содержит recipient/payload и FK `ON DELETE RESTRICT` на subscriptions; архивная migration 009 содержит финансовые/продуктовые каскады, но фактические production FK не проверялись.
- RU/EN privacy notice обещает удаление в течение 30 дней; репозиторий не доказывает выполнение этого срока или удаление из backup sets. Это release/legal blocker до подтверждения фактического процесса.
- Добавлены AUD-389 и безопасный runbook. Код, SQL и privacy policy не менялись: нужна согласованная lifecycle/payment settlement схема, lock-order и race tests до реализации.
- Production DB, Storage, backups, provider dashboards и user data не открывались; SQL/tests/CI/staging не запускались; никаких аккаунтов/данных не удаляли.
