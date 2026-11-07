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
- Важное ограничение: добавление колонки само по себе не доказывает, что установленная SQL RPC `consume_password_reset_token` увеличивает token_version при смене пароля. Тела auth RPC отсутствуют в доступных checked-in migration paths; требуется отдельная сверка с фактической БД и тест одновременного/повторного погашения токена.

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
