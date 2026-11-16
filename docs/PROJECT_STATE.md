# PinPosy — единый паспорт проекта и план работ

> Назначение: единая точка правды для разработки. Обновлять этот файл после каждого завершённого пункта. Не считать задачу выполненной без проверяемого результата.
> Статус документа: начальная версия. Полный построчный аудит всех файлов ещё НЕ завершён.
> Дата начальной фиксации: 2026-11-16.

## 0. Правила ведения проекта

- [x] Зафиксирован репозиторий: `Diana-866/pinboard-ai`.
- [x] Зафиксирована исходная ветка: `main`.
- [x] Зафиксирован исходный commit: `1914c5c516cfa3b8a55fad9cd26d4f691a128e16`.
- [ ] Завершить полный аудит всех файлов и добавить ссылку на итоговый реестр.
- [ ] Сверить этот паспорт с фактическим кодом после каждого существенного изменения.

### Обязательные правила
1. Перед работой проверить актуальный HEAD, ветку, состояние PR и этот файл. Не полагаться на память или старые сообщения.
2. По прямому разрешению пользователя от 2026-11-16 разрешена работа непосредственно в `main`; каждое изменение должно быть небольшим, проверяемым и зафиксированным.
3. Не выполнять production SQL, destructive-команды, удаление данных/миграций, reset/rebase истории, переключение DNS или production deployment без явного согласования пользователя.
4. Не запрашивать и не публиковать секреты. Не читать и не коммитить реальные .env, токены, пароли, приватные ключи.
5. Не считать функцию готовой по наличию компонента или endpoint. Различать: реализовано в коде / тест пройден / интеграция проверена / production подтверждён.
6. Не утверждать, что тесты, сборка, сайт или внешняя интеграция проверены, если реально не запускались и нет результата.
7. Не выполнять массовые рефакторинги без необходимости. Одна небольшая задача — один понятный diff — проверка — запись результата.
8. Перед SQL-изменениями сначала определить целевую БД. По умолчанию только тестовая PIN_TRIAL; production запрещён без отдельного разрешения.
9. Не удалять и не переписывать старые аудиты, миграции, дампы и документы без обоснования и согласования.
10. При недостатке доказательств помечать «НЕ ПРОВЕРЕНО», а не додумывать.

### Статусы
- [ ] Не начато.
- [~] В процессе.
- [x] Выполнено и подтверждено.
- [!] Заблокировано / обнаружен дефект.
- [?] Требуется решение пользователя.

## 1. Что известно о продукте

PinPosy — SaaS для управления Pinterest-маркетингом: проекты, доски, создание и подготовка пинов, AI-помощь, ручное утверждение, календарь, планирование и публикация, аналитика, кредиты/тарифы и платежи, настройки аккаунта и административные функции.

### Целевые пользовательские сценарии
- [ ] Пользователь регистрируется, подтверждает почту, входит и восстанавливает доступ.
- [ ] Создаёт проект и добавляет сайт/исходные данные.
- [ ] Создаёт и управляет Pinterest-досками.
- [ ] Генерирует идеи и контент пинов с помощью AI.
- [ ] Редактирует пины и изображения.
- [ ] Отправляет материалы на ручное утверждение.
- [ ] Планирует публикации в календаре.
- [ ] Подключает Pinterest и публикует контент.
- [ ] Видит достоверную аналитику.
- [ ] Покупает кредиты/тариф, а баланс меняется корректно.
- [ ] Управляет настройками, экспортом и удалением аккаунта.

Наличие перечисленного сценария в продуктовой концепции не доказывает его полную работоспособность.

## 2. Технологический состав по репозиторию

### Frontend
- React 19, Vite, TypeScript.
- Исходники расположены в `frontend/`.
- Проверенные точки входа: `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/lib/api.ts`, `frontend/src/context/AuthContext.tsx`.
- Основные компоненты, обнаруженные в дереве: DashboardView, BoardsManager, PinGenerator, PublishingCalendar, ManualApprovalDesk, PublishPinButton, AnalyticsView, PricingView, SettingsView, PinterestCard, AdminPanel, OnboardingWizard, Sidebar, Header.
- [ ] Полностью проверить каждый frontend-файл и его связи.
- [ ] Проверить, какие экраны используют реальные API, а какие mock/demo data.
- [ ] Запустить актуальные lint/typecheck, tests и production build.

### Backend
- Node.js, Express 4.
- Основной HTTP entrypoint: `backend/index.js`.
- Важные модули, обнаруженные при выборочной проверке: `backend/supabase.js`, `backend/storage.js`, `backend/pinterest.js`, `backend/pinterestSchedule.js`, `backend/scheduleWorker.js`, `backend/scheduleCron.js`, `backend/accountDeletionWorker.js`, `backend/prodamus.js`, `backend/tariff.js`, `backend/creditPacks.js`.
- Backend использует `@supabase/supabase-js`; `pg` в просмотренном package.json не обнаружен.
- [~] Построчная проверка backend-файлов, маршрутов, middleware, сервисов и фоновых задач продолжается; полный backend-аудит не завершён.
- [x] Составить карту API endpoint → handler → сервис → таблицы/внешние API: `docs/backend-audit/09-index-api-map.md` (73 прямых Express routes, dynamic admin routes и Pinterest module routes).
- [~] Проверить авторизацию, ownership, валидацию, rate limits, ошибки и транзакции: high-risk route groups cross-checked; full handler/service/migration review continues.
- [ ] Запустить полный актуальный backend test suite.

### База данных
- SQL находится в `db/`, включая `db/migrations/`, архив и тестовые сценарии.
- В каталоге миграций обнаружено 148 файлов; это число файлов, не утверждение о применённой схеме.
- Выявлена каноническая baseline-миграция `001_baseline.sql`; файлы `002–008` помечены как исторические, `009` требует отдельной проверки и не должен автоматически применяться.
- [~] Статически проверены все 148 файлов `db/migrations`: canonical sequence 001 + 010–148; destructive DDL/DML, SECURITY DEFINER/search_path, grants/revokes, RLS, triggers and indexes reviewed; findings in `docs/backend-audit/13-sql-migration-static-review.md`. Runtime replay на PostgreSQL ещё не выполнен.
- [~] Статический обзор функций, триггеров, RLS policies, grants/revokes, индексов и ограничений для active migrations 010–148 выполнен и описан в `docs/backend-audit/13-sql-migration-static-review.md`; runtime-проверка и чистый PostgreSQL replay остаются открытыми.
- [x] Статическая сверка всех прямых backend `.rpc()` call sites и динамических RPC dispatchers завершена: generation/regeneration, Prodamus checkout/webhook settlement, credits/billing/email/auth, Pinterest refresh/OAuth/publication/scheduler/recovery, admin reconciliation/refunds, image lifecycle и account deletion. Сигнатуры/аргументы и service_role grants сопоставлены с последними active definitions; отчёт `docs/backend-audit/11-rpc-contracts.md`. Runtime PostgreSQL verification остаётся открытой.
- [ ] Проверить полный migration chain на чистой тестовой PostgreSQL.
- [ ] Сверить схему тестовой БД PIN_TRIAL с ожидаемой схемой.
- [ ] Проверить резервное копирование и реальное восстановление.

### Документация и CI
- [ ] Проверить все документы, аудиты, runbooks и планы; пометить устаревшие.
- [ ] Проверить GitHub Actions, Vercel build/deploy и другие pipeline.
- [ ] Сформировать реестр файлов с назначением, статусом, проблемами и связанными тестами.

## 3. Предварительные наблюдения — требуют дальнейшей проверки

Эти наблюдения получены при выборочном просмотре файлов на исходном commit; они не являются полным аудитом:
- `frontend/src/components/analytics/AnalyticsView.tsx` показывает недоступность аналитических данных.
- `frontend/src/components/admin/AdminPanel.tsx` использует mock-данные для части админского интерфейса.
- `frontend/src/lib/api.ts` содержит fallback на Render URL.
- `backend/supabase.js` использует Supabase SDK; переход на обычный PostgreSQL потребует адаптации слоя доступа, а не только смены connection string.
- `backend/storage.js` и публичный bucket `pin-images` требуют проверки правил доступа и модели приватности.
- `scripts/verify.sh --migrations` исправлен: применяет canonical baseline `001_baseline.sql`, затем активные numbered migrations `010+`; исторические/диагностические SQL пропускаются. Полный replay на PostgreSQL ещё не подтверждён.
- Статус CI для исходного commit ранее показывал Vercel `build-rate-limit`; актуальный статус требуется перепроверять.
- В репозитории ранее обнаружено много открытых PR. Каждый нужно сверить с актуальным main; нельзя автоматически объединять.

