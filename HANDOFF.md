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