## 4. Инфраструктура

### Текущая конфигурация по ранее предоставленным пользователем сведениям (не live-проверка)
- [ ] Beget — регистрация домена `pinposy.com`; пользователь хочет оставить регистратора Beget.
- [ ] Vercel Hobby — frontend.
- [ ] Render Free — backend; ранее известный URL `https://pinboard-ai-backend.onrender.com`.
- [ ] Supabase Free — PostgreSQL и Storage.
- [ ] GPTunnel — AI API, usage-based.
- [ ] Prodamus — платежи, shop URL `https://pinposy.payform.ru/`.
- [ ] Pinterest API v5 — OAuth и публикации.
- [ ] Почта ранее была связана с Beget; целевой вариант — вынести почту отдельно.

Важно: перечисление — зафиксированная ранее конфигурация, а не доказательство текущего статуса аккаунтов, биллинга, доступности или production-запуска.

### Целевая инфраструктура — кандидаты, не утверждены
- Beget оставить регистратором домена.
- Независимый DNS-провайдер.
- Amvera — backend и worker (кандидат).
- MWS Managed PostgreSQL или альтернативный managed PostgreSQL (кандидат).
- Cloud.ru Object Storage (кандидат).
- Cloudflare Pages или другая подходящая платформа для frontend (кандидат).
- Отдельный почтовый провайдер.
- [ ] Проверить доступность из РФ и для международных пользователей.
- [ ] Проверить оплату российской банковской картой.
- [ ] Проверить тарифы, лимиты, SLA, backup, restore, поддержку и условия.
- [ ] Посчитать полный ежемесячный бюджет с запасом.
- [ ] Поднять staging до любых production-переключений.
- [ ] Провести репетицию миграции и rollback.
- [ ] Получить согласие пользователя на production cutover.

**Жёсткий лимит технической инфраструктуры: 4 000 ₽/месяц.** Нельзя утверждать, что целевой стек укладывается в бюджет, пока не проверены актуальные цены и необходимые ресурсы.

## 5. План разработки и запуска

### Этап 0 — техническая инвентаризация и контроль
- [x] Получить дерево репозитория на исходном commit.
- [x] Зафиксировать исходный SHA и ветку.
- [x] Выборочно открыть ключевые frontend/backend/SQL файлы.
- [~] Проведены тринадцать пакетов backend-аудита: core, auth/account lifecycle, billing/credits/Prodamus, GPTunnel/Pinterest admin recovery, Pinterest OAuth/account lifecycle, scheduler/worker, image storage lifecycle, project/board/pin/account deletion, API route map, platform primitives, RPC contracts, verification script и SQL migration static review; отчёты `docs/backend-audit/01-core-modules.md`–`13-sql-migration-static-review.md`. Полный backend/frontend/runtime migration audit ещё не завершён.
- [ ] Построчно проанализировать все исходники frontend.
- [ ] Проанализировать все миграции и SQL-тесты.
- [ ] Проанализировать тесты, скрипты, workflow и конфигурации.
- [ ] Проанализировать документацию и выявить противоречия.
- [ ] Составить полный file-by-file реестр.
- [ ] Пересмотреть все открытые PR и ветки, классифицировать: принять / исправить / закрыть / отложить.
- [ ] Подготовить окончательный технический baseline и приоритеты.

### Этап 1 — воспроизводимость проверок
- [~] Проверены `backend/package.json` и `frontend/package.json`, оба `package-lock.json` (lockfileVersion 3), scripts (`backend`: start/test/worker/cron; `frontend`: dev/build/preview/clean/lint/test) и CI runtime declarations. В четырёх workflows явно задан Node.js 22; в `.github/workflows/atomic-payment-integration.yml` добавлен pinned `actions/setup-node` v4, npm cache и backend lockfile cache key (commit `555e732b`). В текущем execution environment фактически выполнены `node --version` → `v22.16.0` и `npm --version` → `10.9.2`. Package manifests не содержат `engines`; Node/npm доступны, но это не заменяет выполнение install/test/build.
- [x] Исправить verify script: `scripts/verify.sh --migrations` запускает `001_baseline.sql`, затем только активные нумерованные миграции `010+`; диагностическая `000`, исторические `002–008` и архивные SQL не исполняются. Добавлены `backend/test/verify-script-migration-chain.test.js` и CI step. Локально проверены `bash -n` и 4 static regression tests (4/4); полноценный PostgreSQL replay не запускался: `psql` отсутствует.
- [!] Запуск backend unit/integration tests и PostgreSQL replay заблокирован на уровне GitHub Actions: последние runs на docs HEAD `137a263efc465be367d7f142a6fd11205c041275` — `43906102692` (backend/frontend) и `43906102793` (postgres-atomicity); jobs `133435231911`, `133435231990`, `133435232111` завершились `failure` с `steps: null`, `logs_url: null`. Предыдущие runs на `38b7956b` (`43906061360`, `43906061505`) дали тот же результат. Ни checkout, ни setup-node, ни тестовые команды не стартовали; это pre-step runner blocker, не результат тестирования приложения. В текущем execution environment Node/npm доступны, но `psql`, `postgres`, `docker`, `podman` и рабочая копия репозитория отсутствуют; clean disposable PostgreSQL replay и runtime suite не выполнены. Причина отказа в выделении runner не подтверждена; владелец аккаунта должен проверить Settings → Billing & Licensing → Budgets and alerts, Actions usage/лимиты и оплату, а также repository Actions permissions.
- [ ] Запустить frontend typecheck/lint/tests/build.
- [ ] Запустить migration chain на чистой тестовой PostgreSQL.
- [~] Добавлен Windows fallback `scripts/verify.ps1 -Migrations`: disposable DB, Supabase stubs, baseline + 139 active migrations, cleanup in `finally`; static contract assertions добавлены. PowerShell/PostgreSQL runtime validation ещё не выполнена. Добавлен отдельный `-MigrationsOnly`, чтобы первым пройти именно обязательный DB gate, без зависимости от Node/npm.
- [ ] Проверить CI и deploy pipeline.
- [ ] Зафиксировать все реальные ошибки и устранить блокирующие.

### Этап 2 — базовый пользовательский продукт
- [ ] Регистрация, подтверждение email, login/logout.
- [ ] Восстановление пароля и управление сессиями.
- [ ] Проекты и сайты.
- [ ] Доски и Pinterest accounts.
- [ ] Генерация контента и обработка ошибок AI.
- [ ] Изображения: загрузка, хранение, доступ и удаление.
- [ ] Редактирование пинов и ручное утверждение.
- [ ] Проверить tenant isolation и ownership для каждого endpoint.
- [ ] E2E пройти основной путь пользователя.

### Этап 3 — Pinterest и scheduler
- [ ] Проверить OAuth state/CSRF, callback и refresh tokens.
- [ ] Проверить подключение/отключение аккаунта.
- [ ] Проверить получение boards и разрешения.
- [ ] Проверить создание публикации через реальный API.
- [ ] Проверить расписание, timezone и worker.
- [ ] Проверить retry, idempotency, duplicate prevention.
- [ ] Проверить recovery после timeout/неопределённого результата.
- [ ] Проверить отмену и повторное планирование.
- [ ] Проверить журнал публикаций и реальные статусы Pinterest.

### Этап 4 — кредиты, тарифы и платежи
- [ ] Проверить ledger и атомарное изменение баланса.
- [ ] Проверить резервирование/возврат кредитов при ошибках.
- [ ] Проверить тарифы и ограничения.
- [~] Проверить Prodamus signature и webhook: статически проверены signature, amount/currency, duplicate callbacks и checkout idempotency; исправлено принятие checkout URL из не-2xx ответа. Regression CI запущен, результат ожидается; staging webhook/платёж НЕ проверен.
- [ ] Проверить повторные и некорректные вебхуки.
- [ ] Проверить соответствие заказа, суммы, валюты и пользователя.
- [ ] Провести контролируемый тестовый платёж.
- [ ] Проверить возврат/отмену и финансовую сверку.
- [ ] Проверить админские финансовые действия и аудит.

### Этап 5 — аналитика и администрирование
- [ ] Реализовать аналитику на реальных доступных данных Pinterest.
- [ ] Убрать неподтверждённые и демонстрационные показатели.
- [ ] Подключить реальные backend endpoints для админки.
- [ ] Проверить роли и запрет доступа обычных пользователей.
- [ ] Проверить журналы действий, ошибки и поддержку.
- [ ] Проверить все пользовательские состояния загрузки/ошибки/пустые данные.

### Этап 6 — безопасность, данные и юридическая готовность
- [ ] Проверить RLS и backend authorization.
- [ ] Проверить IDOR, SSRF, XSS, CSRF и загрузку файлов.
- [ ] Проверить хранение и ротацию секретов.
- [ ] Проверить rate limiting и abuse protection.
- [ ] Проверить экспорт и полное удаление аккаунта.
- [ ] Проверить каскадное удаление Storage и внешних токенов.
- [ ] Проверить privacy policy, terms и тексты согласий.
- [ ] Проверить резервное копирование и тест восстановления.
- [ ] Проверить мониторинг и оповещения.

### Этап 7 — миграция инфраструктуры
- [ ] Сравнить кандидатов по текущим ценам и ограничениям.
- [ ] Утвердить схему и смету не выше 4 000 ₽/мес.
- [ ] Создать staging окружение.
- [ ] Реализовать PostgreSQL adapter без поломки текущего Supabase окружения.
- [ ] Перенести и проверить схему/данные БД.
- [ ] Перенести Storage и проверить права доступа.
- [ ] Развернуть backend и worker.
- [ ] Развернуть frontend и проверить домен.
- [ ] Настроить независимый DNS и отдельную почту.
- [ ] Настроить TLS, секреты, backups, monitoring.
- [ ] Провести нагрузочные и отказоустойчивые проверки.
- [ ] Провести репетицию переключения и rollback.
- [ ] Выполнить production cutover только после согласия пользователя.

### Этап 8 — бета и запуск
- [ ] Подготовить тестовые аккаунты и сценарии приёмки.
- [ ] Пройти end-to-end путь от регистрации до Pinterest публикации.
- [ ] Пройти end-to-end путь покупки кредитов.
- [ ] Проверить удаление аккаунта и восстановление из backup.
- [ ] Проверить критические ошибки и мониторинг.
- [ ] Проверить бюджет и лимиты внешних API.
- [ ] Подготовить launch checklist и rollback plan.
- [ ] Получить финальное разрешение пользователя.
- [ ] Запустить production.
- [ ] Наблюдать за метриками и ошибками после запуска.

## 6. Формат записи каждой задачи

Для каждого пункта фиксировать:
- ID задачи и этап.
- Статус: не начато / в процессе / выполнено / заблокировано.
- Затронутые файлы.
- Что было изменено и почему.
- Commit SHA и PR URL.
- Команды/тесты, реально выполненные.
- Результаты проверок.
- Что осталось и кто должен выполнить действие.
- Риски и необходимость разрешения пользователя.

Не ставить [x] только за написание кода. Ставить [x] после требуемой проверки и записи доказательства.

## 7. Текущая следующая задача

**NEXT: выполнить clean disposable PostgreSQL replay канонической цепочки `001_baseline.sql` + активные миграции `010–148`, затем все SQL integration tests и backend runtime suite. Статическая сверка backend RPC call sites завершена (`docs/backend-audit/11-rpc-contracts.md`); статический review 148 migration files завершён (`docs/backend-audit/13-sql-migration-static-review.md`). Linux fallback `scripts/verify.sh --migrations-only` теперь выполняет только DB gate без Node/npm и app tests; `--migrations` добавляет replay к обычным backend/frontend checks. Replay использует явный локальный Unix socket `/var/run/postgresql` и `-p $POSTGRES_PORT` (default 5432; CLI `--postgres-port`), не наследует `PGHOST`/`PGPORT`, требует точную последовательность 010–148, генерирует имя БД из PID + случайного suffix, никогда не удаляет БД до успешного `CREATE DATABASE` и удаляет только подтверждённо созданную БД (включая cleanup trap). Windows fallback `scripts/verify.ps1 -MigrationsOnly` выполняет только DB gate без Node/npm и app tests; создаёт уникальную временную БД, применяет `db/supabase-stub.sql`, baseline и ровно 139 миграций 010–148, затем удаляет только её. Дополнительная исправленная ошибка PowerShell: stdout от внешнего `psql` раньше мог попадать в pipeline результата `Invoke-MigrationReplay` и превращать возвращаемое значение в массив, из-за чего вызывающий код мог неверно оценить success/failure. Введён `Invoke-LocalPsql`, который направляет stdout через `Out-Host` и возвращает только `$LASTEXITCODE`; все шесть вызовов (create, stubs, baseline, migrations, terminate, drop) используют числовой exit code. Добавлен static regression test на output isolation и все шесть вызовов. Commits: `2f99fd69` (PowerShell fix), `cd1f9327` (regression test). Проверены свежие GitHub-файлы и JS regex assertions: helper присутствует, ровно шесть call sites, каждый закреплён на `127.0.0.1` и `$PostgresPort`, шесть проверок exit code, прямых старых вызовов `& $psql` не осталось. PowerShell parser/runtime и PostgreSQL replay ещё не запускались. Важная safety-коррекция: все шесть вызовов `psql` явно используют `-h 127.0.0.1 -p $PostgresPort`; параметр `-PostgresPort` по умолчанию равен 5432 и ограничен диапазоном 1–65535, поэтому унаследованный `PGHOST`/`PGPORT` не выбирает endpoint. Для нестандартного локального порта его можно передать явно; перед запуском убедиться, что выбранный loopback port ведёт именно на тестовый локальный PostgreSQL. Статические assertions расширены проверкой всех шести вызовов, явного локального порта и непрерывности полного диапазона 010–148. Node tests, PowerShell parser/runtime и настоящий PostgreSQL replay НЕ запускались; в доступном execution environment нет `pwsh`, `psql`, PostgreSQL server или checkout. Linux `bash -n`, `--help`, проверка отказа на invalid port, изолированный Node contract smoke suite по Linux replay (5/5 PASS) и mock-psql сценарии выполнены: 143 вызова для успешной цепочки (create + stubs + baseline + 139 migrations + drop), endpoint всегда локальный socket/явный port даже при `PGHOST`/`PGPORT`, create failure не запускает DROP, migration failure запускает cleanup. Это проверка shell control-flow с mock psql, не доказательство применения SQL к PostgreSQL. Последние main runs на текущем HEAD `297488e47e023ab8a730d2c08f074b8aab239c1e`: `43910632389` (postgres-atomicity) и `43910632372` (backend/frontend) завершились failure до выполнения steps. У postgres job и у backend/frontend jobs `runner_id: 0`, `steps: []`; команды не стартовали. Это подтверждённый pre-step runner blocker, а не результат тестов. Windows self-hosted run `43908889550` для PR #90 остаётся queued без runner; PR #89 закрыт без merge, PR #90 остаётся открытым и использует тот же self-hosted label. Подключённый Windows runner не подтверждён. Это pre-step runner blocker, не результат тестов приложения. PR #89 закрыт без merge; PR #90 открыт и устарел относительно main (его base `0b856ae4`), не использовать как доказательство актуальной проверки. Для продолжения обязательного DB gate запустить на локальной Windows машине с локальным PostgreSQL/psql: На Windows: `powershell -ExecutionPolicy Bypass -File .\\scripts\\verify.ps1 -MigrationsOnly`; на Linux: `bash ./scripts/verify.sh --migrations-only` (для нестандартного локального socket port добавить `--postgres-port <port>`). Затем SQL integration tests и backend runtime suite. Не использовать production DB. Vercel combined status на текущем HEAD `297488e47e023ab8a730d2c08f074b8aab239c1e` — `failure`, описание `Deployment rate limited — retry in 24 hours` (`build-rate-limit`); это отдельный deployment blocker, не результат app tests. До успешного replay, SQL integration и backend runtime не помечать DB/backend готовыми. Остаточные продуктовые риски из статической оценки: AI analysis/keywords без утверждённой тарификации/резерва кредитов; `boards/generate` без durable idempotency key; Pinterest rate limiter process-local; клиентская cursor pagination ещё не реализована. После DB/runtime gate — полный frontend review, затем staging E2E. Удаление аккаунта остаётся закрыто feature gate до staging validation. Не объединять устаревшие PR без актуальной сверки diff/base. Не запускать реальные платежи и не менять production.**

## 8. Журнал изменений паспорта
- 2026-11-16 — создан первоначальный паспорт на основе дерева репозитория и выборочного чтения файлов на commit `1914c5c5`. Полный аудит не завершён.
- 2026-11-16 — по прямому разрешению пользователя правило работы только через PR заменено на работу непосредственно в `main`; добавлен первый отчёт backend-аудита. Полный backend-аудит не завершён.
- 2026-11-16 — добавлен пакет 02: просмотрены auth/account lifecycle-модули, их маршруты, 12+ тестовых/контрактных файлов и auth SQL migrations; зафиксирован startup/readiness gap при отсутствии `JWT_SECRET`. Node/PostgreSQL tests не запускались; production не изменялся. Отчёт: `docs/backend-audit/02-auth-account-lifecycle.md`.
- 2026-11-16 — пакет 03: проверены billing/credits/Prodamus, админские финансовые операции, webhook, тестовые контракты и SQL migrations. Исправлен дефект принятия checkout URL из HTTP non-2xx; 4xx release теперь требует подтверждённого закрытия pending row и RPC, прочие ошибки остаются unknown. Добавлены regression tests и CI workflow на push/PR. GitHub Actions checkout regression run #10 attempt 2 завершился failure до шагов; Node tests НЕ запускались. Vercel status = build-rate-limit. PR #88 не объединён; патч перенесён адресно в main. Отчёт: `docs/backend-audit/03-billing-credits-prodamus.md`.
- 2026-11-16 — пакет 04: проверены GPTunnel AI, website analysis SSRF controls, keyword/output validation, Pinterest admin inventory и positive-only reconciliation, связанные routes/tests и SQL migrations. В коде не подтверждён критический дефект; зафиксирована требующая продуктового решения зона тарификации legacy text routes (analysis/keywords/boards), не объявленная дефектом без утверждённой модели цен. Runtime tests и production интеграции не запускались. Отчёт: `docs/backend-audit/04-gptunnel-pinterest-admin.md`.
- 2026-11-16 — пакет 05: проверены Pinterest OAuth/account routes, browser binding, token refresh lease/uncertainty fencing, account record encryption migration, pagination, related tests and SQL. В проверенном пакете не подтверждён критический дефект; staging OAuth и PostgreSQL tests не запускались. Отчёт: `docs/backend-audit/05-pinterest-oauth-account.md`.
- 2026-11-16 — пакет 06: проверены scheduler/worker/cron, full internal scheduler route, heartbeat, claim fencing, completion monitor and remote-ID recovery contracts. В статически просмотренном пакете критический дефект не подтверждён; runtime and PostgreSQL race tests не запускались из-за CI runner blocker; production scheduler не менялся. Отчёт: `docs/backend-audit/06-pinterest-scheduler-worker.md`.
- 2026-11-16 — пакет 07: проверены Storage/image upload/rehost/delete, SSRF protections, compare-and-swap, image lifecycle fencing, quarantine, replay retention and queue SQL contracts. Критический дефект в просмотренном пакете не подтверждён; production Storage и реальные файлы не менялись, runtime tests не запускались из-за CI runner blocker. Отчёт: `docs/backend-audit/07-image-storage-lifecycle.md`.
- 2026-11-16 — пакет 08: проверены project/board/pin ownership routes and RLS, serializers/patch guards, account export/deletion worker and gate, account-deletion SQL migrations 128–147 and related tests. После baseline review обнаружена TOCTOU-гонка отклонения пина и публикации; добавлены DB triggers, lock-ordered publication reservation в migration 148, HTTP 409 mapping и unit/SQL regression tests. Workflow atomic integration обновлён: migration tail 146–148 + new SQL test. GitHub Actions runs `43896658532`/`43896658463` failed before any job step; тесты НЕ запускались. Vercel build-rate-limit. Удаление аккаунта намеренно закрыто feature gate `ACCOUNT_DELETION_WORKER_ENABLED`; staging validation required before enabling. Полный `backend/index.js` ещё не прочитан построчно. Отчёт: `docs/backend-audit/08-project-board-pin-account-deletion.md`.
- 2026-11-16 — устранён startup/readiness gap: `backend/startupConfig.js` требует JWT_SECRET не короче 32 UTF-8 bytes; `backend/index.js` прекращает запуск при отсутствующем/слабом ключе вместо ложного `/health {ok:true}`. Добавлены startup unit/boot tests и workflow step. В production env не заглядывали и ничего не меняли; перед deployment необходимо проверить, что JWT_SECRET случайный и не короче 32 bytes. CI пока не исполнил тесты (runner fails before steps).
- 2026-11-16 — пакет 09: составлена карта 73 Express routes в `backend/index.js` с middleware, service modules, tables/RPC и launch risks. Выявлены вопросы к тарификации `/projects/:id/analyze` и `/keywords`, idempotency `/projects/:id/boards/generate`, pagination project/board lists и process-local rate limits; без утверждённой модели цен не менял бизнес-логику. Дополнительно восстановлен `account_status` deletion fence в migration 148 и добавлена статическая regression assertion; уникальность migration prefixes проверена статически, диапазон db-migration-chain.test расширен до 148, atomic workflow применяет миграции 146–148 и SQL regression. Последние GitHub Actions jobs `43897165531`/`43897165503` завершились до шагов, runtime tests НЕ запускались. Отчёт: `docs/backend-audit/09-index-api-map.md`.

- 2026-11-16 — route follow-up hardening: tariff self-selection now fails closed unless NODE_ENV is explicitly development/test; admin mailbox limit/UID/reply recipient/subject/body are bounded and validated, including typed JSON values. Added unit tests and CI steps. Latest GitHub Actions runs `43897777843` and `43897777966` failed before any steps (`steps: null`); tests still NOT executed. Production env/mail credentials untouched.

- 2026-11-16 — route follow-up: tariff self-select теперь разрешён только при явном NODE_ENV development/test; admin mailbox limit/UID/reply inputs ограничены и валидируются; project/board list queries переведены на bounded fetchAllPages (500/page, cap 10k) с global board ordering; добавлен helper test и CI step. GitHub Actions runner blocker сохраняется, runtime tests НЕ подтверждены.

- 2026-11-16 — дополнительная проверка `GET /schedule`: устранён неограниченный offset loop; используется `fetchAllPages` (500 строк/страница, максимум 10 000, явный HTTP 413 при превышении). Добавлен `backend/test/schedule-route-pagination-contract.test.js`; существующий `fetch-all-pages.test.js` покрывает поведение cap/overflow. Изменения в `main`: `b52a537a`, `1aafeaaa`. Код и тест повторно прочитаны из GitHub; Node tests не запускались, Vercel check — `build-rate-limit`. Полный построчный backend-аудит остаётся в процессе.

- 2026-11-16 — admin subscription inventory page size capped to 1–500 in `billing.listAllSubscriptions`; added regression test and atomic CI step.

- 2026-11-16 — follow-up backend `GET /review-queue`: обнаружена и устранена неограниченная offset-пагинация; route использует общий `fetchAllPages` (500 строк/страница, максимум 10 000, HTTP 413 при overflow), owner filter и стабильный порядок сохранены, stale cleanup остаётся chunked по 200. Добавлен `backend/test/review-queue-pagination-contract.test.js`. Commits: `e965a3a4`, `2bebc508`. Код и тест повторно прочитаны из GitHub; workflow run для test commit не вернулся, Node tests не запускались. Production не затронут. Полный аудит продолжается.

- 2026-11-16 — follow-up backend `GET /boards/:id/pins`: устранена неограниченная offset-пагинация; после обязательной owner-проверки используется общий `fetchAllPages` (500 строк/страница, максимум 10 000, HTTP 413 при overflow), сохранены фильтр по board и стабильный порядок. Добавлен `backend/test/board-pins-pagination-contract.test.js`, проверяющий owner-check и bounded pager. Commits: `e96eb1d9`, `b22a0f18`. Код и тест повторно прочитаны из GitHub; runtime Node tests не запускались, production не затронут. Полный аудит `backend/index.js` продолжается.

- 2026-11-16 — пакет 10: reviewed platform primitives (dbErrors, email locales, fatal handlers, Pinterest rate limit, safeLogger, Supabase config, tariff) and tests; report docs/backend-audit/10-platform-primitives.md.
- 2026-11-16 — route inventory complete: 73 direct routes + dynamic admin/Pinterest routes mapped in report 09. High-risk handler groups cross-checked; full backend helper/migration audit remains in progress.
- 2026-11-16 — GET /boards/:id/pins now uses owner-checked bounded pagination (500/page, cap 10k, 413 overflow); contract test added. CI runs 43899467019/43899467236 failed without steps; runs 43899474201/43899474181 queued at last check. No runtime test result.

- 2026-11-16 — follow-up service `backend/admin.js:getStats`: неограниченная пагинация таблиц `users` и `credit_transactions` заменена общим `fetchAllPages` (500/page, ceiling 100 000 на таблицу, HTTP 413 при overflow); полная агрегация сохраняется в пределах ceiling, вместо неограниченного роста памяти/тихого усечения. Добавлен overflow regression в `backend/test/admin-stats.test.js`; существующие тесты проверяют многостраничную агрегацию. Commits: `31a2cfc0`, `9ab2a3bb`. Код и тест повторно прочитаны из GitHub; Node tests не запускались. Для дальнейшего масштаба предпочтителен SQL aggregate/RPC. Полный аудит продолжается.

- 2026-11-16 — CI follow-up: повторно запущены failed jobs runs `43899474201` (frontend/backend) и `43899474181` (postgres-atomicity); повторные attempts снова завершились `failure` с `steps: null`, job logs недоступны (404). Это подтверждает, что runtime tests/build не исполнялись; нельзя считать проверки пройденными. Production не затронут.

- 2026-11-16 — migration replay guard: `scripts/verify.sh --migrations` ограничен канонической последовательностью `001_baseline.sql` + активные numbered migrations `010–148`; диагностическая `000`, исторические `002–008` и архив исключены. Исправлено имя scratch DB на `pinposy_verify_$$`. Добавлен `backend/test/verify-script-migration-chain.test.js` и CI step. В тесте обнаружено неверное экранирование regex для буквальных `$$`; исправлено в commit `1251bc7d`. Проверка на scratch-копии исходников: `bash -n` PASS, Node static regression tests 4/4 PASS. Полный PostgreSQL replay не выполнен (`psql` отсутствует); GitHub runs `43900302581`/`43900302521` завершились failure без steps/logs. Commits: `628b7a88`, `c08e0846`, `5e9e7493`, `89245010`, `1251bc7d`. Production DB не затронута.

- 2026-11-16 — пакет 11: reviewed scripts/verify.sh, verify.ps1, package scripts, canonical migration layout and Supabase test stubs. Fixed migration replay to run 001_baseline.sql then active numbered migrations 010–148 only; diagnostic/historical/archive SQL is skipped. Added static contract test and CI step. Local bash -n and static Node regression tests passed 4/4 on a scratch copy; PostgreSQL replay NOT run because psql is unavailable. Report: docs/backend-audit/12-verification-script-migration-replay.md.
- 2026-11-16 — CI latest observation: run 43900456494 failed before steps (backend/frontend jobs steps:null); run 43900456706 was in progress. Vercel on HEAD b3fd298c returned failure/build-rate-limit. No runtime tests/build claimed.

- 2026-11-16 — latest CI after state normalization: runs 43900630253 (postgres-atomicity) and 43900630322 (backend/frontend) failed with steps:null. No CI commands ran; local bash -n and migration replay static Node test 4/4 PASS only. PostgreSQL migration replay still NOT RUN (psql unavailable).

- 2026-11-16 — focused SQL/RPC reconciliation: сопоставлены high-risk RPC calls с актуальными definitions/grants для credits/billing/email/auth, Pinterest refresh/OAuth/publication/scheduler, admin refund/reconciliation и account deletion. Аргументы проверенных вызовов совпадают с последними миграциями; отчёт `docs/backend-audit/11-rpc-contracts.md`. Полный аудит всех RPC/миграций остаётся открытым.
- 2026-11-16 — migration 148 SQL integration fixture extended: after claiming a due schedule, test passes its live claim token to `begin_scheduled_pinterest_publish`, asserts publication reservation starts, then verifies pin rejection remains fenced. Added Node contract assertion. Commits: `d00054f9`, `0b35143e`. Files re-fetched from GitHub; SQL integration/runtime tests NOT run. GitHub runs `43900969743`/`43900969875` failed before steps (`steps: null`); no runtime result.

- 2026-11-16 — canonical migration inventory rechecked from GitHub recursive tree: 148 SQL files in `db/migrations`; `001_baseline.sql` present; active numbered sequence 010–148 has no missing or duplicate prefixes; 000 is diagnostic and 009 is not in the active directory. Legacy 002–008 files each carry the explicit non-canonical marker. This verifies repository naming/layout only, not SQL execution or applied production schema.
- 2026-11-16 — latest GitHub Actions runs `43901266207` (postgres-atomicity) and `43901266259` (backend/frontend) again failed before steps (`steps: null`); no runtime tests executed. Vercel remains `build-rate-limit`.

- 2026-11-16 — project analysis race fix: `POST /projects/:id/analyze` now conditionally updates by owner, project ID and exact analyzed `website_url`; if the URL changed during the AI call, it returns HTTP 409 instead of attaching stale niche/summary to the new site. Added `backend/test/project-analysis-url-fencing.test.js`. Commits: `8c68f450`, `db3da312`. Route/test re-fetched from GitHub; runtime test NOT executed. No production services/data touched.

- 2026-11-16 — SQL migration static review report appeared in main as `docs/backend-audit/13-sql-migration-static-review.md` (commit `5d9f602b`). It covers all 148 migration files, including active 010–148, archived 009 and the read-only preflight report; static review notes SECURITY DEFINER/search_path, grants, RLS, destructive operations and account-deletion guards. Checklist updated to partial/static complete; PostgreSQL replay and runtime integration remain open.
- 2026-11-16 — latest Actions runs `43901694068` (backend/frontend) and `43901694368` (postgres-atomicity), plus `43901653629`/`43901653004`, all expose `steps: null`; no workflow command ran. Check Actions billing/budget and account/repository restrictions before treating this as a code failure. Community reports show similar pre-step failures in other private repos, but they do not establish this repository's cause.
- 2026-11-16 — project analysis stale-URL race fixed and recorded in `docs/backend-audit/09-index-api-map.md`; compare-and-swap only writes analysis if `website_url` still matches the fetched value, otherwise returns 409. Commits `8c68f450`, `db3da312`, audit doc `aa1d952d`, state `38cd7336`. Static route/test source re-fetched; runtime test not run.

- 2026-11-16 — SQL migration static review package 13: all 148 files classified; active 010–148 scanned for SECURITY DEFINER/search_path, grants/revokes, RLS, destructive DDL/DML. Archived 009 confirmed destructive and incompatible with canonical baseline; preflight report is read-only. Report: docs/backend-audit/13-sql-migration-static-review.md.
- 2026-11-16 — report numbering normalized: RPC contracts = 11, verification script/migration replay = 12, SQL migration static review = 13. No duplicate report numbers remain.
- 2026-11-16 — latest CI runs 43901843862/43901843887 failed with steps:null; no runtime tests, PostgreSQL replay or frontend build executed.

- 2026-11-16 — полный статический backend RPC call-site ↔ SQL signature/grant reconciliation завершён: повторно просканированы прямые `.rpc(` вызовы и dynamic dispatchers; охвачены billing/payment creation, pin generation/regeneration, Pinterest OAuth/publication/scheduler, image lifecycle, admin reconciliation и account deletion. Обновлён `docs/backend-audit/11-rpc-contracts.md`. Найден и исправлен `ReferenceError` в `backend/paymentCreationIdempotency.js:failPaymentCreation` (RPC response `data` не был деструктурирован); regression test добавлен в `backend/test/payment-creation-idempotency.test.js`. Commits: `90c06e24`, `a408d94d`, `340b98a2`, `f14fa644`. Проверены актуальные файлы из `main`; runtime Node/PostgreSQL tests НЕ запускались. Runs `43901843862` и `43901843887` подтверждены через GitHub Jobs API: jobs завершились `failure`, `steps: null`, logs отсутствуют. Следующий шаг — чистый disposable PostgreSQL replay + SQL integration suite; runner blocker не решён. Production не затронут.

- 2026-11-16 — full backend RPC call-site ↔ SQL signature pass: direct `.rpc()` calls and dynamic dispatchers were inventoried across backend runtime modules. Generation/regeneration (014, 044–071, 121), payment idempotency (116–118), Pinterest OAuth/refresh/publication/schedule/recovery (028–126, 148), image lifecycle (070, 083, 089, 099–110, 135, 145), admin refund/reconciliation (073, 077–084), credits/billing/auth and account deletion (010–147) signatures/argument shapes and service_role grants were reconciled. Report 11 expanded and completed at `docs/backend-audit/11-rpc-contracts.md` (commits `f14fa644`, `6b2db5f0`). Runtime SQL not executed.
- 2026-11-16 — fixed `failPaymentCreation` runtime bug: the helper used `data` without destructuring it from the `fail_payment_creation_request` RPC result. Successful provider-rejection cleanup therefore threw ReferenceError and could incorrectly keep the checkout request in `unknown`. Now captures `{ data, error }` and returns true only for confirmed SQL transition. Added `backend/test/payment-creation-idempotency.test.js` for true/false results. Commits `90c06e24`, `a408d94d`. Source/test re-fetched from GitHub; Node test not run because Actions jobs fail before steps.
- 2026-11-16 — latest Actions run checks: `43903134483` (backend/frontend) and `43903134338` (postgres-atomicity) still fail with `steps: null`; same for recent retries listed in NEXT. Container has Node v22.16.0 but no `psql`, `postgres` or `docker`. Vercel status on code commit `90c06e24` was success; latest docs commit `6b2db5f0` status is failure due build-rate-limit. No production DB/payments changed.

- 2026-11-16 — CI unblock diagnosis: current main runs `43903134483` (backend/frontend) and `43903134338` (postgres-atomicity) still have `steps: null`; repeated runs also fail before steps. GitHub's current billing docs state that an exhausted Actions budget with hard stop blocks all GitHub-hosted runners, and an overdue payment can lock Actions. This is a possible explanation only; account billing state is not visible to the repo connector. Owner action: check GitHub Settings → Billing & Licensing → Budgets and alerts, Actions usage, payment status, and repository Actions permissions. Sources: GitHub Docs, budget hard-stop behavior and locked-account troubleshooting.

- 2026-11-16 — сверены backend/frontend package scripts и lockfiles (оба lockfileVersion 3), CI Node version declarations. Установлено, что atomic PostgreSQL workflow не задавал Node.js; добавлен pinned setup-node v4 Node 22 + npm cache (`555e732b`). Package manifests не содержат `engines`; фактические локальные Node/npm версии и runtime test suite не запускались. Проверка обновлённого workflow повторным чтением GitHub PASS; это статическая проверка конфигурации, не запуск workflow.

- 2026-11-16 — после исправления Node runtime declaration PostgreSQL workflow был автоматически запущен, но run `43903477746` и повторный run `43903504581` завершились failure до шагов; backend/frontend `43903504583` также failure. Jobs API подтверждает `steps: null`, logs отсутствуют. Это подтверждает внешнюю блокировку GitHub-hosted runner до исполнения workflow; Node setup change сам по себе не позволил начать проверки. Никаких SQL migrations/tests фактически не выполнялось; production не затронут. Требуется действие владельца GitHub account по billing/budget/payment и repository Actions permissions.

- 2026-11-16 — проверен новый HEAD `00d881d231c0eb721f9a0e8515e2cd4b8ab70082` и связанные Actions runs: `43903589167` (postgres-atomicity), `43903589074` (frontend/backend) завершились failure. Jobs API: `133426373188`, `133426374822`, `133426375508` — `steps: null`, `logs_url: null`. Повторное чтение `.github/workflows/atomic-payment-integration.yml` подтверждает, что Node 22 setup и другие шаги корректно записаны, но runner до них не доходит. PostgreSQL replay и unit/frontend tests не запускались. Внешний pre-run blocker остаётся; продолжение этапа требует восстановления GitHub Actions execution у владельца аккаунта. Никаких изменений приложения/production в этой итерации.

- 2026-11-16 — повторная сверка main: HEAD продвинулся до `f4fd3e0ad0bae13ab81e27f45c12e524810d22e8` (добавлен `frontend/src/lib/adminPanelDataSafety.test.ts`, который проверяет отсутствие demo users/transactions и ограничивает admin sections backend-connected components). Свежие Actions runs `43903739185` и `43903739111` завершились failure; jobs `133426896601`, `133426897147`, `133426897514` имеют `steps: null`, `logs_url: null`, то есть ни один шаг/тест не исполнялся. Среда текущего сеанса: Node v22.16.0 и npm 10.9.2 доступны, но `psql`, `postgres`, `docker`, `podman` и рабочая копия репозитория отсутствуют; clean disposable PostgreSQL replay выполнить здесь нельзя. NEXT остаётся DB replay + SQL integration/backend runtime suite; не перескакивать к frontend review и не отмечать проверки пройденными. Для продолжения требуется восстановить GitHub Actions runner execution (проверить account billing/budget/payment и repo Actions permissions) либо предоставить среду с disposable PostgreSQL. Production не затронут.

- 2026-11-16 — сверены изменения `main` после предыдущей записи: HEAD `4b021619983a86230101cdc6903f26137de35f95`, единственный новый коммит `fix(frontend): type admin navigation icons explicitly` (`AdminPanel.tsx` использует `LucideIcon` вместо `React.ElementType`). Повторно прочитаны `AdminPanel.tsx` и `frontend/package.json`; admin panel не содержит mock users/transactions и явно скрывает неподключённые источники (есть safety contract test в commit `f4fd3e0a`). На HEAD появились runs `43903880794`/`43903880595`; Jobs API подтверждает `steps: null` и отсутствие logs. Фактически выполнены только проверки окружения `node --version` = `v22.16.0`, `npm --version` = `10.9.2`; `psql`, `postgres`, `docker`, `podman` и локальный checkout отсутствуют. Тесты и PostgreSQL replay НЕ запускались. Обновлены сведения о runtime и CI blocker; никаких чекбоксов runtime/DB не закрыто, production не затронут.

- 2026-11-16 — повторно сверены `main`, `docs/PROJECT_STATE.md`, последние Actions runs и открытые PR. HEAD до записи — `955d3ba7ecfe00621a378d3c0fb62dabef412b04`. На нём оба workflow run `43904016837` (backend/frontend) и `43904016872` (PostgreSQL atomicity) завершились failure; jobs `133427878070`, `133427878496`, `133427888337` не содержат steps/logs. Для диагностики повторно запущен только PostgreSQL job; attempt 2, job `133428323878`, снова завершился failure с `steps: null`, `logs_url: null`. Получить job logs невозможно (GitHub API вернул 404 BlobNotFound). В открытых PR обнаружены #8 (обновление setup-node до v7.1.0) и #9 (checkout до v7.0.1); просмотрены patches: это только обновления версий Actions, не доказанное исправление pre-step runner failure; не объединять без CI-подтверждения. PostgreSQL replay, backend/frontend tests и build не запускались. NEXT по плану остаётся clean disposable PostgreSQL replay + SQL integration/backend runtime suite; этап не закрыт. Production не затронут.

- 2026-11-16 — повторно сверены актуальные `main`, паспорт, workflow YAML и Actions jobs. HEAD до записи `ee618e1d4df55cbb8d2f5e9d0c2375aaebe244d9`. На нём runs `43904202622` (PostgreSQL atomicity) и `43904202709` (frontend/backend) завершились failure; Jobs API вернул jobs `133428536587`, `133428535870`, `133428536481` с `runner_id: 0`, пустым `runner_name`, `steps: []` и временем выполнения 1–2 секунды. Это подтверждает, что ни checkout, ни setup-node, ни тестовые команды не выполнялись; приложение не было протестировано. Повторные workflow failures продолжаются. PostgreSQL replay, backend/frontend tests и build НЕ запускались; NEXT не меняется — clean disposable PostgreSQL replay, затем SQL integration/backend runtime suite. Не переходить к последующим этапам до снятия блокера. Production не затронут.

- 2026-11-16 — после предыдущей записи проверены новые main runs `43904344042` (frontend/backend) и `43904344051` (postgres-atomicity) на HEAD `2d3a42029f673e058fca6768406ed612ea4387a8`. Jobs `133429034774` (frontend), `133429035231` (backend), `133429035038` (postgres-atomicity) все завершились failure за 2 секунды; у всех `runner_id: 0`, `runner_name: ""`, `steps: []`. Повторное подтверждение: runner не выделяется, ни один тестовый шаг не стартовал. Повторно запускать те же workflows без изменения внешних настроек нецелесообразно. PostgreSQL replay и runtime tests не выполнены; следующий пункт плана остаётся заблокированным на восстановлении GitHub Actions runner. Исходники приложения не менялись, production не затронут.

- 2026-11-16 — проверены последние main runs после commit `d015694ba011636ed5766a7408285df9e489c7b0`: `43904445998` (frontend/backend) и `43904445864` (postgres-atomicity). Jobs `133429398993` (frontend), `133429399421` (backend), `133429401206` (postgres-atomicity) снова завершились за 1–2 секунды с `runner_id: 0`, пустым `runner_name` и `steps: []`. Ни checkout, ни установка зависимостей, ни проверки не стартовали. Проблема выделения runner остаётся неустранённой; PostgreSQL replay, SQL integration, backend/frontend runtime tests и build не запускались. Этап 1 остаётся заблокированным; исходники не изменялись, production не затронут. Для этой записи используется `[skip ci]`, чтобы не запускать заведомо неисполняемые workflows повторно.


- 2026-11-16 — диагностический повторный запуск Actions: повторно запущены failed jobs runs `43904445864` (postgres-atomicity) и `43904445998` (frontend/backend), attempt 2. PostgreSQL job `133434413198` завершился failure без runner/steps/logs; backend `133434440278` и frontend `133434440838` также завершились failure без steps/logs. Значит, повторный запуск не восстановил runner execution; миграции, SQL integration, backend/frontend tests и build не стартовали. Это внешний pre-step blocker, не результат проверки кода. Локально проверено: Node `v22.16.0`, npm `10.9.2`; `psql`, `postgres`, Docker, Podman отсутствуют; GitHub недоступен из контейнера напрямую (DNS lookup failed), поэтому локальный checkout не получен. Не менялись исходники и production; чекбоксы не закрыты. NEXT остаётся clean disposable PostgreSQL replay → SQL integration → backend runtime suite после восстановления runner или предоставления disposable PostgreSQL-среды.

- 2026-11-16 — NEXT синхронизирован с последней проверкой main: зафиксированы актуальные retry run/job IDs `43904445864`/`43904445998`, отсутствие `steps` и logs, недоступность локального PostgreSQL/контейнерного runtime и неподтверждённая причина runner blocker. Дополнительно перепроверен Vercel status на docs HEAD `9fdc145e`: SUCCESS; это не заменяет staging E2E/production validation. Изменён только `docs/PROJECT_STATE.md`; runtime tests и PostgreSQL replay не выполнялись, чекбоксы не менялись. Следующий технический шаг остаётся заблокированным clean disposable PostgreSQL replay → SQL integration → backend runtime suite до восстановления Actions runner либо появления изолированной PostgreSQL-среды.

- 2026-11-16 — повторно проверены новые Actions runs, автоматически созданные после docs commits: на HEAD `137a263e` runs `43906102692` (backend/frontend) и `43906102793` (postgres-atomicity), jobs `133435231911`, `133435231990`, `133435232111`; на `38b7956b` runs `43906061360` и `43906061505`. Все соответствующие jobs завершились failure без steps/logs, то есть runner execution по-прежнему не начался. Combined status текущего HEAD показывает Vercel `failure` с `build-rate-limit`; ранее зафиксированный Vercel success относился к более старому HEAD `9fdc145e`. Обновлены NEXT и блокер Этапа 1; изменён только `docs/PROJECT_STATE.md`, runtime/SQL tests не запускались, чекбоксы не менялись. Следующий пункт остаётся clean disposable PostgreSQL replay → SQL integration → backend runtime suite после восстановления runner или предоставления изолированной PostgreSQL-среды. Для записи использован `[skip ci]`, чтобы не создавать лишние автоматические workflow runs.

- 2026-11-16 — после обновления паспорта повторно проверен combined status уже на текущем HEAD `a40f126ba5d3992927fde6262f7a669c6b39c156`: Vercel по-прежнему FAILURE с `build-rate-limit`. На этом HEAD новых GitHub Actions runs нет (документальный commit помечен `[skip ci]`); последние execution attempts остаются runs `43906102692`/`43906102793` с jobs без steps/logs. Изменена только точность привязки Vercel blocker к текущему HEAD; код и чекбоксы не менялись, PostgreSQL/runtime проверки не выполнялись.

- 2026-11-16 — свежая сверка `main`: HEAD до этой записи `b503d492ea11ace4e2cdbf2b5a681a99b5f8c17d`, `PROJECT_STATE.md` перечитан. Последние Actions runs остаются `43906102692` и `43906102793` (jobs `133435231911`, `133435231990`, `133435232111`), все без steps/logs; новых запусков нет. Подтверждено, что подключённый GitHub-аккаунт `Diana-866` имеет `admin` permission в репозитории, но это не подтверждает account-level Actions billing/runner availability. Combined status текущего HEAD показывает Vercel `failure` с `build-rate-limit`. Обновлена только привязка Vercel blocker к текущему HEAD и журнал; код, SQL и чекбоксы не менялись, PostgreSQL replay и runtime tests не запускались.


- 2026-11-16 — следующий шаг разблокировки migration replay подготовлен для Windows: `scripts/verify.ps1` получил параметр `-Migrations`, проверку точной непрерывной последовательности 010–148 (139 файлов; пропуски и версии вне диапазона отклоняются), уникальное имя disposable DB, применение `db/supabase-stub.sql` → `001_baseline.sql` → 010–148 и cleanup в `finally`; production DB не используется. Расширен `backend/test/verify-script-migration-chain.test.js` статическими контрактами Windows replay. Commits: `0571bb5b` (PowerShell replay), `8f41105b` (static tests). Код и тест повторно прочитаны из GitHub; PowerShell parser/runtime, Node test suite и PostgreSQL replay НЕ запускались: текущий контейнер Linux без `pwsh`, `psql`, PostgreSQL server и checkout. На main HEAD `8f41105b` runs `43907651205`/`43907651192` снова завершились до шагов (`runner_id: 0`, `steps: []`). PR #89 с Windows self-hosted workflow открыт, но run `43907670062` queued без выделенного runner (`runner_id=null`); PR не объединён. Vercel на HEAD `8f41105b` — `build-rate-limit`. NEXT остаётся clean disposable PostgreSQL replay → SQL integration → backend runtime suite; использовать `powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1 -Migrations` на Windows с Node 22+, npm, локальным PostgreSQL и psql, только на disposable DB. Чекбоксы runtime не закрыты; production не затронут. Для документального коммита используется `[skip ci]`.


- 2026-11-16 — улучшен порядок обязательной проверки: найдено, что прежний Windows `-Migrations` запускал backend/frontend проверки до migration replay, хотя паспорт требует сначала пройти DB gate. Добавлен `-MigrationsOnly`: выполняет только clean disposable PostgreSQL replay, не требует Node.js/npm и не затрагивает application test suites; `-Migrations` по-прежнему выполняет полный набор. Добавлены статические Node assertions на switch, запуск replay и отсутствие Node/npm gate в migrations-only режиме. Commits: `d6c2b167` (script), `33482aa7` (tests). Проверено повторным чтением актуальных GitHub файлов и статическими content assertions; Node tests и PowerShell/PostgreSQL runtime всё ещё НЕ запускались. NEXT без изменения: выполнить `powershell -ExecutionPolicy Bypass -File .\\scripts\\verify.ps1 -MigrationsOnly` на локальном Windows с локальным PostgreSQL/psql, затем SQL integration tests и backend runtime suite. GitHub Linux jobs продолжают завершаться до steps; PR #89 self-hosted run остаётся queued без runner. Production не затронут.


- 2026-11-16 — safety review Windows migration replay обнаружил, что PowerShell использовал psql без явного host и мог унаследовать удалённый `PGHOST`; это противоречит требованию запускать replay только на локальной disposable PostgreSQL. Все шесть вызовов psql (создание, stubs, baseline, migrations, terminate sessions, drop DB) теперь принудительно используют `-h 127.0.0.1`. Добавлена static regression assertion, проверяющая все 6 вызовов. Commits: `bcb30510` (loopback host), `42f50ec0`/`02751402` (tests). Повторно прочитаны файлы из GitHub; проверки содержимого подтвердят изменение, но Node tests/PowerShell/PostgreSQL runtime НЕ запускались. NEXT остаётся DB replay: `powershell -ExecutionPolicy Bypass -File .\\scripts\\verify.ps1 -MigrationsOnly` на Windows с локальным PostgreSQL и psql. Loopback host уменьшает риск случайного удалённого подключения, но пользователь должен убедиться, что локальный PostgreSQL instance/port является тестовым; production запрещён. Чекбоксы runtime не закрыты.

- 2026-11-16 — после loopback-only safeguard проверены свежие CI jobs `43908003575` (frontend/backend) и `43908003573` (postgres-atomicity): все три jobs завершились `failure` с `runner_id: 0` и `steps: []`, тестовые команды не стартовали. Combined status HEAD `5cee0db6` показывает Vercel `failure` / `build-rate-limit` / retry in 24 hours. Эти статусы внесены в NEXT; никакие runtime tests не объявлены пройденными.

- 2026-11-16 — дополнительная проверка корректности миграционного gate: простой подсчёт 139 файлов мог бы пропустить комбинацию пропущенной миграции и лишней миграции с номером выше 148. `scripts/verify.ps1` теперь сравнивает фактическую последовательность префиксов с точным непрерывным диапазоном `010..148` и отказывает при любом пропуске, дубликате/неожиданной версии или несовпадении порядка. Добавлен static regression contract на границы и сравнение последовательностей. Commits: `534a7fa8` (script), `0b856ae4` (test). Файлы записаны в main; runtime PowerShell/PostgreSQL и Node tests не запускались. DB gate остаётся открытым; следующий этап не меняется.

- 2026-11-16 — после commit `0b856ae4` перепроверены main push runs `43908476585` (frontend/backend) и `43908476522` (postgres-atomicity): три jobs завершились `failure` с `runner_id: 0`, `steps: []`; проверки приложения не стартовали. Свежий Windows self-hosted run `43908487671` относится к PR #90 и остаётся queued без runner; PR #89/#90 не объединены и не дают фактической проверки. Combined Vercel status на текущем main HEAD `b4278a37` остаётся `failure` с причиной `Deployment rate limited — retry in 24 hours`. Обновлены только CI/deploy сведения паспорта; DB/runtime этап остаётся открытым.

- 2026-11-16 — дополнительное hardening loopback DB gate: одного `-h 127.0.0.1` недостаточно, потому что libpq/psql мог унаследовать `PGPORT` и попасть на неожиданный локальный forwarded port. Добавлен параметр `-PostgresPort` с default `5432` и ValidateRange 1–65535; все шесть вызовов psql передают `-p $PostgresPort`, что переопределяет PGPORT. Regression test требует explicit host + port во всех шести вызовах и проверяет параметр. Commits: `3a50c7d6` (script), `c9f7f3ff` (test). Node tests/PowerShell/PostgreSQL runtime не запускались. DB gate остаётся открытым; на нестандартном порту запускать с `-PostgresPort <port>` после проверки, что это локальная тестовая БД. Проверены PR #90 и его workflow: PR base отстаёт от main, Windows job queued без runner, Linux jobs failure с runner_id 0/steps []; PR не объединять.

- 2026-11-16 — после добавления явного `-PostgresPort` проверены main CI runs `43908796339` и `43908796413`: frontend/backend и postgres-atomicity jobs завершились failure до первого шага (`runner_id: 0`, `steps: []`), поэтому это инфраструктурный runner failure, а не красные тесты. Combined Vercel status HEAD `2a6b42c7` всё ещё `Deployment rate limited — retry in 24 hours`. Статические проверки актуальных GitHub файлов прошли 7/7; Node/PowerShell/PostgreSQL runtime не запускались.

- 2026-11-16 — safety review Linux fallback обнаружил два риска: `psql` наследовал `PGHOST`/`PGPORT`, а replay сначала выполнял `DROP DATABASE IF EXISTS` для имени только из PID, то есть теоретически мог удалить существующую БД при коллизии. `scripts/verify.sh` теперь подключается только через `/var/run/postgresql` с явным портом, проверяет точный непрерывный диапазон 010–148, создаёт DB с PID + случайным suffix и никогда не делает предварительный DROP; удаление разрешено только после успешного CREATE и повторяется в EXIT cleanup. Добавлен `--migrations-only` и `--postgres-port`; contract tests покрывают эти условия. Проверки: `bash -n` PASS; `--help` PASS; invalid port exit 2; mock-psql replay PASS (143 вызова); create-failure no-DROP PASS; migration-failure cleanup PASS; custom port overrides PGPORT PASS; missing migration and unexpected 149 both rejected before CREATE PASS. Настоящий PostgreSQL replay и Node test suite не запускались, поскольку `psql`/server и checkout недоступны. Commits: `6680dc4e` (Linux replay hardening), `b50fa72f` (fallback documentation), `f7a89d5c` (contract tests), `6243cff1` (port bounds), `8f447094`/`1f3e9a26`/`4e40cfd6` (contract assertions). DB gate остаётся открытым.

- 2026-11-16 — повторная проверка Linux fallback на актуальном main: mock-psql сценарии дополнены custom port (`5433` несмотря на `PGPORT=6543`), пропуском миграции `075` и неожиданной `149`; нестандартный порт передаётся явно, а gap/out-of-range отклоняются до первого вызова psql/CREATE. Исправлено несовпадение regex в contract test для двойного `$` в fallback PID (`4e40cfd6`). Последние main CI runs `43909673270` (backend/frontend) и `43909673122` (postgres-atomicity) снова failure до шагов (`runner_id: 0`, `steps: []`); Vercel status HEAD `4e40cfd6` остаётся rate-limited. DB gate открыт.

- 2026-11-16 — запущен изолированный Node.js v22 contract smoke suite (5/5 PASS) для Linux replay assertions из `backend/test/verify-script-migration-chain.test.js`; это не запуск полного backend Node test suite. Bash syntax/CLI и mock-psql control-flow проверки остаются PASS; настоящий PostgreSQL replay всё ещё не выполнен.

- 2026-11-16 — перепроверен актуальный `main` (`715c0006baad0f766f843c6faac2675a0cd840ee`): GitHub Actions runs `43909673270`/`43909673122` по-прежнему failed до выполнения steps; у двух jobs run `43909673270` `runner_id: 0`, `steps: []`. Combined Vercel status именно на текущем HEAD `715c0006` — `failure`, `Deployment rate limited — retry in 24 hours`. Обновлены только актуальные CI/deploy сведения в NEXT и журнале. `scripts/verify.ps1`, `scripts/verify.sh` и contract test повторно сверены; новых дефектов, позволяющих безопасно заменить обязательный PostgreSQL replay статическими проверками, не обнаружено. Ни один runtime gate не закрыт; реальный replay требует локальной disposable PostgreSQL на машине пользователя. Production не затронут.

- 2026-11-16 — исправлен подтверждённый дефект Windows replay: stdout внешнего `psql` мог попадать в success pipeline PowerShell-функции и искажать bool-результат. Все шесть psql операций переведены на `Invoke-LocalPsql`, который выводит stdout через `Out-Host` и возвращает только `$LASTEXITCODE`; каждый вызов проверяет exit code. Добавлен regression contract test. Commits `2f99fd69` и `cd1f9327`. Повторно загруженные GitHub-файлы прошли JS regex/content assertions: helper есть, 6 call sites, loopback host/port сохранены, 6 exit-code checks, прямые psql вызовы удалены. Это статическая проверка, не Node test suite и не PowerShell runtime; `pwsh` и PostgreSQL replay не запускались. Новые CI runs `43910553533` и `43910553529` снова не получили runner (`runner_id: 0`, `steps: []`). Vercel на HEAD `cd1f9327` — rate-limited. DB gate остаётся открытым; production не затронут.

- 2026-11-16 — повторно сверены актуальный `main` (`297488e47e023ab8a730d2c08f074b8aab239c1e`), паспорт и verification scripts. Новые CI runs `43910632389` (postgres-atomicity) и `43910632372` (backend/frontend) завершились до steps; все три jobs имеют `runner_id: 0`, `steps: []`. Это не тестовый результат и не позволяет перейти к SQL/backend runtime gate. Vercel status на этом же HEAD — `failure`, `Deployment rate limited — retry in 24 hours`. Изменены только актуальные номера CI runs и SHA Vercel в NEXT; runtime-чекбоксы не закрывались. Вывода локального `verify.ps1 -MigrationsOnly` от пользователя в переписке нет, поэтому clean PostgreSQL replay остаётся непроверенным. Открытые PR повторно просмотрены: #90 и остальные старые PR имеют base SHA, отстающий от актуального main; ничего не объединялось. Следующее необходимое действие по паспорту — получить реальный результат Windows replay на локальной disposable PostgreSQL; production не затронут.
