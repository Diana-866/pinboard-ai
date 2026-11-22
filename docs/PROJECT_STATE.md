# PinPosy — единый паспорт проекта и план работ

> Назначение: единая точка правды для разработки. Обновлять этот файл после каждого завершённого пункта. Не считать задачу выполненной без проверяемого результата.
> Статус документа: актуализирован 2026-11-22; полный построчный аудит всех файлов и runtime-проверка ещё НЕ завершены.
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
11. Обязательный журнал разработки: каждое существенное действие ассистента фиксировать в документации до завершения этапа — что проверено/изменено, зачем, каким способом, точные commit/file SHAs, фактические результаты проверок, ограничения/непроверенное и следующий шаг. Для инцидентов создавать отдельный audit report, добавлять его в DOCUMENTATION_REGISTER, кратко обновлять этот паспорт и USER_ACTIONS при изменении действий владельца. Не выдавать незаписанные действия за завершённые.

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
- [x] Статически проверены все 148 файлов `db/migrations`: canonical sequence 001 + 010–148; destructive DDL/DML, SECURITY DEFINER/search_path, grants/revokes, RLS, triggers and indexes reviewed; findings in `docs/backend-audit/13-sql-migration-static-review.md`. Чистый runtime replay canonical baseline + migrations 010–148 успешно выполнен на disposable PostgreSQL 18.6 (2026-11-16); см. журнал ниже. SQL integration suite ещё не выполнен.
- [x] Статический обзор функций, триггеров, RLS policies, grants/revokes, индексов и ограничений для active migrations 010–148 выполнен и описан в `docs/backend-audit/13-sql-migration-static-review.md`; чистый PostgreSQL replay baseline + 010–148 пройден. SQL integration tests и backend runtime suite остаются открытыми.
- [x] Статическая сверка всех прямых backend `.rpc()` call sites и динамических RPC dispatchers завершена: generation/regeneration, Prodamus checkout/webhook settlement, credits/billing/email/auth, Pinterest refresh/OAuth/publication/scheduler/recovery, admin reconciliation/refunds, image lifecycle и account deletion. Сигнатуры/аргументы и service_role grants сопоставлены с последними active definitions; отчёт `docs/backend-audit/11-rpc-contracts.md`. Runtime PostgreSQL verification остаётся открытой.
- [x] Проверить полный migration chain на чистой тестовой PostgreSQL: disposable PostgreSQL 18.6, baseline 001 + все 139 миграций 010–148, PASS, cleanup подтверждён (2026-11-16).
- [ ] Сверить схему тестовой БД PIN_TRIAL с ожидаемой схемой.
- [ ] Проверить резервное копирование и реальное восстановление.

### Документация и CI
- [ ] Проверить все документы, аудиты, runbooks и планы; пометить устаревшие.
- [ ] Проверить GitHub Actions, Vercel build/deploy и другие pipeline.
- [ ] Сформировать реестр файлов с назначением, статусом, проблемами и связанными тестами.

## 3. Предварительные наблюдения — требуют дальнейшей проверки

Эти наблюдения получены при выборочном просмотре файлов на исходном commit; они не являются полным аудитом:
- `frontend/src/components/analytics/AnalyticsView.tsx` показывает недоступность аналитических данных.
- Историческое замечание об admin mock data уточнено после проверки: текущий `AdminPanel.tsx` не импортирует `adminMockData.ts`/`ADMIN_USERS`/`ADMIN_TRANSACTIONS`, скрывает неподключённые разделы и явно предупреждает об отсутствии демонстрационных пользователей/фиктивных платежей. Восемь активных admin screen modules проверены отдельно; ни один из них не импортирует этот seed. Сам `frontend/src/data/adminMockData.ts` оставлен: полноценный repo-wide reference scan пока не подтверждён, поэтому удалять файл преждевременно.
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
- [~] Построчный frontend-аудит начат: пакеты 01 auth shell/API/browser storage (`docs/frontend-audit/01-auth-shell-api.md`), 02 session hydration + project/board contracts (`docs/frontend-audit/02-session-hydration-and-board-contracts.md`), 03 generation recovery + pin editing (`docs/frontend-audit/03-generation-recovery-and-pin-editing.md`), 04 Pinterest publishing/account lifecycle (`docs/frontend-audit/04-pinterest-publishing-and-account-lifecycle.md`), 05 calendar scheduling/owner fencing (`docs/frontend-audit/05-calendar-scheduling-and-owner-fencing.md`) и 06 billing/credits/checkout (`docs/frontend-audit/06-billing-credits-and-checkout.md`, commit `d55f4f9f7063853ac90dc9902ca1ad920985023d`), а также 07 admin/account/privacy/legal (`docs/frontend-audit/07-admin-account-privacy-legal.md`) и 08 shared API fallback localization (`docs/frontend-audit/08-api-error-localization.md`) выполнены; исправлена owner isolation для async schedule actions, Pinterest controls и checkout/key lifecycle. Полный frontend file-by-file review и runtime checks ещё не завершены.
- [~] Миграции 001 + 010–148 статически рассмотрены в `docs/backend-audit/13-sql-migration-static-review.md`; migration 149 включена в текущий test chain, но отдельный полный security review migration 149 ещё не заявляется. Для SQL integration сохранена инвентаризация всех 46 ordered tests в `docs/backend-audit/14-sql-integration-test-inventory.md`; дополнительно в schema-contract audit повторно получены все 46 SQL-файлов и сопоставлены их table/insert/update references с baseline/fixture/migration chain. По всем 140 migrations 010–149 выполнен targeted scan `ALTER TABLE ... ADD COLUMN` для отсутствовавших baseline fields: `users.token_version` впервые добавляет migration 023 и повторно нормализует migration 055; `users.account_status` добавляет migration 127; остальные отсутствовавшие baseline columns не вводятся более поздними migrations и должны присутствовать в legacy fixture. После исправлений fixture содержит все baseline columns десяти таблиц, кроме намеренно отсутствующего до migration 023 `token_version`. Это статический source audit; runtime SQL gate остаётся открытым.
- [~] Проверены пять GitHub Actions workflows, три verification scripts, package scripts и все девять Bash concurrency harnesses; выявлен и исправлен опасный implicit DB target/общие временные файлы в Bash harnesses. Добавлены общий guard, contract test и CI bash -n step; specialized workflows с unpinned Actions приведены к SHA pinning. Инвентаризация и оставшиеся вопросы — `docs/backend-audit/15-verification-workflow-and-concurrency-review.md`; runtime проверки ещё не выполнены, аудит всех остальных test/config files продолжается.
- [~] Выполнена targeted contradiction review; исправлены четыре критичных устаревших документа (docs/launch-steps.md, docs/runbooks/release-line.md, docs/database.md, docs/pinterest/multi-account-architecture.md). Отчёт docs/audits/2026-11-16-documentation-contradiction-review.md. Это не полный построчный аудит всех docs; он продолжается.
- [~] Создан полный metadata file-by-file register `docs/DOCUMENTATION_REGISTER.md` для всех 400 файлов docs/ с path, blob SHA и категорией проверки; выявлены коллизии номеров AUD. Это инвентаризация, а не завершённый content review: построчная проверка и reconciliation статусов документов продолжаются.
- [~] Сверены все 55 открытых PR и 100 веток относительно main; для каждого PR зафиксированы ahead/behind, draft и рекомендация FIX/REBASE, CLOSE CANDIDATE или DEFER в docs/audits/2026-11-16-open-pr-and-branch-review.md. Ни один PR не был слит/закрыт, ветки не удалялись: все PR diverged, безопасного merge без rebase и текущих проверок нет. Перед закрытием close candidates требуется сверка уникальных файлов/тестов.
- [ ] Подготовить окончательный технический baseline и приоритеты.

### Этап 1 — воспроизводимость проверок
- [~] Проверены `backend/package.json` и `frontend/package.json`, оба `package-lock.json` (lockfileVersion 3), scripts (`backend`: start/test/worker/cron; `frontend`: dev/build/preview/clean/lint/test) и CI runtime declarations. В четырёх workflows явно задан Node.js 22; в `.github/workflows/atomic-payment-integration.yml` добавлен pinned `actions/setup-node` v4, npm cache и backend lockfile cache key (commit `555e732b`). В текущем execution environment фактически выполнены `node --version` → `v22.16.0` и `npm --version` → `10.9.2`. Package manifests не содержат `engines`; Node/npm доступны, но это не заменяет выполнение install/test/build.
- [x] Исправить verify script: `scripts/verify.sh --migrations` запускает `001_baseline.sql`, затем только активные нумерованные миграции `010+`; диагностическая `000`, исторические `002–008` и архивные SQL не исполняются. Добавлены `backend/test/verify-script-migration-chain.test.js` и CI step. Локально проверены `bash -n` и 4 static regression tests (4/4); полноценный PostgreSQL replay не запускался: `psql` отсутствует.
- [~] GitHub Actions ранее завершались до выполнения шагов; актуальные push runs после schema-fixture изменений также завершились `failure`, но GitHub API возвращает `steps: null` и `logs_url: null` (например, atomic run `44068607386`/`44070232846`, persisted-boards run `44068607454`/`44070232989`). Это не подтверждает падение тестов: фактические шаги не видны, причина pre-step failure остаётся НЕ УСТАНОВЛЕНА. Vercel status текущей ветки на commit `441cd742caffa6e25cefe27b5edb0de8ace7fe22` — `failure`, target указывает `build-rate-limit`; это quota/rate-limit blocker, не доказанная ошибка исходников. Ранее наблюдавшийся Vercel SUCCESS на `bd0d973...` не переносится на последующие commits. Локальные Node/PowerShell/PostgreSQL runtime checks по-прежнему ожидают владельца.
- [ ] Запустить frontend typecheck/lint/tests/build.
- [x] Запустить migration chain на чистой тестовой PostgreSQL: baseline 001 + migrations 010–148, PostgreSQL 18.6, PASS (2026-11-16).
- [~] Подготовлен отдельный Windows runner `scripts/verify-integration.ps1` для CI upgrade fixture: проверка clean main == origin/main, единственный loopback listener, точный процесс/data directory, PostgreSQL 18.6/WIN1251/UTF8, отдельная disposable DB, **140 migrations 010–149** с grant precondition перед 039, две inline assertions, 46 ordered SQL tests, finally cleanup только своей DB. Извлечены fixture/check SQL и manifest; contract regression test добавлен. Статическая сверка с workflow выполнена; владелец дважды подтвердил `PASS: PowerShell parser` до последних fixture-contract изменений. PowerShell runner runtime и реальный SQL suite ещё НЕ запускались.
- [ ] Запустить SQL integration runner на временном PostgreSQL 18.6 и подтвердить cleanup disposable DB. Parser-only check владельца пройден дважды (`PASS: PowerShell parser`, 2026-11-17); это не является запуском runner или SQL tests.
- [~] Девять Bash concurrency scripts получили общий safety preflight: обязательный explicit opt-in, loopback-only target, PGDATABASE с префиксом `pinposy_verify_`, подтверждение фактической БД/адреса сервера, уникальный temp directory и остановка/ожидание фоновых процессов перед cleanup. Добавлены Node contract test и CI `bash -n` step. Runtime suite ещё НЕ запускалась; после UA-004 нужен отдельный disposable DB setup/runner, не запускать скрипты вручную на `pinposy_test` или иных общих БД.
- [ ] Запустить backend Node runtime suite и устранить обнаруженные дефекты.
- [x] Добавлен Windows fallback `scripts/verify.ps1 -Migrations`: disposable DB, Supabase stubs, baseline + 139 active migrations, cleanup in `finally`; static contract assertions добавлены. `-MigrationsOnly -PostgresPort 55439` успешно выполнен на PostgreSQL 18.6: baseline + 010–148 PASS, disposable DB удалена (2026-11-16).
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

**NEXT (обновлено 2026-11-18, см. последнюю запись журнала): backend Node suite и frontend typecheck/tests/build ВЫПОЛНЕНЫ и зелёные (724/724 и 221/221).** Найдены и исправлены три реальных дефекта: полная поломка страницы входа (`t.common.hide`), маскировка ошибки конфигурации PRODAMUS_URL под 502 и fail-open `fetchAllPages` (молчаливое усечение списков).
**Блокер:** SQL runtime gate (миграции 010–161 + 49 SQL integration files) НЕ выполнен, потому что в этом окружении нет полного серверного дистрибутива PostgreSQL (`initdb` падает на отсутствующем `share/postgres.bki`), единственный доступный сервер 127.0.0.1:5432 требует неизвестный пароль, Docker и npm registry недоступны. Требуется запуск `scripts/verify-integration.ps1` на машине владельца с полной установкой PostgreSQL. SQL/RLS/триггеры/функции, concurrency suite, staging и deployment остаются NOT VERIFIED; живые платежи, приглашения первых пользователей, планируемая публикация и worker удаления аккаунта остаются заблокированными.

## 8. Журнал изменений паспорта
- 2026-11-17 — повторно сверены актуальные SHA файлов SQL runner `scripts/verify-integration.ps1` (`ff733351`), SQL runner contract test (`7000303d`), disposable concurrency runner (`bc773d7b`), concurrency safety contract (`38a3401d`), workflow (`a7960da8`) и backend manifest (`47af7df3`). Проведена дополнительная source-level проверка guard/cleanup/target identity: runner требует чистый синхронный main, точный loopback listener и data directory, проверяет server identity, создаёт уникальную disposable DB, удаляет только её и роли, созданные самим runner; workflow запускает concurrency tests через отдельный clone runner, а не общую fixture. В проверенном коде не обнаружено достаточного основания для безопасного изменения без runtime evidence. В текущем Linux runtime доступны Node 22.16.0, npm 10.9.2, Bash и git; отсутствуют PowerShell (`pwsh`) и PostgreSQL client (`psql`), а пользовательский Windows cluster недоступен. Поэтому PowerShell parser, SQL integration, Bash concurrency и backend runtime tests НЕ запускались; чекбоксы не закрыты. NEXT и UA-004 остаются без изменений. Production/PIN_TRIAL/локальные кластеры не затрагивались.

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


- 2026-11-16 — улучшен порядок обязательной проверки: найдено, что прежний Windows `-Migrations` запускал backend/frontend проверки до migration replay, хотя паспорт требует сначала пройти DB gate. Добавлен `-MigrationsOnly`: выполняет только clean disposable PostgreSQL replay, не требует Node.js/npm и не затрагивает application test suites; `-Migrations` по-прежнему выполняет полный набор. Добавлены статические Node assertions на switch, запуск replay и отсутствие Node/npm gate в migrations-only режиме. Commits: `d6c2b167` (script), `33482aa7` (tests). Проверено повторным чтением актуальных GitHub файлов и статическими content assertions; Node tests и PowerShell/PostgreSQL runtime всё ещё НЕ запускались. NEXT без изменения: выполнить `powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1 -MigrationsOnly` на локальном Windows с локальным PostgreSQL/psql, затем SQL integration tests и backend runtime suite. GitHub Linux jobs продолжают завершаться до steps; PR #89 self-hosted run остаётся queued без runner. Production не затронут.


- 2026-11-16 — safety review Windows migration replay обнаружил, что PowerShell использовал psql без явного host и мог унаследовать удалённый `PGHOST`; это противоречит требованию запускать replay только на локальной disposable PostgreSQL. Все шесть вызовов psql (создание, stubs, baseline, migrations, terminate sessions, drop DB) теперь принудительно используют `-h 127.0.0.1`. Добавлена static regression assertion, проверяющая все 6 вызовов. Commits: `bcb30510` (loopback host), `42f50ec0`/`02751402` (tests). Повторно прочитаны файлы из GitHub; проверки содержимого подтвердят изменение, но Node tests/PowerShell/PostgreSQL runtime НЕ запускались. NEXT остаётся DB replay: `powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1 -MigrationsOnly` на Windows с локальным PostgreSQL и psql. Loopback host уменьшает риск случайного удалённого подключения, но пользователь должен убедиться, что локальный PostgreSQL instance/port является тестовым; production запрещён. Чекбоксы runtime не закрыты.

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


- 2026-11-16 — повторная сверка после предыдущей записи: `main` продвинулся до `f2975dbfcc072438bb8e66a16c90c6523c5a26c4`. Новые runs `43910782072` (postgres-atomicity) и `43910782201` (frontend/backend) завершились failure до первого шага; Jobs API подтвердил `runner_id: 0`, пустые `steps` у jobs `133451778644`, `133451779608`, `133451780246`. Следовательно, миграционный replay, SQL integration, backend/frontend tests и build не запускались. Combined Vercel status на этом же HEAD остаётся failure: `Deployment rate limited — retry in 24 hours`. Перепроверены `scripts/verify.ps1`, `scripts/verify.sh` и `backend/test/verify-script-migration-chain.test.js`; содержимое соответствует описанным safeguard, но PowerShell/PostgreSQL runtime не выполнялись. Вывода локального `-MigrationsOnly` по-прежнему нет. DB gate остаётся открытым; чекбоксы не менялись, production не затронут. Следующее обязательное действие — clean disposable PostgreSQL replay на локальной тестовой БД, затем SQL integration и backend runtime suite.


- 2026-11-16 — повторно запрошены rerun failed jobs для последних main runs `43910782201` (backend/frontend) и `43910782072` (postgres-atomicity), обе операции приняты GitHub. Attempt 2 завершился failure; новые jobs `133453191487` (backend), `133453192458` (frontend), `133453214804` (postgres-atomicity) имеют пустые steps. Следовательно, повторный запуск не восстановил выполнение runner; команды не стартовали. Актуальный docs HEAD `68fe2f7f4f26b603574f344c308ddec080d763c6`; Vercel combined status на нём — `failure`, `Deployment rate limited — retry in 24 hours`. Workflow YAML проверены: все затронутые jobs используют `ubuntu-latest`, поэтому причина не в self-hosted label; конкретная причина отказа GitHub runner не подтверждена. NEXT не меняется: clean disposable PostgreSQL replay на локальной машине пользователя, затем SQL integration и backend runtime suite. Runtime-чекбоксы не закрыты, production не затронут.


- 2026-11-16 — повторно исполнен контрольный шаг NEXT на актуальном `main` `a312b85d9fc98f960e87525d6701be2fbdaa63a2`: clean PostgreSQL replay по-прежнему не может быть выполнен в текущей среде (нет checkout, `psql`/PostgreSQL server и Docker; локальный вывод `verify.ps1 -MigrationsOnly` от пользователя не поступал). Проверены latest доступные Actions runs: `43910782072`/`43910782201` на code HEAD `f2975dbf`, attempt 2 jobs `133453214804`, `133453191487`, `133453192458` без steps; получение логов для них вернуло `404 BlobNotFound`. PR #90 всё ещё draft/open, его Windows self-hosted run `43908889550` остаётся `queued`, base SHA устарел (`0b856ae4`), поэтому он не даёт фактического runtime результата. Vercel combined status на текущем `main` — failure `Deployment rate limited — retry in 24 hours`. NEXT и чекбоксы не меняются: сначала disposable PostgreSQL replay, затем SQL integration/backend runtime; frontend audit и staging не начинать раньше. Для продолжения требуется пользовательский локальный replay либо восстановление GitHub runner с реальным выполнением job. Production не затронут.


- 2026-11-16 — перепроверен deploy на актуальном `main` `6479d96f3f16de6211415e85aeab3d714fcd2ff0`: Vercel status сменился с прежнего `build-rate-limit` на `success` (`Deployment has completed`, 16:48 UTC). Паспорт обновлён, чтобы не считать Vercel текущим блокером. Последние Actions jobs по-прежнему не публикуют выполненные steps и не дают подтверждения DB replay/SQL/backend тестов; NEXT остаётся без изменений. Реальный clean PostgreSQL replay в текущей среде недоступен, локальный вывод от пользователя не получен. PR #90 / self-hosted runner не использовать как доказательство runtime проверки до фактического выполнения job. Успешный deploy не равен готовности приглашать пользователей; production не изменялся.
- 2026-11-16 — correction after checking the actual latest main HEAD: documentation commit `3b7b4b44` itself has Vercel combined status `failure` with target `build-rate-limit`; the previously recorded success applies only to prior code commit `6479d96f`, not current main. Latest Actions runs `43910782201` and `43910782072` still have failure jobs with no published steps (`steps: null`); no DB replay or runtime tests are evidenced. Corrected NEXT to distinguish previous successful deployment from current main status. No application code or production services changed; DB gate remains blocked pending a real disposable PostgreSQL replay.
- 2026-11-16 — уточнено: после исправления статуса deployment-bearing commit `3b7b4b44` документационный commit `1a0b9bba` записан с `[skip ci]`; у него нет собственного Vercel status, поэтому нельзя переносить на него ни failure, ни success предыдущего deployment. Runtime/DB gates не менялись.
- 2026-11-16 — проверен новый main HEAD `9336717d89eb2a5aabaacef2e73a133af3d905a3`: runs `43912083908` и `43912083871` завершились failure; jobs `133456365916`, `133456366310`, `133456365864` не содержат steps/logs (`steps: null`, `logs_url: null`). Combined Vercel status на этом HEAD — `failure`, target `build-rate-limit`. NEXT остаётся clean disposable PostgreSQL replay; пользовательский результат `verify.ps1 -MigrationsOnly` отсутствует. DB/SQL/backend runtime gate не закрыт, никаких production действий не выполнялось.

- 2026-11-16 — очередная сверка текущего `main` (`cb66e293169a17b7ef2ca398ae0228f62760b6b5`): актуальные Actions runs `43912192762` (Persisted boards: backend/frontend) и `43912192766` (Atomic payment fulfillment: postgres-atomicity) завершились `failure`; jobs `133456761627`, `133456762088`, `133456761712` возвращают `steps: null`, `logs_url: null`, поэтому выполнение migration replay/SQL/backend/frontend-команд не подтверждено. Combined status именно этого HEAD: Vercel `failure`, target `build-rate-limit`. Повторно проверен Windows fallback: `scripts/verify.ps1` по-прежнему направляет все шесть операций `psql` на `127.0.0.1` и явный `-PostgresPort`; Linux fallback использует `/var/run/postgresql` и явный порт. PR #90 остаётся draft/open, его Windows self-hosted job run `43908889550` всё ещё `queued`; PR base SHA `0b856ae4` отстаёт от main, запуск не является доказательством проверки. Локальный вывод `verify.ps1 -MigrationsOnly` не поступил; clean disposable PostgreSQL replay остаётся единственным следующим обязательным gate. Чекбоксы не менялись, код/SQL и production не затронуты.
- 2026-11-16 — повторная сверка текущего main `cab2cb6bcd6ff2bffca9ddd62a002aa15a0077a2`, `docs/PROJECT_STATE.md`, verification scripts, CI и PR. Актуальные `scripts/verify.ps1` и `scripts/verify.sh` повторно прочитаны: Windows содержит 6 вызовов `Invoke-LocalPsql`, каждый ограничен `127.0.0.1` и явным `-PostgresPort`; Linux использует `/var/run/postgresql`, явный порт и `--migrations-only`. Contract test `backend/test/verify-script-migration-chain.test.js` содержит Windows replay assertions. Это только статическая сверка файлов, не запуск Node/PowerShell/PostgreSQL runtime. Последние main workflow runs на code HEAD `cb66e293` — `43912192762` и `43912192766`; jobs `133456761627` (backend), `133456762088` (frontend), `133456761712` (postgres-atomicity) завершились failure с `runner_id: 0`, `steps: []`, поэтому команды не стартовали. На текущем docs HEAD `cab2cb6b` GitHub commit status показывает Vercel `failure`: `Deployment rate limited — retry in 24 hours`; актуальный deployment не подтверждён. PR #90 draft/open, base `0b856ae4` отстаёт от main; не объединялся. Локального результата `verify.ps1 -MigrationsOnly` в переписке нет; clean disposable PostgreSQL replay остаётся заблокированным до выполнения на локальной тестовой БД или восстановления runner. Чекбоксы не менялись; production и приложение не затронуты.
- 2026-11-16 — перепроверен текущий `main` `1689a344d523c82eb0817a9ee0dc4fca9dbf5403`, `docs/PROJECT_STATE.md`, Windows migration script, Actions и deployment status. Новый факт: Vercel status непосредственно на текущем HEAD `1689a344` теперь `success` (`Deployment has completed`, deployment `6wAAS72jqqqdcCebWDqKDJPga1Uw`); предыдущая запись о rate limit относилась к более раннему HEAD и не описывает текущий deploy. Последние доступные Actions runs всё ещё относятся к code HEAD `cb66e293`: `43912192762` и `43912192766`; Jobs API подтвердил три job с `runner_id: 0`, пустыми `steps: []` (`133456761627`, `133456762088`, `133456761712`), следовательно команды проверки не стартовали. Personal context повторно проверен: после предыдущего запроса пользователь не предоставлял вывода `verify.ps1 -MigrationsOnly` и не сообщал о локальном PostgreSQL replay. Следующий обязательный gate не изменён: clean disposable PostgreSQL replay `001_baseline.sql` + `010–148`, затем SQL integration tests и backend runtime suite. Чекбоксы не менялись; production не затронут; успешный Vercel deployment не трактуется как готовность приглашать пользователей.

- 2026-11-16 — продолжена сверка на `main` после документационного commit `541dfbbb0ad56a285c76129aa2b59e026f673570`. Повторно проверены `docs/PROJECT_STATE.md`, `scripts/verify.ps1` (blob `6614843e`), `scripts/verify.sh` (blob `63b605d6`) и migration-chain contract test (blob `991c63a4`); изменения скриптов после предыдущей проверки отсутствуют. Personal context search не обнаружил нового вывода `verify.ps1 -MigrationsOnly` или подтверждения локального PostgreSQL replay. Jobs API для последнего run `43912192762` снова показывает backend/frontend jobs `133456761627` и `133456762088` с `runner_id: 0`, `steps: []`; ранее проверенный `43912192766` имеет аналогичный пустой job `133456761712`. Команды тестов не стартовали. Дополнительно уточнён Vercel статус: application commit `1689a344` действительно deployed (`success`), но текущий documentation-only HEAD `541dfbbb` имеет `failure` `Deployment rate limited — retry in 24 hours`, поэтому deployment именно текущего HEAD не подтверждён. PR #90 остаётся draft/open, base SHA `0b856ae4` отстаёт от main; не объединялся. Обязательный NEXT не изменён: сначала clean disposable PostgreSQL replay `001_baseline.sql` + `010–148`, затем SQL integration tests и backend runtime suite. Чекбоксы не менялись, production не затронут; никаких runtime gates не закрыто.

- 2026-11-16 — повторно проверен `main` (`ebc766d3e6a612e7847ecb5ef8eb3a995026c048`) и неизменённый `NEXT`; personal context не содержит нового вывода локального `verify.ps1 -MigrationsOnly` или успешного PostgreSQL replay. Чтобы проверить, не был ли прежний runner allocation failure временным, после чтения workflow YAML (оба запускают только read-only checkout/Node tests; atomicity workflow использует одноразовый PostgreSQL service container) однократно перезапущены failed jobs runs `43912192762` и `43912192766`. GitHub принял rerun (attempt 2), но jobs `133466580498` (frontend), `133466581091` (backend) и `133466601922` (postgres-atomicity) снова завершились `failure`; job-step API вернул пустые `steps: []`, `logs_url: null`, а steps endpoint — пустые массивы. Следовательно ни одна команда workflow не стартовала; rerun не дал тестовых результатов и указывает на сохраняющийся runner/platform execution blocker, а не на доказанный дефект приложения. PR #90 остаётся draft/open и отстаёт от main; Vercel rate limit для документационного HEAD `541dfbbb` остаётся последним известным status. Обязательный gate не изменён: clean disposable PostgreSQL replay `001_baseline.sql` + `010–148` на локальной тестовой БД, затем SQL integration tests, затем backend runtime suite. Скрипты и миграции не менялись, чекбоксы не менялись, production не затронут.

- 2026-11-16 — дополнительная сверка GitHub после предыдущей записи: `main` остаётся на HEAD `782b6cda13ad18fc9cf5f2070ff534fb85f6e566`, `docs/PROJECT_STATE.md` blob `31815eced083494e0b5d013aaa98c7e40705a8d0`; новых локальных результатов `verify.ps1 -MigrationsOnly`/PostgreSQL replay в доступном контексте нет. PR #89 закрыт без merge; PR #90 остаётся draft/open и не объединён. Его Windows self-hosted run `43908487671` теперь имеет `conclusion=cancelled`; job `133443654781` завершился cancelled без опубликованных steps/logs, поэтому runtime-проверки не подтверждены. Последние main Actions runs по-прежнему `43912192762` и `43912192766` (attempt 2); их jobs завершились failure без steps/logs, команды не стартовали. GitHub commit status непосредственно на актуальном main HEAD `782b6cda` — Vercel `failure`, `Deployment rate limited — retry in 24 hours`; deployment текущего HEAD не подтверждён. `NEXT` не меняется: clean disposable PostgreSQL replay `001_baseline.sql` + `010–148`, затем SQL integration tests, затем backend runtime suite. Чекбоксы не менялись; код/SQL, production и пользовательские данные не затрагивались.

- 2026-11-16 — повторная контрольная сверка после предыдущей записи: актуальный `main` HEAD `7ef4b5a328df8290afbd62c6010778b0169af37e`; `docs/PROJECT_STATE.md` перечитан, `scripts/verify.ps1` повторно проверен (Windows `-MigrationsOnly` остаётся disposable replay только на `127.0.0.1` с явным портом). Для текущего документационного HEAD Actions workflow runs отсутствуют (предыдущий commit помечен `[skip ci]`); combined commit status Vercel — `failure` (`build-rate-limit`). Эти статусы не дают новых runtime результатов. В текущей среде нет доступа к локальному Windows/PostgreSQL instance пользователя, поэтому clean PostgreSQL replay `001_baseline.sql` + `010–148` выполнить и подтвердить отсюда нельзя; запускать удалённую или production БД вместо локальной disposable запрещено. NEXT и runtime-чекбоксы не меняются: пользовательский локальный `verify.ps1 -MigrationsOnly` с реальным результатом остаётся необходимым gate; после него — SQL integration tests и backend runtime suite. Код, SQL, production и пользовательские данные не менялись.

- 2026-11-16 — контрольная сверка после коммита `56952036e72d24855d41a3597f08b5281add3725`: актуальный `main` HEAD подтверждён как `56952036e72d24855d41a3597f08b5281add3725`; `docs/PROJECT_STATE.md` перечитан из этого HEAD. Для HEAD нет связанных GitHub Actions workflow runs; combined status Vercel — `failure` (`build-rate-limit`), deployment не подтверждён. Следующий пункт паспорта остаётся заблокированным внешним локальным execution requirement: clean disposable PostgreSQL replay `001_baseline.sql` + `010–148` должен быть выполнен на локальной Windows/PostgreSQL пользователя через `powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1 -MigrationsOnly`; текущая среда не предоставляет доступа к этому instance. Не подменять его production/Supabase или удалённой БД. Без фактического replay нельзя переходить к SQL integration/backend runtime как к подтверждённым проверкам и нельзя закрывать чекбоксы. Изменения кода/SQL и production не выполнялись; NEXT без изменения.


- 2026-11-16 — выполнена ещё одна адресная попытка восстановить GitHub Actions execution без изменения исходников: повторно запрошен rerun только failed jobs для runs `43912192762` (backend/frontend) и `43912192766` (postgres-atomicity); GitHub принял оба запроса. После завершения jobs API показал новые job IDs `133473612993` (backend), `133473613167` (frontend), `133473621986` (postgres-atomicity), все `conclusion=failure`, `steps=[]`, `logs_url=null`. Команды workflow снова не стартовали, поэтому это не результат SQL/backend/frontend тестов и не свидетельство дефекта приложения; runner/platform blocker сохраняется. Актуальный `main` перед записью подтверждён на `9e05f919488e6b4cf702dcfd11ddb5b3e8001815`, blob паспорта `5d78a5bf471e3bb5fd9ff8ecb56b8a3e9a59b782`. Локального вывода `verify.ps1 -MigrationsOnly` и доказательства clean PostgreSQL replay по-прежнему нет. Обязательный NEXT не меняется; чекбоксы не закрывались. Код, SQL и production не изменялись.


- 2026-11-16 — дополнительная диагностика CI runner blocker по свежим workflow definitions на `main`: `.github/workflows/persisted-boards-checks.yml` (blob `59f7c9ade376c0f7e0def6faed02dc9f890eeb58`) назначает frontend/backend на `ubuntu-latest`; `.github/workflows/atomic-payment-integration.yml` (blob `1b8ba414f3086ba31b86dfad6e13769f3798ae4c`) назначает PostgreSQL atomicity job на `ubuntu-latest` и использует disposable PostgreSQL 16 service container. Оба workflow объявляют `workflow_dispatch`, однако доступный GitHub connector не предоставляет dispatch action; повторный запуск доступен только через failed-job rerun, который уже повторён и вновь завершился до первого шага. Это не выглядит как конфигурация self-hosted runner labels; наблюдаемые `runner_id: 0`, `steps=[]`, `logs_url=null` остаются внешним GitHub runner allocation/execution blocker, без тестовых результатов. Актуальный `main` и blob паспорта проверены непосредственно перед записью; NEXT остаётся clean local disposable PostgreSQL replay `001_baseline.sql` + `010–148`, затем SQL integration и backend runtime. Чекбоксы не менялись; код, SQL и production не затрагивались.
- 2026-11-16 — контрольная сверка после предыдущего прохода: `main` HEAD подтверждён как `280386d4c91238b8fa0183486c87c520a75fb8ad`, blob `docs/PROJECT_STATE.md` — `966d35942fdf5771562922fa4b917f0c5e39a45c`. GitHub commit status именно этого HEAD: Vercel `success`, description `Deployment has completed` (status создан 17:20:28Z); это подтверждает завершение deployment check, но не заменяет DB/runtime gates и не доказывает готовность всех пользовательских сценариев. Последние доступные Actions runs `43912192762` и `43912192766` относятся к более раннему code HEAD `cb66e293`; latest-attempt jobs `133473612993` (backend), `133473613167` (frontend), `133473621986` (postgres-atomicity) завершились `failure`; Jobs API не публикует шаги выполнения, поэтому результаты тестов отсутствуют. Текущий документационный HEAD помечен `[skip ci]`, новых Actions runs для него нет. Скрипты `verify.ps1` и `verify.sh` повторно прочитаны без изменений; локального PostgreSQL replay результата от пользователя нет. Обязательный NEXT остаётся clean disposable PostgreSQL replay `001_baseline.sql` + `010–148`, затем SQL integration tests и backend runtime suite; чекбоксы не менялись. Код/SQL/production не затрагивались.
- 2026-11-16 — повторная проверка актуального `main` перед продолжением: HEAD `5f77e9e221f95cab18935fa5368a32eeab61b241`, паспорт blob `ee0903c0eebbaefd20d6d2e22b08d6b5f0a9d3e5`; `scripts/verify.ps1` и `scripts/verify.sh` без изменений (blobs `6614843e` и `63b605d6`). Текущий NEXT в разделе 7 подтверждён: clean disposable PostgreSQL replay `001_baseline.sql` + активные миграции `010–148`, затем SQL integration tests и backend runtime suite. Последние Actions runs `43912192762` и `43912192766` относятся к code HEAD `cb66e293`, attempt 3; jobs `133473612993` (backend), `133473613167` (frontend), `133473621986` (postgres-atomicity) завершились `failure`, Jobs API не предоставляет steps (null), следовательно нет доказательства старта тестовых команд. Combined status текущего HEAD `5f77e9e2` — Vercel `failure`, target `build-rate-limit`; deployment текущего HEAD не подтверждён. Пользовательский вывод локального `verify.ps1 -MigrationsOnly` не поступил; среда этого сеанса не имеет доступа к локальной Windows/PostgreSQL машине. Повторно запускать прежние jobs без изменения внешних настроек нецелесообразно. Чекбоксы и NEXT не менялись; код/SQL/production не затрагивались.
- 2026-11-16 — очередное продолжение строго по NEXT после документационного HEAD `be7cf627632905972645995d16b54bde35b4985c`: актуальные `main`, паспорт и verification scripts повторно сверены; `scripts/verify.ps1` (blob `6614843e`) и `scripts/verify.sh` (blob `63b605d6`) не менялись. NEXT остаётся clean disposable PostgreSQL replay `001_baseline.sql` + `010–148`, затем SQL integration и backend runtime; локального результата `verify.ps1 -MigrationsOnly` по-прежнему нет, а в этой среде нет доступа к Windows/PostgreSQL машины пользователя. Jobs последнего доступного Actions runs `43912192762`/`43912192766` повторно проверены: backend `133473612993`, frontend `133473613167`, postgres-atomicity `133473621986` — `failure`, `steps=null`, `logs_url=null`; тестовые команды не подтверждены как запущенные. Combined status именно текущего main HEAD `be7cf627` — Vercel `failure`, target `build-rate-limit`; deployment этого HEAD не подтверждён. Повторный rerun тех же jobs или фиктивный коммит не создаст валидный тестовый результат, поэтому не выполнялись. NEXT и чекбоксы не менялись; код/SQL/production не затрагивались.

- 2026-11-16 — продолжение по актуальному NEXT: повторно прочитаны `docs/PROJECT_STATE.md` (blob `64b6c89113ea9c3a824d37a11857b0d4f0ad9905`) и `docs/PIN_TRIAL_MIGRATION_STATUS.md` (последний зафиксированный индексный сегмент заканчивается на `subscriptions.idx_subscriptions_period_end`). Канонический следующий gate паспорта не изменился: clean disposable PostgreSQL replay `001_baseline.sql` + активные миграции `010–148`, затем SQL integration tests и backend runtime suite. Результата локального `verify.ps1 -MigrationsOnly` в текущем сообщении нет; поэтому replay не считается выполненным и никакие DB/backend чекбоксы не закрываются. В этой итерации код, SQL и БД не менялись; следующий необходимый результат должен быть получен на локальной disposable PostgreSQL пользователя, а не на production или `PIN_TRIAL` с неустановленной историей миграций.

- 2026-11-16 — локальная проверка Windows, результат пользователя: команда `powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1 -MigrationsOnly` вывела Backend syntax check PASS, analyze.js/boards.js/textOutputValidation.js syntax PASS, Frontend type-check PASS, Frontend tests PASS и Frontend production build PASS; `Backend tests` завершились FAIL (exit 1). Vite сообщил два предупреждения: использование `__dirname` при `configLoader: 'native'` и chunk(и) больше 500 kB; в представленном отчёте это предупреждения, не отмеченные как FAIL. Критическое несоответствие: в сводке отсутствует `PostgreSQL migration replay (001 + 010-148)`, а backend/frontend шаги были запущены, хотя актуальный GitHub `scripts/verify.ps1` (blob `6614843edaafd4924c90c679a0f9fe232e59a0f0`) содержит ветвление, при котором `-MigrationsOnly` пропускает Node/frontend-проверки и запускает только migration replay. Следовательно, данный запуск НЕ подтверждает replay; локальная версия скрипта/фактическая передача параметра требуют сверки. Backend test failure также пока не диагностирован: в присланном терминальном выводе нет текста конкретных failed tests/assertions. Атрибуция: команды запускал пользователь на Windows; assistant сверил вывод с текущим GitHub-скриптом, но не запускал локальные тесты самостоятельно. Не изменялись код и БД. Следующий шаг: получить локальный Git HEAD, состояние рабочей копии и фактическое содержимое `scripts/verify.ps1`; затем повторить целевой режим напрямую и отдельно получить полный лог `npm test` для диагностики.

- 2026-11-16 — разбор предоставленного пользователем вывода локального запуска `powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1 -MigrationsOnly`. Фактический вывод содержит backend syntax checks, backend tests (FAIL, exit 1), frontend type-check/tests/build; в нём отсутствует шаг `PostgreSQL migration replay (001 + 010-148)`. Повторно прочитан текущий `scripts/verify.ps1` на GitHub `main` (blob `6614843edaafd4924c90c679a0f9fe232e59a0f0`): параметр `-MigrationsOnly` должен пропускать весь блок Node/backend/frontend, а затем запускать только `Invoke-MigrationReplay`; следовательно, присланный вывод не соответствует текущей версии скрипта из GitHub либо фактически выполненной локальной копии/параметрам. Это НЕ доказательство прохождения или провала migration replay. Также повторно проверен `backend/package.json` (blob `47af7df351737185c05c26a79bf3a8880fe78880`): backend test script — `node --test`; в сводке пользователя нет конкретных failed test names/assertions, поэтому причина exit 1 пока неизвестна. Важно: Vite warnings по `__dirname` и chunk size были показаны, но frontend production build отмечен PASS. Атрибуция: локальные команды выполнял пользователь; assistant только сверил предоставленный вывод с GitHub-файлами. Код, SQL, базы данных и production не менялись; ни один verification gate не закрыт.
- **Следующий диагностический шаг:** попросить пользователя прислать локальные `git rev-parse HEAD`, `git status --short`, `git diff -- scripts/verify.ps1` и первые 50 строк локального `scripts/verify.ps1`, чтобы установить расхождение с GitHub. Затем выполнить `npm test` отдельно в `backend` и прислать полный вывод с названиями упавших тестов. После выяснения локальной версии скрипта повторить только migration replay и проверить, что в summary присутствует отдельная строка `PostgreSQL migration replay (001 + 010-148)`.

- 2026-11-16 — установлена причина расхождения локального запуска и GitHub. Пользователь предоставил локальные результаты: HEAD `1914c5c516cfa3b8a55fad9cd26d4f691a128e16`; `git status --short` пуст; `git diff -- scripts/verify.ps1` пуст; локальный `scripts/verify.ps1` в первых 60 строках содержит только параметр `-SkipInstall`, то есть это старый вариант без `-MigrationsOnly`/`-Migrations`. GitHub compare `1914c5c...` → `main` показал `ahead_by=247`, `behind_by=0`: локальный HEAD является предком текущего main и отстаёт на 247 коммитов; diff включает существенные изменения `scripts/verify.ps1` (+156/-40), `scripts/verify.sh` (+171/-28), новые тесты, backend/frontend изменения, migration `148_atomic_pin_publication_status_fencing.sql` и аудит-документы. Следовательно, предыдущая команда с `-MigrationsOnly` была запущена в старом локальном скрипте, который не распознаёт этот параметр; фактически он выполнял обычный набор backend/frontend проверок, а не migration replay. Отдельный `npm test` не запустился: PowerShell заблокировал `npm.ps1` по ExecutionPolicy до запуска Node; это не результат тестов. Использовать `npm.cmd test` (или `npm.cmd test 2>&1 | Tee-Object ...`) для запуска без изменения ExecutionPolicy. Атрибуция: локальные команды и вывод предоставлены пользователем; compare и чтение GitHub-файлов выполнены assistant. В этой итерации никаких файлов приложения, SQL или БД не изменяли; обновление рабочей копии не выполнялось.
- **Следующий шаг:** поскольку рабочая копия чистая и локальный HEAD отстаёт от `main` на 247 коммитов, синхронизировать её безопасным fast-forward: `git pull --ff-only origin main`. Затем подтвердить новый `git rev-parse HEAD`, повторно проверить `git status --short` и первые строки `scripts/verify.ps1`. Только после подтверждения обновлённого скрипта запустить `powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1 -MigrationsOnly`; убедиться, что итог содержит строку `PostgreSQL migration replay (001 + 010-148)`. Backend tests запускать отдельно через `npm.cmd test` и прислать полный вывод. Не запускать migration replay до синхронизации и проверки скрипта.


- 2026-11-16 — пользователь выполнил `git pull --ff-only origin main` из локального каталога `X:\!PROGECT\pinboard-ai\backend`; fast-forward прошёл успешно с `1914c5c5` на `a1f3237f30a8bf4ce63d1f9d0b1efb2da21e5951`, получены изменения 59 файлов (включая актуальные verify scripts, migration 148 и документацию). Пользователь подтвердил `git rev-parse HEAD` = `a1f3237f30a8bf4ce63d1f9d0b1efb2da21e5951`; `git status --short` пуст. Это подтверждает синхронизацию с зафиксированным main HEAD на момент pull и чистое рабочее дерево. Команда `Get-Content .\scripts\verify.ps1` завершилась ошибкой только из-за текущего каталога `backend`: путь `backend/scripts` отсутствует, правильный относительный путь оттуда — `..\scripts\verify.ps1`, либо перейти в корень репозитория. Assistant повторно прочитал актуальные `scripts/verify.ps1` (blob `6614843edaafd4924c90c679a0f9fe232e59a0f0`) и подтвердил параметры `-MigrationsOnly`, `-Migrations`, `-PostgresPort`; режим `-MigrationsOnly` пропускает Node/backend/frontend checks и выполняет только изолированный PostgreSQL replay: создаёт временную БД `pinposy_verify_...` на `127.0.0.1`, применяет `db/supabase-stub.sql`, `001_baseline.sql` и непрерывную последовательность `010–148`, затем пытается удалить временную БД. Скрипт требует доступный `psql`, запущенный локальный PostgreSQL на указанном порту (по умолчанию 5432) и роль с правом CREATE DATABASE; он не использует production или PIN_TRIAL. Replay ещё НЕ запускался и не подтверждён. Атрибуция: pull и локальные команды выполнил пользователь; чтение GitHub script и интерпретацию выполнил assistant. Код, SQL, production и пользовательские БД не изменялись; чекбоксы не закрывались.
- **Следующий шаг:** из текущего каталога `backend` перейти в корень командой `Set-Location ..`; проверить `Get-Content .\scripts\verify.ps1 -TotalCount 12`, `Get-Command psql`, `psql --version` и наличие локального PostgreSQL. Если `psql` доступен и локальный сервер запущен с ролью, имеющей право создавать БД, выполнить `powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1 -MigrationsOnly` и прислать полный вывод. Если PostgreSQL/psql не установлен или сервер не запущен — пока не запускать скрипт и сообщить результаты проверок; сначала подготовить disposable local PostgreSQL. После успешного replay отдельно запустить backend tests через `npm.cmd test` из `backend` и сохранить полный лог с названиями тестов.

- 2026-11-16 — пользователь попытался выполнить следующий шаг из PowerShell, но фактический текущий каталог оказался `X:\` (prompt `PS X:\>`), а не каталог репозитория. Поэтому `git pull --ff-only origin main` завершился `fatal: not a git repository`, а `Get-Content .\scripts\verify.ps1` не нашёл файл по ожидаемому пути. Это ошибка текущего каталога, не повреждение Git-репозитория; ранее подтверждённый pull в `X:\!PROGECT\pinboard-ai` на HEAD `a1f3237f30a8bf4ce63d1f9d0b1efb2da21e5951` остаётся действительным, но после последующего документационного commit `5ad0046c` локальная копия ещё не подтянула именно эту запись. Проверка `Get-Command psql` обнаружила клиент PostgreSQL 17.12. Подключение к `127.0.0.1:5432`, БД `postgres`, роль `Alekc` дошло до этапа password authentication, но сервер отверг введённый пароль: `пользователь "Alekc" не прошёл проверку подлинности (по паролю)`. Пользователь не знает пароль и пробовал предполагаемые варианты. Это не доказывает, что миграции запускались; replay не запускался. Не следует продолжать подбор пароля, менять пароль, править `pg_hba.conf` или трогать чужую/production БД без определения установленного локального экземпляра и безопасного способа доступа. Атрибуция: команды и вывод предоставлены пользователем; assistant интерпретировал результат. Код, SQL, схемы БД и production не менялись; verification gates не закрывались.
- **Следующий шаг:** сначала вернуть PowerShell в правильный каталог явной командой `Set-Location 'X:\!PROGECT\pinboard-ai'`, затем проверить `Get-Location`, `git rev-parse HEAD`, `git status --short` и `git pull --ff-only origin main` (последнее подтянет документальный commit, если он ещё не локально). Для PostgreSQL отдельно безопасно собрать только сведения об установленной службе без паролей: `Get-Service *postgres*` и `where.exe psql`; не печатать содержимое конфигураций или секреты. По результатам определить, является ли служба локальной и какой пользователь/способ аутентификации настроен. Если пароль администратора потерян, сначала оценить вариант создать отдельный disposable PostgreSQL instance для проверки миграций, не меняя доступ к существующим базам.


- 2026-11-16 — пользователь повторно перешёл в правильный каталог репозитория явной командой `Set-Location 'X:\!PROGECT\pinboard-ai'`. Подтверждён локальный HEAD `5ad0046cac71236bf0c0e2432e5cf1638d18f325`, рабочее дерево чистое; `git pull --ff-only origin main` успешно выполнил fast-forward до `0d393d34` (изменился только `docs/PROJECT_STATE.md`, 5 строк). Пользователь подтвердил наличие службы Windows `postgresql-x64-18` в состоянии Running. `where.exe psql` показал клиент `C:\Program Files\PostgreSQL\17\bin\psql.exe` (PostgreSQL 17.12). Ранее попытка подключения к `127.0.0.1:5432` с ролью `Alekc` дошла до password authentication и завершилась отказом пароля; пароль пользователю неизвестен. Из этого пока нельзя заключить, что служба PostgreSQL 18 слушает именно порт 5432, что она использует ожидаемый data directory, или что роль `Alekc` является администратором. Версия клиента 17 сама по себе не является препятствием для подключения к серверу 18. Migration replay НЕ запускался: он требует создать временную БД и права CREATEDB; нельзя продолжать угадывать пароль или менять аутентификацию существующего экземпляра. Assistant повторно прочитал актуальный `scripts/verify.ps1` (blob `6614843edaafd4924c90c679a0f9fe232e59a0f0`): `-MigrationsOnly` запускает только replay, создаёт БД с именем `pinposy_verify_<PID><random>`, применяет stub, baseline 001 и migrations 010–148, затем удаляет эту БД. Атрибуция: все локальные команды и вывод предоставлены пользователем; assistant проверил скрипт и записал результаты. Изменён только документационный файл через GitHub; локальная база данных, схема, SQL и production не затрагивались; replay не подтверждён.
- **Следующий диагностический шаг:** без изменения конфигурации получить безопасные сведения о службе и прослушиваемом порте: `Get-CimInstance Win32_Service -Filter "Name='postgresql-x64-18'" | Select-Object Name,State,StartName,PathName`; `Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 5432,5433,5434 }`; `Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory | Select-Object -ExpandProperty FullName`. Не публиковать пароли, содержимое `pg_hba.conf`, `postgresql.conf`, переменные окружения или токены. На основании этих результатов выбрать безопасный способ запуска отдельного disposable PostgreSQL instance/получения локальной административной роли, не затрагивая существующие базы. До этого не запускать `-MigrationsOnly`.


- 2026-11-16 — пользователь предоставил результаты безопасной диагностики службы PostgreSQL. `Get-CimInstance Win32_Service` подтвердил: служба `postgresql-x64-18` находится в состоянии `Running`, запускается от `NT AUTHORITY\NetworkService`; отображённый в таблице путь начинается с `X:\Program Files\PostgreSQL\18\bin\pg_ctl.exe runservice -N ...` (PowerShell табличный вывод обрезал конец командной строки). `Get-NetTCPConnection` подтвердил, что TCP-порт 5432 слушается на IPv4 `0.0.0.0` и IPv6 `::`. Команда поиска каталогов на `C:\Program Files\PostgreSQL` обнаружила только каталог версии 17; это не противоречит службе 18, поскольку путь службы указывает на диск X:. Таким образом, локальный сервер действительно слушает порт 5432, но пока не установлено, какой data directory и конфигурационный файл использует служба, и почему роль `Alekc` не проходит парольную аутентификацию. Нельзя делать вывод, что пароль PostgreSQL равен паролю Windows, и нельзя продолжать подбор. Для replay скрипту требуется право CREATE DATABASE; наличие запущенного сервера и открытого порта ещё не подтверждает наличие у пользователя подходящей роли. Assistant зафиксировал результат и обосновал следующий read-only шаг: получить точный ImagePath службы из реестра, PID владельца прослушиваемого порта и путь к процессу postgres; эти данные позволят сопоставить сервис, экземпляр и порт без чтения паролей/секретов и без изменения настроек. Атрибуция: команды и вывод выполнил/предоставил пользователь; интерпретацию и запись документации выполнил assistant. Никакие файлы приложения, SQL, роли, пароли, настройки PostgreSQL, базы данных или production не менялись; миграционный replay не запускался.
- **Следующий шаг:** выполнить только read-only команды:
  ```powershell
  (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\postgresql-x64-18').ImagePath
  Get-NetTCPConnection -State Listen -LocalPort 5432 | Select-Object LocalAddress, LocalPort, OwningProcess
  Get-Process -Name postgres -ErrorAction SilentlyContinue | Select-Object Id, Path
  ```
  Перед отправкой результата проверить, что в нём нет секретов; если ImagePath содержит параметры подключения/пароли (маловероятно), замаскировать их. Не изменять реестр или конфигурацию и не запускать migration replay до выяснения безопасного доступа к отдельной временной БД.


- 2026-11-16 — пользователь выполнил read-only проверку конфигурации службы и владельца TCP listener. Значение реестра `HKLM:\SYSTEM\CurrentControlSet\Services\postgresql-x64-18` для `ImagePath`: `"X:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" runservice -N "postgresql-x64-18" -D "X:\Program Files\PostgreSQL\18\data" -w`. Это достоверно определяет data directory данного Windows service: `X:\Program Files\PostgreSQL\18\data`. `Get-NetTCPConnection` подтвердил listener на `::` и `0.0.0.0`, порт 5432, оба сокета принадлежат PID 5632. `Get-Process -Name postgres | Select-Object Id, Path` вывел PID 4908, 5632, 5648, 5984, 5996, 6000, 6060, 6160, 6168, 6180, но поле Path оказалось пустым; поэтому сопоставление PID 5632 с конкретным executable пока не подтверждено напрямую, хотя PID совпадает с владельцем listener и служба PostgreSQL 18 настроена на указанный data directory. Парольная аутентификация роли `Alekc` по-прежнему не решена; права CREATEDB не подтверждены. Replay не запускался. Следующий шаг — запросить только метаданные Win32 процесса PID 5632 (`ProcessId`, `ParentProcessId`, `ExecutablePath`, `Name`) без полного CommandLine, чтобы не раскрывать возможные аргументы/секреты; после этого определить безопасный способ доступа к локальному экземпляру или отдельному disposable instance. Атрибуция: диагностику выполнил пользователь; assistant интерпретировал и документировал. Код, SQL, настройки PostgreSQL, роли, пароли, базы данных и production не менялись.
- **Следующий шаг:** выполнить:
  ```powershell
  Get-CimInstance Win32_Process -Filter "ProcessId=5632" |
      Select-Object ProcessId, ParentProcessId, Name, ExecutablePath
  ```
  Это read-only запрос метаданных процесса. Не выводить полную командную строку и не менять существующий data directory.


- 2026-11-16 — пользователь выполнил read-only запрос `Get-CimInstance Win32_Process -Filter "ProcessId=5632" | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath`. Результат: PID `5632`, ParentProcessId `4336`, Name `postgres.exe`; поле `ExecutablePath` пустое (не возвращено WMI для этого процесса). В совокупности с предыдущими результатами: Windows service `postgresql-x64-18` работает от `NT AUTHORITY\NetworkService`, его ImagePath запускает `X:\Program Files\PostgreSQL\18\bin\pg_ctl.exe` с data directory `X:\Program Files\PostgreSQL\18\data`; TCP listener 5432 принадлежит PID 5632, процесс называется `postgres.exe`. Это достаточно сильно связывает listener с локальным PostgreSQL service, но ExecutablePath для PID напрямую не подтверждён. Не установлены пароль/права роли `Alekc`, и не требуется их сбрасывать для тестового replay. Принято безопасное направление: вместо вмешательства в существующий кластер (его роли, пароли, pg_hba.conf, данные) подготовить отдельный временный PostgreSQL cluster в новом каталоге, на отдельном loopback-only порту; использовать его только для миграционного replay, затем штатно остановить и удалить только созданный временный cluster. Перед подготовкой проверить наличие штатных бинарников PostgreSQL 18 `initdb.exe` и `pg_ctl.exe` и доступность каталога/диска. Конкретные команды и параметры изоляции будут выданы после проверки версий; нельзя выполнять initdb в существующем каталоге `X:\Program Files\PostgreSQL\18\data`. Атрибуция: диагностическую команду выполнил пользователь; анализ и запись решения выполнил assistant. Никакие файлы приложения, SQL, роли, пароли, настройки существующего PostgreSQL, существующие базы и production не менялись; migration replay не запускался.
- **Следующий шаг:** проверить версии инструментов без запуска сервера и без изменения данных:
  ```powershell
  & 'X:\Program Files\PostgreSQL\18\bin\initdb.exe' --version
  & 'X:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' --version
  Test-Path 'X:\Program Files\PostgreSQL\18\bin\postgres.exe'
  Get-PSDrive X | Select-Object Name, Free, Used
  ```
  Затем подготовить отдельный disposable cluster в отдельном каталоге и на отдельном порту, с прослушиванием только `127.0.0.1`, не используя существующую службу и data directory.


- 2026-11-16 — продолжение работы по NEXT на актуальном `main`. Перед действиями заново прочитаны `docs/PROJECT_STATE.md` (blob `3b9bcadf9339c0c1adbe95af3d81fd770caefbea`), `docs/backend-audit/12-verification-script-migration-replay.md` (blob `333e6ff06e7b4dd23532662258e722097262ca34`), `docs/backend-audit/13-sql-migration-static-review.md` (blob `dbe4fc3df2bdf21eea4fd4eae2c0fe3d904e16f9`), `backend/package.json` (blob `47af7df351737185c05c26a79bf3a8880fe78880`), `.github/workflows/atomic-payment-integration.yml` (blob `1b8ba414f3086ba31b86dfad6e13769f3798ae4c`) и `.github/workflows/prodamus-checkout-tests.yml` (blob `b361f6cab965f20b907c5d355b806ea2aae1c018`). Из паспорта подтверждено, что текущий обязательный NEXT — clean disposable PostgreSQL replay `001_baseline.sql` + активные `010–148`, затем SQL integration и backend runtime suite; migration replay и полный runtime gate не подтверждены. `backend/package.json` определяет `npm test` как `node --test`. Workflow `atomic-payment-integration.yml` содержит PostgreSQL 16 service container и набор целевых backend/SQL regression steps; workflow `prodamus-checkout-tests.yml` — отдельные Prodamus checkout/webhook regression tests на Node 22. Для текущего документационного HEAD `4c39b779d5e2387a3bc8703f2a14806509281ebb` combined Vercel status возвращает `failure` с target `build-rate-limit`; workflow runs, ассоциированные с этим документационным commit, не возвращены. Это не является результатом тестирования кода и не доказывает отказ приложения; статус предыдущего deployment-bearing code commit нельзя переносить на текущий HEAD. Дальнейший replay требует локальных бинарников PostgreSQL 18; пользователь ранее подтвердил службу и каталог данных существующего кластера, но неизвестный пароль роли `Alekc` не должен сбрасываться, а существующий кластер/данные не должны использоваться для replay. Чтобы не блокировать независимую работу и не потерять требуемое от пользователя действие, создан `docs/USER_ACTIONS.md` (commit `a8eac2188bf687446343c30da706c1016c609512`) с задачей UA-001: read-only проверка версий `initdb`/`pg_ctl`, наличия `postgres.exe` и свободного места на X:. Там зафиксированы точные команды, ожидаемый результат, запреты и следующий безопасный шаг; запуск `initdb` и replay до отдельной инструкции запрещены. В этой итерации приложение, SQL migrations, workflow YAML и БД не менялись; runtime tests, PowerShell и PostgreSQL replay не запускались; чекбоксы не закрывались. Атрибуция: GitHub-файлы и статусы проверены ассистентом; локальные действия пока ожидаются от пользователя.
- **Следующий шаг:** продолжать независимый статический аудит и сверку backend/frontend contracts без изменения production; пользовательская задача UA-001 остаётся в `docs/USER_ACTIONS.md`. Не подменять фактический PostgreSQL replay mock/static assertions и не закрывать runtime gates до реального результата.


- 2026-11-16 — frontend audit package 01: перед работой повторно сверены `PROJECT_STATE.md`, `USER_ACTIONS.md`, `backend/index.js` (3111 lines), backend audit 09/11 и дерево GitHub main (976 tracked files; frontend source inventory retrieved). Прочитаны API transport, auth storage/context, user-scoped storage, billing helper, App shell/route guard, login/register/password-reset/email-verification/check-email flows, frontend package scripts and existing AUD-378/AUD-111. Найден FE-01: protected route `RequireAuth` напрямую обращался к `localStorage.getItem`, хотя браузер может бросить `SecurityError` при доступе к самому свойству `localStorage`; это обходило safe storage layer и могло ломать route rendering. Исправлено на main: `hasStoredAuthToken()` в `authStorage.ts`, route guard в `App.tsx` использует helper и fail-closed redirect; добавлен regression test на blocked storage и valid token. Commits: `701e41a1c0bd182f7fef297aba6905fb11e06475`, `fcdc0b7a4111122ec7e3a6e6045c67b48e7fa0cb`, `5ee28b947fd976eab977c9f768cffd02677e9f47`; audit report `docs/frontend-audit/01-auth-shell-api.md` commit `30c47437b1afb6dcc55451f4a470954b9d434a74`. Изменённые файлы перечитаны с main; шесть статических assertions прошли (импорт helper, вызов в route guard, отсутствие старого прямого localStorage чтения, делегирование к safe read, тест blocked storage, тест valid token). Runtime frontend tests/TypeScript/build не запускались; Vercel check для code commit `5ee28b9` возвращает `failure` с target `build-rate-limit`, что не является результатом frontend build. Отдельно зафиксирован следующий вероятный UX defect для focused follow-up: `Login` игнорирует boolean result `refreshUser()` и всегда переходит в `/app`; transient `/me` failure может оставить route при `user=null`. Это пока не менялось без отдельного теста/анализа. Обнаруженный в аудите security boundary: JWT хранится в localStorage, migration to HttpOnly cookie требует coordinated backend/CORS/CSRF design; не делать frontend-only миграцию. Полный frontend audit остаётся в процессе; Stage 0 checkbox переведён в [~], не в [x]. PostgreSQL replay и backend runtime gate остаются открытыми, UA-001 в `docs/USER_ACTIONS.md` ожидает read-only проверки пользователя. Production, базы и внешние provider accounts не затрагивались.
- **Следующий шаг:** focused review/fix of Login session hydration: проверить взаимодействие `refreshUser()` boolean, `RequireAuth`, `/me` failure states и existing tests; затем продолжить frontend file-by-file review. Не помечать полный frontend audit или frontend runtime checks выполненными до фактической проверки.


- 2026-11-16 — frontend audit package 02 выполнен на актуальном `main`. Перед изменениями повторно прочитаны `PROJECT_STATE.md` (до записи blob `9686e23ab21670eaa038e45ee9146ee548f39764`), `USER_ACTIONS.md` (blob `25c529a64d7066c157290e4057f8189dbd6daaf5`), `frontend/src/pages/Login.tsx`, `frontend/src/context/AuthContext.tsx`, `frontend/src/App.tsx`, `frontend/src/i18n/authCopy.ts`, `frontend/src/lib/api.ts`, frontend test inventory, `BoardsManager.tsx`, `persistedBoards.ts` + tests, `projectProvisioning.ts` + tests, backend project/board routes and helpers (`boardPatch.js`, `boardSerialization.js`, `projectProvisioningOrder.js`) plus corresponding tests and board idempotency SQL integration source. Найден FE-02: Login игнорировал boolean от `refreshUser()` и переходил в `/app` даже при неудачном `/me`; при transient failure token оставался, а user=null. Исправлено: Login остаётся на форме и показывает локализованную ошибку; добавлены `sessionLoadError`/`sessionLoading` для всех семи интерфейсных языков. Для прямого входа по URL дополнительно исправлен более общий риск: AuthProvider теперь публикует `isAuthReady` после первой попытки `/me`; RequireAuth не монтирует MainApp до завершения hydration и требует и token, и user profile. Route-state decision вынесен в `frontend/src/utils/protectedRouteState.ts`, добавлены четыре теста, включённые существующим glob `src/utils/*.test.ts`. Commits: `1afda7d2868bfddc8c14b145b1a7a1c0da0bd597`, `323f475e6588a96254aa18a6b63aaff64737a316`, `1f9411eb57d9fb737de2bf0a62aa7603748ae366`, `8f814fc2d3de9d7490a83e3d83afd1d598fb2846`, `332725f24c1bb5e4e5f68a69c8bd84f56cfc2678`, `371816c467b2de854bc14ea72384284957558cb4`, `4f3ddbd973c75ed2e41514211c326c83f376ebb3`, `472dc594a5cb0ea2d945918fad1189085cdb0522`; audit report `docs/frontend-audit/02-session-hydration-and-board-contracts.md` commit `817a1de8af99bb07a3a0006de952151be63a7d5b`. Board path source review: frontend create request UUID preserved across retry, per-user project provisioning coalesces concurrent requests, malformed board API responses fail closed; backend GET projects scopes to req.userId and stable sorts; POST boards validates project ownership and uses request fingerprint + unique conflict key; PATCH board performs owner check and strict allow-list; serializer strips internal idempotency metadata and project owner ID. Existing tests and SQL integration source reviewed, not executed; no additional board contract defect found statically. After commits, all changed source/test and board/backend files re-fetched from main; 15 static assertions passed. New protected route tests were verified present and included in configured test glob. GitHub Actions latest runs `43929679075` (frontend/backend), `43929679157` (postgres-atomicity), `43929788159` (frontend/backend) and `43929788203` (postgres-atomicity) failed before steps; Jobs API for `43929788159` showed frontend job `133518807878` and backend `133518808328` with `runner_id: 0`, `steps: []`; postgres job `133518808158` also had no execution steps. This is runner provisioning/pre-run failure, not a test/build result. Added `UA-002` to `docs/USER_ACTIONS.md` (commit `92ef27be1bacdf009220166a2121d92477c5996e`) asking account owner to inspect Actions budget/hard stop, payment status, repository Actions settings and permissions; no billing/permissions were changed. UA-001 (read-only PostgreSQL 18 binaries/disk check) remains pending. Mandatory NEXT in this file remains disposable PostgreSQL replay `001_baseline.sql` + active `010–148`, SQL integration suite and backend runtime suite; this session cannot execute local PowerShell/PostgreSQL and Actions runners remain unavailable, so those gates are not marked complete. Vercel check for latest test commit `472dc594a5cb0ea2d945918fad1189085cdb0522` remains `failure` with target `build-rate-limit`, not a build result. Frontend full file-by-file review remains [~], TypeScript/test/build checklist remains [ ], no production/DB/payment/provider account was touched.
- **Следующий шаг:** обязательный NEXT — дождаться выполнения UA-001 (проверка бинарников/места для изолированного PostgreSQL replay) и UA-002 (восстановить GitHub Actions runner execution); затем выполнить clean replay, SQL integration и backend runtime suite, записать реальные логи и только после этого закрывать DB/backend gates. Независимый frontend audit можно продолжать параллельно, но он не заменяет NEXT и не должен менять приоритеты или отмечать непроверенные runtime gates как выполненные.

- 2026-11-16 — frontend audit package 03 выполнен. Перед действиями повторно сверены актуальные `PROJECT_STATE.md` (blob `62b62efcd07a79a49c86eacd33047a0cfe4ae21c`), `USER_ACTIONS.md` (blob `e948206da5303bf286ac1a27b5d83acae7ba2885`), дерево frontend source/test inventory и актуальные generation/pin frontend/backend files. Прочитаны `PinGenerator.tsx`, `PinCanvas.tsx`, `pendingGenerationRequest.ts` + tests, `generatedPinsResponse.ts` + tests, `savedPinsResponse.ts` + tests, `generationRetry.ts` + tests, `generationRecovery.ts` + tests, `pendingPinSaveQueue.ts` + tests, `pendingPinDescription.ts` + tests, `pinDescriptionSaveGuard.ts` + tests, `pendingPinDescriptionSwitch.ts` + tests, `pinAspectRatio.ts` + tests, `pinTitleSelection.ts` + tests, `generationTopic.ts` + tests, `pinGeneration.ts`, `PublishPinButton.tsx` (первичное чтение), backend `index.js` generation/recovery endpoints, `pins.js`, `generationRecovery.js`, `generationPricing.js`, `pinPatch.js`, `pinStatusGuard.js` and related provider-boundary/recovery/credit reservation/completion SQL test sources. Найден FE-03: PinCanvas не обрабатывал загрузку remote image, отсутствие 2D context, CORS tainted-canvas `SecurityError` от `toDataURL()` и rejected/unavailable Clipboard API; это могло приводить к неотловленной ошибке без сообщения пользователю. Исправлено: canvas export и clipboard операции обёрнуты в обработку ошибок, показывают доступное `role=status` сообщение; добавлены `exportFailed`/`copyFailed` в TranslationSchema и все семь UI locales. Commits: schema `39cb8735dd3e98a28d8f425201ff44837270c66f`, locales `a5f8482da26ad3f959e8be175372d4b4d1b0059e`, `eabfcebe4836cbe40efce43da25a97966a53a693`, `25557ea5f74b9e91dc5db24a269d69d509dfea5d`, `698f7e4789c91fe64f1418b72f2503abdba4c422`, `af15a572fdb06fda04f7ffe36452f56041c6fed4`, `d5f3af5333f4b91ecfe88d9684bb2bd8f8b1eb3e`, `03c6826c1cad0c5ca76a9c2a117e1ea9cbd34f1f`; PinCanvas fix `3abb4ca821d54f62c3b446b9145360b488adbf01`. Audit report `docs/frontend-audit/03-generation-recovery-and-pin-editing.md` commit `58400a8e4fc112f37499d4027b2b81f58b16f8e6`. После изменений все 9 changed source/locale files перечитаны из main; 7 static assertions passed. Generation/pin backend+frontend contracts повторно прочитаны с main; ещё 10 static assertions passed. Всего 17 статических assertions прошли: key persistence before generation POST, malformed-response recovery, ambiguous key retention, owner-scoped recovery lookup, serializer private-field filtering, serialized per-pin saves, compare-before-clear description drafts, strict pin patch allow-list, published/unknown status rejection and reservation/completion RPC presence. Source review не заменяет runtime tests. CORS browser export, Clipboard permission flows, frontend TypeScript/tests/build, backend runtime tests and SQL integration were not executed. Vercel status for code commit `3abb4ca821d54f62c3b446b9145360b488adbf01` remains `failure` target `build-rate-limit`, not a build result. Static review did not reveal further generation/recovery/pin edit contract defects. Dedicated `PublishPinButton`/Pinterest publishing audit remains open. UA-001 and UA-002 remain pending in `docs/USER_ACTIONS.md`; mandatory PostgreSQL replay + SQL/backend runtime gates are still not executable until those blockers are resolved. Production, DB, provider accounts and deployment config untouched.
- **Следующий шаг:** обязательный DB/backend NEXT остаётся заблокирован UA-001/UA-002. Продолжать независимый frontend audit package 04 по Pinterest publishing/account lifecycle (`PublishPinButton`, OAuth/account selection, schedule publish/reconciliation), не менять production и не закрывать runtime gates до реального запуска.

- 2026-11-16 — frontend audit package 04 выполнен. Перед изменениями перечитан `PROJECT_STATE.md` (blob `998d686afbfb2814fe423ab397cc21fe3fb5b41e`), дерево `main`, `PublishPinButton.tsx`, `PinterestCard.tsx`, publish/schedule helpers and tests, backend `pinterest.js` (OAuth, account, manual publish and worker routes), OAuth browser binding, token refresh/account record helpers and backend OAuth/publish/scheduler/security tests. Найден FE-04: `PublishPinButton` и `PinterestCard` загружали Pinterest account data только при mount и не инвалидировали старые async responses при смене authenticated user; stale account/board data and late completion could be reflected in a component mounted under another user. Исправлено: оба компонента привязаны к `useAuth().user.id`; при смене owner очищаются account/board/publish UI state; status/board requests получают generation IDs and stale responses are ignored; PublishPinButton ignores previous owner's completion/error and doesn't release a new owner's publish lock. Commits `669b0131e23e9d884a407f5da9b0ab2c3df7f9cc` and `8b17d28e0cf8a633b6434c3d1931a48e29f91825`; audit report `docs/frontend-audit/04-pinterest-publishing-and-account-lifecycle.md` commit `310f951eada558276765bea81d011302cea26d70`. Readback of changed components and 7 supporting frontend/backend files from main; 16 targeted static assertions passed after correcting the explicit-board test assertion to its actual test fixture. Reviewed frontend publish success/ambiguous outcome handling, numeric Pinterest URL construction, exact account/board selection, schedule mutation reconciliation, unknown status fail-closed and retry reason sanitization. Backend source review covered OAuth signed state + browser binding + token_version + single-use attempt, HttpOnly Secure SameSite=Lax cookie, timing-safe browser proof, token encryption and optimistic key migration, account-scoped 401 refresh and bounded 429 retry (disabled for non-idempotent publish), owner/approved pin/remote board checks, atomic publication reservation and exact durable ledger reconciliation, scheduler secret/claim lease/heartbeat/fencing. Existing backend test and SQL concurrency scripts were read, not executed. No new backend contract issue found statically. No frontend tests, typecheck, build, live OAuth, Pinterest API call, worker or SQL concurrency test was run. Remaining scale note: Pinterest rate-limit middleware is process-local MemoryStore and needs shared store before horizontal scaling. UA-001 and UA-002 remain pending; mandatory clean PostgreSQL replay `001_baseline.sql` + active `010–148`, SQL integration and backend runtime gates remain open. No production data, external account, OAuth credential, payment provider or deployed config changed.
- **Следующий шаг:** mandatory PostgreSQL/SQL/backend runtime NEXT remains blocked by UA-001 and UA-002. Continue independent frontend audit package 05 on calendar/scheduling UI and its reconciliation paths; specifically inspect the user-visible schedule creation, retry, cancel, board/account reassignment and status display against backend routes and persistence helpers. Do not mark runtime or full frontend audit complete without actual execution.

- 2026-11-16 — frontend audit package 05 выполнен. Перед работой повторно прочитаны `PROJECT_STATE.md` (blob `5ba805b5d528db207bcd7a5dfc808e94d5914f07`), `USER_ACTIONS.md` (после обновления UA-002 blob `314e57599511a10c63ca721b8748cf13888ad386`), `App.tsx`, `PublishingCalendar.tsx`, timezone and persisted schedule helpers/tests, schedule mutation/status/retry/selection helpers, and backend schedule routes in `index.js`. Найден FE-05: MainApp cleared schedule state and cancelled stale GET loads on user change, but five in-flight mutation handlers (schedule create, legacy account reconcile, failed-board change, retry, cancel) did not fence results by initiating user ID; a delayed response could update the new user's calendar or surface an old user's error. Исправлено: every handler captures owner ID and checks it after each awaited API call, before fallback reconciliation, state mutation and error display; stale completions are ignored. Added pure `scheduleOwnerFence.ts` and three tests. Keyed `PublishingCalendar` by `user.id` to reset its modal/selection/action lock/replacement-board state on identity change. Commits `b23942f52bb66627ce15ee08246aed39116c02ad`, `9ead7017998cce86033ed8bd2163a51316bb8deb`, `354de281e5bc19bbcc2e373768d78e3ce63d7208`, `002ed2d8718ca03d5291855d4bb96dc5da47ba51`, `2a61bc317b2c8384aea20f572462076bcb655f61`; audit report `docs/frontend-audit/05-calendar-scheduling-and-owner-fencing.md` commit `d376ef6cb32354e2527322d8c36befe6a9309658`. Re-read App/helper/test/timezone/persistence/reconciliation/backend files from main; 17 targeted static assertions passed, including all five handlers capture owner, every awaited API call guarded, stale errors suppressed, calendar remount, helper tests, DST tests, user-scoped GET schedule and failed-only retry/board change and conditional cancellation. Existing timezone and schedule tests reviewed but not executed. No runtime test, typecheck, build, browser test, backend test, PostgreSQL replay, SQL integration or worker was run. Latest Actions runs `43931336693` and `43931336611` still failed before runner execution; frontend/backend jobs `133524232523`, `133524233122` and postgres job `133524233003` all had `runner_id: 0`, `steps: []`. Vercel status for code commit `2a61bc317b2c8384aea20f572462076bcb655f61` remains `failure` target `build-rate-limit`, not a build result. Updated UA-002 evidence in `docs/USER_ACTIONS.md` (commit `ed42d6aff101f81e12b086e88a2b359a49052f0f`). UA-001/UA-002 and mandatory clean disposable PostgreSQL replay `001_baseline.sql` + `010–148`, SQL integration and backend runtime gates remain open. No production data, live schedules, external accounts or deployment config changed.
- **Следующий шаг:** обязательный DB/backend NEXT остаётся заблокирован UA-001/UA-002. Продолжить независимый frontend audit package 06 по billing/credits/subscription/payment return UX, сверить frontend с backend billing routes and Prodamus webhooks; никаких реальных платежей или изменений тарифов не выполнять.

- 2026-11-16 — supplemental review and documentation reconciliation. Confirmed package 05 was already complete in the current passport, then localized seven Russian-only calendar recovery strings across all seven UI locales; nine source/schema/locale files were re-read from main and eight targeted static assertions passed. Commits: locale `524d01db`, `80c44dac`, `0bc94edd`, `1663aa2c`, `1351a10e`, `1b36c2c3`, `f6bec75e`; schema `b01f2cc5`; component `83932ff0`. Follow-up is recorded in `docs/frontend-audit/05-calendar-scheduling-and-owner-fencing.md` (commit `61b97f6c`). During package-06 continuation, found that a canonical billing/checkout audit report already existed on main (`docs/frontend-audit/06-billing-credits-and-checkout.md`) and package 06 had already been completed in a parallel mainline update. Re-read the latest billing sources, confirmed owner-scoped checkout/idempotency behavior, and ran 14 additional static assertions (all passed). Consolidated the readback and a pricing-page localization/feature-claim follow-up into the canonical package-06 report (commit `f799e467`); removed the duplicate report accidentally created during this continuation (commit `50762d4f`). No additional product source changes were made for billing. Pricing plan feature arrays and mixed-language metadata remain a documented follow-up, not a payment-settlement defect. The authoritative package-06 completion record is the existing report and the immediately following package-06 journal entry below. No tests/typecheck/build/browser/DB/provider calls were run in this supplemental pass; no production payment or settings changed.
- 2026-11-16 — frontend audit package 06 выполнен. Перед изменениями повторно сверены `PROJECT_STATE.md` (blob `8e613ed6ac354551061e3b4a4ef3fc534f95a3bf`), `USER_ACTIONS.md` (после повторной CI-проверки UA-002 blob `acf231a334949e781245589e1c48f432170adc08`), `PricingView.tsx`, `frontend/src/lib/billing.ts`, owner/terminal status/credit order helpers and tests, backend `billing.js`, `creditsBilling.js`, `creditPacks.js`, `credits.js`, `prodamus.js`, `paymentCreationIdempotency.js`, `paymentOrderId.js`, `prodamusWebhookBody.js`, `billingWebhookAudit.js`, billing routes in `index.js`, and webhook/idempotency/settlement/credit concurrency test sources. Найден FE-06: `payAndRedirect` / `buyCreditsAndRedirect` navigated inside library after awaiting create-payment; a response from the previous authenticated user could redirect the newly logged-in account to the wrong payment page. Исправлено: PricingView now starts payment intent, checks captured owner against `billingOwnerIdRef`, and only then redirects; checkout lock/loading/error reset on owner change. Найден FE-07: localStorage checkout idempotency keys were global by product scope, while backend keys are correctly scoped per user; one user's terminal poll could remove another user's pending key, allowing a later duplicate provider invoice. Исправлено: key includes encoded owner ID; start/release APIs and redirect wrappers require owner ID; polling releases only the current owner's key; added 3 regression tests. Commits `ee54da1181de479cba45b18b654ef5096b3261bf`, `7d673859f868faec6fc55b5df02769a5f2bc1b2c`, `239f851df6a5896a9084b8534dd2aa2aff248fdb`, `d8e1666d7ba36ba1c6aba26a3fd76297a4ae2ca4`, `4ba01aca38b768ed3d01aa7262743335a59fad4d`, `6b17db6fa8a0f0e850f79278eb02acaa31699f73`; report `docs/frontend-audit/06-billing-credits-and-checkout.md` commit `d55f4f9f7063853ac90dc9902ca1ad920985023d`. Re-read billing library/PricingView/key helper/tests/backend billing/webhook/settlement sources from main; 17 targeted static assertions passed. Reviewed server-owned price catalogs, user-scoped payment creation idempotency and fingerprint, cryptographic order IDs, Prodamus HMAC signing and constant-time webhook verification, bounded multipart parser, production demo guard, signed amount/currency match, mismatch audit, atomic subscription activation/credit fulfillment, exact checkout settlement and settled URL non-replay. Existing tests and SQL integration/concurrency scripts inspected but not run. No real payment/provider/webhook/production DB was used. Newest runs after code commit `6b17db6fa8a0f0e850f79278eb02acaa31699f73`: Actions `43932071627` (frontend/backend) jobs `133526852206` and `133526852641`, and `43932071691` (postgres-atomicity) job `133526852798`; all report `runner_id: 0`, `steps: []`. Actions remain pre-runner blocked. Vercel status still `failure` target `build-rate-limit`, not a build log. UA-002 was updated with these exact results in `docs/USER_ACTIONS.md` commit `cd6a847ae5d6010623600ad05b6ff2d84d63b240`. UA-001/UA-002 and mandatory disposable PostgreSQL replay `001_baseline.sql` + active `010–148`, SQL integration and backend runtime gates remain open. No production payment, provider config, user balance, DB or deployment setting changed.
- 2026-11-16 — frontend audit package 07 выполнен в ограниченном source-review scope. Перед работой сверены `main`, `PROJECT_STATE.md`, `USER_ACTIONS.md`, admin billing components, Settings/account export/deletion helpers, backend account/admin routes and Russian/English legal documents. Проверено, что admin read routes защищены `requireAuth` + `requireAdmin`, account export/deletion требуют auth, deletion дополнительно rate-limited и password re-authenticated, а physical cleanup отделён от request handler. Исправлены factual UX inconsistencies: privacy policies теперь описывают self-service export с support fallback; Terms описывают self-service deletion, password re-authentication, immediate access restriction и отдельную физическую очистку; admin subscriptions empty state больше не предлагает demo payment. Изменённые source/docs commits: `832781a4f16a240129dc322172cc62887f20cfda`, `7f9af42658bc41c093b1af630a1f4ae2b14a646d`, `746a3649feb513e3af46a3d0a0c5cdbfc86043e9`, `4960ef76b82a8e4938fa0968e5f6e9011aa45c89`, `865771849e5453e24317a66e77e30601532cfa81`; audit report `docs/frontend-audit/07-admin-account-privacy-legal.md` commit `7de4dff457a5b39c8d399f0bdf4f5c30e01fafce`. Все 8 изменённых/связанных source files перечитаны с main; 11 targeted static assertions passed. Existing `accountDataExport.test.ts` прочитан, но не запускался; no test/typecheck/build/browser/backend runtime/SQL integration was run. UA-001/UA-002, clean PostgreSQL replay `001 + 010–148`, SQL integration and backend runtime gates remain open. No real payment, admin mutation, account deletion, production DB or deployment setting changed.

- 2026-11-16 — frontend audit package 08 завершён для shared API fallback errors. Обнаружено, что `frontend/src/lib/api.ts` показывал локально сгенерированные network/invalid-response/generic ошибки по-русски даже при другой локали интерфейса; i18n provider уже сохраняет локаль в `pinposy_lang`. Добавлен чистый resolver `apiErrorMessages.ts` с текстами для en/ru/es/pt/de/fr/zh, English fallback для неизвестной локали, и regression tests; `api.ts` использует сохранённую локаль только для клиентских fallback сообщений, backend-provided errors не изменяются. Commits: `76e982d4675f38ce4aebe90ac0072e315b731814`, `b4b2f8bff7803c79599e0fc1272702766e3b0f69`, `0f159a2897c1b503b0dce639d34b8df343725be7`; report `docs/frontend-audit/08-api-error-localization.md` commit `16e90a023481d6af6ed1248194ef60737b0a7e01`. Changed files and i18n provider re-fetched from main; 8 targeted static assertions passed. New test source inspected but not run; no typecheck/build/full frontend suite/browser test/live API call occurred. Backend-provided error localization remains a separate follow-up requiring stable error codes. No backend/DB/production/deployment/payment state changed.

- **Следующий шаг:** mandatory DB/backend NEXT remains blocked by UA-001/UA-002. Frontend audit package 09 is in progress; continue remaining user-facing flows, accessibility and cross-locale behavior after the focused board-category correction recorded in `docs/frontend-audit/09-board-category-localization.md`. Keep the full file-by-file review open. Do not mark runtime or production gates complete without actual execution.

- 2026-11-16 — supplemental package-07 pass after the canonical package-07 audit was already recorded by a concurrent documentation update. Avoided overwriting that record and merged the extra findings into canonical `docs/frontend-audit/07-admin-account-privacy-legal.md` (commit `988d4f153fad1fa6705cea7ab4ffad4bc14fa44a`). Removed the duplicate report created during the parallel pass (`docs/frontend-audit/07-admin-account-settings-and-privacy.md`, deletion commit `1560f873515603104a3b49edda51c424d749b43d`). Additional changes on current `main`: `SettingsView` now fences account export/deletion by owner + request generation, ignores stale responses/errors and cancels the previous owner's delayed logout timer; helper/test commits `3fbb10d404329790a8aaa8651d0aec6539258f53`, `f528453643d2e0227a7ec0a2f1264200307c6170`, `4935297e40b55de313ae7f0d1d4ab0c027196e17` and Settings change `90f76a1949fccb6070fe5aa161af6ac9b07e00e5`. Account export completeness is now checked against format version, account object, all required arrays and empty `degradedSections`; incomplete/malformed export still downloads but displays accessible localized warning. Helper/test commits `129c6e45a432e87c449615f7de2c8c7d1d736928`, `e532cf60fb182ec604f362168bccdda643e97899`; translation schema `7ee28c0ac680972dfe0fcab8bcc1df95f2acc48e` and locale commits `5cb84619e5405f06ec24ca5526c0e677ffb42e95`, `11a56053b8758eb017bc9b08f487ea2f8f1e69f5`, `47f73973192ce0f230133b833fdc7d1cd936b2d4`, `448955863cdea7bcb28c75de2bbfa4b33f5eb31d`, `b7a666c7659769597ab9854ab8adb50edc7a457b`, `a92589e7396e3ac4e894b19e76c7667333f0eea6`, `bfbf38c26c3b5bd1431e0dc6542f012a2baafbd2`; UI warning `075b73d23b908a9c758bc69f4b7f0dc8f66ae41c`. Russian privacy policy now includes same public image URL disclosure as English because `pin-images` bucket is explicitly required public by `backend/pinImageLifecycle.js` (commit `0cd90e941deecd487f9a086037d10569eee222c5`). Added UA-003 to verify production deletion worker opt-in, startup/batch logs, staging deletion proof, subprocessors/regions and legal operator/payment details (commit `67b52e2b02cf02f693f7db90b2ff57331e235ee6`). After changes, 13 static assertions passed across Settings/helpers/tests/legal policies/locales and 10 more passed across account lifecycle/worker gate/backend routes/admin middleware/tests; 22 admin route declarations were checked to all include `requireAuth, requireAdmin`. Total 23 assertions. No test/typecheck/build/browser/worker/production deletion/export/admin mutation/backend runtime/SQL execution was performed. Canonical package-07 report includes both the original audit and this supplemental section. The full frontend audit remains open; mandatory PostgreSQL/SQL/backend runtime gates remain blocked by UA-001/UA-002. No production account, data, payment, DB, storage access or deployment config was changed.
- 2026-11-16 — additional legal-language correction consolidated into completed package 07. The canonical report now records commits `db568278`, `b16187d5`, `33cdccbf`, `6b684d6d`: the privacy modal and public legal pages follow the selected app language, using Russian for RU and English for all other supported UI locales because the legal texts exist only in RU/EN. Added resolver tests for RU/EN/ES/PT/DE/FR/ZH and unknown values. The four files were re-read from main and static assertions passed; test execution remains blocked by UA-002 runner provisioning. Report addendum is in `docs/frontend-audit/07-admin-account-privacy-legal.md` (commit `2d0cbcbc`). No legal terms, retention promises, production flags or worker settings were changed. Package 07 remains complete; next independent frontend audit remains package 09.

- 2026-11-16 — CI gate повторно проверен после frontend audit package 08 и supplemental package-07 updates. Текущий `main` на момент проверки: `5ed3e72f7f86dd4844fe8b63eae545edb8d2ecde`. GitHub Actions runs `43933655454` (frontend/backend) и `43933655423` (postgres-atomicity) завершились `failure` до запуска runner; jobs `133532411549`, `133532412261`, `133532414220` имеют `runner_id: 0`, `steps: []`. Vercel combined status для HEAD также `failure` с target `build-rate-limit`, без build log. Эти результаты внесены в `docs/USER_ACTIONS.md` commit `2dec265e0c901dfcb88ee8f758c2b8798f7ef581`. Это инфраструктурный blocker; ни один тест/build/SQL не считается запущенным. UA-001, UA-002 и UA-003 ожидают владельца; не менять PostgreSQL auth, Actions billing/permissions, production worker/env или storage config без согласования.


- 2026-11-16 — frontend audit package 09 focused cross-locale pass: обнаружено, что `BoardsManager.tsx` показывал сохранённый `board.category` напрямую, хотя формы создания/редактирования и все семь locale dictionaries уже имели переведённые подписи. Добавлен `frontend/src/utils/boardCategoryLabel.ts` (canonical + historical English aliases, case/whitespace normalization, unknown/custom values preserved), три группы regression tests в `frontend/src/utils/boardCategoryLabel.test.ts`, и компонент переведён на resolver. Commits: `de912512041726b7147421066bcc9f6edfff4bf5`, `176ee85bb6bceb3cb8c8d2c441debe0e0861f90d`, `306a5c2cf3cd1dbef615b9a045e689a4ba7e6c78`; report: `docs/frontend-audit/09-board-category-localization.md` (commit `134343b64ee92abdb744c5161c0f9fd9f9dec00f`). Helper, test, component and seven locale files re-fetched from `main`; 9 targeted static assertions passed. Test source inspected but NOT executed; no typecheck, frontend suite, production build, browser/accessibility run or live API call. Actions runs `43934127735` and `43934127669` were queued at the latest observation on HEAD `16d4c1a9f0e786248551c36a695258ba9c56f33e`; Vercel status for code commit `306a5c2c` was `failure` with target `build-rate-limit`, not a build log. This closes only the identified board-category localization defect, not package 09 or the full frontend audit. No backend, database, production data, payments, Pinterest account or deployment configuration changed.


- 2026-11-16 — frontend audit package 09 additional onboarding pass: в `OnboardingWizard.tsx` website URL input и product textarea не имели programmatic accessible name/description; selected plan buttons не сообщали screen reader состояние выбора; основной inline error не имел alert semantics. Дополнительно price loading/unavailable и profile-refresh error были жёстко заданы только для RU/EN, поэтому ES/PT/DE/FR/ZH получали английский fallback. Исправлено: добавлены `aria-labelledby`/`aria-describedby` через переведённые заголовки и описания, `role=alert`, `aria-pressed`; добавлены `profileRefreshError`, `priceUnavailable`, `priceLoading` во все семь onboarding locales; hard-coded language branches удалены. Добавлен `frontend/src/utils/onboardingCopy.test.ts`; существующий test glob уже включает файл. Commits: locale `ea43db939ac33b84b56501e39d910b9285557109`, component `949f87cebcc29d20d2bc53c1453820a892ba64d0`, test `3fea0bfb3b9dc8b0ff24380344aef310136e2cc2`; report addendum `docs/frontend-audit/09-board-category-localization.md` commit `b0f1f5abab96bfb81e906f72e1db01cfabadcc61`. Component, locale copy and test re-fetched from main; 10 targeted static assertions passed. Test source inspected but NOT executed; no typecheck, frontend suite, build, browser or screen-reader run. Package 09 and full frontend audit remain open. No backend, database, production data, payments, Pinterest accounts or deployment settings changed.


- 2026-11-16 — CI follow-up after onboarding accessibility/localization changes: runs `43934717765` (frontend/backend workflow) jobs `133536188888` (backend) and `133536189382` (frontend), plus `43934717604` (postgres-atomicity) job `133536188154`, all ended `failure` with `runner_id: 0`, `steps: []`. No runtime tests, typecheck, build or SQL steps ran. Vercel status for code commit `4d1d7785c453783ec512e45bab911d99ebec91dc` is `failure` with deployment rate-limit target `build-rate-limit`, not a source build log. Latest evidence is also recorded under UA-002 in `docs/USER_ACTIONS.md` (commit `92a8611807c9d955b4774839dddfe1f234c112fa`). This remains an external owner-action blocker; do not treat code checks as passed or failed.

- 2026-11-16 — frontend audit package 09 supplementary pass: found unbounded avatar file input/localStorage data-URL persistence with silent quota failures; added JPEG/PNG/WebP/GIF allowlist, 1 MiB limit, FileReader error/abort handling, persist-before-state boolean result, accessible feedback and messages in all seven locales. Commits: schema `4b65c84e8988849bc33f68d53491720bae4e7d6f`; locale commits `64f8b9eac70f94ca8464919a40524db2806c28ab`, `93ee384d9c144aaa3139308a0fb3c35cd947f0e0`, `1bdebfd783b8833ed5cd963b8fcfa37b0b7d1362`, `fe1dc116dd61728f7df382d437ff78e353bfa7cd`, `b5b6f236fff972057aad71667746afde3f67b5e8`, `629df2fa30011a022708ec9976570c613a0ff558`, `2b8e0da5f60a9fa3e3f7c7cdbe161efbec726a66`; AuthContext `16d4c1a9f0e786248551c36a695258ba9c56f33e`; helper/tests `d1a794e196de2383e049abe96dade167bb915d2a`, `a0c106d6f9357ddfbefcdcf08ea915823a0217f2`; Sidebar `608b27f5af33f25065b1708894252eed7faa4ab0`. Found and fixed remaining hardcoded Russian email-address label in email verification banner by adding `emailVerifySentTo` to all seven locales and retaining owner-fenced resend; commits schema `af74e1721da58d1228edd6ca7fb79661160edab7`, locales `ed5d8e15798d9f3272b8ad67761f9896300c0f27`, `8ee54e9d838757f4f828fb00e10f3b71603da1a1`, `069a79f43a68b19d5b492f49b1fcba17a7dedbc1`, `1fafd010c7fb6114b9ca353b4168e53db5fa4b4c`, `1560b64805a65672ed8d1e6f257e5d9e53bd5e9b`, `37f5c5f4c6c7d4eb1a21c11be909c25ef7c6f4b0`, `300636b94d96396da4687415e6a15f8fa985fa17`; component `63b1758fef698bcda2efe722fba73984d606f10a`. Re-read notification context/helper/tests and confirmed owner-specific load/save keys, in-memory owner tags and retirement of old global key; existing commits `14e9b46518bfcb7582e4b04ab590df77f4f94b67`, `614b08149ec4c3afa763a0d17de33770b9d625af`, email banner base `b9582025d1830bb2424bb0b381c12bedfbe0f2f7`. Merged avatar, email and notification findings into canonical `docs/frontend-audit/09-board-category-localization.md` commit `9c13296c2b085613131dfd91fc2af7133b0e4b17`; removed duplicate `09-avatar-upload-safety.md` commit `6c858c39c5b6b992b1e6acaea1cbb1fdcc08947f`. All relevant changed files re-fetched from main; 19 targeted static assertions passed across avatar and email/notification checks. Test sources inspected but not run; no typecheck, frontend suite, build, browser, screen-reader, file-upload or account-switch runtime tests were executed. Package 09 remains open; no backend/DB/production/payment/provider/deployment settings changed.
- 2026-11-16 — CI gate повторно проверен на актуальном `main` HEAD `9c13296c2b085613131dfd91fc2af7133b0e4b17`. Actions runs `43934727147` and `43934727130` завершились до runner; jobs `133536221831` (frontend), `133536222301` (backend), `133536219993` (postgres-atomicity) имеют `runner_id: 0`, `steps: []`. Vercel combined status для HEAD — `failure`, target `build-rate-limit`, build log отсутствует. UA-002 обновлён в `docs/USER_ACTIONS.md` commit `b459659a6f8689df6dcc51ec1c634d777838613d`. Тесты/typecheck/build/SQL по-прежнему не запускались; UA-001/UA-002/UA-003 требуют действий владельца.


- 2026-11-16 — frontend audit package 09 additional auth accessibility pass: ошибки регистрации, входа, запроса сброса пароля, установки нового пароля, повторной отправки verification email и подтверждения email отображались визуально, но не имели последовательной alert semantics для screen readers. Добавлен `role="alert"` в error containers шести публичных auth pages: `Register.tsx`, `Login.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `CheckEmail.tsx`, `VerifyEmail.tsx`. Commits: `41dca2b53243c782879bfecc7347d1374ea8ce79`, `760513e8527ca6dac652cd636b16b2c269504f23`, `4ee0aa1954a54b08497d9b038ea94e15099bdc0b`, `8ce691456ec0661f80b03ff018f3f4c17df3e3f7`, `3457433123fd0c9462f2becf19a391552f60129c`, `e7ef6fb0e56671a286ba74988d26410161161ed7`; report addendum `docs/frontend-audit/09-board-category-localization.md` commit `277dfe9f6925b5213fa170d4a12475ded11fee9b`. All six files re-fetched from main; six targeted static assertions passed. No automated test, typecheck, browser or screen-reader run. This improves announcement semantics but does not certify full WCAG conformance. Package 09 remains open; no backend/DB/production/payment/provider settings changed.


- 2026-11-16 — CI follow-up after auth error announcement fixes: runs `43934941679` (frontend/backend) jobs `133536953346` (frontend) and `133536953936` (backend), plus `43934942905` (postgres-atomicity) job `133536957984`, all ended `failure` with `runner_id: 0`, `steps: []`. Runs `43934960067` and `43934959915` on current HEAD were still queued at observation time. Vercel status on code commit `277dfe9f6925b5213fa170d4a12475ded11fee9b` was `failure` with `build-rate-limit`; no build log. No runtime tests, typecheck, build or SQL replay are confirmed as executed. Latest UA-002 evidence is recorded in `docs/USER_ACTIONS.md` (commit `033f8d28be7c751503cd91ed0ef5305be6c2caee`). This remains an external account-owner blocker.

- 2026-11-16 — package 09 auth locale cleanup: `Login.tsx` and `Register.tsx` used hard-coded English `Email` labels despite existing `t.email` translations. Replaced both with the shared translated label. Commits `c59619ecf9eeb9efbae1a6e6ef41f9be38ef1e65` and `34599433cc6faed3c978325a62f56d68a34661b8`; report addendum `docs/frontend-audit/09-board-category-localization.md` commit `87e59e5b06f71185e4c88877edcf5b2a2f59420b`. Both files and report re-fetched from main; 4 targeted static assertions passed. No browser/keyboard/screen-reader test run. Package 09 remains open.
- 2026-11-16 — CI gate повторно проверен на `main` HEAD `2d0197be25d8467618bb51c51348074033eb3e9b` после auth accessibility/locale changes. Actions runs `43934958706` и `43934958250` завершились до runner; jobs `133537015661`, `133537016279`, `133537014159` имеют `runner_id: 0`, `steps: []`. Vercel status для HEAD — `failure`, target `build-rate-limit`, build log отсутствует. UA-002 обновлён commit `784c3042562b2932cd73604e9dd33a8752cc7f79`. Никакие frontend/backend tests, typecheck, build или SQL steps не запускались; UA-001/UA-002/UA-003 остаются owner blockers.

- 2026-11-16 — frontend audit package 09 auth keyboard accessibility follow-up (FE-17): найдено, что кнопки показа/скрытия пароля в Login/Register имели `tabIndex={-1}` и были недоступны в обычной клавиатурной навигации. Исправлено: обе кнопки возвращены в tab order, получили локализованный `aria-label`, `aria-controls="password"` и `aria-pressed`. Добавлен `frontend/src/utils/authPasswordToggleAccessibility.test.ts`; существующий test glob `src/utils/*.test.ts` уже включает его. Commits: Login `dedd6a5e3b89aedca279d025a5a918627434212a`, Register `a5e457083cbd47b2d89dc2eaefb7be746641efd3`, test `f81ba4f165c74db1e4a2b792783234b53e6f340f`, corrected selector `133e67741c92000364ddde6ba83f24e319e47b71`; report addendum `docs/frontend-audit/09-board-category-localization.md` commit `11267635ff05333d1d15754f7e7fa79f20f85964`. Повторно получены с main обе страницы, test source и package.json; 5 targeted static assertions passed. Test source inspected but NOT executed; no typecheck/full suite/browser keyboard/screen-reader run. Package 09 and full frontend audit remain open. No backend/DB/production/payment/Pinterest/deployment changes.


- 2026-11-16 — frontend audit package 09 navigation accessibility localization: mobile navigation toggle в `Header.tsx` имел hard-coded English accessible name. Добавлен типизированный `nav.openNavigationMenu` и переводы во всех семи locale dictionaries; Header использует `t.nav.openNavigationMenu`. Commits: schema `b2431ac04d144c52392854591166ec5ab3fc6ceb`, EN `a3dd8939282c3dccc41d4a6c3fa723fe64383c0d`, RU `f61e9a2177721aabe6aa7cef3462af1d2acf6732`, ES `a3e72f7138a477eb03d5a927999723374bf54757`, PT `17ff73840ae4802cfb96c21f046b67ad0c582d2a`, DE `b7c7986b6c9cbcd8272b6a0003c975b9b9481d2d`, FR `a295b3d2c0542b578a56abba9bca471de024a8d4`, ZH `baa124172b8dff04271d89e52d56de8376947a3c`, Header `6d17e4208f46ae4fbc56f33f26018326bb18d1cd`; report updated in `docs/frontend-audit/09-board-category-localization.md` commit `ac8ee63465eff2f19ef481d69fc9ffe9005b73e9`. Eight relevant declarations/bindings re-fetched from main and confirmed. No test/typecheck/build/browser/screen-reader execution. Package 09 remains open.


- 2026-11-16 — CI follow-up after package-09 mobile navigation localization: runs `43935273966` (frontend/backend) jobs `133538115121` (frontend) and `133538115605` (backend), plus `43935274026` (postgres-atomicity) job `133538115975`, all ended `failure` with `runner_id: 0`, `steps: []`. Runs `43935281863` and `43935281923` were queued on prior state commit at observation time. Vercel status for current HEAD `d30768512b154a002b35d179734faded81c6b62f` is `failure` with `build-rate-limit`; no build log. No test/typecheck/build/SQL step is confirmed to have executed. Latest UA-002 owner-action evidence recorded in `docs/USER_ACTIONS.md` commit `0aa1045f4f9ca69eb73f59d5e3e28ee74cc7dec8`. External account-owner blocker remains open.

- 2026-11-16 — package 09 password visibility control follow-up: the login show/hide button had been removed from keyboard tab order; the concurrent accessibility change added `aria-label`, `aria-controls` and `aria-pressed`, but its `t.show` / `t.hide` references were not declared by `TranslationSchema`. Added typed `common.show` / `common.hide` strings to all seven locales, updated Login to use `t.common.show/hide`, and retained keyboard reachability + state semantics. Commits: accessibility control `dedd6a5e3b89aedca279d025a5a918627434212a`; schema `a8ef1bd12f51e4144b1fcd63e45183b3682190da`; locale commits `1cbc44b75a659b98ab046ca1020187977dbc8edb`, `876d4cecb5c227eec5d44b69f7421123a8e23e0e`, `1e03027c70d897b8bc7f7c48373cfe89e95e5f0e`, `0dd4a0e2e75a998831344837a50d5a369599fc68`, `3c90a14873916cb562270d751039f883cb04922e`, `a8772ae0ff0f78156119c56fda525d302c820324`, `3fd399924cacba5523fc2beb032bf60c05db79f7`; Login typed-label correction `d30768512b154a002b35d179734faded81c6b62f`; report addendum `docs/frontend-audit/09-board-category-localization.md` commit `c664bb38533193aeb71b72024eff5430273355f5`. All eight files re-fetched from main; four targeted static assertions passed. No typecheck or keyboard/screen-reader runtime test executed. Package 09 remains open.


- 2026-11-16 — CI gate rechecked on current main HEAD `0c542bbd53c319738b67ede5b6b1d742340f20d7`: Actions run `43935341632` jobs `133538351601` (backend) and `133538352186` (frontend), and run `43935341604` job `133538352735` (postgres-atomicity), all failed with `runner_id: 0`, `steps: []`. No test, typecheck, build or SQL commands ran. Vercel status: `failure`, `Deployment rate limited — retry in 5 minutes`; this is a rate-limit response, not a build result. Latest details added to UA-002 in `docs/USER_ACTIONS.md` commit `3eed5c70e34649a847a27ab0c0071be5086b74fe`. Runtime gates remain blocked; do not mark tests/build as passed or source-code failures.

- 2026-11-16 — CI gate повторно проверен после package-09 password-toggle и auth form corrections. `main` HEAD `11267635ff05333d1d15754f7e7fa79f20f85964` (последний code HEAD в CI `0c542bbd53c319738b67ede5b6b1d742340f20d7`). Actions runs `43935341632` и `43935341604` завершились до runner; jobs `133538351601`, `133538352186`, `133538352735` имеют `runner_id: 0`, `steps: []`. Vercel status для HEAD — `failure`, target `build-rate-limit`, build log отсутствует. UA-002 обновлён commit `11290f5b5fdfd685037c67a63c9dca4f4c3e9507`. Runtime tests/typecheck/build/SQL не запускались; UA-001/UA-002/UA-003 остаются owner blockers.


- 2026-11-16 — final CI recheck after project-state documentation commit: runs `43935408594` (postgres-atomicity job `133538587572`) and `43935408658` (frontend job `133538587582`, backend job `133538587982`) all failed with `runner_id: 0`, `steps: []`. No runtime tests, typecheck, build or SQL were executed. Exact latest evidence is recorded in UA-002 in `docs/USER_ACTIONS.md` commit `5e38115aa12b0a1e5f381808dce682d9657edb1e`. User action remains required to inspect GitHub account billing and Actions permissions.

- 2026-11-16 — frontend audit package 09 registration password confirmation feedback (FE-18): несовпадение повторного пароля ранее отображалось только визуально. Поле confirmation теперь условно задаёт `aria-invalid` и `aria-describedby`; локализованная ошибка получила стабильный id и `role="alert"`. Добавлен `frontend/src/utils/registrationPasswordValidationAccessibility.test.ts`. Commits: Register `8a17b7b7a21d2ce2d2829da469d6d0cfeadefb2a`, test `16efca6a07295f70d82e506ade18041433b0afdd`; report addendum `docs/frontend-audit/09-board-category-localization.md` commit `11267635ff05333d1d15754f7e7fa79f20f85964`. Обе страницы, два regression tests и package.json перечитаны из main; 7 targeted static assertions passed. Tests inspected but NOT executed; no typecheck/full suite/browser keyboard/screen-reader run. Package 09 remains open; no backend/DB/production/payment/Pinterest/deployment changes.

- 2026-11-16 — frontend audit package 09 review-queue error/regeneration localization (FE-19): в активном `ManualApprovalDesk.tsx` guard/error/bulk outcome/regeneration status messages были жёстко заданы на русском. Переведены на существующие `t.review.*` keys; Chinese locale дополнили 18 недостающими review messages, чтобы исключить `undefined` для zh. Расширен `reviewQueueCopy.test.ts`: все 18 ключей проверяются во всех семи locale и отдельно проверяются literal placeholders `{count}`, `{saved}`, `{total}`; regex placeholders исправлены. Commits: component `c176890ba5f2db2eb39ebb26b4ad55f7b5e8fa40`, second guard `50a74e7e426e28cf83d1d96fb381ed7be9f3f7db`, zh `e9bd1d2ee8f6e63bc7685223f2024a7fe69c28a6`, test `a1d461a9d244e56b732aef0f2f72f06742123513`, regex fix `0fe1c50a57b112e48bd4e1d4f22bd434e0fe6181`; report `docs/frontend-audit/09-board-category-localization.md` commit `c7315a3c086226566e6c7c0f3fced2fb40691954`. Повторно fetched component, test и семь locale files; 11 targeted static assertions passed. Test not executed; no typecheck/full suite/browser/keyboard/screen-reader run. Other Russian UI labels remain follow-up; package 09 stays open. No backend/DB/production/payment/Pinterest/deployment changes.

- 2026-11-16 — CI follow-up after FE-19 review localization: runs `43935942411` (backend job `133540420412`, frontend job `133540421082`) and `43935942502` (postgres-atomicity job `133540420758`) завершились до runner; все jobs `runner_id: 0`, `steps: []`. Никакие tests/typecheck/build/SQL steps не исполнялись. Доказательства и owner action обновлены в `docs/USER_ACTIONS.md` commit `90d1a42071a1d6c998443c13f4894ec54c4de6e8`. Vercel для последующего docs HEAD пока не вернул status record; предыдущий rate-limit не трактуется как source build failure. UA-001/UA-002/UA-003 остаются открытыми.

- 2026-11-16 — supplemental frontend source verification after FE-19 (FE-20/FE-21): актуальные `main` sources подтверждают, что `App.tsx` keys `ManualApprovalDesk` by `user?.id || 'anonymous'`, поэтому при смене владельца компонент перемонтируется и сбрасывает локальное состояние; `DashboardView.tsx` renders board navigation cards as native `button type="button"` with visible `focus-visible` ring. Added source regression test `frontend/src/utils/dashboardAccessibility.test.ts`. Commits: account isolation `173eb0dc607eacd5369dbb7836b66339610caf16`; dashboard accessibility `f08d53d1c4eb55037de70c173e9cb8111406b49a`; test `08469db66364690928ac2cfc36e1f0678ff2aa3f`; audit report update `ab12092f66586a0445cf755fe27277e36eb3d261`. Re-fetched App, DashboardView and test from main; targeted source assertions passed for owner-key remount, native button semantics, navigation callback, focus-visible styling and test coverage. Test not executed; no typecheck, full frontend suite, build, browser keyboard or screen-reader run. These are source-level observations only; package 09 remains open. Mandatory NEXT remains clean disposable PostgreSQL replay `001_baseline.sql` + migrations `010–148`, then SQL integration and backend runtime suite. No checkbox advanced and no backend/DB/production/payment/Pinterest/deployment settings changed.

- 2026-11-16 — package 09 supplemental fixes: fenced stale profile refresh responses by request ID + auth token; keyed the main app shell by user ID; added owner checks to onboarding completion and finish callbacks. Removed the unused 15-pin fake review queue and dead “restore 15 pins” action, replaced the fictional account header with localized generic queue copy/count, and localized saved-pin loading/error/retry and manual-review submission states in PinGenerator across EN/RU/ES/PT/DE/FR/ZH. Converted dashboard board click targets from non-focusable divs to native buttons with visible keyboard focus. Commits: AuthContext 6af7f194, helper 5d76384c, helper test ca3c13c8, app shell 760da8ef, onboarding a0cf4563, review cleanup 81b414b0, locales 2d0197be, 746038f2, dc6a1e0f, df993b59, 3c89697a, 4880446b, 0554f273, PinGenerator a9f6a462, locale test f480510f, DashboardView f08d53d1, dashboard test 08469db6. Re-read 18 source/schema/locale/test files from main; 22 targeted static assertions passed. Tests not executed; no typecheck/build/browser/accessibility runtime verification. Package 09 remains open because additional hard-coded Russian review/generator copy and remaining accessibility flows still need audit. No user action added; existing UA-002 runner blocker remains.

- 2026-11-16 — CI/hosting recheck after FE-19/FE-20/FE-21 frontend changes: GitHub Actions runs `43936022163` (frontend/backend jobs `133540697637`, `133540698428`), `43936022278` (postgres-atomicity `133540696410`), `43936068684` (frontend/backend `133540857753`, `133540858236`), `43936068473` (postgres-atomicity `133540857429`) and `43936085788` (postgres-atomicity `133540918186`) завершились `failure` до запуска runner: all jobs `runner_id: 0`, empty runner name and zero steps. Frontend/backend tests, typecheck, build and SQL replay did not start. Vercel status for docs HEAD `2cfa001edf1323127fdd1cbb3a91f01a170b3bbb` is `failure`, target `build-rate-limit`, not a source build log. Exact evidence recorded in `docs/USER_ACTIONS.md` commit `a7377e5ee90bf23019e7bab0dced570c98db75b7`. UA-001/UA-002/UA-003 remain open; mandatory NEXT remains disposable PostgreSQL replay → SQL integration → backend runtime. No release/runtime checkbox changed; no production, DB or payment state modified.

- 2026-11-16 — frontend audit package 09 review locale contract completed for active `ManualApprovalDesk` key set (FE-23): component uses 53 distinct `t.review.*` keys. Expanded `frontend/src/utils/reviewQueueCopy.test.ts` to assert every key in all seven supported locales (EN/RU/ES/PT/DE/FR/ZH) and retain placeholder checks. Full component localization is on main in `04d97dddec3294e007ac663f593f18beb5264c66`; zh review copy completion `abce40fa9a0fb682e4a4efe8e822085138d980a7`; test expansion `7088c31c21ff194176bb7d5cecab5147bc6e4c9d`; report `docs/frontend-audit/09-board-category-localization.md` commit `0604892b48e498bf37bf9f82d5c4e78e577fa67f`. Re-fetched component/test/all seven locales; 10 targeted static assertions passed, all 53 keys present/tested. Test not executed; no typecheck/full suite/browser/screen-reader run. Package 09 remains open.

- 2026-11-16 — CI gate rechecked after FE-23. Runs `43936215441` (frontend `133541370353`, backend `133541370620`) and `43936215453` (postgres-atomicity `133541370957`) all failed before runner allocation: `runner_id: 0`, `steps: []`. No runtime tests/typecheck/build/SQL ran. Vercel status for HEAD `9f411b51c451043ad76748db9ee3ba6736c83fb3` is rate-limited for 24 hours, not a build log. Exact evidence added to `docs/USER_ACTIONS.md` commit `34c47bd3841f67bab3aea407d9400ad6bd17b580`; UA-001/UA-002/UA-003 remain open.


- 2026-11-16 — package 09 notification isolation and review desk follow-up. `NotificationProvider` moved inside `AuthProvider`; notification history now uses per-user storage keys, validates saved records, hides previous-owner state, retires legacy global key and fences delayed task timers/events by owner generation. Added helper/tests and localized queue notifications; commits schema `7978223558d02ae9b554c0e3bde59e4c406b8975`, seven locale commits `22ded8f4cb615efdf607f52b2c7a89c33acc632b`, `710cbd8f7bb3cf8c6f2c67505e27ab04c86f1d57`, `2e7e21f037054f852e924e50f23abbe79f5be3b5`, `461f840446e6c360f79ff39f0a23a4a7852734f4`, `1716a1e981241a1344b5d18e8c2736348da7b670`, `31161f41a15589ebd0960a1c25f6f40f2b28dd4d`, `894e11411294a21fc644ab2932c530da575fb975`; key helper/test `14e9b46518bfcb7582e4b04ab590df77f4f94b67` / `614b08149ec4c3afa763a0d17de33770b9d625af`; provider `dad3aaa2da4f2c05fd70fda0cde41402d3dc90ba`; App nesting `0f364e07a724296bac8d381d5788e7afab9d1658`. Email verification banner resend remains owner-fenced and localized; localized destination key and success status/accessible dismiss; component commits `b9582025d1830bb2424bb0b381c12bedfbe0f2f7`, `d785f2a1aabbc4d73de8c26f3741064d7f1a875d`. ManualApprovalDesk active controls and fallbacks localized across all seven locales (42 new keys), component commit `04d97dddec3294e007ac663f593f18beb5264c66`; App keys it by owner `173eb0dc607eacd5369dbb7836b66339610caf16`; Chinese locale completion `abce40fa9a0fb682e4a4efe8e822085138d980a7`. Added keyboard shortcut guard for repeated/modifier keys and editable/interactive targets; review region exposes aria-keyshortcuts and visible focus. Canonical report supplement in `docs/frontend-audit/09-board-category-localization.md` commit `b231406a19d2c5132ba4e110febedb98cd088f26`. Re-fetched NotificationContext/helper/test/App/EmailVerifyBanner/ManualApprovalDesk and all seven locales; 13 source assertions passed, 42 new review keys present in all seven locales, no Russian user-visible strings remain in active ManualApprovalDesk (only a code comment). Tests not executed; no typecheck/build/browser multi-account/keyboard/screen-reader run. Latest Actions runs after report commit `43936156788` (frontend/backend jobs `133541167318`, `133541166488`) and `43936156342` (postgres job `133541164336`) all `runner_id: 0`, `steps: []`; Vercel status for code commit `173eb0dc607eacd5369dbb7836b66339610caf16` remains `failure` target `build-rate-limit`, not a build result. UA-002 latest evidence recorded in `docs/USER_ACTIONS.md` commit `616083be2972608be1355ebf17a778e2ae0fe40a`. This closes only the manual-review desk localization and notification isolation subitems; package 09 remains open for remaining generator-only Russian errors/statuses and further accessibility flows. Mandatory DB/backend NEXT remains blocked by UA-001/UA-002/UA-003; no runtime/test/SQL checkbox advanced and no production/account/payment/Pinterest/deployment setting changed.
- 2026-11-16 — latest CI/hosting recheck after package-09 notification/review localization: runs `43936287500` (backend/frontend jobs `133541622532`, `133541622835`), `43936298152` (frontend/backend `133541658541`, `133541658617`), `43936298555` (postgres-atomicity `133541659573`), `43936312834` (frontend/backend `133541711465`, `133541712021`) and `43936312843` (postgres-atomicity `133541710954`) ended `failure` before runner allocation; all jobs `runner_id: 0`, empty runner name and zero steps. No tests/typecheck/build/SQL replay started. Vercel status for main HEAD `b6b7e5f222f949d3ecab2d75588ed5bbf7ee361f` remains `failure`, target `build-rate-limit`; no successful deployment/build confirmed. Exact run evidence added to `docs/USER_ACTIONS.md` commit `94ef1af5b9db3f8739e39badcf3f2b9c312140f1`. UA-001/UA-002/UA-003 remain open. Mandatory NEXT remains disposable PostgreSQL replay `001_baseline.sql` + migrations `010–148`, then SQL integration and backend runtime. No release gate marked complete and no production state modified.

- 2026-11-16 — обязательный NEXT повторно проверен на main после предыдущего documentation HEAD `2f838cdd082e79fed8b63e01845d5291e8a9875d`: runs `43936400253` (backend/frontend jobs `133542018499`, `133542018960`), `43936400260` (postgres-atomicity `133542018246`), `43936487681` (backend/frontend `133542325408`, `133542325882`) и `43936487679` (postgres-atomicity `133542325836`) завершились failure за 1–2 секунды; все jobs имеют `runner_id: 0`, пустой `runner_name`, `steps: 0`. Ни checkout, ни tests/typecheck/build, ни SQL replay не запускались; это runner allocation failure, не тестовый результат. PR #90 повторно прочитан: draft/open, Windows workflow требует labels `self-hosted, Windows, X64`, ручной `migrations_only=true`; наличие online runner не подтверждено и PR не объединён. Vercel combined status на docs HEAD `2f838cdd` — failure target `build-rate-limit`, не build log. Точные run IDs, runner evidence и безопасные действия владельца записаны в `docs/USER_ACTIONS.md` commit `39113bc07d3a9563ca42b0fbdbe1a4ffbbaecad5`. NEXT остаётся clean disposable PostgreSQL replay `001_baseline.sql` + `010–148` → SQL integration → backend runtime. Чекбоксы не менялись; никакие DB/production settings не изменялись.

- 2026-11-16 — финальная проверка Actions после документационного commit `698a8f64a9b73ded104014ffc83c60240977c09d`: run `43936696213` завершился `failure`; frontend job `133543052272` и backend job `133543053331` получили `runner_id: 0`, пустой `runner_name`, `steps: 0` и завершились примерно за 1 секунду. Тесты и build не запускались. Подтверждение добавлено в `docs/USER_ACTIONS.md` commit `5256f9e767d40af8b735e53c04d4bdae33deac62`. NEXT не меняется: clean disposable PostgreSQL replay `001_baseline.sql` + `010–148`, затем SQL integration и backend runtime; требуется доступный Windows self-hosted runner либо локальная disposable PostgreSQL. Никакие runtime чекбоксы не отмечены, production не затронут.

- 2026-11-16 — обязательный PostgreSQL gate перепроверен в доступной execution-среде на актуальном main (исходный HEAD `badfe992c45c03c3492cfe4e2eff9502d15634a1`). Свежие `scripts/verify.sh`, `scripts/verify.ps1`, `db/supabase-stub.sql`, `db/migrations/001_baseline.sql` и `backend/test/verify-script-migration-chain.test.js` прочитаны с main. Среда ассистента: Node.js `v22.16.0` и npm доступны; `psql`, `postgres`, `initdb`, Docker, Podman, PowerShell/pwsh отсутствуют; `/var/run/postgresql` и `/run/postgresql` отсутствуют; локального checkout нет. Следовательно, настоящий disposable PostgreSQL replay здесь выполнить невозможно. Не использованы remote/production DB и не выполнялась попытка обойти loopback guard. В соответствии с UA-001 запрещено запускать Windows replay до отдельной проверки владельцем; существующий пользовательский PostgreSQL 18 service/data directory не затронуты. Точная диагностика и read-only PowerShell-команды для владельца добавлены в `docs/USER_ACTIONS.md` commit `badfe992c45c03c3492cfe4e2eff9502d15634a1`. NEXT и все runtime чекбоксы остаются без изменений: дождаться read-only сведений UA-001, создать отдельный disposable cluster, выполнить baseline + миграции 010–148, затем SQL integration и backend runtime. Статические проверки не засчитаны как DB replay.

- 2026-11-16 — проверены новые Actions после предыдущего документационного обновления: на code HEAD `dfdd4281d9c17c241786bfb6cf928fc900af9200` runs `43936938640` (backend `133543896947`, frontend `133543897300`) и `43936938737` (postgres-atomicity `133543897726`) завершились failure; все jobs `runner_id: 0`, пустой runner name, `steps: 0`. На documentation HEAD `2c325ca43508c2fb3247b2398fac36be33b89a96` runs `43936936465` (frontend `133543889029`, backend `133543889371`) и `43936936499` (postgres-atomicity `133543889689`) имеют тот же pre-runner failure. Новые результаты зафиксированы в `docs/USER_ACTIONS.md` commit `5c6947362c8b8e3153f2cc7954c96295c7e1349c`. Ни frontend/backend/SQL команды не стартовали. NEXT остаётся disposable PostgreSQL replay; без результата UA-001 и доступного изолированного PostgreSQL runtime gate не может быть закрыт. Чекбоксы готовности не менялись.

- 2026-11-16 — package 09 follow-up: localized the generation recovery panel across all seven UI languages. Added 14 typed recovery keys for title/accessible label, loading/check actions, no-credit explanation, completion count, request statuses, saved-pin navigation, unavailable-board state and dismissal. Replaced mixed inline RU/EN/locale branches in PinGenerator with the typed dictionary. Commits: schema/component/test 85624470, EN 6aab0d0b, RU 097fde57, ES d0a7712e, PT da5bb32c, DE b0b09338, FR 5c2b43d9, ZH 00dcfbb6. Re-read 11 files from main and passed 18 targeted static assertions; test not executed, no typecheck/build/browser run. Package 09 remains open for remaining scheduling/aspect-ratio/error copy and dashboard accessibility review. No production services or data changed.

- 2026-11-16 — очередная проверка обязательного PostgreSQL gate на main. Новейшие workflow runs `43937089740` (postgres-atomicity `133544422571`) и `43937089818` (backend `133544423381`, frontend `133544423668`) на HEAD `1e40d12aca727660bd7d5c49c834142b14d8079b` завершились до выделения runner: `runner_id: 0`, пустой `runner_name`, `steps: 0`. Runs `43937079163` / `43937079153` на code/report HEAD `8d5833476fb805559d9fbac5ec0fec772f539c54` и `43937006562` / `43937006656` на docs HEAD `111b14a47ac3a00a4bbc864a06d82f5b6ca815fc` также не исполнили ни одного шага. Локальная среда ассистента проверена повторно: Linux x86_64/root, Node `v22.16.0`, npm `10.9.2`; `psql`, `postgres`, `initdb`, `pg_ctl`, Docker, Podman, PowerShell/pwsh и socket directories отсутствуют; apt package candidate для PostgreSQL отсутствует, DNS/network к GitHub недоступны, checkout отсутствует. Следовательно, clean disposable PostgreSQL replay здесь не может быть выполнен. Не предпринимались попытки подключения к production или использования существующего пользовательского data directory. Конкретные run/job IDs и ограничения среды добавлены в `docs/USER_ACTIONS.md` commit `1893c3d1bd0a5e56735584a4e65ddfa48a0836ab`. NEXT остаётся без изменений: replay `001_baseline.sql` + `010–148`, SQL integration, backend runtime; ни один runtime checkbox не отмечен.

- 2026-11-16 — reviewed the latest main commits `48a714e1` → `da950775` → `722220bb` → `1aede655` → `b9ab9334` → `6a465cee` → `aaf84b45`: generator scheduling/validation copy was moved from inline RU/EN literals to typed `t.generator.*` fields, with locale values added for EN/RU/ES/PT/DE/FR/ZH. Re-read current `PinGenerator.tsx`, `i18n/types.ts`, `i18nContext.tsx`, and all seven locale files from main. Targeted static contract check: all 12 referenced generator keys are declared in `TranslationSchema` and present in each of the seven supported locale dictionaries (no missing keys). This is source consistency only; TypeScript, lint, browser and runtime tests were not executed. Also re-read `.github/workflows/persisted-boards-checks.yml` and `.github/workflows/atomic-payment-integration.yml`: both use `ubuntu-latest`; the latter provisions PostgreSQL 16 and contains the migration/SQL integration sequence. Latest corresponding runs `43937588967` (backend `133546158870`, frontend `133546159438`) and `43937588823` (postgres-atomicity `133546157863`) all ended before runner allocation (`runner_id: 0`, `steps: 0`). The code commit Vercel status is `build-rate-limit`; no build/deployment success is established. Run details and attribution limits recorded in `docs/USER_ACTIONS.md` commit `b94557dc1f5c42b88c12693e99139e29e9c6cd38`. The required NEXT remains clean disposable PostgreSQL replay of canonical `001_baseline.sql` + `010–148`, followed by SQL integration and backend runtime suite. No completion checkbox changed; no production or user database touched.

- 2026-11-16 — reviewed the new generator cleanup commit `c82a64e1f265378a9c78d70c4df0fbf59cc11dc8` against its parent and current `PinGenerator.tsx`/`PinCanvas.tsx`. The change removes unused Russian `desc` properties from the local aspect-ratio option list; visible aspect-ratio descriptions still come from `ASPECT_RATIO_SPECS` in `PinCanvas.tsx`, which retains dimension strings. Static source inspection found no dangling references to the removed option-list property; the two remaining `.desc` UI references resolve to the separate imported `ASPECT_RATIO_SPECS` map. This was a narrow static review, not TypeScript/build/browser validation. Latest code HEAD CI runs `43937799440` (postgres-atomicity `133546904911`) and `43937799549` (frontend `133546905443`, backend `133546906059`) again ended before runner assignment (`runner_id: 0`, empty runner name, `steps: 0`); docs HEAD runs `43937790390` / `43937790228` show the same. Detailed IDs added to `docs/USER_ACTIONS.md` commit `321cdece84934443ec0e223a6c5776a1ffe3a0d4`. No tests or build are claimed as run. NEXT remains the disposable PostgreSQL replay of `001_baseline.sql` + migrations `010–148`, followed by SQL integration and backend runtime suite. No completion checkboxes changed; no production/user database touched.

- 2026-11-16 — package 09 FE-24: localized remaining PinGenerator validation, scheduling and review fallbacks using existing typed generator fields. Covered topic required, untitled pin, format save, description save guards, Pinterest destination mismatch, missing internal board, adjusted/unavailable schedule time ({time}), review reason/failure and calendar-saving state. Added all 15 generator action fields to EN/RU/ES/PT/DE/FR/ZH; removed unused Russian aspect-ratio description metadata. Commits: type ba1461d4, PinGenerator b44243d9, test 2857efa8, locales 48a714e1, da950775, 722220bb, 1aede655, b9ab9334, 6a465cee, aaf84b45, metadata cleanup c82a64e1. Re-read 11 files from main; 14 targeted static assertions passed. Current PinGenerator scan finds only Russian keyword-matching literals and code comments, no Russian UI copy. Test not executed; no typecheck/full suite/build/browser/screen-reader verification. ManualApprovalDesk and PinGenerator cross-locale subitems now resolved at source level; package 09 remains open for broader user-facing flow/accessibility review. No backend/DB/production/payment/Pinterest/deployment change.

- 2026-11-16 — synchronized the latest main state before continuing. Reviewed package-09 frontend report `docs/frontend-audit/09-board-category-localization.md` and the new project-state entry covering FE-24 generator localization, board-category labels, avatar upload persistence/safety, onboarding accessibility/copy and email verification/notification owner isolation. These are documented source-level changes from existing commits; their regression sources have not been executed, so no runtime readiness is inferred. Latest Actions runs `43938035006` (backend `133547725577`, frontend `133547725893`) and `43938009174` (postgres-atomicity `133547632770`) all failed before runner allocation (`runner_id: 0`, empty runner name, `steps: 0`). Exact IDs recorded in `docs/USER_ACTIONS.md`. The mandatory NEXT remains clean disposable PostgreSQL replay of `001_baseline.sql` + migrations `010–148`, followed by SQL integration and backend runtime suite. The assistant execution environment still lacks PostgreSQL binaries/runtime and checkout; UA-001 read-only checks on the user's separate Windows machine remain outstanding. No runtime checkbox changed, no test success claimed, and no production/user database or external integration touched.

- 2026-11-16 — revalidated the mandatory DB gate and current CI after reading the latest `PROJECT_STATE.md` and code/workflow files from `main`. Current scripts `scripts/verify.sh` and `scripts/verify.ps1` still provide the documented disposable migration-only paths; workflow files remain the existing CI entry points. Latest main runs `43938148743` (frontend `133548127819`, backend `133548128191`) and `43938148707` (postgres-atomicity `133548126641`) all failed before runner assignment (`runner_id: 0`, empty runner name, `steps: 0`). Job-log retrieval returned 404 BlobNotFound, so no more specific runner error is available. IDs and evidence added to `docs/USER_ACTIONS.md`. Rechecked the assistant execution environment: Linux x86_64; `psql`, `postgres`, `initdb`, `pg_ctl`, Docker, Podman and PowerShell are absent; PostgreSQL socket directories are absent; no PinPosy git checkout is mounted. Thus a clean DB replay cannot be run here, and the user's existing Windows PostgreSQL cluster must not be touched. PR #90 remains draft/open and is based on stale base SHA `0b856ae4965eb41b5fc4def364941c63629edb4a`; its head is `27f0f6a1e9f0b8e1e3e7f8e3aa9fe4ff38662157`, so it is not used as proof of checks. No migration replay, SQL/backend/frontend tests, build or deployment is claimed. NEXT remains unchanged: clean disposable PostgreSQL replay `001_baseline.sql` + `010–148`, then SQL integration and backend runtime suite. No completion checkboxes changed; no production or user database touched.

- 2026-11-16 — performed the next required DB-gate investigation against fresh `main` files. Re-read both migration-only scripts, the CI workflows and static SQL/RPC audit reports. The workflows use GitHub-hosted `ubuntu-latest`; current main runs `43938352568` (frontend `133548841458`, backend `133548842095`) and `43938352582` (postgres-atomicity `133548841515`) all failed within ~2 seconds before a runner was assigned (`runner_id: 0`, empty runner name, zero steps). Job-log retrieval returned `404 BlobNotFound`; check-run output has no summary; annotations could not be retrieved through the connected GitHub interface. Investigated PR #90's alternate self-hosted route: its run `43908889550` remains queued since `2026-11-16T16:33:58Z`, job `133445082390`, labels `self-hosted, Windows, X64`, but `runner_id: 0`, empty runner name and zero steps; PR remains draft/open and targets stale base SHA `0b856ae4965eb41b5fc4def364941c63629edb4a`. This proves no self-hosted runner has claimed that queued job, but does not identify the account-level cause. Vercel status on current main HEAD `1bc598ad0888165a07ae35d1cff9f5a7dbcafe0c` is `failure`, target `build-rate-limit`, description `Deployment rate limited — retry in 24 hours`; no deployment of current HEAD is confirmed. Exact run IDs and owner checks recorded in `docs/USER_ACTIONS.md` commit `15996a847067c885abb5d373aeec69ce840e44b6`. The required clean disposable PostgreSQL replay cannot be performed in this assistant environment (no PostgreSQL binaries/server, Docker/Podman, PowerShell or repo checkout), and the user's existing PostgreSQL cluster remains protected. No tests/build/replay/deployment success claimed; no completion checkboxes changed; no production/user DB touched. NEXT remains clean disposable replay of baseline + migrations 010–148, then SQL integration and backend runtime suite.


- 2026-11-16 — повторно проверен обязательный NEXT на актуальном main HEAD `0cc7a1fd3fac03a56a29beb1e6b2d51236ff00a6`. Перечитаны текущие `scripts/verify.sh` (blob `63b605d6e079275c0dd8c41de549f9a997dcee4a`), `scripts/verify.ps1` (blob `6614843edaafd4924c90c679a0f9fe232e59a0f0`) и `backend/package.json` (blob `47af7df351737185c05c26a79bf3a8880fe78880`). Linux replay ограничен локальным Unix socket `/var/run/postgresql` и явным портом; Windows replay направляет все шесть вызовов psql на `127.0.0.1` и заданный порт, требует точный непрерывный диапазон 010–148 и удаляет только созданную им уникальную БД. Повторная проверка среды ассистента: Node.js v22.16.0 доступен, но `psql`, `postgres`, `initdb`, `pg_ctl`, Docker, Podman, PowerShell и checkout PinPosy отсутствуют; PostgreSQL socket directories отсутствуют. Последние Actions runs на HEAD `0cc7a1f`: `43938584575` (backend job `133549670286`, frontend `133549670716`) и `43938584552` (postgres-atomicity `133549670628`) завершились failure за ~2 секунды до назначения runner: у всех `runner_id=0`, пустой `runner_name`, `steps=[]`. Это runner allocation failure, не запуск тестов и не дефект, выявленный тестами. Чистый PostgreSQL replay, SQL integration tests, backend runtime suite, frontend tests/build и deployment не запускались и не считаются пройденными. UA-001 (четыре read-only проверки PostgreSQL 18 на отдельной Windows-машине пользователя) остаётся ожидающей; существующий кластер не затрагивался. Никакие чекбоксы runtime gate не изменены; production, PIN_TRIAL, платежи и Pinterest не затрагивались. NEXT остаётся прежним: clean disposable replay `001_baseline.sql` + `010–148`, затем SQL integration и backend runtime suite.


- 2026-11-16 — после предыдущей документационной фиксации GitHub повторно автоматически запустил CI на docs HEAD `8c796d9877683e4cfdbe47ba3c74116c9df484dd`: run `43938802993` (postgres-atomicity job `133550441606`) и run `43938802951` (backend job `133550439503`, frontend job `133550440315`). Все три job завершились failure примерно за 1–2 секунды, `runner_id=0`, пустой `runner_name`, `steps=[]`; ни один workflow step не стартовал. Вновь проверена среда: Node.js v22.16.0 и npm доступны, но `psql`, PostgreSQL server/initdb/pg_ctl, Docker, Podman, PowerShell, PostgreSQL socket directories и локальный checkout проекта отсутствуют. Поэтому выполнить миграционный replay или backend tests из этой среды невозможно. Этот результат подтверждает только повторяющийся runner allocation blocker, а не прохождение/провал тестов приложения. Без пользовательских read-only результатов UA-001 и восстановления runner по UA-002 безопасного способа выполнить NEXT нет. Чекбоксы и NEXT не менялись; пользовательские/production БД не затрагивались.


- 2026-11-16 — CI hygiene improvement follow-up: the workflow-file commits themselves triggered CI (expected, because the changed workflow files are outside the docs/README ignore paths). After initial queue observation, all jobs completed as failures before runner assignment: run `43939013573`, postgres-atomicity job `133551186427`; run `43939013494`, frontend job `133551185805` and backend job `133551186476`. Every job has `runner_id=0`, empty runner name and `steps=[]`; no test command ran. The path filters were re-read from main and remain present in both push and pull_request trigger blocks; `workflow_dispatch` remains present. Future docs-only commits should be excluded by these filters, but the workflow-file commits already generated the above failed runs. This does not unblock the required DB gate. No replay, SQL integration, backend runtime, frontend tests/build or deployment success is claimed. NEXT remains clean disposable PostgreSQL replay of `001_baseline.sql` + `010–148`, then SQL integration and backend runtime suite.

- 2026-11-16 — повторная оценка PR #90 относительно актуального `main`: PR остаётся `open`/`draft`; сравнение `main` (`350129430ea820135e141f43f62d21636353c910`) с веткой `ci/windows-self-hosted-verification-clean` показало `ahead_by=3`, `behind_by=394`, `status=diverged`; единственный файл в diff — новый `.github/workflows/windows-self-hosted-verification.yml` (57 строк). Связанный Windows workflow run `43908889550` остаётся `queued`, а main runs `43939013573`/`43939013494` завершились до шагов с `runner_id=0`. PR не обновлялся и не объединялся: автоматический merge/rebase 394 commits не нужен для прохождения текущего DB gate и создаёт ненужный риск; отдельный workflow не подтверждает наличие runner. Следующий этап остаётся clean disposable PostgreSQL replay → SQL integration → backend runtime suite. Production и пользовательские базы не затронуты.

- 2026-11-16 — package 09 FE-25 (plan-locked overlay localization/accessibility) completed at source-review level. Before editing, re-fetched current main HEAD, PROJECT_STATE.md, USER_ACTIONS.md, package-09 audit report, active App.tsx usage and LockedSection.tsx; confirmed LockedSection wraps authenticated app content and rendered Russian-only title/body/CTA for every locale. Added typed TranslationSchema.lockedSection (title/description/viewPlans), translations for EN/RU/ES/PT/DE/FR/ZH, switched the component to typed copy, and exposed a labelled polite live region while retaining the pricing navigation button. Added frontend/src/utils/lockedSectionLocalization.test.ts for locale/schema/component/accessibility contract. Commits: schema 87fb24e55e062b693fcc4927ec5154a4d398f7fa; EN e9e991d0ee5ced93349e66d25281b1efea797fd8; RU 23d3927c250db981be470cffcb7806574272f58d; ES 1e2d8ce20b233bc1453be4ef8ccc26328c1d1c4a; PT 0ebae927e22fa7da3ed090cb8fdb68b6261ce8e6; DE b47fd8cb2b81a6b25445448312b4340eebaa688c; FR 1076123542a096fb3ad1d108515a28c989309ecf; ZH b0e503087c98acd00ae7518a6db23770a16b6545; component a65a7f459f692f1c8ae239588fdebad2b60a9293; regression test cebbe9ca537dd51349876f4e757db1f0efbc12fe; audit report ccedd544b08cba78082b85f5b88d009cde9e6a2c. Re-fetched all ten changed files from main and passed 12 targeted source assertions covering type declaration, all component bindings, accessible region, absence of old Russian UI copy, 21 non-empty locale entries and regression-test coverage. Test source inspected but NOT executed; no frontend test/typecheck/build/browser/keyboard/screen-reader run. CI runs 43940229730 (postgres job 133555483026) and 43940229160 (backend 133555481123, frontend 133555481704) failed before runner assignment: runner_id=0, empty runner name, zero steps. No SQL replay/backend/frontend runtime test started. This closes FE-25 source-level finding only; package 09 and full frontend audit remain open. Mandatory NEXT remains clean disposable PostgreSQL replay 001_baseline.sql + migrations 010–148, then SQL integration and backend runtime suite. No runtime checkbox changed; no production/DB/payment/Pinterest/deployment settings changed.
- 2026-11-16 — package 09 FE-26 (strategist demo-status disclosure) completed at source-review level. Fresh main preflight re-read PROJECT_STATE.md, USER_ACTIONS.md, FloatingStrategistBot.tsx and all seven locale dictionaries. Confirmed the floating strategist uses canned navigation/account-summary replies through getDemoNavigationTarget/buildAccountSummary and makes no AI/backend request, while its visible statusBadge claimed Online/En línea/На связи. Replaced statusBadge copy with explicit demo labels in EN/RU/ES/PT/DE/FR/ZH and added frontend/src/utils/botDemoDisclosure.test.ts to guard the disclosure and ensure no live API request is implied. Commits: EN 7f15ab2a1eaea439522d13f93b4f567a661f08cc; RU ed4a6bd6cdcdda83c852af56925fefc902902668; ES 76a9c737ee5090e8c4e3234e91115f30947eac3d; PT 42b639b264e75ef1982693bf4f1bfa9b7da91c74; DE 0b423020d6ff20391069bced7d88234356f68b14; FR 4fc690cb5d42e6b83fd66a89939b9458975b070a; ZH 6f5cb02c3a68f41019d29112a28146eada241bd4; test 4556683c2540b5513ddc490d29d8de2d196ca2f5; report c887a41fee3bdf282077de3935393fc81a2793a6. Re-fetched component, test and all seven locale files; 11 targeted source assertions passed. Test not executed; no frontend/backend tests, typecheck, build, browser or screen-reader run. Latest CI runs 43940507484 (frontend 133556452273, backend 133556452724) and 43940506056 (postgres-atomicity 133556446415) failed before runner assignment (`runner_id=0`, empty runner name, zero steps); no workflow test commands started. FE-26 corrects disclosure only and does not implement live AI. Package 09 and all runtime/release gates remain open; no backend/DB/production/payment/Pinterest/deployment settings changed.

- 2026-11-16 — package 09 FE-27 calendar schedule recovery/error localization. Fresh main preflight re-read PROJECT_STATE.md, USER_ACTIONS.md, PublishingCalendar.tsx, TranslationSchema.calendar, all seven locale dictionaries, frontend test glob and current package-09 report. Found active calendar UI using RU/EN conditionals and six-locale fallback chains for Pinterest replacement-board discovery/recovery, date/topic/board validation, schedule loading/retry, and retry/cancel progress; English was shown in unsupported locales. Added 20 typed calendar copy fields (including a separate long recovery explanation and short action label) to schema and EN/RU/ES/PT/DE/FR/ZH; replaced inline conditionals and Russian/English loading/retry literals with t.calendar bindings; retained role=status and role=alert; added frontend/src/utils/calendarLocalization.test.ts. Commits: schema 1e32cfad34c7eea372ea447937af14ef4c33b280 and 277530368c7f625ba2c71195206997ba3852e354; initial locale commits 49a0a53e1fba317048c7f4299cec1a601d689363, 50a3c61dfb2e1040b558e3032a8bec16564d005b, 19ca863743683d0541b0130569545358aa743d60, b48ad6dba44c56e81d62b8b0151196522cddf5ad, 3fa163015f36b390066e6438006154c40f139353, df1d36161c02b73e38cd8e7da56d4cf2f2e26085, 4981f97008178c476740651d9e8e6d621b6c1a1a; description locale commits 6250087ad2613df844c865228e4918228f6fd8fa, 71caad062080afc07c15b25fbf0e54174959da6c, 3693dab7fcbcf3182aaf8911df4c30ca7c7e7ee1, 9b0a2325e277b9d16d87d6545e9ce991e2eb7615, 828c4b0c8bc97d0526b83d6c1e7f2df8d8201805, cfc3fb9a9de6760d7354cfec11293893038c0c71, ecf61d677d493dd78ca7ecf0e3b277d8c7f96b3c; component 60b20ff79e2f29a8ca1084609a2b2463840d7c12 and ffb0447ac526bc2a634f40bc889732e5ad607aad; tests 5d37fe3e11cdd374dda569494209cbbf6e7185b6 and 80fe6de9a40983702dd5daf4c56247281d1ae255; audit report 7fc850fa1c8f444f23da6cdbcf7ee7efd9b7e3c2. Re-fetched component/schema/test/package and all seven locales from main; eight targeted static assertions passed: 20 schema keys, 20 values in all seven locales, test coverage and test-glob discovery, all component bindings, no remaining calendar locale ternaries, live-region semantics retained, and distinct recovery explanation/action label. The regression test was NOT executed; no typecheck, frontend suite, build, browser, keyboard-only or screen-reader run. CI runs 43941368139 (backend 133559434540, frontend 133559435212) and 43941368158 (postgres-atomicity 133559434715) failed before runner assignment; all three jobs runner_id=0, empty runner name, zero steps. No workflow command started. Package 09 remains open. Mandatory NEXT remains clean disposable PostgreSQL replay 001_baseline.sql + 010–148, then SQL integration and backend runtime suite; no runtime/release checkbox advanced. No backend, database, production, payment, Pinterest account or deployment setting changed.

- 2026-11-16 — повторная preflight-сверка на main HEAD `cb0f6148695c2e020c756b58796d8a10d3dceba8`: перечитаны паспорт, очередь пользовательских действий и актуальные backend/frontend package manifests. Обязательный NEXT подтверждён без изменений: disposable PostgreSQL replay baseline + migrations 010–148 → SQL integration → backend runtime. Среда ассистента повторно проверена: Node 22.16.0/npm 10.9.2 есть, PostgreSQL binaries/server, Docker/Podman, PowerShell и checkout отсутствуют; replay выполнить здесь нельзя. Vercel combined status текущего HEAD — `failure/build-rate-limit`, это quota blocker, не результат build. UA-001 (четыре read-only проверки PostgreSQL 18 на Windows-машине пользователя) и UA-002 (GitHub Actions account/runner settings) остаются в `docs/USER_ACTIONS.md`; этот сеанс не запускал команды на машине пользователя и не трогал существующий кластер. Runtime/release чекбоксы и NEXT не менялись; тесты, SQL replay, deployment и production не заявляются как проверенные. Подробная запись preflight добавлена в USER_ACTIONS.md; commit: `966b6b3d427cc0131c34971f953965104a598bdb`.

- 2026-11-16 — продолжена обязательная preflight-сверка перед DB gate. Актуальные verify scripts и два Linux Actions workflow перечитаны с main: verify.sh требует локальный psql + Unix socket, exact baseline и contiguous 139 migrations 010–148; verify.ps1 использует только loopback 127.0.0.1 и уникальную disposable DB. Оба GitHub workflow назначены ubuntu-latest; PR #90 с Windows self-hosted workflow остаётся open/unmerged. Дополнительно проверена возможность выполнить replay в assistant container: root/git/apt-get доступны, но PostgreSQL binaries отсутствуют, apt cache без пакета, DNS github.com не работает; поэтому ни установить PostgreSQL, ни получить checkout/запустить replay здесь нельзя. Это не проверка ПК пользователя и не заменяет UA-001. Подробности и безопасные границы записаны в USER_ACTIONS.md commit 681d1269a85c32cfc78e63dee8aab77a82efc5e8. UA-001/UA-002 остаются открыты; mandatory NEXT не изменён. Никакие миграции, SQL/runtime tests, production DB, payment, Pinterest или deployment не запускались/не менялись; чекбоксы не закрывались.

- 2026-11-16 — frontend audit package 09 FE-28: fresh preflight re-read current PROJECT_STATE.md, USER_ACTIONS.md, package-09 canonical report, actual frontend directory tree, Header.tsx, dashboard accessibility test, i18n types and frontend/package.json. Found active notification-center entries rendered as clickable divs without role/tab stop/keyboard support; bell had no expanded/controlled-panel semantics. Updated frontend/src/components/layout/Header.tsx: shared notification activation handler, role=button + tabIndex=0, Enter/Space activation with preventDefault for Space, visible focus ring, aria-expanded/aria-controls and labelled region. Added frontend/src/utils/notificationKeyboardAccessibility.test.ts (three source-contract cases); confirmed test script glob src/utils/*.test.ts includes it. Commits: Header a62663b87fa841a087bf807d89647964f8a741fa; test 854b6d42cfae712838934c4ec533dd008f705efb; canonical package-09 report 4440fa6f4ab3b26bc71f9e4fe2fc97a5cfa53840. Re-fetched Header/test/package/report from main; 11 targeted static assertions passed, including Enter/Space, shared action, focus ring, aria state/region, test count and test discovery. Regression test source was NOT executed; no TypeScript check, frontend suite, build, browser keyboard or screen-reader run. Combined status for test commit is Vercel failure target build-rate-limit, not a build result. PR #90 remains open/unmerged and runner result unverified. Mandatory NEXT remains clean disposable PostgreSQL replay 001_baseline.sql + active migrations 010–148, then SQL integration and backend runtime suite; UA-001/UA-002/UA-003 and all runtime/release gates remain open. No runtime/release checkbox advanced. No backend, SQL, production DB/data, payment, Pinterest or deployment configuration changed.


- 2026-11-16 — повторная обязательная preflight-сверка перед DB gate на актуальном main (до документационной фиксации HEAD `f6fe3893958373cbade6122ab5372f0b0b44b65b`). Повторно прочитаны паспорт, USER_ACTIONS, verify.ps1 и verify.sh; NEXT строго подтверждён: disposable replay `db/migrations/001_baseline.sql` + ровно 139 active migrations `010–148`, затем SQL integration и backend runtime suite. Проверена assistant execution environment через container: Debian 13, Node v22.16.0/npm 10.9.2; `psql/postgres/initdb/pg_ctl`, Docker/Podman, PowerShell/pwsh отсутствуют; apt candidate для PostgreSQL отсутствует, DNS github.com не разрешается, checkout отсутствует. Следовательно, установка PostgreSQL и replay здесь невозможны; команды replay не запускались. Это не проверка Windows ПК пользователя. Дополнительно перепроверены PR #90 и job: PR открыт, draft, не merged, base SHA `0b856ae4965eb41b5fc4def364941c63629edb4a` устарел; run `43908889550` / job `133445082390` остаётся queued без runner/steps. PR не даёт подтверждённого способа выполнения gate. Combined status документационного HEAD `f6fe3893958373cbade6122ab5372f0b0b44b65b` — Vercel `failure/build-rate-limit`, то есть quota blocker, не build result. Уточнены безопасные действия владельца и официальные инструкции GitHub в `docs/USER_ACTIONS.md` (commit `d42d3d40140779e71570a7a516cab0004974d57c`). UA-001/UA-002 остаются открытыми; DB replay, SQL integration, backend/frontend runtime и deployment не заявляются как выполненные; чекбоксы и NEXT не менялись. Никакие существующие PostgreSQL clusters, PIN_TRIAL/production DB, данные, платежи, Pinterest или deployment settings не затронуты.


- 2026-11-16 — обязательный DB gate: повторно сверены actual GitHub main ref, commits, PROJECT_STATE, USER_ACTIONS, verify.sh, verify.ps1 и workflow definitions. Main HEAD перед этой записью: `d7a3a27093e553621f15abd87191483a2424e837`. NEXT остаётся PostgreSQL replay `001_baseline.sql` + exact migrations `010–148` (139), затем SQL integration и backend runtime. Текущие Linux workflows используют только disposable PostgreSQL service для atomicity tests и frontend/backend Node checks; deployment/production actions в них отсутствуют. Проверены runs `43942173293` и `43942173514`: jobs `133562286353` postgres-atomicity, `133562287551` frontend, `133562288142` backend завершились до первого шага, `runner_id=0`, пустые runner names, `steps=[]`. Безопасно повторён только failed jobs retry для этих двух CI runs; GitHub принял rerun, но attempt 2 снова завершился pre-runner: `133563989630`, `133564011092`, `133564011478` — failure, runner_id 0, empty runner_name, steps 0, labels ubuntu-latest. Job logs API вернул 404 BlobNotFound, поэтому точная причина runner allocation не раскрыта; не приписывать её без доказательств billing/permissions. Повторные retry без новой причины не выполнять. USER_ACTIONS обновлён commit `88b733fba9091f5a45de04f6bf082cd7d0c7a6d8`. Реальный PostgreSQL replay/SQL integration/backend/frontend checks не запускались; assistant environment не имеет локального PostgreSQL и не может получить checkout; UA-001/UA-002 остаются открытыми. Чекбоксы и NEXT не менялись; production DB/data, payments, Pinterest, GitHub settings, self-hosted runners и deployment не менялись.

- 2026-11-16 — очередная preflight-сверка строго по NEXT на main HEAD 9a7dfcba742ac8c127f2f2e174ca1e522fbc201f: перед работой заново прочитаны этот паспорт, docs/USER_ACTIONS.md, scripts/verify.sh (blob 63b605d6e079275c0dd8c41de549f9a997dcee4a), backend/test/verify-script-migration-chain.test.js и оба действующих workflow (atomic-payment-integration.yml, persisted-boards-checks.yml). NEXT не меняется: чистый disposable PostgreSQL replay baseline + exact 139 migrations 010–148, затем SQL integration и backend runtime. Текущая assistant container probe: Node v22.16.0 и git доступны; psql/postgres/Docker/Podman/PowerShell отсутствуют, checkout отсутствует, DNS github.com не разрешается; replay в этой среде невозможен и не запускался. Это не проверка ПК пользователя. Новые workflow runs после ранее зафиксированного attempt 2 не обнаружены: latest runs 43942173293 и 43942173514 по-прежнему завершены до первого шага; не повторять retries без новой причины. PR #90 повторно проверен: open/draft/unmerged, base SHA устарел; не является подтверждённым исполнителем. Combined status текущего docs HEAD 9a7dfcba — Vercel failure/build-rate-limit, не результат сборки; в паспорте ранее отдельно отмечен успешный deploy другого application commit, который не подтверждает текущий HEAD. UA-001 (read-only проверки PostgreSQL 18 на X:), UA-002 (GitHub Actions account/policies/runner) и UA-003 (production account-deletion worker/privacy disclosures) остаются в USER_ACTIONS.md; production env/logs и компьютер владельца не доступны. Код, SQL, миграции, существующие БД, production, платежи, Pinterest, GitHub settings и deployment не менялись. Никакие чекбоксы не закрыты; SQL replay, SQL integration, backend/frontend runtime и build не заявляются как выполненные. NEXT сохранён без обхода этапов.


- 2026-11-16 — обязательный DB gate повторно проверен перед продолжением работ на main HEAD `4b3d187897a82bc8c8a83813bc4c2684d3ba66dd`. Повторно прочитаны актуальные `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, `scripts/verify.ps1`, `scripts/verify.sh`, `backend/package.json`, `db/migrations/001_baseline.sql`, тест контракта migration chain и оба действующих Linux workflow. NEXT не меняется: clean disposable PostgreSQL replay canonical baseline + ровно 139 active migrations 010–148, затем SQL integration tests и backend runtime suite. Скрипты остаются ограничены локальной disposable DB; Windows-вариант направляет psql на 127.0.0.1. Assistant environment повторно проверена: Debian 13, Node v22.16.0/npm 10.9.2 и git доступны; psql/postgres/initdb/pg_ctl, Docker/Podman, PowerShell/pwsh и checkout отсутствуют; локальные PostgreSQL socket dirs отсутствуют, DNS github.com не разрешается. Replay и runtime suite здесь не запускались. PR #90 перепроверен: open/draft/unmerged, GitHub сообщает mergeable=true, но сравнение его head `27f0f6a1e9f0b8e1e3e7f8e3aa9fe4ff38662157` с main показывает diverged (3 commits ahead, 455 behind); его Windows run `43908889550` и job `133445082390` остаются queued, steps не начались. Не обновлять/не сливать PR автоматически: это не безопасный способ получить обязательный replay и создаёт риск переноса устаревшей ветки. Combined status main HEAD содержит только Vercel failure target `build-rate-limit`, что не является результатом сборки. Подробные актуальные наблюдения и owner actions добавлены в `docs/USER_ACTIONS.md`. Ни один runtime/release чекбокс не закрыт; production/PIN_TRIAL/существующие PostgreSQL кластеры, платежи, Pinterest и deployment не затронуты.

- 2026-11-16 — повторная preflight-сверка обязательного NEXT на main HEAD `1bd5423eb3126bc3bcb9c50e7dbbb82ca56d4132`. Перед выводом повторно прочитаны актуальные `PROJECT_STATE.md`, `USER_ACTIONS.md`, `scripts/verify.ps1`, `scripts/verify.sh`, backend package manifest, canonical baseline, migration-chain regression test и оба основных CI workflow. Раздел NEXT подтверждён: сначала clean disposable replay `001_baseline.sql` + ровно migrations `010–148`, затем SQL integration и backend runtime suite; runtime checkbox не менялся. Проверена текущая assistant execution environment: Debian 13, Node v22.16.0/npm 10.9.2/git доступны; PostgreSQL client/server/initdb/pg_ctl, Docker/Podman, PowerShell/pwsh и checkout отсутствуют; локальных PostgreSQL socket dirs нет, DNS github.com не разрешается. Поэтому выполнить replay или backend runtime из этой среды нельзя; никаких команд, подключающихся к БД, не запускалось. GitHub workflow runs для docs HEAD отсутствуют (оба workflow игнорируют docs-only изменения); combined status содержит Vercel `failure` с target `build-rate-limit`, это не build result. PR #90 повторно проверен: `open`, `draft`, `merged=false`, теперь `mergeable=false`; compare с актуальным main показывает `diverged`, 3 commits ahead / 456 behind. Его Windows job run `43908889550` / job `133445082390` всё ещё queued без шагов и runner assignment. Не обновлять и не объединять эту ветку: она существенно отстала и не разблокировала replay. UA-001/UA-002/UA-003 остаются в USER_ACTIONS. Никакие runtime/release чекбоксы не закрыты; код приложения, миграции, пользовательские/production БД, платежи, Pinterest, runner settings и deployment не менялись.

- 2026-11-16 — повторная сверка обязательного NEXT на актуальном main HEAD `e3db7f8523b43594fc55215b351d87d53d1b8240`. Повторно прочитаны `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, `scripts/verify.ps1`, `scripts/verify.sh`, `backend/package.json`, `backend/test/verify-script-migration-chain.test.js` и `db/migrations/001_baseline.sql`; NEXT остаётся строго прежним: disposable PostgreSQL replay baseline + migrations 010–148, затем SQL integration и backend runtime. Локальная execution environment проверена фактически: Debian 13, Node v22.16.0/npm 10.9.2/git доступны; `psql`, `postgres`, `initdb`, `pg_ctl`, Docker/Podman и PowerShell/pwsh отсутствуют; checkout и PostgreSQL socket dirs отсутствуют; `github.com` не разрешается через DNS. DB replay, SQL integration и backend runtime не запускались; никакие БД не подключались и не изменялись. На текущем docs HEAD workflow run list пуст (документационный коммит не подтверждает запуск проверок); combined status содержит Vercel `failure` с target `build-rate-limit`, это ограничение деплоя, не результат сборки. PR #90 повторно проверен: open/draft/unmerged; compare `main...27f0f6a1e9f0b8e1e3e7f8e3aa9fe4ff38662157` = `diverged`, 3 commits ahead / 457 behind; GitHub metadata сейчас сообщает `mergeable=true`, но это не устраняет сильное отставание и не является основанием обновлять/сливать PR. Windows job `43908889550` / `133445082390` по-прежнему queued без шагов; runner не назначен. Никакие retries не повторялись. UA-001/UA-002/UA-003 остаются открытыми в `docs/USER_ACTIONS.md`. NEXT и runtime/release чекбоксы не менялись; код приложения, SQL, миграции, существующие/production БД, GitHub settings, runners, платежи, Pinterest и deployment не затронуты.

- **UA-001 read-only preflight completed (2026-11-16):** владелец подтвердил PostgreSQL `initdb`/`pg_ctl` 18.6, наличие `postgres.exe` и 167,962,349,568 свободных байт на X: (около 156.4 GiB). Также сообщён работающий `postgres.exe` PID 5632 (parent PID 4336). Эти данные подтверждают возможность подготовить отдельный disposable cluster, но не разрешают его создавать. Существующий процесс/кластер не останавливался и не изменялся; `initdb`, replay и миграции не запускались. Следующий шаг — получить отдельное явное согласие владельца на создание нового кластера в отдельном каталоге и на отдельном loopback-порту; только после этого выполнять изоляцию и проверку target endpoint.

- **Разрешение на disposable PostgreSQL cluster (2026-11-16):** владелец явно разрешил создать отдельный PostgreSQL 18.6 cluster только в новом каталоге X:, на отдельном порту и с loopback-only bind `127.0.0.1`. Разрешение не включает изменение/остановку существующего сервера (PID 5632), его data directory, `PIN_TRIAL` или production. Перед replay проверить фактическую идентичность нового кластера, порт и endpoint; миграции запускать только после отдельной проверки безопасности. На момент записи кластер ещё не создан.


- **Disposable PostgreSQL 18 verification — owner consent and Step 1 (2026-11-16):** владелец явно разрешил создание отдельного временного кластера только в новом каталоге на X:, на отдельном порту и с bind исключительно на `127.0.0.1`; существующий кластер, `PIN_TRIAL` и production запрещено трогать. На ПК владельца выполнен read-only PowerShell preflight: `X:\PinPosy-verify-pg18` отсутствует (каталог свободен); TCP port `55439` не имеет listener (порт свободен); `X:\Program Files\PostgreSQL\18\bin\psql.exe` найден; `pg_ctl --version` вернул PostgreSQL 18.6. В ранее присланном preflight также подтверждены `initdb.exe`/PostgreSQL 18.6, `postgres.exe` и свободное место X:. Изучен актуальный `scripts/verify.ps1`: migration replay создаёт отдельную disposable DB через `psql -h 127.0.0.1 -p <port>`, требует роль с правом CREATE DATABASE и применяет Supabase stub, baseline `001_baseline.sql`, затем ровно 139 активных миграций `010–148`; скрипт удаляет только созданную им БД. На этом этапе никакой каталог/кластер ещё не создан, сервер не запущен, replay не запускался, SQL и существующие БД не затронуты. Следующий шаг — проверить параметры initdb/auth и подготовить команду инициализации нового кластера с отдельной тестовой ролью; перед выполнением подтвердить точный путь, порт и loopback-only настройки.

- **Disposable PostgreSQL 18 — уточнение клиентской версии (2026-11-16):** владелец проверил `pg_ctl --help` и `psql --version`; PostgreSQL 18.6 доступен по полному пути `X:\Program Files\PostgreSQL\18\bin\psql.exe`. При этом системный `Get-Command psql` разрешает `C:\Program Files\PostgreSQL\17\bin\psql.exe`; для последующего replay необходимо вызывать PostgreSQL 18.6 по абсолютному пути или явно выставить PATH только в текущем PowerShell-сеансе. Вывод `initdb --help` в присланном результате отсутствовал, поэтому authentication flags пока не подтверждены. Кластер не создавался; следующий шаг — отдельный read-only вывод `initdb.exe --help`, затем проверить PATH/версии и только потом инициализировать новый data directory.

- **Disposable PostgreSQL 18 — initdb options verified (2026-11-16):** владелец прислал полный `initdb.exe --help` для PostgreSQL 18.6. Подтверждены параметры `--auth-host`, `--auth-local`, `-U/--username`, `-W/--pwprompt`, `-D/--pgdata`, `-k/--data-checksums`. Планируемый временный cluster: data directory `X:\PinPosy-verify-pg18`, отдельный superuser `pinposy_verify_admin`, SCRAM-SHA-256 для TCP и local socket auth, пароль вводится интерактивно (не передавать ассистенту и не записывать в командную строку). Инициализация будет вызываться абсолютным путём к PG18 binary; системный PATH содержит клиент PG17, поэтому для дальнейшего psql нужно использовать абсолютный PG18 path. Пока initdb не запускался, каталог не создан, сервер не запущен, БД не изменялись. Следующий шаг владельца — выполнить одну команду initdb после повторной проверки, что каталог отсутствует; затем проверить конфигурацию и только после этого запускать сервер на loopback 127.0.0.1:55439.


- **Disposable PostgreSQL 18 — initdb completed (2026-11-16):** пользователь успешно выполнил `initdb.exe` в `X:\PinPosy-verify-pg18`; exit code 0, новый кластер инициализирован, data checksums включены, суперпользователь `pinposy_verify_admin`, auth SCRAM-SHA-256 для TCP и local. Пароль вводился интерактивно и не раскрывался. ВАЖНО: initdb выбрал системную локаль `Russian_Russia.1251` и кодировку кластера `WIN1251` (не UTF8). Поэтому сервер пока НЕ запускать и migration replay НЕ запускать: сначала read-only проверить кодировку/символы всех входных SQL файлов (stub, baseline, активные 010–148) и параметры verify script. Если есть символы, не представимые в WIN1251, понадобится отдельное решение по disposable cluster; существующий созданный каталог не удалять без отдельного согласия владельца. Сервер не запускался, порт 55439 не использовался, существующий процесс PID 5632 не затрагивался, PIN_TRIAL/production не затрагивались.


- **Disposable PostgreSQL 18 — SQL encoding preflight passed (2026-11-16):** пользователь выполнил read-only проверку 141 SQL-файла (supabase stub + canonical baseline + 139 активных миграций 010–148). Каждый файл строго декодирован как UTF-8 и проверен на представимость в Windows-1251 с exception fallback; результат: 0 несовместимых файлов. Это подтверждает только представимость символов, но не SQL parsing/replay. Теперь допустим следующий изолированный шаг — запуск уже инициализированного кластера с явным bind только `127.0.0.1`, порт `55439`; перед запуском пользователь повторно проверит отсутствие listener на порту и наличие ожидаемого PG18 data directory. До этого момента сервер не запускался, миграции не применялись.


- **Disposable PostgreSQL 18 — loopback server started (2026-11-16):** пользователь выполнил preflight: `X:\PinPosy-verify-pg18\PG_VERSION` существует и содержит `18`; TCP port `55439` не имел listener. Затем `pg_ctl.exe` из `X:\Program Files\PostgreSQL\18\bin` успешно запустил кластер с параметрами `-h 127.0.0.1 -p 55439 -c listen_addresses=127.0.0.1`; pg_ctl сообщил «сервер запущен». Это подтверждает успешный запуск с заданными параметрами, но фактический listener, PID, версию сервера, адрес, порт и `data_directory` ещё нужно проверить read-only через `pg_ctl status`, `Get-NetTCPConnection` и PG18 `psql`. SQL и миграции не выполнялись; временные БД не создавались; существующий PostgreSQL PID 5632, PIN_TRIAL и production не затрагивались. Следующий шаг — проверить, что единственный listener на 55439 принадлежит именно этому временному кластеру и слушает только 127.0.0.1, затем выполнить read-only SQL identity query.


- **Disposable PostgreSQL 18 — server identity and loopback isolation verified (2026-11-16):** пользователь проверил `pg_ctl status`: PID `15220`, команда процесса `X:/Program Files/PostgreSQL/18/bin/postgres.exe` с `-D X:/PinPosy-verify-pg18 -h 127.0.0.1 -p 55439 -c listen_addresses=127.0.0.1`. `Get-NetTCPConnection` показал listener только на `127.0.0.1:55439`, OwningProcess `15220`. Read-only запрос через PG18 `psql.exe` подтвердил БД `postgres`, роль `pinposy_verify_admin`, адрес `127.0.0.1`, порт `55439`, data_directory `X:/PinPosy-verify-pg18`, encoding `WIN1251`, версию `PostgreSQL 18.6`. Временный кластер однозначно идентифицирован и loopback-only подтверждён. SQL миграций и тестовые БД ещё не создавались. Перед запуском replay необходимо сверить локальный checkout с актуальным GitHub main и обеспечить, чтобы `verify.ps1` использовал PG18 `psql.exe` и роль `pinposy_verify_admin`; скрипт находит psql через PATH и не передаёт `-U`, поэтому нельзя запускать его с неустановленным/неверным `PGUSER`.


- **Local checkout synchronization preflight (2026-11-16):** пользователь выполнил `git fetch origin`; локальная ветка `main` находится на `0d393d34a0fbccf24dc46eefe5bf69281db965c5`, `origin/main` обновилась до `ab5ab3e83f3f2bef68b6715b92d37a68cefc0320`, Git сообщает `main...origin/main [behind 420]`. `git status --short --branch` не показал локальных изменений. `git hash-object scripts/verify.ps1` вернул `6614843edaafd4924c90c679a0f9fe232e59a0f0`, совпадает с blob SHA проверенного файла на GitHub main. Это подтверждает совпадение конкретного скрипта, но локальная ветка в целом устарела. Следующий безопасный шаг — только fast-forward синхронизация `git pull --ff-only origin main`; миграции и verify script ещё не запускались.


- **Local main fast-forward synchronization completed (2026-11-16):** пользователь выполнил `git pull --ff-only origin main`. Fast-forward успешно обновил локальную ветку с `0d393d34a0fbccf24dc46eefe5bf69281db965c5` до `ba6caa67ad9903b964172e9d0ce2d5609be0bbd0`; Git сообщил обновление 90 файлов (4221 insertions, 705 deletions). После pull `git status --short --branch` показал `## main...origin/main` без локальных изменений, `git rev-parse HEAD` вернул `ba6caa67ad9903b964172e9d0ce2d5609be0bbd0`. Значит локальный checkout синхронизирован с origin/main. Проверенный `scripts/verify.ps1` на GitHub имеет blob SHA `6614843edaafd4924c90c679a0f9fe232e59a0f0`; ранее локальный hash-object показал тот же SHA, и fast-forward не изменял этот файл. Следующий шаг — один контролируемый запуск `-MigrationsOnly -PostgresPort 55439` с PG18 client и `PGUSER=pinposy_verify_admin`; endpoint ограничен loopback временного кластера. Для предотвращения повторных password prompts пароль следует ввести один раз через secure prompt и передать только дочерним psql-процессам через временную переменную окружения, затем очистить её в finally. Не запускать frontend/backend suites.


### UA-001 — первый чистый PostgreSQL replay выявил дефект миграции 140 (2026-11-16)

- Пользователь запустил `scripts/verify.ps1 -MigrationsOnly -PostgresPort 55439` на изолированном PostgreSQL 18.6 (`127.0.0.1:55439`, data directory `X:/PinPosy-verify-pg18`, server encoding WIN1251, client encoding UTF8). Идентичность сервера перед запуском совпала с ожидаемой.
- Скрипт создал disposable DB `pinposy_verify_13212ccdd0602`, применил Supabase stub, canonical baseline `001_baseline.sql` и migrations 010–139. На migration 140 `140_account_deletion_review_queue_image_manifest.sql` PostgreSQL сообщил syntax error около `THEN` (psql указал файл, строку 118). Replay завершился с exit code 1.
- В выводе есть сообщения о повторном удалении отсутствующих policies/constraints/triggers/functions; эти сообщения были NOTICE/WARNING от идемпотентных DROP IF EXISTS и не остановили replay. Остановка произошла именно на SQL syntax error в migration 140.
- Проверочный скрипт выполнил cleanup своей disposable DB: `pg_terminate_backend` вернул 0 строк, затем `DROP DATABASE` завершился успешно. Временный PostgreSQL cluster оставлен запущенным. Production, PIN_TRIAL и существующий кластер не затронуты.
- Проверка актуального GitHub main выявила в migration 140 повреждённый фрагмент: незакрытая regex-строка URL validation и отсутствующий блок `SELECT r.user_id, r.id INTO v_user_id, v_request_id`. Сравнение с непосредственно предыдущей migration 139 подтвердило корректную исходную форму этих двух блоков.
- Исправление записано в main: commit `b2cb16ca75d7723f345ecd270cb77cc72149be51`. Восстановлены URL validation + job/request lookup; обе новые выборки `pin_review_queue.payload.imageUrl` и `payload.image_url` сохранены. После записи файл повторно прочитан с GitHub и проверено наличие восстановленных блоков и обеих review-queue ветвей.
- **Статус:** migration replay НЕ пройден; фикс закоммичен, но ещё не проверен повторным исполнением. Не отмечать DB gate выполненным до полного успешного replay 001 + 010–148 и подтверждения cleanup disposable DB.
- **Следующий шаг:** пользователь синхронизирует только новый commit main в локальный checkout (fast-forward), затем выполняется один повторный migration-only replay на том же изолированном cluster/порту. Не запускать повторно старую локальную версию migration 140.


### UA-001 — replay failure captured; corrected migration synchronized locally (2026-11-16)

- **Первый replay пользователя:** `scripts/verify.ps1 -MigrationsOnly -PostgresPort 55439` на PostgreSQL 18.6 (`127.0.0.1:55439`, `X:/PinPosy-verify-pg18`, WIN1251 server / UTF8 client). Создана disposable DB `pinposy_verify_13212ccdd0602`; stub, baseline `001_baseline.sql` и миграции 010–139 прошли, выполнение остановилось на migration 140: syntax error near `THEN`, строка 118; exit code 1. Полный replay 001 + 010–148 не пройден.
- **Очистка:** finally-блок verify script выполнил `pg_terminate_backend` (0 строк) и успешный `DROP DATABASE`; disposable DB удалена. Временный кластер оставлен запущенным. Production, PIN_TRIAL и существующий PostgreSQL PID 5632 не затронуты.
- **Причина и исправление ассистента:** в migration 140 выявлены повреждённая URL-regex validation и отсутствующий lookup job/request. В commit `b2cb16ca75d7723f345ecd270cb77cc72149be51` исправлены эти блоки; обе выборки `pin_review_queue.payload.imageUrl` и `payload.image_url` сохранены. Файл повторно прочитан с GitHub. Commit не считать проверенным до replay.
- **Синхронизация пользователя:** `git pull --ff-only origin main` fast-forward с `ba6caa67ad9903b964172e9d0ce2d5609be0bbd0` до `ebb1040ac73e600dfdbfc57d8aa765f9713441a2`; 3 файла, 34 insertions, 2 deletions. Локальный blob SHA migration 140 `484e589c32940ad9df8ef67de71c43b27fddf76c` совпадает с blob SHA, полученным ассистентом из GitHub main.
- **Статус и следующий шаг:** исправленная миграция синхронизирована, повторный replay ещё не запускался; DB gate открыт. Следом повторить только migration replay, проверив HEAD `ebb1040ac73e600dfdbfc57d8aa765f9713441a2` и blob SHA `484e589c32940ad9df8ef67de71c43b27fddf76c`. Frontend/backend suites не запускать; временный кластер не останавливать и не удалять без отдельного согласия.


### Disposable PostgreSQL migration replay — PASS (2026-11-16)

- Цель: проверить исправление db/migrations/140_account_deletion_review_queue_image_manifest.sql и доказать, что полный набор миграций воспроизводится с нуля на поддерживаемом временном PostgreSQL, не затрагивая production/PIN_TRIAL.
- Локальная синхронизация пользователя: после предыдущего документационного обновления пользователь выполнил git pull --ff-only origin main; fast-forward завершился успешно. Локальный HEAD: ebb1040ac73e600dfdbfc57d8aa765f9713441a2. Локальный blob SHA миграции 140: 484e589c32940ad9df8ef67de71c43b27fddf76c.
- Подтверждение целевого сервера перед запуском: 127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|UTF8|PostgreSQL 18.6 on x86_64-windows, compiled by msvc-19.44.35228, 64-bit. Это соответствует изолированному кластеру PostgreSQL 18.6, bind только на loopback, с UTF8 client encoding.
- Повторный replay: verify script создал disposable DB pinposy_verify_196929316b56e, применил Supabase test stubs, canonical baseline 001_baseline.sql, затем последовательно все активные миграции 010–148, включая исправленную 140_account_deletion_review_queue_image_manifest.sql и последующие 141–148.
- Результат: вывод содержит PASS PostgreSQL migration replay (001 + 010-148), All configured checks passed. и MIGRATION REPLAY PASSED. Все SQL-команды дошли до конца; процесс завершился успешным итогом. Исправление миграции 140 подтверждено полным replay.
- Очистка: verify script выполнил pg_terminate_backend (0 строк) и успешный DROP DATABASE для disposable DB pinposy_verify_196929316b56e. Временная БД удалена штатным cleanup скрипта. Временный кластер PostgreSQL X:/PinPosy-verify-pg18 не останавливался и не удалялся.
- Замечания к выводу: PostgreSQL выводил уведомления о пропуске отсутствующих объектов при идемпотентных DROP/ALTER/trigger/policy операциях; они не прервали replay. Русский текст уведомлений отображался в терминале как mojibake; при этом client encoding был UTF8, SQL исполнился, а все проверки завершились PASS. Это следует считать отдельной проблемой отображения консоли, а не провалом миграций.
- Безопасность/границы: проверка выполнялась только на 127.0.0.1:55439, data directory X:/PinPosy-verify-pg18, disposable DB с именем выше. Production, PIN_TRIAL и существующий PostgreSQL cluster/PID 5632 не использовались и не изменялись. Frontend/backend suites этим запуском не выполнялись.
- Статус: DB migration replay gate закрыт успешно: baseline + migrations 010–148 воспроизводятся на чистой disposable БД PostgreSQL 18.6.
- Следующий шаг: продолжить строго по следующему незакрытому пункту актуального PROJECT_STATE.md; не повторять migration replay без причины. Временный PostgreSQL cluster оставить как есть до отдельного решения о завершении проверки; не останавливать и не удалять без отдельного согласия пользователя.


- 2026-11-16 — после успешного migration replay сверены актуальные `docs/PROJECT_STATE.md`, `scripts/verify.ps1`, `backend/package.json`, полный Git tree, `backend/test/postgres-integration.sql`, `docs/backend-audit/13-sql-migration-static-review.md` и `.github/workflows/atomic-payment-integration.yml`. Установлено: `-MigrationsOnly` запускает только canonical baseline + migrations 010–148 и не запускает SQL integration tests. CI SQL suite использует отдельный legacy/upgrade fixture (roles anon/authenticated/service_role, вручную созданные базовые таблицы и helper function), затем миграции и упорядоченные SQL/concurrency tests; это отдельный тестовый сценарий, его нельзя подменять запуском SQL-файлов поверх уже удалённой disposable DB из replay. По workflow найден набор SQL integration files и дополнительные bash concurrency tests. В этой read-only фазе ни один integration test не запускался, SQL/БД не менялись. Следующий шаг: подготовить безопасный единый runner для Windows disposable DB, точно воспроизводящий workflow fixture + migration + ordered test steps, с проверкой loopback/identity и гарантированным удалением только своей БД; до подготовки такого runner не запускать SQL tests вручную на произвольной БД.


- 2026-11-16 — детально разобран post-migration SQL этап `.github/workflows/atomic-payment-integration.yml`: после upgrade fixture и полного применения 010–148 workflow вызывает 46 SQL-файлов интеграционных тестов, 2 дополнительных inline SQL DO checks и 9 bash concurrency scripts (последние не входят в число SQL-файлов и требуют bash). Обнаружена устаревшая prerequisite-комментария в `backend/test/postgres-integration.sql`, ошибочно указывавшая migrations 010–052, хотя текущий workflow применяет полный диапазон 010–148. Исправлена только эта комментария в commit `72c6638eba9393a8f9515bcbbf1ca6f8526e9d84`; повторное чтение main подтвердило текст «complete ordered migration chain 010–148». Функциональный SQL-файл не менялся. Следующий технический шаг — создать безопасный disposable runner, воспроизводящий workflow fixture, миграции и упорядоченные SQL tests; до его готовности integration tests не запускать вручную.


- Документационные фиксации этого рабочего прохода: `docs/PROJECT_STATE.md` обновлялся коммитами `e95db14918b0de07bd6298595ac211898b1ebc37`, `a93c8652c2a21f2f113874e43c2d3c8a5d3dc0f3`, `c9d61fd53898e34817d10241679247cae0fcb883`; `docs/USER_ACTIONS.md` — `4e8d843cb176cbd4cb50c28aa603887241a984db`, `89ce779995a76a56239a9018bfbe2849db5851d6`, `9e0d6b4b5a1f66302930e4e2e2626eef9ce35f45`; SQL static review report — `b15d38cfabe569d871d9b2b386713d56a0c72fc5`. Кодовая правка комментария теста — `72c6638eba9393a8f9515bcbbf1ca6f8526e9d84`. Все изменения выполнены напрямую в main; локальный checkout пользователя после code commit нужно обновить fast-forward перед следующим запуском.


### Integration-suite preparation review (2026-11-16; read-only)

- Re-read the current GitHub `main` copies of `.github/workflows/atomic-payment-integration.yml`, `backend/package.json`, `scripts/verify.ps1`, `db/supabase-stub.sql`, `backend/test/postgres-integration.sql`, `docs/PROJECT_STATE.md`, and the SQL migration review report before choosing the next step. Current latest recorded main commit is `9fbf85845b8ee1797a8c149689f720512dd3fe54` (documentation-only update to `docs/USER_ACTIONS.md`).
- Confirmed the successful fresh-install migration replay does not exercise the CI integration fixture or integration tests: `scripts/verify.ps1 -MigrationsOnly` creates a separate disposable DB, applies the Supabase stub + canonical `001_baseline.sql` + migrations `010–148`, and then drops that DB.
- Re-read the CI integration workflow. Its integration DB is a distinct upgrade-compatibility fixture: it creates roles `anon`, `authenticated`, `service_role`, legacy-shaped core tables and the baseline `adjust_credits_balance(text, integer)` helper; it applies migrations `010–148` with a special permissive-grants setup immediately before migration 039; then runs the ordered SQL checks and concurrency shell scripts. Workflow currently references 46 SQL files and 9 bash concurrency scripts (lists are maintained in the workflow itself). It also contains two inline SQL DO-block assertions before the ordered file-based tests.
- This pass was inspection only. No SQL was executed, no database was created/changed, no application code was changed, and no production/PIN_TRIAL/existing PostgreSQL cluster was accessed. The temporary cluster `X:/PinPosy-verify-pg18` on `127.0.0.1:55439` remains as previously directed.
- Decision: do not point the canonical migration replay script at this fixture and do not run SQL files individually. Next implementation task is a dedicated Windows PowerShell disposable integration runner that reproduces the workflow fixture, migration order (including the migration-039 grant precondition), both inline DO checks, and exact ordered SQL file list; it must validate loopback/server/data-directory identity before creating a uniquely named database and drop only that database in a finally block. The 9 bash concurrency scripts require a separate explicit Bash-runtime compatibility check and must not be silently counted as executed by the SQL runner.
- Verification status: migration replay gate remains PASS; CI integration suite remains NOT RUN. No integration-runner implementation or test result is claimed in this entry.



- 2026-11-16 — подготовлен безопасный Windows SQL integration runner после повторной сверки актуальных main, PROJECT_STATE, USER_ACTIONS и CI workflow. Из workflow атомарно извлечены upgrade fixture, обе inline DO assertions и ordered manifest из 46 SQL integration files; добавлены файлы backend/test/postgres-integration-upgrade-fixture.sql, backend/test/postgres-integration-pinterest-deletion-check.sql, backend/test/postgres-integration-refresh-fence-check.sql, backend/test/postgres-integration-sql-manifest.txt. Добавлен scripts/verify-integration.ps1: чистый main/origin-main guard, process/listener/data-directory/loopback identity guard, exact PostgreSQL 18.6 identity, secure password prompt, UTF8 client, WIN1251 representability preflight, exact 139 migrations 010–148, grant precondition перед 039, ordered SQL test execution, finally cleanup только disposable DB и runner-created roles. Добавлен backend/test/postgres-integration-runner-contract.test.js для предотвращения drift между extracted files и GitHub Actions. Static source comparison фактически подтвердил fixture exact match (кроме отдельно runner-managed roles), 2 inline checks exact match, 46 SQL tests exact order и наличие файлов, 139 migrations contiguous, 9 Bash scripts остаются отдельным шагом. Commits: fixture/check/manifest extraction `587c598a`, `1507dfd1`, `6039f13d`, `012d4e06`, fixture role separation `02f3468f`; runner `156478cc`, safety/rebuild fixes `92534930`, `9cfdca28`, final target/password guard `39d2491f`; contract test `c32d0e4d`, syntax correction `7eaa9966`. GitHub main at start of documentation update: `7eaa99666758f14f7aeb192e63fa053c07b8dfdb`. PowerShell parser/runtime, Node contract test execution, SQL integration tests and Bash concurrency tests НЕ запускались: текущая среда не имеет доступа к пользовательскому Windows checkout/PostgreSQL process; никаких БД не создавалось и не изменялось в этой сессии. Следующий шаг владельца зафиксирован в UA-004: fast-forward sync и локальный запуск runner; пароль не передавать в чат. Production, PIN_TRIAL, existing cluster/PID 5632, deployment, real payments and Pinterest accounts не затрагивались.

### Автономное продолжение: повторная сверка SQL integration gate (2026-11-16)

- Перед любыми действиями повторно прочитаны актуальные GitHub main, docs/PROJECT_STATE.md, docs/USER_ACTIONS.md, scripts/verify-integration.ps1, backend/test/postgres-integration-runner-contract.test.js и .github/workflows/atomic-payment-integration.yml.
- Проверенный HEAD main: b2a60ef25e574a1ed80f99f5e2a8abb77f543696. Актуальные blob SHA: PROJECT_STATE a4171c9c367fdae1b2671f5871657d3762982eb0, USER_ACTIONS a075be778ed17583ec22531c17d60da4d7a85383, integration runner 864dfbcb45689b08c1678e7aaa58ada1b12662b4, runner contract test 6a07a1b088d3f9a7ad949f4b88847f73cf7cc680.
- Сверено, что следующий обязательный пункт остаётся UA-004: выполнить Windows runner на локальном disposable PostgreSQL 18.6. Runner требует пользовательский checkout X:\!PROGECT\pinboard-ai, PowerShell, локальный процесс PostgreSQL и пароль временной роли; эти ресурсы недоступны из GitHub-only среды ассистента. Не запускал SQL, не создавал БД, не менял миграции/код и не заявляю прохождение integration suite.
- Read-only review подтвердил контракт runner: он проверяет clean/synchronized main, один loopback listener, PID/data directory/port, PostgreSQL 18.6 identity; воспроизводит CI fixture, migrations 010–148, 2 inline assertions и 46 SQL tests; удаляет только созданную disposable DB. Девять Bash concurrency scripts намеренно остаются отдельной непроверенной задачей.
- Решение: не обходить обязательный локальный gate и не переходить к следующим тестам до получения результата UA-004. Production, PIN_TRIAL, существующий PostgreSQL PID 5632, deployment, реальные платежи и Pinterest публикации не затрагивались.

- 2026-11-16 — независимая сверка после реализации runner: прочитаны все 46 SQL integration files из manifest. Статический поиск не обнаружил CREATE/DROP/ALTER DATABASE, CREATE/DROP/ALTER ROLE, ALTER SYSTEM, psql \connect/\c, shell escape \!, COPY PROGRAM, pg_read_file/pg_write_file или pg_terminate_backend; две psql meta-команды — только \set ON_ERROR_STOP on. Некоторые файлы явно фиксируют тестовые данные через COMMIT, что допустимо только в disposable DB. Это source review, не выполнение тестов. GitHub Actions run `43949890305` на HEAD `b2a60ef25e574a1ed80f99f5e2a8abb77f543696` завершился failure до шагов: job `133589252669`, `steps: null`, `logs_url: null`; contract Node test и pwsh parser step не запускались. Combined status Vercel: failure target `build-rate-limit`, без build log. Поэтому SQL integration, Bash concurrency, backend/frontend runtime и PowerShell parser остаются NOT RUN. Production/PIN_TRIAL/временный PostgreSQL не затрагивались.

### FE-29 — исправлен отсутствующий import в тесте auth storage (2026-11-16)

- Перед изменением повторно сверены main, docs/PROJECT_STATE.md, docs/frontend-audit/01-auth-shell-api.md, frontend/src/lib/authStorage.test.ts и frontend/src/lib/authStorage.ts. Проверенный HEAD перед code commit: abbf305c84e44ee63543d51b68e29e66009b8e3e.
- Найден дефект: тест `route guard predicate fails closed when storage is blocked` вызывал `hasStoredAuthToken()`, но не импортировал его. Helper действительно экспортирует эту функцию. Без исправления данный тест падал бы с ReferenceError при исполнении.
- Исправлен только named import в frontend/src/lib/authStorage.test.ts. Code commit: d4c65ad9ad3e7ed192a41fcc0b0eb9e75df53f98; новый blob SHA: fc8953dc3a99d978fc95d938a7acdbf0593e9d93.
- Документация `docs/frontend-audit/01-auth-shell-api.md` дополнена finding FE-29. Также исправлена устаревшая формулировка FE-01 о Login: последующий FE-02 уже устранил безусловную навигацию после неуспешного refreshUser().
- Статическая readback проверка подтвердила импорт в тесте и export в helper. Сам тест, полный frontend suite, TypeScript check и production build НЕ запускались; Actions jobs на текущем окружении не доходят до runner allocation, локальный Windows checkout недоступен.
- Чекбоксы runtime/frontend readiness не закрыты. Production, PIN_TRIAL, платежи, Pinterest и deploy settings не затронуты.

### FE-30 — доступность ошибок поиска ключевых слов (2026-11-16)

- Перед изменением повторно сверены актуальные main, docs/PROJECT_STATE.md, docs/frontend-audit/09-board-category-localization.md, frontend/src/components/keywords/KeywordExplorer.tsx и frontend/package.json. Проверенный HEAD перед кодовыми изменениями: 6a93e77492bd29670d96d3d592b560eb66d285ee.
- В KeywordExplorer ошибка API отображалась визуально, но контейнер не имел role=alert/live-region семантики. Исправлено добавлением role=alert без изменения запроса, очистки устаревших результатов или текста.
- Добавлен frontend/src/utils/keywordExplorerAccessibility.test.ts: проверяет alert semantics, удаление устаревших результатов при ошибке и доступную метку поля поиска. Тест попадает в существующий glob src/utils/*.test.ts.
- Commits: компонент 7dac0fe025b0349fe01ceb3f257de55bd31464ce; regression test ca6b7231413bb5636a3af43de92ea4f9b3e01db8.
- Статическая readback проверка подтвердила role=alert и наличие тестовых assertions. Тест, полный frontend suite, TypeScript check и build НЕ запускались; browser/screen-reader verification также не выполнялась.
- Обновлён docs/frontend-audit/09-board-category-localization.md. Никакие runtime readiness чекбоксы не закрыты. Backend, БД, production, платежи, Pinterest и deployment не затронуты.

- 2026-11-16 — runner safety review выявил и исправил off-by-one в длине disposable DB identifier: prefix `pinposy_sqlint_` (15 chars) + GUID suffix (16 chars) = 31, поэтому прежняя проверка на 32 ошибочно останавливала запуск до создания БД. Исправлено на 31 (commit `e45710af`). Дополнительно параметры закреплены на единственном одобренном target: port 55439 (ValidateSet), PG18 psql path, data directory `X:/PinPosy-verify-pg18`, role `pinposy_verify_admin` (commit `0beb49f3`); добавлена проверка manifest entries на path traversal и `.sql` extension (`fdd5046e`); cleanup теперь перечитывает pg_database и подтверждает, что disposable DB удалена (`bb86b4d0`). Contract test расширен проверками pinned target, ID length, manifest path guard и cleanup; его JS syntax прошёл parse-only проверку через V8 `new Function` (не выполнение тестов). Последний code HEAD `43dfdcc3b89f4a852bd065495f2dfd781ade737a`. GitHub Actions runs `43950729248` (postgres-atomicity job `133592183546`), `43950729228` (backend `133592183976`, frontend `133592184569`) завершились failure с `steps: null`, `logs_url: null`; CI runner снова не исполнил ни одного шага. Vercel status: failure target `build-rate-limit`, без build log. PowerShell parser, contract test execution, SQL integration, Bash concurrency, backend/frontend runtime всё ещё NOT RUN. Следующее действие остаётся UA-004 — владелец синхронизирует main и запускает runner на одобренном локальном PostgreSQL; production/PIN_TRIAL/PID 5632 не трогать.

### Дополнительная проверка admin demo data isolation (2026-11-16)

- Повторно сверены актуальные main, docs/PROJECT_STATE.md, docs/frontend-audit/07-admin-account-privacy-legal.md, frontend/src/data/adminMockData.ts и все восемь активных admin screen modules.
- В adminMockData.ts есть статические демонстрационные записи. Ни один из восьми проверенных активных admin screen modules не импортирует adminMockData/ADMIN_USERS; AdminPanel явно предупреждает, что неподтверждённые user/statistics/tax screens скрыты и демонстрационные пользователи/фиктивные платежи не отображаются. Admin subscriptions/billing exception views используют apiRequest endpoints.
- Файл seed не удалялся: проверка ограничена активным admin component set и не доказывает отсутствие импорта во всём репозитории. Требуется полный reference scan перед удалением.
- Результат и границы внесены в docs/frontend-audit/07-admin-account-privacy-legal.md. Production данные, платежи и admin mutations не затрагивались.

### Уточнение устаревшего замечания об admin mock data (2026-11-16)

- Перед записью повторно сверены текущий `main` (`da04cf8f8bbdaebfed840c6aa0ad7a07f5a92fd6`), `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, `AdminPanel.tsx` и активный admin component set.
- Обнаружено, что раздел 3 паспорта сохранял устаревшее предварительное наблюдение «AdminPanel использует mock-данные». Текущий AdminPanel не импортирует `adminMockData.ts`/`ADMIN_USERS`/`ADMIN_TRANSACTIONS`, явно скрывает неподключённые разделы и сообщает, что демонстрационные пользователи и фиктивные платежи не показываются. Восемь активных admin screen modules были проверены отдельно; прямых импортов demo seed в них нет. Подробности ранее внесены в `docs/frontend-audit/07-admin-account-privacy-legal.md`.
- Попытка глобального поиска по GitHub code search не дала достаточного доказательства полного отсутствия ссылок (ответ API помечен `incomplete_results`). Поэтому seed-файл не удалялся, а глобальный аудит и чекбокс полного file-by-file review остаются открытыми.
- Исправлено только устаревшее утверждение в разделе 3 настоящего паспорта. Runtime tests, frontend build, backend suite и SQL integration suite не запускались; никаких runtime чекбоксов не закрыто. Production, PIN_TRIAL, платежи и Pinterest не затронуты.

- 2026-11-16 — после documentation commit `37d6ea4e4b595a8555e0cc9eabb22e8b08d5d9c2` повторно проверен commit status: Vercel `failure`, описание `Deployment rate limited — retry in 24 hours`, target `build-rate-limit`. Это rate-limit до подтверждённого build, не ошибка исходников и не успешная сборка. На этот documentation HEAD GitHub Actions run не создан. Детали записаны в `docs/USER_ACTIONS.md`; не инициировать upgrade/смену deployment settings без решения владельца.

### Повторная проверка обязательного NEXT и deployment status (2026-11-16)

- Перед проверкой повторно прочитаны текущие `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, `scripts/verify-integration.ps1`, `.github/workflows/atomic-payment-integration.yml` и package scripts. Текущий `main` до этой записи: `946e062ab49bf0dfaa5876176c2d55bb383b6ed5`.
- NEXT не меняется: сначала владелец запускает UA-004 integration runner локально на отдельном PostgreSQL 18.6; только после фактического PASS SQL integration suite переходить к девяти Bash concurrency scripts и backend Node suite. У ассистента нет доступа к Windows checkout, PowerShell и пользовательскому локальному кластеру; запуск на production/PIN_TRIAL или существующем PID 5632 запрещён.
- Для HEAD `946e062ab49bf0dfaa5876176c2d55bb383b6ed5` GitHub Actions workflow run не создан (commit docs-only; workflow paths-ignore исключает `docs/**`). Это не PASS и не FAIL тестов.
- Vercel commit status на том же HEAD: `failure`, `Deployment rate limited — retry in 24 hours`, target `build-rate-limit` (updated `2026-11-16T20:34:53Z`). Deployment/build этого HEAD не подтверждён; платный upgrade не предпринимался.
- UA-004 остаётся открытым и подробно сохранён в `docs/USER_ACTIONS.md`. Никакие тестовые чекбоксы не изменены; приложение, БД, production, платежи и Pinterest не затрагивались.

### Повторный запуск GitHub Actions для диагностики runner blocker (2026-11-16)

- Перед действием повторно сверены `main`, `docs/PROJECT_STATE.md` и `docs/USER_ACTIONS.md`. Текущий HEAD: `f089c8ae47a7a4016603b70533ae3a5fb584a0b8`; исходный код совпадает с source commit `43dfdcc3b89f4a852bd065495f2dfd781ade737a`, последующие изменения — документационные.
- Для диагностического повтора повторно запущены только ранее failed jobs: `postgres-atomicity` в run `43950729248` и `backend`/`frontend` в run `43950729228` (attempt 2). Это повторное выполнение CI на исходном source SHA `43dfdcc...`, а не проверка документационного HEAD и не замена локального UA-004.
- Все три jobs завершились `failure` до первого шага: `steps: null` в job metadata, а для postgres job отдельный endpoint шагов вернул пустой список. Download logs для postgres job вернул Azure `BlobNotFound`. Следовательно hosted runner не выполнил ни одного шага; тесты и сборка снова НЕ запускались. Повтор не выявил дефект приложения и не является PASS.
- Локальный UA-004 остаётся обязательным NEXT: пользовательский изолированный PostgreSQL 18.6 на `127.0.0.1:55439`, затем 46 SQL integration files. Не переходить к 9 Bash concurrency scripts и backend suite, пока этот SQL gate не пройден или формально не изменён владельцем.
- Production/PIN_TRIAL, локальные кластеры, секреты, deployment settings и платежи не затрагивались.

### Повторная проверка NEXT и оценка Windows self-hosted CI PR (2026-11-16)

- Перед работой сверены актуальные `main`, `PROJECT_STATE.md`, `USER_ACTIONS.md`, runner и package scripts. Проверяемый HEAD: `51cc8ca14acb08f19243c1f0256b5407766156c6`.
- Обязательный NEXT не изменился: UA-004 — локальный `scripts/verify-integration.ps1` на выделенном PostgreSQL 18.6; SQL suite ещё не подтверждён. Из доступной среды нельзя управлять пользовательским Windows PowerShell/кластером, поэтому этот gate не запускался и остаётся за владельцем.
- Дополнительно проверен открытый PR #90 `ci: run backend and frontend checks on Windows self-hosted runner`: PR draft, mergeable state `unknown`, job использует `runs-on: [self-hosted, Windows, X64]`; в описании прямо указано, что он ожидает matching self-hosted runner. Workflow не создаёт hosted fallback и не подтверждает выполнение тестов. Не объединять его автоматически: это не решает локальный SQL gate и может создать ожидающие/неисполняемые jobs при отсутствии runner.
- GitHub Actions для текущего HEAD `51cc8ca...` не имеет runs. Vercel status: `failure`, `Deployment rate limited — retry in 24 hours` (обновлено `2026-11-16T20:36:58Z`); build/deploy не подтверждены.
- Никакие тестовые чекбоксы не закрыты. Код, БД, production, настройки CI/Vercel и PR не изменялись.

### Повторная проверка обязательного SQL integration gate (2026-11-16)

- Перед действием повторно сверены актуальные `main`, `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, `scripts/verify-integration.ps1` и `backend/test/postgres-integration-runner-contract.test.js`. Проверенный HEAD до этой записи: `75e3ca335e3aedcc808ec8953c09201ddf0b96b1`.
- NEXT подтверждён без изменений: выполнить `scripts/verify-integration.ps1 -PostgresPort 55439` на локальном изолированном PostgreSQL 18.6; после фактического PASS отдельно выполнить 9 Bash concurrency scripts, затем backend Node runtime suite. Не пропускать SQL gate.
- Повторно изучен runner: фиксированные адрес/порт, data directory, PostgreSQL client path и роль; проверка clean/synchronized main и единственного loopback listener; уникальная disposable DB; manifest из 46 SQL tests; finally cleanup собственной DB и только созданных runner ролей. Contract test описывает согласованность fixture/assertions/manifest с CI workflow. Это статическая проверка исходников, не выполнение PowerShell/Node/SQL.
- GitHub Actions runs для HEAD `75e3ca3...` отсутствуют. Vercel status остаётся `failure`: `Deployment rate limited — retry in 24 hours` (обновлено `2026-11-16T20:38:03Z`), то есть сборка не подтверждена. PR #90 по-прежнему draft/open, требует self-hosted Windows runner и имеет `mergeable_state=unknown`; не объединялся.
- Локальный Windows/PowerShell и PostgreSQL пользователя из этой среды недоступны. SQL integration suite, Bash concurrency scripts, backend runtime, frontend checks/build не запускались. Чекбоксы и статусы PASS не менялись; production/БД/секреты/настройки deployment не затрагивались.

### Инвентаризация 46 SQL integration tests (2026-11-16)

- Перед изменением повторно сверены актуальные `main`, `docs/PROJECT_STATE.md` и `docs/USER_ACTIONS.md`. Исходный HEAD: `be3dadaff50ad51230b265662fc89cfd5d7f8818`; после создания отчёта inventory commit: `22759daf987418f9b59cd6d0ac5b250fdd7e6bcf`.
- Прочитан ordered manifest `backend/test/postgres-integration-sql-manifest.txt`; все 46 перечисленных SQL-файлов получены с одного и того же исходного HEAD. Зафиксированы домены: Pinterest OAuth/publication/scheduling/recovery (16), account deletion (4), billing/refunds (6), generation/regeneration/credits (8), image lifecycle (5), privilege/function hardening (4), auth recovery (1), board idempotency (1), aggregate PostgreSQL integration (1).
- Добавлен `docs/backend-audit/14-sql-integration-test-inventory.md`: назначение каждого файла, declared migration prerequisites из заголовков, общие границы и запрет запуска вне disposable DB. Отчёт отделяет inventory/header-level review от полного assertion-by-assertion анализа и runtime execution.
- Checklist этапа 0 по миграциям/SQL tests переведён в `[~]`, не в `[x]`: миграции и security static review отражены в отчёте 13; инвентаризация SQL tests добавлена в отчёт 14; глубокая проверка всех assertions и реальный SQL integration runner остаются незавершёнными.
- UA-004 не изменён: локальный Windows runner и выделенный PostgreSQL 18.6 недоступны ассистенту. Не запускались SQL, backend/frontend runtime suites или Bash concurrency scripts; тестовые PASS не присваивались. Production, PIN_TRIAL, платежи, Pinterest и локальные пользовательские кластеры не затронуты.


### Проверка verification workflows и укрепление Bash concurrency harnesses (2026-11-16)

- Перед изменениями повторно сверены `main`, паспорт, USER_ACTIONS, пять workflows и все девять Bash concurrency scripts. Исходный HEAD: `5f289d1cbf214db4dd85f0f5b2be1d1175ef0712`.
- В пяти workflows проверены события запуска, branch/path filters, Node setup, install/test/build steps и action references. В `pinterest-scheduler-cron.yml` и `prodamus-checkout-tests.yml` обнаружены плавающие `actions/checkout@v4` / `actions/setup-node@v4`; заменены на те же проверенные SHA, что используются в основном workflow. Отдельные trigger gaps/branch filters оставлены в review report, без необдуманного изменения семантики запуска.
- В девяти Bash concurrency scripts обнаружен реальный safety defect: все автоматически выбирали `localhost:5432/pinposy_test` и могли выполнить INSERT/DELETE в общей БД при запуске без явного выбора disposable target. Кроме того, scripts использовали общие фиксированные пути в `/tmp`, а два cleanup удаляли wildcard-группы файлов.
- Исправлено в commit `1b985b4fbf17299e4a35a68a2f320a37c951bb8e`: добавлен `backend/test/lib/assert-disposable-postgres.sh`; все 9 scripts теперь требуют `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` и `PINPOSY_ALLOW_DISPOSABLE_DB_TESTS=1`; разрешён только loopback, имя БД должно соответствовать `pinposy_verify_<suffix>`, а фактические `current_database()` и `inet_server_addr()` сверяются до любых fixture writes. Фиксированные временные файлы заменены уникальным temp directory; cleanup останавливает и ждёт фоновые дочерние процессы перед удалением fixture и temp directory.
- В commit `5f289d1cbf214db4dd85f0f5b2be1d1175ef0712` добавлены `backend/test/postgres-concurrency-safety-contract.test.js` и workflow step для `bash -n` общего helper + всех девяти scripts и запуска Node contract test.
- Структурная повторная сверка всех девяти обновлённых файлов подтвердила подключение helper, trap/cleanup hooks и отсутствие прежних DB defaults/shared temp paths. Это статическая проверка через GitHub content, не выполнение `bash -n` или Node test.
- Push workflow run `43953074211` на HEAD `5f289d1...` завершился до первого шага: job `postgres-atomicity`, `runner_id=0`, `steps=[]`. Следовательно добавленные contract test и bash parser step фактически НЕ выполнялись. Vercel status — `Deployment rate limited — retry in 24 hours`; build не подтверждён.
- Bash concurrency runtime tests не запускались. Для них после UA-004 требуется отдельный setup disposable PostgreSQL database с префиксом `pinposy_verify_`; запускать вручную на прежнем `pinposy_test` запрещено. Никакие пользовательские/production DB не затрагивались.
- Детали inventory, workflow trigger map и remaining review items: `docs/backend-audit/15-verification-workflow-and-concurrency-review.md`. Stage 0 item 143 и stage 1 item 157 отмечены только как `[~]`, не как завершённые.


### Сверка противоречий в документации (2026-11-16)

- Перед редактированием повторно проверены HEAD e667feb0e97aad72f7af25911ae2e99d02956dc4, паспорт, USER_ACTIONS, список веток, open PR, Actions jobs, миграционный tree и соответствующие скрипты/компоненты.
- Исправлены четыре опасных/устаревших документа: архивная инструкция запуска больше не предлагает перезапись проекта; release-line больше не советует переключать main на старую feature branch и делать force-push; database guide синхронизирован с 010–148; Pinterest multi-account architecture отражает реализацию в main и отделяет code presence от production migration state.
- Проверены текущий main, feature branch feat/persisted-boards-api (старый HEAD b2f695a9...), PR #90 (draft/open), workflow run 43953283169 (runner_id=0, steps пусты), Vercel rate-limit status и календарный компонент.
- Подробная таблица противоречий и remaining scope: docs/audits/2026-11-16-documentation-contradiction-review.md.
- Отмечен только частичный прогресс [~]: полный аудит всех документов и file-by-file register ещё не выполнены. Production migrations/providers/DNS/payment/Pinterest settings не менялись.


### Синхронизация корневых планов и operational guides (2026-11-16)

- Выявлены дополнительные устаревшие источники статуса: LAUNCH_CONTROL и MASTER_REQUIREMENTS указывали feature branch как рабочую; PRODUCTION_READINESS_AUDIT продолжал называть старый PR #4 единственным объектом аудита; payments guide утверждал, что миграции 029/030 остались только в feature branch; domain/email guides не отделяли target configuration от проверенной live configuration.
- Обновлены шапки и статусные оговорки этих документов: PROJECT_STATE.md теперь явно главный актуальный operational passport; MASTER_REQUIREMENTS оставлен как product scope catalogue, LAUNCH_CONTROL и PRODUCTION_READINESS_AUDIT помечены как исторические snapshots; платежная справка отделяет код в main от применения миграций/включения реальных платежей; DNS/email instructions запрещают считать описанную конфигурацию подтверждённой.
- По backend/.env.example и коду проверены имена PRODAMUS_SHOP_ID, PRODAMUS_SECRET, PRODAMUS_SECRET_WEBHOOK, PRODAMUS_SYS, PRODAMUS_URL, PRODAMUS_DEMO, PRODAMUS_OFFLINE, PUBLIC_BACKEND_URL и MAIL_SMTP_*; legacy root test/billing-flow.js существует, а backend/test/billing-flow.js — нет.
- Эти правки документируют границы знаний; live provider settings, DNS, mailboxes, Supabase production migration state и payment mode в этой сессии не запрашивались и не менялись.


### File-by-file inventory документации (2026-11-16)

- На HEAD 483ec9954a6cd59379b566a48f23da58b454bbf8 получено дерево docs/: 400 файлов (399 Markdown, 1 SQL). Создан docs/DOCUMENTATION_REGISTER.md с точным путём, Git blob SHA, категорией и текущим review status каждого файла.
- В filenames обнаружены повторяющиеся audit IDs (40 уникальных ID с несколькими файлами); список зафиксирован в register. Ничего не переименовывалось и не удалялось, чтобы не ломать исторические ссылки.
- Важно: register — metadata inventory, не доказательство чтения всех 399 документов. Следующий шаг — содержательный review по группам, начиная с operational runbooks, proposals и оставшихся root/provider docs.


### Сверка runbooks account deletion и Pinterest scheduler (2026-11-16)

- Проверены AUD-389, AUD-395, AUD-396, AUD-397 proposal, AUD-398 и AUD-386 runbook по фактическому main-коду и migrations 127–148.
- В четырёх account-deletion design/runbooks оставались ложные утверждения, что endpoint/worker/schema ещё только проектируются. Добавлены заметные historical/superseded banners; proposal SQL AUD-397 прямо запрещён к исполнению и помечен superseded реализованной цепочкой 127–148.
- Pinterest scheduler runbook уточнён: migrations 122–123 входят в mainline 010–148, но это не подтверждает их применение к production; production scheduler включать только после SQL/staging gates и явного approval.
- Проверка кода подтвердила наличие backend/accountDeletionWorker.js, durable queue migration 130, content-erasure stage 137 и tombstone finalization 138. Runtime worker и destructive workflow не запускались.


### Расширенная сверка исторических account-deletion design runbooks (2026-11-16)

- Проверены дополнительные AUD-372, AUD-391, AUD-392, AUD-393, AUD-394 и AUD-397 schema review runbooks по текущим миграциям 127–148 и backend worker/routes.
- Эти документы всё ещё помечали account deletion/auth/financial/generation/Pinterest fencing как «design only» и содержали большие unchecked future-state списки, хотя соответствующая реализация уже присутствует в main. Добавлены historical/superseded banners; старые чекбоксы оставлены как исторический снимок, а не переписаны в PASS.
- Никаких production migrations, account deletions, provider calls или worker jobs не запускалось. Остальные runbooks остаются в очереди content review по register.


### Сверка открытых PR и веток (2026-11-16)

- На HEAD 8d7d1f3edbc4b96966fc72f05c669a94ef140c82 получены 100 веток (page 2 пуст) и 55 открытых PR. У каждого PR выполнен GitHub compare по head SHA к main: все diverged/stale; behind от 7 до 4720 commits. PR #7 и #4 имеют 0 commits ahead относительно текущего main, но на устаревших target branches.
- Для каждого PR зафиксированы ahead/behind, draft и рекомендация. Потенциально важные операционные/test PR выделены для узкого FIX/REBASE; устаревшие/дублирующие snapshots помечены CLOSE CANDIDATE; dependency PR вынесены в отдельную compatibility review.
- Ничего не merge/close/delete автоматически. Main не переписывался. Подробный реестр всех 100 веток и 55 PR: docs/audits/2026-11-16-open-pr-and-branch-review.md.
- Инвентаризация веток не означает, что все orphan branches содержат уникальную работу; до удаления нужен отдельный content-level diff.


### Обновление documentation register и сверка release inventory (2026-11-16)

- После добавления отчёта PR/branch review обновлён docs/DOCUMENTATION_REGISTER.md: 403 файлов, текущие Git blob SHA, source HEAD b39f09c6c0b8c74e68b445f81b497945c2eb6fc7; 40 повторяющихся AUD IDs остаются зафиксированными без rename.
- Отдельно зафиксировано: PR review — 55 открытых PR и 100 веток, ни один PR не принят/закрыт автоматически; см. docs/audits/2026-11-16-open-pr-and-branch-review.md.


### Исправление CI concurrency harness: отдельная disposable-копия (2026-11-16)

- Перед изменением повторно проверены main HEAD 31b94158b4687227fe483908c222e66abe92fd25, паспорт, USER_ACTIONS, workflow `.github/workflows/atomic-payment-integration.yml`, общий guard и все девять concurrency scripts.
- Найдено несоответствие: девять scripts требуют `PGDATABASE=pinposy_verify_<suffix>` и `PINPOSY_ALLOW_DISPOSABLE_DB_TESTS=1`, но workflow запускал их напрямую в общей CI fixture `pinposy_test` без этих параметров. Следовательно, scripts отказались бы запускаться после hardening; runtime они не запускались из-за runner allocation blocker.
- Добавлен `backend/test/run-disposable-concurrency-suite.sh`: валидирует loopback и GitHub run identity, создаёт уникальную БД `pinposy_verify_<run>_<attempt>` как clone подготовленной `pinposy_test`, отказывается использовать существующую БД, включает explicit opt-in, запускает все 9 scripts последовательно и удаляет только собственный clone в EXIT trap.
- Workflow больше не запускает concurrency scripts в `pinposy_test`; после SQL integration suite вызывает новый runner отдельным шагом. Добавлен static contract test для workflow, списка 9 scripts, clone source, database prefix, opt-in и cleanup.
- AUD-401 синхронизирован с цепочкой 001 + 010–148, PostgreSQL 16 CI vs owner-side PostgreSQL 18.6, payment idempotency migrations 116–118 и статусом AUD-400 как proposal.
- Только статические проверки при подготовке; bash -n, Node contract test, PostgreSQL runtime suite и Actions не запускались. Production/Supabase не затрагивались.


### Статическая проверка изоляции concurrency suite и CI повторно (2026-11-16)

- После commit `d7f018b11088c1729478ceb0d5512ab2d9e444f7` повторно получены все 9 concurrency scripts, shared guard, новый runner, contract test и workflow с main.
- Выполнено 11/11 независимых source-level assertions: runner присутствует ровно один раз; прямых запусков 9 scripts из общей fixture нет; все 9 scripts перечислены в runner; уникальный DB suffix, explicit opt-in, template clone, cleanup trap, loopback и actual DB/server guard подтверждены; contract test содержит новый сценарий.
- Реально выполнен `bash -n` для точного содержимого `backend/test/run-disposable-concurrency-suite.sh` в Bash 5.2.37: PASS. PostgreSQL binaries отсутствуют в среде проверки; DB clone, nine runtime scripts и PostgreSQL cleanup не запускались.
- Новый main commit автоматически вызвал Actions runs `43955465209` (postgres-atomicity) и `43955465181` (frontend/backend). Jobs API: у всех job `runner_id=0`, `steps=[]`; ни Bash parser step, ни Node contract test, ни SQL suite не выполнялись. Это тот же pre-run allocation blocker, не результат тестов PinPosy.
- UA-004 остаётся единственным ближайшим owner action в `docs/USER_ACTIONS.md`; других действий владельца до его результата не добавлено. Production, PIN_TRIAL, Prodamus, Pinterest и deployment settings не затрагивались.


### Уточнение refund runbooks и Vercel deployment evidence (2026-11-16)

- Перепроверены migrations 072–073, `backend/adminProviderRefundActions.js`, `backend/prodamus.js`, `backend/billing.js`, тесты provider-refund и Prodamus webhook, а также runbooks AUD-388 и Prodamus refunds.
- Исправлена терминологическая неоднозначность: migrations 072–073 и admin provider-refund actions относятся к GPTunnel generation/regeneration provider charges, а не к возвратам платежей клиентов через Prodamus. Prodamus refunds остаются ручным внешним процессом; соответствующие runbooks теперь прямо запрещают смешивать эти два контура.
- Проверен GitHub commit status для code commit `d7f018b11088c1729478ceb0d5512ab2d9e444f7`: Vercel = SUCCESS, deployment completed. Это подтверждает deploy конкретного code commit, но не заменяет backend CI, SQL integration, staging/E2E и live payment/Pinterest validation. Два Actions runs `43955465209` и `43955465181` по-прежнему завершились до первого шага (`runner_id=0`, `steps=[]`).
- Только документационные уточнения и status verification; production database, payment/refund operations и provider settings не затрагивались.


### Автономная контрольная точка перед продолжением (2026-11-17)

- Повторно проверены установленный приватный репозиторий, default branch `main`, последние commits и актуальные `docs/PROJECT_STATE.md` / `docs/USER_ACTIONS.md`. Последний commit на момент проверки: `4de5190e3a16b101ee19528110263bc354925744` (`docs: refresh documentation register after refund runbook review`). Предыдущие commits уточнили refund runbooks и CI harness; повторять эти задачи не требуется.
- Актуальный NEXT из раздела 7 не изменён: сначала выполнить UA-004 — локальный `scripts/verify-integration.ps1 -PostgresPort 55439` на отдельном PostgreSQL 18.6 после fast-forward sync чистого `main`. Затем, только после результата и подтверждённого cleanup, перейти к Bash concurrency suite и backend Node runtime suite.
- В текущей среде доступны GitHub API и изолированный Linux runtime, но нет доступа к пользовательскому Windows checkout `X:\!PROGECT\pinboard-ai`, PowerShell, локальному PostgreSQL-кластеру `X:\PinPosy-verify-pg18` или его скрытому паролю. Поэтому UA-004 нельзя выполнить удалённо безопасным способом. Не запускались SQL integration, Bash concurrency, backend/frontend runtime suites; PASS не присваивается. Production, PIN_TRIAL, PID 5632, временный кластер и внешние сервисы не затрагивались.
- Combined commit status для HEAD `4de5190...`: Vercel `failure`, target `build-rate-limit`; это rate-limit, не результат сборки. Деплой текущего HEAD не подтверждён.
- В этом контрольном пункте код и чекбоксы этапов не менялись: доказательств для закрытия gate нет. Единственное действие владельца остаётся UA-004 в `docs/USER_ACTIONS.md`; новых действий владельца не добавлено.


### Повторный запуск GitHub Actions для диагностики runner (2026-11-17)

- Перед действием повторно сверены main HEAD, раздел 7 паспорта, USER_ACTIONS и workflow `.github/workflows/atomic-payment-integration.yml`. NEXT остаётся UA-004: локальный SQL integration runner; его нельзя заменить hosted CI.
- Для диагностики инфраструктурного сбоя повторно запущены failed jobs в runs `43955465209` (Atomic payment fulfillment integration) и `43955465181` (Persisted boards integration checks). GitHub подтвердил принятие обоих rerun (attempt 2).
- Повторные jobs `133614855913`, `133614861296`, `133614861648` завершились failure; jobs API не предоставил steps (null), runner/log metadata отсутствуют. Получение job logs вернуло BlobNotFound для всех трёх jobs. Поэтому причина остаётся НЕ УСТАНОВЛЕНА; нельзя утверждать, что тесты запускались или что обнаружена ошибка приложения.
- Rerun не изменял исходный код, workflow, базы данных или внешние сервисы. Не было оснований менять код наугад. Hosted Actions blocker остаётся отдельным от локального SQL gate.
- Чекбоксы SQL/Bash/backend runtime этапов не закрыты. UA-004 остаётся следующим обязательным действием владельца; после его фактического результата продолжить строго по порядку.

### Автономная контрольная точка (2026-11-17, повторная сверка)

- Перед продолжением заново прочитаны GitHub `refs/heads/main`, `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, runner `scripts/verify-integration.ps1`, его contract test и PR #90. Текущий `main` HEAD: `7a789ff9458cdb690053b192ea32279494919131`; blob SHA паспорта до этой записи: `f0e168e46f0641999e19a34058f8308de8a2a45f`; blob SHA `USER_ACTIONS.md`: `f44e24604560ac752ce1ef905ff97bab26d09d0e`.
- Последний commit на `main` изменял только `docs/USER_ACTIONS.md`; код runner и contract test не изменился (SHA соответственно `ff7333518519fd20674e8bf9b20310112e6ce039` и `7000303d49b4dbe9c7c715ca0a28f387d7ae843a`). PR #90 остаётся open/Draft и не объединён.
- Раздел 7 не изменён: NEXT — локальный SQL integration runner (UA-004) на выделенном PostgreSQL 18.6, порт 55439. Владелец пока не прислал stdout/stderr/exit code; значит SQL integration suite не подтверждён, Bash concurrency и backend runtime suite не запускать.
- Уточнено состояние Vercel: commit `d7f018b11088c1729478ceb0d5512ab2d9e444f7` имеет Vercel status SUCCESS (deployment для этого code commit подтверждён). Combined status текущего docs-only HEAD `7a789ff...` показывает Vercel FAILURE с target URL `build-rate-limit`; это не отменяет подтверждённый deployment code commit и не является результатом build/test для текущего docs HEAD. Нельзя расширять вывод о deployment на более поздний код, если кодовый commit изменится.
- Доступа к пользовательскому Windows checkout, PowerShell, локальному кластеру `X:\PinPosy-verify-pg18` и его паролю нет. SQL runner не запускался; никакой PASS не присваивается. Production, PIN_TRIAL, существующий PostgreSQL/PID 5632, платежи, Pinterest и deployment settings не затрагивались.
- Никакие чекбоксы этапов не закрыты. В `docs/USER_ACTIONS.md` уже есть полная инструкция UA-004; новых действий владельца не требуется. Следующее действие после возвращения владельца — выполнить именно UA-004 и передать вывод без секретов.

### Повторная проверка deployment и тестового gate (2026-11-17)

- Перед записью повторно сверены `refs/heads/main`, `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, combined commit status и PR #90. HEAD `main`: `ceab3efcc6f5a13e6b739ffc64e9bc57108e7287`; blob SHA паспорта до записи: `c7bdbd33403e29e01434b3c72d800e3d27112e6a`; SHA `USER_ACTIONS.md`: `f44e24604560ac752ce1ef905ff97bab26d09d0e`.
- Для текущего HEAD `ceab3ef...` GitHub combined status содержит Vercel `success` с deployment URL `https://vercel.com/diana-f25e/pin-board-ai/FmNq1oRVXxuDLULbJMENSEaDsnjK`. Это подтверждает deployment именно этого HEAD; не подтверждает завершение SQL/Bash/backend runtime suites, staging/E2E или внешних payment/Pinterest сценариев.
- PR #90 остаётся open/Draft. Он не заменяет UA-004.
- Contract test `backend/test/postgres-integration-runner-contract.test.js` и runner `scripts/verify-integration.ps1` повторно прочитаны с GitHub; их SHA совпадают с ранее зафиксированными. Контракт зависит от локального checkout полного workflow и SQL manifest; изолированный запуск неполного набора файлов не выдавался бы за достоверный тест. В этой сессии contract test и PowerShell parser/runtime не запускались.
- NEXT без изменений: владелец выполняет UA-004 на Windows и отдельном PostgreSQL 18.6; до фактического SQL PASS и подтверждения cleanup не запускать девять Bash concurrency scripts и backend runtime suite. Никакие тестовые PASS не добавлены, чекбоксы не закрыты.
- Production, PIN_TRIAL, существующий PostgreSQL/PID 5632, локальный временный кластер, платежи, Pinterest credentials и deployment settings не изменялись.

### Автономная сверка перед продолжением (2026-11-17, HEAD 16ca177)

- Перед действиями повторно получены refs/heads/main, паспорт, USER_ACTIONS, SQL runner и contract test. HEAD до этой записи: `16ca177adde73feb591b50091ab7a1a1f7e67036`; SHA паспорта: `6a097c728f0ca7cb2f78e8c4c04f1ab2ac7326ef`; SHA USER_ACTIONS: `f44e24604560ac752ce1ef905ff97bab26d09d0e`.
- Раздел 7 подтверждает прежний NEXT: сначала локальный UA-004 (SQL integration runner на изолированном PostgreSQL 18.6, порт 55439), затем Bash concurrency suite и backend runtime suite. Никакого вывода UA-004 от владельца в репозитории/чате нет; тестовый gate остаётся открытым.
- SQL runner SHA `ff7333518519fd20674e8bf9b20310112e6ce039`, contract test SHA `7000303d49b4dbe9c7c715ca0a28f387d7ae843a`; оба совпадают с ранее проверенными версиями. В доступной среде нет PowerShell и PostgreSQL client, а Windows checkout и локальный временный кластер владельца недоступны. Не запускались PowerShell parser/runtime, SQL suite, Bash concurrency и backend runtime tests; PASS не заявляется.
- PR #90 остаётся open/Draft. Combined status для HEAD `16ca177...`: Vercel `failure`, target URL содержит `build-rate-limit`; сборка/deployment этого HEAD не подтверждены. Ранее подтверждённый Vercel SUCCESS для `ceab3ef...` относится только к тому commit и не переносится на новый HEAD.
- Никакие чекбоксы не закрыты. В `docs/USER_ACTIONS.md` уже содержится UA-004; новых действий владельца не добавлено. Production, PIN_TRIAL, существующий PostgreSQL/PID 5632, временный кластер, платежи, Pinterest и deployment settings не затрагивались.

### Повторная диагностика CI artifacts и обязательного локального gate (2026-11-17, HEAD b7e000b)

- Повторно сверены main, этот паспорт, docs/USER_ACTIONS.md, SQL runner и его contract test. HEAD до записи: b7e000b90d773847885a4a37d5c58e8b32a58bbe; passport SHA 6e8085ea6085fd96aba7bad89de438075599fade; USER_ACTIONS SHA f44e24604560ac752ce1ef905ff97bab26d09d0e. SQL runner и contract test не менялись: ff7333518519fd20674e8bf9b20310112e6ce039 и 7000303d49b4dbe9c7c715ca0a28f387d7ae843a.
- Дополнительно прочитаны GitHub Actions runs 43955465209 (atomic-payment) и 43955465181 (persisted-boards), attempt 2, commit d7f018b11088c1729478ceb0d5512ab2d9e444f7. GitHub вернул job records: postgres-atomicity (133614855913), frontend (133614861296), backend (133614861648), все conclusion=failure. Запросы job steps/logs для каждого вернули HTTP 404 BlobNotFound; поэтому фактическая причина failure и то, стартовали ли команды внутри jobs, по доступным артефактам не устанавливаются. Не классифицировать это как code failure или PASS.
- Combined status HEAD b7e000b90d773847885a4a37d5c58e8b32a58bbe: Vercel failure, target содержит build-rate-limit. PR #90 остаётся open/Draft. Ни CI artifacts, ни Vercel status не закрывают локальный SQL integration gate.
- NEXT не меняется: дождаться полного обезличенного stdout/stderr/exit code UA-004 от владельца; до SQL PASS и подтверждения cleanup не запускать Bash concurrency suite и backend runtime suite. В USER_ACTIONS уже есть точная инструкция; новых owner actions не добавлено.
- В этой сессии не запускались PowerShell/SQL/Bash/backend tests: отсутствуют доступ к Windows checkout/кластеру и нужные runtime binaries. Не изменялись код, migrations, workflow, production, PIN_TRIAL, существующий PostgreSQL/PID 5632, временный кластер, платежи, Pinterest credentials или deployment settings. Чекбоксы не закрывались.


### Автономная сверка следующего этапа (2026-11-17, HEAD c864a63)

- Перед продолжением повторно прочитаны refs/heads/main, раздел 7 и журнал этого паспорта, docs/USER_ACTIONS.md, scripts/verify-integration.ps1, backend/test/postgres-integration-runner-contract.test.js, combined status и PR #90. HEAD до этой записи: `c864a63f100dc296f1069da2648d2f6592d6f208`; blob SHA паспорта: `0eac7849171550faf080c12d34a5f19c7cf95ccd`; USER_ACTIONS SHA: `f44e24604560ac752ce1ef905ff97bab26d09d0e`.
- Раздел 7 остаётся обязательным порядком: UA-004 (локальный SQL integration runner на отдельном PostgreSQL 18.6, loopback port 55439) → после фактического SQL PASS и подтверждённого cleanup — 9 Bash concurrency tests → backend Node runtime suite. Нового обезличенного stdout/stderr/exit code UA-004 в текущем сообщении или доступных GitHub данных нет.
- Runner и contract test не изменились: SHA `ff7333518519fd20674e8bf9b20310112e6ce039` и `7000303d49b4dbe9c7c715ca0a28f387d7ae843a`. В этой среде нельзя подключиться к пользовательскому Windows checkout/кластеру `X:\PinPosy-verify-pg18` и безопасно ввести локальный пароль. Поэтому PowerShell parser/runtime и SQL suite не запускались; Bash concurrency и backend runtime намеренно не запускались до закрытия SQL gate. Contract test также не объявляется выполненным.
- Последние доступные Actions runs `43955465209` и `43955465181` относятся к code SHA `d7f018b11088c1729478ceb0d5512ab2d9e444f7`, attempt 2; их job logs ранее вернули BlobNotFound, фактическая причина неизвестна. Новых runs на текущий HEAD в списке нет. Combined status текущего HEAD: Vercel `failure`, target `build-rate-limit`; это ограничение deployment, а не результат сборки. PR #90 остаётся open/Draft.
- UA-004 уже подробно записан в `docs/USER_ACTIONS.md`; нового действия владельца сверх него не требуется. Чекбоксы не закрыты, NEXT не изменён. Production, PIN_TRIAL, существующий PostgreSQL/PID 5632, отдельный временный кластер, платежи, Pinterest credentials и deployment settings не затрагивались.


### Автономная сверка после документационной контрольной точки (2026-11-17, HEAD 2b47f64)

- Повторно проверены refs/heads/main, раздел 7, USER_ACTIONS, SQL runner/contract, GitHub Actions runs, PR #90 и combined commit status. HEAD до этой записи: `2b47f643730054bc02360dcae2b2ef51091a96c4`; blob SHA паспорта до записи: `500e874877919ea2e0aabbbfdc2cd885b89ad7ce`.
- NEXT остаётся UA-004: локально выполнить SQL integration runner на изолированном PostgreSQL 18.6 (127.0.0.1:55439). Нового полного обезличенного stdout/stderr/exit code от владельца нет. Поэтому SQL gate не закрыт; 9 Bash concurrency tests и backend runtime suite не запускались, чтобы не нарушать установленный порядок.
- Важное обновление статуса: combined status текущего HEAD `2b47f643730054bc02360dcae2b2ef51091a96c4` теперь показывает Vercel `success` с deployment URL `https://vercel.com/diana-f25e/pinboard-ai/EKjmWLJ1vxMPYQEHyGbSjxVo3m`. Это подтверждает успешный Vercel deployment для данного HEAD, но само по себе не подтверждает SQL/backend runtime, staging/E2E или реальные платежи/Pinterest. Ранее зафиксированный build-rate-limit относится к другому HEAD и не является текущим статусом.
- В доступном списке последних GitHub Actions runs новых workflow runs для текущего HEAD нет; старые failure runs относятся к предыдущим SHA и их logs недоступны, поэтому их нельзя интерпретировать как текущий runtime test result. PR #90 остаётся open/Draft; merge не выполнялся.
- UA-004 уже подробно описан в `docs/USER_ACTIONS.md`; новых действий владельца не добавлено. Код, миграции, workflows, production, PIN_TRIAL, PostgreSQL clusters, платежи, Pinterest credentials и deployment settings не менялись. Чекбоксы не закрывались; NEXT без изменений.


### Повторная проверка статусов после контрольной точки (2026-11-17, HEAD 470609b)

- Повторно сверены main, паспорт, UA-004, runner, contract test, workflow, список Actions runs и PR #90. SHA runner/contract/workflow без изменений; новых результатов от владельца по UA-004 нет.
- Combined status для HEAD `470609b53ed9566d216ee15fd9bcf407f66176d4` при этой проверке показывает Vercel `failure`, target `build-rate-limit` (upgrade to Pro). Это изменившийся/текущий status check; предыдущая запись о Vercel success относилась к моменту более ранней проверки того же HEAD. Статус check не является тестовым результатом. Нужна отдельная проверка Vercel deployment dashboard/лимита владельцем; тарифы и настройки не менялись.
- Последние видимые GitHub Actions runs всё ещё относятся к предыдущим SHA; для текущего HEAD новых проверочных runs нет. Старые job logs недоступны. PR #90 остаётся open/Draft.
- Gate и порядок не изменены: сначала UA-004 (локальный SQL runner, полный обезличенный вывод и подтверждение cleanup), затем отдельный Bash concurrency runner/tests, затем backend runtime suite. Ни один последующий этап не запускался. Production, PIN_TRIAL, базы, секреты, платежи и Pinterest не затрагивались.


### Автономная сверка следующего шага (2026-11-17, HEAD 6b64f8e)

- До проверки подтверждены refs/heads/main и SHA файлов: паспорт `fc19c0224e0a4532954643ac237cd6007fa1f870`; `docs/USER_ACTIONS.md` `f44e24604560ac752ce1ef905ff97bab26d09d0e`; SQL runner `ff7333518519fd20674e8bf9b20310112e6ce039`; contract test `7000303d49b4dbe9c7c715ca0a28f387d7ae843a`; workflow `a7960da87693304e46fb59c37e1b5b10705f8935`. Содержимое runner/contract/workflow не изменилось.
- Повторно прочитан раздел 7 и UA-004. Нового полного вывода локального SQL runner, exit code или подтверждения cleanup от владельца нет. Следовательно SQL upgrade integration gate остаётся НЕ ПРОЙДЕННЫМ/НЕ ЗАПУЩЕННЫМ в доступной нам сессии; 9 Bash concurrency tests и backend runtime suite не запускались. Порядок этапов не менялся.
- Combined status для текущего HEAD `6b64f8e1f68c8aedb61295bf1bba5ed2bb339778` показывает Vercel `failure` с target `build-rate-limit`. В последних 25 видимых Actions runs нет запуска для текущего HEAD; старые failures относятся к другим SHA, logs ранее возвращали BlobNotFound. PR #90 остаётся open/Draft.
- В этой среде нет доступа к пользовательскому Windows checkout, PowerShell, loopback PostgreSQL на 127.0.0.1:55439 или скрытому паролю; GitHub read-only fetch не позволяет исполнить локальный runner. Не запускались и не имитировались тесты. Не выполнялись повторные бесполезные retries старых Actions runs.
- UA-004 остаётся единственным текущим действием владельца и уже полностью описан в `docs/USER_ACTIONS.md`. Чекбоксы не закрывались. Код, CI, миграции, production/PIN_TRIAL, базы, secrets, платежи, Pinterest и настройки Vercel не менялись. После получения результата сначала проверю SQL suite + cleanup, затем подготовлю изолированный Bash runner и только после его PASS перейду к backend runtime suite.

### Автономная сверка 2026-11-17 — HEAD d45e16b

- Перед записью повторно проверены `refs/heads/main` и текущие файлы: HEAD `d45e16bcc7b270d7f0bfa4ada77342cb5a3de33a`; паспорт SHA `fce656974c0b41a6df3da459b6590b3f5bdea801`; `docs/USER_ACTIONS.md` SHA `f44e24604560ac752ce1ef905ff97bab26d09d0e`; `scripts/verify-integration.ps1` SHA `ff7333518519fd20674e8bf9b20310112e6ce039`; contract test SHA `7000303d49b4dbe9c7c715ca0a28f387d7ae843a`.
- Перечитан раздел 7 и полная инструкция UA-004. В текущем сообщении и доступных GitHub данных нет полного обезличенного stdout/stderr, exit code и подтверждения cleanup от владельца. Поэтому SQL upgrade integration gate остаётся незакрытым; 9 Bash concurrency tests и backend runtime suite не запускались. Очередность этапов сохранена.
- Combined status текущего HEAD: Vercel `failure`, target указывает на `build-rate-limit`. Последние видимые workflow runs `43955465209` и `43955465181` относятся к другому SHA `d7f018b11088c1729478ceb0d5512ab2d9e444f7`, а не к текущему main; их результат не используется как проверка текущего кода. PR #90 остаётся open/Draft.
- Повторно подтверждено ограничение среды: нет доступа к Windows checkout владельца, PowerShell, loopback PostgreSQL `127.0.0.1:55439` и локальному секрету. Тесты не запускались и PASS не заявляется. UA-004 уже подробно записан в `docs/USER_ACTIONS.md`; новых owner actions не добавлено.
- Это документационный checkpoint для устранения устаревшей привязки предыдущей записи к HEAD `6b64f8e`. Код, миграции, workflows, базы, production/PIN_TRIAL, секреты, платежи, Pinterest и deployment settings не менялись. Чекбоксы не закрывались; NEXT остаётся UA-004. Следующий этап — проверка фактического SQL runner PASS и cleanup, затем отдельные Bash concurrency tests, затем backend runtime suite.


### Owner-reported SQL runner parser failure and UTF-8 correction (2026-11-17)

- Владелец подтвердил clean checkout на `main`, fast-forward sync с `origin/main` до `e187ce33190e5ac085abf0d847924efe266a33c9` и запуск `scripts/verify-integration.ps1 -PostgresPort 55439`.
- PowerShell остановился на parsing: незакрытый `try` (reported line 65), отсутствие Catch/Finally и каскад ошибок около строки 103. Кириллический `Read-Host` prompt отображался mojibake (`Р...`). Runner не дошёл до подтверждённого создания disposable DB; миграции и 46 SQL tests не запускались. SQL gate остаётся BLOCKED / NOT RUN, не PASS и не SQL application failure.
- Сверка исходника из GitHub выявила UTF-8 текст без BOM в `scripts/verify-integration.ps1`. Для Windows PowerShell 5.1 это означает декодирование UTF-8 как системной ANSI code page; кириллические байты могут превратиться в punctuation и сломать строковую токенизацию. Это наиболее вероятная причина parser cascade; локальный Windows PS version/code page ещё не зафиксированы, поэтому окончательное подтверждение требует повторного parser check владельцем.
- Исправление: добавлен UTF-8 BOM без изменения исполняемой логики. Commit `db08fe681ad0727b5296e5f3ea686a6ca4a12378`; runner blob SHA `0119455a24c23645926565ab6ae78347b79bf374`. Contract test дополнен обязательной проверкой BOM: commit `a2f58b2aae9d3f79fdb753506a4ad55ae8337bfe`; test blob SHA `de8819ebb00d910dec774c789a1051126b7c560a`.
- Создан подробный audit trail: `docs/audits/2026-11-17-powershell-runner-utf8-bom-fix.md` (blob SHA `47456dc471aa2d11cc7289d232aae761fc92c0c7`). Он фиксирует входные данные, гипотезу root cause, точные изменения/commit IDs, границы безопасности, непроведённые проверки и следующий шаг.
- Проверки после исправления: исходник и contract assertion сверены через GitHub fetch; Node contract test и Windows PowerShell parser/runtime в среде ассистента НЕ запускались. PASS не заявляется. PostgreSQL, production, PIN_TRIAL, существующий PID 5632, временный кластер, платежи и Pinterest не затрагивались.
- NEXT: владелец уже обновил clean `main` и дважды получил `PASS: PowerShell parser`; следующий шаг — запустить guarded SQL integration runner командой из `docs/USER_ACTIONS.md` и прислать полный вывод + exit code + cleanup result без секретов. Bash concurrency и backend runtime остаются заблокированы до SQL PASS и подтверждённого cleanup.


### Owner-reported PowerShell parser PASS (2026-11-17)

- Владелец выполнил `git pull --ff-only origin main`: локальная ветка fast-forward обновлена с `e187ce33` до `28b50f44`; pull сообщил об изменении 6 файлов и создании audit report. Это подтверждает синхронизацию с исправлением UTF-8 BOM.
- Владелец дважды выполнил `[System.Management.Automation.Language.Parser]::ParseFile(...)` для `scripts/verify-integration.ps1`; оба раза результат `PASS: PowerShell parser`, ошибок парсера нет.
- Интерпретация: encoding/parser defect устранён на уровне синтаксического разбора в среде владельца. Parser check не исполняет скрипт: PostgreSQL preflight, создание disposable DB, migrations 010–148, две inline assertions, 46 SQL integration tests и cleanup пока НЕ подтверждены. SQL integration gate остаётся открытым.
- Действие ассистента: повторно сверены актуальные `main`, `PROJECT_STATE.md`, `USER_ACTIONS.md`, audit report, runner и documentation register; выявлены устаревшие формулировки о незапущенном parser check. Исправлены `PROJECT_STATE.md` (commit `7129075eb98933f8514d1fcb91f17451c703f032`, blob `0df4f394296364ad101ca624b08617b96ac96e7a`), `USER_ACTIONS.md` (commit `110ef0e462975e9a59cbf17a8eb3a5fb1eb9f228`, blob `37c291888f873c8aab29bf4191e633a3c2303897`) и audit report (commit `5140dbc77ec7800baa0e4e88fdf9633f62a256b0`, blob `1b42c8be8a7a52fe85216738d8e3f65603882c0c`). Реестр обновлён в commit `685b0bed1d6c0a63e427d08aefb79b0915b96f4a`, blob `25738892d6aaa5799188a6126b9f5933accc8fb5`. Смысл изменений: зафиксировать parser PASS отдельно, не подменять им SQL integration PASS, дать владельцу следующую безопасную команду.
- Следующий шаг владельца: только теперь запустить guarded `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1 -PostgresPort 55439`; пароль вводить только в скрытый локальный prompt. Передать полный вывод, exit code и cleanup confirmation без секретов. При отказе preflight остановиться и не обходить guard.
- Bash concurrency suite и backend runtime suite не запускать до SQL integration PASS и подтверждённого удаления disposable DB. Production, PIN_TRIAL, существующий PostgreSQL PID 5632 и временный кластер не затрагивать.


### Documentation journal — parser validation follow-up (2026-11-17)

- Before editing, assistant fetched current `main` versions of `PROJECT_STATE.md`, `USER_ACTIONS.md`, the UTF-8 BOM audit report, runner and `DOCUMENTATION_REGISTER.md`, and inspected recent commits.
- Updated the state passport to record the owner's two successful parser-only invocations and to keep SQL integration gate open: commit `7129075eb98933f8514d1fcb91f17451c703f032`, blob `0df4f394296364ad101ca624b08617b96ac96e7a`.
- Updated UA-004 with the exact next runner command, required output/exit code/cleanup evidence, hidden-password rule and stop conditions: commit `110ef0e462975e9a59cbf17a8eb3a5fb1eb9f228`, blob `37c291888f873c8aab29bf4191e633a3c2303897`.
- Extended the incident audit with the owner's parser evidence and explicit remaining unverified runtime/SQL gates: commit `5140dbc77ec7800baa0e4e88fdf9633f62a256b0`, blob `1b42c8be8a7a52fe85216738d8e3f65603882c0c`.
- Refreshed the documentation register with the updated document blob SHAs and source head: commit `685b0bed1d6c0a63e427d08aefb79b0915b96f4a`, blob `25738892d6aaa5799188a6126b9f5933accc8fb5`.
- Verification performed: GitHub fetch confirmed the exact updated text and returned blob SHAs; recent commit search confirmed the commits. No PowerShell runner execution, PostgreSQL connection, database creation, migrations, SQL tests, Bash tests or backend tests were performed by the assistant. No production or local cluster resources were touched.
- Next: owner runs UA-004 guarded SQL integration runner; assistant reviews full output, exit code and disposable DB cleanup before unlocking any later test stage.

- Follow-up correction after rereading section 7: updated stale wording so it no longer asks the owner to pull or repeat parser validation; it now points directly to the guarded runner. Commit `39a6837c80d5a94627957bb3099fc67734ee32cf`, blob `d1475b0a729e8eb1111016e2bfbdd72c32a145f`. Documentation register was refreshed in commit `7e9b765442b1f7dfaba2662cc16b64e9d67c3939`, blob `282680c894ac3f1647f68a56be5397e60f3532c1`.

- Последующая safety-корректировка UA-004: поскольку после подтверждённого владельцем pull ассистент добавил новые commits документации, перед runner обязательно требуется ещё один clean-tree check и fast-forward pull, иначе runner preflight справедливо остановится на отставшем локальном `main`. Инструкция обновлена в `docs/USER_ACTIONS.md`, commit `1973f0554e275e5cac689583345bd500a89ce988`, blob `a3c49bd536dc05b12905cbd7762ab1109d37257d`.

- Та же корректировка синхронизации отражена в incident audit: commit `077cff5bd2cd12c7c24ae1af315ed26ab1f1be45`, blob `d522abed5dc14ca5d34a2fd26568f30de74068c0`. Причина: assistant commits документации появились после owner pull, поэтому локальный checkout нужно обновить до runner preflight.

### Documentation journal — local sync prerequisite (2026-11-17)

- Updated `docs/USER_ACTIONS.md` to require a clean-tree check and another `git pull --ff-only origin main` before the runner, because the assistant's documentation commits were created after the owner's parser-check pull. Commit `1973f0554e275e5cac689583345bd500a89ce988`, blob `a3c49bd536dc05b12905cbd7762ab1109d37257d`.
- Updated this passport to make the new prerequisite explicit in NEXT. Commit `37522b3122e7e3675b2c9f58bb7bceb724f6e386`, blob `631a58470f3a92f631a09af8de3e2539ea754af2`.
- Updated the UTF-8 incident audit with the same required sync and stop conditions. Commit `077cff5bd2cd12c7c24ae1af315ed26ab1f1be45`, blob `d522abed5dc14ca5d34a2fd26568f30de74068c0`.
- Added this documentation sequence to the project journal (commit `a48580b95b2ec136a52ec5eb12302e5c628ec0ac`, blob `0e59315fe5e25d8f9874030b9eff3c23a817f837`) and refreshed the documentation register in commit `bddfc32ea45f76dedd0ce2254128336fc42c937c`, blob `c0c33782afa8dcfb3a52dd5a3fd10ab4912a4017`.
- GitHub fetch verified the updated instruction files. No runner/SQL execution was performed; next step remains the owner's clean sync followed by guarded UA-004 execution.


### Owner-reported SQL integration runner attempt — separate from successful migration replay (2026-11-17)

- Важно различать два этапа. **Migration replay уже успешно выполнен 2026-11-16** через `scripts/verify.ps1`: чистая disposable БД на PostgreSQL 18.6 (`127.0.0.1:55439`, data dir `X:/PinPosy-verify-pg18`, WIN1251, роль `pinposy_verify_admin`), `001_baseline.sql` + все 139 миграций `010–148`; результат `PASS PostgreSQL migration replay (001 + 010-148)`, `All configured checks passed`, `MIGRATION REPLAY PASSED`; disposable DB `pinposy_verify_196929316b56e` удалена. Это подтверждённый успешный migration-only этап, он остаётся PASS.
- Отдельный `scripts/verify-integration.ps1` предназначен для последующего SQL integration gate: на своей новой disposable DB он должен повторно подготовить схему, выполнить две inline assertions и 46 SQL integration test files, затем удалить свою DB. Первый запуск владельца 2026-11-17 остановился раньше этих действий: clean checkout был на `21226c6d`, runner обнаружил PID `15220` и `X:/PinPosy-verify-pg18`, затем identity query вернул `127.0.0.1/32`, несовместимый с ожидаемым `127.0.0.1`.
- Следствие: первый integration-runner attempt не создавал собственную disposable DB и не запускал повторный migration replay, inline assertions или 46 SQL tests. Это НЕ отменяет и НЕ опровергает предыдущий успешный migration replay через `scripts/verify.ps1`. SQL integration gate остаётся NOT RUN.
- Исправление identity normalization: `scripts/verify-integration.ps1` теперь использует `host(inet_server_addr())`; commit `a0de3046d924abcedb267076d03e365e6b9b0353`, blob `05787d0f8067d3412ed10e06856e7b1cdfce1c6d`. Добавлен Node contract assertion в `backend/test/postgres-integration-runner-contract.test.js`; commit `4495b4b4dd52b3f82f43859d640bbab571a3466e`, blob `ce331fba2e06bb63473cfedf1c586003606b09c4`.
- После этого исправления Node contract test, PowerShell parser и integration runner ещё не запускались. Следующее действие владельца описано в `docs/USER_ACTIONS.md`: clean status, fast-forward pull, parser-only PASS, затем guarded runner. Не путать migration replay PASS с ещё не пройденным SQL integration suite.


### Canonical local PostgreSQL migration replay procedure — owner transcript (2026-11-16, supplied 2026-11-17)

This section records the exact owner-provided PowerShell procedure. Treat it as authoritative historical evidence for the successful migration-only replay; do not conflate it with `scripts/verify-integration.ps1` or the 46-file SQL integration suite.

**Environment and preflight**

- Run from `X:\!PROGECT\pinboard-ai` in Windows PowerShell with `$ErrorActionPreference = 'Stop'`.
- PostgreSQL binaries: `X:\Program Files\PostgreSQL\18\bin`; temporarily prepend this directory to the current process `PATH`, preserving the old value for restoration.
- Preserve the prior process values/presence of `PGUSER`, `PGCLIENTENCODING`, and `PGPASSWORD`; set only for this PowerShell session: `PGUSER=pinposy_verify_admin`, `PGCLIENTENCODING=UTF8`.
- Assert current branch is `main`, working tree is clean, and historical checked-out HEAD is exactly `ebb1040ac73e600dfdbfc57d8aa765f9713441a2`.
- Assert migration 140 file hash is `484e589c32940ad9df8ef67de71c43b27fddf76c` and `scripts/verify.ps1` hash is `6614843edaafd4924c90c679a0f9fe232e59a0f0`.
- Assert selected `psql.exe` is exactly under PostgreSQL 18 bin directory.
- Inspect TCP listeners on port 55439 and require exactly one listener bound to `127.0.0.1`; stop on any mismatch.
- Prompt for `pinposy_verify_admin` password with `Read-Host -AsSecureString`; reject empty input. Convert to process-scoped `PGPASSWORD` only for the command, zero the temporary BSTR in a finally block, never print or transmit the password.
- Query server identity using `psql -h 127.0.0.1 -p 55439 -U pinposy_verify_admin -d postgres` and verify exact prefix: address `127.0.0.1`, port `55439`, data directory `X:/PinPosy-verify-pg18`, server encoding `WIN1251`, client encoding `UTF8`, PostgreSQL `18.6`.

**Actual migration-only execution**

- Invoke a child Windows PowerShell process with `-NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1 -MigrationsOnly -PostgresPort 55439`.
- Capture `$LASTEXITCODE`; throw on nonzero. Only print `MIGRATION REPLAY PASSED` on exit code zero.
- The verified runner created disposable database `pinposy_verify_196929316b56e`, applied Supabase test stubs, canonical baseline `db/migrations/001_baseline.sql`, and every numbered migration from `010` through `148` (139 migrations).
- The runner then terminated any backend connected to that disposable database and successfully executed `DROP DATABASE`. The transcript shows `DROP DATABASE`, `PASS PostgreSQL migration replay (001 + 010-148)`, `All configured checks passed.`, and final `MIGRATION REPLAY PASSED`.
- In the outer `finally`, restore the original `PGPASSWORD`, `PGUSER`, `PGCLIENTENCODING` presence/values and original `PATH`; print that temporary environment variables were restored.

**Evidence interpretation / guardrails**

- This owner-supplied transcript proves the migration-only replay completed successfully and disposable database cleanup succeeded. Keep this result as PASS; never rewrite it as “migrations were not run”.
- It does not prove the separate `scripts/verify-integration.ps1` run completed, nor that its two inline assertions or 46 SQL integration test files ran. Those belong to a separate gate and must be marked independently.
- Historical HEAD and hashes above identify the exact checkout used for this replay; do not require the current moving `main` HEAD to equal that historical commit when interpreting this evidence.
- Never stop/reinitialize the PostgreSQL cluster `X:\PinPosy-verify-pg18`, never touch production or PIN_TRIAL, never bypass any preflight, and never request or store the password in chat.
- The long console output displayed Cyrillic PostgreSQL NOTICE text as mojibake, but the command continued through all migrations, cleanup and the explicit success summary. Do not infer failure from those display artifacts alone.


### Documentation journal — canonical migration replay transcript captured (2026-11-17)

- Owner supplied the full PowerShell transcript proving the successful 2026-11-16 migration-only replay. Added the exact preflight, process-scoped PostgreSQL environment setup, secure password handling, identity checks, child-process invocation, migration range, disposable DB cleanup and evidence interpretation to this passport. Commit `6853ce1cdcd8c6e6d59af4b63252f083161f182d`, blob `53db3fe142b62c8decf659c7929bbc64c5512e52`.
- Updated `docs/USER_ACTIONS.md` so future work does not ask the owner to repeat the already successful migration replay and explicitly separates its PASS from the pending 46-file SQL integration gate. Commit `6734d4da17ca83da0fda04b055112259f3b6fd31`, blob `97bb9c6ec0b6826cdb3aaf19101102a9b6866f82`.
- Added the same authoritative procedure and interpretation to `docs/audits/2026-11-17-powershell-runner-utf8-bom-fix.md`. Commit `db9b8d4902cc048c61c185b6d789d7399f0d01ee`, blob `fe62125932eb1e725930e731a478483347df9d52`.
- Refreshed documentation register blob SHAs and appended the distinction between migration replay PASS and SQL integration NOT RUN. Register commit `19c03025aa3eb7cb33ab5d4f8439132bfa12dd93`, blob `aa6209bdd91a464a6efdecd7ec84d619a7e4880f`.
- Evidence basis: owner-provided complete terminal transcript. No PostgreSQL process, local file, database, migration, or test was run by the assistant in this documentation update. No secrets were copied into repository documentation.


### SQL integration runner — migration 018 constraint collision (owner transcript, 2026-11-17)

- Owner pulled clean `main` forward from `21226c6d` to `33fdee6f3da62495ed3137ebf06cb04b91c3ffcb`. The PowerShell Parser API check returned `PASS: PowerShell parser`.
- `scripts/verify-integration.ps1 -PostgresPort 55439` passed repository guard, verified listener PID `15220`, data directory `X:\PinPosy-verify-pg18`, and exact server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Runner created disposable DB `pinposy_sqlint_389e6a26525c4ee8`, applied `backend/test/postgres-integration-upgrade-fixture.sql`, and began the 139-migration sequence `010–148`. It stopped at `db/migrations/018_preferred_language.sql` with PostgreSQL error that constraint `users_preferred_language_check` on table `users` already exists.
- The runner's `finally` successfully terminated connections, executed `DROP DATABASE`, verified absence, and printed `Removed disposable database pinposy_sqlint_389e6a26525c4ee8.` The temporary DB is therefore confirmed cleaned up by the owner transcript. No evidence says the persistent PostgreSQL cluster was stopped or reinitialized; leave PID `15220` and data directory untouched.
- Since failure occurred in migration application before the two inline assertions and the 46-file manifest loop, those checks were not run. SQL integration gate remains **FAIL/BLOCKED at migration 018**, not PASS. The earlier independent migration-only replay (`001_baseline.sql` + `010–148`) remains PASS and is not invalidated by this distinct upgrade-fixture path.
- Static source review on current `main`: the upgrade fixture creates `public.users` without the named constraint; migrations `010–017` inspected do not define it; migration `018` adds the column, drops the named constraint if present, then adds it. The observed duplicate therefore is not yet explained by the reviewed fixture and migration sources. Do not guess at the cause or weaken the constraint. Next diagnostic must establish the exact constraint state immediately before migration 018 and capture the full, untruncated `psql` error/line context; then correct the smallest proven source and add a regression check.
- Owner also confirmed parser PASS after the identity normalization change. The Node contract test was not shown as executed. No claim is made that it passed.
- Evidence: owner-provided terminal transcript plus current-main source inspection. Assistant did not run PostgreSQL or any local tests. No secrets were recorded.


### Read-only diagnostic instrumentation for migration 018 (2026-11-17)

- After reviewing the owner transcript and current fixture/migrations 010–018, added progress output for each numbered migration in `scripts/verify-integration.ps1` and a read-only `pg_constraint` query immediately before migration 018. It reports schema, table, constraint name/type and `pg_get_constraintdef`, without changing database state. Existing target guards, migration SQL, failure behavior and cleanup are unchanged. Script commit `2c75a0d5639bfa43629a83d03fcd8d760c78368d`, current blob `4ad7496780efdbdd1996d29dbd5dd31e3f361676`.
- Added a Node source-contract assertion requiring the migration progress and pre-018 diagnostic. Commit `883c065b97e52010ba99fa3a79d3420e73d56e92`, current blob `9dc83eae945470b653907881f09732077837b169`.
- Verification limitation: neither the Node contract test nor the updated PowerShell parser/runner has been executed after these changes. Do not mark them PASS. The next owner run must capture the diagnostic output and full error context; only then choose a fix. The previously confirmed disposable DB was removed; no PostgreSQL process/database was accessed by the assistant.


### Owner diagnostic retest — no matching catalog row before migration 018 (2026-11-17)

- Owner ran updated runner at commit `2ced41640849cca5d46d16b200f801327e6ca160`. Identity guard passed; migrations 010–017 completed; pre-018 diagnostic header printed but no matching constraint rows were returned. Migration 018 then failed with PostgreSQL message that `users_preferred_language_check` already exists. The disposable database `pinposy_sqlint_1a99cf2946b14838` was successfully dropped and its removal confirmed. SQL inline assertions and 46 tests were not reached.
- This is an unresolved discrepancy: the prior diagnostic filtered only by constraint name and returned no rows, yet the migration reports a duplicate constraint. No schema change should be guessed.
- Expanded diagnostic committed to runner `eb95ccf5126ec833e5f7f55092bef82c173cd48b` (blob `1fe066227a40d1dfef1df55a63babfec9d56403f`): it always prints the database name, every constraint on `public.users`, any matching named constraint in any schema/table, and any same-named relation in the database. The migration invocation now asks psql for verbose server errors/context and echoes errors. A source-contract test was added at commit `5837793afd56968e1f5695177c79361640cea204` (blob `c7b449c128154d7f0cc87170d6cabab5f0e9c87e`).
- These latest changes have not yet been executed by the owner. Do not claim parser, contract-test or integration-runner PASS for them. Next owner run must capture all `DATABASE|`, `USER_CONSTRAINT|`, `NAMED_CONSTRAINT|`, `NAMED_RELATION|` lines and verbose SQLSTATE/context. Preserve all guards and cleanup.


### Documentation journal — owner retest exposed catalog diagnostic type error (2026-11-17)

- Owner updated local clean `main` from `2ced4164` to `d48fdde95765a5b254e92bc05388af7f32661e8d`; PowerShell Parser API returned PASS.
- Guarded integration runner verified repository state, PostgreSQL PID `15220`, data directory `X:/PinPosy-verify-pg18`, and exact identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`. It created disposable DB `pinposy_sqlint_f6ff758b193649be`, applied the upgrade fixture and migrations 010–017.
- The pre-018 diagnostic SQL failed before returning rows: PostgreSQL reported `operator does not exist: text || "char"`. The catalog fields `pg_constraint.contype` and `pg_class.relkind` require explicit text casts. Migration 018 itself was not invoked in this attempt; therefore this run neither reproduces nor resolves the original duplicate-constraint failure.
- Owner transcript confirms cleanup of the disposable DB: backend termination, `DROP DATABASE`, absence check and explicit removal message. No evidence of persistent cluster shutdown/reinitialization. Two inline assertions and 46 SQL tests were not reached.
- Assistant inspected the current runner and changed only the diagnostic concatenations to `c.contype::text` and `cl.relkind::text`; added a Node contract assertion for both casts. No PostgreSQL or local test was run by the assistant. Changes are not yet runtime-verified. The original migration-018 issue remains unresolved.
- Detailed incident and rationale: `docs/audits/2026-11-17-powershell-runner-utf8-bom-fix.md`, section 9. Follow-up commits/blob SHAs are recorded in the register after all updates complete.



### Documentation journal — owner contract retest found stale expected log text (2026-11-17)

- Owner pulled `main` from `d48fdde9` to `844514ab`; worktree was clean before pull.
- Owner ran `node --test .\backend\test\postgres-integration-runner-contract.test.js`: 10 tests total, 9 passed, 1 failed. The sole failure was the source-contract assertion still expecting the former log line `Diagnostic: matching constraints immediately before migration 018`; current runner prints `Diagnostic: database and public.users constraints immediately before migration 018:`. The other 9 checks passed, including both `contype::text` and `relkind::text` assertions.
- Owner ran the PowerShell Parser API check after the Node test; parser returned PASS.
- No PostgreSQL integration runner was executed in this owner transcript. No disposable database, migration, inline assertion or SQL test was run in this retest. The earlier SQL integration run's diagnostic query error and cleanup remain separately recorded above.
- Assistant inspected the live runner, contract test and all project tracking documents on GitHub `main`; changed only the stale contract-test expected string. Commit `a4472b204bf6c66f02c0adb8c9d1db79579c47ea`, test blob `902a0d700a1b145d7e48ad5f0cc856c5bd6f99a1`.
- The corrected contract test has not yet been executed. Current status: parser PASS from owner; contract test last observed 9/10 due stale assertion; integration gate BLOCKED / not rerun after the diagnostic fix. Next: owner pulls latest main, reruns the Node contract test and parser; only after both pass, rerun guarded PostgreSQL integration runner and capture diagnostic rows.


### Documentation journal — owner contract suite passes after stale assertion correction (2026-11-17)

- Owner transcript: local clean checkout fast-forwarded from `844514ab` to `7f0084ca` using `git pull --ff-only origin main`; pull changed five tracked files (contract test and four documentation files), 49 insertions and one deletion.
- Owner ran `node --test .\backend\test\postgres-integration-runner-contract.test.js`: **10 tests, 10 passed, 0 failed**. The previously stale migration-018 diagnostic-heading assertion now passes. The passing checks include fixture parity, both inline assertion parity checks, the exact 46-file SQL manifest, UTF-8 BOM, loopback identity normalization, target safety guards, pre-018 diagnostic wording, catalog text casts, verbose diagnostics and contiguous migrations 010–148.
- This is a Node source-contract test result only. The owner has not yet supplied a new PowerShell Parser API result for this revision, and did not invoke `scripts/verify-integration.ps1` in this transcript. No disposable DB was created; no fixture, migration, inline assertion or SQL integration test was run in this turn.
- The prior PowerShell Parser API PASS belongs to the earlier revision and is retained as historical evidence; it must not be silently attributed to the newly pulled revision.
- Assistant fetched current source and documentation from GitHub `main` before recording this update. Current runner blob remains `74c128b4c6933b8b5aba888e4abeb01200df2ab6`; current contract test blob is `902a0d700a1b145d7e48ad5f0cc856c5bd6f99a1`.
- No source code was changed by the assistant in this turn. Documentation-only updates are being made to preserve the exact owner transcript, purpose, scope and next gate. No local machine, PostgreSQL cluster, database, production/PIN_TRIAL or secret was accessed.
- Next: owner runs the PowerShell Parser API check on this pulled revision. If it passes, run the guarded integration runner exactly as documented and provide the complete output. The SQL integration gate remains NOT PASSED until the fixture, 139 migrations, two inline assertions, all 46 SQL tests and disposable DB cleanup are confirmed.


### Documentation journal — owner PowerShell Parser check passes on synchronized main (2026-11-17)

- Owner supplied the complete PowerShell transcript for parsing `scripts/verify-integration.ps1` via `[System.Management.Automation.Language.Parser]::ParseFile(...)`. The script completed and printed **`PASS: PowerShell parser`**; the conditional error branch did not execute.
- This confirms PowerShell syntax parsing only. It does not execute the runner, establish PostgreSQL target identity, create a disposable database, apply migrations, run inline assertions or execute the 46 SQL integration tests.
- The immediately preceding owner transcript on the same development sequence recorded the Node contract suite as 10/10 PASS after pulling `7f0084ca`. Current source was fetched from GitHub `main` before updating this journal: runner blob `74c128b4c6933b8b5aba888e4abeb01200df2ab6`; contract test blob `902a0d700a1b145d7e48ad5f0cc856c5bd6f99a1`.
- Assistant actions this turn: fetched the current runner, contract test and all four tracking documents from GitHub `main`; reviewed the source identities and existing chronology; appended the owner-provided parser result and exact verification boundary to the project journal. No source code, local files, PostgreSQL processes/databases, production/PIN_TRIAL or secrets were changed or accessed.
- Next: the owner may invoke the guarded integration runner on the synchronized clean `main`. Preserve its complete output, especially repository/server identity guards, diagnostic records before migration 018, migration/test progress, and disposable-database cleanup. SQL integration remains NOT PASSED until the fixture, 139 migrations, two inline assertions, all 46 SQL tests and cleanup are confirmed.


### Documentation journal — integration runner blocked by PowerShell execution policy (2026-11-17)

- Owner attempted `.\scripts\verify-integration.ps1` from `X:\!PROGECT\pinboard-ai`. PowerShell returned `PSSecurityException / UnauthorizedAccess`: script execution is disabled on this system; the error points to `about_Execution_Policies`.
- Failure occurred at PowerShell script-loading policy enforcement, before the script body could execute. Therefore no runner safety guard, password prompt, PostgreSQL connection, identity check, disposable database creation, migration, inline assertion, SQL test or cleanup was reached by this attempt. No claim about PostgreSQL health or runner runtime correctness can be drawn from this output.
- Assistant fetched current `main` versions of the runner, contract test and all four tracking documents before diagnosing. Runner blob remains `74c128b4c6933b8b5aba888e4abeb01200df2ab6`; contract test blob remains `902a0d700a1b145d7e48ad5f0cc856c5bd6f99a1`.
- Source inspection confirmed the runner is parameterized for port 55439, uses fixed expected loopback/data-directory/encoding/role/PostgreSQL-version identity checks, prompts for the temporary role password with hidden `Read-Host -AsSecureString`, creates a uniquely named disposable database, and has a `finally` cleanup path that drops it and verifies absence. Do not provide the password in chat or put it on a command line.
- Safe next invocation: start a child Windows PowerShell process with a process-only execution-policy override: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`. This does not persistently change LocalMachine or CurrentUser policy; the runner's own target-identity and database safety guards remain enabled. Enter the temporary role password only at the script's hidden prompt. If organizational Group Policy still blocks the process, stop and report the exact message; do not modify machine policy or disable other controls.
- Assistant actions this turn: interpreted the owner transcript; fetched six current repository files from GitHub `main`; inspected runner safeguards, password handling and cleanup flow; concluded the script did not start; and documented the incident, scope and process-scoped next step. No source code, local machine, PostgreSQL process/database, production/PIN_TRIAL or secret was touched by the assistant.
- SQL integration gate remains NOT PASSED. Prior Node contract suite (10/10) and PowerShell Parser syntax check (PASS) remain valid, but neither executes the integration runner.


### Documentation journal — runner stopped by stale local main (2026-11-17)

- Owner supplied two consecutive launch attempts. First, direct `.\scripts\verify-integration.ps1` again failed at script loading with `PSSecurityException / UnauthorizedAccess` because the system execution policy disables script execution. Second, the process-scoped invocation `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1` successfully launched the runner.
- The runner fetched GitHub `origin/main`; Git reported `7f0084ca..b8d04ffc main -> origin/main`. It then stopped with the exact guard: `Safety stop: local main (7f0084ca8ff0681b56c214c3f7020f9d029c2ef5) is not synchronized with origin/main (b8d04ffc9636fb7f4bc506aaf06f9bd6c86241cc)`.
- Source-order inspection of current runner blob `74c128b4c6933b8b5aba888e4abeb01200df2ab6`: after validating branch, it fetches origin/main, checks the worktree is clean, compares `HEAD` with `origin/main`, and only later prompts for the password (line 103) and creates a disposable database (line 143). Therefore this run stopped before password entry, PostgreSQL connection, disposable DB creation, fixture, migrations, inline assertions, SQL tests or cleanup. This is a deliberate stale-checkout guard, not a database/test failure.
- Assistant actions: fetched the current runner and four tracking documents from GitHub `main`; inspected the exact guard ordering and current source blob; matched the owner-provided commit IDs to the guard; appended the owner transcript, interpretation, scope and next step to the project journal, owner action log and audit; then updated the documentation register and re-fetched all updated documents to verify their blob SHAs. No local checkout, source code, PostgreSQL process/database, production/PIN_TRIAL or secret was changed or accessed by the assistant.
- Next owner action: in `X:\!PROGECT\pinboard-ai`, run `git status --short`; if clean, run `git pull --ff-only origin main`. Do not use reset, force, checkout overwrite or discard local changes. If pull refuses or worktree is not clean, stop and provide the output. After a successful fast-forward, verify `git rev-parse HEAD` equals `git rev-parse origin/main` and rerun the guarded process-scoped command. The runner will repeat all safety checks. SQL integration remains NOT PASSED.


### Documentation journal — owner fast-forward synchronization confirmed (2026-11-17)

- Owner supplied the complete local PowerShell transcript. `git status --short` produced no output, establishing a clean worktree before pull. `git pull --ff-only origin main` completed successfully and fast-forwarded local `main` from `7f0084ca` through `b8d04ffc` to `95b7aa3c`; Git reported four documentation files changed, 220 insertions, no source-code changes.
- Owner then ran `git rev-parse HEAD` and `git rev-parse origin/main`. Both returned exactly `95b7aa3cadfdb0b5d213ec65d2d61cf47ffcf990`. Local `main` and fetched remote-tracking `origin/main` are therefore synchronized at the time of this transcript.
- Assistant actions: fetched the current runner, its Node contract test and all four tracking documents from GitHub `main`; verified runner blob `74c128b4c6933b8b5aba888e4abeb01200df2ab6` and contract-test blob `902a0d700a1b145d7e48ad5f0cc856c5bd6f99a1`; inspected the current runner's guard and execution order; appended the owner transcript, purpose, exact hashes and next step to the project state, owner action log and audit; updated the documentation register; then re-fetched the updated files to verify their exact blob SHAs. No local machine command, source edit, PostgreSQL process/database operation, production/PIN_TRIAL access or secret handling was performed by the assistant.
- This resolves the previous stale-checkout guard. It does not mean the integration runner has passed: the owner has not yet supplied a successful rerun after synchronization. No evidence indicates that the previous blocked attempt reached the secure password prompt or created a disposable database.
- Next owner action: run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1` from the clean synchronized checkout. Enter the temporary role password only in the hidden prompt. Preserve and send the complete output, including migration/test progress and final cleanup confirmation. SQL integration remains NOT PASSED until all expected stages complete.


### Documentation journal — second synchronization stop caused by assistant documentation commit (2026-11-17)

- Owner ran the guarded process-scoped command after the previous local sync. The runner fetched `origin/main`, reporting `95b7aa3c..a98f8821 main -> origin/main`, then stopped because local HEAD was `95b7aa3cadfdb0b5d213ec65d2d61cf47ffcf990` while `origin/main` was `a98f8821f345677271add7d53a3cbe94840f2f0d`.
- Assistant takes responsibility for the avoidable sequencing error: immediately before this owner run, the assistant had committed documentation updates to `main` at `a98f8821` and then incorrectly instructed the owner to run the integration script without first pulling that new commit locally. The strict synchronization guard therefore correctly rejected the stale local checkout. The owner followed the assistant's previous instruction; this is not an owner error.
- Runner source blob remains `74c128b4c6933b8b5aba888e4abeb01200df2ab6`. Its source order checks HEAD against origin/main at lines 59–61, before secure password prompt at line 103 and disposable DB creation at line 143. Thus no password prompt, PostgreSQL connection, disposable DB, fixture, migration, assertion, SQL test or cleanup occurred in this run.
- Assistant actions: fetched current runner and all four tracking docs from GitHub main; verified the exact guard order and hashes; compared the owner transcript's commit IDs with the previous assistant-created documentation commit; identified the instruction sequencing mistake; and recorded the failure plus corrective procedure in the chronological docs and register. No local checkout, PostgreSQL process/database, production/PIN_TRIAL or secret was accessed or changed.
- Corrected procedure: because this assistant documentation update itself creates a new commit on main, the owner must synchronize once more after this update. Run `git status --short`; only if empty, run `git pull --ff-only origin main`; verify `git rev-parse HEAD` equals `git rev-parse origin/main`; then, without any intervening assistant documentation commit, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`. Future assistant documentation commits after the test output will again require a pull before any subsequent runner invocation. Never reset/force/discard local work.
- SQL integration remains NOT PASSED. The previous 10/10 Node contract and PowerShell Parser PASS are source-level checks, not runtime integration evidence.


### Integration attempt at 13166c8c — migration 018 failure with confirmed cleanup (2026-11-17)

- Owner synchronized clean local main to `13166c8cd476a13a787e9584f5b914430f702cc1`; `git rev-parse HEAD` and `git rev-parse origin/main` matched exactly. Owner then ran `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`.
- Runner confirmed clean synchronized main, approved PostgreSQL listener PID 15220 and data directory `X:\PinPosy-verify-pg18`; secure password was entered at the hidden prompt. Server identity verified exactly as `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Disposable database `pinposy_sqlint_318fd598c73448c5` was created. CI upgrade fixture completed. Migrations 010–017 completed. Migration 018 did not complete; the runner's pre-018 diagnostic listed only the six expected constraints on `public.users` (NOT NULL constraints and primary key), and no row named `users_preferred_language_check` was printed by its named-constraint / named-relation diagnostic branches.
- Owner output includes a garbled PowerShell/psql diagnostic beginning at `018_preferred_language.sql:2`, with SQLSTATE `00000` and text translating to NOTICE that constraint `users_preferred_language_check` on table `users` does not exist and is being skipped. The pasted output does not expose a reliable subsequent server ERROR / SQLSTATE. Do not mislabel this NOTICE itself as the root error. Exact root cause remains unresolved pending an ungarbled complete psql diagnostic.
- Runner finally terminated sessions for the disposable database, executed `DROP DATABASE`, and printed `Removed disposable database pinposy_sqlint_318fd598c73448c5`. Cleanup is confirmed. No inline assertions or 46 SQL tests ran. SQL integration remains NOT PASSED.
- Assistant investigation (read-only GitHub retrieval): fetched current runner, migration 018, upgrade fixture, baseline migration and SQL manifest. Runner blob `74c128b4c6933b8b5aba888e4abeb01200df2ab6`; migration 018 blob `4f524034d8504c3111e376fb91b30e65a8b86884`; fixture blob `49a817c5e238eda201b8821a9c052585f36e0217`; manifest blob `aa773d020841f6925b4f63f4a6d96fb95cf4e3a6`; baseline blob `105a13cfba4746206191dcf2bd68d5514912f08c`.
- Source inspection confirms migration 018 statements: add `preferred_language` column if absent; drop named check constraint if present; add the check constraint; create its index if absent. Fixture creates a fresh `public.users` without that column/constraint. Current runner diagnostic checks direct users constraints, any constraint with the target name, and any pg_class relation with the target name; the output showed no target-named row. This evidence is insufficient to conclude why psql returned nonzero. Do not change migration or fixture speculatively.
- Assistant did not connect to PostgreSQL, run local commands, modify source, access production/PIN_TRIAL, or handle credentials. No test beyond the owner's described runner output is claimed.
- Next diagnostic step: preserve full ungarbled psql error and SQLSTATE for the failing statement, plus catalog checks after fixture/migrations 010–017 and immediately before/after each statement in migration 018 (especially column presence, constraints across inheritance/partition descendants, indexes/relations, triggers, and role/session identity). Use only a newly generated disposable DB via the guarded runner. Keep all production and persistent verification data untouched.


### Diagnostic fix — PowerShell native stderr handling and UTF-8 (2026-11-17)

**Investigation and reasoning**
- Re-read current `scripts/verify-integration.ps1` and its contract test after the owner's migration-018 run. Global runner setting is `$ErrorActionPreference = 'Stop'`. Existing `Invoke-Psql` directly invoked native `psql.exe` with `2>&1`, then intended to read `$LASTEXITCODE`. The owner's last failure text surfaced a PostgreSQL NOTICE (SQLSTATE 00000) as a PowerShell terminating failure and did not include the runner's own `psql failed (exit N)` wrapper. This strongly indicates Windows PowerShell 5.1 promoted native stderr output to a terminating PowerShell error before the exit-code check. The output was also mojibake although `PGCLIENTENCODING=UTF8`, consistent with native output being decoded using a non-UTF-8 console encoding.
- Root cause is a high-confidence diagnosis of the runner's stderr handling, not a proven migration-018 SQL defect. The next guarded run must determine whether migration 018 itself raises a genuine PostgreSQL ERROR after NOTICE handling is corrected.

**Source changes**
- Updated `scripts/verify-integration.ps1`: inside `Invoke-Psql`, save current `$ErrorActionPreference` and `[Console]::OutputEncoding`; temporarily set preference to `Continue` and console output encoding to UTF-8 without BOM; invoke `psql.exe` with merged stdout/stderr; immediately capture `$LASTEXITCODE`; restore both settings in `finally`; then render all captured output and apply the existing nonzero-exit failure check. This prevents a normal psql NOTICE from aborting before native exit-code handling and should preserve Cyrillic diagnostics. Scope is limited to the native invocation; script safety guards, connection identity, password handling, disposable DB naming and cleanup logic are unchanged.
- Runner blob `d1137519b254f31a8d669405d355956b1fb23ddf`, commit `b5b43c86213209e1cacefd8807fce188439dc11d`.
- Added two Node contract tests to `backend/test/postgres-integration-runner-contract.test.js`: (1) stderr is merged/captured, exit code is read, and both settings are restored in finally; (2) UTF-8 decoding is scoped to the psql invocation. Contract test blob `088c23d854c9be56320b2728f1e4cbe6b107f8a5`, commit `e24511b5219315928baefb3563ef959c16cc86ec`. The file now contains 12 test cases by source inspection.

**Verification status**
- Assistant re-fetched both changed source files from GitHub main and confirmed the expected scoped setting, UTF-8 encoding, restoration statements and both new test cases; exact blob SHAs above.
- No Node test suite, PowerShell parser, PowerShell runtime or PostgreSQL integration run was executed by the assistant. Do not mark these tests PASS based on source inspection alone.
- Previous owner's SQL integration attempt did not complete: fixture and migrations 010–017 passed, migration 018 run was interrupted on stderr NOTICE, and disposable DB `pinposy_sqlint_318fd598c73448c5` was confirmed dropped. No inline assertions or 46 SQL tests ran.
- Next owner verification: sync clean local main to origin/main after all assistant documentation commits; run `node --test backend/test/postgres-integration-runner-contract.test.js`; run PowerShell Parser API check if available; then launch the guarded integration runner. Enter password only at hidden prompt. Send full output. If migration 018 now fails with a real server ERROR, capture exact UTF-8 message, SQLSTATE, file/line and context before changing migration SQL. Never touch production/PIN_TRIAL, PID 15220 or persistent verification data.


### SQL integration run — migrations and assertions passed; first Pinterest reconciliation test failed (2026-11-17)

- Owner pulled local main from `13166c8c` to `c047f44c`; worktree was clean before pull and `HEAD` = `origin/main` = `c047f44cce666e6dbe844cf318a4b314dd60040c`.
- Owner Node contract suite: **12/12 PASS** (0 failed). PowerShell Parser API: **PASS**. These checks validate source contracts and script syntax only.
- Owner ran the guarded runner with process-scoped execution-policy bypass. It verified the clean synchronized checkout, approved temporary PostgreSQL listener PID 15220, data directory `X:\PinPosy-verify-pg18`, and server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`. Password was entered only at the hidden prompt.
- Disposable DB: `pinposy_sqlint_b39373fd69614fe7`. CI upgrade fixture passed; all 139 migrations 010–148 passed; both CI inline assertions passed.
- SQL test 1/46, `backend/test/pinterest-unknown-schedule-reconciliation.integration.sql`, failed at line 110 with PostgreSQL exception `schedule remote pin identity conflict incorrectly promoted schedule`; psql exit code 3. Tests 2–46 were not run.
- Cleanup confirmed: runner terminated sessions, executed DROP DATABASE, and printed `Removed disposable database pinposy_sqlint_b39373fd69614fe7`. No production/PIN_TRIAL or persistent verification DB was touched.
- Assistant retrieved test blob `20f04be636298e0cdb33ce1725cd2558e4121e9e`, migrations 091 `6da23cf6851e28e8fbecbf4d7a3831008ab9c86b`, 092 `acca458a7c4abb236ea056e18c46c0628355ceb4`, 093 `03d126ad051bd192d32a64d06ac0f5b9e007e895`, and 148 `5bdad254de1d4bb19d68bd9618561da55216f9b8`.
- Static discrepancy: test deliberately records schedule remote ID `remote-already-recorded` while both attempt and publication ledger agree on `remote-confirmed-123`. It expects the schedule to remain unknown and unchanged. Migration 093's source appears to guard this case with `(s.pinterest_pin_id is null or s.pinterest_pin_id=a.pinterest_pin_id)`, and migration 148 does not redefine the reconciliation functions. Yet the runtime database promoted the schedule. Root cause is **unresolved**; do not change migration logic or weaken the test speculatively.
- Detailed transcript, source hashes, analysis and next diagnostic are in `docs/audits/2026-11-17-pinterest-unknown-schedule-reconciliation-test-failure.md`.
- Next: add failure-only diagnostics to the test to expose returned row count, resulting schedule status/remote ID and effective runtime function source via `pg_get_functiondef`; inspect the effective `claim_due_pin_schedules(integer)` definition and later migration overrides. Re-run only with the guarded disposable runner. SQL integration remains **NOT PASSED**.
- Assistant actions: interpreted the owner transcript; fetched tracking docs, test and selected migrations from GitHub; compared the conflicting-ID assertion with migration 093 and migration 148; created the audit report and updated the chronology/register. No local command, database operation, application source change, production access or secret handling by assistant.


### 2026-11-17 — добавлена runtime-диагностика Pinterest reconciliation test

- После owner-транскрипта с `12/12` Node contract tests, PowerShell Parser PASS, успешными fixture + 139 migrations + 2 inline assertions и ошибкой SQL test 1/46 assistant повторно прочитал failing test (blob до изменения `20f04be636298e0cdb33ce1725cd2558e4121e9e`) и migration 093 (blob `03d126ad051bd192d32a64d06ac0f5b9e007e895`).
- Статический код migration 093 содержит предикат `(s.pinterest_pin_id is null or s.pinterest_pin_id=a.pinterest_pin_id)`, который должен отсекать конфликт `remote-already-recorded` vs `remote-confirmed-123`. Точная причина runtime расхождения пока не установлена; migration logic не менялась.
- В `backend/test/pinterest-unknown-schedule-reconciliation.integration.sql` добавлена failure-only диагностика: фактические `status`, `pinterest_pin_id`, row count и `pg_get_functiondef()` активной функции `reconcile_confirmed_pinterest_schedule_successes()`. Ожидания теста не ослаблены. Новый blob `95d01cccc1e8ec722b5c101e9a7939cda1b393c0`, commit `aa1eb96daaf4b2d3148f596372850e43b5052b7a`.
- Изменение опубликовано через GitHub Contents API. Assistant не запускал Node/PowerShell/psql/PostgreSQL; диагностический SQL ещё НЕ выполнен. Следующий шаг — owner sync main, затем guarded disposable runner, чтобы получить точное runtime function body и post-call state. SQL integration остаётся NOT PASSED.


### 2026-11-17 — SQL integration reached test 3/46; upgrade fixture missing baseline is_admin

- Owner's clean local checkout fast-forwarded from `c047f44c` to `5d3548a58eb7e53469cf43893f189403a2c2088b`; local `HEAD` and `origin/main` matched.
- Guarded runner verified the approved temporary PostgreSQL target (listener PID 15220, data directory `X:\PinPosy-verify-pg18`) and server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`. It created disposable DB `pinposy_sqlint_1b70f80297f04d60`.
- CI upgrade fixture and all 140 migrations `010–149` passed; both inline assertions passed; SQL tests 1/46 and 2/46 passed.
- Test 3/46, `pinterest-schedule-cancellation-race.integration.sql:93`, failed because `public.users.is_admin` did not exist. The test inserts `(email, tariff_plan, token_version, is_admin)`.
- Assistant compared canonical baseline migration 001 (which defines `is_admin boolean default false`) with both CI and standalone upgrade fixtures (both omitted the column), and confirmed the failing test's use of the baseline field. Root cause: incomplete test fixture, not a missing production migration. No production migration was added.
- Source updates: workflow fixture commit `763f91a0e58a505df9823f37479a08a08856f388`, blob `b1e054a50fc7a8ad3c742a2fecc94a41e0d5bf9c`; standalone fixture commit `698bcb4b07df2b636a4378679dbbc1de55f69ac2`, blob `3cc57549972b13d2d83bd2ec58330eae1d8c527f`; Node contract assertion commit `7a9a53f9bae5fdce29d4941295e17ce8b802985a`, blob `ff9fdd0b166093cbb78c6dd9426cb3d98fcbb239`.
- New incident audit `docs/audits/2026-11-17-postgres-integration-fixture-is-admin-missing.md`, created in commit `918f0bbf97d51514f1ed74b5785c4bbebdfc7210`.
- Runner confirmed disposable DB cleanup: `Removed disposable database pinposy_sqlint_1b70f80297f04d60`. Tests 4–46 were not run. SQL integration remains NOT PASSED.
- Assistant actions: fetched current GitHub source, compared baseline/fixture/workflow/test, made the narrowly scoped workflow/fixture/contract edits, created the incident audit, updated the canonical project state, owner action log and documentation register, and performed a source-level workflow/fixture equality check. Assistant did not run local tests, PowerShell, psql or PostgreSQL and did not touch production/PIN_TRIAL, listener PID 15220 or persistent verification data.
- Next owner action after documentation is complete: sync clean local main to origin/main, run `node --test backend/test/postgres-integration-runner-contract.test.js`; if it passes, rerun the guarded integration runner. Require all 46 SQL tests and confirmed cleanup before PASS.


- Follow-up source review found and corrected an over-escaped regex in the newly added Node contract assertion. Corrected contract test commit `89d5fd4baf14f790141fe1cb244a6f282d68e004`, blob `54c0ba51ce8a3ac2e5a6b677be6a3b6950a1448c`. Re-fetched workflow, fixture and contract test; source-level normalization confirmed the workflow fixture and standalone fixture match exactly, both include `is_admin boolean default false`, and the new assertion is present. Contract source contains 13 test declarations. This is source inspection only; Node tests remain unexecuted.


### 2026-11-17 — SQL integration reached test 3/46; text/UUID predicate fixed

- Owner synchronized clean local `main` to `5617a53095249ce45aafe4bdad17ad39781b668e`; local HEAD and origin/main matched.
- Owner Node contract suite: **13/13 PASS**.
- Guarded PostgreSQL runner verified approved temporary target PID 15220 / `X:\PinPosy-verify-pg18`, hidden password prompt and exact server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Disposable DB `pinposy_sqlint_004e2422a382484b`: fixture PASS; all 140 migrations 010–149 PASS; both inline assertions PASS; SQL tests 1/46 and 2/46 PASS; test 3/46 failed at line 93 with `operator does not exist: text = uuid`. Tests 4–46 did not run. Runner confirmed cleanup and printed `Removed disposable database pinposy_sqlint_004e2422a382484b`. SQL integration NOT PASSED.
- Source diagnosis: migration 015 declares `pin_schedules.user_id text`; the cancellation-race SQL test declared `v_user_id uuid` and compared these different types in two UPDATE predicates. This is a test predicate defect, not a production migration defect.
- Corrected both predicates to compare `user_id=v_user_id::text`. SQL test blob `adb8b7669052021ce2537b5a2985786bab13a4d7`, commit `c0db3c5e5f4cc2ead97443693b78bdd79622be53`.
- Added a Node contract assertion for both explicit casts and absence of the uncast predicate. Contract test blob `ba228cbaef5ea83ff7d9c22221b3921f8087f4dd`, commit `de1d765e53e30e0617ec7994f1e22bdeaff4e025`.
- Created audit `docs/audits/2026-11-17-postgres-integration-schedule-user-id-type-mismatch.md` (commit `0c3b54e62b269f9e47e0be37b7de8a8abea0d2fa`) with the owner transcript summary, source evidence, root cause, exact changes, safety and verification limits.
- Assistant did GitHub source inspection/updates only; did not execute Node, PowerShell, psql or PostgreSQL. The new contract assertion and SQL correction remain runtime-unverified. Next: after all documentation commits, owner fast-forward pulls, confirms clean synchronized main, runs Node contract suite, then guarded integration runner. Do not declare SQL integration PASS until all 46 tests and cleanup are confirmed.

- Follow-up count: `backend/test/postgres-integration-runner-contract.test.js` now has 14 top-level test declarations by source inspection (13 previous + new schedule user-ID cast guard); assistant did not execute this updated suite.


### 2026-11-17 — SQL integration test 6/46: durable account-deletion FK blocked test cleanup

- Owner sync: clean worktree; fast-forwarded `5617a530..8ebae45e`; `HEAD` = `origin/main` = `8ebae45ed1dd141b8ca08a0104c8127041ea2a62`.
- Owner Node contract suite: **14/14 PASS**.
- Guarded runner verified the synchronized checkout, PID 15220 / `X:\PinPosy-verify-pg18`, hidden password prompt and server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Disposable DB `pinposy_sqlint_88f6d6f8b1654c23`: fixture PASS; all 140 migrations 010–149 PASS; both inline CI assertions PASS; SQL tests 1–5/46 PASS.
- Test 6/46 `account-deletion-reauth-version.integration.sql:65` failed with SQLSTATE 23503: DELETE from `account_deletion_requests` violated RESTRICT FK `account_deletion_jobs_request_id_fkey`. Tests 7–46 did not run. Overall SQL integration remains **NOT PASSED**.
- Cleanup confirmed: runner terminated sessions (0 remaining), executed DROP DATABASE and printed `Removed disposable database pinposy_sqlint_88f6d6f8b1654c23`.
- Source investigation: migration 130's `request_account_deletion` inserts a durable job and append-only event for each new request. Both reference the request with RESTRICT; event DELETE is also blocked by its immutable trigger. Therefore explicit request deletion is not a valid test cleanup strategy. Existing `account-deletion-durable-queue.integration.sql` uses BEGIN/ROLLBACK isolation.
- Fixed only the test: added BEGIN before its DO block and ROLLBACK after; removed manual DELETEs. SQL test blob `90486cf3499f54f36a4bda50f88f326f52e5bf0a`, commit `61e508df37ed1a3ff6c0c6c57622dfa65b6c1b26`.
- Added a Node contract assertion for transaction rollback and absence of destructive cleanup DELETEs. Final contract blob `4681aa4ab8155a0c5c8b649e35bfdd3085fd8d2f`, latest correction commit `ace9c270f8ad789a0135cdbe4c0b1bceac768e4e` (initial draft blob `3801da4c55a12aa7668eb940f3ab1cbd753bab2c`, commit `2860d0df79c2eb0d7bef7a727171a45b79202402`; intermediate correction blob `cdd4f2ccdb5590e381964460f1180a4f7a747dd3`, commit `ec7f410a80f5ea4fec27781c3280b15aceac4618`).
- Created audit `docs/audits/2026-11-17-postgres-integration-reauth-test-fk-cleanup.md`, commit `44d405bdc13f5a08c9dc8797796cdf98767c6c66`.
- Assistant source-inspected and edited GitHub files only; did not execute Node, PowerShell, psql or PostgreSQL. The new SQL isolation and contract assertion are runtime-unverified. After documentation commits, owner must pull, run the contract suite, then guarded integration runner. Do not declare PASS before all 46 tests and cleanup succeed.
- Current contract suite contains 15 top-level tests by source inspection (14 previous + new rollback guard); this is not an execution result.

- Follow-up source review: assistant noticed over-escaped regular-expression assertions in the initial contract-test draft before owner execution; replaced them with literal `indexOf`/`includes` checks and re-fetched the final source. Final contract blob `4681aa4ab8155a0c5c8b649e35bfdd3085fd8d2f`. This is source inspection only; Node suite remains unexecuted after this change.


### 2026-11-17 owner integration run — durable queue test expects outdated preflight error

- Owner synchronized local checkout to `01a7fd7f8ab60bfc6e380cef01352b6d6ae2f038`; `HEAD` = `origin/main`. Worktree was clean before pull.
- Owner Node runner contract suite: **15/15 PASS**.
- Guarded PostgreSQL runner verified approved listener PID 15220, data directory `X:\PinPosy-verify-pg18`, hidden password prompt and server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Disposable DB: `pinposy_sqlint_ab121efa0ee94999`. CI fixture, all **140 migrations 010–149**, and both inline CI assertions passed. SQL tests 1–6/46 passed; test 7/46 `account-deletion-durable-queue.integration.sql` failed with `account deletion Storage manifest is required`; tests 8–46 did not run.
- Cleanup confirmed: 0 sessions remained; runner dropped the disposable DB and printed `Removed disposable database pinposy_sqlint_ab121efa0ee94999`. SQL integration remains **NOT PASSED**.
- Root cause: migration 144's current `finish_account_deletion_job` checks `storage_manifest_recorded_at` before changing job status. The test's first attempt to mark preflight successful occurs before inventory and Storage-manifest recording, so the function correctly raises `account deletion Storage manifest is required`. The test expected the older migration-131 inventory-trigger error, which cannot fire first because migration 137's manifest marker itself requires a recorded inventory. No production defect established.
- Changed only the durable queue SQL test expectation/comment: blob `733295e89326d675be7c3e7c4a7dcd71c1dc1022`, commit `24889b82c1b9221fed49716dad25a3a6d02f75e8`.
- Added a Node source-contract guard for the expected Storage-manifest message and its ordering in migration 144: blob `c5dcbf017955d1c125f91ec75c2e4df13a036b4e`, commit `684acac9a226e6a3a442c076a1806ad10fd6b788`. Contract suite now has 16 test declarations by source inspection; the new version has NOT been executed.
- Added incident audit `docs/audits/2026-11-17-postgres-integration-durable-queue-storage-manifest-guard.md`, blob `8cd8fbbb9db25e40e8d1a6fc8eb623083099e006`, commit `12debb3f105f70bf881dc437053623546cde8167`.
- Assistant source reads: durable queue test pre-fix blob `6e85b453df8395529043097db7ce5ea978d5b048`; migration 131 `45aaad97035c7dca0b6a13f8831a78844f20651f`; migration 137 `dab57a684b6a105f7d0d40b0796e61b498c0365b`; migration 144 `f196a9ea2565b0759c5fa324977878cffdd12183`; migration 147 `1c3b6205f5ba22ba868f379bb6f0c7a98dfc2d33`.
- Assistant did not execute Node, PowerShell, psql or PostgreSQL. Next owner gate: pull after all documentation commits, verify synchronized clean main, run Node contract tests (16 expected), then guarded SQL runner only if all pass. Full SQL integration remains NOT PASSED until all 46 SQL tests and cleanup pass.


### 2026-11-17 — SQL integration test 8/46: upgrade fixture omitted boards.cover_url

- Owner synchronized checkout at `546492915c1861b834098a1dace2e5c585e847d9`; `HEAD` = `origin/main`; worktree was clean before pull.
- Owner Node contract suite: **16/16 PASS** (this validates the pre-fix source at commit `546492915...`).
- Guarded runner verified listener PID 15220, data directory `X:\PinPosy-verify-pg18`, hidden password prompt and server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Disposable DB `pinposy_sqlint_452f781659d544cd`: fixture PASS; all 140 migrations 010–149 PASS; both inline assertions PASS; SQL tests 1–7/46 PASS; test 8/46 `account-deletion-storage-manifest.integration.sql:380` failed because `boards.cover_url` was absent. Tests 9–46 did not run. Cleanup confirmed: 0 sessions, DROP DATABASE, explicit `Removed disposable database pinposy_sqlint_452f781659d544cd`. SQL integration remains **NOT PASSED**.
- Source diagnosis: canonical baseline blob `105a13cfba4746206191dcf2bd68d5514912f08c` defines `public.boards.cover_url text`; both CI workflow fixture (pre-fix blob `b1e054a50fc7a8ad3c742a2fecc94a41e0d5bf9c`) and standalone fixture (pre-fix blob `3cc57549972b13d2d83bd2ec58330eae1d8c527f`) omitted it. Migration 141 blob `5726de6afb213dc1757d22bea19f7862efca7579` reads `b.cover_url` in the Storage manifest function; PL/pgSQL function creation succeeded, but the test exposed the missing column when exercising the function.
- Fixed both fixtures only: CI workflow blob `959399fc34989298ac060bd42a605312d7c86073`, commit `5b91890019f8a2758686946fcf85ce9de9f2eb5e`; standalone fixture blob `e57795b598e16939952f180ac36bc942336d0444`, commit `1783ba84a3d30454445c909459dfc559510128bb`. Production migrations untouched.
- Added contract assertion against both standalone fixture and canonical baseline. First draft's regex was over-escaped; assistant caught this during source review and corrected it to split at the literal SQL table terminator `);` before owner execution. Final contract blob `fe2a1ce4cfb0ca7e06ff0c2b4d087d40943db66a`, commit `91d787eb945d2065a89a98e38ac51679f2461ed4`. Contract file now has 17 top-level tests by source inspection; not yet executed.
- Created audit `docs/audits/2026-11-17-postgres-integration-storage-manifest-board-cover-fixture.md`, commit `6d2230a98fab683d67e1cecd54cb966e68f02223`.
- Assistant actions: inspected the exact owner transcript; fetched baseline, fixtures, workflow, failing SQL test and migration 141; compared table definitions and manifest function use; updated the two fixture definitions and contract test; reviewed and corrected the assertion; created the incident audit; then updated this project journal, owner action log and documentation register. Assistant did not run Node, PowerShell, psql or PostgreSQL.
- Next owner gate after all documentation commits: clean fast-forward pull; verify HEAD = origin/main; run the 17-test Node contract suite; only on PASS run the guarded integration runner. Do not mark SQL integration PASS until all 46 tests and cleanup succeed. Preserve PID 15220 and `X:\PinPosy-verify-pg18`; never touch production/PIN_TRIAL or expose credentials.


### 2026-11-17 owner integration run — test 8/46 exposes missing cascade behavior in upgrade fixture

- Owner synchronized clean local checkout to `758eba5efdceb4f76c99b9d0077301e7c3fe58d8`; `HEAD` = `origin/main`.
- Node contract suite: **16 passed, 1 failed (17 total)**. Failure was the new `boards.cover_url` assertion: fixture contains `cover_url   text`, but regex required a single space. This is an assertion-formatting defect, not a missing column.
- Owner ran the guarded runner despite the Node contract failure. Runner verified PID 15220 / `X:\PinPosy-verify-pg18`, hidden password prompt and server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Disposable DB `pinposy_sqlint_a28d8185bc44448f`: fixture PASS; all **140 migrations 010–149** PASS; both inline assertions PASS; SQL tests 1–7/46 PASS. Test 8/46 `account-deletion-storage-manifest.integration.sql` failed when migration 137's `erase_account_deletion_content` deleted the user's project and FK `boards_project_id_fkey` rejected deletion because a board still referenced it. Tests 9–46 did not run.
- Cleanup confirmed: 0 sessions remained, runner executed DROP DATABASE and printed `Removed disposable database pinposy_sqlint_a28d8185bc44448f`. SQL integration remains **NOT PASSED**.
- Source diagnosis: migration 137 deletes owned projects after its other operational rows and relies on FK cascades to remove dependent boards and pins. Canonical baseline blob `105a13cfba4746206191dcf2bd68d5514912f08c` specifies `boards.project_id ... ON DELETE CASCADE` and `pins.board_id ... ON DELETE CASCADE`. Both CI and standalone upgrade fixtures omitted those cascade clauses. The test fixture, not the production deletion function/FK, was inconsistent with baseline.
- Corrected standalone fixture with both cascades: blob `bf9aad94a6b4381777586a97a88f3dc6eab373a6`, commit `b22ed9e255fe799fd3be91caf36b5c71f03a1387`.
- Corrected CI workflow fixture with the same cascades: blob `ad8d456eed5829c7aba0c8b9bfea314516b3e9d4`, commit `0724225a5ad324ba2eb9107ddaf202745d8761a4`.
- Added a contract test for both cascade FKs: blob `cb9af9c67b1b1bbbc2073279a9fc7e3d0aa2491d`, commit `07e5a4a87350ba80f49adb4f3ba8bc1fbbf9c4cc`.
- Corrected the cover_url assertion to allow multiple SQL whitespace characters: final contract blob `9e03e2448dca977c25114185ecd12bd46408e5e7`, commit `edadd964bcd82246051f4934298038e76e909fb2`. Contract source now contains **18** top-level tests by source inspection, not execution.
- Created audit `docs/audits/2026-11-17-postgres-integration-storage-manifest-project-board-cascade-fixture.md`, latest audit update commit `9775d4df9ba1990ef305fc92677cd4d0eb43acd7`.
- Assistant actions: inspected owner transcript; fetched migration 137, canonical baseline, both fixture sources, failing SQL test, contract test and documentation; compared FK definitions and deletion order; edited only test fixtures and contract tests; created this audit; updated the chronological project state, owner action log and register. Assistant did not run Node, PowerShell, psql or PostgreSQL. No production migration or live DB was changed.
- Next owner gate after all docs commits: clean fast-forward pull; verify HEAD = origin/main; run all **18** Node contract tests; only if all pass, run guarded SQL runner. Do not mark SQL integration PASS until all 46 tests and disposable cleanup succeed. Preserve PID 15220 and `X:\PinPosy-verify-pg18`; never touch production/PIN_TRIAL or expose credentials.


### 2026-11-17 — STOP and system review: SQL integration fixture contract is incomplete

- Владелец остановил разработку и запросил анализ общей логики, качества процесса и обязательной полноты документации.
- Owner checkout synchronized at `c92cb6d402686abbca583ecb8871e7b2f9c1fc8f`; `HEAD` = `origin/main`.
- Node contract suite: **17 PASS / 1 FAIL из 18**. Падает cascade assertion в `backend/test/postgres-integration-runner-contract.test.js`: regex содержит двойное экранирование перед `s` и ищет literal backslash+s, а не whitespace.
- Owner ran guarded SQL runner despite failed contract gate. Runner applied fixture, 140 migrations 010–149 and two inline assertions; SQL tests 1–7/46 PASS; test 8/46 failed because `users.subscription_tier` does not exist when `finalize_account_deletion(uuid,uuid)` executes.
- Disposable DB `pinposy_sqlint_bb8532df036144f0` cleanup confirmed: 0 sessions, DROP DATABASE and explicit removed message. Tests 9–46 not run. SQL integration remains **NOT PASSED**.
- Source review: canonical baseline `001_baseline.sql` (blob `105a13cfba4746206191dcf2bd68d5514912f08c`) defines `users.subscription_tier`, `name`, `surname`, `onboarded`; standalone fixture blob `bf9aad94a6b4381777586a97a88f3dc6eab373a6` and CI workflow blob `ad8d456eed5829c7aba0c8b9bfea314516b3e9d4` omit all four. Migration 138 blob `c99463878dd828f0e7722f27777ffdb3c6e90b23` updates all four fields during finalization. PostgreSQL reported the first missing field, `subscription_tier`; the other three are also absent from the fixture and used by the same UPDATE.
- This is the fourth repeated fixture mismatch family after `is_admin`, `boards.cover_url`, and missing cascade FKs. The current reactive one-error-at-a-time approach is inefficient; next work should first inventory the complete schema contract for critical SQL integration paths and distinguish intentional legacy omissions from accidental omissions.
- Scope of this STOP review: GitHub source/documentation reads only. No application source, migration, fixture, CI, SQL test or database was changed. Assistant did not execute Node, PowerShell, psql or PostgreSQL.
- Detailed analysis, evidence SHAs, owner transcript, process deviations, recommendations and safety limits: `docs/audits/2026-11-17-postgres-integration-stop-and-review.md`.
- **Current status: PAUSED pending owner review.** Do not run the SQL integration runner while the Node contract suite is failing. Do not make further source-code changes until the schema-contract review plan is agreed. Preserve PID 15220 and `X:\PinPosy-verify-pg18`; never touch production/PIN_TRIAL or expose credentials.


### 2026-11-17 — schema-contract сверка upgrade fixture и timestamp types

- Владелец возобновил автономную разработку и повторил требование работать по этому паспорту, фиксировать каждое действие и записывать необходимые действия владельца. Предыдущая запись STOP остаётся историческим результатом; дальнейшая работа продолжена в рамках указанного там обязательного schema-contract review, без запуска runtime gate до его прохождения.
- Перед исправлениями повторно сверены main, последние commits, паспорт, USER_ACTIONS, документационный реестр, SQL test manifest, canonical baseline, migrations 055/127/138, account-deletion test 8, standalone fixture, CI inline fixture и Node contract test.
- Уже существовавший на момент возобновления commit `bd0d973d459996885224e1940a4a74a369eb578e` расширил fixture до baseline columns десяти таблиц (кроме намеренно отсутствующего `users.token_version`, добавляемого migration 055), добавил assertions и синхронизировал CI fixture. Этот commit до настоящей записи отсутствовал в журнале; его результаты учтены, но runtime не предполагались.
- Статическое сравнение выявило два дополнительных расхождения типов: `auth_tokens.created_at` (baseline `timestamptz`, fixture `timestamp without time zone`) и `credit_transactions.created_at` (baseline `timestamp without time zone`, fixture `timestamptz`). Исправлять production migrations оснований нет.
- Синхронно исправлены standalone fixture и CI inline fixture; добавлена assertion для `auth_tokens.created_at`. Commits: fixture `dd518aed667e5a7657617e4c40cbdcd9e0e04b77`, workflow `a09dfea5051c563b5bad3509adf928ff21463720`, contract test `3bee9ba503e7709bee51e7826988750be2ece04e`. Итоговые blobs: fixture `0d1236b722193fb18e4bbd2d0bd258c018d4cd77`, workflow `b8bee6bba38d25afdaaa015f8027c4aefd722346`, contract test `daceb31d99230b409c487cc39d10dc3ee1ef7102`.
- Создан подробный отчёт `docs/audits/2026-11-17-postgres-upgrade-fixture-timestamp-contract.md` (blob `49ade0bd52aa74de4b49f4835c7973b81e40650b`, commit `98ccaa252937c043c83694c680359c9554803b6e`).
- В ходе этой работы в main также добавлена assertion для migration 023 (commit `565e8775d5af05f486f8cc1ac75f15edba74aa35`); итоговый contract blob `daceb31d99230b409c487cc39d10dc3ee1ef7102`.
- Source-level verification после повторного fetch: оба timestamp типа соответствуют baseline; assertion присутствует; standalone fixture и CI heredoc совпадают после нормализации; contract file содержит 21 test declaration. Это статические проверки исходников, не запуск Node.
- **Runtime status:** Node contract suite, PowerShell parser/runtime, PostgreSQL replay, 46 SQL integration tests, Bash concurrency и backend/frontend runtime tests ассистентом не запускались. SQL integration остаётся **NOT PASSED**. Combined Vercel SUCCESS наблюдался только для предыдущего commit `bd0d973...`; он не подтверждает deploy/build новых commits.
- Production migrations, application code, production/PIN_TRIAL, Supabase, платежи, Pinterest, DNS и пользовательский PostgreSQL cluster не менялись. Секреты не запрашивались и не читались.
- Чекбоксы runtime этапов не закрывались. Следующий gate — владелец синхронизирует clean main и запускает Node contract suite (21 тест); только при полном PASS разрешён guarded PostgreSQL runner. Подробное задание и стоп-условия записаны в `docs/USER_ACTIONS.md` (UA-005).


### 2026-11-17 — итоговая сверка документации и текущего CI статуса

- После фиксации schema-contract отчёта обновлены `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md` (UA-005) и `docs/DOCUMENTATION_REGISTER.md`; register commit на момент этой записи: `0422ead84ee6f93ff22508dd0a71d03571479534`.
- Повторный fetch подтвердил актуальные blobs: fixture `0d1236b722193fb18e4bbd2d0bd258c018d4cd77`, CI workflow `b8bee6bba38d25afdaaa015f8027c4aefd722346`, contract test `3242ba970ab898fb14971cbabab7fe6293b2af95`, PROJECT_STATE `72f95b790693103ee86341bf8c40f2d191c7eb9a`, USER_ACTIONS `c2141b0bd6e852ae32d0aeb2b304555dfea75512`, DOCUMENTATION_REGISTER `601f520a68effcc7dd338a29e6930a4f65278436`.
- Статические проверки повторно PASS: standalone fixture = CI heredoc после нормализации; оба timestamp types соответствуют baseline; assertion для auth_tokens присутствует; 21 contract test declaration обнаружен; отчёт есть в PROJECT_STATE и DOCUMENTATION_REGISTER; UA-005 есть в USER_ACTIONS.
- Последний main commit на момент проверки: `0422ead84ee6f93ff22508dd0a71d03571479534`. Combined status этого commit: Vercel FAILURE с target `build-rate-limit`. Это quota/rate-limit indicator, не доказательство ошибки кода и не успешная сборка/деплой. Vercel SUCCESS, наблюдавшийся на более раннем commit `bd0d973...`, не переносится на текущий HEAD.
- Доступный commit-workflow endpoint вернул пустой список PR-triggered workflow runs для исходного code commit; он не является полным списком push-triggered runs. Node, PowerShell, PostgreSQL, Bash, backend/frontend runtime suites не выполнялись. SQL integration остаётся **NOT PASSED**.
- Следующее действие владельца — UA-005. До получения фактического Node PASS SQL runner не запускать. Ни один runtime checkbox не закрыт.

### 2026-11-17 — уточнение schema-contract evidence, token_version chronology и runtime gate

- Владелец явно разрешил возобновить работу после исторической записи PAUSED. Работа продолжена в рамках schema-contract review; production/DB операции не выполнялись.
- Получены и source-scanned все 140 active migrations 010–149 и все 46 SQL files из ordered manifest. Targeted scan отсутствовавших baseline columns установил точную хронологию: `token_version` впервые добавляется migration 023 (`56887896f8650d56d727e59c3c37388e73f7c37`) и повторно нормализуется migration 055; `account_status` добавляется migration 127. Остальные пропущенные baseline columns не добавляются migrations 010–149.
- Исправлена неточность предыдущего schema audit: `token_version` не впервые появляется в 055; это делает migration 023. Contract test обновлён отдельным commit `565e8775d5af05f486f8cc1ac75f15edba74aa35`, blob `daceb31d99230b409c487cc39d10dc3ee1ef7102`. Текущий source contract содержит 20 top-level test declarations, не 21.
- Все 46 SQL test sources получены и проанализированы на уровне table/INSERT/UPDATE references и transaction boundaries; см. audit `docs/audits/2026-11-17-postgres-upgrade-fixture-timestamp-contract.md`. Это source review, не runtime execution.
- После повторной проверки CI: runs `44068607386`/`44068607454` (commit `bd0d973...`) и `44070232846`/`44070232989` (commit `565e877...`) завершились FAILURE; проверенные jobs возвращают `steps: null`, `logs_url: null`, поэтому test execution не подтверждён и причина pre-step failure неизвестна. Vercel status current main `441cd742...` и `565e877...` — FAILURE `build-rate-limit`; это лимит сборок, не доказанная ошибка кода.
- Source-level checks: обе fixtures совпадают после нормализации; baseline columns присутствуют, кроме намеренно отложенного до migration 023 `token_version`; critical nullability/default/cascade/timestamp definitions сверены; workflow migration list содержит 140 последовательных migrations 010–149.
- Не запускались Node suite, PowerShell parser/runtime, PostgreSQL replay, 46 SQL integration tests, Bash concurrency, backend/frontend runtime. SQL integration остаётся **NOT PASSED**; никакие runtime checkbox не закрываются.
- Следующий owner gate и безопасные команды зафиксированы в UA-006 в `docs/USER_ACTIONS.md`. До полного Node PASS SQL runner не запускать.
- Дополнительная диагностика CI: rerun attempt 2 для `44070232846` и `44070232989` принят, но снова завершился FAILURE без шагов и логов (`steps: null`, `logs_url: null`; jobs `133996278489`, `133996306977`, `133996307323`). Причина pre-step blocker неизвестна; Node/SQL/frontend/backend test execution не подтверждено. Не считать это кодовым test failure.


### 2026-11-17 — исправлен fixture parity contract test: асимметричная фильтрация header comment

- Владелец синхронизировал локальный main с GitHub: до pull `git status --short` пустой; fast-forward `c92cb6d4 → 72bafc7a`; `HEAD` = `origin/main` = `72bafc7a1a0e1921e4155eacc6d38df610f39780`; итоговый status чистый.
- Владелец запустил `node --test backend/test/postgres-integration-runner-contract.test.js`: **19 PASS / 1 FAIL из 20**. Падал только тест parity standalone upgrade fixture и CI heredoc.
- Assistant повторно прочитал CI workflow, standalone fixture и contract test. Причина: expected сохранял общий комментарий `-- CI upgrade-compatibility fixture. Cluster roles are provisioned by verify-integration.ps1.`, actual удалял его дополнительным фильтром. Это асимметрия assertion, а не доказанное различие SQL schema. Фильтрация cluster role statements на стороне expected сохранена.
- Исправлен только `backend/test/postgres-integration-runner-contract.test.js`: actual-side comparison теперь сохраняет header comment и нормализует только line endings/trailing whitespace. Production code, migrations, CI workflow, SQL fixture и БД не менялись.
- Contract test опубликован: commit `e3517cdc717476bdba8e6d1f5f9fa289fb28be8f`, blob `03fc5d1973fcbc376367755009f310475e7cde44`.
- Создан audit `docs/audits/2026-11-17-postgres-integration-fixture-header-contract-test.md`, commit `07584d1f8c5254fc83164513e2afc9602fc70274`. В нём сохранены owner transcript, root cause, точное изменение, SHA, проверки, ограничения и следующий шаг.
- Assistant действия: прочитан полный owner transcript; повторно fetched актуальные contract test, standalone fixture, CI workflow и проектные документы; сравнена нормализация expected/actual; внесено и опубликовано одно узкое исправление; создан audit; далее обновляются паспорт, owner action log и register. Assistant не запускал Node, PowerShell, psql или PostgreSQL; локальный Windows checkout недоступен.
- **Текущий runtime статус:** Node suite после исправления ожидает повторного запуска владельцем; SQL integration остаётся **NOT PASSED**. Не запускать guarded runner до полного Node PASS. Production/PIN_TRIAL и persistent verification cluster не затрагивались.
- Следующий шаг владельца после синхронизации всех документационных commits — повторить Node contract suite и прислать полный вывод/exit code. См. UA-007.

- Post-publication source re-fetch: audit blob `571aa58c2a115b8392ee7100ba55ba49e4829539`; contract blob `03fc5d1973fcbc376367755009f310475e7cde44`; exact top-level declaration count is **20** (`^test(` line matches). PROJECT_STATE, USER_ACTIONS and DOCUMENTATION_REGISTER were fetched again and confirmed to contain this incident/next gate. This is source-level verification only; the corrected Node suite has not yet been rerun.


### 2026-11-17 — Node PostgreSQL runner contract gate: 20/20 PASS

- Владелец синхронизировал локальный checkout: чистый worktree до/после pull; fast-forward `72bafc7a → 9beca59b`; `HEAD` = `origin/main` = `9beca59b21c1f41c330bc7df03abb3189866766e`.
- Владелец выполнил `node --test backend/test/postgres-integration-runner-contract.test.js`: **20 tests, 20 pass, 0 fail, 0 skipped, 0 todo**. Это закрывает Node contract gate по фактическому owner transcript.
- Ранее исправленный parity assertion больше не падает; все runner contract assertions прошли.
- Создан audit `docs/audits/2026-11-17-postgres-integration-node-contract-20-pass.md`, commit `deb944f51a065bb0c2a6e7e4a7a4b282e402a67d`.
- Assistant повторно проверил GitHub PROJECT_STATE, USER_ACTIONS, DOCUMENTATION_REGISTER, guarded runner и предыдущий audit; установил следующий шаг из gate-последовательности. Ассистент не запускал локальные Node/PowerShell/psql/PostgreSQL команды; Node PASS предоставлен владельцем.
- **Текущий статус:** Node contract gate PASS. PowerShell Parser API check ещё НЕ ВЫПОЛНЕН. PostgreSQL SQL integration остаётся **NOT PASSED**; guarded runner ещё не запускался после текущего Node PASS.
- Следующий шаг владельца записан в UA-008: выполнить только PowerShell Parser API check для `scripts/verify-integration.ps1`. При Parser FAIL — STOP, runner не запускать. Только после Parser PASS и повторной проверки чистого synchronized main допускается guarded runner на утверждённом disposable PostgreSQL 18.6.
- Production/PIN_TRIAL, PID 15220, `X:\PinPosy-verify-pg18`, migrations и live databases не затрагивались.


### 2026-11-17 — PowerShell Parser API gate: PASS (0 syntax errors)

- Владелец синхронизировал checkout: до/после pull worktree чистый; fast-forward `9beca59b → 3f554999`; `HEAD` = `origin/main` = `3f5549990ce71c2e4ff86a393eabbf1d2776f944`.
- Владелец выполнил `[System.Management.Automation.Language.Parser]::ParseFile` для `scripts/verify-integration.ps1`; команда вывела `PASS: verify-integration.ps1 parsed successfully; syntax errors: 0`. PowerShell Parser gate закрыт.
- Parser PASS подтверждает только отсутствие синтаксических ошибок. Runner не запускался; psql/PostgreSQL runtime и SQL integration не проверялись.
- Перед действиями ассистент повторно fetched PROJECT_STATE, USER_ACTIONS, DOCUMENTATION_REGISTER и актуальный runner. Source review подтвердил, что runner сам проверяет branch main, fetch origin/main, clean worktree, HEAD=origin/main, psql path, loopback listener, postgres.exe command line/data directory и полную server identity; создаёт случайную disposable DB и в finally удаляет только её. Это чтение исходника, не runtime proof.
- Создан audit `docs/audits/2026-11-17-postgres-integration-powershell-parser-pass.md`, commit `d7c7d529334a418e1246857ec7e6f8c474829c05`.
- Assistant не запускал PowerShell, psql или PostgreSQL; Parser PASS получен из owner transcript. Никакие application code, migrations, SQL fixtures, runner, production DB или persistent verification cluster не менялись.
- **Текущий статус:** Node contract 20/20 PASS; PowerShell Parser PASS (0 syntax errors); PostgreSQL SQL integration всё ещё **NOT PASSED**.
- Следующий шаг владельца записан в UA-009: синхронизировать документационные commits и запустить guarded runner только из чистого synchronized main. При любом safety stop или первом SQL failure — остановиться и передать полный лог без секретов. SQL PASS допустим только после fixture, 140 migrations 010–149, двух inline assertions, всех 46 SQL tests и подтверждённого disposable DB cleanup.

### 2026-11-17 — PostgreSQL integration test 15/46: TEXT/UUID assertion defect

- Владелец предоставил полный transcript guarded runner на синхронизированном clean main `d736814d78aa9cefbc9c6367104a98d236123c1b`. Runner подтвердил loopback PostgreSQL PID 15220, каталог `X:\PinPosy-verify-pg18` и точную identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Успешно применены CI upgrade fixture, все 140 migrations 010–149 и обе inline assertions; SQL tests 1–14/46 завершились без ошибки. Test 15/46 `legacy-regeneration-reservation-guard.integration.sql` завершился ошибкой PostgreSQL `operator does not exist: text = uuid`. Tests 16–46 не запускались; SQL integration **NOT PASSED**.
- Cleanup подтверждён owner transcript: 0 активных сессий, DROP только disposable DB `pinposy_sqlint_99741a5f1e5a47e6`, затем подтверждено отсутствие этой DB.
- Assistant повторно fetched failing test, canonical `001_baseline.sql`, fixture, migrations 010, 066, 075, runner и актуальные документы. Canonical baseline определяет `credit_transactions.user_id TEXT`; migrations 010/075 также работают с `p_user_id TEXT`. В failing test UUID `v_user` напрямую сравнивался с TEXT-колонкой в двух ledger-count assertions. Это дефект SQL test predicate, а не основание менять schema или migrations.
- Исправлен только `backend/test/legacy-regeneration-reservation-guard.integration.sql`: оба `where user_id=v_user` заменены на `where user_id=v_user::text`. Новый blob `198a1714ce805e77a39c6e8a4334122b6a5fe09f`, commit `9f2648d0ac18f1b3e40c59accb68e5274df6985a`. Production code, migrations, fixtures, CI workflow, runner и базы данных не менялись.
- Создан audit `docs/audits/2026-11-17-postgres-integration-test-15-text-uuid-mismatch.md`, blob `c3f22112b3af2ed96c74494244a504608d07f03b`, commit `38db89adce46fc543196d853de7fd55f17adca4c`; в нём сохранены owner transcript, точная причина, источники типов, изменение, cleanup, проверки и ограничения.
- Assistant не запускал PowerShell, psql или PostgreSQL; runtime evidence принадлежит owner transcript. SQL test correction пока не исполнена повторно.
- Следующий шаг: владелец синхронизирует новый main, проверяет clean worktree и HEAD=origin/main, затем повторно запускает неизменённый guarded runner. SQL integration остаётся NOT PASSED до успешных 46/46 tests и подтверждённого cleanup.


### 2026-11-17 — PostgreSQL integration test 18/46: invalid completion payload masked refund guard

- Владелец синхронизировал clean main с `d736814d` до `0d31c813`; `HEAD=origin/main=0d31c813e39e420e26c5ebee0edadea1928df00d`. Guarded runner подтвердил PID 15220, `X:\PinPosy-verify-pg18` и точную identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Fixture, 140 migrations 010–149 и две inline assertions прошли. SQL tests 1–17/46 прошли. Test 18/46 `provider-refund-reconciliation-guard.integration.sql` упал с `invalid pin count`; tests 19–46 не запускались. SQL integration **NOT PASSED**.
- Cleanup подтверждён: disposable DB `pinposy_sqlint_ca5527ced768460b` удалена; runner вывел `Removed disposable database ...`.
- Assistant fetched failing test and migrations 012, 045, 046, 054, 063, 064, 066, 071, 072, 073, 074, 075, 077. Source diagnosis: test пытался вызвать completion с пустым JSON array. Completion function migration 054 сначала вызывает `save_generated_pins_and_charge`; эта функция отвергает пустой массив (`invalid pin count`) до UPDATE request status, поэтому ожидаемый trigger из migration 072 не достигался. Это дефект тестового входа, а не доказанный production defect.
- Исправлен только `backend/test/provider-refund-reconciliation-guard.integration.sql`: вместо пустого массива передан один валидный pin payload (`image_url`, `title`, `model_used`, `aspect_ratio=2:3`, `credits_cost=1`, amount=1), чтобы пройти input validation и проверить именно refund guard при смене request status. Commit `ea2016eed79de2854785f53d9d77a0d485d57d76`, blob `1ae496bdd596c848d18dc33a8f50e90de7b9cb78`.
- Создан audit `docs/audits/2026-11-17-postgres-integration-test-18-invalid-pin-count-test-input.md`, commit `f54c93396d1e6da7e6e266570bf6531930cfed52`. В нём сохранены owner transcript, root cause, проверенные migrations, точный diff, cleanup, assistant action log и runtime limitations.
- Assistant не запускал локальный Node, PowerShell, psql или PostgreSQL; все runtime результаты выше взяты из owner transcript. Исправленный test 18 и tests 19–46 ещё не исполнены.
- Production code, migrations, CI fixture/workflow, runner, production/PIN_TRIAL и persistent verification cluster не менялись.
- **Текущий gate:** Node contract 20/20 PASS (предыдущий owner transcript); PowerShell Parser 0 syntax errors PASS (предыдущий owner transcript); PostgreSQL SQL integration **NOT PASSED**.
- Следующий шаг: синхронизировать опубликованное изменение и документацию, затем повторить Node contract suite. Только при полном PASS разрешён новый guarded runner по UA-011; при первом SQL failure — STOP и сохранить cleanup output.


### 2026-11-17 — повторный Node contract gate после исправления SQL test 18: 20/20 PASS

- Владелец синхронизировал clean checkout: fast-forward `0d31c813 → 6d982d14`; `HEAD` = `origin/main` = `6d982d1414490ed210502f834018a1a1a6d9d8a2`; worktree чистый до и после pull.
- Владелец повторно выполнил `node --test backend/test/postgres-integration-runner-contract.test.js` после test-only correction test 18. Результат: **20 tests, 20 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**. Node contract gate PASS на актуальном commit.
- Это подтверждает runner contract assertions, но не запускает PostgreSQL и не доказывает прохождение SQL test 18. Предыдущий SQL run остановился на test 18/46; tests 19–46 не выполнялись. SQL integration остаётся **NOT PASSED**.
- Ассистент принял owner transcript, повторно fetched текущие проектные документы и предыдущий incident audit, создал audit `docs/audits/2026-11-17-postgres-integration-node-contract-after-test18-fix-pass.md`, обновил этот паспорт и UA-012, затем обновит register и повторно fetched blobs. Ассистент не запускал локальные Node/PowerShell/psql/PostgreSQL.
- Предыдущий PowerShell Parser API PASS (0 syntax errors) остаётся подтверждённым для текущего runner source, который не менялся после этой проверки. Следующий шаг — guarded PostgreSQL runner на чистом synchronized main по UA-012.
- Никакие production migrations/code, production/PIN_TRIAL, PID 15220, `X:\PinPosy-verify-pg18` или persistent databases не менялись; секреты не запрашивались.



### 2026-11-17 — PostgreSQL integration test 19/46: NOT NULL claim-token defect; additive migration 150

- Owner synchronized clean `main` at `4df18de1fbc8ae98b3d316d945cce7f973b244de`. Guarded runner safety checks passed (PID 15220, data directory `X:\PinPosy-verify-pg18`, verified server identity). Fixture, migrations 010–149 (140 files), two CI inline assertions and SQL tests 1–18/46 passed.
- SQL test 19/46 `provider-refund-reconciliation-workflow.integration.sql` failed: `finalize_reconciled_pin_regeneration_failure(text,text)` attempted `claim_token=null` against `pin_regeneration_requests.claim_token UUID NOT NULL`. Tests 20–46 did not run. Disposable DB `pinposy_sqlint_e44cc1cd1e6d4d57` cleanup succeeded (0 sessions, DROP DATABASE, explicit removal message). SQL integration remains **NOT PASSED**.
- Source review compared migration 053's NOT NULL schema with migration 077's two analogous finalizers. The generation journal permits nulling its claim token; the regeneration journal does not. This is a production SQL function defect, not a fixture issue.
- Historical migration 077 was restored to its original blob (no historical migration rewrite retained). The fix is additive migration 150, which replaces only the regeneration finalizer and preserves the existing non-null token. The integration test now asserts the token remains unchanged after terminal failure.
- Updated the guarded runner, CI workflow, canonical migration-chain test, PostgreSQL runner contract, and Linux/Windows local replay scripts/contracts to require 141 contiguous migrations 010–150.
- Detailed audit: `docs/audits/2026-11-17-postgres-integration-test-19-regeneration-claim-token-not-null.md`. It records the complete owner transcript summary, source diagnosis, initial 077 edit and restoration, all changes/SHAs, checks, limitations and next gates.
- Assistant fetched and inspected current GitHub source and documentation; corrected the migration history approach; published migration 150, regression assertion, runner/CI/replay-chain updates; and re-fetched source files to verify their final blobs and invariants. Assistant did not execute Node, PowerShell, psql or PostgreSQL.
- Next owner gate: synchronize main; run Node contract + migration-chain + replay-contract tests; run PowerShell Parser API check; only after both PASS, run the guarded PostgreSQL runner. SQL PASS requires 141 migrations 010–150, both inline assertions, all 46 SQL tests and successful cleanup.
- No production database, persistent verification cluster, PostgreSQL service PID 15220 or `X:\PinPosy-verify-pg18` was modified. No secret was requested or exposed.


### 2026-11-17 — PostgreSQL integration test 20/46: invalid regex repetition bound; additive migration 151

- Owner synchronized clean checkout at `0b56648d04e43c87fb656a59dc1e21411a5b877f`. Node contract command returned 39 tests, 37 PASS / 2 FAIL: the baseline-column helper over-escaped a dynamically constructed RegExp and the Linux replay contract still expected migration 148/old count. PowerShell Parser API passed with 0 syntax errors.
- Guarded PostgreSQL runner verified its local server identity, applied the fixture, all 141 migrations 010–150, and both CI inline assertions. SQL tests 1–19/46 passed. Test 20/46 `provider-refund-operator-actions.integration.sql` failed with PostgreSQL `invalid repetition count(s)` in `_admin_record_provider_refund_action`, PL/pgSQL line 84. Tests 21–46 did not run. Disposable DB cleanup succeeded (0 sessions, DROP DATABASE, explicit removal). SQL integration remains **NOT PASSED**.
- Source diagnosis: historical migration 078 introduced regex repetition bound `{7,499}` in both the operator-action CHECK constraint and internal validation function. PostgreSQL ARE finite repetition upper bounds cannot exceed 255. The evidence length is independently limited to 500, so an open upper bound `{7,}` preserves intended semantics.
- Historical migration 078 was not rewritten. New atomic additive migration 151 replaces the CHECK constraint and uses `pg_get_functiondef` to replace the legacy function regex token, aborting if the expected token is absent.
- Corrected the over-escaped dynamic RegExp in the baseline-column contract test; corrected stale Linux replay contract expectations; advanced migration-chain tests, Linux/Windows replay scripts, guarded Windows runner and CI workflow to contiguous migrations 010–151 (142 files).
- Detailed audit: `docs/audits/2026-11-17-postgres-integration-test-20-provider-refund-regex-repetition-limit.md`. It records the owner transcript, source diagnosis, all source changes, action chronology, verification limits and next gates.
- Assistant fetched current GitHub source and docs, diagnosed the PostgreSQL regex limit, published additive migration 151 and related tests/runner/CI updates, and re-fetched source for inspection. Assistant did not execute Node, PowerShell, psql or PostgreSQL.
- **Current gate:** corrected Node suite pending owner execution; PowerShell Parser must be rerun because guarded runner changed; PostgreSQL SQL integration **NOT PASSED**.
- Next: owner synchronizes clean main, runs Node contract/migration/replay tests, then Parser API; only after both PASS runs guarded PostgreSQL integration. SQL PASS requires fixture, 142 migrations 010–151, both inline assertions, all 46 SQL tests and confirmed disposable DB cleanup. Stop on first failure.
- No production database, PID 15220, `X:\PinPosy-verify-pg18`, or persistent verification cluster was modified by assistant; no secrets were requested or exposed.


### 2026-11-17 — PostgreSQL integration test 26/46: SECURITY DEFINER trigger function had default PUBLIC EXECUTE

- Владелец предоставил полный вывод guarded runner на clean synchronized HEAD `116d7545bab172bbd886c287111a5137ae509ace`. Runner подтвердил PostgreSQL PID 15220, data directory `X:\PinPosy-verify-pg18` и identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- CI upgrade fixture, все 142 migrations 010–151 и обе inline assertions прошли. SQL tests 1–25/46 PASS; test 26/46 `security-definer-search-paths.integration.sql` завершился ошибкой: `SECURITY DEFINER function release_failed_pin_regeneration_reservation() is executable by anon or authenticated`. Tests 27–46 не запускались. Cleanup disposable DB `pinposy_sqlint_a17861b018b74483` успешен: 0 sessions, DROP DATABASE, explicit removal. PostgreSQL integration **NOT PASSED**.
- Повторно fetched migration 066, security-definer catalog test, migration chain, runner, CI и Linux/Windows replay scripts. Migration 066 создаёт `release_failed_pin_regeneration_reservation()` как SECURITY DEFINER trigger function и подключает её к таблице, но не отзывает default PUBLIC EXECUTE. Каталожный SQL test правильно обнаружил реальную ошибку privilege hardening.
- Историческая migration 066 не переписывалась. Создана additive migration 152 `152_revoke_direct_execution_of_regeneration_reservation_trigger.sql`, которая отзывает EXECUTE у PUBLIC, anon, authenticated и service_role. Прямой вызов функции не нужен: она служит только триггеру; runtime EXECUTE privilege для срабатывания trigger не требуется.
- Migration 152 опубликована: commit `5ff2f754239a39c8def8f97182f5dbab7cd2a084`, blob `aa8e8ee22df894583b0c6e49f061b06e17fed1b4`.
- Обновлены runner contract, canonical migration-chain test, Linux/Windows replay contracts и scripts, guarded Windows runner, CI workflow: вся цепочка теперь 143 contiguous migrations 010–152. Полные blob SHAs и commits указаны в audit `docs/audits/2026-11-17-postgres-integration-test-26-security-definer-trigger-execute.md`.
- Assistant fetched и проверил опубликованные source files: migration 152 содержит точный REVOKE; migration 066 по-прежнему создаёт trigger; contract tests и replay scripts ожидают 143 миграции; runner проверяет 010–152; CI применяет migration 152.
- Создан подробный audit с полным owner transcript summary, diagnosis, action chronology, source blob/commit SHAs, verification limits и next gates: `docs/audits/2026-11-17-postgres-integration-test-26-security-definer-trigger-execute.md`.
- Assistant не запускал Node, PowerShell, psql или PostgreSQL. Node/Parser/runtime verification для migration 152 не выполнены. **SQL integration NOT PASSED**; tests 27–46 не запускались.
- Следующий шаг владельца: синхронизировать clean main; выполнить три Node contract/migration test files; затем PowerShell Parser API; только после обоих PASS — guarded runner. SQL PASS только после fixture, всех 143 migrations 010–152, двух inline assertions, всех 46 SQL tests и успешного cleanup.
- Безопасность: не обходить guards, не менять PID/port/data directory, не останавливать PID 15220, не менять/удалять `X:\PinPosy-verify-pg18`, не использовать production/PIN_TRIAL и не отправлять секреты.

- Final post-publication review also corrected an over-escaped regex in the new migration-152 Node contract and stale 010–151 diagnostic text in the guarded/Windows replay scripts and replay contract. Final blobs/commits are recorded in the incident audit and documentation register. These edits were re-fetched from GitHub; no runtime PASS is claimed.


### 2026-11-17 — PostgreSQL integration test 28/46: expired image deletion claim was reacquired

- Owner evidence on clean synchronized HEAD `b9ff75ba8342417a93386a01a09e569b9266a4f5`: Node suite 40/41 PASS (one baseline-column helper failure: `table users must exist`); PowerShell Parser PASS (0 syntax errors); guarded PostgreSQL runner applied fixture, 143 migrations 010–152 and both inline assertions successfully. SQL tests 1–27 PASS; test 28/46 `pin-image-deletion-claims.integration.sql` failed because an expired deletion claim was reacquired with a fresh 60-second lease instead of permanently quarantined. Tests 29–46 did not run. Disposable DB cleanup confirmed (0 sessions, DROP DATABASE, absence confirmed). PostgreSQL integration remains **NOT PASSED**.
- Diagnosis: migration 145 expanded image-reference inventory (generation replay payloads, board cover URLs, manual-review queue payloads) but its replacement of `claim_pin_image_deletion` accidentally restored retry behavior for expired external Storage deletes, undoing the permanent quarantine policy established in migration 083 and preserved by migration 104. A late Storage request may still complete; the same object path must not be claimed/deleted/reused again. This is a production SQL regression, not a test expectation to weaken.
- Node failure was a separate contract-test bug: the dynamic RegExp helper in `postgres-integration-runner-contract.test.js` did not preserve backslash escapes inside its JavaScript string. Corrected the helper and added a migration-153 contract test.
- Historical migrations 083, 104 and 145 were not edited. Additive migration 153 restores permanent quarantine while retaining migration 145's expanded reference inventory; it clears claim fields, records `stale_delete_quarantined`, returns `path_quarantined`, and does not issue a second Storage delete.
- CI, canonical migration chain, Linux/Windows replay contracts/scripts and guarded runner now require all 144 contiguous migrations 010–153. Source blob SHAs and commit SHAs, owner transcript summary, diagnosis, action history, verification limits and next gates are in `docs/audits/2026-11-17-postgres-integration-test-28-expired-image-delete-quarantine-regression.md`.
- Assistant re-fetched changed source from GitHub and checked key content and migration range. Assistant did not run Node, PowerShell, psql, PostgreSQL or CI. Migration 153 and all updated gates remain **NOT runtime-verified**.
- The owner invoked the guarded runner after Node reported one failure; this is recorded as a gate-order deviation. Runner's own repository and database-target guards passed; no evidence of bypass or modification of persistent/production data.
- Next owner sequence: synchronize latest clean main; run Node contract/migration/replay tests and require full PASS; run PowerShell Parser API and require zero errors; only then run guarded PostgreSQL integration. SQL PASS requires fixture, all 144 migrations 010–153, both inline assertions, all 46 SQL tests and confirmed disposable DB cleanup. Stop on first failure.

- Final post-publication source review corrected the dynamic baseline RegExp expression in `backend/test/postgres-integration-runner-contract.test.js`; final blob `fa6e049e08a006828e7b8faba9005a287d9a6789`, commit `e2e117bba716282ada135673ef6cfd6e89cc9ba4`. The exact expression was re-fetched and checked; Node runtime gate still pending.


### 2026-11-17 — PostgreSQL integration test 28/46 rerun: approved-pin fixture + stale migration-chain assertion

- Owner synchronized to clean main HEAD `d0155f20da307fc774da18c1ba69e44b19dfcada`. Node output exposed a stale assertion in `backend/test/verify-script-migration-chain.test.js`: it expected `10..152`, while `scripts/verify.ps1` correctly targets `10..153`. PowerShell Parser API for `scripts/verify-integration.ps1` passed with 0 syntax errors.
- Owner ran guarded PostgreSQL replay despite the Node failure. Runner's clean-main and loopback PostgreSQL identity guards passed; fixture, all 144 migrations 010–153 and both CI inline assertions passed. SQL tests 1–27 passed. Test 28/46 failed at schedule insertion with `only approved pins can be scheduled`, raised by migration 148's `guard_pin_schedule_insert_requires_approved_pin()`. Tests 29–46 did not run. Disposable database `pinposy_sqlint_87acdec0a62c4574` was successfully cleaned up and its absence confirmed. SQL integration remains **NOT PASSED**.
- Diagnosis: the schedule-snapshot fixture inserted a pin without specifying `status`, then created a schedule. Migration 148 intentionally requires the pin to be `approved`; the fixture was stale after that production invariant was introduced. This is a test fixture issue; do not weaken the production guard. Separately, the Node replay contract expected migration upper bound 152 even though current scripts and source chain are 010–153.
- Assistant changed only the schedule-snapshot test fixture to insert `status='approved'` (commit `e4f2d72fdfc4fc547b356c46db697dcba8dfee22`, blob `2beed365cabe903e1fb8a47a5189e8bfb98a0fb3`) and updated the Windows replay contract matcher to `10..153` (commit `982500d43a81bd3b2a8ba53aa1534b422e103ce7`, blob `d4fa2a7d659a758c61bc8b63b75e624588801e71`). No production SQL, migration, runner, workflow, or database was changed.
- A first exact-match attempt to edit the Node assertion used an incorrect escape representation and made no change; the file was re-fetched, the actual line confirmed, and the corrected update then succeeded. An initial documentation-register helper expression also failed locally before any GitHub write; the register was rebuilt using line-based parsing. Both no-write attempts are recorded in the detailed audit.
- Detailed report: `docs/audits/2026-11-17-postgres-integration-test-28-approved-pin-fixture-and-runner-contract.md`.
- Assistant did not run Node, PowerShell, psql or PostgreSQL. Updated source has not been runtime-verified. The Node suite must pass before Parser; both must pass before another guarded SQL replay. SQL PASS still requires all 46 tests and confirmed cleanup.


### 2026-11-17 — PostgreSQL integration test 28/46 rerun: terminal generation journal fixture + migration reference-order contract

- Owner checkout for this run: clean synchronized main at `7662d856aa3b2af8870d8d44686b92331b4bc0da`. PowerShell Parser API passed with 0 syntax errors. The supplied Node failure excerpt showed that the migration-153 contract expected reference order `pin_generation_requests → pin_review_queue → boards`, while migration 153 correctly contains `pin_generation_requests → boards → pin_review_queue`; complete aggregate Node counts were not included.
- Guarded PostgreSQL runner applied the upgrade fixture, all 144 migrations 010–153, and both CI inline assertions. SQL tests 1–27 passed. Test 28/46 `pin-image-deletion-claims.integration.sql` failed with `generation task journal is not terminal` from migration 071's `guard_pin_generation_request_completion()`. Tests 29–46 did not run. Cleanup succeeded: 0 remaining sessions, disposable DB `pinposy_sqlint_98bf42130a244300` dropped and removal confirmed. SQL integration remains **NOT PASSED**.
- Diagnosis: the test inserted a generation task with migration 045's default status `prepared`, then marked its parent request `completed`. Migration 071 correctly requires every journal task to be terminal and its provider outcome to match. This is a test fixture defect, not a production guard defect. The image-deletion reference inventory intentionally retains task-journal references regardless of task outcome.
- Assistant changed only the SQL test fixture: the task now explicitly has `status='failed'` and `provider_outcome_status='failed'`, preserving its `storage_url` while satisfying the terminal journal invariant. Source commit `b3fe4533d3491507c4c86530bdb377c1d7947c0c`, final blob `01390370c8beb8250e1c1fce6845a7c4b0fe8077`.
- Assistant corrected the migration-153 Node contract to follow the actual SQL reference order. An initial replacement over-escaped regex-literal backslashes; the file was re-fetched and corrected. Final commit `4adb47381b2a74d7b878bf1671768f128cda73fc`, final blob `79b884a2151dc71dec41425a758ff521326a666a`. An earlier intermediate commit `780a8a75efec49e45d9a502ecfb2b8261bc53d02` was superseded by that final correction.
- No production migration, database function, runner, CI workflow, or persistent PostgreSQL cluster was changed. Assistant did not run Node, PowerShell, psql, PostgreSQL, or CI. Final source was fetched from GitHub and statically inspected; new source is **NOT runtime-verified**.
- Detailed chronology, owner evidence, diagnosis, exact commits/blobs, limitations, and next steps: `docs/audits/2026-11-17-postgres-integration-test-28-terminal-generation-task-journal-and-contract-order.md`.
- Owner proceeded with the guarded SQL runner despite the Node assertion excerpt. Record as gate-order deviation; runner's own clean-checkout and database-target guards passed, with no evidence of bypass.
- Next: synchronize latest clean main; run Node contract/migration/replay gates and require full PASS; then PowerShell Parser; only after both PASS run guarded PostgreSQL integration. SQL PASS requires all 46 tests and confirmed cleanup. Do not stop PID 15220, change port/data directory, bypass guards, or use production/PIN_TRIAL.


### 2026-11-17 — PostgreSQL Node contract gate: upgrade-fixture regex and migration-count corrections

- Owner synchronized cleanly to `0fc877a0aa5dd47d565f77b9873fc4c62edbf807`; local HEAD equaled origin/main. The three Node gate files reported **42 tests: 39 PASS, 3 FAIL**.
- Failures: users fixture table matcher did not capture an existing `public.users` table; CI migration-chain contract expected 143 entries and still named 010–152 although active chain is 010–153 (144); dynamic RegExp in baseline-column contract threw `Unmatched ')'`.
- Root cause: two direct regex literals were over-escaped; expected migration count/title were stale; dynamic RegExp source string had incorrect escaping. The upgrade fixture itself contains `public.users` and `is_admin boolean default false`.
- Assistant changed only `backend/test/postgres-integration-runner-contract.test.js`. Final commit `3c2d82bfafef40d16d6ae6c3eb7f4c7d7292e698`, blob `2f0e54ad47ffd05cfca500568a3f962cb6af6c93`. Intermediate count-only commit `3cb658510bc54dca040239fb15ac85ece3e6d017` was superseded. No production SQL, fixture, CI, runner, or database was changed.
- Final contract file was re-fetched and statically inspected: direct users matchers now use valid regex-literal escaping; dynamic RegExp helper uses valid JavaScript string escaping; migration contract expects exactly 144 contiguous migrations 010–153.
- Assistant did not execute Node, PowerShell, psql, PostgreSQL, or CI. The corrected contract is **NOT runtime-verified**. Since Node gate failed, owner correctly did not proceed to Parser or SQL runner. PostgreSQL integration remains **NOT PASSED**; SQL tests 1–46 have not been rerun after the latest fixture correction.
- Detailed evidence, diagnosis, publication chronology, exact commit/blob and next gates: `docs/audits/2026-11-17-postgres-node-contract-upgrade-fixture-regex-and-migration-count.md` (audit blob `49fbaedd17c2422458b35617b89d129af8d629f6`).
- Next: owner syncs latest main; reruns the same three Node tests and requires 42/42 PASS; then Parser PASS; only then guarded PostgreSQL replay. SQL PASS still requires all 46 tests and confirmed cleanup.


### 2026-11-17 — PostgreSQL Node contract gate: dynamic RegExp capture-group correction

- Owner reran the three Node gate files. Result: **42 tests, 41 PASS, 1 FAIL**. The sole failure was the baseline-column contract's dynamically constructed RegExp, which threw `Unmatched ')'`. All other tests, including the direct users matcher and 010–153 / 144 migration contract, passed.
- Diagnosis: dynamic RegExp string escaped the literal SQL opening parenthesis but omitted the opening capture-group parenthesis before `[\\s\\S]*?`, leaving an unmatched closing group delimiter.
- Assistant changed only the dynamic RegExp string in `backend/test/postgres-integration-runner-contract.test.js` to capture the table definition: `' \\\\(([\\\\s\\\\S]*?)\\\\n\\\\);'`. Commit `c4de3c67537cac08daadfbf6f461304bd4b61889`; blob `2765d21320bf1847efb73cf3453d0d3597289df7`.
- Final source was re-fetched from GitHub and statically inspected. No production SQL, migrations, fixture, runner, CI, or database was changed.
- Assistant did not execute Node, PowerShell, psql, PostgreSQL, or CI. Corrected Node test is **NOT runtime-verified**. Owner did not run Parser or SQL runner after Node failure. PostgreSQL SQL integration remains **NOT PASSED**.
- Detailed evidence and next steps: `docs/audits/2026-11-17-postgres-node-contract-dynamic-regexp-capture-group.md` (audit blob `72215c91b03a4bbd2b99012becefbbb12076cf33`).
- Next: owner syncs latest main and reruns the same Node gate, requiring 42/42 PASS; then Parser PASS; only then guarded PostgreSQL runner. SQL PASS requires all 46 SQL tests and confirmed cleanup.


### 2026-11-17 — PostgreSQL Node contract gate: owner confirms 42/42 PASS

- Owner synchronized cleanly to `6512dc8aa4ae882e8be91877185a262787b02f87`; local HEAD equals origin/main and working tree is clean.
- Owner reran `node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js`.
- Result: **42 tests, 42 PASS, 0 FAIL, 0 cancelled, 0 skipped**. This includes the previously failing baseline-column contract and dynamic RegExp.
- This is owner-provided local execution evidence. Assistant did not execute Node, PowerShell, psql, PostgreSQL or CI.
- Detailed run result appended to `docs/audits/2026-11-17-postgres-node-contract-dynamic-regexp-capture-group.md` (new audit blob `fa16322881f4427ef9330e7292ee5fe833bca977`).
- Next gate: owner runs the PowerShell Parser API check and requires 0 syntax errors. Only then may the guarded PostgreSQL runner execute. PostgreSQL integration remains **NOT PASSED / NOT YET RUN** after this Node PASS; final SQL PASS requires fixture, 144 migrations 010–153, two CI inline assertions, all 46 SQL tests and confirmed disposable database cleanup.


### 2026-11-17 — PowerShell Parser gate: owner confirms PASS

- Owner synchronized cleanly to `73a1aef18eaee621783b879aa97ae1527ec9ba5a`; local HEAD equals origin/main and worktree is clean.
- Owner ran the PowerShell Parser API against `scripts/verify-integration.ps1`; output: **PowerShell Parser PASS: 0 syntax errors**.
- This is owner-provided local evidence. Assistant did not execute PowerShell or local commands.
- Combined gates: Node contract suite **42/42 PASS** and PowerShell Parser **0 syntax errors**.
- Detailed evidence: `docs/audits/2026-11-17-postgres-node-contract-dynamic-regexp-capture-group.md` (latest audit blob `5ad74e1be436daec60453eeb95c880b902529104`).
- The guarded PostgreSQL integration runner is now the next authorized owner step. PostgreSQL integration remains **NOT PASSED / NOT YET VERIFIED** until full runner output confirms fixture, 144 migrations 010–153, two CI inline assertions, all 46 SQL tests and disposable DB cleanup.


### 2026-11-17 — PostgreSQL integration test 28: inconsistent parent generation fixture corrected

- Owner's guarded runner on `edf883e604140a864560b11b1181c672590f8f04`: fixture applied; 144 migrations 010–153 applied; both CI inline assertions passed; SQL tests 1–27 passed.
- SQL test 28 `pin-image-deletion-claims.integration.sql` failed at the parent request completion update with `completed pins do not match successful generation tasks`.
- Cleanup succeeded: runner terminated no other sessions, dropped only disposable DB `pinposy_sqlint_954a7251fb504472`, and confirmed its removal. Tests 29–46 were not run.
- Diagnosis: test fixture inserted one failed task (and zero successful tasks) with a durable storage URL, but incorrectly marked its parent request completed while leaving nullable `pins` as NULL. Migration 071 correctly requires a JSON array matching the count of successful tasks on completion.
- Assistant changed only the SQL fixture: parent is now terminally failed with `error_code='provider_task_failed'`, consistent with its failed task. This preserves the intended test that task-journal storage URLs remain deletion references for terminal parent requests. No production SQL or migrations changed.
- Source commit `c58b877c1d51713c6b0d102206d8d4439ec4123e`; source blob `1df7078c31ba2992d526c0993802f3819b59df80`.
- Detailed audit: `docs/audits/2026-11-17-postgres-integration-test-28-parent-generation-terminal-state-fixture.md` (blob `44437db99bb398867a141ee670e2c9b944ea34da`).
- Assistant did not execute local tests or database commands. The fixture correction is not runtime-verified. Prior Node 42/42 and Parser PASS predate this SQL-only change. PostgreSQL integration remains **FAIL 27/46** pending rerun; next owner gate is Node 42/42, then guarded runner. Parser script was not changed, so the prior Parser PASS remains applicable.


### 2026-11-17 — PostgreSQL test 28/46: deleted image path tombstone regression and additive migration 154

Owner evidence on clean commit `7c679f475ceaaf7cdd4d2eb953c97fd84f41c374`: Node 42/42 PASS; guarded runner applied fixture, 144 migrations 010–153 and both CI assertions; SQL tests 1–27 PASS; test 28 failed with `upload reservation unexpectedly reused a deleted image path`. Disposable DB cleanup succeeded. Tests 29–46 did not run.

Diagnosis: migration 145 replaced `begin_pin_image_upload()` to expand the durable reference inventory but omitted the permanent `deleted` state guard present in migrations 090/098. A deleted lifecycle row therefore fell through to the upload reservation update. This is a production SQL regression, not merely a fixture mismatch.

Published additive migration 154 restoring the `deleted -> already_deleted` guard while preserving migration 145's expanded references. Updated migration contract, canonical chain tests, Linux/Windows replay scripts, guarded Windows runner, and CI workflow. Historical migrations and the existing SQL regression fixture remain unchanged. Final source blobs/commits and full reasoning are recorded in `docs/audits/2026-11-17-postgres-integration-test-28-deleted-image-path-tombstone-regression.md`.

Assistant re-fetched all eight changed source paths and checked their final blob SHAs and static migration-range markers. No Node/PowerShell/psql/PostgreSQL/CI execution was performed by the assistant. Migration 154 is not runtime-verified. Owner must rerun Node (now expected 43/43), PowerShell Parser (0 errors), then the guarded SQL runner. PostgreSQL integration remains **FAIL 27/46**; tests 29–46 remain unexecuted.


### 2026-11-17 — PostgreSQL test 28 follow-up: unique lifecycle fixture paths and migration-154 contract regex

- Owner supplied a new guarded-runner transcript at clean checkout `21f0bb3c6889ce2cc0830add015d9d5b1c7b7b5d`. The runner applied the fixture, all 145 migrations 010–154 and both CI assertions; SQL tests 1–27 passed. Test 28 failed at `finalize_pin_image_upload()` with `invalid pin image upload finalization`. Disposable DB `pinposy_sqlint_a1f0fda5a45947bc` was dropped and removal confirmed. Tests 29–46 did not run.
- The same owner output showed PowerShell Parser PASS (0 syntax errors). The initial Node assertion excerpt showed the migration-154 contract failing to match SQL that actually has the expected reference order; aggregate Node test counts were not supplied.
- Diagnosis 1 (Node test): migration-154 test used over-escaped regex-literal backslashes for the multi-line reference-order matcher and service-role grant matcher. Corrected only the two assertions to use normal JavaScript regex-literal escaping.
- Diagnosis 2 (SQL fixture): AUD-260 reused four generation object keys already used by earlier test blocks. The first path was quarantined by the earlier expired-delete test; other paths overlapped with durable journal/replay references. The upload reservation correctly refused those paths; the fixture then passed a NULL token to finalization, which correctly raised the invalid-argument exception. This is a test fixture path collision, not evidence of a production function defect.
- Corrected only the AUD-260 SQL fixture to use four distinct valid 32-hex object IDs. No production SQL, migration, runner, CI, database, or persistent PostgreSQL cluster changed.
- Source commits/blobs: Node contract `ff5be4d4ce9160669b87c5ceb5cd09fc024399cd` / `b0b663b22c336bf72f9317bdb7151f5eb141aa15`; SQL fixture `bd29eb628780cb085e42d7a249802d2f9e10e06c` / `2d2e5b97955a58f1987c856beb1b65906375ddae`. Detailed audit: `docs/audits/2026-11-17-postgres-integration-test-28-upload-finalization-fixture-path-collision-and-migration154-contract-regex.md`, blob `52f241d0abddd2724bc1991107a568a5e4581820`.
- Assistant re-fetched both source files and audit from GitHub. Static inspection confirmed the corrected regexes and unique AUD-260 paths. Assistant did not execute Node, PowerShell, psql, PostgreSQL or CI. The corrected Node contract and SQL fixture are **NOT RUNTIME-VERIFIED**. PostgreSQL integration remains **FAIL 27/46** pending a complete rerun; tests 29–46 remain unexecuted.
- Next: owner synchronizes clean main; runs the three Node gate files and requires all tests PASS (expected 43 total); then, because the runner script is unchanged and Parser just passed, runs the guarded PostgreSQL runner. Full SQL PASS requires all 46 tests and confirmed disposable DB cleanup. Preserve PID 15220, port 55439 and `X:\PinPosy-verify-pg18`; no production/`PIN_TRIAL`, no guard bypass, and no secrets in chat.


### 2026-11-17 — PostgreSQL test 28: regeneration replay image reference guard regression; migration 155

Owner evidence from local commit `76593cc93d5251eb33020ef2a395dba2ceaa1c66`: Node gate 43/43 PASS; guarded runner applied the fixture, 145 migrations 010–154 and both CI inline assertions; SQL tests 1–27 passed; test 28 failed because deletion claim returned `claimed: true` despite a durable `pin_regeneration_requests.result_pin.image_url` reference. Disposable database cleanup succeeded. Tests 29–46 did not run. SQL integration remains **NOT PASSED (27/46)**.

Read-only source comparison found migration 104 had added the regeneration replay payload reference check, but migration 145 replaced `claim_pin_image_deletion()` without retaining that check. Migration 153 inherited the omission while restoring permanent expired-claim quarantine; migration 154 did not touch the deletion claim function. This is a production SQL migration regression, not a fixture-only issue.

Added migration 155 based on migration 153's latest deletion-claim implementation. It restores the `result_pin ->> 'image_url'` check while preserving the migration-153 quarantine/tombstone behavior and the full migration-145 reference inventory. Historical migrations remain unchanged. The existing SQL regression fixture was retained unchanged.

Also updated the Node migration-155 contract, canonical migration-chain contract, Linux/Windows replay contracts and scripts, guarded Windows integration runner, and CI workflow to apply 146 migrations 010–155.

Assistant actions: fetched current source and documentation from GitHub; compared migrations 104, 145, 153 and 154; inspected the failing SQL fixture; created migration 155; updated static contracts, replay scripts and CI; created a detailed audit; re-fetched changed sources to verify publication. Assistant did not run local Node, PowerShell, psql, PostgreSQL or CI. Source review is not runtime verification.

Next owner gates after clean sync: Node suite (expected 44/44 PASS), PowerShell Parser (0 errors), then guarded PostgreSQL runner. Require 146 migrations 010–155, two inline assertions, all 46 SQL tests and successful disposable DB cleanup. Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`; no production/`PIN_TRIAL`, no guard bypass, no secrets in chat. Nine Bash concurrency scripts remain unverified.

Detailed audit: `docs/audits/2026-11-17-postgres-test-28-regeneration-replay-image-reference-guard-regression.md`.


### 2026-11-17 — PostgreSQL test 28: upload reservation regeneration replay-reference regression; migration 156

Owner evidence from guarded runner on clean main `484a7857e243ab8629b4056bb226b1dfea05806f`: fixture applied; 146 migrations 010–155 applied; both CI inline assertions passed; SQL tests 1–27 passed; test 28 failed because `begin_pin_image_upload()` returned `reserved: true` for a path still referenced by `pin_regeneration_requests.result_pin.image_url`. Disposable DB `pinposy_sqlint_d2afcaa5940843eb` was terminated/dropped and removal confirmed. Tests 29–46 did not run. SQL integration remains **NOT PASSED (27/46)**.

Diagnosis: migration 107 introduced the regeneration replay payload reference check in `begin_pin_image_upload()`; migration 145 replaced the function and omitted it; migration 154 restored the permanent deleted-path tombstone guard and board/review inventory but still omitted the regeneration replay reference. The SQL fixture already correctly tests the case where `storage_url` is NULL but `result_pin.image_url` is durable. This is a production SQL regression, not a fixture defect.

Published additive migration 156, based on migration 154's current upload-reservation function, restoring `managed_pin_image_object_path(r.result_pin ->> 'image_url') = p_object_path` while preserving all existing reference inventory, permanent `quarantined`/`deleted` rejection, and service-role-only execution. Historical migrations and SQL fixture were not changed.

Updated migration-156 static contract, canonical chain test, Linux/Windows replay contracts and scripts, guarded Windows runner, and CI workflow. All local replay contracts and runner counts now expect **147 contiguous migrations 010–156**; CI explicitly applies migration 156 after 155. Exact blobs, commits, owner transcript, diagnosis, and limitations are recorded in `docs/audits/2026-11-17-postgres-test-28-upload-regeneration-replay-reference-regression-migration-156.md`.

Assistant fetched all eight source files after publication and checked their exact blob SHAs and key static conditions. Assistant did not execute Node, PowerShell, psql, PostgreSQL, Bash, or CI. Migration 156 and updated tests/scripts are **NOT runtime-verified**. The prior Parser PASS predates the runner-script edits and must be repeated. Next owner gates: clean sync; Node tests (expected 45/45); updated PowerShell Parser (0 errors); only then guarded PostgreSQL runner. Full SQL PASS requires all 46 ordered tests and confirmed disposable DB cleanup. Preserve PID 15220, port 55439, and `X:\\PinPosy-verify-pg18`; no production/`PIN_TRIAL` and no guard bypass. Nine Bash concurrency scripts remain outside this runner.


### 2026-11-17 — PostgreSQL test 29 retention inventory fixture collision; migration-156 contract correction

Owner evidence from clean main `5aee55dcf504dbb4e8ece704733681afcb4436f0`: migration 156 Node contract assertion failed because its regex literals were over-escaped (aggregate Node test count was not supplied). PowerShell Parser passed with 0 syntax errors. The guarded runner nevertheless ran: fixture applied, 147 migrations 010–156 applied, both CI inline assertions passed, SQL tests 1–28 passed; test 29 `pin-image-retention-inventory.integration.sql` failed on its first pin insert with `pin image object is not available for new references`. Disposable DB `pinposy_sqlint_ebd8138f1c3143c8` was dropped and removal confirmed. Tests 30–46 did not run.

Diagnosis: test 28 uses the fixed object path `generation-eeee...eeee.png` and leaves its lifecycle tombstone/state in the disposable DB. Test 29 reused that same fixed path for its old-image fixture. The migration-070 reference-write trigger correctly rejected a new pin reference to the unavailable path. This is a test-fixture isolation defect, not a production trigger defect. The migration-156 contract had four over-escaped regex assertions; the actual migration source contains the expected predicate and security guards.

Assistant changed only test code:
- `backend/test/postgres-integration-runner-contract.test.js`: corrected four migration-156 regex literals to match the adjacent migration-154/155 style. Blob `a381cd497fc199e5fcba6464c842fd5f5fc664d1`, commit `a586d37c347e406b8511436f0aba8044a0812b9e`.
- `backend/test/pin-image-retention-inventory.integration.sql`: derived the old image path from the generated test user UUID and the replay path from the generated project UUID, with URLs built from those unique paths. This prevents cross-test lifecycle collisions. Blob `84f8c6c1ebd3d3c529161019c731d2afbbfe882c`, commit `3d8961c5e68f70c5573e6e8f4d45d2fdae827d39`.

No production SQL, migrations, lifecycle triggers, runner, CI, or historical migration files changed. Detailed evidence and exact source SHAs: `docs/audits/2026-11-17-postgres-test-29-retention-inventory-path-collision-and-migration156-contract-regex.md`.

Assistant fetched and compared tests 28/29, migrations 070/103/108/135/145/154/156, Node contracts and project docs; it re-fetched both changed source files after publication. Assistant did not execute Node, PowerShell, psql, PostgreSQL, Bash or CI. The corrected Node contract and SQL fixture are not runtime-verified. PostgreSQL integration remains **NOT PASSED**: the latest run passed 28/46 and failed test 29; tests 30–46 were not run. The previously reported Parser PASS remains valid for the unchanged runner script, but repeat it with the next gate sequence.

Next owner gates: clean sync; Node contract tests (previously expected 45 total, require all PASS); PowerShell Parser (0 errors); only then guarded SQL runner requiring 147 migrations 010–156, both CI assertions, 46/46 ordered SQL tests and confirmed disposable DB cleanup. Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`; no production/`PIN_TRIAL`, no guard bypass, no credentials in chat. Nine Bash concurrency scripts remain outside this runner.


### 2026-11-17 — PostgreSQL test 34/46: stale credit-ledger expectations

Owner synchronized cleanly to `b8e8073bd81f510f7648ab9c584584a24f9d40cf`. Node contract/migration/replay-chain tests passed **45/45** and the PowerShell Parser passed with **0 syntax errors**. The guarded runner applied the upgrade fixture, **147 migrations 010–156**, and both CI inline assertions. SQL tests **1–33 passed**, including test 29 after its fixture path correction. Test **34/46** (`postgres-integration.sql`) failed: expected adjusted balance 100, got 140. Cleanup succeeded: 0 remaining sessions; disposable database `pinposy_sqlint_fb3cc84d67ee46ab` was dropped and removal confirmed. Tests 35–46 did not run.

Diagnosis: the test starts the user at 10 credits, fulfills three purchases (+100, +25 late success after cancellation, +15 late success after denial), then performs a -10 generic adjustment. The correct balance is 140. The same three purchase fulfillments create three ledger rows and the adjustment creates a fourth; the correct row count is 4, not 2. Both assertions were stale after late-success cases were added. Migration 074's adjustment function behavior is consistent with the observed arithmetic; no production SQL change is justified.

Assistant changed only `backend/test/postgres-integration.sql`: header now names migration chain 010–156; expected adjusted balance is 140; expected ledger rows are 4. Source commit `c8ed7c5747829e1e78ba23fa6a81a36395a6657e`, final blob `0181cd42dbf41947ea1d3cc33cbd852c291870ee`. Detailed incident: `docs/audits/2026-11-17-postgres-test-34-credit-ledger-expectations.md`.

No production migration, application code, credit function, runner, CI or persistent PostgreSQL server changed. Assistant did not run Node, PowerShell, psql, PostgreSQL, Bash or CI. The corrected SQL test is **NOT runtime-verified**. Next: owner syncs latest main; Node gates (all pass), Parser (0 errors), then guarded runner. Require 147 migrations 010–156, two CI assertions, 46/46 ordered SQL tests and confirmed disposable DB cleanup. Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`; do not bypass guards or use production/`PIN_TRIAL`. Nine Bash concurrency scripts remain separate and unverified.


### 2026-11-17 — PostgreSQL test 34 follow-up: generation-reservation fixture must start at 100 credits

Owner synchronized to clean main `0868d0b3f87a45bf1c680c73efd6ca53ccb16eea`. Node contract/migration/replay-chain tests passed **45/45**; PowerShell Parser passed with **0 syntax errors**. The guarded runner applied the fixture, **147 migrations 010–156**, and both CI inline assertions. SQL tests **1–33 passed**; test 34 failed when a second 60-credit reservation unexpectedly succeeded. Disposable database `pinposy_sqlint_9a31f4922b584047` was dropped and removal confirmed; tests 35–46 did not run.

The prior test-34 correction fixed the arithmetic assertions (balance 140 and four ledger rows) but did not update the later reservation fixture, whose explicit comment and subsequent checks assume exactly 100 credits (60 reserved + 40 available). At 140 credits, the second 60-credit reservation is correctly accepted. This is a test-fixture inconsistency; migration 054's reservation behavior is consistent with the available-credit calculation. The prior audit's diagnosis was incomplete because it did not trace the corrected balance into the later reservation scenario.

Changed only `backend/test/postgres-integration.sql`: after verifying 140 credits and four ledger rows, the test now performs an additional -40 debit through `adjust_credits_balance_and_log`, verifies a 100-credit balance and fifth ledger row, and then proceeds with the existing reservation race. This preserves the ledger invariant and keeps later expected balances (90 after generation, 80 after regeneration) consistent. Source commit `1bf861a6116e2a6d487f0df3cca748a69a0daf6b`, blob `1cc9638400d4c1a63960424fab500fbd94335e5b`. Detailed audit: `docs/audits/2026-11-17-postgres-test-34-generation-reservation-fixture-balance.md`.

Assistant fetched current SQL and documentation from GitHub, traced the credit arithmetic and reservation assumptions, changed only the SQL test fixture, created the audit, and is recording the owner evidence and next gates. Assistant did not execute Node, PowerShell, psql, PostgreSQL, Bash, or CI. The source correction is **NOT RUNTIME-VERIFIED**. Latest owner evidence remains Node 45/45, Parser 0 errors, SQL tests 1–33 PASS / test 34 FAIL; tests 35–46 not run. Next owner gates: synchronize latest main; Node 45/45; Parser 0 errors; then guarded runner requiring 147 migrations 010–156, two inline assertions, 46/46 SQL tests and confirmed disposable DB cleanup. Preserve PID 15220, port 55439, and `X:\\PinPosy-verify-pg18`; do not bypass guards or use production/`PIN_TRIAL`. Nine Bash concurrency scripts remain separate and unverified.


### 2026-11-17 — PostgreSQL test 34 follow-up: unknown provider outcome requires a durable image-task fixture

Owner synchronized to clean main `0c413265da7c6b09c0ed6fd58d68ed8e299a5a8b`. Node contract/migration/replay-chain tests passed **45/45**; PowerShell Parser passed with **0 syntax errors**. The guarded runner applied the upgrade fixture, **147 migrations 010–156**, and both CI inline assertions. SQL tests **1–33 passed**; test **34/46** (`postgres-integration.sql`) failed at `unknown provider outcome must retain its credit reservation`. Disposable database `pinposy_sqlint_9f82b9c7dc774317` was cleaned up and dropped; tests 35–46 did not run.

Diagnosis: migration 088 intentionally releases a generation-credit reservation when a request becomes `unknown` but has no durable `pin_generation_tasks` row. The task journal is persisted before the first image-provider call; absence of a task means no image task could have been submitted, so retaining its image-credit reservation would be incorrect. The failing test manually created a request and reservation but omitted the task row, while asserting the behavior for an ambiguous outcome after provider submission. The existing `pin-generation-credit-reservations.integration.sql` demonstrates the correct ambiguous-provider fixture by inserting a task with status `submitting` first. This was a test-fixture mismatch, not a production regression.

Assistant changed only `backend/test/postgres-integration.sql`: before setting `reservation-test-key-0002` to `unknown`, it now inserts a linked `pin_generation_tasks` row with task index 1 and status `submitting`. This models a possibly billable provider task and makes the migration-088 retention branch the intended one. No production SQL, migration, application code, runner, or CI changed. Source commit `3d1e7827faf703ecfb86bff67a626ecf6a264321`, final blob `32d82afb8a9bff3b86b096638465aa4dae70656a`. Detailed audit: `docs/audits/2026-11-17-postgres-test-34-unknown-provider-reservation-task-fixture.md`.

Assistant fetched current test and migrations 045, 054, 066, 074, 088 and 150; compared the fixture with the existing reservation integration test; published the test-only correction and audit; and is updating this state, owner actions and documentation register. Assistant did not execute Node, PowerShell, psql, PostgreSQL, Bash or CI. The correction is **NOT RUNTIME-VERIFIED**. Latest owner evidence remains Node 45/45 PASS, Parser 0 syntax errors, SQL tests 1–33 PASS / test 34 FAIL before this correction; tests 35–46 did not run.

Next owner gates: clean sync; Node contract tests (45 expected, all PASS); PowerShell Parser (0 errors); then guarded runner requiring fixture application, 147 migrations 010–156, two CI assertions, 46/46 SQL tests and confirmed disposable DB cleanup. Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`; do not bypass guards or use production/`PIN_TRIAL`. Nine Bash concurrency scripts remain separate and unverified.

### 2026-11-17 — PostgreSQL test 34/46: generation completion reservation contract

Owner evidence from clean local main `a256df3a8dc45be9e082a18fb3f1374341e4eb3c`: Node contract/migration/replay-chain tests **45/45 PASS**; PowerShell Parser **0 syntax errors**. The guarded runner applied the fixture, **147 migrations 010–156**, and both CI inline assertions. SQL tests **1–33 passed**; test **34/46** (`postgres-integration.sql`) failed at `complete_pin_generation_request()` with `generation credit reservation is missing`. Disposable database `pinposy_sqlint_e7bae68c80ff4f2a` was terminated/dropped and removal confirmed; tests 35–46 did not run.

Diagnosis: migration 054 requires a matching active row in `pin_generation_credit_reservations` before generation completion. `begin_pin_generation_request()` only creates/claims the idempotency request; it does not reserve credits. The test's idempotency path still called begin → complete directly, using a pre-reservation contract. In addition, the previous unknown-provider reservation fixture intentionally retained 60 credits after its debit-fencing assertion; it needed to be reconciled/released before the later independent generation-reservation scenario.

Changed only `backend/test/postgres-integration.sql`:
- Reserve 5 credits after beginning `ci-generation-key-0001`, before completion.
- Keep the unknown-provider reservation active through the competing 45-credit debit rejection. Only after that assertion, transition the fixture request to definitive `failed` and assert the existing status trigger releases the reservation.
- Rework the 76-credit retry case to test insufficient funds at reservation time (balance 75), assert no reservation/pin/charge and request remains processing, then add one credit, reserve 76, and complete exactly once.

No production SQL, migration, backend application code, runner, CI, or persistent PostgreSQL data changed. Source final blob `dbdf95829a54cc160d0764f76075d2c92137d5d0`, final source commit `b709f258ce17716f2bbb0eabcb18880bbbaa3678`. An initial source commit `c7a3097b43b0c3a426c683800bfadef1d0dad9a0` placed the release before the competing-debit assertion; source was re-read, the ordering issue caught before requesting a rerun, and corrected in the final commit. Detailed audit: `docs/audits/2026-11-17-postgres-test-34-generation-completion-reservation-fixture.md`.

Assistant fetched current source/docs and relevant migrations; traced the runtime error to migration 054's contract; reviewed credit arithmetic and scenario ordering; published the fixture correction and its ordering follow-up; created the detailed audit; and is updating the project state, owner instructions, and documentation register. Assistant did not execute Node, PowerShell, psql, PostgreSQL, Bash, or CI. The final fixture is **NOT RUNTIME-VERIFIED**. Latest owner evidence remains Node 45/45 PASS, Parser 0 errors, SQL tests 1–33 PASS / test 34 FAIL before this correction; tests 35–46 did not run.

Next owner gates: synchronize cleanly to latest main; Node contract tests **45/45**; PowerShell Parser **0 errors**; then guarded runner requiring fixture application, 147 migrations 010–156, two inline assertions, **46/46 SQL tests**, and confirmed disposable DB cleanup. Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`; do not bypass guards or use production/`PIN_TRIAL`; do not share secrets. Nine Bash concurrency scripts remain separate and unverified.


### 2026-11-17 — PostgreSQL test 34: Pinterest publication requires approved fixture pins

Owner synchronized cleanly to `60251392b65f4a44941c0b1f24950e72b6cf23e6`. Node contract/migration/replay-chain tests passed **45/45**; PowerShell Parser passed with **0 syntax errors**. Guarded PostgreSQL runner applied the upgrade fixture, **147 migrations 010–156**, and both CI inline assertions. SQL tests **1–33 passed**. Test **34/46** failed at `first Pinterest publish reservation must start`. Cleanup succeeded: disposable database `pinposy_sqlint_164fb8a1f4684d95` was terminated/dropped and removal confirmed; tests 35–46 did not run.

Diagnosis: migration 148 requires `begin_pinterest_publish_v2()` to see a pin in `approved` status and returns `pin_not_approved` otherwise; the same migration rejects schedule creation for a non-approved pin. The canonical baseline and migration 012 show generated pins are initially `pending`. Test 34 attempted publication of the generated pin and two additional fixture pins while they were still pending; its schedule lifecycle fixture also attempted scheduling a pending pin. The test no longer represented the approval gate introduced by migration 148.

Assistant fetched the current project state, owner actions, documentation register, test source, canonical baseline, migration 012, and migrations 148–149 from GitHub; traced the generated pin and all publication/scheduling fixture pins; and changed only `backend/test/postgres-integration.sql`: explicitly approve the generated `v_pin` before publication/scheduling, and create the uncertain, late-success, and schedule-lifecycle pins as `approved`. The four targeted source replacements each matched exactly once. No production SQL, migration, app code, runner, CI, or persistent database changed.

Source blob: `fce98ac3665f92b6126d2164439295d7c29c0e31`; source commit: `29b393ece2738f94b5ecb9ac5a74663f8581d66e`. Detailed incident: `docs/audits/2026-11-17-postgres-test-34-pinterest-publication-approval-fixture.md`.

The corrected fixture is **NOT RUNTIME-VERIFIED**. The 45/45 Node and 0-error Parser evidence predates this source change and must be repeated. Assistant did not run Node, PowerShell, psql, PostgreSQL, Bash or CI. Next owner gates: sync latest main; Node contract tests 45/45; PowerShell Parser 0 errors; guarded runner requiring 147 migrations 010–156, two inline assertions, 46/46 SQL tests and confirmed disposable DB cleanup. Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`; do not bypass guards or use production/`PIN_TRIAL`. Nine Bash concurrency scripts remain separate and unverified.


### 2026-11-17 — Подтверждена синхронизация после исправления approval fixture (test 34)

Владелец выполнил локально из `X:\\!PROGECT\\pinboard-ai`:
- Перед pull `git status --short` был пуст.
- `git pull --ff-only origin main` завершился fast-forward с `60251392` на `ff1ea965`; получены test fixture и четыре документационных изменения.
- `git rev-parse HEAD` и `git rev-parse origin/main` оба вернули полный SHA `ff1ea965d644008d7fcd1160516042b288a4690a`.
- Финальный `git status --short` пуст.

Это подтверждает, что локальная рабочая копия чистая и синхронизирована с GitHub main на коммите `ff1ea965d644008d7fcd1160516042b288a4690a`. Это только подтверждение синхронизации, не тестовый результат: после approval-fixture исправления Node suite, PowerShell Parser и PostgreSQL runner ещё не запускались/не представлены. Следующий порядок: Node contract/migration/replay-chain gate (45/45), затем PowerShell Parser (0 ошибок), и только после обоих PASS — guarded PostgreSQL runner (147 migrations 010–156, 2 CI assertions, 46/46 SQL tests, cleanup disposable DB). Девять Bash concurrency scripts остаются отдельным непроверенным этапом.

Ассистент проверил актуальные GitHub-документы и SQL fixture перед фиксацией полученного evidence; не запускал локальные команды и не менял тесты/миграции/приложение. Подробная запись синхронизации и оставшихся gates добавлена в audit test 34 и UA-033.


### 2026-11-17 — PostgreSQL test 34 approval fixture: Node и PowerShell gates повторно пройдены

Владелец подтвердил локальную синхронизацию с документационным commit `948df3b9c9590fd78e6beb1690dcd3785e91d54f`: `git pull --ff-only origin main` прошёл fast-forward с `ff1ea965` на `948df3b9`; рабочее дерево чистое.

После изменения approval fixture (source commit `29b393ece2738f94b5ecb9ac5a74663f8581d66e`, blob `fce98ac3665f92b6126d2164439295d7c29c0e31)) владелец повторно выполнил:
- `node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js`: **45 tests, 45 pass, 0 fail, 0 skipped**.
- PowerShell Parser для `scripts/verify-integration.ps1`: **0 syntax errors**.

Оба предварительных gates после последнего SQL fixture изменения подтверждены. Это не доказывает успешность PostgreSQL runtime integration: guarded runner ещё не запускался после исправления. Следующий шаг — владелец запускает `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1` только с сохранением ограничений UA-033: ожидаются upgrade fixture, 147 migrations 010–156, две CI inline assertions, 46/46 SQL tests и подтверждённый cleanup disposable DB; остановиться на первой ошибке. Сохранить PostgreSQL listener PID 15220, port 55439 и data directory `X:\\PinPosy-verify-pg18`; не обходить guards, не использовать production/`PIN_TRIAL`, не передавать секреты. Девять Bash concurrency scripts остаются отдельным непроверенным этапом.

Ассистент повторно сверил с GitHub текущие project state, audit, owner actions, documentation register, SQL fixture и runner. Ассистент не запускал локальные Node/PowerShell/psql/PostgreSQL/Bash/CI; приведённые PASS — evidence из вывода владельца. В этом follow-up не менялись SQL fixture, migrations, production code, runner или CI. Подробный audit и UA-033 обновлены; register содержит точные blob SHA.


### 2026-11-17 — PostgreSQL integration test 34: billing webhook audit privileges

Владелец синхронизировал локальный `main` с GitHub fast-forward: `948df3b9..1b855857`; `git status --short` пуст; проверяемый code HEAD: `1b855857c4df31b9233819e404bd697591f28acb`.

По предоставленному полному выводу `scripts/verify-integration.ps1`:
- runner подтвердил clean main checkout на указанном SHA и локальный disposable PostgreSQL 18.6 (PID 15220, `127.0.0.1:55439`, data directory `X:\\PinPosy-verify-pg18`);
- создана временная БД `pinposy_sqlint_9f1cf3d0c7f74745`, применены upgrade fixture и **147 migrations 010–156**;
- обе CI inline assertions прошли;
- SQL integration tests 1–33 прошли; test 34/46 остановил suite с `billing webhook audit table privileges are too broad or insufficient` в `backend/test/postgres-integration.sql:965` (PL/pgSQL assertion line 940);
- tests 35–46 не запускались;
- runner подтвердил завершение соединений и удаление только disposable DB.

**Итог: SQL integration FAIL.** Нельзя помечать PostgreSQL suite завершённым. Ошибка пока не диагностирована: focused `billing-webhook-audit-privileges.integration.sql` ранее в этом же запуске завершился без ошибки, но это не доказывает ошибочность общей проверки. Необходимо сопоставить assertion 940–965, active table migration/security/grants и focused test. Нельзя ослаблять grants или обходить assertion без доказанной причины.

Создан отдельный отчёт: `docs/audits/2026-11-17-postgres-test-34-billing-webhook-audit-privileges.md`. Следующий шаг ассистента — read-only исследование указанного assertion, миграции, privilege test и актуальных docs на main; затем минимальное обоснованное исправление и документирование до повторного запуска. Девять Bash concurrency scripts остаются отдельным непроверенным этапом.

Ассистент в этой сессии прочитал приложенный лог, повторно получил актуальные `PROJECT_STATE`, `DOCUMENTATION_REGISTER`, `USER_ACTIONS` и создал incident report. Локальные Node/PowerShell/psql/PostgreSQL/Bash/CI команды не запускались; production, `PIN_TRIAL` и постоянная БД не затрагивались. Root cause не установлен, код и миграции не изменялись. Полный transcript — источник evidence; детали, которых в нём нет, не реконструируются.


### 2026-11-17 — PostgreSQL test 34: устранено противоречие в privilege assertion

После записи первоначального инцидента ассистент прочитал:
- `backend/test/postgres-integration.sql`, assertion around lines 940–965;
- `backend/test/billing-webhook-audit-privileges.integration.sql`;
- `db/migrations/029_billing_webhook_exceptions.sql`;
- `db/migrations/042_allow_admin_audit_reads.sql`.

**Установленная причина:** migration 029 grants `INSERT` для `service_role`; migration 042 явно grants `SELECT` той же серверной роли для защищённого backend admin read path. Специализированный тест требует SELECT+INSERT и запрещает UPDATE/DELETE для `service_role`, а все четыре операции запрещены для `anon` и `authenticated`. Inline assertion в общем test 34 ошибочно запрещал `service_role SELECT`, противореча migration 042 и focused test. Это объясняет падение, не требуя изменения production grants.

**Изменение:** только `backend/test/postgres-integration.sql`. Inline assertion теперь проверяет полную матрицу: клиентским ролям запрещены SELECT/INSERT/UPDATE/DELETE; `service_role` обязан иметь SELECT и INSERT, но не UPDATE/DELETE. Перед записью старый блок проверен на точное единственное совпадение. Production SQL, migrations, app code, runner, CI и базы данных не изменялись.

Source commit: `5cf3b1c2b589ba73205e823ec30f28b9193a1c60`; source blob: `405ebc7b556ea051525513439b37582d7904d2e6`. Подробный разбор: `docs/audits/2026-11-17-postgres-test-34-billing-webhook-audit-privilege-assertion-fix.md`; исходный run evidence: `docs/audits/2026-11-17-postgres-test-34-billing-webhook-audit-privileges.md`.

**Проверка:** GitHub подтвердил публикацию source commit. Ассистент не запускал Node, PowerShell Parser, psql, PostgreSQL, Bash или CI. Исправление **NOT RUNTIME-VERIFIED**; первоначальный run остаётся FAIL, tests 35–46 не запускались. Следующий шаг владельца — синхронизировать latest main, повторить Node 45/45 и PowerShell Parser 0 errors, затем guarded runner; требование — 46/46 SQL tests и подтверждённая очистка disposable DB. Девять Bash concurrency scripts остаются отдельным gate.


### 2026-11-17 — UA-034: owner confirmed clean synchronization to privilege-assertion fix

Owner-provided PowerShell transcript confirms:
- pre-pull `git status --short` was empty;
- `git pull --ff-only origin main` completed as a fast-forward from `1b855857` to `3e186f14`, adding the SQL assertion correction and five documentation/audit files (six files total);
- `git rev-parse HEAD` and `git rev-parse origin/main` both returned `3e186f149bbda21235c1389ca5ce16de7619cd61`;
- post-pull `git status --short` was empty.

This confirms the owner working copy is clean and synchronized to the documented source fix. It does **not** verify the Node contracts, PowerShell parser, or PostgreSQL integration. The previous SQL run remains FAIL at test 34/46; tests 35–46 have not been shown to pass. Next action: run only the Node contract gate in UA-034, inspect its complete output, then proceed to the PowerShell Parser gate only if Node reports 45/45 pass, 0 failures and 0 skipped. Do not start the guarded PostgreSQL runner until both preflight gates pass. No database, production resource, or source file was changed by this owner synchronization.


### 2026-11-17 — UA-034: owner sync and Node contract gate PASS

Owner-provided PowerShell transcript confirms:
- `git pull --ff-only origin main` fast-forwarded `3e186f14..45fb5f30`;
- pre/post `git status --short` were empty;
- local `HEAD` and `origin/main` both equal `45fb5f300b1cd334ad8128a76f5d694f52389861`;
- the three requested Node test files ran successfully;
- TAP summary: **45 tests, 45 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo** (duration 108.1713 ms).

This verifies the Node contract/migration/replay-chain gate against the synchronized source. It does not verify PowerShell syntax or execute PostgreSQL integration. Next: run the PowerShell Parser gate from UA-034; only if it reports exactly 0 syntax errors may the owner run the guarded PostgreSQL integration command. The earlier PostgreSQL result remains FAIL at test 34/46 until a new guarded run proves 46/46 and confirms disposable database cleanup. Tests 35–46 have not yet been demonstrated passing after the assertion fix. No database or production resource was touched by the Node command.


## 2026-11-17 — PowerShell Parser preflight PASS

Owner transcript after pulling documentation through `097765bd924cb938103ac4ec779b17af23eacf2c`: `git status --short` was empty; local `HEAD` and `origin/main` both equal `097765bd924cb938103ac4ec779b17af23eacf2c`. The owner ran `[System.Management.Automation.Language.Parser]::ParseFile` against `scripts/verify-integration.ps1`; `$errors.Count` was not greater than zero and the exact terminal result was `PowerShell Parser PASS: 0 syntax errors`.

The two preflight gates are now confirmed: Node suite **45/45 pass** (documented above) and PowerShell Parser **0 syntax errors**. This authorizes the owner to proceed to the guarded PostgreSQL integration command in UA-034. It does not itself prove PostgreSQL runtime success. The earlier SQL integration run remains failed at test 34/46; the assertion correction remains NOT RUNTIME-VERIFIED until a fresh run demonstrates all 46/46 tests and confirms disposable database cleanup. No PostgreSQL command was run as part of this Parser check, and no production/PIN_TRIAL resource was touched.


### 2026-11-17 — PostgreSQL runner stopped by repository synchronization guard

Owner ran `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1`. The runner fetched `origin/main`, observed local HEAD `097765bd924cb938103ac4ec779b17af23eacf2c` versus remote `30e1ac9f9e5eaf5e79496c1ceda5b7e42a55749d`, and stopped with `Safety stop: local main ... is not synchronized with origin/main ...`.

Assistant compared the two GitHub refs: remote is ahead by exactly four commits, behind by zero. All four commits are documentation-only: `956121e2` updates `PROJECT_STATE.md`; `d507bb3a` updates `USER_ACTIONS.md`; `b47e2d6b` updates the billing privilege audit; `30e1ac9f` updates `DOCUMENTATION_REGISTER.md`. No application code, migrations, SQL tests, runner or CI files changed in those commits.

Assistant inspected `scripts/verify-integration.ps1`: `Assert-RepositoryState` runs first and throws on the HEAD/origin mismatch before psql existence checks, PostgreSQL listener validation, password prompt, any database connection, role creation, disposable DB creation, migrations or SQL tests. Therefore this attempt is a **synchronization safety stop**, not a PostgreSQL test failure; no SQL tests ran and no disposable DB was created. The previous SQL runtime evidence remains the historical FAIL at test 34/46; the assertion fix remains NOT RUNTIME-VERIFIED.

**Next owner action:** fast-forward local main to latest origin/main with `git pull --ff-only origin main`; verify clean worktree and `HEAD == origin/main`; then follow UA-034's ordered Node, Parser and guarded PostgreSQL gates. Do not reset/rebase/clean, bypass guards or run SQL manually. Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`; do not use production/`PIN_TRIAL` or disclose secrets.

Detailed evidence, exact four commit SHAs, runner control-flow analysis and limitations: `docs/audits/2026-11-17-postgres-runner-sync-guard-stop.md`. Assistant actions in this turn: compared GitHub commits, fetched the three project docs and audit, inspected the runner source, and published this audit plus the state/action/register updates. No local commands, database connections, SQL changes or production operations were performed.


### 2026-11-17 — PostgreSQL runner stopped at empty temporary-role password

Owner evidence after synchronization to `9206d83076c4ea59c0d66be15482bf58d7217226`: pre/post `git status --short` were empty; `git pull --ff-only origin main` fast-forwarded `30e1ac9f..9206d830`; local HEAD and origin/main matched exactly. The three Node contract/migration/replay-chain test files then reported **45/45 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo** (112.0986 ms).

The owner ran the guarded PostgreSQL runner. It verified clean synchronized main and the approved local listener (PID 15220, data directory `X:\\PinPosy-verify-pg18`), then reached the hidden password prompt for temporary role `pinposy_verify_admin`. It stopped with `A non-empty temporary PostgreSQL password is required.`

Assistant re-fetched runner source (blob `483ef0211e23a50ea50d1c80b9d47ce4140c09b3`) and confirmed the empty SecureString check occurs before PGPASSWORD setup and before any psql call. Thus this attempt made no PostgreSQL connection, created no temporary role or disposable database, ran no migrations/inline assertions/SQL tests, and had no disposable DB cleanup to perform. This is an input/precondition stop, not a PostgreSQL authentication error or SQL test result. Do not claim the SQL assertion fix is runtime-verified. Historical SQL run remains FAIL at test 34/46; tests 35–46 remain unverified after the fix.

Next owner action: rerun the same guarded command only when a non-empty password for the approved local temporary verification role is available; enter it only in the hidden prompt and never share it. If the credential is unknown, stop and resolve it locally without weakening guards or targeting production/`PIN_TRIAL`. Preserve PID 15220 and `X:\\PinPosy-verify-pg18`. A valid completion still requires fixture, 147 migrations 010–156, two inline assertions, 46/46 SQL tests and confirmed disposable DB cleanup. Nine Bash concurrency scripts remain separate and unverified.

Detailed evidence and exact stop boundary: `docs/audits/2026-11-17-postgres-runner-empty-temporary-password-stop.md`.

Assistant actions in this follow-up: read the owner transcript; fetched current runner, project state, owner actions, register and prior sync-stop audit from GitHub; inspected password validation and psql/database creation order; created the audit and updated these records. Assistant did not execute local shell/Node/PowerShell/psql/PostgreSQL/Bash/CI, did not access credentials or databases, and did not change application source, migrations, tests, runner or CI.


### 2026-11-17 — PostgreSQL runner stopped at second synchronization guard

Owner reran the guarded runner while local HEAD remained `9206d83076c4ea59c0d66be15482bf58d7217226`. The runner fetched origin/main at `5fa8d042f7e85339565bae9a8f34e8ebe654100d` and stopped with the expected synchronization safety error. This remote advancement was caused by the assistant's immediately preceding documentation-only commits.

Assistant re-fetched current runner and documentation from GitHub. Runner source confirms the synchronization guard fails before psql path validation, PostgreSQL listener validation, password prompt, psql, role/database creation, migrations, inline assertions or SQL tests. Thus this attempt did not validate the listener, request a password, connect to PostgreSQL, create a database, execute SQL, or require cleanup. This is a second sync stop, not a database or test failure.

Next owner action: use the safe fast-forward sequence in UA-034 to synchronize the documentation-only commits, verify clean status and HEAD=origin/main, then rerun the guarded runner. Previously recorded Node 45/45 and PowerShell Parser 0-error gates were run against the same source snapshot; the intervening commits contain documentation only. If code changes are discovered, re-evaluate those gates first. Preserve safeguards and never disclose the temporary-role password. Historical SQL status remains FAIL at test 34/46; assertion fix remains NOT RUNTIME-VERIFIED; nine Bash concurrency scripts remain unverified.

Detailed audit: `docs/audits/2026-11-17-postgres-runner-second-sync-guard-stop.md`.

Assistant actions: read owner transcript; fetched current runner and three docs; inspected synchronization guard ordering; identified that the assistant's previous documentation commits caused the remote SHA advance; created the audit and updated project state, owner actions and register. Assistant did not execute local Git/PowerShell/Node/psql/PostgreSQL/Bash/CI, did not access credentials or database, and did not change source, migrations, tests, runner or CI.


### 2026-11-17 — PostgreSQL integration test 35/46: OAuth stale-session assertion corrected

- Owner fast-forwarded local main from `9206d830` to `68d32f33`; `HEAD = origin/main = 68d32f33a6760b27577cbe15716f0c61c97984ef`; pre/post `git status --short` were empty.
- Guarded runner verified clean synchronized main, approved PostgreSQL listener PID 15220 / `X:\\PinPosy-verify-pg18`, and server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`. The owner entered the temporary role password only at the hidden local prompt; no credential was shared.
- Disposable DB `pinposy_sqlint_66dec8d3e0aa48e4`: upgrade fixture PASS; all **147 migrations 010–156 PASS**; both inline assertions PASS; SQL tests **1–34/46 PASS**.
- Test **35/46** `pinterest-oauth.integration.sql` failed at line 191: `stale OAuth callback left active credentials after token-version change`. Tests 36–46 did not run. Cleanup confirmed: runner terminated remaining sessions, dropped only the disposable database and printed `Removed disposable database pinposy_sqlint_66dec8d3e0aa48e4`. Overall SQL integration remains **NOT PASSED**.
- Source investigation: the SQL test had already reconnected a Pinterest account successfully, leaving its credentials active. It then incremented `users.token_version` and correctly exercised the stale-session branch in migration 032. That branch returns `{ok:false, reason:'stale_session'}` before modifying Pinterest account rows. The test's subsequent requirement that the user's total active Pinterest credential count be zero contradicted its own successful reconnect. This is a test assertion defect; no production OAuth defect was established.
- Corrected only `backend/test/pinterest-oauth.integration.sql`: assert the `stale_session` rejection, preservation of the existing reconnected account and credentials, and absence of an account created by the old-session callback. Commit `4e9434c8eaa72a8ff4053521716b144b2b947396`, blob `440812c1c1c341036d78db39973333cebc1f5b6f`.
- Added a Node source-contract assertion for these semantics and against reintroducing the invalid global-zero check. Commit `5b7c354f532e5a5d896edd9ca32934368b24b670`, blob `7abd35fbe62c6db075041fbba3bd76b465057b90`. The combined three-file Node gate previously contained 45 tests; expected count is now 46 by source change. It has NOT been executed after the edit.
- Created audit `docs/audits/2026-11-17-postgres-integration-test-35-pinterest-oauth-stale-session-assertion.md`, commit `e867691edd92a94a1f33735eecd51740a73de3b4`.
- Assistant actions: read the complete owner transcript; fetched the current project documents, runner, failing SQL test, OAuth migrations 028/032, token-version migrations 023/055 and Node contract test; traced the stale-session branch and compared it with the test's prior reconnect; changed only the SQL test and Node contract; created the incident audit and updated the project journal, owner action log and documentation register. Assistant did not execute local Node, PowerShell, psql, PostgreSQL, Bash or CI; did not access credentials or databases; did not modify production code, migrations, fixture, runner or CI.
- **Current runtime status:** fixture PASS; migrations 010–156 PASS; two inline assertions PASS; SQL tests 1–34 PASS; test 35 FAIL; tests 36–46 NOT RUN; disposable DB cleanup PASS. The SQL test correction and new Node contract assertion are **NOT RUNTIME-VERIFIED**. Earlier Node 45/45 and PowerShell Parser 0-error results predate the new Node assertion; runner source is unchanged.
- **Next owner gate:** synchronize after this documentation batch, then run the three-file Node command in UA-034 and require **46/46 PASS**. Only after Node PASS rerun the guarded PostgreSQL runner. SQL integration PASS requires all 46/46 tests and confirmed disposable DB cleanup. Nine Bash concurrency scripts remain a separate unverified gate. Preserve PID 15220 / port 55439 / `X:\\PinPosy-verify-pg18`; never touch production/`PIN_TRIAL` or disclose credentials.
- Дополнительная запись о действиях ассистента: первая попытка подготовить GitHub edits завершилась JavaScript `SyntaxError`, потому что literal SQL block был передан в `String.match` как регулярное выражение. Ошибка произошла до GitHub write calls и не изменила репозиторий; повторная попытка использовала literal `indexOf` и exact-single-occurrence guard. Деталь внесена в incident audit.

### 2026-11-17 — PostgreSQL integration test 38/46: legacy publication-history fixture corrected

Owner-provided guarded runner transcript after the previous synchronization and Node gate:
- Runner verified clean synchronized `main` at `62b2a859c8516fe98b174072d3642018d2dff419`.
- PostgreSQL identity: listener PID 15220; data directory `X:\\PinPosy-verify-pg18`; `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`. Password was entered locally at the hidden prompt and was not shared.
- Disposable DB `pinposy_sqlint_eb01275b9a8246a4`: upgrade fixture PASS; 147 migrations 010–156 PASS; both inline assertions PASS; SQL tests 1–37 PASS.
- Test 35 `pinterest-oauth.integration.sql` passed after its earlier test-only correction. Test 38 `pinterest-account-publication.integration.sql` failed at line 895 with `unmapped legacy publication history was allowed to retry: {"status": "pin_not_approved"}`. Tests 39–46 were NOT RUN.
- Cleanup PASS: no remaining sessions reported, `DROP DATABASE` completed, and explicit removal of the disposable database was confirmed. Overall SQL integration remains NOT PASSED.
- The owner had separately run the three-file Node gate against the prior snapshot: 46/46 PASS. That result predates the new test-38 Node source-contract assertion and must not be represented as verification of the new assertion.

Source diagnosis:
- The test's legacy fixture inserted `v_legacy_pin` with status `pending`, then called `begin_pinterest_publish_v2` and expected the unmapped legacy-history branch to return `unknown`.
- Active function definition in migration 148 checks the pin's status first and returns `pin_not_approved` before inspecting legacy history. Migrations 149–156 were inspected; none redefines this function.
- Therefore the observed response is the expected early guard, not evidence that publication retry was permitted. The test did not reach the behavior it intended to assert.
- Corrected only the SQL test fixture: changed the legacy pin to `approved` and clarified the failure message. Commit `49ffed74ec6b16d2f875a99b0f300445d860592c`, blob `5179ca814d7cbe84a45569d3ae8494de959ae43d`.
- Added a Node source-contract test to ensure the fixture remains approved and reaches the later legacy-history guard. Commit `2b2b14407cb7cfba68375d19aba298a015a4d2a8`, blob `818a136572644af87ec6b2cfb08dcba909df6430`.
- No production application code, migration, CI workflow, fixture schema, runner, live DB or production resource was changed.

Assistant actions: read the complete owner transcript; re-fetched the current project docs and test sources from GitHub; reviewed migration 148 and migrations 149–156; traced the function's guard order; changed the SQL test and Node source-contract test; created `docs/audits/2026-11-17-postgres-integration-test-38-pinterest-legacy-history-fixture.md`; updated this journal, UA-034 and the documentation register. The assistant did not execute local Node, PowerShell, psql, PostgreSQL, Bash or CI, and did not access credentials or databases.

Verification boundary:
- Owner evidence: Node 46/46 PASS on the pre-correction source snapshot; fixture PASS; migrations 010–156 PASS; inline assertions 2/2 PASS; SQL tests 1–37 PASS; SQL test 38 FAIL; tests 39–46 NOT RUN; disposable DB cleanup PASS.
- The new SQL fixture correction and Node contract assertion are NOT RUNTIME-VERIFIED. Expected Node gate count is now 47/47; rerun it after synchronization.
- Next: owner synchronizes latest main and runs the three-file Node gate; require 47/47 PASS before another guarded PostgreSQL run. Full SQL PASS still requires all 46/46 SQL tests and confirmed cleanup. Nine Bash concurrency scripts remain a separate unverified gate.

### 2026-11-17 — Owner Node preflight after test-38 fixture correction

Owner synchronized local `main` from `62b2a859c8516fe98b174072d3642018d2dff419` to `d266f57da57f8219e5e1f42616111b32ad76d748` using fast-forward. The owner provided evidence that:
- `git status --short` was empty before and after synchronization.
- `HEAD` and `origin/main` both equalled `d266f57da57f8219e5e1f42616111b32ad76d748`.
- The three-file Node preflight command completed with **47 tests, 47 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo** (112.4228 ms).
- The new contract test, “legacy Pinterest publication fixture reaches the unmapped-history fence with an approved pin”, passed.
- This is owner-reported local Node evidence. It does not execute SQL, the PowerShell runner, PostgreSQL integration tests, Bash concurrency tests or CI.

Next gate: synchronize the documentation-only commit(s) that record this result, confirm clean `main` and matching HEAD/origin, then run the guarded `scripts/verify-integration.ps1` command. Stop at the first SQL error and preserve full output/cleanup evidence. SQL suite still has not passed: previous run stopped at test 38/46; tests 39–46 were not run. The corrected test-38 SQL fixture remains unverified at runtime until this next guarded run. Do not claim 46/46 SQL PASS from the 47/47 Node result.


### 2026-11-17 — Owner PostgreSQL rerun: test 38 reached primary publication fixture; follow-up test-only correction

Owner-provided local evidence:
- Owner fast-forwarded clean main from d266f57da57f8219e5e1f42616111b32ad76d748 to ce3bcc98ec09d6acfff726b7bd71265c70832791. HEAD and origin/main matched; status was clean.
- Guarded runner verified listener PID 15220, X:\PinPosy-verify-pg18, and server identity 127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006. Password was entered locally at the hidden prompt and was not shared.
- Disposable DB pinposy_sqlint_bd50f191982f4df6: upgrade fixture PASS; 147 migrations 010–156 PASS; 2 inline assertions PASS; SQL tests 1–37 PASS.
- Test 38/46 pinterest-account-publication.integration.sql failed at line 895: first account publication did not start: {"status": "pin_not_approved"}. Tests 39–46 NOT RUN.
- Cleanup PASS: zero remaining sessions reported, disposable DB dropped, and removal explicitly confirmed. Overall SQL integration remains NOT PASSED.

Source diagnosis:
- The prior correction approved v_legacy_pin, allowing the intended legacy-history check to be reached.
- A separate primary fixture v_pin, created at SQL test lines 112–114 and first published at line 202, still had status pending.
- Migration 148's begin_pinterest_publish_v2 correctly returns pin_not_approved before history checks when the pin is not approved. The test expected started, so the primary fixture also must be approved.
- This is a test fixture defect, not evidence of a production publication defect. Production approval enforcement must remain unchanged.

Assistant changes published:
- backend/test/pinterest-account-publication.integration.sql: primary multi-account v_pin fixture changed from pending to approved. Commit 2b9b6a266c37b22086678acb994c09ce56af5b82; blob 5b1f9f98662c9f2903b4edb983bb3b34f0aa3b09.
- backend/test/postgres-integration-runner-contract.test.js: existing contract test strengthened and renamed to assert both primary multi-account and legacy-history fixture pins are approved, and migration 148's approval guard precedes the legacy-history fence. No new test case was added; expected suite count remains 47. Commit a1b5cbccf74c0a85dcf7c7d22de00d47e84fa3e2; blob 1ee73760a8bbeeaa42152b61f2139c371c8d677f.
- No production application code, migration, runner, CI workflow, live DB or production resource changed.

Assistant action log: read owner transcript; fetched current SQL/Node tests, migration 148 and project docs; traced primary and legacy fixture control flow; changed only the two test files; updated incident audit. One initial documentation-wrapper attempt ended in JavaScript SyntaxError before any GitHub write and made no repository change; the audit records this no-write attempt. Assistant did not execute local Node, PowerShell, psql, PostgreSQL, Bash or CI and did not access credentials/databases.

Current verification boundary:
- Owner runtime evidence: tests 1–37 PASS, test 38 FAIL, tests 39–46 NOT RUN; 147 migrations and both inline assertions PASS; disposable DB cleanup PASS.
- The new primary fixture correction and strengthened Node contract are NOT RUNTIME-VERIFIED.
- Prior Node 47/47 PASS predates the strengthened assertion. Since the existing test was extended rather than adding another case, expected count is still 47; owner must rerun the three-file Node gate after syncing the complete documentation batch and require 47/47 PASS before another guarded PostgreSQL run.
- SQL integration PASS requires all 46/46 SQL tests and cleanup. Nine Bash concurrency scripts remain a separate unverified gate.

Detailed record: docs/audits/2026-11-17-postgres-integration-test-38-pinterest-legacy-history-fixture.md.


Documentation authoring chronology note: two assistant-side JavaScript wrapper SyntaxErrors occurred while preparing documentation updates for this incident (one audit payload, then one combined state/owner-action payload). Both happened before any GitHub write from the respective failed attempt and caused no repository change; both were retried successfully. Full details are in the incident audit. These were not project source/test failures.


### 2026-11-17 — Owner PostgreSQL rerun: migration 148 schedule-insert guard exposed nine pending test fixtures

Owner-provided local evidence:
- Local `main` fast-forwarded cleanly from `ce3bcc98ec09d6acfff726b7bd71265c70832791` to `2bc539c7ce8d8f801ef1149f51dc18c9cd67137e`; `HEAD == origin/main`; worktree clean.
- Owner ran the three-file Node preflight: **47/47 PASS**, 0 failures, 0 skipped, duration 113.104 ms. This run predates the source-contract extension described below.
- Guarded runner verified PostgreSQL listener PID 15220, port 55439, data directory `X:\PinPosy-verify-pg18`, identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Disposable DB `pinposy_sqlint_826d2469ae4649c6`: upgrade fixture PASS; migrations 010–156 (147/147) PASS; inline assertions 2/2 PASS; SQL tests 1–37 PASS.
- Test 38/46 failed on insertion of the schedule for `v_inflight_pin`: trigger `guard_pin_schedule_insert_requires_approved_pin()` raised `only approved pins can be scheduled`. Tests 39–46 NOT RUN.
- Cleanup PASS: zero remaining sessions reported, disposable DB dropped, and explicit removal confirmed. SQL integration remains NOT PASSED.
- The owner also accidentally entered the printed SHA as a PowerShell command; it returned CommandNotFoundException and did not alter repository state.

Diagnosis:
- Migration 148 adds a BEFORE INSERT trigger to `public.pin_schedules` which locks the source pin and requires status `approved`.
- The reported statement was the in-flight schedule insert. Its fixture `v_inflight_pin` was still pending.
- A full audit of the SQL test's pin and schedule insertions found nine scheduled-work fixtures still pending: `v_inflight_pin`, `v_crash_pin`, `v_safe_crash_pin`, `v_unsafe_crash_pin`, `v_retry_pin`, `v_manual_retry_pin`, `v_attempt_retry_pin`, `v_safe_retry_pin` and `v_disconnect_race_pin`.
- These are already-schedulable scenario fixtures; all nine must be approved before schedule insertion. This is test fixture alignment with the existing production invariant, not a production defect. Do not weaken migration 148.

Assistant source changes published:
- `backend/test/pinterest-account-publication.integration.sql`: changed the nine schedule-bound fixture statuses from pending to approved. Commit `563648df9d1c9c24674dbac1bd01f9b532ff865f`; blob `a447055478216e3f2cc7333dcf95af4bec2c2632`.
- `backend/test/postgres-integration-runner-contract.test.js`: extended the existing test (no new test case) to assert all nine fixtures are approved and that migration 148 defines/attaches the BEFORE INSERT schedule guard. Commit `0fd17599f4598559872965f07d5b01d2fadb19e2`; blob `61f20c281dd5448f295126ab42da3f9716d5d9fc`.
- Detailed incident record: `docs/audits/2026-11-17-postgres-integration-test-38-pinterest-legacy-history-fixture.md`, latest blob `dbf503101a8d047df7041688173828e9dbffe77e`, audit update commit `b2f4823ed1e194708ec4714d302e4d27c60d0903`.
- No production code, migration, runner, CI workflow, upgrade fixture, local DB or production resource was changed.

Assistant action chronology:
1. Parsed owner synchronization, Node and guarded-runner transcripts, including exact SHAs, test counts, database identity, first fatal SQL statement, unrun tests and cleanup.
2. Re-fetched current source and documentation from GitHub; inspected migration 148's schedule trigger and all schedule-bound pin fixtures.
3. A first exact-substring preparation attempt used an incomplete fixture substring and failed its pre-write occurrence check. No GitHub write occurred; a retry using unique exact suffixes succeeded.
4. Updated the SQL fixture and existing Node source-contract test, then updated the incident audit. No local commands or database access were performed by the assistant.

Verification boundary and next step:
- The owner's 47/47 Node result is from the source snapshot before the nine-fixture contract assertions; it does not verify the newest changes. Expected test count remains 47 because an existing test was extended, not a new test added.
- Latest fixture and Node contract edits are NOT RUNTIME-VERIFIED. Owner must pull the complete documentation batch, confirm clean synchronized main, rerun the three-file Node command and require 47/47 PASS, then rerun the guarded PostgreSQL runner.
- Overall SQL integration remains NOT PASSED until all 46/46 SQL tests and disposable DB cleanup pass. Tests 39–46 have not yet been reached in the latest owner run.
- Nine Bash concurrency scripts remain a separate unverified gate. Preserve listener PID 15220, port 55439 and `X:\PinPosy-verify-pg18`; never target production/`PIN_TRIAL` or bypass runner guards.


### 2026-11-17 — Development continuation: reconcile current main and review remaining SQL tests

- Observed GitHub `main` HEAD: `5b82dc7bdf3912c75b15f309d8e16ea8c7799a30` (documentation-register update). Latest source/test change: `0fd17599f4598559872965f07d5b01d2fadb19e2`; no newer source fix was found in the recent commit history.
- Re-fetched the controlling project documents, test-38 SQL fixture, Node source-contract test, SQL manifest, SQL test inventory and incident report. The latest owner evidence remains: SQL tests 1–37 PASS, test 38 FAIL, tests 39–46 NOT RUN, disposable database cleanup PASS. The nine approved-fixture corrections and strengthened Node contract remain NOT RUNTIME-VERIFIED; the earlier 47/47 result predates the latest contract extension.
- Performed targeted source-level inspection of the remaining eight SQL integration files: known remote ID recovery, publication board integrity, pin-status fencing, operator reconciliation, admin inventory, failed-board reassignment, failed-schedule retry identity and regeneration journal. This was not a complete line-by-line review or execution; no additional defect was established, so no speculative source/test/migration change was made.
- Current combined status for the observed HEAD reports Vercel `failure` with target `build-rate-limit`. Treat this as a quota/rate-limit blocker, not a proven source build failure; deployment is not confirmed.
- Detailed action log, exact blob SHAs, scope and verification boundary: `docs/audits/2026-11-17-development-continuation-sql-gate.md`.
- Assistant did not run local Node/PowerShell/Bash/psql/PostgreSQL, did not access credentials or databases, and did not modify application source, tests, migrations, workflows, production data or external services.
- **Next gate:** owner synchronizes clean local `main`, runs the three-file Node preflight (require 47/47), then the guarded `scripts/verify-integration.ps1` runner using only the previously approved local PostgreSQL cluster. SQL PASS requires 46/46 and confirmed cleanup. Nine Bash concurrency scripts remain blocked behind SQL PASS.


### 2026-11-17 — Prodamus CI coverage repair and verification boundary

- Reconciled current `main`, the project passport, owner action log, documentation register, Prodamus workflow, billing security contract test and the other two workflows triggered by main pushes.
- Confirmed Prodamus workflow omitted `prodamus-ambiguous-checkout.test.js` and `billing-security-contract.test.js` from its test command. Added both to push/PR path filters and Node invocation; commits: `f5594d0c401d90af49c6baf6f9e29af3710c8369`, `4b2f315f00f16109f9616e033ce8636fccea3c3b`. Added source-contract regression test and strengthened it: `48ab7033ec661b798bf423f394ae281440c33784`, `7e26add59e4d4bee36780713b1a973988249d613`.
- Found and corrected an assistant-authored regex escaping defect in that new test. Replaced regex path matching with literal string occurrence checks and `String.includes`: `75ad3fdd0e7988d4a56fe464341c475ca0edf079`. Inspected the corrected diff and re-fetched workflow/test files; path filters each include both tests, and the job command includes all four test files.
- GitHub Actions run `44171126761` for corrected HEAD initially failed; failed job logs returned HTTP 404 `BlobNotFound`, and the job-steps wrapper returned no step detail. The run was re-queued; latest observation was QUEUED, not PASS. The exact failure cause remains UNKNOWN. Atomic-payment and persisted-boards runs on the same commits also failed, but logs were unavailable; do not infer their causes.
- Vercel combined commit status on corrected HEAD is SUCCESS. This does not imply GitHub Actions success or deployment readiness.
- Detailed chronology and exact evidence: `docs/audits/2026-11-17-prodamus-ci-regression-coverage-repair.md`.
- No local npm/node runtime, production payment, live webhook, production DB, Pinterest API or external service was used. The PostgreSQL integration blocker is unchanged: last owner evidence tests 1–37 PASS, test 38 FAIL, tests 39–46 NOT RUN, disposable DB cleanup PASS.
- **Next:** wait for/retrieve the rerun of Prodamus job 44171126761 and require a successful four-file Node job with inspectable logs; separately resolve the documented local PostgreSQL test-38 gate. No payment launch is approved yet.


### Verification update — Prodamus CI rerun outcome (2026-11-17)

The failed-job rerun for workflow run `44171126761` completed as **FAILURE** on attempt 2 (`updated_at: 2026-11-17T20:37:10Z`; run URL: https://github.com/Diana-866/pinboard-ai/actions/runs/44171126761). The latest job ID is `134350415751`; the Jobs API returned `logs_url: null` and `steps: null`. The log-download endpoint had already returned HTTP 404 `BlobNotFound`. Therefore there is still no reliable step-level evidence to identify the failure cause. Do not call this a successful test run, and do not repeat reruns without logs or a specific hypothesis. Owner should inspect the run UI and supply the failed job's log. The corrected test source and workflow are published, but runtime verification remains BLOCKED/FAILED.

The combined status for the later documentation HEAD `a201002b668d7a9c962979cbf43307526273c8de` currently reports Vercel `failure` with target `build-rate-limit`; deployment remains unconfirmed. This is separate from the GitHub Actions failure.


### 2026-11-18 — Prodamus webhook audit persistence: narrow unique-conflict handling

- Reconciled current `main`, project passport, owner actions, documentation register, recent history, webhook audit source/tests and migration 029.
- Confirmed `billing_webhook_exceptions` has both a UUID primary key and unique `event_hash`, while `persistWebhookException` previously swallowed every Postgres `23505`. Only an `event_hash` conflict represents duplicate delivery; unrelated unique conflicts must surface as persistence failures.
- Updated `backend/billingWebhookAudit.js` to identify the named event_hash constraint / its Postgres detail and propagate unrelated unique errors. Added persistence regressions for event_hash duplicate, detail-only duplicate, unrelated PK unique violation and non-unique DB error. Source blob `0f965726eb37e85eccf518186748729e267d1701`; test blob `1e9b0e1c14ec814b17c5182bab1d02e568ee3e3d`.
- Updated Prodamus checkout workflow to watch and execute the webhook audit module/test in both push and pull_request filters; extended the source-contract test. Workflow blob `300a7d69d55c58610d63ee68beeff4d008e47c2b`; contract blob `cc692b0ac50fdf4645876fd9e2179667ea09067f`.
- Commit chronology: `9356582342a4f0563f7bfc97485acb7fe6c8c143`, `b4dc0adc24a76a2cb97cf7d39f8714d8ecf6eec8`, `fefeff45d176d84a7a612b6dffeb2373057f0b7e`, `92451866e9640271972f32b8741f634d3a6caf67`, `7f34f05b180bb2f7aac4da50cc04b912834741c5`, `7cc4a2230dcb52bff1cd3f81a38e5ef91ca33a96`, `86d252baaa5569d8d3ebacff599e73792ab5de87`, `b99e158f73c2aa34537f9402d2870ce9973f0c1c`. The initial regex escaping and incomplete PR path/command assertion were assistant-authored and corrected in subsequent commits; full chronology in the audit.
- GitHub Actions latest Prodamus run `44304664637` failed; job `134802973700` exposed no steps/log URL and step endpoint returned empty. Exact failure cause is unknown; do not claim runtime tests passed or failed. Combined Vercel status on final HEAD `b99e158f73c2aa34537f9402d2870ce9973f0c1c` is SUCCESS, but no production deployment is confirmed.
- No local Node/npm test, frontend build/typecheck, PowerShell, PostgreSQL, psql or Bash test was executed. No production database, payment, live webhook or external service was touched. Runtime status for this change is NOT VERIFIED.
- Existing blockers remain: owner UA-036 for inaccessible GitHub Actions logs if failure persists; owner UA-035 for guarded local PostgreSQL SQL integration (last evidence tests 1–37 PASS, test 38 FAIL, 39–46 NOT RUN, cleanup PASS). No live payments or first-user launch approved.
- Detailed action chronology and verification boundary: `docs/audits/2026-11-18-prodamus-webhook-audit-persistence-guard.md`.


### 2026-11-18 — Prodamus RUB webhook amount-field selection fix

- Starting GitHub `main` HEAD: `77cf63740f6c68c1efe778527fccbce34130938a`. Reconciled this passport, owner actions, documentation register, current billing source/tests, Prodamus workflow and complete migration filename inventory (156 numbered migrations).
- Found a payment-validation defect in `backend/prodamus.js:getWebhookPaymentAmount`: when an order was RUB, the function preferred `currency_sum` over the generic RUB `sum`, even when `currency` was absent. A signed callback carrying different `sum` and `currency_sum` values could therefore be validated against the wrong currency-denominated amount.
- Fixed selection: RUB reads only `sum`; non-RUB still requires the explicit matching currency and `currency_sum`. Source commit `d35733a03c2370971d3b41ea603c52186f6e2143`, blob `c57ff05dcb6c28436c226d4d69f3891b86873ee2`.
- Added regression coverage for conflicting RUB `sum`/`currency_sum`, missing RUB `sum`, and explicit currency mismatch. Test commit `2cb3bc60a52f23a96c5fdca7c3cc4e54dd7c5240`, blob `37374cbf496d4521cc088dfc32f30f62d75f2fb6`.
- Existing Prodamus checkout workflow already watches and runs both changed paths; no workflow modification was needed. Regression test NOT EXECUTED in this session; do not mark runtime verification passed. No production database, PIN_TRIAL, payment, live webhook, provider or deployment was touched.
- A preliminary suspicion that `received_currency` was missing from migration 029 was disproved: migration 037 adds it (blob `f532a94bb04e1a826b9363ab27e48999115f3e11`). No change was made for that false lead.
- Detailed report: `docs/audits/2026-11-18-prodamus-rub-webhook-amount-selection.md` (created in commit `5637ec7331de75aed87c12101392212b65c1d279`).
- Existing blockers remain: Prodamus Actions run `44304664637` failed without inspectable job steps/logs; owner UA-035 PostgreSQL integration still has last evidence tests 1–37 PASS, test 38 FAIL, tests 39–46 NOT RUN, cleanup PASS. No live payments or first-user launch approved.


### 2026-11-18 — Prodamus webhook follow-up review and metadata correction

- Reconciled intervening commits on `main` rather than assuming the branch remained unchanged. Inspected diffs: `8ee8bc5036ecabbbcb24341111b5f5b91ca56947` adds HTTPS/credential validation for per-request Prodamus webhook URLs; `dab469b742abcfcabd217c810298440bfd849a63` and `86a2c3978cddb36f44d9eb148ca63cf671c7098d` preflight subscription/credit callback URLs before checkout idempotency reservation; `e57a0ea93e4206ebe848eb23fd6923865e7da17b`, `cc6f81ad0d0077878eba8a359fb3721ab5c60812` and `9e93163b7a6cd9c0a69ea206f26d9709fcce4f6d` add regression/source-contract coverage. These changes were retained and reviewed; no duplicate implementation was added.
- Follow-up inspection of `getWebhookPaymentAmount` found that its returned `amountField` metadata still named `currency_sum` whenever that property existed, even though RUB amount validation now uses `sum`. Corrected metadata to report the actual field: `sum` for RUB and `currency_sum` for non-RUB. Commit `ce36d6ee38a3df4cc0fb450445bcf5ea02d3c0c8`, blob `db96f8afb6fdfa29f2a4aa39fa63fde9ece358c1`.
- The existing regression test asserts the RUB result's `amountField: "sum"`; the follow-up source was re-fetched and statically checked against that assertion. No Node runtime test was executed. Detailed report addendum: `docs/audits/2026-11-18-prodamus-rub-webhook-amount-selection.md`, update commit `ed2d0d0b16a02a58912f375736c40b097a699ed3`.
- Vercel SUCCESS was observed on intermediate docs HEAD `16b7e65bfa03a2686603585e657d399bbcf164dc`; this does not establish current HEAD deployment or GitHub Actions test success. Existing UA-035/UA-036 blockers remain.


### 2026-11-18 — Prodamus CI outcome after webhook hardening commits

- Reconciled latest `main`; source/test head `9e93163b7a6cd9c0a69ea206f26d9709fcce4f6d` includes the RUB amount-field regression and the HTTPS webhook URL preflight regression. Final source blob `db96f8afb6fdfa29f2a4aa39fa63fde9ece358c1`; Prodamus test blob `cda5c65104c626d28789573b46b2709a6bd5f97f`.
- Prodamus Actions run `44306870084` concluded FAILURE; job `134810593751` (`checkout-regressions`) returned `logs_url: null`, `steps: null`, and the job-steps endpoint returned an empty list. Test command execution and failure cause are UNKNOWN. Related persisted-boards run `44306870062` and atomic-payment run `44306870099` also failed; causes are not established. No blind rerun initiated.
- Vercel status on documentation HEAD `e352231794389a252835485ac5256d9ea922aa64` was PENDING at check time; no deployment confirmation. No local Node tests were executed. Audit report updated in commit `9c134bbb423ff5087719cae181925b821ca5a85d`.
- UA-036 remains the owner path to inspect the Actions UI and provide logs; UA-035 PostgreSQL SQL integration remains separate and unresolved. Do not enable live payments or invite first users.


### 2026-11-18 — Prodamus per-request webhook URL HTTPS guard

- Found that when `PRODAMUS_SYS` is configured, `createPaymentLink` included the per-request `urlNotification` in the signed provider payload without checking its URL scheme or embedded credentials. An HTTP callback URL could expose webhook traffic in transit.
- Added `validateWebhookNotificationUrl` in `backend/prodamus.js`: require valid HTTPS URL, hostname, and no embedded username/password. Provider helper validates immediately before adding the override to the signed payload.
- Both `backend/billing.js:createPayment` and `backend/creditsBilling.js:createCreditsPayment` now preflight the configured callback URL before `beginPaymentCreation`, preventing bad configuration from leaving an idempotency reservation or local pending payment. If SYS is blank, the integration continues to rely on the webhook configured in the Prodamus form settings; this source change does not verify that external setting.
- Regression coverage: helper/checkout URL tests in `backend/test/prodamus-webhook.test.js`; two-handler no-side-effects test in `backend/test/prodamus-ambiguous-checkout.test.js`; source-order contract in `backend/test/billing-security-contract.test.js`. Existing Prodamus workflow already watches and runs these paths; no workflow change needed.
- Commits: `8ee8bc5036ecabbbcb24341111b5f5b91ca56947` (shared validator), `dab469b742abcfcabd217c810298440bfd849a63` (subscription preflight), `86a2c3978cddb36f44d9eb148ca63cf671c7098d` (credit preflight), `e57a0ea93e4206ebe848eb23fd6923865e7da17b` (helper tests), `cc6f81ad0d0077878eba8a359fb3721ab5c60812` (source contract), `9e93163b7a6cd9c0a69ea206f26d9709fcce4f6d` (handler no-side-effects regression). The independent RUB amount metadata correction is `ce36d6ee38a3df4cc0fb450445bcf5ea02d3c0c8`.
- GitHub Actions Prodamus run `44306613409` failed; job `134809710833` had runner_id 0, empty runner_name and no steps. Two annotations were reported but contents unavailable. This is not evidence the Node tests ran or failed; exact cause remains UNKNOWN. No blind rerun. Vercel SUCCESS was observed on intermediate source/test HEAD `cc6f81ad0d0077878eba8a359fb3721ab5c60812`; this is not deployment proof.
- No local Node/npm test was executed. All new tests remain NOT RUNTIME-VERIFIED. No production DB, `PIN_TRIAL`, real payment, Prodamus account, live webhook, Pinterest API, deployment or external service was accessed.
- Detailed report: `docs/audits/2026-11-18-prodamus-webhook-url-https-guard.md`. Existing owner gates UA-035 (guarded local PostgreSQL) and UA-036 (inspect Actions failure if it persists) remain open. No live payment/first-user launch approved.


### 2026-11-18 — Prodamus outbound API endpoint HTTPS enforcement

- Reconciled current `main` and reviewed the already-published webhook callback HTTPS guard before making a separate change. Found that `backend/prodamus.js:baseUrl()` still accepted arbitrary `PRODAMUS_URL` values. Since `createPaymentLink()` sends an HMAC-signed checkout payload to this URL, HTTP configuration could expose the signed request over cleartext transport; embedded URL credentials were also accepted.
- Updated `baseUrl()` to parse and validate the configured/default URL, require HTTPS and a hostname, reject embedded username/password credentials, preserve the blank-value default shop URL, and normalize the endpoint path. Invalid configuration fails before the Axios request. Source commit `ff78fe371b83c4b2b7bfeb21462618461aa2337c`, blob `0643401d0d116a1117a8c15c7309e78708130d66`.
- Added `backend/test/prodamus-endpoint-security.test.js`: valid HTTPS normalization; HTTP/FTP/credential/malformed rejection; and a transport spy proving Axios is not called for HTTP configuration. Final test blob `6f6a7c9b6584977e4da3ca00d0cda6e39a4abe62`, correction commit `210a8387770fc7c76e7ceba8b6631a387a662889` (initial test commit `002ba79f17ad5222faec4deca4ebeab4c122921f`). The initial empty-string invalid assertion was removed because an empty setting intentionally selects the default shop endpoint.
- Added the new test path to both push and pull_request filters and the explicit Node command in `.github/workflows/prodamus-checkout-tests.yml`; workflow commit `0db356d326fe2a1640291ff82f6596c7fe414b58`, blob `18f380c92619f923454defa85092798954ccd245`.
- A stale-SHA GitHub write attempt was rejected with HTTP 409 after `main` advanced; no file was overwritten. The branch/source were re-fetched and the change was successfully applied against the current blob SHA.
- Final observed code/test/workflow HEAD: `0db356d326fe2a1640291ff82f6596c7fe414b58`. Audit report: `docs/audits/2026-11-18-prodamus-api-endpoint-https-guard.md` (commit `2d6a26e7a2c2106f15450758d9173001569c249b`).
- Source/test/workflow diffs were re-fetched and statically inspected. No local Node/npm command was executed; new tests are **NOT RUNTIME-VERIFIED**. Vercel combined status on code/test/workflow HEAD was PENDING at last check; no deployment is confirmed and no successful Actions run for this new commit was observed. No production DB, PIN_TRIAL, real payment, provider account, live webhook, Pinterest API or external deployment was accessed.
- Owner verification is tracked in UA-040. Existing UA-035 PostgreSQL integration and UA-036 Actions-log investigation remain separate open gates. Do not enable live payments or invite first users until runtime, database, webhook configuration and deployment gates are green.


### 2026-11-18 — Prodamus endpoint CI contract follow-up

- After adding `prodamus-endpoint-security.test.js` as the sixth Prodamus Node test, static review found `billing-security-contract.test.js` still expected the old five-file command and did not require the new test path in both push/PR filters. Corrected the expected command and added the two path-filter assertions. Commit `05bd81bbbb9775e2f671e8d730c9d5442fa8b9a8`; final contract-test blob `0823cb96a2c1ec4ee00c55e8524432dbfa2316e3`.
- Re-fetched the workflow and contract test: the command now lists all six files, and the endpoint-security test is present in both path filters. This is static verification only; no Node runtime test was executed.
- Latest Prodamus Actions run for that commit: `44307390644`; job `134812379544` completed FAILURE in about two seconds with `runner_id: 0`, empty runner name and no steps. Two annotations were reported but inaccessible. Exact failure cause remains UNKNOWN; this does not establish that the Node suite ran or failed. No blind rerun.
- Updated audit: `docs/audits/2026-11-18-prodamus-api-endpoint-https-guard.md` (follow-up commit `da63fb4e1e306ae06e52680a9285a03c670384bc`). Owner handoff UA-040 must require visible execution of all six tests; UA-036 covers GitHub UI log retrieval if needed. UA-035 PostgreSQL remains independent.


**Final status refresh (2026-11-18):** Vercel combined status for latest source/test commit `05bd81bbbb9775e2f671e8d730c9d5442fa8b9a8` is now `success`. This supersedes the earlier PENDING status for the same code/test/workflow series; it is not a production deployment confirmation. Prodamus Actions run `44307390644` remains a pre-runner FAILURE: job `134812379544`, `runner_id: 0`, no steps/log URL, two inaccessible annotations. Whether the Node test command ran is UNKNOWN. Current latest observed repository commit at this check is `3ef8abf4b6c7b01a83907222fce47d3b19cafec0` (documentation handoff); latest source/test commit remains `05bd81bbbb9775e2f671e8d730c9d5442fa8b9a8`. Runtime tests remain NOT VERIFIED.


### 2026-11-18 — Prodamus signed-request redirect forwarding guard

- Further review found Axios follows HTTP redirects by default. Even with an HTTPS `PRODAMUS_URL`, a provider-side 307/308 could forward the signed checkout POST body to another host before PinPosy rejects the resulting non-2xx response.
- Set `maxRedirects: 0` on the Prodamus checkout POST so 3xx responses are surfaced to the existing ambiguous-outcome handler and the signed request is not automatically forwarded. Source commit `f89803b544a78ef15fc4d75220225d4f89edb53a`, blob `e9290bc314ae1c20b15d8d9a6b91877a1ed73535`.
- Added a regression in `backend/test/prodamus-endpoint-security.test.js` that simulates 307 and asserts the Axios options contain `maxRedirects: 0`; test commit `facc0c992b122106f72d7adc80e70a0f28b82fff`, blob `1face096b814532e10a608fb4de8a53ec9b4b096`. Existing workflow already includes the test path and file in its six-file command.
- Re-fetched source and test and inspected exact diffs. No local Node test was run; regression remains **NOT RUNTIME-VERIFIED**. Vercel combined status for test commit `facc0c992b122106f72d7adc80e70a0f28b82fff` was PENDING at last check; no Actions result for this latest commit was available. No deployment or test pass is claimed.
- Detailed report: `docs/audits/2026-11-18-prodamus-api-endpoint-https-guard.md` (redirect guard follow-up commit `b044f43f8c4c08abf1f95799fa37311a4adf33c0`).
- Owner verification is appended to UA-040. Existing UA-035 PostgreSQL and UA-036 Actions log gates remain independent. No production DB, PIN_TRIAL, real payment, provider account, live webhook, Pinterest API or deployment was accessed.


**Final status refresh (2026-11-18, redirect-guard series):** Re-queried combined status for latest code/test commit `facc0c992b122106f72d7adc80e70a0f28b82fff`; Vercel reports SUCCESS, superseding the prior PENDING observation. This is not production deployment proof and is not backend test evidence. No successful Prodamus Actions run for this latest commit was available; the latest known run on the preceding contract commit `05bd81bbbb9775e2f671e8d730c9d5442fa8b9a8` failed before exposing runner steps/logs. Runtime status for the endpoint/redirect regression suite remains NOT VERIFIED. Latest repository HEAD before this status-document update was `7944cf5152e98d1000ee556dd09e41c39829437d`; latest code/test commit remains `facc0c992b122106f72d7adc80e70a0f28b82fff`.


### 2026-11-18 — Payment fulfillment user-first lock order and account lifecycle fence

- Reconciled latest main, AUD-400/AUD-401 design reports, migrations 010/019/127/143/156, payment RPCs, deletion worker financial guard and PostgreSQL integration workflow. Confirmed the old credit/subscription fulfillment RPCs locked payment rows before users, opposite to account deletion acceptance in migration 127; neither RPC rejected entitlement grants after `account_status='deletion_pending'`.
- Added migration 157 `db/migrations/157_payment_fulfillment_user_first_lifecycle_fence.sql`: resolve owner without payment lock, lock user first, lock payment second, revalidate owner, require active account before fulfillment; preserve existing credit ledger idempotency, active-account late success and subscription period/newest-order semantics. Migration blob `3ca8d1a8c21afecfe0d61131da7168bfe1dff1e8`, commit `2f7ef442872c4c16d501f2d19a5ba9f0601533da`.
- Added `backend/test/payment-deletion-lifecycle-fence.integration.sql` for canceled credit purchase and canceled subscription late-success attempts against deletion-pending users; verifies no balance, ledger, paid period or tariff mutation. Final blob `5712883351ab84a914704578507bc8c12f910b4d`, initial test commit `4987f082a1f676eff399b01999f059688e43ddfa`, fixture default correction `63c02f2e7540e8f510e819c5728957c25e065931` (baseline tariff default is `none`, not NULL).
- Extended CI and every canonical migration-chain/replay guard to 010–157 (148 migrations), and SQL manifest/workflow/PowerShell integration runner to 47 SQL tests. Final key blobs: workflow `524317f02b88939780056831f1e75ed555a44b03`; disposable PowerShell runner `2a6a671649ececdfbe91cd6edfeb3cb641533589`; shell replay `792e7de4b730f4540ef612892905be67edb2c10f`; fallback PowerShell replay `2a34f9e50b60c17e98e42295801b0060acca397b`; migration-chain test `7a36289cf8ad038873fcd05a984590b23be99767`; runner contract test `1a97bd975a1629e62c82433e5c1f1ae9861861fa`; SQL manifest `e95890a97fe1da8cdbecd02f20cfab1fc57e2034`; Windows replay contract test `7208d40d2b20fbc564103c36be58affe4c7a273d`.
- Static cross-file assertions after publication confirmed 148 migration entries, 47 SQL manifest entries, workflow inclusion, and consistent runner/test counts. Static test-case count for the three Node preflight files is 50 (31 + 2 + 17); this is a source count only, not a test run.
- GitHub Actions run `44308754607` on code/test HEAD `63c02f2e7540e8f510e819c5728957c25e065931` ended FAILURE; job `134817075814` exposed no steps, the steps endpoint was empty and log download returned HTTP 404 `BlobNotFound`. No evidence the runner, migrations or SQL tests started. Runtime result UNKNOWN / NOT RUN; no blind rerun. Vercel combined status on code/test HEAD is FAILURE target `build-rate-limit`, not a build log or deployment confirmation.
- Detailed chronology: `docs/audits/2026-11-18-payment-fulfillment-account-lifecycle-fence.md` (commit `7259bf72c9cc74a0c6a3d80400c1b11c924d8503`).
- **Important limitation:** migration 157 is an interim safety boundary, not the full AUD-400/401 solution. It prevents new entitlement mutation after the deletion fence but does not yet persist an immutable provider receipt independently of entitlement. A late success for a locally canceled/denied payment can still require durable receipt/reconciliation handling. Do not enable live payments or first-user launch on this change alone.
- Next: implement immutable Prodamus receipt + entitlement decision journal and two-session deletion-vs-payment race regression; owner UA-041/UA-035 must run 50 Node preflight cases and 47 SQL integration tests on the guarded disposable PostgreSQL environment. Existing owner-visible Actions runner failure remains a separate blocker. No production DB, real payment, provider account, webhook, refund, Pinterest API or external service was touched.


**Working-period closeout — 2026-11-18:** Re-fetched all four required documentation artifacts from `main`: `PROJECT_STATE.md` blob `f4c6f6a261d1fb9fb0b81e73b0ed5402a7f093fd`, `USER_ACTIONS.md` blob `b5be72d4207a488668849fb492145961c0f74078`, `DOCUMENTATION_REGISTER.md` blob `acdf087de7c0b712c52676578fada2dcc993c8bc`, and audit report blob `5ff9e5fdc16bfc410c1e8325f2c5ffe617af706a`. Latest observed repository HEAD before this closeout entry: `ac91cea934d2a1f876fdc529eb35cbdb4840dcb3`; latest code/test commit: `63c02f2e7540e8f510e819c5728957c25e065931`. Rechecked combined status: Vercel FAILURE target `build-rate-limit`. Rechecked Actions run `44308754607`: failed job `134817075814`, no inspectable steps/logs. No local runtime test was run; do not infer a pass. Next independent engineering task is immutable provider receipt + entitlement decision journal, followed by two-session race coverage; owner runtime task is UA-041/UA-035. No background work is running and no production/external service was accessed.


### 2026-11-18 — Prodamus receipt journal integration and runner repair (latest superseding addendum)

- Migration 158 is published: `db/migrations/158_prodamus_immutable_receipt_and_decision_journal.sql` stores authenticated provider facts separately from entitlement outcomes; provider receipt rows reject UPDATE/DELETE; direct table DML is revoked and narrowly scoped SECURITY DEFINER RPCs are granted. The decision row is a per-receipt state with terminal-transition protection, not a multi-row append-only history of every intermediate decision.
- The invalid-amount decision bug was corrected before this continuation: subscription commit `33d7f13f3147ab961e8e91ac82c6d21ca88393fb`, credit commit `64bf9352c83a5c17402e3b760183e7f84a324a9f`. Both now retain `rejected_mismatch` as terminal.
- Repaired the webhook test DB double and added regressions for invalid signed amounts and receipt-storage failure in both subscription and credit handlers. Commits: `9f01a0e35432b931c57c15a329081857bde9e785`, `3926d6313322e21e9fd7fd672abc78ad1dc838b4`, `461d07d441db487e391b5d583e8c1e9e8d898a6a`. Additional receipt currency ambiguity fix: `7f058e07bb1968eb4bcdc6c3f5c75e9f68dcddf2`, regression `48c3b2c0a56dd73412d0a39720ca853416c7b49f`.
- Repaired guarded PostgreSQL runner selection/count: migrations 010–158 and 48 SQL tests. Runner commit `1152417abe6b126409e80e2fa7c15da8449ad84c`; Windows failure summary `2773668fea8c9a4de4b435cb9017439db6d7fe76`; replay contract fixes `3b82e1a3b87608aebca4a97e1782aadf4ee4d1a3` and `f194c08b44fe34ad137bafaba901be33af519601`.
- Current Prodamus workflow has receipt helper/test in both push and pull_request path filters and executes the receipt unit test; blob `8c83c851a49258b9c45f6827b3ce9decfb45984e`.
- **Superseding counts:** 149 canonical migrations 010–158; 48 SQL integration tests; 52 Node preflight tests (32 runner-contract + 2 migration-chain + 17 verify-script contract). These supersede older 148/47/50 figures.
- Static re-fetch verification confirms source branches, RPC mocks, invalid-amount and receipt-failure regressions, currency ambiguity guard, workflow filters/command and migration runner counts. **Runtime NOT VERIFIED:** Node and PostgreSQL suites were not executed in this environment. Vercel combined status for code/test HEAD `48c3b2c0a56dd73412d0a39720ca853416c7b49f` remains FAILURE / `build-rate-limit`; no deployment or Actions PASS is confirmed.
- Detailed report: `docs/audits/2026-11-18-prodamus-receipt-journal-regression-and-runner-repair.md` (blob `65f0cb45e610ddfe6d67b579c3239d1d55dde22e`). Owner gate UA-042. Next independent engineering task: add two-session account-deletion versus payment-receipt/entitlement race coverage. Do not enable live payments or invite first users until runtime, SQL, CI, application and deployment gates pass.


### 2026-11-18 — Prodamus webhook audit amount context and migration 159 runner parity

- Reconciled main through receipt-journal work and intervening commits `28e36603c214412a432f1911f80859218587fc20` (subscription receipt-bound fulfillment) and `60c8f14bc7f1f1c2cf656f138edc60e58ac88e43` (credit receipt-bound fulfillment); both were retained.
- Found `backend/billingWebhookAudit.js` selected `currency_sum` whenever present, even without an explicit currency or for RUB. Corrected it to use `currency_sum` only with an explicit non-RUB currency; otherwise it records `sum`. Added three regressions for missing currency, explicit RUB and explicit non-RUB.
- Source commit `33b84fb7872c2739e1c2893f0917c1b398081c0b`, blob `4f5c63d83459731e6c4ced9cf04ed9718fab883a`; test commit `40722066c0bcba996b6670299a14d490b6044d4d`, blob `c8e1a488c2a5effeffd0447011d3b5eb42aaa60e`.
- Found local Windows runner/manifest lagged CI for migration 159: workflow and runner already selected 150 migrations 010–159, and CI expected 49 SQL tests, but local runner enforced 48 and manifest omitted `payment-provider-receipt-fulfillment.integration.sql`. Updated runner to require 49 and added the SQL test to the manifest. Runner commit `724ec0088c8f2b68920a0413486e4158b2d944f7`, blob `01c21f798062cee20790019a26bd6d581585cc3c`; manifest commit `84544dd7a48b31f4b9b894ccba1f50b008b968d1`, blob `730cd86a5b3a0ce259fe1e2fb991fe4460b0079a`.
- Migration 159 `db/migrations/159_atomic_prodamus_receipt_entitlement_fulfillment.sql` (blob `29b2a8b7db98535f33b9eff72280f637e2f65480`) and integration test `backend/test/payment-provider-receipt-fulfillment.integration.sql` (blob `a9677076ff5cb27330125f3f911e7e918a61e7d6`) were reviewed; CI explicitly runs the new SQL test.
- **Superseding verification counts:** 150 canonical migrations 010–159; 49 SQL integration tests; 52 Node preflight tests (32 runner-contract + 2 migration-chain + 17 verify-script contract). These supersede older 149-migration/48-SQL-test counts; the 51 Node preflight count is unchanged.
- GitHub Actions on `40722066`, `28e36603`, and `60c8f14` repeatedly failed before runner allocation (runner_id 0, no runner name, zero steps); exact cause UNKNOWN. No test execution can be inferred. Node unit tests and PostgreSQL replay were NOT RUN in this session.
- Detailed report: `docs/audits/2026-11-18-prodamus-webhook-audit-currency-and-migration159-runner-alignment.md` (created in commit `917b56d4cfb1a1214948f74a2323c29a05d87a55`). Owner actions UA-042/UA-043 updated below. Live payments and first-user launch remain blocked.
- Next: inspect migration 159 and webhook handlers end-to-end, then add two-session disposable PostgreSQL account-deletion versus receipt-bound entitlement race coverage.


### 2026-11-18 — Migration 159 terminal receipt identity fence and regression

- Reconciled main commits `21b5e3b2bb6edfaab09163f9fefe28bb1d101e25` (receipt-bound duplicate credit retry call count), `960098479cb1598bf3152556ab427585f0a7ad19` (removed duplicate SQL manifest entry), and `3eb25129c89c49230bf2147f692c27884c112054` (terminal receipt identity validation in both atomic fulfillment RPCs).
- Migration 159 now rejects reuse of an already-terminal receipt decision against a different local credit purchase or subscription. It revalidates provider order ID, amount and currency before returning an existing terminal decision. Current migration blob `30519439d7423cbc84db1fbca2cc638b74c60723`.
- Added SQL regressions that try to bind a granted credit receipt to another purchase and a granted subscription receipt to another subscription; assert the conflicting user's balance/ledger, subscription status and tariff remain unchanged. Commit `a6f10ab8ced8959a9bd008e782c6fd102de335df`, test blob `6c2bb6c9504c0c0f8ab0e6c940c92e19888b1500`.
- Final manifest is 49 unique SQL tests; current blob `730cd86a5b3a0ce259fe1e2fb991fe4460b0079a`. The runner requires 49 tests and 150 migrations 010–159. The earlier manifest duplication was removed in commit `960098479cb1598bf3152556ab427585f0a7ad19`.
- Latest Actions runs on test commit `a6f10ab8ced8959a9bd008e782c6fd102de335df`: atomic run `44313603402`, job `134833780856`, and persisted-boards run `44313603407`, jobs `134833780522`/`134833780968`; all failed before runner allocation (runner_id 0, no steps). Exact cause unknown; no tests can be inferred to have run.
- Detailed report updated: `docs/audits/2026-11-18-prodamus-webhook-audit-currency-and-migration159-runner-alignment.md`, blob `2a90f3a98f9a2ff22057fc3b29b9884d26f71fd0`. Runtime verification remains NOT VERIFIED; do not enable live payments or invite first users.


### 2026-11-18 — Receipt-bound payment versus account-deletion concurrency regression

- Reviewed current migration 159 after its terminal receipt identity fence and bounded decision-owner reference validation. Current migration blob: `30519439d7423cbc84db1fbca2cc638b74c60723`. The credit receipt-bound fulfillment path locks the user row before the purchase and receipt decision, validates receipt order/amount/currency, and commits the entitlement and terminal decision together.
- Added `backend/test/payment-deletion-receipt-race-concurrency.sh`, which runs two independent PostgreSQL sessions in both lock orders. Payment-first proves deletion waits and one credit grant is committed before the lifecycle fence; deletion-first proves payment waits, leaves the balance and ledger unchanged, and records `withheld_account_lifecycle`.
- The test uses the shared disposable PostgreSQL guard, checks actual PostgreSQL lock waiters through `pg_stat_activity`, and is wired into `run-disposable-concurrency-suite.sh`. The suite now contains ten concurrency scripts. The workflow's existing Bash syntax wildcard and Node concurrency-safety contract automatically include it; no workflow YAML change was required.
- Test blob `0e2da4a83e2b0bda1d9f729868fca3fba04819c5`; runner blob `827a2cd063d64668102bdf36e97e4a73dffba0af`; current concurrency contract blob `ab84f345305ee793a74e30cb4ad9ff871b62e69c`. Commits: `19118c46429148b0b9c8e3fdb3a97b7d29dfa50f`, `2ef950263a9e22bc684f640c7beb4ace0f082aba`, `b590373f687dadc5cb39ddb33c9b99805304b1e1`, `4cfb2be7126110116c9da714722aa0781bd137a4`, `09b12d15d78cb07bab3d3ca95682f88488aed215`.
- **Scope limitation:** the new race test models the deletion acceptance linearization point by updating `users.account_status` while holding the same user-row lock. It does not invoke the full `request_account_deletion` queue RPC or deletion worker, and it covers the credit path rather than subscription fulfillment. Do not represent it as end-to-end account deletion coverage.
- Static re-fetch confirms source wiring and assertions. Bash syntax, Node contract test, PostgreSQL race execution, full backend suite, migration replay and 49 SQL integration tests were **NOT RUN**. Vercel combined status for source head `1e85641290ba3c360856aad734d858a3150aed13` was `failure / build-rate-limit`, not a source build log. No Actions PASS or deployment is confirmed.
- Detailed report: `docs/audits/2026-11-18-payment-deletion-receipt-race-concurrency.md`. Owner runtime action: UA-045 in `docs/USER_ACTIONS.md`. Next engineering step: extend the race to the exact account-deletion acceptance RPC and subscription receipt-bound fulfillment, then obtain an executed isolated CI run. Live payments and first-user invitations remain blocked.


**Working-period closeout — 2026-11-18:** Re-fetched the four documentation artifacts after publication. Before this closeout update, latest observed main HEAD was `b38434d6e5f891db76ba4c6b7e163bf277a894e1`; current source/test blobs: race harness `0e2da4a83e2b0bda1d9f729868fca3fba04819c5`, concurrency runner `827a2cd063d64668102bdf36e97e4a73dffba0af`, concurrency contract `ab84f345305ee793a74e30cb4ad9ff871b62e69c`, migration 159 `30519439d7423cbc84db1fbca2cc638b74c60723). Documentation blobs before this closeout: PROJECT_STATE `ff76dcc714ce692976301d93eb36e549ea5cf019`, USER_ACTIONS `880b998c22e9ac498754e8e6e35b8dceb2944416`, DOCUMENTATION_REGISTER `3395a6d778cf9e62e6bc6f5b156055f665658f24`, race audit `02f9c104c69e827eaa3ec318fd0e124dd550f39d`. Confirmed all changes are present on `main`. Combined status for the latest observed main commit reports Vercel `failure / build-rate-limit`; this is not a build log or deployment result. The available workflow-run listing only exposes PR-triggered runs, so a push-run result for this exact source head remains UNKNOWN. Bash syntax, Node contract, PostgreSQL concurrency, full backend suite, migration replay and 49 SQL integration tests were not executed in this session. No production database, PIN_TRIAL, staging, live payment, Pinterest API or deployment was accessed. Next: execute UA-045 on the guarded disposable PostgreSQL path, then extend concurrency coverage to the actual deletion-request RPC and subscription fulfillment. Live payments and first-user invitations remain blocked.


### 2026-11-18 — Migration 160 and receipt/deletion concurrency-suite closeout

- Reconciled current `main` through migration 160 and all intervening payment, CI, concurrency and documentation commits. Canonical migrations are now **151 files, 010–160**; SQL integration manifest is **49 unique tests**; disposable Bash concurrency suite is **10 unique scripts**; the existing Node migration preflight remains **51 expected tests**.
- Migration 160 `db/migrations/160_prodamus_receipt_local_payment_binding_guard.sql` (blob `7005ec7ce7a802312bb1376284892309a67fa226`) binds terminal decisions to payment kind, payment ID and user ID, keeps duplicate rejected-mismatch callbacks idempotent for the same payment, rejects cross-payment reuse, and bounds owner reference length.
- Receipt SQL integration test now includes migration-160 retry/identity coverage; current blob `f7fdc7a05bba1bc45f2b4f78652a7365422b4778`.
- Wired `payment-deletion-receipt-race-concurrency.sh` into the disposable concurrency suite. Reconciliation found and removed a duplicate suite entry; runner now has 10 unique scripts and contract asserts uniqueness. Runner blob `827a2cd063d64668102bdf36e97e4a73dffba0af`; safety contract blob `ab84f345305ee793a74e30cb4ad9ff871b62e69c`.
- Windows disposable runner now requires 151 migrations 010–160, 49 SQL tests and reports ten Bash concurrency scripts. Corrected its stale 150-migration diagnostic and added contract assertions. Runner blob `a1af92050d64db66f5081c1425e49247ef074173`; Node contract blob `0f4f79af08145f19f64c76541be3de5fd5b88198`.
- Static re-fetch confirmed 151/49/10 unique counts and wiring. **Runtime NOT VERIFIED:** no Bash syntax, Node contract, PostgreSQL replay, SQL suite or concurrency script was executed in this session.
- Latest Actions runs `44314411889` (atomic job `134836635174`) and `44314412188` (persisted-board jobs `134836636827`, `134836637267`) failed before runner allocation: runner_id 0, no runner name, zero steps. Exact cause unknown; test execution cannot be inferred.
- Detailed report: `docs/audits/2026-11-18-payment-deletion-receipt-race-concurrency.md`, blob `a48c9661598991328d988c71c86bdea47985b126`. Owner action UA-046 below.
- Next engineering step: extend the race harness to call the full account-deletion acceptance queue RPC and cover subscription receipt fulfillment; then secure an actually executed isolated CI run. Live payments and first-user invitations remain blocked.


### 2026-11-18 — Migration 160 terminal receipt binding and release-gate synchronization

- Migration 160 db/migrations/160_prodamus_receipt_local_payment_binding_guard.sql now locks the full entitlement-decision row and requires terminal decisions to match the same local payment kind, payment ID and user ID before returning. Repeated rejected_mismatch decisions for the same payment are idempotent; cross-payment reuse remains rejected. Creation commit 3e3706eb06819967c1b85079b861d28084e538f8, follow-up contract alignment d17914fcf4e2a357de2b0b62c486baaeeeaacd9e; current blob 7005ec7ce7a802312bb1376284892309a67fa226.
- SQL regression backend/test/payment-provider-receipt-fulfillment.integration.sql now checks duplicate mismatch idempotency in addition to credit/subscription cross-payment reuse. Commit 24eccab7d451586b9ae0a6c05a4b3f722ba3ab6f; blob f7fdc7a05bba1bc45f2b4f78652a7365422b4778.
- CI applies migration 160 (workflow blob 11de973ebc95fba682b53b61ac787dc1a5ab1ca1). Linux replay blob 19420342cd79d952a9fff1890896bd3fd3d3412e; Windows replay blob d40d007c8aaf2ff9c51c97aa898bab28b3bc2e32; guarded local PostgreSQL runner blob a1af92050d64db66f5081c1425e49247ef074173.
- Current counts: baseline 001 + 151 active migrations 010–160; 49 unique SQL integration tests exactly matching workflow order; 52 Node preflight tests across runner/migration/verify contracts; 10 disposable concurrency scripts, including the two-session payment-first/deletion-first credit race. The local PowerShell runner explicitly does not execute Bash concurrency tests.
- The new race test only models the deletion acceptance linearization point with a users.account_status update under the user-row lock. It does not invoke the full account-deletion request/queue/worker and does not yet cover subscription fulfillment. This is not end-to-end deletion coverage.
- Static re-fetch confirms migration, SQL regression, workflow, all three migration runners and contract counts. Runtime NOT VERIFIED: no Node/Bash test, migration replay, SQL test or concurrency race was executed in this environment. Vercel status for source head 1e85641290ba3c360856aad734d858a3150aed13 is failure / build-rate-limit; no deployment is confirmed. Available workflow-run lookup returned no PR-triggered run for main HEAD; prior observed Actions failures before runner allocation remain UNKNOWN, not test failures.
- Current main documentation audit is docs/audits/2026-11-18-prodamus-webhook-audit-currency-and-migration159-runner-alignment.md (latest blob b7fe0dfb41f645b0a0ba25149fcc89859d108593). The payment/deletion race report is docs/audits/2026-11-18-payment-deletion-receipt-race-concurrency.md. Owner action UA-046 supersedes older 150/49 migration/test counts with 151/49.
- Next engineering task: extend the two-session race to the actual deletion acceptance RPC/queue contract and subscription receipt-bound fulfillment, then obtain executed CI and local disposable PostgreSQL results. Keep live payments and first-user invitations blocked.


### 2026-11-18 — Expanded account-deletion/payment race to real RPC and both payment kinds

- Follow-up review found the first race harness version only updated `users.account_status` directly and covered credit purchases. That proved the row-lock order but did not exercise the actual deletion acceptance RPC or subscription fulfillment.
- Reworked `backend/test/payment-deletion-receipt-race-concurrency.sh` to call `request_account_deletion(uuid,'password_reauth',token_version)` and added four independent two-session cases: credit payment-first/deletion-first and subscription payment-first/deletion-first.
- Assertions now verify the durable deletion request and pending preflight job, credit balance/ledger and receipt decisions, subscription tariff/period/status and receipt decisions. The script deliberately leaves immutable deletion-event fixtures in the disposable cloned DB; the outer suite drops the entire clone on exit.
- Script commit `b5a0272430221c389fd5457d2f7874a420051a5e`, blob `005a431480d7ca7a9640d67689815f2aec53233e`. Expanded safety contract commit `8377f016f8070377f727113a34907be8f2999b33`, blob `ce734f544ffc0ec58c10f1dc4d4f4dd86a7238c9`.
- This supersedes the prior scope note that the race directly changed `account_status` and tested only credits. The harness now calls the actual request RPC and covers subscription fulfillment as well.
- Still **NOT RUNTIME-VERIFIED**: Bash syntax, Node contract, PostgreSQL race, full 151-migration replay, 49 SQL tests and all ten concurrency scripts were not executed by the assistant. The workflow has not yet produced a visible PASS. The race suite requires the isolated disposable clone; do not run it against a shared DB.
- Detailed report: `docs/audits/2026-11-18-payment-deletion-receipt-race-concurrency.md`, blob `09f2e9932bfb48ef112dbd59dbd53ac7709ecd12`. Owner action UA-045 has the current runtime sequence; UA-046 holds the superseding 151/49/10 counts.


### 2026-11-18 — Corrected deletion RPC/payment race contract and fixture cleanup

- Reconciled latest `main`, migration 130, the expanded race harness, its Node safety contract, runner and current audit before editing. The expanded harness already covered four races (credit/subscription × payment-first/deletion-first), but review found two real defects.
- **RPC arity defect:** migration 130 defines `request_account_deletion(uuid, text, bigint)`; the latest script had drifted to a two-argument call, so the race would fail to resolve the function. Both call sites now pass the fixture's actual `token_version`, and fixture creation explicitly starts at version zero. First-order assertions verify the accepted request's token-version fence and exactly one immutable `request_accepted` event. Migration 130 source blob `1dcf7844444b4a70be1be49946d5a4c4265ce40f`.
- **Fixture cleanup defect:** the script attempted to delete durable deletion requests and swallowed errors, although migration 130 makes deletion events append-only and jobs reference requests with RESTRICT. Removed destructive/ineffective row deletion. Test fixtures remain only in the uniquely cloned disposable DB; the outer suite drops that whole clone. Added an EXIT trap to stop background sessions and clean the temporary directory on success or failure.
- Final race script blob `afc49ebe635d765bccec8af249f19f1ae6b1e504`; commits `f7b984347b474da06c33bea4b04e8e11748eeedd`, `b6b33ed8dcfffabedf9628136b03b56dc391e2dc`. Final Node safety contract blob `9250e28e4a891d8744a0d56a0c8422f03a4ea012`; commit `cbd03998f08576119af5aac29d55acb58bc8bb42`. Contract asserts both token-version-bound RPC calls, event check, cleanup trap and no destructive request deletion.
- Audit: `docs/audits/2026-11-18-payment-deletion-receipt-race-concurrency.md`, blob `0985e2571d2ef5e612151e11ddb5184c2f7acd68`. Owner runtime action UA-047. Documentation register includes current blobs.
- **Verification boundary:** re-fetched migration 130, script and contract; statically confirmed the three-argument signature, both call sites, the event assertion, cleanup trap and no deletion of immutable requests. Bash syntax, Node tests, PostgreSQL races, 151-migration replay, 49 SQL tests and CI execution were **NOT RUN**. Runtime remains NOT VERIFIED; no build/deployment or test pass is claimed. Run only through the unique disposable clone runner; never use a persistent shared or production database.
- Next: obtain a real executed isolated CI run for the four race cases and all ten concurrency scripts; then continue the next open production-readiness item from the project passport. Live payments and first-user invitations remain blocked.


### 2026-11-18 — Final payment/deletion race harness contract reconciliation

- Re-fetched the current race script, concurrency safety contract, disposable suite, Windows migration runner, current docs and Actions job before recording this follow-up.
- Tightened the race harness to pass the exact three-argument deletion RPC signature in both lock orders and assert the token-version transition exactly once (user token version 1, request token version 1, one immutable `request_accepted` event).
- In the deletion-first order, credit and subscription fulfillment now execute in independent PostgreSQL sessions; the test waits for both sessions to be visible lock waiters before releasing the deletion transaction. The payment-first order holds the user lock while both receipt-bound fulfillment RPCs run before the actual deletion acceptance RPC can proceed.
- Current race script blob `308214f70ca518016aa6d39b33ce0e2ee466e081`, commit `95cacfef0f5d931c686b20a63afe2882247b0da3`; current safety contract blob `12721cfaad66b32eddb68c023d4c426dff4db4a2`, commit `c14cb39e8cc25f7c98ab6d3beb61641589b3e3bd`.
- Static re-fetch confirms 10 unique concurrency runner entries, 49 unique SQL tests and 151 canonical migrations 010–160. No runtime execution is claimed.
- Latest atomic workflow run `44315382265`, job `134839972556`, failed before runner allocation (`runner_id=0`, empty runner name, zero steps). No test result can be inferred.
- Detailed report updated: `docs/audits/2026-11-18-payment-deletion-receipt-race-concurrency.md`, blob `502235615aadaf1f0e345a0ac5e01ccfac48657a`. Owner action UA-048 below. Keep live payments and first-user invitations blocked.


### 2026-11-18 — Final review of real deletion/payment concurrency harness

- Reconciled current race script and safety contract against migration 130 and recent commit history. The harness now tests two lock orders using the real `request_account_deletion(uuid,text,bigint)` RPC and receipt-bound credit/subscription fulfillment. In deletion-first, credit and subscription fulfillment run in two distinct sessions and the harness requires both to be observed waiting on the user-row lock before deletion commits.
- Strengthened acceptance assertions: token_version starts at 0 and must become exactly 1 on both user and deletion-request rows; exactly one immutable `request_accepted` event is required. The script has an EXIT trap to stop child sessions and remove temporary files. Durable deletion fixtures are intentionally retained inside the disposable clone; no attempt is made to delete append-only event/request rows. Outer suite must drop the entire clone.
- Current race script blob `308214f70ca518016aa6d39b33ce0e2ee466e081`; current Node concurrency contract blob `12721cfaad66b32eddb68c023d4c426dff4db4a2`; migration 130 blob `1dcf7844444b4a70be1be49946d5a4c4265ce40f`. Relevant source refinements: `38206948e01833f097602918583f629c9079ab30`, `95cacfef0f5d931c686b20a63afe2882247b0da3`, `c14cb39e8cc25f7c98ab6d3beb61641589b3e3bd`, `8a5653a13923b3756b709eac369aa04cc18aa65b`, `5cd54ee6ef54b7c17ce5ab016528c7a5ab54bee3`, plus the arity/cleanup fixes `f7b984347b474da06c33bea4b04e8e11748eeedd`, `b6b33ed8dcfffabedf9628136b03b56dc391e2dc`, `cbd03998f08576119af5aac29d55acb58bc8bb42`.
- Audit current blob `905799b006802acd7e19c875467e15ec6ad30786`; UA-047 latest addendum in USER_ACTIONS blob `4be037b489f37d455ac4bc21ce87dab410914769`; register blob `77e92017a70b09739abeba2d6fdde802b184d352`.
- **Verification performed:** source-level re-fetch confirmed both RPC calls pass TOKEN_VERSION, both waiters have separate application names, deletion-first waits for two PostgreSQL lock waiters, exact token version/event assertions exist, and the EXIT trap cleans child processes/temp files. **NOT RUN:** Bash syntax, Node contract, PostgreSQL concurrency suite, full 151-migration replay, 49 SQL integration tests, or CI. Vercel combined status on the latest observed main commit remains `failure / build-rate-limit`; it is not evidence of a source compilation result. No runtime pass or deployment is claimed.
- Next: obtain an executed isolated CI run of all ten concurrency scripts and the four payment/deletion race paths; then continue remaining release gates. Live payments and first-user invitations remain blocked.


### 2026-11-18 — Deletion queue preflight-job verification

- Added an explicit assertion to the payment/deletion race that each accepted deletion request has exactly one durable `account_deletion_jobs` row with `step_key = 'preflight'` and `status = 'pending'`. This verifies queue enqueueing as well as request state, immutable acceptance event and token-version fence.
- Deletion-first assertions also explicitly verify the user's credit balance through the loaded user row, zero ledger entries, unchanged canceled purchase/subscription, no paid subscription period/tariff, and withheld decisions for both credit and subscription receipts.
- Race script current blob `805a076a23e40e0b7263c5a45bb88035d7c4603b`; safety contract current blob `e315d6cb694465e3ea116c2cf828ef13d8d1f268`; commit `e602d42894db555c6b97ed244bf9834b86bf3303`.
- Detailed audit current blob `619402188b5bd00dea0a0c31e755fb5f154170e4`. Owner action UA-049 added.
- Static verification only. Latest atomic workflow run `44315630744`, job `134840855489`, failed before runner allocation (runner_id 0, zero steps). Bash/Node/PostgreSQL runtime remains NOT VERIFIED.


### 2026-11-18 — Durable deletion queue assertions added to payment races

- Latest harness verifies the actual deletion acceptance RPC in both payment-first and deletion-first outcomes. In each outcome it now requires exactly one immutable `request_accepted` event and exactly one pending `preflight` job; the earlier version did not assert the durable worker job in both outcomes.
- Deletion-first case starts credit and subscription fulfillment in separate sessions and waits for both PostgreSQL lock waiters. Both deletion RPC calls pass the migration-130 three-argument signature and exact fixture token version. Token version must transition 0→1 on the user and request rows.
- Current race script blob `805a076a23e40e0b7263c5a45bb88035d7c4603b`; Node contract blob `e315d6cb694465e3ea116c2cf828ef13d8d1f268`. Commits `ccae989aeb7cbcd4425f16a6896667c9495787ee`, `e602d42894db555c6b97ed244bf9834b86bf3303`.
- Audit blob `af7c20792eda12fd547b934a93b0479a976505c8`; UA-048 addendum in USER_ACTIONS blob `e25af37aabc1a0f1af208c6f1c43528d2d451d3d`; register blob `21006b4aed1b519bb03f98f3c60bb644781b7370`.
- Static re-fetch confirms source/contract wiring and exact assertions. Bash syntax, Node contract, PostgreSQL race, 151 migration replay, 49 SQL tests and CI are **NOT RUN**. Latest observed Vercel status remains `failure / build-rate-limit`; no source build or deployment pass is confirmed. The race leaves immutable fixtures in the disposable clone; the outer runner must drop the clone. Live payments and first-user invitations remain blocked.


### 2026-11-18 — Four isolated deletion/payment concurrency cases

- Refactored the payment/deletion harness into four separately attributable cases: credit payment-first, credit deletion-first, subscription payment-first, subscription deletion-first. Each case has its own user, payment and immutable receipt fixture, two concurrent PostgreSQL sessions and a lock-wait assertion. This replaces the prior combined two-payment transaction scenario.
- Each real deletion acceptance RPC call uses migration 130's `request_account_deletion(uuid,text,bigint)` signature and exact token version. Each case verifies user/request token version 0→1, one immutable `request_accepted` event and one pending `preflight` job. Credit cases assert balance, ledger, purchase state and receipt decision; subscription cases assert tariff, paid period, subscription state and receipt decision.
- Current race script blob `6f1c08950a4a449f5c041aebdf65ca257bd29b4e`; Node concurrency contract blob `91e53359eee7257279e45a6ede7f6d74f86a3ef8`. Refactor commits `a816f858e302e1d2506e283f3a1d34feacaed77c`, `641338e380fb13ce81eef0f8174d7e08f134e5ca`.
- Audit blob `355f09b2374eb773962817ed1860c12435a3cfc5`; owner action UA-050 in USER_ACTIONS blob `d1d6a633400f58e2e704346c058e267e40c40fb6`; register blob `bf3b235b2ec27a4cdda0783a479924ea0a463c8b`.
- Static source re-fetch confirms four case functions, four token-version-bound deletion calls, per-case durable event/job assertions, entitlement checks, cleanup trap and disposable-runner wiring. Bash syntax, Node contract, PostgreSQL concurrency, 151 migration replay, 49 SQL tests and CI remain **NOT RUN**. Latest observed atomic Actions run failed before runner allocation (runner_id 0, no steps); Vercel reports `build-rate-limit`. Runtime remains NOT VERIFIED; no source build, deployment or test pass is claimed. Live payments and first-user invitations remain blocked.


### 2026-11-18 — Four isolated payment/deletion lock-order cases

- Reconciled the latest mainline race test and safety contract. The test is now four independent fixtures/cases rather than two combined transactions: credit payment-first, credit deletion-first, subscription payment-first, subscription deletion-first.
- Every case invokes the real `request_account_deletion(uuid,text,bigint)` with the fixture token version and verifies the token version transition, one immutable `request_accepted` event, one pending `preflight` job, and the correct terminal payment decision/entitlement outcome.
- Current race script blob `6f1c08950a4a449f5c041aebdf65ca257bd29b4e`; safety contract blob `91e53359eee7257279e45a6ede7f6d74f86a3ef8`; contract commit `641338e380fb13ce81eef0f8174d7e08f134e5ca`.
- Detailed report blob `63a74e23ac2f2267b5242ff9db8fbc7800dbb19f`. Owner action UA-050 added below.
- Latest atomic Actions run `44315808409`, job `134841470669`, and persisted-boards run `44315808507`, jobs `134841470967`/`134841471629`, failed before runner allocation (runner_id 0, no steps). Runtime remains NOT VERIFIED.
- Static expected counts remain 151 migrations (010–160), 49 SQL integration tests, 52 Node preflight tests and 10 unique concurrency scripts. Keep payments and first-user invitations blocked pending actual runtime evidence.


### 2026-11-18 — Four independent payment/deletion race cases reconciled

- Final race harness is split into four isolated cases, each with a fresh synthetic user/payment/receipt: credit payment-first, credit deletion-first, subscription payment-first and subscription deletion-first. This avoids treating two payment kinds inside one shared transaction as independent races.
- Every case invokes the actual migration-130 `request_account_deletion(uuid,text,bigint)` RPC with the fixture's expected token version (0), observes a PostgreSQL lock waiter, and checks the resulting token version 0→1, one immutable `request_accepted` event and one pending `preflight` job.
- Credit cases assert the exact balance, ledger count, purchase state and receipt decision. Subscription cases assert tariff, period, subscription state and receipt decision. The outer runner uses a unique disposable database clone; immutable request/event fixtures are intentionally retained until the clone is dropped.
- Current race script blob: `6f1c08950a4a449f5c041aebdf65ca257bd29b4e`; concurrency contract blob: `91e53359eee7257279e45a6ede7f6d74f86a3ef8`; detailed audit blob: `355f09b2374eb773962817ed1860c12435a3cfc5`. Implementation commits: `a816f858e302e1d2506e283f3a1d34feacaed77c` and `641338e380fb13ce81eef0f8174d7e08f134e5ca`.
- Static source checks confirmed four named cases, four three-argument deletion RPC calls, event/job assertions, lock-waiter wiring, no destructive deletion of append-only fixtures, and inclusion in the ten-script disposable concurrency suite. **NOT RUN:** Bash syntax, Node concurrency contract, PostgreSQL race execution, full migration replay, SQL integration suite and CI. Latest observed atomic workflow run `44315808409` / job `134841470669` failed before runner allocation (runner_id 0, zero steps); no test step ran. Runtime remains NOT VERIFIED.
- Release gate unchanged: do not invite first users or enable real payments until the owner-run isolated PostgreSQL replay, SQL suite, Node checks, concurrency suite and external billing configuration are verified.


### 2026-11-18 — Node preflight count corrected to 52

- Recounted the exact current Node preflight files from main: runner contract 33 tests + migration-chain 2 + verify-script contract 17 = **52 tests**. Earlier 51-test references are superseded.
- Other expected acceptance counts remain 151 migrations 010–160, 49 unique SQL integration tests and 10 unique concurrency scripts.
- Count correction report blob: `355f09b2374eb773962817ed1860c12435a3cfc5`. Owner action UA-051 added.
- These are inventory counts, not executed results. Node, Bash, PostgreSQL and CI runtime remain NOT VERIFIED; latest atomic workflow failed before runner allocation.


### Work-period closeout — 2026-11-18

- Main HEAD at the start of this closeout: 4d215a56a0890d08ae5052cc640305f2cb52c904. The live branch was re-fetched; no local checkout or production service was used.
- Current published engineering state: migration 160 terminal decision binding; 151 active migrations (010–160); 49 SQL integration tests with exact workflow/manifest order; 52 Node preflight tests (33 + 2 + 17); 10 unique disposable concurrency scripts.
- Current payment/deletion race harness is four independent cases (credit/subscription × payment-first/deletion-first), uses the real three-argument deletion acceptance RPC, checks token-version fencing, one immutable request_accepted event and one pending preflight job per case, and verifies the relevant credit/subscription entitlement outcome. Current race script blob 6f1c08950a4a449f5c041aebdf65ca257bd29b4e; contract blob 91e53359eee7257279e45a6ede7f6d74f86a3ef8.
- Static contract checks were performed by re-fetching current source and evaluating the race contract's required patterns; all four case names, all four deletion RPC call sites, event/job assertions, token fences, entitlement outcomes, cleanup hooks and ten-script runner inventory matched. This is static validation, not an executed test.
- Current main combined status: Vercel FAILURE / build-rate-limit. Latest observed atomic Actions run 44315808409 / job 134841470669 failed before runner allocation (runner_id 0, no steps). No GitHub Actions PASS, source build, deployment, Node run, Bash run, PostgreSQL replay or SQL runtime pass is evidenced.
- Owner runtime action UA-051 is the current exact 52-test Node preflight; UA-050 covers the four race cases. The 151-migration disposable replay, 49 SQL tests and all ten concurrency scripts must visibly execute and pass before first-user invitations or live payments.
- Detailed current report: docs/audits/2026-11-18-payment-deletion-receipt-race-concurrency.md, blob 355f09b2374eb773962817ed1860c12435a3cfc5. No background work is claimed; next step is owner-run isolated verification and then any remaining production release blockers.


### Final GitHub synchronization — 2026-11-18

- Re-fetched 17 source, migration, workflow, runner, test and documentation artifacts from main. At the start of this final synchronization main HEAD was exactly 08d97687ba617e4a209d0fab94f4b0e06f1481ac; compare(main, that SHA) returned identical.
- Final static inventory: migration 160 present; 151 active migrations 010–160; SQL manifest 49 entries exactly matching the workflow's 49 SQL invocations; Node preflight 52 tests (33 + 2 + 17); ten unique disposable concurrency scripts; four independently named deletion/payment lock-order cases. All current blob IDs are indexed in DOCUMENTATION_REGISTER.md.
- Re-evaluated the current concurrency contract's required regexes against the current race script: four case functions, four real deletion RPC call sites with token-version arguments, account_deletion_jobs and account_deletion_events assertions, entitlement outcomes, cleanup trap and no deletion of append-only request rows all match. This remains static validation only.
- Final combined status on main HEAD: Vercel FAILURE / build-rate-limit. The workflow-run lookup returned no PR-triggered run for this HEAD. Latest observed atomic Actions run 44315808409 / job 134841470669 failed before runner allocation (runner_id 0, zero steps); no runtime test step ran.
- Open PR #91 remains draft and diverged from main (13 commits ahead, 381 behind); no merge was attempted because it is stale and unrelated to the completed mainline work.
- No production database, production data, real payment, Prodamus account or external service was accessed. No tests are claimed as executed. Runtime remains NOT VERIFIED and first-user/live-payment release remains blocked.


### 2026-11-18 — Migration 161 grant-guard and canonical replay alignment

- Reconciled current main, migration 161, payment receipt SQL integration, Node migration contracts, Linux/Windows replay scripts, Windows SQL integration runner and atomic Actions workflow. Found a real consistency defect: migration 161 was present, but the canonical chain test and local runners still enforced 010–160 (151 migrations). The SQL CI workflow also needed to apply 161 in sequence. A clean migration replay or Node chain check would reject/omit the new payment hardening.
- Migration 161 narrows `set_prodamus_payment_decision` to non-grant decisions and introduces a private `mark_prodamus_entitlement_granted` helper that verifies a successful provider receipt and the committed local payment entitlement. Only receipt-bound SECURITY DEFINER fulfillment wrappers call the private helper; direct service_role grant decisions are rejected.
- Updated `backend/test/db-migration-chain.test.js` to require 010–161; `scripts/verify.sh`, `scripts/verify.ps1` and `scripts/verify-integration.ps1` now require 152 migrations 010–161; static contract tests now enforce those exact bounds. Current blobs: chain test `d2957ada44467ce1aecdef9147140ac4ab48aa4f`; Linux replay `5f3d64a9e772d2246276dc83a619d23ea6ee9d68`; Windows replay `23bb3f9f0059b8459b662700ff79e64b6e53b058`; Windows SQL runner `d7bc53a65409ea5e2dbc9a4b658768616f52ce8a`; verify-script contract `3b7e75e070204262895cae42e36af38b83cca36c`; PostgreSQL runner contract `3195cc594e97e03a34bb1303a2e275e199da6dfa`.
- Atomic Actions workflow current blob `9b407f46e4c7188623128738cdebb9fdcbb46b5f` applies `161_restrict_granted_decisions_to_atomic_fulfillment.sql` after migration 160. Payment receipt SQL integration test current blob `00fbe5af225daa0c9c81429a608b8e8240f2b5af` now checks that service_role can record non-grant outcomes but cannot grant, authenticated cannot execute the decision RPC, the private grant helper is unavailable to service_role/authenticated, and a direct `granted` attempt leaves the existing rejected-mismatch decision unchanged. Node contract blob `00ca9a40add8d3f21497d0bb5c5d649620b0b294` checks the migration allowlist, helper revokes, service_role grant and wrapper-only helper calls.
- Migration 161 blob `1565937b13a668af8f894a6e3ee5a8d471c384b4`; original migration commit `520bd43630ad81f052b8d1a53e517d1c7fe010ef`. Other commits: chain `541b0cae9ea7ac284305cc9cec62c7ff33a80127`; Linux runner `1c3cf89b827427945ecb62ca265188af509885ca`; Windows runner `c51ba5d931b59d02fd2d3d7c18294979bc271dd0`; script contract `1f623607e7b02fe3c68bcecd24c7e6bf175aa414`; runner contract `25d3dc99b71b026131431fa74b6bfa83f27bd0e3`; SQL regression `31882a973dd72d7ed3cedb8bf3f2d45c9b495a2f`; Node regression `417cec592382f88b8aaf1f05bb1a36ed2c501b54`.
- Current expected release inventory: baseline 001 + **152 active migrations 010–161**, **49** SQL integration tests, **52** Node preflight tests and **10** unique disposable concurrency scripts. The SQL manifest remains 49 entries because the grant-guard assertions extend the existing payment receipt fulfillment SQL test.
- Audit: `docs/audits/2026-11-18-migration161-grant-guard-and-runner-alignment.md`, commit `d017ed8f3be1797cfe8e2ba8f815d0ade3e7575c`. Owner action UA-052 added; USER_ACTIONS blob `6289699cac16f1370d45f86bd4dfaaa1b8796fa1`; register blob `53f9c97dbcacc89b58309e14402f0c6e810a4c16`.
- **Verification boundary:** re-fetched current source and statically checked updated migration ranges, CI migration 161 invocation, SQL regression assertions and Node contract wiring. Bash, Node, PowerShell, PostgreSQL migration replay, all 49 SQL tests, ten concurrency scripts and CI runtime remain **NOT RUN / NOT VERIFIED**. No test pass, source build or deployment is claimed. No production database or external payment service was accessed.
- Next: inspect the new GitHub Actions runs for actual runner allocation and visible test steps; run owner-controlled 152-migration disposable replay and 49 SQL tests, then verify 52 Node tests and all ten concurrency scripts. Continue frontend/backend runtime and production infrastructure gates after this. Keep live payments and first-user invitations blocked.


### 2026-11-18 — Deterministic pagination for account-deletion preflight inventory

- A separate review of the deletion worker found `fetchAllRows` paginated with PostgREST `.range()` but no explicit `.order()`, despite the helper's stable-order comment. Its callers enumerate subscriptions (for email-outbox ownership), projects and boards (for pin counts). Unspecified order can make page boundaries nondeterministic and undercount the preflight inventory, which is a safety barrier before destructive account erasure.
- Fixed the helper to apply ascending unique primary-key `id` ordering before every page range. All current callers select `id`. Regression mock now records order operations and requires ascending `id` for every paged query, explicitly including subscriptions, projects and boards.
- Worker blob `446961d5b9a75c1007d07e76cefef4a548b943b8`; worker commit `0e56a02de7839d61733c7e7389fcc7214a510361`. Final regression test blob `5882650d115a31b5b6d472db183d6771e142947e`; test commits `f9754ccb434852a2a2d474b353fdf9a4eacacf07`, `36e2bec803c12aad0765116f7af266741e270587`.
- Audit: `docs/audits/2026-11-18-account-deletion-preflight-stable-pagination.md`, commit `5554c125a8e90b6860e3a3215abbad35ef3889b0`. Owner action UA-053; USER_ACTIONS blob `b2ec5ecb75c50a175b2ee5a20c2a555fa0be2577`; register blob `f6fdf365e177099f693e94b25869db19b5ec42c7`.
- Static re-fetch confirmed the worker orders by ascending `id` before `.range()` and the regression checks all three inventory sources. `node --test backend/test/account-deletion-worker.test.js` was **NOT RUN**; no PostgreSQL, Storage, production account or deletion worker execution was performed. Worker remains disabled behind its explicit rollout gate.
- Next: execute the owner regression test, then the full Node/PowerShell/PostgreSQL acceptance sequence from UA-052. Keep production deletion disabled until staging rehearsal and all runtime gates pass.


## Follow-up hardening — symmetric receipt amount validation (2026-11-18)

- Reviewed the newer mainline changes to migration 161's private Prodamus grant helper. The helper had explicit NULL local-amount rejection for credits, but not subscriptions. Although canonical baseline `subscriptions.amount` is currently `NOT NULL`, the security helper should enforce the same invariant for both entitlement types.
- Fixed subscription branch to reject `v_payment_amount IS NULL`, matching the credit branch. Migration current blob: `039b778b89f8d592eda92a7f199176030a1eeb49`; commit `2d3a478d17e4c17995cd2ba407f31b93224a906f`.
- Strengthened `backend/test/postgres-integration-runner-contract.test.js` to require exactly two explicit NULL amount guards, one for credits and one for subscriptions. Test contract blob: `252ab03a5146605a28cb01f465c17d7bf8947f97`; commit `4c02b2afcd2240f08bb9903e5b9afb3cd7442f27`.
- Re-fetched both files after publication: source contains two guards and the static contract requires a count of two. This is not a Node or SQL runtime PASS. Bash/Node/PostgreSQL/PowerShell/CI remain NOT VERIFIED.
- Detailed report: `docs/audits/2026-11-18-prodamus-receipt-webhook-static-review.md`, latest update commit `e41c98fb9b15a250b514659b5a674d462fdbaaeb`.
- No production database, real payment, external account, or deployment was accessed. Next: owner-controlled local execution of the Node contract and disposable PostgreSQL payment regression; continue reviewing other independent launch blockers. Keep first-user invitations and live payments blocked.


### 2026-11-18 — Migration 161 follow-up: exact amount/currency evidence in private grant helper

- Mainline follow-up strengthened `mark_prodamus_entitlement_granted`: it now rejects a missing local payment amount, compares the immutable receipt amount with the committed local payment amount (tolerance 0.01), compares normalized currency, and checks existing decision payment-kind/payment-ID/user binding before a grant. Both credit and subscription branches have the checks.
- Current migration 161 blob `039b778b89f8d592eda92a7f199176030a1eeb49`; hardening commit `6360f302eb5ef6a93c8c624523f1d5ea07eef852`. Receipt-journal SQL privilege test blob `8007fbfc84ade10d7dbe1b6fc4cdda3b5a7e872d`; commit `48495387d933fc93000ce0cbce9a5abca0aeb850`. Node runner contract blob `252ab03a5146605a28cb01f465c17d7bf8947f97`; commit `bcc9e1fe68ee715dd8a244e06f95aedd0e7de1e4`.
- Latest static re-fetch confirms both branches check local amount presence, amount equality, normalized currency, receipt order identity and decision binding. The Node contract requires two missing-amount checks. The receipt-journal SQL test checks authenticated-role restrictions and direct grant rejection.
- Latest atomic Actions run `44317800999` / job `134848439716` failed before runner allocation; zero steps were returned. This is infrastructure failure, not executed test evidence. Runtime remains NOT VERIFIED. Updated audit and UA-052 addendum; no production service or real payment was accessed.
- Next: continue with the isolated 152-migration/49-SQL/52-Node/10-concurrency acceptance gate, then proceed to remaining release blockers. Live payments and first-user invitations remain blocked.


### Final source and workflow synchronization — 2026-11-18

- Re-fetched current main after the migration 161 evidence follow-ups and account-deletion pagination fix. Source blobs are reconciled in DOCUMENTATION_REGISTER; older references in historical sections are superseded by its final source-blob table.
- Latest verified static inventory: **152** contiguous active migrations 010–161; **49** unique SQL manifest entries, all referenced by the atomic-payment workflow; **52** Node preflight test declarations across the three required contract files; **10** concurrency scripts. Workflow applies migration 161 after 160.
- Latest mainline migration 161 blob `039b778b89f8d592eda92a7f199176030a1eeb49`; Node runner contract `252ab03a5146605a28cb01f465c17d7bf8947f97`; SQL receipt privilege test `8007fbfc84ade10d7dbe1b6fc4cdda3b5a7e872d`; account-deletion worker `446961d5b9a75c1007d07e76cefef4a548b943b8`; worker test `5882650d115a31b5b6d472db183d6771e142947e`.
- Latest observed atomic Actions run `44317872327` (commit `4c02b2afcd2240f08bb9903e5b9afb3cd7442f27`) failed before returning any job steps; no test execution is evidenced. Current main combined status remains Vercel FAILURE / `build-rate-limit`. These are infrastructure/platform statuses, not source test results.
- Final docs references: USER_ACTIONS UA-052 (152 migrations / 49 SQL / 52 Node / 10 concurrency), UA-053 (deterministic account deletion inventory), UA-054 (symmetric Prodamus NULL amount guard). Audit reports cover migration/runner alignment, deletion pagination and Prodamus receipt path.
- No Node, Bash, PowerShell, PostgreSQL, SQL integration, concurrency runtime, source build, production DB, live payment, external provider account or deployment was executed in this work period. Runtime and production readiness remain **NOT VERIFIED**. Keep first-user invitations, live payments and account-deletion worker rollout blocked until owner-controlled disposable runtime and staging acceptance are complete.


### Live CI status refresh — 2026-11-18 (supersedes earlier platform status)

- Final documentation HEAD before this status note: `06b7f9e7f72252e8d05bfdd14b9b0bdc0d16dbc2`. Latest GitHub tree and docs were re-fetched; migration inventory remains 152 contiguous migrations 010–161, SQL manifest 49/49 unique entries all referenced by the workflow, 52 Node preflight tests and 10 concurrency scripts.
- Latest atomic Actions run: `44318275401`, job `134850094393`, conclusion `failure`; the job-step API returned an empty list. No test command or PostgreSQL step execution is evidenced. This must not be reported as a source-test failure or a pass.
- Latest persisted-boards workflow run: `44318275331`, conclusion `failure`. No test result is inferred from the summary alone.
- Vercel combined status for the then-current main HEAD is now `pending` with a deployment target, superseding the earlier `build-rate-limit` failure observed on older commits. Pending is not a deployment success; wait for a terminal status before claiming deployment.
- No production DB, real payment, external account, or deployment action was initiated by this work period. Runtime and production readiness remain NOT VERIFIED; first-user invitations and live payments stay blocked.


### 2026-11-18 — Deterministic admin statistics pagination

- Found a second, independent offset-pagination correctness defect: `backend/admin.js` used shared `fetchAllPages` with `.range()` but no `ORDER BY` for both `users` and `credit_transactions`. PostgreSQL does not promise stable row order without an explicit unique order; page boundaries could omit or repeat rows and silently distort signup counts, tariff breakdown, credit sales and credit spend.
- Fixed `fetchAllRows` to order each page by unique primary key `id ASC` before applying its range. Source blob `87bcb9d9d540a1ec4a0700d01f0f94f04a916faf`; commit `ffdb871971c7e6702737e8c3bfc8828bd75696c9`.
- Added `backend/test/admin-stats-pagination.test.js`: covers three pages for each source table and asserts every range is preceded by `id ASC`. Test blob `7788913a7fa20eab951956661ac3d0b0d496866e`; commit `9779a201658a92b0b6b6f9a7b33c3035220768a4`.
- Re-fetched both source and regression files after publication. Node runtime was not executed; the new test is NOT runtime-verified.
- Detailed report: `docs/audits/2026-11-18-admin-statistics-pagination-determinism.md`, audit commit `d7a79b5ba87e7ff083d06b53d8e81269ec822237`.
- Concurrent mainline hardening `031da170684d9ff5d5b2add436d9b9bcd18e2460` also made the account-deletion worker fail closed if either Storage-manifest RPC returns a non-array (previously null was silently treated as empty/complete). Its current worker blob is `d01f59307612b700e9873017da32d5c93025c60a`; existing regression test blob `5882650d115a31b5b6d472db183d6771e142947e` now covers both invalid initial and remaining manifest responses. This closes a distinct deletion safety edge at source level; worker runtime remains NOT VERIFIED and rollout remains disabled.
- Latest combined status for the admin regression commit reports Vercel `build-rate-limit`; no push-triggered Actions execution has been independently confirmed. The earlier atomic run `44317800999` had zero steps; no runtime PASS is inferred.
- Next: run `node --test backend/test/admin-stats-pagination.test.js backend/test/account-deletion-worker.test.js`, then the full Node and disposable PostgreSQL gates from UA-052/053/054. Keep first-user invitations, live payments and deletion-worker rollout blocked.


### Mainline reconciliation after concurrent deletion hardening — 2026-11-18

- Re-fetched current main after concurrent changes to account-deletion inventory. The deletion worker now also rejects a non-array page response from PostgREST rather than silently converting it to an empty page. Current worker blob `1df861ccc0f05cc8b787f51c5e111bc07d3660cb`; fix commit `04bb175803eb2524834785d0599e4d37a77ed2e3`. Regression now covers null inventory page responses; current worker test blob `292c619f9717f862589aecadfa9f9855662b7f9b`; test commit `185d1d8015ee629dbd95a7da0a10de2db835241e`. The earlier invalid Storage-manifest response guards and tests are also present in the current worker/test files.
- Admin pagination source/test remain current at blobs `87bcb9d9d540a1ec4a0700d01f0f94f04a916faf` and `7788913a7fa20eab951956661ac3d0b0d496866e`.
- Latest observed combined status on current docs HEAD `c79c9aa9774b3ced08f225d8266fe9b91b5c344e` reports Vercel FAILURE / `build-rate-limit`. This status is newer than earlier pending observations; do not claim deployment success. No actual Node/PostgreSQL test runtime has been executed in this work period.
- Owner actions UA-053 and UA-055 cover the local deletion worker and admin pagination regression commands. Continue only in a clean local checkout and disposable test database. Keep deletion worker rollout, first-user invitations and live payments blocked.


### Deletion-worker manifest fail-closed audit reference refresh — 2026-11-18

The detailed stable-pagination audit now includes the null/invalid inventory-page and Storage-manifest response addendum. Current audit blob: `d0c94414069590d462a956c701d98c935654f217` (documentation commit `d0c94414069590d462a956c701d98c935654f217`). Current source/test blobs remain worker `1df861ccc0f05cc8b787f51c5e111bc07d3660cb` and test `292c619f9717f862589aecadfa9f9855662b7f9b`; runtime remains NOT VERIFIED.


### Latest platform status after deletion/admin pagination follow-ups — 2026-11-18

- Current pre-note main HEAD: `18056e35326265c24301979461bbc1692b162914`. Re-fetched the current project state, owner actions, documentation register, worker, worker regression, admin statistics source and admin regression.
- Account-deletion worker current blob `1df861ccc0f05cc8b787f51c5e111bc07d3660cb`: deterministic `id ASC` pagination; rejects non-array inventory pages and non-array initial/final Storage manifest responses. Regression blob `292c619f9717f862589aecadfa9f9855662b7f9b` covers all three malformed/null responses.
- Admin stats current source/test blobs `87bcb9d9d540a1ec4a0700d01f0f94f04a916faf` / `7788913a7fa20eab951956661ac3d0b0d496866e`; both users and credit_transactions are paged by unique `id ASC`, with six page requests covered by the test.
- Latest atomic Actions run `44318456320` / job `134850721164` failed; GitHub returned no job steps. Latest persisted-boards run `44318455249` also failed. No test execution is evidenced by these job summaries.
- Vercel combined status for pre-note HEAD `18056e35326265c24301979461bbc1692b162914` is FAILURE / `build-rate-limit`. This is a platform quota status, not a source compilation diagnostic.
- Static inventory remains 152 contiguous migrations 010–161, 49 unique SQL tests all referenced by the workflow, 52 Node preflight test declarations and 10 concurrency scripts. Node/Bash/PowerShell/PostgreSQL/SQL runtime remains NOT VERIFIED. No production data, live payments, Storage objects or real accounts were touched. Keep payments, first-user invitations and deletion-worker rollout blocked.


### Final platform status reconciliation — current main HEAD 2026-11-18

- Current main documentation HEAD: `c4667efd110e09d3ebaf84a307d4f6ca6849570d`; latest code/test commit: `185d1d8015ee629dbd95a7da0a10de2db835241e`.
- GitHub combined status for both the code/test commit and current main HEAD reports Vercel `failure`, target `build-rate-limit`. This is a provider build-limit status, not evidence that application source compilation or tests failed. No deployment success is confirmed.
- Latest recorded atomic Actions run remains `44318275401` / job `134850094393`; no job steps were returned, so no runtime test result is evidenced. No new retry was started.
- Source-level fixes remain published, but Node runtime, disposable PostgreSQL replay, Storage integration, CI and Vercel deployment remain NOT VERIFIED. Keep real payments, first-user invitations and deletion-worker rollout blocked.


### 2026-11-18 — Pinterest scheduler claim RPC fail-closed validation

- Found a scheduler reliability defect in `backend/pinterest.js`: after `claim_due_pin_schedules`, a successful Supabase response with `data: null` or malformed data was coerced through `(dueRows || [])` and counted as a successful empty queue. Due publications could remain unprocessed while the monitor recorded a successful run. Returned rows were also not validated for complete lease/publication identity before heartbeat and processing.
- Added `isValidClaimedScheduleRows(rows, limit)` in `backend/scheduleResponse.js`: requires an array, respects the one-row server limit, validates nonblank `id/user_id/pin_id/pinterest_account_id/pinterest_board_id/claim_token`, and rejects duplicate schedule IDs. Empty `[]` remains valid.
- The Pinterest route now fails the scheduler run on malformed claim data before setting the count, starting heartbeat or iterating rows. Files: response helper blob `7170f77c44442bdf12a33c4b63996978d8705f80`; route blob `d66d34f9042c55371c2a34ef8e74931b391a9e0c`.
- Added unit regression for null/non-array/oversized/duplicate/incomplete identity responses (test blob `c5b4084903e96f5fa808e8fbff31e222a8dfd5f6`) and route ordering contract (test blob `d7f8936167432a3444c0f444968318cf5c919b6c`). Commits: `1acc3aa120a5b073afccf3132b0bf4ea9310f924`, `fb48f225540f4c2d9fa10251ae9faab4a9bee82c`, `793bc081efc6a27c442fe0faa41cacccbde49fa0`, `10f634594a774e963cf02caecfd263546347e094`.
- Re-fetched and inspected all four source/test files after publication. Node runtime and disposable PostgreSQL scheduler tests were NOT run; no runtime PASS is claimed.
- Detailed report: `docs/audits/2026-11-18-pinterest-scheduler-claim-response.md`, audit commit `640e98efe152382524ff7815e8137ffd7ac586bb`.
- No production DB, live Pinterest account, publication or external service was accessed. Next: run two focused Node test files, then scheduler heartbeat/completion-fencing/stale-recovery SQL tests in disposable PostgreSQL. Keep scheduled publishing and first-user launch blocked pending runtime acceptance.


### 2026-11-18 — Pinterest scheduler malformed-claim fail-closed validation

- Targeted review found the scheduler route treated a null/malformed successful claim RPC payload as an empty queue and could report success without processing due work. It also began processing claimed rows before validating the identity required for claim fencing and publication journaling.
- Added `isValidClaimedScheduleRows`: requires an array bounded by the server's limit, complete nonblank identity fields (`id`, `user_id`, `pin_id`, `pinterest_account_id`, `pinterest_board_id`, `claim_token`) and unique schedule IDs. A valid empty RPC response is `[]`; null or malformed data fails the run. Route performs validation before claimed-count assignment, heartbeat and row processing.
- Current source blobs: `backend/scheduleResponse.js` `7170f77c44442bdf12a33c4b63996978d8705f80`; `backend/pinterest.js` `d66d34f9042c55371c2a34ef8e74931b391a9e0c`; unit test `c5b4084903e96f5fa808e8fbff31e222a8dfd5f6`; route contract `d7f8936167432a3444c0f444968318cf5c919b6c`. Claim RPC returns `setof public.pin_schedules` in migration 049 blob `5ade3e2e7a3bd2c3161ef537486fb9101c7c2c05`.
- Commits: `1acc3aa120a5b073afccf3132b0bf4ea9310f924`, `fb48f225540f4c2d9fa10251ae9faab4a9bee82c`, `793bc081efc6a27c442fe0faa41cacccbde49fa0`, `10f634594a774e963cf02caecfd263546347e094`.
- Audit: `docs/audits/2026-11-18-pinterest-scheduler-claim-response.md`, blob `78cac2a515f45884780918f7cc4e651747ce53dc`. Owner action UA-056. Node, PostgreSQL scheduler integration and CI runtime remain NOT VERIFIED; no live Pinterest API or production cron was run. Scheduled publishing and first-user launch remain blocked pending runtime/staging acceptance.


### 2026-11-18 — Scheduler HTTP consumer now validates the full response contract

- Follow-up review found `backend/scheduleWorker.js` accepted any response with `data.ok === true`, despite the existing `isValidScheduleWorkerResponse` contract helper. A malformed success response (missing counters, contradictory counts, duplicate/missing result identity) could reset retry backoff and be logged as a successful batch.
- Worker now validates the complete response contract before resetting failure state or logging success. Source blob `4eff5a721a8f5668876056109902e57ccb8ae1e5`; commit `68ef687186539530a37623dffaca28a73662970b`.
- Added regressions for malformed `ok: true` responses and valid one-item response. Test blob `9757a340c8c2653aa4f71ef42c68a09feea88eb0`; commit `460a54ac3a1da36d728796a5af329fcbd994c941`.
- Updated scheduler audit: `docs/audits/2026-11-18-pinterest-scheduler-claim-response.md`, latest audit commit `d24eebcf73a63285c898360d2552ca7349687328`.
- Combined source and route validation remain static-only; Node runtime and disposable PostgreSQL scheduler tests NOT VERIFIED. Run the UA-056 focused tests and the existing scheduler-worker/health tests locally. Keep publishing and first-user release blocked pending runtime acceptance.


### Scheduler claim/consumer hardening — final verification boundary (2026-11-18)

- Main HEAD after this work period's source, test and documentation commits: `2468bccc99762afdc47306ffda0e06b2da846ead`.
- Source fixes: `scheduleResponse.js` validates claimed schedule arrays and full fencing identity; `pinterest.js` fails the run on malformed claim RPC data before counting/processing; `scheduleWorker.js` validates the full response contract before recording success. Regression coverage is in schedule-response, Pinterest scheduler route-contract and schedule-worker tests.
- Current blobs: `scheduleResponse.js` `7170f77c44442bdf12a33c4b63996978d8705f80`; `pinterest.js` `d66d34f9042c55371c2a34ef8e74931b391a9e0c`; `scheduleWorker.js` `4eff5a721a8f5668876056109902e57ccb8ae1e5`; tests `c5b4084903e96f5fa808e8fbff31e222a8dfd5f6`, `d7f8936167432a3444c0f444968318cf5c919b6c`, `9757a340c8c2653aa4f71ef42c68a09feea88eb0`.
- Focused Node tests were NOT run in this environment. GitHub Actions push runs `44319160489` (atomic payment) and `44319160390` (persisted boards) both concluded failure; their jobs returned `steps: null`, so no test step execution or source failure is evidenced. Combined Vercel status on this HEAD is FAILURE / `build-rate-limit`. No build/deployment success is claimed.
- The audit is `docs/audits/2026-11-18-pinterest-scheduler-claim-response.md`, latest commit `d24eebcf73a63285c898360d2552ca7349687328`; UA-056 contains local acceptance commands. No production DB, live Pinterest account, real publication, or payment was accessed.
- Next: unblock GitHub Actions runner allocation and Vercel quota; then execute focused Node tests and disposable PostgreSQL scheduler/payment integration suites. Keep first-user invitations, live payments and scheduled publishing disabled until all runtime/staging gates pass.


### Final platform status after scheduler response validation — 2026-11-18

- Current main HEAD: `2468bccc99762afdc47306ffda0e06b2da846ead`; latest code/test commit: `460a54ac3a1da36d728796a5af329fcbd994c941` (scheduler worker response-contract regression; implementation `68ef687186539530a37623dffaca28a73662970b`).
- GitHub combined status for both current main and latest code/test commit is Vercel `failure`, target `build-rate-limit`. This is a provider build-limit status; it is not evidence that source compilation or tests ran and failed. Deployment is NOT CONFIRMED.
- Latest recorded atomic Actions run in the project log remains `44318456320` with no job steps returned; no runtime result is evidenced. No repeated retry was started.
- Node, PostgreSQL scheduler integration, disposable DB, CI and Vercel deployment remain NOT VERIFIED. Keep scheduled publishing, first-user invitations and live payments blocked until owner-run runtime and staging acceptance.


### Final reconciliation after strict scheduler test fixture alignment — 2026-11-18

- Mainline follow-up corrected stale `schedule-worker.test.js` fixtures that had returned incomplete `ok: true` payloads or impossible multi-row results. Fixtures now match the strict one-row HTTP response contract; malformed response regressions remain present. Current test blob `ca4bf9a3635c1e29bd328ccc38c68d849772e0c0`; commit `ff8549114d407b66bcbca1e8ac40421bde238cfc`.
- Scheduler audit updated with this fixture alignment and verification boundary; current audit blob `a09bb595bec2708c190df3b16e64bc9cf7b3bd46`; commit `df07d8e64173dc8528f7e059115b184aba59098d`.
- Latest main branch at the time of reconciliation: `12bca69fe65b1021de99e4d033ff2a04eee448d9`. Current scheduler source blobs remain `scheduleResponse.js` `7170f77c44442bdf12a33c4b63996978d8705f80`, `pinterest.js` `d66d34f9042c55371c2a34ef8e74931b391a9e0c`, `scheduleWorker.js` `4eff5a721a8f5668876056109902e57ccb8ae1e5`.
- Latest push Actions runs for fixture commit `ff8549114d407b66bcbca1e8ac40421bde238cfc`: `44319401720` (atomic payment) and `44319401655` (persisted boards), both failure; no runtime test steps/logs available. Vercel combined status remains `failure / build-rate-limit` on main. These platform failures do not prove the source tests failed, but no test/build/deploy PASS is evidenced.
- Keep runtime acceptance and production readiness NOT VERIFIED. Next: restore CI runner/plan quota and execute focused Node + disposable PostgreSQL suites; no production data or live Pinterest/payment activity.


### Final branch synchronization — 2026-11-18

- Current published main HEAD: `731efc620d19b624e073ca7991bc922a3e46a4c4`; latest code/test commit: `ff8549114d407b66bcbca1e8ac40421bde238cfc` (scheduler worker response fixtures aligned with strict response validation).
- GitHub combined Vercel status on current main: `failure / build-rate-limit`. This is an external provider limit, not evidence that source tests failed; deployment is NOT CONFIRMED.
- Latest recorded push Actions runs: atomic payment `44319401720` and persisted boards `44319401655`; both ended failure without job steps/logs. No runtime test result is evidenced.
- All recent source changes are published, but Node, PostgreSQL, Storage, scheduler, CI and deployment runtime remain NOT VERIFIED. No production DB, live payment, live Pinterest publication or deletion-worker rollout was used. First-user launch remains blocked.


### 2026-11-18 — Transactional email outbox claim RPC fail-closed validation

- Found the same unsafe null-to-empty coercion in `dispatchPendingSubscriptionEmails()`: `claim_email_outbox` returns `SETOF public.email_outbox`, but the consumer used `rows || []` after checking only the RPC transport error. A malformed successful response could be reported as an idle queue, silently delaying activation emails.
- Added `isValidEmailOutboxClaimRows(rows, limit)` and validate the complete batch before any SMTP send or mark/retry RPC. The validator requires a bounded array, unique IDs, nonblank `id/claim_token/subscription_id/recipient_email/template_key`, and an object payload; `[]` remains a valid idle result.
- Source blob `3818dedcfbbbac0fa6a1f36b9009328a07d97d67`, commit `4bd9145198a643a5878652054cd41ae77cb529a1`; regression blob `da9438ed59e9d3c3e791a1feee8ffb5ff25f12ad`, commit `c1fc19af5d217a58c29dcbda0d0bdf64ac761f0c`. SQL contract inspected: migration 030 blob `75a4d24e85327384f6089e2d340c9841a857e8eb`.
- Regression cases cover null/non-array/malformed/duplicate/oversized/incomplete claims and prove invalid data triggers no email send and no follow-up RPC. Runtime Node/PostgreSQL tests NOT VERIFIED.
- Detailed audit `docs/audits/2026-11-18-email-outbox-claim-contract.md`, blob `4b429b4a908d7c772a2c6de31cd657c86a21d19c`, commit `d8f6f6ae22469bd58cce46a8d2beb2f743870f18`. Owner action UA-058 records commands and acceptance criteria.
- No SMTP, production DB, customer data, payment or external provider was accessed. Keep first-user launch and live payments blocked pending owner-run Node and disposable PostgreSQL acceptance.

### Work-period closeout — email outbox claim hardening and current CI (2026-11-18)

- Current main HEAD at documentation closeout: `011fa84cb3b09f1f02a3241b32aa3e9be60e5f6e`.
- Email outbox source fix and regression are published: `backend/billing.js` blob `3818dedcfbbbac0fa6a1f36b9009328a07d97d67`; `backend/test/email-outbox.test.js` blob `da9438ed59e9d3c3e791a1feee8ffb5ff25f12ad`. Audit blob `4b429b4a908d7c772a2c6de31cd657c86a21d19c`; owner instructions UA-058.
- Latest observed Actions runs `44320063124`, `44320063459`, `44320068909`, and `44320069081` concluded failure; GitHub job responses returned `steps: null`, so no test execution or source failure can be inferred. Vercel combined status on latest main remains `failure / build-rate-limit`.
- Source/test changes were re-fetched and statically inspected. Node email-outbox tests, PostgreSQL outbox SQL tests, full backend suite, frontend build and deployment remain NOT VERIFIED. Do not claim runtime PASS.
- No production DB, SMTP provider, customer email, live payment, or external Pinterest action was used. First-user invitations and live payments remain blocked pending owner-run Node/PostgreSQL/staging acceptance and CI/Vercel quota resolution.


### 2026-11-18 — Account deletion worker claim RPC fail-closed validation

- Continued the queue-contract sweep and found `createAccountDeletionWorker().tick()` also coerced malformed `claim_account_deletion_jobs` results through `jobs || []`, reporting a successful empty batch. The SQL function in migration 130 returns a table with seven required fields; a malformed job could reach destructive account-erasure processing without validating the lease identity or stage.
- Added `isValidDeletionJobBatch()` and reject null/non-array/oversized/duplicate/incomplete rows, unsupported stages, invalid attempts and invalid lease expiry before processing any job. Valid `[]` remains a safe idle result. The worker claims one job per tick.
- Source blob `2b937219c865352e6b3f4167e9568c732c377a67`, commit `2cdf0c9fceca0f80d061de24c8a477daf0cd3cf1`; regression blob `351c77a749abed04b59aef3684568670ace9d802`, commit `ffad0d99dace0119afeb0b29d7c20844b675f315`. SQL contract migration 130 blob `1dcf7844444b4a70be1be49946d5a4c4265ce40f`.
- Added tests that malformed claim responses trigger only the claim RPC and never invoke a destructive stage RPC. Node/PostgreSQL runtime NOT VERIFIED.
- Detailed audit `docs/audits/2026-11-18-account-deletion-claim-contract.md`, blob `9e4f6cd668cb5db50a23b3a658b29b6096f3599e`, commit `a765c492764c56232b732cf61eb6bf70f4cced21`. Owner action UA-059 added.
- Account deletion worker remains disabled. No production account, DB, Storage object or user data was accessed. Keep worker disabled until disposable runtime/staging acceptance.


### Final work-period verification — queue claim contract sweep (2026-11-18)

- Current main HEAD before this closeout note: `05a2768b400f08290f69433bbdc5c5b307a3bd42`.
- This period closed two additional queue-consumer defects: email outbox claim validation (`backend/billing.js`, `4bd9145198a643a5878652054cd41ae77cb529a1`) and account deletion claim validation (`backend/accountDeletionWorker.js`, `2cdf0c9fceca0f80d061de24c8a477daf0cd3cf1`); regression commits `c1fc19af5d217a58c29dcbda0d0bdf64ac761f0c` and `ffad0d99dace0119afeb0b29d7c20844b675f315`.
- Re-fetched current source/test files after publication. Email outbox batch now validates unique fenced rows before SMTP; account deletion batch validates full job identity/stage/lease before any stage RPC. Account deletion worker remains disabled.
- Latest Actions runs after these changes: `44320553737` (atomic payment), `44320553241` (persisted boards), `44320543687` (atomic payment), `44320543564` (persisted boards). All failed and job API returned `steps: null`; no test step execution or source failure is evidenced. Vercel remains `failure / build-rate-limit` on main.
- Node tests, PostgreSQL integration, full backend suite, frontend build and deployment are NOT VERIFIED. No runtime PASS is claimed. Owner steps UA-058 and UA-059 contain clean-checkout commands.
- No production DB, SMTP, customer email, live payment, account deletion or Pinterest publishing was performed. Next: owner-run focused Node and disposable PostgreSQL acceptance after CI runner/Vercel quota is restored; continue reviewing remaining queue/RPC consumers. First-user launch remains blocked.


### 2026-11-18 — Account deletion claim fixture alignment

- Follow-up inspection found that the strict validator added to `backend/accountDeletionWorker.js` requires the full migration 130 claim row, but 14 pre-existing worker test stubs still returned partial rows. Those tests would fail at the new validation boundary before exercising their intended stage behavior.
- Updated all 14 valid worker claim fixtures with `request_id`, `attempts: 1`, and parseable `lease_expires_at`. Kept the intentionally incomplete `job-incomplete` malformed-response fixture unchanged.
- Worker source remains unchanged: blob `2b937219c865352e6b3f4167e9568c732c377a67`. Test blob after re-fetch: `94c7683aba347fb98293a2bb63d2328a4d3404d6`; test commit `33299508fcef9cab4141fec4a8974294e0f53a40`.
- Added detailed report `docs/audits/2026-11-18-account-deletion-claim-fixture-alignment.md`, created by commit `6bbcca306f65ba4c3fb0f170ef29c5ab535d5d4c`.
- Static re-fetch/scan: 14 valid fixtures now carry all required added fields; deliberately malformed fixture remains malformed. Runtime Node tests and PostgreSQL integration are NOT VERIFIED.
- No SQL, production source, worker enablement, production database, account data, Storage objects, payments, or external services were changed/accessed. Account deletion worker remains disabled.
- Owner acceptance is recorded as UA-060. Continue reviewing remaining RPC consumers; do not claim runtime success or launch readiness.


### 2026-11-18 — Account deletion exact-count fail-closed validation

- Found three unsafe exact-count conversions in account-deletion preflight: direct owned-table counts, email_outbox counts, and pins-by-board counts used `Number(count || 0)`. A null/missing count without a transport error was treated as a confirmed zero and could understate the deletion inventory.
- Added `normalizeExactCount(count, table)`: only non-negative safe integer values are accepted; malformed values throw `invalid_exact_count`. Applied consistently to all three count paths and exported the pure helper.
- Added regression tests for valid zero/positive values and null, undefined, string, fractional, negative, infinite, and unsafe values. Source blob `3b045acd8600f372a712f0792760eb3145ea1e87`; test blob `ca4786fe629e75662715027c100664bfaa40254b`.
- Source commit `84fd644bd1da61461af41925ed111e1b6be8fb22`; test commit `2a356ba88c3aabdf2da5c57e534c67fd4612ed0d`; audit commit `3dc4e48ef01daa03c2f684b787eff1585b47d091`.
- Re-fetched source/test from GitHub. Static scan confirms zero permissive `Number(count || 0)` conversions remain in the worker and strict normalization is used at each count site. Node runtime test and disposable PostgreSQL integration remain NOT VERIFIED.
- No production DB, account data, Storage objects, external provider, worker enablement, SQL migration, or deployment was touched. Account deletion worker remains disabled.
- Owner action UA-061 records the focused test command. Continue with independent RPC and lifecycle review; no production launch approval.


### Work-period closeout — account deletion inventory exact-count hardening (2026-11-18)

- Mainline source commit `84fd644bd1da61461af41925ed111e1b6be8fb22` added strict exact-count normalization; regression commit `2a356ba88c3aabdf2da5c57e534c67fd4612ed0d` added malformed count tests; audit commit `3dc4e48ef01daa03c2f684b787eff1585b47d091` records the root cause and verification boundary.
- Current source blob `backend/accountDeletionWorker.js`: `3b045acd8600f372a712f0792760eb3145ea1e87`; test blob `backend/test/account-deletion-worker.test.js`: `ca4786fe629e75662715027c100664bfaa40254b`.
- Re-fetched source/test and statically confirmed no `Number(count || 0)` remains in the account-deletion worker; exact counts for owned tables, email_outbox and pins all pass through `normalizeExactCount`. Focused test coverage includes valid zero and positive counts plus malformed values.
- CI triggered for source/test commits: Actions runs `44321585302` and `44321591813` (atomic-payment integration), `44321585307` and `44321591809` (persisted boards). All concluded failure; latest job records had `steps: null`; direct log fetch returned `BlobNotFound`. Therefore no test-step execution or code-level failure is evidenced. Vercel still reports `failure / build-rate-limit`.
- Runtime Node test, disposable PostgreSQL integration, full backend/frontend suite and deployment remain NOT VERIFIED. No runtime PASS claimed. Account deletion worker remains disabled. No production DB, real account, Storage object, live payment, SMTP or Pinterest action was used.
- Owner acceptance UA-061: run `node --test backend/test/account-deletion-worker.test.js` and disposable PostgreSQL account-deletion queue/storage-manifest tests from clean checkout. Next independent work: continue fail-closed review of account deletion lifecycle and remaining RPC consumers. First-user launch and live payments remain blocked.


### 2026-11-18 — Account deletion Storage manifest batch validation

- Продолжен fail-closed review account-deletion lifecycle после exact-count hardening. SQL contract migration 137 ограничивает `list_account_deletion_storage_manifest` пределом 100 строк; worker ранее проверял записи по одной непосредственно перед Storage deletion и не проверял уникальность/общий размер всего успешного RPC-ответа до начала side effects.
- Добавлен `isValidStorageManifestBatch`: принимает только массив до 100 записей, bucket `pin-images`, разрешённый managed path и уникальные пары bucket/path. Весь batch валидируется до первого `deleteImageObject`. Для remaining-manifest RPC с `p_limit: 1` отклоняются ответы длиннее одной строки.
- Добавлены unit/regression tests: empty/valid, oversized, duplicate, unsafe path, wrong bucket; worker test подтверждает, что duplicate batch вызывает ноль Storage delete calls и переводится в retry.
- Source blob `backend/accountDeletionWorker.js`: `92ea2372231ea87988548776b5f4208d050b807a`; final source commit `d41c16d4caee20d5cd5ed01ecebb45123e255102`. Test blob `backend/test/account-deletion-worker.test.js`: `5539dbdb79daed9e325ded45610b9a29d4680dc1`; test commit `98a65d8669baf7349946063e5dcfd9d34859557f`.
- Подробный отчёт `docs/audits/2026-11-18-account-deletion-storage-manifest-batch-validation.md`, commit `211bb555b0d3a212d1322e39a8ce2e8b49ad3d3d`; owner action UA-062 добавлен в `docs/USER_ACTIONS.md`.
- Проверены повторным fetch из GitHub source/test и SQL contract. Это статическая проверка; Node tests, PostgreSQL integration, full suite, CI и deployment NOT VERIFIED. Account-deletion worker остаётся disabled; production DB/Storage/account не затрагивались.
- Следующий шаг: owner-run UA-062 focused Node test и disposable PostgreSQL deletion/Storage-manifest integration; независимо продолжить проверку lifecycle SQL/worker на race/fencing/response-contract gaps.

### Platform reconciliation — Storage manifest batch validation (2026-11-18)

- Vercel combined status was `success` for test commit `98a65d8669baf7349946063e5dcfd9d34859557f` and documentation HEAD `3e641569209385fb8c9caaef3db0ead0065f5cbc` at check time. This is a provider status only; it is not treated as proof of production deployment.
- GitHub workflow-run lookup returned an empty list for the source commit `d41c16d4caee20d5cd5ed01ecebb45123e255102` and test commit `98a65d8669baf7349946063e5dcfd9d34859557f`; no Node test execution evidence is available.
- Focused Node tests, disposable PostgreSQL integration and production deployment acceptance remain NOT VERIFIED. Keep the deletion worker disabled.
### 2026-11-18 — First real runtime verification period (backend + frontend GREEN)

- **The repository test suites had never been executed in this project's recorded history.** This period executed them locally and fixed every failure. Environment: Windows, Node.js `v22.23.2`, npm `10.9.8`, PostgreSQL client/server binaries v17 present.
- **Backend:** `cd backend && node --test` → first run `723 tests / 692 pass / 31 fail`; after the fixes below **`724 tests / 724 pass / 0 fail`**.
- **Frontend:** `npx tsc --noEmit` → **0 errors** (was 5 errors / 2 files); `npm test` → **221/221 pass**; `npm run build` → **success** (bundle emitted to the git-ignored `frontend/dist`).
- Commits: `d77100b7` (backend suite + Prodamus), `b670602a` (frontend sign-in crash), `ff6dddc4` (bounded pager fail-closed).

#### Real defects found and fixed
1. **Sign-in was completely broken (production-blocking).** `frontend/src/pages/Login.tsx` read `t.common.hide` / `t.common.show`, but `getAuthCopy()` returns a flat copy object with no `common` key. Rendering `/login` threw `TypeError: Cannot read properties of undefined`. Fixed to `t.hide` / `t.show` (matching `Register.tsx`). Found by `tsc --noEmit`, not by any test.
2. **Prodamus configuration errors were reported as provider outages.** `createPaymentLink()` called `baseUrl()` inside the `try` block around `axios.post`, so an invalid/non-HTTPS `PRODAMUS_URL` was swallowed and rethrown as `502 «Платёжный сервис не отвечает»`. The endpoint is now resolved and validated before signing/sending, so misconfiguration fails closed with its own HTTP 500 and no signed request can be sent to an insecure endpoint.
3. **Bounded pager silently truncated collections.** `backend/fetchAllPages.js` coerced a successful non-array page payload (`data: null`) to `[]` and treated it as end-of-list, so schedules, review queue, board pins, admin statistics and project/board inventories could be returned incomplete while looking complete. Both the page read and the overflow probe now reject a non-array payload with HTTP 502.

#### Test defects corrected (no production behaviour weakened)
- `account-deletion-worker`: preflight claim fixtures lacked `step_key` (rejected by the strict claim validator); board-pagination fixture could never exceed one page; the null-page fixture actually exercised the exact-count path; the erase-stage test asserted the pre-Storage-manifest RPC order.
- `admin-stats`: query double lacked `.order()` after deterministic `id ASC` paging was added; it now asserts the ordering.
- `admin-subscription-limit`: missing `require("./helpers/env")`, so the file crashed on `SUPABASE_URL is required` at require time.
- `board-pins-pagination`, `review-queue-route-contract`, `pinterest-scheduler-route-contract`: asserted the removed hand-written page loops instead of the shared `fetchAllPages` pager and the resolved `snapshotDestinationUrl` flow.
- `payment-provider-receipts`: asserted the generic "did not confirm" path using a `granted` decision, which is now rejected earlier by design; now uses a non-grant decision.
- `pin-status-publication-fencing`: `"public\.pin_schedules"` string literal (escaped dot) never matched, and the real function declares `v_schedule public.pin_schedules%rowtype` before the lock; the assertion now targets `from public.pin_schedules`.
- `pinterest-schedule`: retryability fixture missed `user_id`/`pin_id`; expected failure reasons had to follow the guard order; the journal-failure message is localized.
- `postgres-integration-runner-contract`: heredoc extraction hardcoded `\n` while `.github/workflows/atomic-payment-integration.yml` is CRLF; four migration tests asserted a `revoke … activate_paid_subscription` line that exists only in migrations 157/011/019/030 (copy-paste), now asserting the revokes those migrations actually contain; one regex was double-escaped (`[\s\S]`).
- `startup-config`: the byte-length test used 16 Cyrillic characters (exactly 32 UTF-8 bytes, i.e. accepted) while asserting a rejection; now 15 characters reject and 16 accept.
- `payment-provider-receipt-fulfillment.integration.sql`: replaced a combined service-role/authenticated privilege check with three explicit checks, adding positive assertions that `authenticated` can execute neither `mark_prodamus_entitlement_granted` nor `set_prodamus_payment_decision`.

#### Still NOT VERIFIED — SQL runtime gate is BLOCKED (concrete reason)
- The migration chain and the 49 SQL integration files were **not** executed here. `initdb` fails with `file "C:/Program Files/PostgreSQL/17/share/postgres.bki" does not exist` (client-only installation), so a disposable cluster cannot be created; the only reachable server (`127.0.0.1:5432`) requires a password that is not available to this session and was not guessed; Docker/Podman are absent and the npm registry is unreachable, so an embedded PostgreSQL could not be installed.
- Consequently `docs/USER_ACTIONS.md` UA-052/053/056/058/059/060/061/062 runtime commands still require the owner's machine, and no SQL, concurrency, staging or deployment PASS is claimed.
- CI/Vercel: the GitHub Actions jobs still fail before their first step and Vercel reports `build-rate-limit`; those statuses were not re-tested here and are not evidence about the source.

#### Next steps
1. Owner: run the SQL gate on a machine with a complete PostgreSQL server install (`scripts/verify-integration.ps1`) and report the output; this is now the largest remaining unverified area (schema, RLS, triggers, SQL functions).
2. Continue defect hunting in user-visible flows with the suites as a safety net; the two defects above were found by typecheck/inspection, not by tests, so coverage of real page rendering and route wiring remains thin.
3. Keep first-user invitations, live payments, scheduled publishing and the account-deletion worker blocked until the SQL/staging gates pass.

### 2026-11-18 — Полный журнал сессии и обновлённый статус проверок

- Подробная хронология всех действий этой сессии (что, зачем, какой командой, какой фактический результат, какое решение) вынесена в отдельный документ: `docs/audits/2026-11-18-runtime-verification-session.md`. В нём же зафиксированы все отклонённые/неудавшиеся попытки с точными сообщениями об ошибках и перечень того, что осталось непроверенным.
- Актуальные фактические результаты: backend `node --test` → **729/729 pass**; frontend `tsc --noEmit` → **0 ошибок**; frontend `npm test` → **225/225 pass**; frontend `npm run build` → **успех** (build теперь включает typecheck).
- Реальные дефекты, исправленные в этой сессии: полная поломка страницы входа (`t.common.hide`/`t.common.show` при плоском объекте копий → `TypeError` при рендере `/login`); маскировка ошибки конфигурации `PRODAMUS_URL` под 502 «провайдер недоступен»; fail-open усечение коллекций в `fetchAllPages` при не-массивном ответе страницы.
- Новые стражи: `backend/test/http-contract.test.js` (401 для 17 защищённых маршрутов, поддельный JWT, 400/404/413/415, публичные каталоги без БД) и `frontend/src/lib/authCopyUsage.test.ts` (все используемые auth-ключа существуют во всех 7 языках; одинаковый набор и placeholders).
- SQL-гейт по-прежнему НЕ выполнен. Причина подтверждена шестью независимыми проверками (см. раздел 9 журнала): неполная установка PostgreSQL (`initdb` → нет `share/postgres.bki`), Linux-only `scripts/verify.sh`, отсутствие Docker, недоступный npm registry, неизвестный пароль к работающему кластеру и блокировка политикой среды при попытке использовать предоставленный владельцем пароль.
- Владельцу добавлено действие UA-063 в `docs/USER_ACTIONS.md` с точными командами и ограничениями.
- `git push origin main` не выполнен: операция отклонена политикой среды. Коммиты `d77100b7`, `b670602a`, `ff6dddc4`, `e61a937e`, `3cc7f4e2` и коммит этого документа остаются локальными и требуют `git push` со стороны владельца.
- Блокировки сохраняются: живые платежи, приглашения первых пользователей, планируемая публикация и account-deletion worker — до прохождения SQL/staging-гейтов.

### 2026-11-18 — Продолжение: хардненинг конфигурации, readiness и реальная аналитика

- Обновлена хронология: `docs/audits/2026-11-18-runtime-verification-session.md` (раздел 12) — что найдено, почему это дефект, что изменено, какими командами проверено.
- Коммиты этого этапа: `9aa3e7a2` (контракт маршрутов фронтенд⇄бэкенд), `519b5c7a` (fail-closed dev-topup + тесты credits), `31ff0305` (fail-closed `NODE_ENV` для service-role ключа и демо-платежей), `ab7a44f5` (liveness/readiness), `2c38ed2d` (реальная публикационная аналитика).
- Найденные и исправленные дефекты: dev-пополнение кредитов было доступно при незаданном `NODE_ENV`; сервис мог стартовать с anon-ключом вне явного локального окружения; демо-платежи могли выдать реальный тариф на staging; `/health` всегда сообщал «здоров» даже без БД; вкладка аналитики была заглушкой с обещанием несобираемых метрик.
- **Фактические результаты на текущий момент:** backend `node --test` → **750/750 pass**; frontend `tsc --noEmit` → **0 ошибок**; frontend `npm test` → **234/234 pass**; `npm run build` → **успех**.
- **Аналитика:** реализован `GET /analytics/summary` только на данных, которыми владеет сервис (публикации и расписания), с fail-closed валидацией счётчиков; метрики Pinterest (impressions/saves/clicks) отсутствуют и это явно сообщается в UI. Сбор этих метрик — отдельная незавершённая задача, выдавать её за готовую нельзя.
- **Изменение требований к окружению:** `SUPABASE_SERVICE_ROLE_KEY` теперь обязателен везде, кроме явных `NODE_ENV=development|test`; при незаданном `NODE_ENV` сервис не стартует (раньше молча работал с anon-ключом). Это отражено в `backend/.env.example`. Перед деплоем проверить, что на Render `NODE_ENV=production` и ключ задан.
- **Readiness:** для платформенных проверок использовать `/ready` (503 при недоступной БД); `/health` остаётся liveness-пробой.
- **По-прежнему НЕ ПРОВЕРЕНО:** SQL-gate (миграции 010–161, 49 SQL integration файлов, 10 concurrency-скриптов — нужен UA-063), staging/E2E, живые платежи, живой Pinterest OAuth/публикация, мониторинг, бэкап/restore, deployment. Все коммиты остаются локальными: `git push` блокируется средой.

### 2026-11-18 — Глобальный лимит запросов и устойчивость парсера контрактов

- **Дефект:** аутентифицированные читающие маршруты (включая админские, пагинирующие целые таблицы) не были ограничены ничем, кроме авторизации; один аккаунт мог исчерпать квоту БД и уронить сервис для остальных.
- **Исправление:** глобальный лимит (300 req/60 s, настраивается `API_RATE_LIMIT_MAX`, `API_RATE_LIMIT_WINDOW_MS`), ключ — хэш bearer-токена или IP, `/health` и `/ready` исключены. Коммит `ca9bfe10`.
- **Проверено реальным HTTP-запросом:** при бюджете 5 шестой запрос → 429, `/health` → 200.
- **Известное ограничение:** лимит хранится в памяти процесса; при нескольких инстансах нужен общий store (Redis). Задача открыта.
- **Актуальные проверки:** backend `node --test` → **751/751**; frontend `tsc` — 0 ошибок, `npm test` → 235/235, `npm run build` — успех.
- Хронология: раздел 13 в `docs/audits/2026-11-18-runtime-verification-session.md`.

### 2026-11-18 — Подготовлен owner-run SQL-gate (одна команда) и устранён флейк

- Причина, по которой SQL-гейт не выполнен ассистентом, окончательно подтверждена: среда блокирует использование пароля, переданного в переписке. Обход не применялся.
- Вместо этого добавлен `scripts/verify-sql-windows.ps1` — Windows-аналог `verify.sh --migrations`, расширенный прогоном SQL integration файлов в порядке CI. Пароль запрашивается интерактивно (`Read-Host -AsSecureString`), используется только через `PGPASSWORD` и очищается в `finally`. Скрипт отказывается работать с не-loopback хостом, требует непрерывную цепочку `010..161`, создаёт ровно одну одноразовую БД и удаляет только её.
- Guard rails защищены тестом `backend/test/sql-gate-script-contract.test.js` (7 проверок): отсутствие параметра пароля, loopback-only, имя одноразовой БД, cleanup в `finally`, отказ при разрыве цепочки миграций, порог ≥40 SQL-файлов, сохранённый grant перед миграцией 039.
- Устранён флейк теста heartbeat планировщика: он спал фиксированные 75 мс и падал под параллельной нагрузкой; теперь ждёт условие с ограниченным дедлайном и проверяет реальные инварианты (повторные продления, отсутствие наложений, отсутствие вызовов после остановки).
- **Проверки:** `powershell` parser → PASS; backend `node --test` → **758/758** три полных прогона подряд без падений.
- Инструкция владельцу: **UA-064** в `docs/USER_ACTIONS.md`.

### 2026-11-18 — Первый фактический прогон SQL-gate: 152 миграции применились, найден и починен дефект

- **Прогон выполнен владельцем** (скрипт из UA-064). Факты: PostgreSQL 18.6, одноразовая БД `pinposy_verify_7bb1bd4b` создана и удалена, цепочка `010..161` непрерывна, **все 152 миграции применились без ошибок** (`Schema replay OK: baseline + 152 migrations`), затем прошли 13 SQL integration файлов.
- **Найден реальный дефект:** `backend/test/payment-provider-receipt-fulfillment.integration.sql` заканчивался строкой `$;` вместо `$$;` — весь файл читался как одна незакрытая dollar-quoted строка, psql падал на последней строке. Регрессия внесена коммитом `31882a97`; файл ни разу не исполнялся, поэтому дефект жил незамеченным. Исправлено коммитом `b4882674`.
- **Добавлены статические защиты без базы данных:** `scripts/lib/sql-lexer.cjs` (лексер PostgreSQL: `--`-комментарии, вложенные блочные, экранирование в `'...'` и `"..."`, внутри открытого тега закрытием считается только тот же тег) и `backend/test/sql-dollar-quote-balance.test.js` — воспроизводит именно эту регрессию и проверяет все **223** SQL-файла в `db/` и `backend/test/`.
- **Скрипт гейта улучшен по итогам прогона:** статическая проверка SQL **до** запроса пароля; UTF-8 сквозняком (`PGCLIENTENCODING`, `chcp 65001`); строкификация stderr (раньше ошибки psql печатались как `System.Management.Automation.RemoteException`); режим `-KeepGoing` — пройти все файлы и вывести список всех падений. Контрактный тест расширен до 10 проверок (включая «статическая проверка идёт до пароля»).
- **Проверки:** backend `node --test` → **764/764**; PowerShell parser → PASS; статическая проверка SQL → 223 файла, 0 расхождений.
- **Всё ещё НЕ проверено:** SQL-файлы №15–53 (39 файлов), скрипт конкуренции `backend/test/run-disposable-concurrency-suite.sh`, staging/E2E, живые платежи, живой Pinterest OAuth и публикация, бэкапы, мониторинг, деплой.
- Полная хронология: сводный реестр действий и раздел 14 в `docs/audits/2026-11-18-runtime-verification-session.md`.

### 2026-11-18 — Пакеты кредитов fail-closed + статическая сверка SQL-тестов с миграциями

- **`creditPacks.js` был единственным модулем без тестов — и это деньги.** Найдено и исправлено: (1) `packAmount` игнорировал валюту и всегда возвращал рублёвую сумму — при появлении второй валюты покупатель был бы списан по чужой цене; теперь цена адресуется по валюте и отсутствие цены даёт `500`, а не бесплатный пакет; (2) каталог не валидировался — добавлена `assertCatalogIntegrity()` на загрузке модуля (нулевые/дробные/дублирующие цены, `id` ≠ количеству кредитов, отсутствующий `title`, отсутствующая цена валюты); (3) `normalizePackId` через `String()` принимал `{"package_id": ["pack_100"]}`; теперь только строки, ключи прототипа не резолвятся.
- **Тесты:** `backend/test/credit-packs.test.js` (7 тестов, включая «нет пакета, который дороже за кредит, чем меньший» и невозможность изменить каталог через копию). Форма ответа `/billing/credit-packs` не изменилась.
- **Статическая сверка SQL без базы:** `backend/test/sql-expectation-drift.test.js` извлекает ожидания из `sqlerrm =`/`<>`/`position(... in sqlerrm)` и `v_*_definition` и сверяет с `db/migrations` + `db/archive` — **24 реальных межмиграционных утверждения** проверяются без PostgreSQL; 21 «сторожевое» сообщение, которое тест поднимает сам, намеренно исключено (обнаружено первым прогоном, исправлено).
- **Проверки:** backend `node --test` → **774/774** pass.
- Коммиты: `c9a12e41`, `603978b9`. Хронология: раздел 15 в `docs/audits/2026-11-18-runtime-verification-session.md`.

### 2026-11-18 — Второй прогон SQL-gate: найдена потеря письма об активации и утечка токена

Владелец прогнал гейт с `-KeepGoing`: **152 миграции применились**, **47 из 53 SQL-файлов прошли**, 6 упали. Разбор каждого падения:

- **РЕАЛЬНЫЙ ДЕФЕКТ ПРОДУКТА (исправлен миграцией `162`):** миграция `157` пересоздала `activate_paid_subscription` и потеряла вставку в `email_outbox`, которую ставила миграция `030`. Других вставок в `email_outbox` нет нигде (бэкенд только читает и отправляет), поэтому **с миграции 157 платящий пользователь не получал письмо об активации вообще**. Вставка восстановлена атомарно, контракт не менялся; SQL-тест был прав и не менялся.
- **УТЕЧКА В СХЕМЕ (исправлена миграцией `163`):** RPC `admin_list_pinterest_schedule_inventory` возвращал `claim_token` — токен аренды воркера. Бэкенд его не отдавал, но RPC возвращал секрет вызывающему. Теперь возвращается `claim_present` (boolean); `adminPinterestInventory.js` неожидаемый тип отвергает с `500`, до-`163` ответ принимает и токен наружу не пропускает. Тестов модуля 8 → 12.
- **Синтаксис:** апостроф в `user's` внутри `'...'` делал файл непарсируемым (значит, его никогда не запускали). Экранировано.
- **Три устаревшие фикстуры** приведены к текущим контрактам: guard возврата средств (072) — теперь сначала утверждается отказ прямому переводу в `failed`, затем проходит поддерживаемый путь record → reconcile → finalize (тест стал строже); неизменяемость снимка расписания (087) — кейс «нет креатива» строится на расписании без снимка; `complete_pinterest_publish_v2` (112) ставит `published` — проверка отключения аккаунта переписана на фактический инвариант (`published` + сохранённый remote pin id).

**Новые статические защиты** (появились из-за моей же ошибки — `v_board_id` в файле с `v_board`): `scripts/lib/sql-plpgsql-vars.cjs` + `backend/test/sql-declared-variables.test.js` проверяют, что каждая `v_...` объявлена в своём файле; проверка добавлена в pre-flight PowerShell-скрипта рядом с проверкой dollar-quotes. Цепочка миграций расширена до `163` в `db-migration-chain.test.js`, `scripts/verify.sh` и контрактном тесте Windows-скрипта.

- **Проверки:** backend `node --test` → **782/782**; frontend `npm test` → **234/234**, `tsc` — 0 ошибок; статический pre-flight — 225 файлов, 0 падений.
- **Коммиты:** `9428ff8a` (162 + фикстуры), `0deb25c2` (163 + админ-тесты), `3f893feb` (статическая проверка переменных).
- **НЕ проверено:** повторный прогон гейта после этих правок, скрипт конкуренции, staging/E2E, живые платежи и Pinterest.
- Хронология: раздел 16 и реестр (32 строки) в `docs/audits/2026-11-18-runtime-verification-session.md`.

### 2026-11-18 — Третий прогон гейта: 154 миграции, 52/53 файлов, последнее падение устранено

- **Прогон владельца:** цепочка `010..163` (154 миграции) применилась полностью, **52 из 53** SQL-файлов прошли. Упал один — `pinterest-account-publication.integration.sql`.
- **Причина:** миграция `087` сделала `pin_schedules_pin_id_fkey` как `ON DELETE RESTRICT`, а для RESTRICT PostgreSQL выдаёт SQLSTATE **23001 `restrict_violation`**, не `23503 foreign_key_violation`. Тест ожидал отказа удаления пина с расписанием, но обработчик ждал другой код, и ожидаемый отказ вылетал наружу как ошибка. Исправлено: все три обработчика принимают оба SQLSTATE; проверяется факт отказа, а не его вид.
- **Проверено на стороне продукта:** маршрута удаления пина в бэкенде нет, поэтому строгий внешний ключ не создаёт пользователю пути к `500`.
- **Защита от повторения:** в `sql-expectation-drift.test.js` добавлено правило «если блок охраняет `delete from public.pins` и указывает `foreign_key_violation`, он обязан указывать и `restrict_violation`». Правило сужено, чтобы не задевать законный обработчик `sqlstate '55000'` в `pin-image-deletion-claims.integration.sql` (первый вариант правила дал на нём ложное срабатывание — замечено и исправлено).
- **Проверки:** backend `node --test` → **783/783**.
- **Ожидание следующего прогона:** `baseline + 154 migrations applied; 53 SQL integration files passed.`
- **Коммит:** `df69fd1a`. Хронология: разделы 16–17 и реестр (35 строк) в `docs/audits/2026-11-18-runtime-verification-session.md`.
- **НЕ проверено:** повторный прогон гейта после этой правки, скрипт конкуренции, staging/E2E, живые платежи и Pinterest, бэкапы, мониторинг, деплой.

### 2026-11-18 — SQL-ГЕЙТ ПРОЙДЕН: 154 миграции и 53 из 53 SQL-файлов

- **Владелец прогнал гейт в четвёртый раз — PASS:** `baseline + 155 migrations applied; 53 SQL integration files passed` (155 = baseline + 154 активные миграции `010..163`), одноразовая БД удалена.
- **Что это значит фактами:** впервые за всю историю проекта схема БД и все SQL-контракты **проверены на живом PostgreSQL 18.6**, а не «выглядят правильно». Покрыто: атомарные списания и резервы кредитов, возвраты провайдера, платежи Prodamus и журнал решений, все ограничения публикации Pinterest (идемпотентность, fencing, аренда claim, безопасные попытки, восстановление), очередь удаления аккаунта и стирания контента, политики таблиц и `search_path` у `SECURITY DEFINER`, неизменяемость снимка расписания, сроки хранения изображений.
- **Найдено только на живой базе и исправлено:** непригодный к запуску SQL-файл (`$;` → `$$;`), потеря письма об активации подписки (миграция `162`), токен аренды воркера в ответе админ-RPC (миграция `163`), неверный SQLSTATE в обработчике удаления пина (`restrict_violation`).
- **Следующий пробел:** скрипт конкуренции не запускался ни разу. Добавлен режим `-Concurrency`: 10 сценариев гонок прогоняются против той же одноразовой БД со всей схемой (список читается из раннера, порог ≥10; opt-in `PINPOSY_ALLOW_DISPOSABLE_DB_TESTS` выставляется и снимается; пароль — только через наследуемое окружение). **Режим ещё не запускался.**
- **Проверки:** backend `node --test` → **784/784**; PowerShell parser → PASS; контракт скрипта гейта → 12 проверок.
- **Коммиты:** `df69fd1a`, `0fe53b02`. Хронология: разделы 16–18 и реестр (38 строк) в `docs/audits/2026-11-18-runtime-verification-session.md`.
- **НЕ проверено:** прогон `-Concurrency`, staging/E2E, живые платежи и Pinterest, CI, деплой, бэкапы, мониторинг, DOM/E2E-тесты фронтенда.

### 2026-11-18 — Пятый прогон: гейт PASS повторно; фаза гонок не запускалась из-за WSL-заглушки

- **Повторный прогон подтвердил успех:** `baseline + 155 migrations applied; 53 SQL integration files passed` (154 активные миграции `010..163`). Это второй подряд полный проход, то есть результат воспроизводим.
- **Фаза `-Concurrency` дала 10 «падений», но ни один сценарий не запускался:** `Get-Command bash` разрешился в `C:\Windows\System32\bash.exe` — запускалку WSL, которая без установленного дистрибутива печатает ошибку и выходит с ненулевым кодом. Скрипт принимал кандидата по признаку «файл существует».
- **Исправлено:** `Find-Bash` пробует пути Git for Windows (включая встроенный git приложения), исключает `Windows\System32` и `Windows\SysWOW64` и делает smoke-тест каждого кандидата (`echo PINPOSY_POSIX_SHELL_OK`); отклонённый кандидат печатается. Счётчик SQL-файлов теперь считается в PowerShell, а не парсится из stdout (`(unknown files)` → фактическое число).
- **Проверки:** backend `node --test` → **786/786**; PowerShell parser → PASS; контракт скрипта гейта → 14 проверок.
- **Коммит:** `3cf24aee`. Хронология: раздел 19 и реестр (41 строка) в `docs/audits/2026-11-18-runtime-verification-session.md`.
- **НЕ проверено:** результат 10 сценариев конкуренции (ожидается, что теперь они хотя бы запустятся), staging/E2E, живые платежи и Pinterest, CI, деплой, бэкапы, мониторинг.

### 2026-11-18 — Гонки заработали: 7 из 10 прошли, три падения разобраны и устранены

- **Фаза гонок реально выполнилась** (после починки поиска `bash`): схема + `53/53` SQL-файлов, затем 10 сценариев. **7 прошли**, 3 упали — все три оказались настоящими находками.
- **Два сценария были синтаксически нерабочими:** в `pinterest-oauth-concurrency.sh` и `pinterest-publication-concurrency.sh` строка обрезана — у `psql -c "... wait_event_type = 'Lock'"` отсутствовала закрывающая `")"`. Bash не парсил файл, сценарий **никогда не запускался**. Восстановлено 3 строки; `bash -n` по всем 22 shell-скриптам проходит. Тот же класс порчи, что и `$;` вместо `$$;` в SQL — CI не запускался, поэтому жило незамеченным.
- **Коллизия фикстуры:** `auth-recovery-concurrency.sh` использует жёсткий хеш `repeat('a',64)`, а `auth_tokens.token_hash` уникален → конфликт с остатками SQL-файлов в той же БД. Теперь гейт клонирует «схему+миграции» сразу после replay и гоняет деструктивные сценарии на чистом клоне (как CI). Очистка удаляет все созданные БД, клон первым; `-SkipIntegration` не пропускает запрошенную фазу гонок.
- **Новая защита:** `backend/test/shell-script-syntax.test.js` — `bash -n` по всем `.sh` (с корректным пропуском, если bash отсутствует).
- **Проверки:** backend `node --test` → **790/790**; PowerShell parser → PASS; 22 shell-скрипта парсятся.
- **Коммит:** `86c7c700`. Хронология: раздел 20 и реестр (45 строк) в `docs/audits/2026-11-18-runtime-verification-session.md`.
- **НЕ проверено:** повторный прогон 10 гонок (ожидается 10/10), staging/E2E, живые платежи и Pinterest, CI, деплой, бэкапы, мониторинг.

### 2026-11-18 — ПОЛНЫЙ ПАСС: 154 миграции, 53/53 SQL-контракта, 10/10 гонок

- **Седьмой прогон владельца закрыл оба рубежа:** `PASS: baseline + 155 migrations applied; 53 SQL integration files passed` и `PASS: 10 isolated concurrency tests passed`. Клон схемы для гонок сработал, обе одноразовые БД удалены.
- **Подтверждено фактами:** схема (154 миграции `010..163`), **53/53** SQL-контракта, **10/10** сценариев гонок, backend **790** тестов, frontend **234** теста + `tsc` + сборка, статические проверки SQL (225 файлов), shell (22 скрипта), маршрутов фронтенд⇄бэкенд и i18n.
- **Найдено и исправлено за сессию: 12 дефектов**, из них 6 были бы невидимы без реального выполнения. Самые серьёзные: сломанный вход (`/login` падал у всех), **потерянное письмо об активации подписки** (миграция 162), **токен аренды воркера в ответе админ-RPC** (миграция 163), два неисполнимых shell-сценария гонок, непригодный к запуску SQL-файл.
- **Оценка готовности:** технически **~75%** (было ~55%), готовность к платящим **~50%** (было ~35%) — не проверены живые деньги и живая публикация в Pinterest.
- **Осталось непроверенным:** staging и сквозной E2E, живые платежи Prodamus, живой Pinterest OAuth и публикация, CI (падает вне репозитория), деплой, бэкапы, мониторинг, DOM/E2E-тесты фронтенда (нет registry).
- **Дальше:** `git push origin main` (25 коммитов), staging с реальными ключами (UA-066), один платёж минимальной суммы, одна реальная публикация на тестовом аккаунте, затем бэкапы/мониторинг/деплой.
- Хронология: разделы 0–21 и реестр (46 строк) в `docs/audits/2026-11-18-runtime-verification-session.md`.

### 2026-11-18 — Аудит безопасности веб-слоя и защита достоверности документации

- **Слой безопасности проверен по факту** (без внешних ключей): секретов в репозитории нет (единственное совпадение — поддельный JWT в собственном тесте); `helmet()` включён глобально; CORS — явный allowlist; `handleError` не отдаёт детали на `5xx`; `safeLogger` пишет только allowlist полей; у всех внешних вызовов (`prodamus`, `storage`, `pinterest`, `gptunnel`, `analyze`) есть таймауты; `/me` собирает ответ из явного списка полей, токены и `password_hash` в ответы не попадают.
- **Зафиксированный риск:** JWT хранится в `localStorage`. Вектора кражи (XSS) в коде не найдено — `dangerouslySetInnerHTML`, `innerHTML`, `eval` отсутствуют. Переход на httpOnly-cookie — отдельная задача, не однострочная.
- **Закрыт пробел:** появился `backend/test/route-auth-coverage.test.js` — явный allowlist публичных маршрутов с причиной для каждого, точное сравнение множества, семантический запрет на публичность `/me`, `/projects`, `/boards`, `/pins`, `/schedule`, `/analytics`, `/admin`, `/review-queue`, и требование лимитера на каждом публичном POST (кроме вебхука, аутентифицируемого подписью). Проверено «с зубами»: добавленный маршрут без гварда попадает в отчёт.
- **Закрыт пробел документации:** `backend/test/documentation-integrity.test.js` проверяет непрерывность нумерации реестра, существование каждого указанного коммита (`git cat-file`), существование упомянутых путей и отсутствие секретов в документах.
- **Проверки:** backend `node --test` → **800/800**.
- **Коммиты:** `3294597b`, `d4f955ce`. Хронология: раздел 22 и реестр (49 строк) в `docs/audits/2026-11-18-runtime-verification-session.md`.
- **НЕ проверено:** staging/E2E, живые платежи и Pinterest, CI, деплой, бэкапы, мониторинг, DOM/E2E-тесты фронтенда.

### 2026-11-18 — Экспорт аккаунта: найдена и устранена неполная выгрузка данных

- **Метод поиска без БД:** перечислил по `db/migrations/*.sql` все таблицы с колонкой `user_id` (23) и сопоставил с тем, что выгружает `buildAccountExport`.
- **Дефект:** экспорт заканчивался на `pin_review_queue`; девять принадлежащих пользователю разделов не выгружались — сгенерированные пины, журнал с введённым пользователем `prompt`, перегенерации, резервы кредитов, расход токенов, запросы на оплату, решения о праве доступа, попытки публикации и собственный запрос на удаление. Фронтенд при этом помечал файл как полные данные (проверялась форма, а не полнота).
- **Исправление:** allowlist колонок на каждый раздел; явно исключены `claim_token` (живой lease-креденшл), `provider_idempotency_key`, `provider_task_id`, `provider_price`, `request_fingerprint`, `idempotency_key`, `token_version`. `selectRows` получил параметр колонки сортировки — у `payment_entitlement_decisions` нет `id`, сортировка по нему помечала бы раздел degraded при каждой выгрузке. `EXPORT_FORMAT_VERSION` → **2**; фронтенд принимает версию 1 в рамках её обещаний и требует все девять массивов для версии 2.
- **Моя ошибка, записана намеренно:** начал писать тесты новым файлом, не проверив, что `backend/test/account-lifecycle.test.js` уже существует, и `write` затёр 254 строки покрытия. Обнаружил по расхождению счётчика (ожидал 811, получил 799), восстановил через `git checkout` и дополнил. Правило: перед `write` в `test/` проверять `git ls-files`.
- **Проверки:** account-lifecycle 12 → 16 тестов; целостность новых проверок подтверждена тремя намеренными поломками (утечка `claim_token`, отсутствие сортировки по `receipt_id`, обрыв пагинации) — каждая поймана. backend **804/804**, frontend **236/236**, `tsc --noEmit` чисто, `vite build` успешно.
- **Коммит:** `b63157c6`. Хронология: раздел 23 и реестр (54 строки).
- **НЕ проверено:** staging/E2E, живые платежи и Pinterest, CI, деплой. Следующий пункт бэклога — `accountDeletionWorker.js` (493 строки, без прямых тестов).

### 2026-11-18 — Воркер удаления аккаунта: blocked-статус, ограничение шага и остановки

- **Сначала проверил наличие тестов** (после ошибки раздела 23): `test/account-deletion-worker.test.js` уже существовал (727 строк, 26 тестов). Прежняя оценка «модуль без прямых тестов» была неверной.
- **Три исправленных дефекта:** (1) исчерпанные попытки выдавались за `retry_scheduled`, хотя SQL уже перевёл задачу в `blocked` — теперь отдельный статус и `error`-лог; (2) зависший RPC держал `active` и не давал планировать следующий тик, то есть цикл опроса умирал — теперь каждый шаг ограничен по времени, брошенный шаг безопасен благодаря lease и `claim_token`; (3) `stop()` ждал без дедлайна, и отдельная точка входа могла не завершиться — теперь предел 10 с и явный `false`.
- **Контракт с SQL:** `MAX_PREFLIGHT_ATTEMPTS`/`MAX_ERASE_ATTEMPTS` сверяются контрактным тестом, который парсит миграцию 137; backoff и `then 'blocked'` тоже проверяются.
- **Проверки:** account-deletion-worker 26 → 33 теста, account-deletion-retry-policy 4 теста; мутационная проверка: убрать `blocked` (1 падение), убрать ограничение шага (3 падения), изменить константу (1 падение). backend **815/815**, полный прогон 11.1 с.
- **Найденная ловушка:** мой первый вариант теста на живучесть цикла при падении не вызывал `worker.stop()` и оставлял бесконечный опрос — весь набор висел до внешнего таймаута. Тест переписан на ожидание наблюдаемого события в `try/finally`; 6 прогонов стабильны.
- **Коммит:** `666cf83c`. Хронология: раздел 24, реестр 60 строк.
- **Открыто:** алертинга нет — событие `account_deletion_worker.job_blocked` пишется в структурный лог, но внешнего мониторинга/оповещения нет; это требует решения владельца о платформе. Staging/E2E, платежи и Pinterest — за владельцем (UA-066).

### 2026-11-18 — OAuth-state Pinterest больше не работает как сессионный токен

- **Найдено и воспроизведено:** сессионные токены и state OAuth-редиректа подписаны одним `JWT_SECRET`, а `requireAuth` читает только `userId` + `tokenVersion`. Подписанный state (он же идёт параметром URL через редирект Pinterest, то есть попадает в историю браузера, access-логи и `Referer`) принимался как полноценная сессия на 15 минут. Обратное направление уже было закрыто проверкой `purpose`.
- **Исправление:** сессионные токены получили `purpose: "session"`, проверка отвергает чужой purpose; токены без claim'а остаются валидными — принудительного разлогина нет. Проверка state теперь пинит `algorithms: ["HS256"]` и требует `generation` строго числом. Статический контракт обновлён и стал строже (требует пин алгоритма).
- **Проверки:** session-token 3 → 7; новый `pinterest-oauth-state.test.js` — 13 тестов (подмена, срок, каждый claim, другой HMAC-размер, `alg: none`, replay в обе стороны). Мутации: убрать проверку purpose → 3 падения, убрать пин алгоритма → 1 падение. backend **832/832**.
- **Честная деталь:** первое ожидание «верхний регистр hex в `browserBindingHash` должен отвергаться» было неверным — сравнение идёт по байтам, `AB` = `ab`. Тест исправлен, код не менялся ради мнимой строгости.
- **Коммит:** `7996c41f`. Хронология: раздел 25, реестр 67 строк.
- **Открыто:** нет прямых тестов у `refreshAccessToken` (lease, «uncertain», ожидание ротации на другом инстансе) и `withAccount` — следующий крупный пункт. Staging/E2E, живые платежи и Pinterest — за владельцем (UA-066).

### 2026-11-18 — Обновление Pinterest-токена покрыто тестами (15 сценариев)

- **Найдено:** `refreshAccessToken` — единственная запись credential, который провайдер инвалидирует при первом использовании — не имел прямых тестов и даже не экспортировался.
- **Стенд:** подмена Supabase и `axios` через `require.cache` (приём уже используется в проекте), токены в поддельной строке — реальный `encryptToken`. Покрыты: строка, обновлённая другим инстансом; lease получен, но строка свежее; `uncertain` без живого lease; забор неопределённости пишется до обращения к Pinterest и привязан к `updated_at`/`refresh_state`; сбой записи забора; транспортная ошибка и 5xx сохраняют забор; 429 возвращает `ready`; 2xx без нового refresh-токена или `expires_in` отвергается; успешный коммит содержит `enc:v1:…`, а не открытый токен; повтор коммита идёт без второго вызова провайдера; гонка за коммит → 503; lease освобождается всегда; чтение возвращает расшифрованные токены.
- **Две мои ошибки в стенде (исправлены в тестах, не в коде):** подавал строку с шифротекстом, тогда как код сравнивает расшифрованные значения (все ветки уходили в ранний выход «другой инстанс уже обновил»); сравнивал шифротекст двух повторов коммита, который обязан отличаться из-за нового IV.
- **Проверки:** 15 новых тестов; мутации: убрать забор неопределённости → падение, записать открытый токен → падение. backend **847/847**.
- **Документация:** раздел 26; проверка нумерации реестра теперь парсит только раздел реестра (нумерованные таблицы в разделах анализа её ломали), «с зубами» проверено удалением строки реестра.
- **Коммиты:** `fdf346f7` (тесты и экспорт), далее коммит документации. Реестр — 72 строки.
- **Открыто:** `withAccount` (склейка `resolveAccount` + refresh + повтор) и ветка «lease занят, ротация ещё идёт» (реальное ожидание до 10 с, нужна инъекция таймера). Staging/E2E, платежи и Pinterest — за владельцем (UA-066).

### 2026-11-18 — Фронтенд: единый путь доступа к токену и защита от регрессии

- **Найдено:** после исправления `App.tsx` (FE-01) оставались три прямых чтения `localStorage.getItem('token')`: загрузка своего изображения в `ManualApprovalDesk` (при заблокированном хранилище показывалась ложная ошибка «Не удалось обновить изображение», а без токена уходил `Bearer null`), поиск восстановимых генераций в `PinGenerator`, сохранение языка в `i18nContext`.
- **Исправление:** все три переведены на `lib/authStorage`; в загрузке изображения при отсутствии токена выполняется переход на `/login`, как в API-клиенте при `401`.
- **Защита:** `frontend/src/lib/authTokenAccess.test.ts` обходит все `.ts`/`.tsx` под `src` и падает на прямом чтении/записи ключа `token` вне helper'а; отдельно проверяется защитность самого helper'а. Проверено «с зубами» возвратом старого чтения.
- **Проверки:** frontend **240/240** (было 234), `tsc --noEmit` чисто, `vite build` успешно; backend **847/847**.
- **Коммит:** `3ceb876c`. Хронология: раздел 27, реестр 75 строк.
- **Открыто:** доменных тестов фронтенда нет (нет jsdom/testing-library при недоступном npm registry) — проверки фронтенда остаются на уровне типов, сборки и статических контрактов. Staging/E2E — за владельцем (UA-066).

### 2026-11-18 — Инвентарь очереди удаления аккаунта для оператора

- **Пробел из раздела 24.7 закрыт:** заблокированная задача удаления была видна только в структурном логе. Добавлен `GET /admin/account-deletion/inventory` (`requireAuth` + `requireAdmin`, только чтение) — счётчики по состояниям запросов и статусам задач, самый старый ожидающий запрос с возрастом, задачи, требующие человека.
- **Приватность:** читаются только `account_deletion_requests` и `account_deletion_jobs`, все колонки перечислены явно (никакого `select("*")`), код ошибки из БД отдаётся только при соответствии `^[a-z0-9_]{1,64}$`.
- **Отказоустойчивость:** недоступный или испорченный счётчик бросает ошибку — пустая очередь не подменяет недоступную.
- **Проверки:** 9 тестов; мутация «сбой счётчика → тихий ноль» ловится. backend **856/856**; тест покрытия авторизации маршрутов проходит с новым маршрутом.
- **Коммит:** `e73052ea`. Хронология: раздел 28, реестр 79 строк.
- **Ограничения:** UI для экрана нет (сознательно, без DOM-тестов и staging), внешнего алертинга по-прежнему нет — нужен выбор платформы мониторинга владельцем.

### 2026-11-18 — Проверка владения ресурсом на маршрутах с `:id` и исправление слабой проверки

- **Системная проверка:** разобраны все 21 маршрут с параметром в `index.js` — IDOR не найден: все либо вызывают `getPinWithOwnerCheck`/`getBoardWithOwnerCheck`/`isOwnedByUser`, либо фильтруют по `user_id`; единственное исключение — админский `/admin/mail/:uid`.
- **Новая защита:** `backend/test/route-ownership-coverage.test.js` требует ссылку на владение в каждом параметризованном маршруте, проверяет, что имена принятых помощников реально определены (переименование не сделает проверку фиктивной), держит список исключений явным и админ-защищённым.
- **Найденная слабость собственной проверки:** первая мутация не сработала — окно фиксированной длины по исходнику заходило в соседний маршрут, и его фильтр `user_id` «удовлетворял» проверку. Тот же дефект был в `route-auth-coverage.test.js`. В обоих тело маршрута теперь ограничено следующей регистрацией; после исправления обе мутации ловятся.
- **Проверки:** backend **861/861**.
- **Коммит:** `dc6f13e4`. Хронология: раздел 29, реестр 83 строки.
- **Открыто:** staging/E2E, живые платежи и Pinterest, CI, деплой, алертинг — за владельцем (UA-066).

### 2026-11-18 — Документированность переменных окружения

- **Найдено:** семь переменных читались, но не были описаны в `backend/.env.example`: `API_RATE_LIMIT_MAX`, `API_RATE_LIMIT_WINDOW_MS`, `MAIL_USER`, `MAIL_PASS`, `ENABLE_DEV_TOPUP`, `ADMIN_SECRET`, `ALLOW_TARIFF_SELF_SELECT`. Последние три не находились первым проходом — они читаются через параметр `env`, сканер дополнен шаблоном `env.ИМЯ` (строгость выросла).
- **Исправление:** в `.env.example` добавлены блоки «Отладочные переключатели» и «Ограничение частоты запросов», с точной семантикой включения (только `development|test` + точное `"true"`; только `"1"` для выбора тарифа) и честной пометкой, что счётчик лимитера живёт в памяти процесса.
- **Защита:** `backend/test/env-documentation.test.js` — каждая читаемая переменная обязана быть документирована, каждая документированная — где-то читаться; исключения перечислены явно. Проверено удалением строки из `.env.example` — тест падает с указанием файла-читателя.
- **Проверки:** backend **865/865**.
- **Коммит:** `66be779b`. Хронология: раздел 30, реестр 86 строк.
- **Открыто:** staging/E2E, живые платежи и Pinterest, CI, деплой, алертинг, общий стор для лимитера — за владельцем или требуют решения о платформе (UA-066, UA-067).

### 2026-11-18 — Smoke-проверка живого бэкенда

- **Добавлено:** `scripts/smoke-backend.sh` — повторяемая проверка живого сервиса: liveness, readiness (с явным ожиданием), публичные каталоги, отказ анонимному доступу на пяти клиентских маршрутах и админском, отказ неподписанному вебхуку, опциональная проверка `/me` с токеном. Коды выхода 0/1/2.
- **Реальная проверка:** бэкенд запущен локально на 127.0.0.1:3999 с фиктивным Supabase — 11 проверок PASS, `readiness` честно показал `database_unavailable`; `--expect-ready ok` дал FAIL, поддельный токен дал FAIL на `/me`.
- **Безопасность инструмента:** токен не печатается, тело `/me` не выводится, все запросы с таймаутом, скрипт ничего не меняет.
- **Защита:** `backend/test/smoke-script-contract.test.js` — обязательные ожидания (401/403), счётчики проверок и провалов, запрет печати токена, таймауты. Проверено ослаблением ожидания до «любого 4xx» — тест падает.
- **Проверки:** backend **870/870**.
- **Документация:** раздел 31, реестр 89 строк, UA-069 (как запускать).
- **Открыто:** staging/E2E, живые платежи и Pinterest, CI, деплой, алертинг — за владельцем (UA-066, UA-067).

### 2026-11-18 — Контракт маршрутов и локализация ошибок входа

- **Сверка контракта:** все 51 путь, вызываемые фронтендом (84 места), сопоставлены с 79 маршрутами бэкенда — расхождений нет. Закреплено `backend/test/frontend-route-contract.test.js`; мутация (переименование пути в `status-v2`) ловится с указанием файла.
- **Локализация:** бэкенд (`auth.js`) теперь присылает коды `invalid_credentials`, `email_already_registered`, `account_pending_deletion` рядом с русским текстом (текст не изменён, старые клиенты и поиск по логам работают). Фронтенд (`i18n/authCopy.ts`) получил три строки на семи языках и `getAuthErrorMessage`; `/login` и `/register` показывают локализованное сообщение, при неизвестном коде — серверный текст.
- **Проверки:** frontend **247/247**, `tsc` — 0 ошибок, сборка проходит; backend **874/874**. Встречная проверка: бэкенд обязан содержать каждый код, который маппит клиент (проверено удалением кода из 401 — падает).
- **Коммиты:** `888cdf97`, `2dea8a01`. Хронология: раздел 32, реестр 90 строк.
- **Открыто:** локализованы только три ошибки входа; остальные сообщения API (валидация, платежи, генерация) по-прежнему русские — следующий этап. Staging/E2E, живые платежи и Pinterest, CI, деплой, алертинг — за владельцем (UA-066, UA-067).

### 2026-11-18 — Дедлайн запроса и явный ответ 429

- **Найдено:** в `frontend/src/lib/api.ts` не было таймаута (зависшее соединение = вечный спиннер) и 429 не отличался от падения; у лимитеров бэкенда дефолтное тело 429 — английская строка без машинного поля.
- **Сделано:** `AbortController` с дедлайном 45 с и отдельным сообщением о таймауте; разбор ожидания при 429 (тело → `Retry-After` → `RateLimit-Reset`), молчаливый повтор при ожидании ≤ 3 с (ровно один), сообщение с числом секунд на семи языках; все 8 лимитеров отвечают через общий `rateLimitedHandler` (`code: "rate_limited"`, `retryAfterSeconds` = значение заголовка).
- **Тест поймал дефект:** `Date.parse` в V8 читает `"1.5"` и `"-5"` как даты → мусорный `Retry-After` давал ожидание до 300 с. Разбор ужесточён до IMF-fixdate.
- **Моя ошибка, записана:** сначала утверждал, что express-rate-limit не присылает `Retry-After`; проверка показала `Retry-After: 60`. Мотивировка исправлена, правка оставлена из-за реальной пользы (код в теле и совпадение тело=заголовок).
- **Проверки:** frontend **257/257**, `tsc` — 0 ошибок, сборка проходит; backend **877/877**; тест обработчика 429 идёт по реальному HTTP.
- **Коммит:** `9b3daf71`. Хронология: раздел 33, реестр 97 строк.
- **Открыто:** дедлайн 45 с может быть мал для длинных AI-операций (нужен потоковый ответ или отдельный лимит); хранилище лимитера — в памяти процесса.

### 2026-11-18 — Дедлайн генерации: таймаут на месте вызова

- **Найдено (в собственной правке):** единый дедлайн 45 с оборвал бы `/boards/:id/pins/generate`: сервер генерирует до 10 изображений последовательно, до ~90 с каждое. Клиент видел бы ошибку, а сервер продолжал работу и списывал кредиты.
- **Сделано:** `apiRequest` принимает `timeoutMs` (по умолчанию 45 с, в `fetch` не пробрасывается); `PinGenerator` заявляет бюджет `GENERATION_REQUEST_TIMEOUT_MS = 15 мин`. Бюджет — на месте вызова, а не глобально.
- **Проверки:** 2 новых теста (бюджет ≥ 10 мин и его фактическая передача; переопределение дедлайна без проброса в `fetch`). Мутация (убрать `timeoutMs` из вызова) ловится. frontend **259/259**, `tsc` — 0 ошибок, сборка проходит.
- **Открытый риск:** синхронная многоминутная генерация несовместима с idle-таймаутом прокси (60–100 с) — возможны 502/504 при списанных кредитах. План: 202 + опрос статуса (журнал и восстановление по `Idempotency-Key` уже есть). Проверить можно только на staging (UA-066).

### 2026-11-18 — Ожидание уже идущей генерации

- **Найдено:** при 409 `generation_in_progress` (перезагрузка во время генерации, двойной клик, вторая вкладка) UI показывал ошибку; сервер присылал `Retry-After: 5`, но клиент его не видел, потому что `ApiError` несёт тело, а не заголовки. Ротация ключа запустила бы вторую генерацию с повторным списанием.
- **Сделано:** `utils/generationPolling.ts` (`getGenerationInProgressWait`, `runGenerationWithRecovery`: бюджет 10 мин / 60 повторов, повтор того же ключа, мгновенный проброс всего, что не «в процессе»); `PinGenerator` фиксирует ключ и передаёт его в каждый повтор. Бэкенд добавляет `retryAfterSeconds` в тело `409`/`202`, совпадающий с заголовком.
- **Проверки:** 9 тестов с внедрёнными часами и `sleep`; мутация (убрать проверку кода) ловится. frontend **268/268**, `tsc` — 0 ошибок, сборка проходит; backend **877/877**.
- **Коммит:** `9d47c115`. Хронология: раздел 35, реестр 102 строки.
- **Открыто:** перегенерация в `ManualApprovalDesk` остаётся с ручным повтором (осознанный UX); архитектурный риск синхронной генерации (раздел 34.4) — по-прежнему главный.

### 2026-11-18 — Исправление ветки: работа теперь в `main`

- **Найдено:** все 56 коммитов сессии лежали на `autonomous-progress-backup`, а локальный `main` отставал до `ab7a44f5` (= `origin/main`). Пуш по UA-067 опубликовал бы пустоту.
- **Сделано:** `main` переведён fast-forward до текущего состояния (ничего не потеряно, история не переписана), рабочее дерево переключено на `main`.
- **Проверено:** `HEAD = main`, впереди `origin/main` на 56 коммитов, дерево чистое, тест документации проходит.
- **Для владельца:** `git push origin main` теперь публикует всю работу.

### 2026-11-18 — Чужой lease обновления Pinterest-токена покрыт тестами

- **Найдено:** ветка «lease занят другим инстансом» (подождать ротацию / дождаться живого lease / попросить переподключение) была непокрыта — она решала, можно ли звонить в Pinterest, а ожидание шло реальными `Date.now()` и `setTimeout` до 10 с.
- **Сделано:** `refreshAccessToken(account, timing)` с инъекцией `now`/`sleep`/`maxWaitMs`/`pollMs` (продакшн-значения те же); границы вынесены в `REFRESH_CONCURRENCY_WAIT_MS`/`REFRESH_CONCURRENCY_POLL_MS`; проверка живого lease использует тот же внедрённый `now` (с двумя источниками времени ветка была недетерминирована).
- **Проверки:** 6 новых тестов на плёночных часах (ротация подхвачена без вызова провайдера; живой lease → 503; без живого lease → 409; нечитаемое состояние → 503; отключение во время ожидания → 409; уже ротированная строка после одного опроса). Обе мутации проверены на факт применения: 4 и 2 падения. backend **883/883**.
- **Коммит:** `053ca218`. Хронология: раздел 36, реестр 107 строк.
- **Открыто:** прямого теста на композицию `withAccount` нет (части покрыты по отдельности).

### 2026-11-18 — Локализация ошибок приложения и оплаты

- **Найдено:** 50 пользовательских строк с кириллицей в 16 файлах; 14 — в `App.tsx` (инварианты расписания/досок/публикации), плюс сообщение об отсутствии ссылки на оплату. На 6 из 7 языков это был русский текст.
- **Сделано:** пространство `appErrors` (13 ключей × 7 локалей + типы — пропуск перевода ловится компилятором); `i18n/appErrorCopy.ts` для кода без React (язык из хранилища, откат на английский, устойчивость к заблокированному хранилищу); `billing.ts` использует локализованное сообщение в обоих путях создания платежа.
- **Проверки:** 3 теста (все семь языков различаются, откат на английский, отсутствие русского текста в `billing.ts`); мутация ловится. frontend **271/271**, `tsc` — 0 ошибок, сборка проходит; backend **883/883**.
- **Коммит:** `233ec540`. Хронология: раздел 37, реестр 110 строк.
- **Осталось:** 34 строки в 14 файлах (инвентарь в разделе 37.4): `PublishPinButton` (5) → `projectProvisioning` (3) → валидация ответов (14) → админ-панели (9, осознанно на русском).

### 2026-11-18 — Завершение локализации клиентских сообщений

- **Сделано:** `appErrorCopy` расширен до 21 ключа × 7 локалей (валидация ответов, провижининг проекта, оплата, безопасный ключ, хранилище сессии, подключение Pinterest); `PublishPinButton` читает `t.publishing`. Клиентских кириллических сообщений вне `components/admin/` больше нет (было 50).
- **Побочная находка:** три теста валидации фиксировали русские формулировки и упали после локализации. Переписаны на сверку с сообщением по ключу — текст больше не является контрактом, контрактом стал факт отказа.
- **Страж:** `frontend/src/lib/errorLocalization.test.ts` (3 теста) — 0 кириллицы вне админки, исключение админки проверено как реальное, образец проверен на ловлю и на отсутствие ложных срабатываний. Мутация ловится с файлом и строкой.
- **Проверки:** frontend **274/274**, `tsc` — 0 ошибок, сборка проходит; backend **883/883**. Коммит `e4521cfc`. Хронология: раздел 38, реестр 113 строк.
- **Осталось:** 9 строк в админ-панелях (осознанно, русский); сообщения бэкенда, кроме трёх кодов входа, по-прежнему русские — следующий крупный этап, механизм локализации по коду уже есть.

### 2026-11-18 — 402 «недостаточно кредитов»: код и локализация

- **Найдено:** девять мест с 402, у каждого свой русский текст; два — с самодельным кодом `generation_insufficient_credits`, остальные без машинного поля. Шесть из семи языков видели русский текст, и ни один вариант не подсказывал действие.
- **Сделано:** бэкенд — один помощник `insufficientCreditsError(message)`, все 402 несут `code: "insufficient_credits"`, прежние имена кодов убраны; фронтенд — ключ `insufficientCredits` на семь языков и локализация известных кодов **в слое запросов** (`getLocalizedApiError`), `data.code` по-прежнему доходит до экранов.
- **Проверки:** 4 теста (перевод на 7 языков, различие сообщений, наличие действия в тексте, `null` для неизвестного кода/статуса, приоритет локализации, ровно один `httpError(402` на бэкенде). Обе мутации проверены на применение и ловятся. frontend **278/278**, `tsc` — 0 ошибок, сборка проходит; backend **883/883**.
- **Коммит:** `875db3ea`. Хронология: раздел 39, реестр 116 строк.
- **Следующее:** коды для 422 (валидация), 502/503 провайдера платежей и ошибок публикации в Pinterest — механизм уже готов.

### 2026-11-18 — «Не найдено»: коды по сущностям и перевод

- **Найдено:** 20 мест с 404 и десять разных русских текстов без машинного поля; второй по частоте класс пользовательских ошибок.
- **Сделано:** помощник `notFoundError(code, message)` на все 20 мест, 8 кодов по сущностям (проект, доска, пин, расписание, публикация, запрос генерации, Pinterest-аккаунт, пользователь); на фронтенде 8 ключей × 7 локалей и маппинг в `getLocalizedApiError` при 404. Русский текст сохранён — код добавляется рядом, а не вместо.
- **Проверки:** 5 тестов, включая двустороннюю сверку «клиент умеет показать каждый код, который отдаёт бэкенд» и обратное; проверка различимости сущностей. Две мутации проверены на применение и ловятся. frontend **283/283**, `tsc` — 0 ошибок, сборка проходит; backend **883/883**.
- **Коммит:** `eb73fbde`. Хронология: раздел 40, реестр 119 строк.
- **Следующее:** 422 (валидация, 28 мест) — нужен выбор между кодом на каждое правило и гибридом (коды для частых групп + серверный текст для остальных). Решение принять до начала работы.

### 2026-11-18 — 422: гибрид кодов и перевод исправимых ошибок

- **Решение:** код ставится только на ошибку, которую клиент может исправить; внутренние контрактные нарушения (Idempotency-Key, неизвестный статус, «нечего обновлять», `project_id`) остаются с серверным текстом. Код на каждое правило означал бы ~200 переводов, общий код («некорректные данные») уничтожил бы смысл.
- **Сделано:** 9 кодов (`board_name_required`, `invalid_schedule_time`, `schedule_too_far`, `invalid_timezone`, `project_url_required`, `project_url_invalid`, `pin_image_missing`, `board_selection_required`, `image_upload_required`) через `validationError(code, message)`; тексты говорят, что сделать, а не только что не так.
- **Проверки:** 5 тестов, включая сверку множеств «что отдаёт бэкенд» и «что маппит клиент» (читается из исходника — мёртвый маппинг ловится). Две мутации проверены на применение. frontend **288/288**, `tsc` — 0 ошибок, сборка проходит; backend **883/883**.
- **Коммит:** `46a87136`. Хронология: раздел 41, реестр 122 строки.
- **Осталось:** 502/503 провайдера платежей и ошибки публикации в Pinterest — следующий класс без кодов.

### 2026-11-18 — Предусловия публикации: коды 409 и перевод

- **Найдено:** три 409 возникают в момент реальной попытки публикации (нет подключённого Pinterest, пин уже в расписании, публикация не в статусе «Ошибка») и были только на русском без кода — самые действенные сообщения продукта.
- **Сделано:** `conflictError(code, message)` на все четыре места; коды `pinterest_not_connected`, `pin_already_scheduled`, `publication_not_failed`; три сообщения × 7 локалей, каждое называет действие.
- **Проверки:** 5 тестов (перевод, различимость и наличие действия, код только для 409, сверка множеств из исходников, предусловие про аккаунт не ослаблено). Мутация ловится. frontend **293/293**, `tsc` — 0 ошибок, сборка проходит; backend **883/883**.
- **Коммит:** `272ef3d0`. Хронология: раздел 42, реестр 125 строк.
- **Итог по локализации API:** клиентская кириллица вне админки — 0 (страж); коды и переводы для 402, 404, 409, 422 и трёх ошибок входа; механизм — `getLocalizedApiError` в слое запросов.
- **Осталось осознанно:** 502/503 провайдера Pinterest и платежей — там важнее честная формулировка о деньгах, чем перевод; делать вместе со staging-проверкой (UA-066).

### 2026-11-18 — Почта: таймауты SMTP и утечка конфигурации

- **Найдено:** транспорт nodemailer создавался без таймаутов (дефолты до 10 минут) — зависший SMTP держал запрос регистрации/сброса намного дольше клиентского дедлайна; сообщения об ошибке называли `MAIL_SMTP_*`/`MAIL_IMAP_*`, то есть конфигурация развёртывания раскрывалась в теле ответа, в том числе анонимному посетителю.
- **Сделано:** `mailTransportTimeouts()` (10/10/30 с) для транзакционного и reply-транспорта; TLS по-прежнему по порту; все сообщения нейтральны, причина — в лог (`mail.event_003/004/005`).
- **Проверки:** 6 тестов (таймауты и их границы, TLS по порту включая 465, отсутствие утечки, `needThrow: false` не падает, оба `createTransport` только из построителя). Обе мутации проверены на применение и ловятся. backend **889/889**.
- **Коммит:** `4e48296e`. Хронология: раздел 43, реестр 128 строк.
- **Осталось:** нет пулинга SMTP-соединений (каждый конверт — новый TLS-хендшейк); менять поведение нужно с проверкой на реальном SMTP (staging, UA-066).

### 2026-11-18 — IMAP-клиент тоже ограничен по времени

- **Найдено:** оба IMAP-вызова (список входящих, чтение письма) создавали `ImapFlow` без лимитов — действовали значения imapflow (сокет 5 минут, приветствие 16 с).
- **Сделано:** `buildImapClientOptions()` (10/10/60 с), оба места через построитель.
- **Проверки:** тест на значения, порт/TLS по умолчанию и оба вызова; мутация (убрать таймауты) ловится. backend **890/890**.
- **Коммит:** `048c0f60`. Хронология: раздел 43.5, реестр 129 строк.

### 2026-11-18 — Дедлайн обращений к базе

- **Найдено:** `supabase-js` не задаёт таймаут, поэтому зависшее соединение держало HTTP-запрос до TCP-таймаута платформы (минуты) при клиентском дедлайне 45 с.
- **Сделано:** `supabaseTimeout.js` — обёртка `fetch` с прерыванием по `SUPABASE_REQUEST_TIMEOUT_MS` (20 с, диапазон 1000…120000, задокументировано в `.env.example`). Дедлайн обеспечивается **гонкой** запроса и сигнала (реализация не обязана отклонять промис по сигналу), явный `signal` вызывающего сохраняется, поздний исход проигравшего промиса гасится. Прерывание не откатывает запись — это «неизвестный исход», для которого уже есть идемпотентность, fences и сверка.
- **Проверки:** 7 тестов; мутации (таймер-пустышка, убрать гонку) проверены и ловятся. Первая версия полагалась только на сигнал — тест с реализацией, игнорирующей сигнал, выявил хрупкость. backend **897/897**.
- **Коммит:** `8164adda`. Хронология: раздел 44, реестр 132 строки.
- **Осталось:** лимитер в памяти процесса, нет пулинга SMTP, синхронная генерация (раздел 34.4) — требуют решения о платформе/staging.

### 2026-11-18 — Отказы Pinterest: коды и честные формулировки

- **Найдено:** 5 мест с отказом «Pinterest недоступен / ограничил частоту» были только на русском — в самый раздражающий момент сценария.
- **Сделано:** `pinterestTransientError(code, message, status=503)` → `pinterest_unavailable` / `pinterest_rate_limited` (502 у проверки доски сохранён); два сообщения × 7 локалей, переводятся для 502 и 503. Формулировки нейтральны — ничего о списаниях и публикации не обещают.
- **Проверки:** 4 теста (перевод и различимость, только 502/503, запрет слов charge/refund/credit/published, сверка кодов с бэкендом и сохранение 502). Мутация ловится. frontend **297/297**, `tsc` — 0 ошибок, сборка проходит; backend **897/897**.
- **Коммит:** `0647af2c`. Хронология: раздел 45, реестр 135 строк.
- **Процедурный вывод:** результат мутации проверять отдельной командой по имени теста — комбинированная команда уже дважды дала ложный сигнал.

### 2026-11-18 — Платёжный колбэк вне браузерного бюджета

- **Найдено:** общий лимит 300/мин покрывал `/billing/webhook`; шторм повторных уведомлений провайдера упирался в 429 — клиент заплатил, право не выдано.
- **Сделано:** вебхук исключён из общего бюджета (аутентификация подписью + идемпотентность по отпечатку квитанции), получил свой `WEBHOOK_RATE_LIMIT_MAX` (600/мин, минимум 60, задокументирован); лимитер стоит перед парсером тела.
- **Проверки:** новый тест с бюджетом 5 и 20 неподписанными колбэками — ни одного 429, все отвергнуты как неподписанные, `/me` throttlится. Скан лимитеров переписан (фиксированное окно 600 символов стало вакуумным после роста комментария — третий такой случай в сессии). Обе мутации проверены отдельными командами. backend **898/898**.
- **Коммит:** `b66bedae`. Хронология: раздел 46, реестр 138 строк.

### 2026-11-18 — Сброс пароля: покрытие security-свойств

- **Найдено:** скан модулей без тестов выявил `password-reset.js` — самый чувствительный публичный поток (выдаёт доступ к аккаунту), при этом все его защитные свойства невидимы в успешном ответе.
- **Сделано:** `backend/test/password-reset.test.js` — 11 тестов (Supabase и почтовик через `require.cache`): идентичный ответ для существующего и несуществующего адреса, игнорирование `frontendUrl`, только sha256 токена в БД, локализация письма, cooldown 5 мин и срок ~1 час, сбой SMTP не ломает публичный запрос, сбой БД → 503 без RPC, bcrypt вместо пароля, 422/500 для токенов, 422 до базы для плохого токена и слабого пароля.
- **Проверки:** три мутации отдельными командами (сырой токен, без bcrypt, утечка существования) — все падают. backend **909/909**.
- **Коммит:** `da974c98`. Хронология: раздел 47, реестр 141 строка.
- **Характер:** тесты характеризующие — код был корректен, зафиксированы свойства; ценность в защите от «улучшений», ломающих именно эти свойства.

### 2026-11-18 — Подтверждение email: свойства закреплены, мёртвый код удалён

- **Найдено:** `email-verify.js` был в тестах только ради константы-сообщения; при написании тестов обнаружен `revokeUnused()` — не вызывается ниоткуда, гашение старых ссылок делает SQL в миграции 022.
- **Сделано:** удалён мёртвый JS-дубликат; `backend/test/email-verification.test.js` — 11 тестов (идентичный анонимный ответ, только хеш токена, уже подтверждённый не получает письма, cooldown/срок из RPC, сбои SMTP и БД, 422 до базы). Инвариант гашения проверяется по миграции 022 и по порядку `update` → `insert`.
- **Проверки:** три мутации отдельными командами (сырой токен, возврат `revokeUnused`, удаление `update` из миграции) — все падают по делу. backend **920/920**.
- **Коммит:** `35589f33`. Хронология: раздел 48, реестр 145 строк.
- **Урок:** мёртвый код с защитным смыслом опаснее отсутствующего — он создаёт ложное впечатление, что инвариант под контролем.

### 2026-11-18 — Пейвол: локализация 403 и покрытие gейта тарифа

- **Найдено:** коды `tariff_required` / `tariff_insufficient` не были смаплены на клиенте — истёкшая подписка давала русский текст всем языкам; middleware `requireTariff` (строки 93–129) не был покрыт вообще.
- **Сделано:** `TARIFF_CODES` в `appErrorCopy.ts` (только 403) + два текста × 7 языков; `backend/test/tariff-guard.test.js` — 7 тестов (истёкший/неподходящий/разрешённый тариф, легаси `standard`, сужение guard, два сбоя БД — всегда с проверкой `next()`); `frontend/src/lib/tariffErrorLocalization.test.ts` — 6 тестов с кросс-проверкой, что `tariff.js` отдаёт эти коды со статусом 403.
- **Проверки:** четыре мутации отдельными командами — отключение 403, английский текст вместо китайского, пропуск неактивного тарифа, fail-open в `catch` — все падают по делу. backend **927/927**, frontend **303/303**, tsc чисто.
- **Замер покрытия (Node 22 `--experimental-test-coverage`, без зависимостей):** 83.51 % строк / 88.20 % ветвей / 89.75 % функций. Слабые: `index.js` 8.2 % (сборка приложения), `pinterest.js` 29.6 % (сеть, нужен staging), `mail.js` 52.3 %, `creditsBilling.js` 67.2 %, `billing.js` 72.1 %, `validate.js` 73.5 %, `pins.js` 76.0 % → следующие цели.
- **Процедурная ошибка (записана):** первый фронтенд-тест написан на vitest, а проект тестируется `tsx --test`; vitest не зависимость → тест не попал бы в набор. Урок того же рода, что «сначала `git ls-files`»: сначала посмотреть, чем проект тестируется.
- **Коммит:** `584ef2eb`. Хронология: раздел 49, реестр 149 строк.

### 2026-11-18 — Валидатор входа: два реальных дефекта

- **Найдено:** `validateUrl`, ветка ошибки `validateEnum` и `validateLen` не были покрыты. Тесты вскрыли: `validateInt` принимал `""`/`"   "`/`null` за 0 (пустой параметр = валидный ноль при `min <= 0`; булевы/массивы/объекты тоже приводились к числу), `validateEmail` принимал `a@b..c` (пустая метка домена) — такой аккаунт никогда не подтвердить.
- **Сделано:** «отсутствует» → `def` или 422, принимаются только `number`/`string`; проверка меток домена (пустота, длина > 63). `backend/test/validate.test.js` — 8 тестов на все семь хелперов, включая «пароль не тримится» и отказ `javascript:`/`data:`/`ftp:`/`file:` в `validateUrl`.
- **Проверки:** две мутации отдельными командами (старая логика `validateInt`, удаление проверки домена) — обе падают по делу. backend **935/935**.
- **Коммит:** `caa32b1d`. Хронология: раздел 50, реестр 152 строки.
- **Класс дефекта:** «значение по умолчанию выглядит как валидный ввод» — поэтому валидаторы надо покрывать по ветвям, а не по счастливому пути.

### 2026-11-18 — Коды на денежных отказах и граница 5xx

- **Найдено:** (1) `handleError` выбрасывал `details` на всех статусах ≥ 500 — то есть локализация Pinterest из §45 не могла сработать ни на одном маршруте, который бросает ошибку; (2) три денежных отказа были только на русском: провайдер недоступен (502), счёт создан без ссылки (503), заказ не подготовлен (503) — самый дорогой случай провоцирует второй платёж.
- **Сделано:** `handleError` вынесен в `backend/httpErrorResponse.js`; на любом статусе проходит `details.code` (непустая строка), на 5xx больше ничего; `backend/paymentErrors.js` с тремя хелперами, подключён в `billing.js`, `creditsBilling.js`, `prodamus.js`; клиент — `PAYMENT_CODES` только для 502/503 и три текста × 7 языков.
- **Проверки:** backend 7 + 5 тестов (граница ошибок и коды денежных отказов, включая запрет утечки email/SQL/стека/номера карты на 500), frontend 5 тестов (семь языков, гейт по статусу, различимость, обратная сверка). Пять мутаций отдельными командами. backend **947/947**, frontend **308/308**, tsc чисто.
- **Коммит:** `330e2ad8`. Хронология: раздел 51, реестр 157 строк.
- **Процедурные ошибки:** `git checkout` на файле с незакоммиченной работой уничтожил изменения дважды (восстановлено повторной вставкой; правило — откат мутации только из копии); проверка «уже вставлено» по фиксированному окну 6000 символов снова дала ложный результат — переписано на границы блока, тесты научены нормализовать CRLF/LF.

### 2026-11-18 — Тупики генерации и страж дрейфа кодов

- **Найдено:** аудит всего набора отдаваемых кодов (35) выявил три кода, которые клиент видит по-русски, хотя они требуют действия: `generation_outcome_unknown`, `regeneration_outcome_unknown` (409 — повторный запуск заблокирован), `gptunnel_text_cost_missing` (502). `rate_limited` исключён осознанно (429 обрабатывается по статусу).
- **Сделано:** `GENERATION_CODES` для 409 и `gptunnel_text_cost_missing` в `TRANSIENT_CODES`, тексты × 7 языков; `backend/test/error-code-drift.test.js` — страж в обе стороны (код без маппинга / мёртвый маппинг), с проверкой реальности каждого исключения, доказательством утверждения про 429 и выборкой против вакуумного сканера. Сканер научен не считать кодами `p_error_code:`/`reasonCode:` и понимать `paymentError(status, message, code)`.
- **Проверки:** три мутации отдельными командами (новый код, удалённый маппинг, переименование) — падают по делу. backend **952/952**, frontend **308/308**, tsc чисто.
- **Коммит:** `cffe3c5e`. Хронология: раздел 52, реестр 161 строка.
- **Ограничение (записано):** коды из переменных сканер не видит → набор является нижней оценкой; следующий шаг — не усложнять регулярки, а убрать возможность, оставив одну функцию записи кода в тело ответа.

### 2026-11-18 — Один писатель тела ошибки

- **Найдено:** страж дрейфа кодов видел только коды из хелперов и литералов `code:`; пять ответов 409 в `index.js` собирали тело вручную → инвентарь кодов был нижней оценкой.
- **Сделано:** `sendError(res, status, message, code, extra)` как единственный писатель тела ошибки (extra → error → code, подменить нельзя); пять 409 переведены, 202 (прогресс) оставлены; новый тест падает на любом ручном теле 4xx/5xx с кодом. Сканер научен `sendError`-форме, в выборку добавлен `generation_in_progress`.
- **Проверки:** мутация «вернуть ручное тело» → `index.js:1789`; полный прогон backend **954/954**.
- **Коммит:** `b5c37801`. Хронология: раздел 53, реестр 163 строки.
- **Результат:** утверждение «каждый видимый клиенту код либо смаплен, либо исключён с причиной» теперь проверяется механически.

### 2026-11-18 — Вход: бюджет попыток на аккаунт

- **Найдено:** `/login` ограничивался только по IP (10/15 мин), замка на аккаунт в базе нет → распределённый подбор пароля или несколько инстансов (счётчик в памяти) снимали ограничение. Бюджеты были захардкожены, поэтому тест не мог их различить.
- **Сделано:** второй независимый бюджет по нормализованному email (`trim + lower`), запросы без email — одна корзина; оба предела конфигурируемы (`AUTH_RATE_LIMIT_MAX`, `LOGIN_ACCOUNT_RATE_LIMIT_MAX`) и задокументированы в `.env.example` с честным ограничением (in-memory). Новый HTTP-тест: 3 попытки → 4-я 429 с кодом, вариант регистра/пробелов делит корзину, другой аккаунт не заблокирован.
- **Проверки:** две мутации отдельными командами (без нормализации, лимитер снят) — обе падают по делу. backend **955/955**.
- **Коммит:** `29b95e13`. Хронология: раздел 54, реестр 166 строк.
- **Осталось (записано):** долговечный замок в базе (`failed_login_count`/`locked_until` + код `login_locked`) требует миграции и прогона SQL-гейта владельцем.

### 2026-11-18 — `/pricing` и deep-link по вкладкам

- **Найдено:** бэкенд отдавал `upgrade_url: "/pricing"` всем с истёкшей подпиской, а такого маршрута не было — catch-all уводил на лендинг; клиент `upgrade_url` не читал, а тарифы в приложении — вкладка, не путь.
- **Сделано:** `/pricing` как реальный маршрут (авторизованный → `/app?tab=pricing`, гость → лендинг с планами); приложение принимает `?tab=` с валидацией по `APP_TABS`; `backend/test/ui-url-contract.test.js` (3 теста) сверяет адреса, которые бэкенд обещает, с маршрутами роутера, проверяет рендер каждой вкладки и сохранение `?payment=success`. Побочно обновлён фронтенд-страж формы 409 после рефактора `sendError`.
- **Проверки:** две мутации отдельными командами (удалён маршрут, снята валидация) — падают по делу. backend **958/958**, frontend **308/308**, tsc чисто, vite build OK.
- **Коммит:** `6dcc8b61`. Хронология: раздел 55, реестр 169 строк.

### 2026-11-19 — Полнота записи разработки: каждый коммит имеет адрес «зачем»

- **Найдено:** 49 из 109 коммитов сессии не были упомянуты ни в реестре, ни в истории; два из них (`1d63579d`, `8d234c5f`) меняли поведение вообще без записи. Страж документации проверял только **упомянутые** коммиты — «что записано, то верно» вместо «записано всё». Первая версия нового стража оказалась вакуумной: приложение уже содержало все хеши, поэтому он проходил при любых удалениях; переписан на проверку **разрешимого адреса** обоснования.
- **Сделано:** строки реестра 170–172; приложение 56.4 с полной хронологией 109 коммитов (суть + адрес обоснования: строка реестра, написанный раздел, `PROJECT_STATE`, UA); инструмент `scripts/update-chronology.cjs` пересобирает приложение из git-истории по доказательствам, а `--check` валит рассинхрон; маркер `<!-- session-base: ebc30e92 -->`; страж требует записи для каждого коммита, кроме `HEAD`, и проверяет, что `docs:`-коммит не трогает код (нашёлся реальный случай `422efd34` — страж-фикс под docs-заголовком, внесён в список исключений с причиной, список самопроверяющийся).
- **Проверки:** 5 мутаций отдельными командами (адрес `—`, адрес `§999`, удалённая строка, освобождение для всех коммитов, удалённое исключение) — каждая падает по своему сообщению. `documentation-integrity.test.js` 6/6, `update-chronology.cjs --check` OK.
- **Инструмент:** `node scripts/update-chronology.cjs` — перед каждой записью документации; `--check` — в проверках.

- **Процедурная ошибка (записана):** заголовок `docs:` дважды стоял на коммитах, которые меняли тесты и инструменты (`422efd34`, `34ab6514`). Второй поймал новый страж. История не переписывается — оба внесены в список исключений с причиной; правило: стражи и инструменты документации идут под `test(...)`/`tooling(...)`.

### 2026-11-19 — Денежный путь покупки кредитов под тестами

- **Найдено:** `createCreditsPayment` (строки 47–175 `creditsBilling.js`) не выполнялся ни в одном тесте, хотя именно там выбирается цена, пишется строка заказа, вызывается провайдер и отдаётся ссылка. Пакеты продаются только в рублях, клиент валюту не передаёт — зафиксировано.
- **Сделано:** `backend/test/credits-purchase.test.js` — 13 тестов на свойства: цена и кредиты только из каталога, отказ 422 до записи и до резервирования ключа, 503 без платёжных ключей, ровно один счёт на ключ, `409 idempotency_key_reused` при другом пакете, `failed` vs `unknown` на всех путях отказа, отказ при непроверяемом URL вебхука до траты ключа, история покупок в рамках клиента.
- **Проверки:** 3 мутации отдельными командами (цена из тела, `unknown` как обычная ошибка, снятая пометка `denied`) — каждая падает по своему сообщению. backend **972/972**, frontend **308/308**. Покрытие: `creditsBilling.js` 67 % → 79.85 % строк, `validate.js` 100 %.
- **Урок записан:** двойник PostgREST мутировал состояние, но не возвращал идентификатор строки, поэтому проверка подтверждения в `denyUnsentPaymentRecord` не выполнялась, а тест этого не видел.
- **Коммит:** `05215905`. Хронология: раздел 57, реестр 175 строк.

### 2026-11-19 — Тариф с именем члена `Object.prototype` принимался

- **Найдено:** `if (!PLANS[plan])` в `billing.js` пропускал членов `Object.prototype`: `plan: "constructor"` → сумма `undefined` → строка подписки с `amount` по умолчанию 0 → отказ провайдера → запрос паркуется как `unknown`, клиент в тупике, в базе pending-подписка с нулевой суммой. Тот же класс в `getPlanTitle`: возвращал **функцию** для `"constructor"`, а значение подставляется в письмо об оплате. Все прочие каталоги проекта уже проверяли собственное свойство — `billing.js` был единственным исключением и единственным денежным файлом без тестов.
- **Сделано:** `hasOwnProperty` в проверке тарифа (422 до резервирования ключа, записи и вызова провайдера); `getPlanTitle` не разрешает неизвестное имя через прототип; `subscription-purchase.test.js` (11 тестов на денежный путь подписок), `email-locales.test.js` (+2 теста на прототипные имена и полноту 7 языков).
- **Проверки:** 3 мутации отдельными командами (старая проверка, сумма из тела, индексация без проверки) — каждая падает по своему сообщению. backend **985/985**.
- **Коммит:** `83eebc73`. Хронология: раздел 58, реестр 178 строк.

### 2026-11-19 — SSRF-щит: DNS-путь покрыт, потеря тестов стала громкой

- **Найдено:** в `publicUrl.js` (77 %) не выполнялась именно сетевая часть — `resolvePublicAddresses` и успешный путь `assertPublicUrl`; такой код ломается молча. **Процедурная ошибка (вторая):** я перезаписал существующий `backend/test/public-url.test.js` (7 тестов), потому что записал файл, не проверив `git ls-files`; прогон остался зелёным.
- **Сделано:** оригинал восстановлен из `HEAD`, к нему добавлено 6 тестов (литералы адресов `[::1]`, `2130706433`, внутренние имена до DNS, смешанные ответы, пустой ответ, 502, экзотические IPv6, границы диапазонов, нормализация URL). Новый страж `test-inventory.test.js` + `test-inventory.json`: уменьшение числа объявлений тестов, исчезновение файла или незаписанный новый файл роняют прогон.
- **Проверки:** 2 мутации отдельными командами (укороченный файл, незаписанный новый файл) — обе падают по делу. `publicUrl.js` 77 % → 100 % строк. backend **993/993**, frontend **308/308**.
- **Коммит:** `1bced322`. Хронология: раздел 59, реестр 181 строка.

### 2026-11-19 — Долговечный замок входа (миграция 164)

- **Найдено:** оба лимита `/login` (по адресу и по аккаунту из §54) жили в памяти процесса: число инстансов умножalo бюджет, перезапуск обнулял счётчики, а замка на аккаунт в базе не было. Это была записанная дыра.
- **Сделано:** миграция **164** (аддитивная): `users.failed_login_count`, `users.login_locked_until`, частичный индекс и три функции только для `service_role` — `login_lock_state` (неизвестный адрес не блокируется, чтобы не перечислять аккаунты), `record_failed_login` (один `UPDATE`, гонки не проскакивают потолок), `clear_login_failures` (по `user_id`). `backend/loginLockout.js` с разделённой политикой: нет миграции → лог и работа на in-memory лимитах; иная ошибка БД → `503`. В `login()` проверка замка идёт до bcrypt, неудача считается только для существующего адреса, ответ остаётся «неверный пароль», верный пароль сбрасывает счётчик. Клиент: `429 login_locked` + `retryAfterSeconds`, 7 языков, `withLockoutWait`. `.env.example`: `LOGIN_LOCKOUT_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_SECONDS`. Цепочка миграций, гейт и Windows-replay расширены до 164.
- **Проверки:** 3 мутации отдельными командами (нет проверки замка, нет подсчёта неудачи, любая ошибка БД как «нет миграции») — каждая падает по своему сообщению. backend **1003/1003**, frontend **310/310**, tsc чисто, vite build OK, bash -n чисто.
- **Коммит:** `7131aef8`. Хронология: раздел 60, реестр 185 строк, новое действие владельца **UA-070** (прогнать гейт с миграцией 164).
- **Осталось:** миграция не применена (UA-070); обратного отсчёта в UI нет; письма «кто-то пытался войти» нет.

### 2026-11-19 — Почтовый путь: три реальных дефекта

- **Найдено:** `mail.js` (52 % строк) не выполнял именно сетевую часть; тесты нашли три дефекта: пустой ящик запрашивался недействительным диапазоном `1:*` (500 вместо «писем нет»), префикс ответа проверялся с учётом регистра (`RE:` → `Re: RE:`), отправитель без имени рендерился с ведущим пробелом.
- **Сделано:** пагинация пропускается при нуле писем; тема ответа нормализуется в один `Re: `; отправитель без имени — чистый адрес. `backend/test/mail-delivery.test.js` — 12 тестов с двойниками `nodemailer`/`imapflow` (конверт, отсутствующие части, ошибки транспорта, поток ответа, страницы ящика, освобождение блокировки при ошибке, тело письма, отказ до соединения).
- **Проверки:** 3 мутации отдельными командами — каждая падает по своему сообщению. `mail.js` 52.31 % → **100 %** строк. backend **1015/1015**, frontend **310/310**.
- **Коммит:** `85d01948`. Хронология: раздел 61, реестр 188 строк.
- **Технический долг (записан):** SMTP-пул не используется (новое соединение на письмо); реальный SMTP/IMAP не проверялся — нужен staging (UA-066).

### 2026-11-19 — Хранилище: создание бакета и лестница восстановления

- **Найдено:** `storage.js` (79.61 %) не выполнял ветви первого деплоя и застрявшей загрузки: создание бакета, отказ при расхождении конфигурации, коды конфликтов жизненного цикла, исчерпание лестницы восстановления. Нового дефекта нет — код был верным; ценность в том, что ветви больше не могут сломаться молча.
- **Сделано:** `backend/test/storage-upload.test.js` — 12 тестов с двойниками Storage-клиента, жизненного цикла и `axios`: бакет создаётся один раз с теми же лимитами, что проверяет валидатор; `503` без текста провайдера; `422` до обращения к бакету; каждый код конфликта сохраняется; готовая загрузка не повторяется; лестница ровно три ступени; агенты уничтожаются в `finally`.
- **Проверки:** 3 мутации отдельными командами (одна ступень, игнор готовой загрузки, приём неверного бакета) — каждая падает по делу. `storage.js` 79.61 % → **95.15 %** строк. backend **1027/1027**.
- **Коммит:** `da962b3c`. Хронология: раздел 62, реестр 191 строка.

### 2026-11-19 — Письмо об активации: «доступ до 1 января 1970»

- **Найдено:** в диспетчере письма об активации `new Date(null)` — эпоха и «конечная» дата, поэтому строка очереди без `period_end` давала платящему клиенту письмо «доступ действует до 01 января 1970 г.», и оно помечалось отправленным (ошибка доставлялась и исчезала).
- **Сделано:** неположительная отметка времени теперь `invalid_payload` (повтор, без отправки). `backend/test/subscription-email-outbox.test.js` — 10 тестов: валидация батча (10 вариантов мусора), локализация темы, сумма в теле, стабильный `messageId`, потерянный claim не считается отправкой, сбой записи повтора не останавливает батч, безопасный код вместо текста SMTP, отчёт здоровья очереди с возрастами и мёртвыми элементами.
- **Проверки:** 3 мутации отдельными командами — каждая падает по своему сообщению. backend **1037/1037**.
- **Коммит:** `e4173103`. Хронология: раздел 63, реестр 194 строки.

### 2026-11-19 — Журнал генерации: терминальные ветви

- **Найдено:** `pins.js` (76.01 %) не выполнял терминальные ветви журнала: уже проваленная задача, `prepared` без покрытия баланса, успех без картинки, сбой журнала при восстановлении, отказ провайдера с task id и без. Именно они решают, сколько раз спишут деньги.
- **Сделано:** `backend/test/pins-journal-branches.test.js` — 14 тестов через сохранённый план (без текстового провайдера): failed не повторяется, `awaiting_balance` вместо траты, готовый результат без вызова провайдера, `successful_result_unrecoverable`, сбой журнала прерывает прогон и удаляет копию, сбой хранилища оставляет `unknown`, отложенная задача `queued`, отказ провайдера как `failed` (никогда `unknown`), успех не перезаписывается транспортной ошибкой, непригодный план и котировки отклоняются до вызова провайдера.
- **Проверки:** 3 мутации отдельными командами (терминальный успех дальше, проглоченная журнальная ошибка, снятая проверка баланса) — каждая падает по делу. `pins.js` 76.01 % → **95.15 %** строк. backend **1051/1051**.
- **Коммит:** `fa2dd7ef`. Хронология: раздел 64, реестр 197 строк.
- **Осталось:** ветви двойного сбоя (журнал + хранилище) — честнее проверять на staging (UA-066).

### 2026-11-19 — Панель замка входа и системная проверка вкладок админки

- **Найдено:** §65 создал маршруты, которыми владелец мог пользоваться только через `curl`. При написании проверки обнаружилось, что она декоративна: строка `AdminLoginLockout` уже присутствовала в импорте, поэтому удаление вкладки и рендера оставляло прогон зелёным (мутация не упала — записано как ошибка).
- **Сделано:** `AdminLoginLockout.tsx` — состояние только от сервера (заблокирован / остаток / попытки), сброс показывает подтверждённое `affectedRows`; `adminPanelDataSafety.test.ts` проверяет **каждую** вкладку в обе стороны (объявлена ↔ перечислена ↔ отрендерена).
- **Проверки:** 4 мутации отдельными командами (необрезанный адрес, локальное «не заблокирован», вкладка без `TABS`, вкладка без объединения) — каждая падает своим сообщением. frontend **312/312**, `tsc` чисто, `vite build` OK.
- **Коммит:** `a234e68d`. Реестр 203 строки.
- **Урок:** проверка, ищущая имя компонента в файле с его импортом, не проверяет ничего.

### 2026-11-19 — Мёртвое письмо можно переотправить (миграция 165)

- **Найдено:** исчерпав попытки, письмо помечалось `dead` и терялось навсегда; панель была только для чтения. Мёртвое письмо об активации = платящий клиент, которому никто не сказал, что он купил.
- **Сделано:** миграция 165 `requeue_email_outbox(p_id)` (только `dead`, только `service_role`, отказ с причиной: `not_found` / `not_dead` + статус / `content_missing` / `id_required`); `billing.requeueEmailOutbox()` с проверкой UUID до запроса, `503` с номером миграции при её отсутствии и `409 email_not_requeueable` на любой отказ; маршрут `POST /admin/billing/email-outbox/:id/requeue` (админский лимитер до аутентификации); кнопка «Вернуть в очередь» в панели с предупреждением о возможном дубле.
- **Проверки:** 3 мутации отдельными командами; третья **сначала была пустой** (LF-шаблон против CRLF-файла) — записано как ошибка, после исправления упала по делу. Существующие стражи (`error-code-drift`, `route-ownership-coverage`) потребовали внести новый код и маршрут с причинами. backend **1063/1063**, frontend **313/313**, `tsc`/`vite`/`bash -n` чисто.
- **Коммит:** `50a10526`. Цепочка миграций 010–165. UA-070 обновлён: обе миграции одним прогоном.
- **Осталось:** массового возврата нет намеренно — каждое письмо может дублировать уже принятое SMTP.

### 2026-11-19 — Публикация в Pinterest: тесты вместо чтения исходника

- **Найдено:** `publishPin()` (290 строк, создаёт реальный пин на аккаунте клиента) не имела ни одного поведенческого теста. Гарантии о резервации и ограждениях существовали только в комментариях.
- **Сделано:** `backend/test/pinterest-publish-pin.test.js` — 27 тестов на реальной композиции (двойники только для Supabase и axios): отказы до резервации, проверка доски у аккаунта, все не-`started` статусы резервации, запрет воспроизведения 429, журналирование неопределённых исходов, потерянный claim расписания, неизменяемый снимок креатива, сверка неудавшегося коммита с реестром.
- **Мои ошибки до коммита:** двойник отдавал строку вместо списка (`getAccounts` ждёт массив) — 16 из 19 тестов падали из-за двойника; тест транспорта подменял кеш `require` после связывания `axios` и проходил на собственном броске двойника.
- **Проверки:** 8 мутаций отдельными командами из сохранённой копии, все упали по своим причинам, восстановленный файл зелёный. `pinterest.js`: строки 29.59 % → **56.22 %**, функции 55.17 % → **83.33 %**. backend **1090/1090**.
- **Коммит:** `433224b1`. Реестр 207–209.
- **Осталось:** `registerRoutes` (917–1479) не исполняется ни одним тестом; `exchangeCode` и часть ветвей `refreshAccessToken` без покрытия.

### 2026-11-19 — Маршруты Pinterest: исполняем, а не читаем

- **Найдено:** `registerRoutes()` (~560 строк) не исполнялся ни одним тестом — привязка состояния к браузеру, ограждения OAuth, ответ о лимите, семантика отключения и секрет планировщика существовали только в исходнике.
- **Сделано:** `backend/test/pinterest-routes-behaviour.test.js` — 17 тестов на настоящем express по HTTP; двойники только на границах (Supabase, axios, тариф). Проверено: токены не отдаются, лимит падает до нуля при истёкшей подписке, cookie привязки ставится только при совпадении, любой исход callback возвращает вердикт без токена и очищает cookie, отключение не угадывает аккаунт и не врёт об успехе, оба написания доски доходят до публикации, короткий секрет планировщика отвергается даже при точном совпадении.
- **Исправлено в тесте, а не в коде:** ожидание внутреннего текста на ≥500 противоречило политике «на 5xx пересекает только машинный код».
- **Ошибка:** проверка привязки на callback была **пустой** мутацией (тест падал позже по другой причине); переписан так, чтобы её падение было единственным возможным; после этого 10/10 мутаций ловятся.
- **Проверки:** `pinterest.js` строки 56.22 % → **75.17 %**; backend **1107/1107**, frontend **313/313**, `tsc` чисто. Коммит `1e2caa0b`, реестр 210–212.
- **Осталось:** работник планировщика (1176–1475), `exchangeCode`, часть ветвей обновления токена — нужен staging или двойник OAuth-обмена.

### 2026-11-19 — Работник планировщика: 92.57 % pinterest.js

- **Найдено:** `POST /internal/pinterest/schedule/run` (~300 строк) публиковал по расписанию без единого исполненного теста — вердикты `failed`/`unknown`/`scheduled`, восстановление unknown-попыток и подтверждение монитора проверялись только чтением.
- **Сделано:** `backend/test/pinterest-scheduler-worker.test.js` — 11 тестов на настоящем express: пустая очередь, некорректная партия claim, неподтверждённый старт монитора, истёкшая подписка, ровно одна публикация, потерянный claim перед POST, восстановление unknown с удалённым id (и отказ доверять чужому/другому завершению), повторяемый `scheduled`, `500` при неподтверждённом завершении монитора.
- **Мои ошибки до коммита:** конфигуратор сценария выполнялся до стабов по умолчанию (три теста утверждали не про тот двойник); тест восстановления ждал исход, которого реальный контракт RPC не даёт.
- **Проверки:** 9 мутаций отдельными командами, все упали. `pinterest.js`: строки 75.17 % → **92.57 %**, функции 91.07 %. backend **1118/1118**.
- **Коммит:** `1a4238c5`. Реестр 213–215.
- **Осталось:** `exchangeCode`, часть ветвей обновления токена; живой Pinterest не проверен (UA-066).

### 2026-11-19 — Точка входа под HTTP-тестами

- **Найдено:** `index.js` (3200 строк, все клиентские маршруты) не исполнялся ни одним тестом — пробы, лимиты, CORS, отображение ошибок проверялись чтением; 8.66 % строк.
- **Сделано:** настоящая точка входа запускается дочерним процессом против заглушки PostgREST (`test/helpers/fake-postgrest.js`) и опрашивается по HTTP. 9 тестов: честная готовность, неприкосновенность проб и вебхука, `429` с ожиданием в теле, каталоги из кода, `400` на битый JSON, `403` на чужой origin, `401` на защищённых маршрутах, JSON-`404`.
- **Мои ошибки до коммита:** проверялось поле `price`, которого нет (реально `amount.rub`), и заголовок `Retry-After`, который ставит сама библиотека — утверждение не зависело от нашего кода.
- **Проверки:** 9 мутаций отдельными командами, все упали. backend **1128/1128**, инвентарь 146/1125.
- **Коммит:** `5e0d4e5d`. Реестр 216–218.
- **Осталось:** плавное завершение не проверено (Windows не доставляет SIGTERM — **UA-072**); метрика покрытия не видит дочерний процесс (записано честно); сами обработчики чтения данных всё ещё не исполняются.

### 2026-11-19 — Сбой базы больше не выдаётся за удалённый аккаунт

- **Найдено:** `/me` и проверки владения доской/пином отвечали `404` при **любой** ошибке запроса, не отличая её от отсутствующей строки: во время аварии базы клиенту говорили «аккаунт не найден», а сбой скрывался под кодом «данных нет».
- **Сделано:** `PGRST116` (ноль строк) — `404` со своим кодом; любая другая ошибка — `503` с общим телом (клиент сохраняет сессию, `AuthContext` уже так делает на не-401).
- **Тесты:** `backend/test/api-authenticated-reads.test.js` — 9 тестов по HTTP с настоящим session-токеном: фильтр по владельцу, тариф из резолвера прав, хеш пароля не уходит, отозванный токен отклоняется до чтения, чужая доска/пины — `404` без запроса пинов, упавший запрос — `503`.
- **Ошибки в своей заглушке (найдены падениями не по той причине):** `.single()` требует объект (иначе пустой массив = найденная строка) и HEAD-запрос счёта маршрутизируется как GET.
- **Проверки:** 9 мутаций отдельными командами, все упали. backend **1137/1137**, инвентарь 147/1134.
- **Коммит:** `18fea1ee`. Реестр 219–221.
- **Осталось:** пройти по остальным `if (error || !data)` в `index.js` отдельно; маршруты записи всё ещё без исполняемых тестов.

### 2026-11-19 — Последние два места «ошибка = отсутствие»

- **Найдено:** `GET /projects/:id` и `POST /credits/dev-topup` всё ещё сводили ошибку запроса к `404`: владельцу говорили «проекта нет», оператору — «пользователя нет».
- **Сделано:** разделение `PGRST116` (404) и любой другой ошибки (503). Тест dev-topup дополнительно закрепляет отказ по неверному `ADMIN_SECRET` до любого поиска пользователя.
- **Проверки:** 3 мутации отдельными командами, все упали. backend **1141/1141**, инвентарь 147/1138.
- **Коммит:** `1c9d1483`. Реестр 222–224.

### 2026-11-19 — Блокировка входа с обратным отсчётом

- **Найдено:** страница входа показывала «повторите через 15 минут» один раз и не меняла текст; кнопка отправки оставалась активной, признака окончания ожидания не было.
- **Сделано:** `frontend/src/lib/lockoutCountdown.ts` (дедлайн из `retryAfterSeconds`, запасное короткое ожидание вместо «блокировки нет», потолок сутки, округление вверх, самоочистка) + подключение в `Login.tsx` (тик раз в секунду, блокировка отправки, живой текст, очистка интервала и сообщения) + `errorLoginLockedCountdown` во всех семи языках.
- **Проверки:** 9 мутаций отдельными командами, все упали. frontend **321/321**, `tsc` чисто, `vite build` OK.
- **Коммит:** `e1ba8a46`. Реестр 225–227.
- **Осталось:** уведомления владельцу о попытках входа нет; DOM-теста нет (нет jsdom) — проверены логика и структура компонента.

### 2026-11-19 — Вебхук покупки кредитов под тестами

- **Найдено:** вебхук зачисления кредитов (`creditsBilling.js` 183–380) не исполнялся ни одним тестом: решения «зачислить/не зачислить» проверялись чтением, файл стоял на 79.85 % строк.
- **Сделано:** `backend/test/credits-webhook.test.js` — 19 тестов через настоящую композицию: подпись, квитанция до поиска заказа, демо-защита, отсутствующий/неизвестный заказ, нераспознанный и неуспешный статус, нечитаемая и несовпавшая сумма, транзакционный RPC и его id квитанции, повтор `idempotent`, удержанный fulfilment, сбой сверки, сбой аудита/решения.
- **Мои ошибки до коммита:** запасное значение по ложноте превратило намеренный пустой статус в `success`; один тест забыл `order_id` и утверждал про другую ветку.
- **Проверки:** 15 мутаций отдельными командами, все упали. `creditsBilling.js`: 79.85 % → **96.98 %** строк, функции 100 %. backend **1160/1160**, инвентарь 148/1157.
- **Коммит:** `6690f538`. Реестр 228–230.
- **Осталось:** четыре однотипных `catch (auditError)`; живой Prodamus не проверен (UA-066).

### 2026-11-19 — Вебхук подписки под тестами

- **Найдено:** `handleWebhook` (активация оплаченного тарифа) не исполнялся ни одним тестом: 28 ветвей — подпись, квитанция, статусы, суммы, активация, сверка, рассылка — проверялись чтением; `billing.js` 87.41 % строк.
- **Сделано:** `backend/test/billing-webhook-branches.test.js` — 20 тестов через настоящую композицию, включая идемпотентный повтор, который всё равно вычитывает очередь писем, и `200` при сбое рассылки после успешной активации.
- **Проверки:** 14 мутаций отдельными командами, все упали. `billing.js`: 87.41 % → **97.79 %** строк, функции 95.24 %. backend **1180/1180**, инвентарь 149/1177.
- **Коммит:** `5d84045e`. Реестр 231–233.
- **Осталось:** `createPayment` (38–42, 81–85) и два однотипных `catch (auditError)`; живой Prodamus не проверен (UA-066).

### 2026-11-19 — Регистрация и вход: `auth.js` до 100 %

- **Найдено:** в `auth.js` (89 % строк) не исполнялись повтор вставки при старой схеме, конфликт `23505` на вставке, отказ удаляемому аккаунту и вход при отсутствующей колонке подтверждения.
- **Сделано:** 9 тестов в существующем наборе: гонка регистрации, повтор без необязательных колонок, запрет повтора на посторонней ошибке, требование и кода, и имени колонки, `account_pending_deletion`, отсутствующая колонка не запирает всех.
- **Проверки:** 7 мутаций отдельными командами, все упали. `auth.js`: строки 89 % → **100 %**, ветви 82.61 % → 94.12 %. backend **1188/1188**, инвентарь 149/1185.
- **Коммит:** `86b2cf76`. Реестр 234–236.
- **Ошибка в подготовке мутаций:** два литерала не совпали из-за экранирования `\b` — заметно по «ЛИТЕРАЛ НЕ НАЙДЕН», а не по зелёному прогону.

### 2026-11-19 — Удаление аккаунта: лестница подтверждений

- **Найдено:** в `accountDeletionWorker.js` (88.72 % строк) не исполнялись подтверждения стадий: finalize, форма и fencing манифеста Storage, счётчик отключений Pinterest, подтверждение удаления объекта, подсчёт писем в инвентаре.
- **Сделано:** 8 тестов в существующем наборе; ветка `unsupported_deletion_step` записана как недостижимая через claim (утверждается отказ партии до кода стадии).
- **Проверки:** 8 мутаций отдельными командами, все упали. `accountDeletionWorker.js`: 88.72 % → **93.85 %** строк, функции 90 %. backend **1196/1196**, инвентарь 149/1193.
- **Коммит:** `39e3bb85`. Реестр 237–239.
- **Мои ошибки:** клиент без `from()` дал `TypeError` вместо ожидаемого кода; утверждение `.params` у вызова, записанного как `.args`.
- **Осталось:** `stop()`/дренаж, два служебных блока; живое удаление — только на staging/одноразовой базе.

### 2026-11-19 — Маршруты записи: владелец из токена, массовое присваивание закрыто

- **Найдено:** создание проекта, создание доски и смена статуса пина не исполнялись ни одним тестом; массовое присваивание и создание доски в чужом проекте проверялись только чтением.
- **Сделано:** 9 HTTP-тестов: владелец из токена (а не из тела), отказ `javascript:`-адресу, отказ доске в чужом проекте, идемпотентное создание доски с `409` при другом содержимом, allowlist патча, владение доской и пином.
- **Проверки:** 8 мутаций отдельными командами, все упали. backend **1205/1205**, инвентарь 149/1202.
- **Мои ошибки в заглушке:** read-back возвращал fingerprint повтора (конфликт был необнаружим), заглушка владельца игнорировала последний POST, у пина не было вложенной строки владельца (`422` → `404`).
- **Коммит:** `be3c09f1`. Реестр 240–242.
- **Осталось:** маршруты с ИИ (нужен двойник провайдера в процессе), удаление сущностей и загрузка изображений.

### 2026-11-19 — Разбор тестовой системы и две закрытые области

- **Анализ:** backend 149 файлов / 1210 объявлений / 1213 тестов, 51 SQL-интеграционный файл, 77 файлов фронтенда (321 тест), 165 миграций; покрытие модулей **90.71 % строк / 90.26 % ветвей**. Разбор по риску и список непроверенного (маршруты ИИ, живой staging, DOM, дренаж воркера, уведомление о попытках входа) — в разделе 80 аудита.
- **Добавлено:** 5 HTTP-тестов очереди проверки (чужой пин, владелец из токена, черновик, удаление по владельцу с `500` при сбое, очистка устаревших строк) и 3 теста сопоставления платежей в админке (двойная привязка заказа — ошибка, `identity_mismatch` по типу, скрытие служебных колонок).
- **Проверки:** 11 мутаций отдельными командами, все упали. `adminPaymentCreationRequests.js` 89.26 % → **100 %**. backend **1213/1213**.
- **Моя ошибка:** первый тест утверждал, что `matched_record_kind` отдаётся клиенту — код сознательно его вырезает; тест был неверен, код прав.
- **Коммит:** `bae6b53e`. Реестр 243–245.
- **Приоритеты дальше:** шов для провайдеров ИИ, миграции 164/165 у владельца, staging (UA-066), уведомление о попытках входа, покрытие дочернего процесса.

### 2026-11-19 — Ещё пять мест «сбой = нет данных» (одно — ложный отказ в правах)

- **Найдено:** `PATCH /me/tariff` отвечал `403` администратору, у которого упал запрос флага (`adminLookupError || !me || !me.is_admin`); ещё четыре маршрута отдавали `404 project_not_found` при сбое чтения проекта (`/analyze`, `/boards/generate`, `GET /projects/:id/boards`, `POST /boards`).
- **Сделано:** правило вынесено в `isMissingRow(error)` (`PGRST116` → 404, остальное → 503 с логом); единственный оставшийся `error || !data` (обмен изображения пина) оставлен сознательно — он пробрасывает исходную ошибку после уборки.
- **Тесты:** `backend/test/missing-row-vs-error.test.js` — системный страж сканирует каждый `notFoundError(` и называет строку; сканер проверен образцами. Плюс 6 HTTP-тестов маршрутов.
- **Проверки:** 6 мутаций отдельными командами, все упали. backend **1222/1222**, инвентарь 150/1219.
- **Коммит:** `568cc9dc`. Реестр 246–248.
- **Осталось:** маршруты ИИ целиком (нужен шов для адреса провайдера — следующий приоритет, там списываются кредиты).

### 2026-11-19 — Шов к провайдеру ИИ и настоящая дыра в «недоверенных данных»

- **Найдено:** маршруты ИИ не исполнялись нигде (жёстко зашитый адрес провайдера) — крупнейшая поверхность, где списываются кредиты. Как только маршрут генерации досок исполнился, проявилась дыра: `serializeUntrustedPromptContext` делал только `JSON.stringify`, поэтому сводка сайта клиента могла закрыть `</project_context_json>` и продолжить как инструкции.
- **Сделано:** `resolveApiBase()` + `AI_PROVIDER_BASE_URL` (только `development`/`test`, иначе константа; непригодный адрес откатывается), переменная в `.env.example` (страж env поймал её раньше меня). Экранирование `<` как JSON-escape — значение остаётся побайтово тем же.
- **Тесты:** 3 на шов, 2 на закрывающий тег, 2 на маршрут целиком (201 + один вызов провайдера + рамка промпта + отсутствие записи при сбое).
- **Проверки:** 8 мутаций отдельными командами, все упали. backend **1229/1229**, инвентарь 151/1226.
- **Коммит:** `1123273e`. Реестр 249–251.
- **Осталось:** `/pins/:id/regenerate` и `/generate` по тому же шву (нужен двойник хранилища), `/analyze` — успешный разбор требует публичного сайта.

### 2026-11-19 — Машина состояний генерации (где списываются деньги)

- **Найдено:** `/boards/:id/pins/generate` первым делом вызывает `begin_pin_generation_request`, и ответ решает, списывать ли деньги второй раз, — эта машина состояний не исполнялась нигде.
- **Сделано:** 6 HTTP-тестов на все состояния (`expired` 410, `completed` 200 с пинами, `processing` 409 + `Retry-After`, `unknown`/`failed` 409, баланс 402 до резерва и до провайдера) + 2 теста шлагбаумов (кривой `Idempotency-Key` → 422 без RPC, чужая доска → 404 без расхода ключа). Тарифный шлагбаум стоит раньше проверки владельца — тесты дают активный тариф, иначе утверждали бы `tariff_required`.
- **Мои ошибки:** заглушки RPC на обвязке вместо её базы; лишний запущенный backend в одном тесте — утёкший процесс держал файл живым (таймаут при 41 зелёном).
- **Проверки:** 8 мутаций отдельными командами, все упали. backend **1235/1235**, инвентарь 151/1232.
- **Коммит:** `45a7ee18`. Реестр 252–254.
- **Осталось:** успешный проход `started`/`resume` до конца (журнал попыток, провайдер изображений, RPC завершения) — нужен двойник хранилища в дочернем процессе; `/pins/:id/regenerate`.

### 2026-11-20 — Упавшая перегенерация убивала backend

- **Найдено (настоящий дефект):** построитель запроса supabase — thenable с `then` и без `catch`; три места заканчивались `.catch(...)`, что бросает `TypeError` **в ветке записи сбоя** → unhandled rejection → `exit(1)`. Любой сбой `/pins/:id/regenerate` (баланс, котировка, провайдер, хранилище) убивал сервер; тот же шаблон стоял на фенсе «Pinterest создал пин, локальная запись не удалась».
- **Сделано:** `settleQuery()` вместо `.catch` в трёх местах; `settle-query.test.js` (двойник без `.catch`, проверка поведения), системный сканер `supabase-builder-catch.test.js` (снимает комментарии, ограничен цепочкой вызова, самопроверка на 5 формах), честный тест `publishPin` с отклоняющим thenable, 5 HTTP-тестов перегенерации.
- **Мои ошибки:** экспорт `settle` против импорта `settleQuery`; чтение `p_status` у строки вместо JSON.
- **Проверки:** 6 мутаций отдельными командами, все упали; синтаксическую и поведенчески эквивалентную мутации переделал/убрал. backend **1248/1248**, инвентарь 153/1245.
- **Коммит:** `cb04974a`. Реестр 255–257.
- **Осталось:** успешный проход `started`/`resume` до конца (провайдер изображений + хранилище) — нужен двойник хранилища в дочернем процессе.
- **Инцидент окружения:** машина владельца выключилась 2026-11-20 в 17:02:54 (System, Id 41 + 6008 «неожиданное завершение работы», минидампа нет) — не действие кода; вся работа была зафиксирована, дерево чистое.

### 2026-11-20 — Путь возобновления перегенерации (повтор не должен списывать второй раз)

- **Найдено:** вторая половина `/pins/:id/regenerate` — когда в журнале уже есть оплаченная работа провайдера — не исполнялась нигде; именно там повтор либо восстанавливает, либо списывает деньги снова.
- **Сделано:** 4 HTTP-теста: фактическая цена (10 → 15, а не оценка) + один терминальный факт + завершение с сохранённым URL и без резерва/котировки/провайдера; доплата → `402` без завершения и журнал `unknown`; потеря claim при завершении → `409`; идущая задача → один `GET` опроса и `202 regeneration_pending` с `Retry-After 10`.
- **Проверки:** 6 мутаций отдельными командами, все упали. backend **1252/1252**, инвентарь 153/1249.
- **Коммит:** `7000b011`. Реестр 258–260.
- **Осталось (честно):** успешный проход с **новой** отправкой провайдеру недостижим — `rehostImage` требует публичного HTTPS и настоящего DNS, а сеть в среде закрыта; проверены только «результат уже сохранён» и «задача уже создана». `checkImage` проверен лишь на статусе `running`.

### 2026-11-20 — Жизненный цикл работника удаления

- **Найдено:** (1) `start()` не идемпотентен — признаком запуска был `timer`, который `null` на всё время батча, поэтому второй `start()` ставил второй само-перепланирующийся цикл опроса; (2) standalone завершалась кодом 0, бросив задание удаления (супервизор читал это как чистую остановку).
- **Сделано:** флаг `started`; код 75 (EX_TEMPFAIL) при недоборе; тело standalone вынесено в `runStandaloneWorker()`; 6 тестов (`account-deletion-worker-lifecycle.test.js`), включая подсчёт запланированных продолжений и отказ запуска без opt-in (код 1).
- **Проверки:** 5 мутаций отдельными командами, все упали — одна из них вскрыла дыру (тест на перепланирование после `stop()` добавлен). `accountDeletionWorker.js` 93.85 % → **96.05 %** строк, функции 90 % → 96.88 %. backend **1258/1258**, инвентарь 154/1255.
- **Коммит:** `9d03da77`. Реестр 261–263.
- **Осталось:** включённая ветка standalone (602–604) — нужны живой Supabase и настоящий `SIGTERM` (Windows не доставляет его дочернему процессу, UA-072).
- **Действие владельца, отмеченное сейчас:** `origin/main` = `02197737` — владелец выложил 153 коммита; локально впереди 6 (на момент записи: `9d03da77`).

### 2026-11-20 — Загрузка изображения пина (маршрут впервые исполнен)

- **Найдено:** `POST /pins/:id/image` не исполнялся нигде — multipart с проверкой владельца, белым списком типов, проверкой байтов, резервом в базе и сравнением-и-заменой строки пина.
- **Сделано:** 9 HTTP-тестов (успешная загрузка с CAS-фильтром `image_url=is.null`; тело без файла → 422 `image_upload_required`; чужое имя поля → `LIMIT_UNEXPECTED_FILE`; `text/plain` → 415; «not really a png» → 422; чужой пин → 404 без Storage; проигранный CAS → 409 + удаление сироты; `referenced` → 409; 5xx оставляет резерв закрытым, 4xx освобождает с причиной). Фейк получил `routeMatching()` для случайных имён объектов.
- **Мои ошибки:** тест «без файла» отправлял файл под неверным именем поля (теперь два теста); утверждал не тот код ошибки Storage (`error.name`).
- **Проверки:** 9 мутаций отдельными командами, все упали (одну переделал — падала не по той причине). backend **1268/1268**, инвентарь 154/1265.
- **Коммит:** `81c5ff74`. Реестр 264–266. Продуктивный код не менялся: маршрут корректен, но не был проверен.
- **Осталось:** `LIMIT_FILE_SIZE`/`LIMIT_FIELD_COUNT`/`LIMIT_PART_COUNT` через настоящий парсер не прогонялись (тело 5 МиБ); `ensureBucket()` с отсутствующим бакетом и с неверной конфигурацией (503) не исполнены.

### 2026-11-20 — Бакет `pin-images` и предел 5 МиБ

- **Найдено:** ни одна ветвь `ensureBucket()` не исполнялась — приватный бакет дал бы картинки, которые не открывает Pinterest, узкий список MIME ломал бы GIF уже в Storage.
- **Сделано:** 5 HTTP-тестов (создание бакета ровно один раз с публичностью/типами/лимитом; приватный → 503 без записи и без резерва; узкий MIME → 503; сбой листинга → 503 **без попытки создать** бакет; файл на байт больше 5 МиБ → 413 `LIMIT_FILE_SIZE`). `routeMatching()` в фейке теперь разрешает совпадения от последнего к первому.
- **Проверки:** 6 мутаций отдельными командами. Пять упали сразу; шестая (сбой листинга = отсутствующий бакет) сначала прошла, потому что оба исхода дают 503 — тест усилен требованием «создание не предпринималось», после чего упала. backend **1273/1273**, инвентарь 154/1270.
- **Коммит:** `b9721dd4`. Реестр 267–269. Продуктивный код не менялся.
- **Осталось:** `LIMIT_FIELD_COUNT`/`LIMIT_PART_COUNT`/`LIMIT_FIELD_VALUE` через настоящий парсер; отказ Storage при создании бакета (`createError` → 503).

### 2026-11-20 — Онбординг: язык первого проекта и недостижимый адрес сайта

- **Найдено (два настоящих дефекта):** (1) первый проект создавался с жёстко русским `language`, а именно он задаёт язык контента всех последующих генераций — немецкий клиент получал русские пины; (2) оба пути записи сайта (`POST /projects`, онбординг) принимали `127.0.0.1`/`localhost`/`[::1]`, которые анализ всегда отвергает, оставляя клиенту проект с вечно падающим анализом.
- **Сделано:** язык берётся из запроса (визард отправляет язык интерфейса через `buildOnboardingPayload`), затем из профиля, затем историческое значение; общая константа 9 языков; существующему проекту язык не перезаписывается. `assertPublicWebsiteAddress()` без DNS отвергает литеральные локальные адреса и `localhost`/`.local`/`.internal` при записи; `assertPublicUrl` остаётся перед запросом.
- **Тесты:** 5 HTTP онбординга, 1 HTTP создания проекта, 7 юнит-тестов адреса, 5 фронтенд-тестов тела запроса.
- **Проверки:** 9 мутаций отдельными командами, все упали. backend **1281/1281**, frontend **326/326**, инвентарь 154/1278.
- **Коммит:** `c7fca143`. Реестр 270–272.
- **Осталось:** ещё 13 маршрутов без упоминания в тестах (админские списки, `/schedule/:id/retry|cancel`); сбой вставки проекта внутри онбординга отдельным тестом не проверен.

### 2026-11-20 — Отмена и повтор публикации; шов к Pinterest API

- **Найдено:** `/schedule/:id/cancel` и `/schedule/:id/retry` не вызывались ни одним тестом. Мутации показали, что два шлагбаума повтора («только `failed`», «строка принадлежит вызывающему») удаляются без падения тестов: адрес Pinterest API — константа, а заглушка `pin_schedules` отвечала одной строкой на любой запрос.
- **Сделано:** 6 тестов отмены (условное обновление по владельцу **и** статусу `scheduled`, скрытые `claim_token`/`last_error`, 404/409 с разными сообщениями и без второго обновления, идемпотентность с освобождением снимка) + шлагбаумы повтора; `PINTEREST_API_BASE_URL` через общий `serviceBaseUrl.js` (только dev/test, http(s), без учётных данных, срез слэша — попутно закрыт приём `ftp://`); страж env читает имя переменной из литерала шва.
- **Уроки:** узкий `--test-name-pattern` пропускал мутации, которые ловит соседний тест → прогон по всему файлу; слишком короткий якорь мутации попал в `/schedule/:id/change-board` → привязка к уникальному сообщению; заглушка, игнорирующая фильтр, скрывает отсутствие фильтра.
- **Проверки:** 9 мутаций отдельными командами, все упали. backend **1294/1294**, инвентарь 155/1291.
- **Коммит:** `cf0817aa`. Реестр 273–276.
- **Осталось:** успешный проход повтора и отображение причин RPC (`account_unavailable`, `publication_attempt_exists`, `attempt_identity_mismatch`, `active_schedule_exists`, …) — нужен аккаунт с пригодным токеном; `/schedule/:id/change-board` — тот же риск и без тестов.

### 2026-11-20 — Смена доски упавшей публикации (против заглушки Pinterest)

- **Найдено:** `/schedule/:id/change-board` не имел тестов, хотя это путь восстановления после недоступной доски и он пере-ставит публикацию в очередь.
- **Сделано:** 5 тестов против заглушки Pinterest (аккаунт с legacy-plaintext токеном): проверка доски ровно один раз и повторная постановка через RPC; 422 на чужую доску без RPC; 409 для опубликованного без проверки доски; 422 на пустой/пробельный/длинный id; все причины отказа RPC своим статусом и сообщением.
- **Стоило двух часов:** общая 503 из-за fail-closed конфигурации OAuth Pinterest — дочерний процесс теперь несёт client id/secret/redirect/ключ токена.
- **Проверки:** 6 мутаций; 5 падают, шестая (удаление явного `resolveAccount`) поведенчески эквивалентна — записана как эквивалентная. backend **1299/1299**, инвентарь 155/1296.
- **Коммит:** `4fea152d`. Реестр 277–279.
- **Осталось:** успешный проход `/schedule/:id/retry` и причины его RPC (инфраструктура готова); админские списки `GET /admin/*` без тестов.

### 2026-11-20 — Повтор упавшей публикации (здесь рождается дубликат)

- **Найдено:** `/schedule/:id/retry` возвращает упавшее расписание в очередь — успех на отказе базы означал бы вторую публикацию; ранее были проверены только шлагбаумы без шага Pinterest.
- **Сделано:** 4 теста против заглушки Pinterest: проверка доски один раз, RPC с id расписания/пользователя, ответ без `claim_token`; `422` до RPC при исчезнувшей доске; все 8 причин отказа + неизвестная — своим статусом и сообщением; `500` при сбое перечитывания.
- **Проверки:** 5 мутаций, все упали. backend **1303/1303**, инвентарь 155/1300.
- **Коммит:** `9f3ab7ad`. Реестр 280–282.
- **Осталось:** админские списки `GET /admin/*` (8 маршрутов) без тестов; `POST /account/deletion-request` без теста маршрута.

### 2026-11-20 — Админские списки и проецирующая заглушка

- **Найдено:** восемь админских списков и сброс блокировки не имели исполняемых тестов; кроме того, тестовый двойник PostgREST возвращал все поля вместо выбранных, из-за чего маршрут с `select("*")` выглядел бы безопасным.
- **Сделано:** 5 тестов (403 обычному клиенту без запросов за шлагбаумом, ограничение лимита подписок, только документированные колонки журнала исключений, объединение и ограничение окна заказов, 422 на кривой адрес при сбросе блокировки). `fake-postgrest` проецирует запрошенный список колонок как настоящий PostgREST.
- **Проверки:** 6 мутаций; пять падают, шестая поведенчески остаётся ограниченной — заменена мутацией на снятие ограничения в `billing.js`. backend **1308/1308**, инвентарь 155/1305.
- **Коммит:** `56249040`. Реестр 283–285.
- **Осталось:** `POST /account/deletion-request` без теста маршрута; содержимое ответов трёх админских списков проверено их модульными тестами, не маршрутными.

### 2026-11-20 — Запрос на удаление аккаунта (маршрут)

- **Найдено:** `POST /account/deletion-request` не имел тестов: §78 проверял работника, но не дверь.
- **Сделано:** 5 тестов: `503` при выключенном работнике (дефолт деплоя) без чтения аккаунта и без заморозки; `422` без пароля без чтения хэша; `403` на неверный пароль (намеренно не `401`); RPC с собственной `token_version` и ответ без учётных данных; `503` на сбой чтения вместо «неверный пароль». В обвязке — `startBackendWithDeletionWorker` с настоящим хэшем bcrypt.
- **Моя ошибка:** считал любое чтение `users` «запросом удаления» — теперь только выборку `id,password_hash,token_version`.
- **Проверки:** 6 мутаций, все упали. backend **1313/1313**, инвентарь 155/1310.
- **Коммит:** `e73087c8`. Реестр 286–288.
- **Осталось:** сквозная проверка «сессия перестала работать сразу после заявки» требует живой базы (UA-070).

### 2026-11-20 — Профиль и две последние админские кнопки

- **Найдено:** `PATCH /me` и две административные операции (сверка «неизвестной» публикации, повтор неудавшихся удалений) не имели маршрутных тестов — скан «не упомянутых маршрутов» сократился с 14 до 2, и это были они.
- **Сделано:** 5 тестов. Профиль: только `name`/`surname`/`preferred_language` доходят до базы (`is_admin`, `tariff_plan`, `credits_balance`, `token_version`, `email` отбрасываются), 422 на непригодные значения, длинное имя обрезается до 80. Сверка: 403 клиенту без вызова функции; `500` при отсутствии сохранённой метки для `null`/`{}`/`"not-a-date"`/числа — тело ошибки прокси не может быть прочитано как «опубликовано». Повтор удалений: 403 без запроса списка, лимит ограничен 100.
- **Моя ошибка:** утверждал 422 на длинное имя — код обрезает (`validateLen`), тест исправлен под реальный контракт.
- **Проверки:** 7 мутаций; шесть падают, седьмая патчила `optionalString` вместо `validateLen` — после привязки ко второму вхождению падает. backend **1319/1319**, инвентарь 155/1316.
- **Коммит:** `028498f6`. Реестр 289–291.
- **Осталось:** все 79 маршрутов упомянуты в тестах, но «упомянут» ≠ «исполнен»: `POST /admin/storage/reconcile-stale-uploads` и `GET /admin/storage/retention-candidates` проверены только модулями. Непроверяемо в этой среде: миграции 164/165 (UA-070), staging (UA-066), POSIX shutdown (UA-072), внешний мониторинг.

### 2026-11-20 — Маршруты обслуживания Storage

- **Найдено:** `GET /admin/storage/retention-candidates` и `POST /admin/storage/reconcile-stale-uploads` не имели исполняемых тестов.
- **Сделано:** 3 теста: 403 клиенту без обращения к базе и Storage; ограничение окна удержания (`days`, `limit`), флаг `read_only`, отсутствие изменяющих запросов; сверка зависших загрузок сообщает о каждой строке и не решает ни одной — видимый объект считается **и** остаётся в `unresolved`, отсутствующий не считается завершённым.
- **Моя ошибка:** первая версия утверждала одну нерешённую строку; контракт — видимый объект попадает и в счётчик, и в `unresolved`.
- **Проверки:** 7 мутаций; шесть падают, седьмая (убран отчёт об отсутствующем объекте) прошла из-за слепого пятна сценария — добавлена третья строка, после чего падает и она. backend **1322/1322**, инвентарь 155/1319.
- **Коммит:** `595c007f`. Реестр 292–294.

### 2026-11-20 — Подтверждение email добито до 100 % строк

- **Найдено:** полный отчёт покрытия оставил один модуль ниже 92 % — `email-verify.js` (90.52 %); непокрыты были ответы на сбои, а не «паддинг».
- **Сделано:** 5 тестов: неудачный выпуск токена — `false` без письма (ссылка с несохранённым хэшем не сработает никогда); без транзакционной почты токен не выпускается; `alreadyVerified` для подтверждённого аккаунта; «письмо отправлено» только при реальной отправке и честное «не удалось» при отказе транзакции; `503` при сбое чтения в обоих режимах. В двойнике почты — переключатель `mailConfigured`.
- **Проверки:** 6 мутаций; пять падают, шестая (избыточный `return false`) поведенчески ничего не меняла — не засчитана, переписана в `return true` и падает. `email-verify.js` **100 %** строк / 95.92 % ветвей. backend **1327/1327**, инвентарь 155/1324.
- **Честное ограничение:** `secondsUntilResend` не проверяет ошибку чтения последнего токена, то есть JS-троттлинг открыт при сбое чтения. Не дефект безопасности: настоящий шлагбаум — строка под `for update` в `issue_email_verification_token` (миграция 022) с `p_min_interval_seconds`; JS-слой — только подсказка интерфейсу.
- **Коммит:** `a30b590e`. Реестр 295–297.
- **Осталось:** `index.js` измеряется только через дочерний процесс (8.66 %), реальное покрытие метрике невидимо; дальше расти нужно сквозными сценариями на живой инфраструктуре (UA-066, UA-070, UA-072).

### 2026-11-20 — Сводка сессии разделов 85–97

- **Коммиты:** `7000b011`…`8102f147` (последний — сводка `8102f147`, она же была опубликована владельцем), 31 из них был впереди `origin/main`, пока владелец не выполнил `git push`.
- **Найдено стражем:** сводный коммит `8102f147` не мог сослаться на себя и остался в хронологии с адресом «—»; `update-chronology --check` и `documentation-integrity` (5/6) поймали это. Исправлено адресом в реестре (строка 298) и этим упоминанием; история не переписывалась. Отдельная моя ошибка: проверка шла в конвейере через `&&`, поэтому её падение не остановило коммит документации — проверку нужно запускать отдельной командой и читать вывод.
- **Исполняемых тестов:** backend **1327/1327** (было 1248 на `781edc5f`), frontend **326/326**, `tsc --noEmit` — 0 ошибок, `documentation-integrity` 6/6, хронология 192 коммита с записанной причиной у каждого.
- **Найдено дефектов в этой части:** ни одного нового в поведении продукта (после §84); найдены и исправлены изъяны **тестовых двойников** (§93 — проекция колонок) и **тестов** (§95, §96, §97 — три мутации прошли из-за слепых пятен сценариев, а не из-за верного кода).
- **Содержательно закреплено:** путь возобновления регенерации, жизненный цикл воркера удаления, загрузка изображения пина, ветки `ensureBucket`, язык проекта в онбординге и запрет loopback-адресов, отмена/повтор расписания, смена доски, успешный повтор, восемь админских списков, запрос на удаление аккаунта, профиль, сверка публикации, два маршрута обслуживания Storage, подтверждение email.
- **Покрытие:** все backend-модули ≥ 96 % строк, кроме `index.js` (8.66 %, измеряется только через дочерний процесс) и `email-verify.js`/`billing.js`, доведённых до 100/97.79.
- **Не изменилось и остаётся за владельцем:** UA-066 (staging end-to-end), UA-067 (push 30 коммитов), UA-070 (миграции 164/165), UA-072 (POSIX shutdown), внешний алертинг, продуктовые пробелы (метрики Pinterest не собираются, стор лимитера в памяти процесса, нет письма «кто-то пытался войти»).

### 2026-11-20 — Проверка хронологии, которая всегда падала

- **Найдено:** `update-chronology --check` не мог пройти ни на одном чистом дереве: коммит не может перечислить сам себя, поэтому таблица всегда отставала на одну строку, а проверка требовала полного совпадения. Обнаружилось на сводном коммите `8102f147` после пуша владельца.
- **Сделано:** сравнение вынесено в `scripts/lib/chronology-appendix.cjs`; допустим ровно один пропуск — строка HEAD и только когда у HEAD есть записанное обоснование. Терпимость печатается при успехе, а не скрывается.
- **Проверки:** 9 тестов (включая сквозной прогон в одноразовом git-репозитории: init → два коммита записи → регенерация → проверка → устаревший коммит отвергнут) и 6 мутаций, все падают. Две мутации сначала прошли: несовпавший литерал вертикальной черты и маскирующее сообщение об отказе — исправлены. backend **1336/1336**, инвентарь 156/1333.
- **Коммит:** `d5b9d347`. Реестр 299–301.
- **Моя ошибка:** запускал проверку в конвейере через `&&`, из-за чего её падение не остановило предыдущий коммит документации; дальше — отдельной командой и с чтением вывода.

### 2026-11-20 — Шифрование почты угадывалось по номеру порта

- **Найденный дефект:** и транзакционный SMTP, и канал ответов поддержки выводили шифрование из порта (`secure: 465`, `requireTLS: 587`). На любом другом порту (25, 2525, 2465, порт провайдера) клиент считал TLS необязательным, а у nodemailer 10 нет запрета аутентифицироваться по незашифрованному соединению — значит, при вырезанном объявлении STARTTLS пароль SMTP, ссылка подтверждения и тело письма уходили открытым текстом (атака понижения STARTTLS). Теперь 465 — неявный TLS, любой другой порт обязан согласовать STARTTLS.
- **Второй дефект:** порт не проверялся — `Number("0") || 465` отправлял почту на ненастроенный порт, `Number("abc")` давал `Number.NaN` и непонятную ошибку позже. Общий помощник `mailPort` для трёх портов: целое 1..65535 или честный `503`, пустое значение — документированное умолчание.
- **Сторож поймал меня:** первая редакция читала `process.env[name]`, и страж документации окружения упал, потому что три переменные перестали быть видны сканеру буквальных чтений. Исправлено передачей значения, а не имени.
- **Проверки:** 4 теста, 7 мутаций — все падают; мутация «`"0"` как отсутствующее значение» поведенчески ничего не меняла и не засчитана. backend **1340/1340**, инвентарь 156/1337.
- **Коммит:** `9531157b`. Реестр 302–304.
- **Осталось:** поддержку STARTTLS у конкретного провайдера можно проверить только на staging (UA-066); IMAP по-прежнему всегда `secure: true`, порт 143 падает громко, отдельного STARTTLS-режима у IMAP нет.

### 2026-11-20 — SQL-гейт пройден с миграциями 164 и 165 (прогон владельца)

- **Что сделано владельцем:** восьмой прогон `scripts/verify-sql-windows.ps1` на одноразовой БД `pinposy_verify_f38a7688`.
- **Фактический вывод:** `Active migrations: 156 (010..165)`; `Static SQL check OK (227 files)`; все 156 миграций применились (`Schema replay OK: baseline + 156 migrations`); **53/53 SQL integration файла**; `PASS: baseline + 157 migrations applied; 53 SQL integration files passed.`; одноразовая БД удалена.
- **Что это доказывает:** миграции **164** (durable-замок входа: колонки в `users` и три функции только для `service_role`) и **165** (переотправка мёртвого письма) применяются на живом PostgreSQL 18.6 и не ломают ни один из 53 SQL-контрактов. До этого прогона обе защиты существовали только как код и как неисполненный SQL.
- **Моя ошибка, исправленная здесь:** в UA-070 я ожидал строку `baseline + 156`, но счётчик скрипта включает baseline `001` и печатает **157**; строка `PASS: 10 isolated concurrency tests passed` появляется только при запуске с `-Concurrency`. Ожидание приведено к факту.
- **Чего прогон НЕ проверяет:** 10 сценариев гонок (`-Concurrency` не передан) и применение 164/165 к рабочей базе — это отдельные шаги.
- **Следующее за владельцем:** применить 164 и 165 к рабочей базе тем же способом, каким применялись предыдущие миграции (аддитивные, откат не нужен), затем проверить замок пятью неверными паролями (UA-071) и кнопку «Вернуть в очередь».

### 2026-11-20 — Разбор сайта: содержимое страницы как инструкции

- **Найденный дефект:** `analyzeSite` подставлял заголовок, мета-описание, заголовки и абзацы разбираемой страницы прямо в шаблон промпта; единственной границей была фраза «игнорируй команды». Страница — чужой контент, и `niche`/`summary` затем попадают в каждую генерацию досок и пинов, то есть модель можно было направить надолго. Это та же дыра, что закрыта в §82, но на шаг в стороне.
- **Сделано:** страница — одно JSON-значение в ограниченном блоке `<site_content_json>`, каждый `<` записан эскейпом; построитель вынесен в `buildAnalysisPrompt` (проверяемо без сети).
- **Проверки:** 5 тестов (нельзя закрыть блок, побайтовый round-trip, инструкция до блока, ничего вне блока, пустые данные вместо `undefined`); 5 мутаций — все падают.
- **Моя процессная ошибка:** копия для восстановления была снята **до** правки, поэтому скрипт мутаций записал старую версию поверх исправленной и две мутации «прошли» на коде без функции. Правило: копия снимается после правки, `git diff` проверяется перед мутациями.
- **Коммит:** `4ee452fd`. Реестр 307–309.
- **Осталось:** успешная загрузка сайта в тестах по-прежнему недостижима (нужен настоящий публичный сайт, SSRF блокирует loopback); проверены промпт, отказы SSRF и ошибки ответа.

### 2026-11-20 — Четвёртый построитель промпта и системный страж

- **Найденный дефект:** после §100 остался открытым `keywordIdeas`: тема и ниша подставлялись в промпт как проза, а ниша может прийти из разбора чужого сайта. Три построителя из четырёх были закрыты вручную — четвёртый забыли, что и есть способ, которым ручное правило отказывает.
- **Сделано:** контекст ключевых фраз в ограниченном экранированном блоке; новый **системный** страж `test/ai-prompt-fencing.test.js`: список построителей выводится из исходников (с порогом и проверкой четырёх известных), требуется сериализатор **и** блок `<tag_json>…</tag_json>`, комментарии срезаются, единственное исключение (`index.js`) самопроверяется, сканер проверен на пяти синтетических формах.
- **Проверки:** 5 тестов, 6 мутаций — все падают; мутация на порог `>= 4` поведенчески ничего не меняла и не засчитана. backend **1350/1350**, инвентарь 158/1347.
- **Коммит:** `895767da`. Реестр 310–312.
- **Граница гарантии:** страж проверяет структуру промпта, а не смысл шаблона; ослабляющая инструкция вне блока им не ловится. Успешный разбор сайта по-прежнему требует настоящего публичного сайта.

### 2026-11-20 — Загрузка картинки пина и единственный владелец адреса

- **Найденный дефект (фронтенд):** стол согласования загружал свою картинку встроенным `fetch` с **собственной копией** адреса бэкенда, без дедлайна, без выхода из сессии на `401` и с одной общей фразой на любой `4xx`. Смена адреса (свой домен, staging, другой регион) оставляла эту загрузку на старом хосте — клиент видел «не удалось заменить картинку».
- **Сделано:** `uploadPinImage` в `lib/api.ts` (базовый адрес, таймаут 60 с, токен через безопасный помощник, `401` очищает сессию и просит вход, код и текст сервера сохраняются, `2xx` без `image_url` отвергается). Мультипарт — поэтому нельзя переиспользовать `apiRequest` (он ставит JSON content-type и ломает boundary), форма проверяется тестом.
- **Системный страж:** `lib/backendUrlCentralization.test.ts` — ровно одно вхождение адреса в `lib/api.ts`, ни одного вне, компонентам запрещено звать API-пути своим `fetch`; правила самопроверяются на синтетических образцах.
- **Проверки:** 10 + 4 теста; 7 мутаций, все падают. Три первых попытки не засчитаны и записаны: тавтологичное сравнение с `API_URL`, неверный якорь таймера (попал в `sendOnce`), копия адреса в тестовом файле невидима сканеру. frontend **340/340**, `tsc` чисто.
- **Коммит:** `86e3d90b`. Реестр 313–315.
- **Осталось:** совместная проверка «клиент ↔ Storage» возможна только на staging (UA-066).
- **Повторный прогон SQL-гейта владельцем (2026-11-20, второй):** `PASS: baseline + 157 migrations applied; 53 SQL integration files passed.`, одноразовая БД `pinposy_verify_1fdde44b` удалена — результат воспроизводим.

### 2026-11-20 — Воркер публикаций умирал после первого опроса

- **Найденный дефект:** `scheduleWorker.js` запускается отдельным процессом (`npm run worker`) и делает `timer.unref()` для таймера следующего опроса. Для встроенного использования это верно, для автономного — фатально: один опрос, пустой цикл событий, **чистый выход с кодом 0**. Супервизор видит «здоровье», публикации клиента молча прекращаются. Воспроизведено настоящим дочерним процессом: 1 запрос, затем `exit 0`.
- **Сделано:** `createWorker({ keepProcessAlive })` (по умолчанию `false`), автономная точка входа передаёт `true`; путь развёртывания впервые покрыт реальным дочерним процессом (два опроса за 12 с, секрет в каждом запросе, соблюдение интервала, отсутствие раннего выхода) + 3 юнит-теста режимов таймеров и паузы после сбоя.
- **Побочная находка:** после §102 сканер маршрутов фронтенда перестал видеть `/pins/:id/image`, а устаревшее исключение `/pins` уронило страж. Сканер теперь читает URL, построенные от `lib/api.ts`; исключение удалено; проверено позитивным пробным файлом.
- **Проверки:** 4 мутации воркера — все падают; 1 мутация сканера падает; «отключение сравнения маршрутов» поведенчески ничего не меняло и не засчитано. backend **1354/1354**, инвентарь 159/1351.
- **Коммит:** `5a1b2f34`. Реестр 316–318.
- **Осталось:** `SIGTERM`-завершение воркера проверено только чтением (Windows, UA-072); полный цикл «расписание → публикация» требует живого Pinterest (UA-066).

### 2026-11-20 — Воркер удаления аккаунтов умирал после первой пачки

- **Найденный дефект:** `accountDeletionWorker.js` делал `timer.unref()`, поэтому автономный процесс обрабатывал одну пачку и выходил с кодом 0 — очередь удалений росла, а супервизор видел «здоровье». §86 чинил в этом файле только путь сигнала (exit 75), из-за чего нормальный путь выглядел покрытым. Воспроизведено дочерним процессом: `exited code=0 after 3ms, claims=1`; после исправления — 3 пачки за 11 с.
- **Сделано:** `keepProcessAlive` (по умолчанию `false`), `runStandaloneWorker` передаёт `true`.
- **Проверки:** 3 мутации, все падают.
- **Мои ошибки (они же суть дефекта):** (1) первая фикстура держала процесс **своим** референсным таймером, поэтому мутация выжила — сторож стал нереференсным, теперь он срабатывает только если воркер ещё опрашивает; (2) фикстуру приходилось убивать родителю, а Windows не доставляет `SIGTERM` — дочерний процесс пережил тест и держал весь прогон набора, теперь фикстура останавливает себя сама.
- **Коммит:** `844a7ae3`. Реестр 319–321. backend **1357/1357**, инвентарь 159/1353.
- **Осталось:** третий автономный процесс `scheduleCron.js` в этой сессии не проверялся; `SIGTERM`-путь проверяется только чтением (UA-072).

### 2026-11-20 — Список досок Pinterest: «нет досок» вместо ошибки

- **Найденные дефекты:** (1) страница Pinterest без массива `items` подставлялась как пустой массив → клиент видел `{ boards: [] }`, то есть «досок нет», вместо ошибки; (2) элемент без `id` доходил до `String(b.id)`, `null` в массиве давал `TypeError` → 500 на 200 от провайдера; (3) `httpError(502, …)` без машинного кода → клиент получал «внутренняя ошибка» и не мог локализовать, хотя код `pinterest_unavailable` уже есть на 7 языках.
- **Сделано:** 502 «страница без списка» / «доска без идентификатора» с номером страницы; настоящий пустой аккаунт остаётся валидным пустым списком; числовой `id` пригоден; маршрут использует `pinterestTransientError("pinterest_unavailable", …, 502)`.
- **Проверки:** 6 мутаций, все падают. backend **1363/1363**, инвентарь 159/1359.
- **Коммит:** `36839e40`. Реестр 322–324.
- **Осталось:** другие маршруты Pinterest, бросающие `httpError` без кода (например отказы хранилища), не проверены — полный список не составлен; пустой аккаунт на живом Pinterest не проверялся (UA-066).

### 2026-11-20 — Анализ сайта: «сайт закрыт от бота» приходило как «внутренняя ошибка сервера»

- **Найденный дефект:** `analyzeSite` бросал 502 с фразой, написанной для клиента («Сайт ответил ошибкой 403 — откройте вручную»), а 5xx по правилу не несёт сообщение — клиент читал «внутренняя ошибка сервера», и первый шаг онбординга становился непроходимым без объяснения. Второе сообщение (адрес не резолвится) — тот же случай.
- **Сделано:** 422 + код `website_unreachable` (7 языков), статус сайта в `websiteStatus` (неправдоподобный не выдумывается); `validationError` переехал в `validate.js` рядом с `httpError`; охранник `validationErrorLocalization.test.ts` теперь читает все `backend/*.js` с нижней границей.
- **Проверки:** 5 мутаций, все падают. backend **1368/1368**, frontend **340/340**, `tsc` чисто, инвентарь 160/1364.
- **Коммит:** `68543f14`. Реестр 325–327.
- **Осталось:** успешный путь `/analyze` непроверяем без staging (SSRF не пускает loopback); `notFoundError` намеренно остался в `index.js`; одна клиентская фраза на оба случая — интерполяции в копирайтинге нет.

### 2026-11-20 — Выключенный конвейер удаления говорил клиенту «попробуйте позже»

- **Найденный дефект:** `POST /account/deletion-request` отвечает 503 при выключенном воркере и при отсутствии миграции 127; 5xx не передаёт сообщение, поэтому клиент читал «внутренняя ошибка сервера, попробуйте позже» для выключенной функции и повторял заведомо невыполнимый запрос.
- **Сделано:** код `account_deletion_unavailable` + копия на 7 языках (данные не тронуты, напишите в поддержку); настоящий сбой сервера намеренно остаётся без кода; код привязан только к 502/503.
- **Проверки:** 6 мутаций, все падают. backend **1370/1370**, frontend **343/343**, `tsc` чисто, инвентарь 160/1366.
- **Моя ошибка:** код попал в таблицу 422 вместо 503 (якорь вставки); охранник поймал, это стало одной из мутаций.
- **Коммит:** `04495a08`. Реестр 328–330.
- **Осталось:** процедуры ручного удаления через поддержку в документации нет; сплошная проверка клиентских 5xx с текстом не сделана.

### 2026-11-20 — Два отказа публикации без кода

- **Найденный дефект:** `publishPin` отказывает при пустом `board_id` и при пине без изображения (оба 422) без машинного кода, хотя те же условия в маршрутах расписания уже закодированы и переведены на 7 языков — один отказ звучал локализованно, другой по-русски.
- **Сделано:** общий `validationError` с кодами `board_selection_required` и `pin_image_missing`; `retryable = false` сохранён (планировщик опирается на него, чтобы не зациклиться).
- **Проверки:** 4 мутации, все падают. backend **1370/1370**, инвентарь 160/1366.
- **Коммит:** `7f23961b`. Реестр 332–334.
- **Осталось:** 409 «только одобренные пины» намеренно без кода (нет перевода); сплошного списка клиентских 5xx нет — правило держится на чтении.

### 2026-11-20 — «Не публикуйте повторно» не доходило до клиента

- **Найденный дефект:** шесть отказов на пути публикации означают «пин мог уже уйти в Pinterest, повтор создаст дубликат, нужна сверка» — и все шесть были 5xx без кода (один — 409 по-русски). Клиент читал «внутренняя ошибка, попробуйте позже»: вредный совет в самой опасной точке продукта.
- **Сделано:** `publicationReconciliationError` + код `publication_reconciliation_required`, копия на 7 языках (не публикуйте повторно, мы сверяем); межпакетный охранник `publicationReconciliationCopy.test.ts` читает `backend/pinterest.js` и отказывает новому блокирующему отказу без кода.
- **Проверки:** 8 мутаций, засчитано 6 (одна поведения не меняла — не засчитана). backend **1370/1370**, frontend **346/346**, `tsc` чисто.
- **Мои ошибки:** потерянный аргумент статуса и лишняя скобка (`node --check` поймал); шаблон сканера останавливался на `;` внутри русского текста и не видел один из шести отказов.
- **Коммит:** `a12785ed`. Реестр 335–338.
- **Осталось:** 409 «задание больше не принадлежит обработчику» и 503 «обновление уже выполняется» своих кодов не получили; сплошного списка клиентских 5xx нет; живая публикация не проверена (UA-066).

### 2026-11-20 — Опись всех 5xx в модуле Pinterest

- **Зачем:** три из пяти последних дефектов — 5xx с текстом для клиента, который не доходил; поиск был только чтением, а чтение их и пропустило.
- **Сделано:** `test/pinterest-server-error-codes.test.js` — каждый 5xx в `pinterest.js` кодирован или в карте исключений с причиной; исчезнувшее исключение валит тест; сканер самопроверяется, есть нижняя граница. Опись нашла два реальных отказа: отклонение пина провайдером и параллельное обновление доступа. Новые коды `pinterest_publication_rejected`, `pinterest_refresh_in_progress`, `pinterest_reconnect_required` + `pinterest_unavailable` для сетевого отказа; копия на 7 языках.
- **Проверки:** 5 засчитанных мутаций, все падают (две поведения не меняли — не засчитаны). backend **1373/1373**, frontend **346/346**, `tsc` чисто, инвентарь 161/1369.
- **Мои ошибки:** шаблон клиентского сканера требовал код в той же строке (два многострочных вызова стали невидимы); в скрипте мутаций трижды не сходился кортеж.
- **Коммит:** `ebb3ff2c`. Реестр 339–342.
- **Осталось:** опись покрывает только `pinterest.js`; такие же 5xx есть в `index.js`, `billing.js`, `creditsBilling.js` — сплошной описи нет (следующий шаг). Тексты на 7 языках написаны мной, носитель не проверял.

### 2026-11-20 — Кнопка повтора отвечала на «не публикуйте повторно» рабочим повтором

- **Найденный дефект:** доступность повтора публикации считалась только по HTTP-статусу, а смысл ответа с §109 живёт в машинном коде: будущий 4xx с кодом `publication_reconciliation_required`/`pin_already_scheduled` дал бы приглашение нажать запрещённое.
- **Сделано:** `isAmbiguousPinterestPublishStatus(status, code)` — код «исход неизвестен/уже выполнен» сильнее статуса; коды «исправьте и повторите» оставляют действие; неизвестный код ничего не меняет. Вызов в `PublishPinButton` обновлён.
- **Проверки:** 3 мутации, все падают. frontend **348/348**, `tsc` чисто.
- **Коммит:** `fe8ee710`. Реестр 343–345.
- **Осталось:** проверен чистый помощник, не компонент (нет jsdom — registry недоступен); похожие «слепые к коду» проверки в календаре не искал.

### 2026-11-20 — Оплата в ненастроенном развёртывании и несозданный счёт

- **Найденные дефекты:** (1) «платежи не настроены» (503) и (2) «не удалось создать счёт/покупку» (500) были «голыми» 5xx: клиент читал «внутренняя ошибка» и повторял платёж, который не мог начаться, или не знал, что деньги не списаны. Оба дефекта существовали на **двух** путях — подписки и пакеты кредитов.
- **Сделано:** коды `payments_not_configured` и `payment_not_started` (7 языков), 500 для несозданного счёта сохранён намеренно; новая опись `test/payment-server-error-codes.test.js` (все «голые» 5xx в платёжных модулях кодированы или исключены с причиной). Копию дефектов в `creditsBilling.js` нашла именно опись.
- **Проверки:** 5 мутаций, все падают. backend **1375/1375**, frontend **348/348**, `tsc` чисто, инвентарь 162/1371.
- **Мои ошибки:** `payment_not_started` попал в две карты сразу; клиентский сканер ловил только `payment_` и не видел `payments_not_configured`.
- **Коммит:** `313e6b35`. Реестр 346–349.
- **Осталось:** опись покрывает 4 платёжных модуля, но не `index.js`/`storage.js`/`pinImageLifecycle.js`/`admin*`; живая оплата не проверена (UA-066).

### 2026-11-20 — «Изображение уже сохранено» не доходило до клиента

- **Найденный дефект:** два отказа хранилища (503) говорили «картинка уже сохранена, не загружайте снова», но 5xx сообщение не передаёт: клиент повторял загрузку — ровно то, что фраза запрещает.
- **Сделано:** код `image_already_stored` (7 языков); общий сканер описей `test/helpers/bare-5xx-inventory.js`; новая опись `storage-server-error-codes.test.js` на 6 остальных 5xx с причинами; платёжная опись переведена на общий сканер.
- **Проверки:** 5 мутаций, все падают. backend **1379/1379**, frontend **350/350**, `tsc` чисто, инвентарь 163/1374.
- **Моя ошибка (третий раз того же рода):** якорь вставки был строкой, переехавшей в другую таблицу, из-за чего код получил лишний статус 500; тест поймал. Правило: якорь включает имя таблицы.
- **Коммит:** `8ff8bf4c`. Реестр 350–353.
- **Осталось:** описи покрывают 30 из 104 «голых» 5xx (`index.js` 23, `textOutputValidation.js` 16, `prodamus.js` 9, `keywordIdeas.js` 7, `loginLockout.js` 5, `mail.js` 5, `auth.js` 4, `email-verify.js` 3, административные модули); живая загрузка в хранилище не проверена.

### 2026-11-20 — Последний модуль чекаута скрывал оба факта про деньги

- **Найденный дефект:** `prodamus.js` бросал 6 «голых» 5xx на отсутствующую конфигурацию и 4 — на непригодную ссылку провайдера; на экране оплаты клиент читал «внутренняя ошибка» и не знал, двигались ли деньги. Опись §112 этот модуль не читала.
- **Сделано:** конфигурация → 503 `payments_not_configured`; счёт не создан → 502 `payment_not_started`; код переводится на 500/502/503; `prodamus.js` добавлен в опись. Четыре существующих теста переведены с проверки статуса 500 на проверку кода.
- **Проверки:** 5 засчитанных мутаций, все падают (две мутации нижних границ поведения не меняли — не засчитаны). backend **1380/1380**, frontend **350/350**, `tsc` чисто, инвентарь 163/1375.
- **Коммит:** `61728deb`. Реестр 354–357.
- **Осталось:** описи покрывают ~40 из 104 «голых» 5xx; не покрыты `index.js` (23), `textOutputValidation.js` (16), `keywordIdeas.js` (7), `loginLockout.js` (5), `mail.js` (5), `auth.js` (4), `email-verify.js` (3), административные (4). Живая оплата не проверена (UA-066).

### 2026-11-20 — Бесплатный отказ генерации не отличался от платного

- **Найденный дефект:** при сбое до первого платного запроса к провайдеру изображений БД освобождает резервацию кредитов (триггер, миграция 088), но клиент читал «внутренняя ошибка сервера, попробуйте позже» и не мог отличить бесплатный отказ от платного.
- **Сделано:** `generationFailure.js` навешивает код `generation_not_charged` по существующему флагу `providerGenerationStarted`; после вызова провайдера маркер молчит, конкретный код (402) не перезаписывает; копия на 7 языках, перевод на 402/422/500/502/503 и никогда на 2xx; текст не обещает возврата.
- **Проверки:** 5 мутаций, все падают. backend **1385/1385**, frontend **353/353**, `tsc` чисто, инвентарь 164/1380.
- **Коммит:** `19931326`. Реестр 358–360.
- **Осталось:** HTTP-ответ целиком не проверен (нужен сетевой провайдер); описи «голых» 5xx не покрывают `index.js` (23), `textOutputValidation.js` (16), `keywordIdeas.js` (7), `loginLockout.js` (5), `mail.js` (5), `auth.js` (4), `email-verify.js` (3), административные (4).

### 2026-11-20 — Фехтованная генерация молчала вместо правды о деньгах

- **Найденный дефект:** при сбое *после* вызова провайдера запрос фехтуется как `unknown`, резервация кредитов сохраняется до сверки (миграция 088), но клиент читал «внутренняя ошибка сервера, попробуйте позже» и свободно повторял запуск — риск двойного списания. §115 в этом случае молчал, что на экране про деньги не ответ.
- **Сделано:** `markGenerationFailure` ставит существующий код `generation_outcome_unknown` вместо молчания; клиент переводит его на 409/500/502/503; текст не обещает ни возврата, ни списания, а отправляет в очередь проверки.
- **Проверки:** 4 мутации, все падают. backend **1385/1385**, frontend **354/354**, `tsc` чисто, инвентарь 164/1380.
- **Мои ошибки:** охранник дрейфа кодов знал только 409; регулярное выражение испорчено трижды при записи через Python-heredoc (обратные слеши), исправлено прямым `edit`.
- **Коммит:** `3f790682`. Реестр 361–363.
- **Осталось:** HTTP-ответ целиком не проверен (нужен сетевой провайдер); описи «голых» 5xx не покрывают `index.js` (23), `textOutputValidation.js` (16), `keywordIdeas.js` (7), `loginLockout.js` (5), `mail.js` (5), `auth.js` (4), `email-verify.js` (3), административные (4).

### 2026-11-20 — «Ничего не списано» называло причину, которой не всегда есть

- **Найденный дефект:** код `generation_not_charged` покрывает два случая — непригодный вывод модели до запроса изображений и все задачи изображений `failed` (там `index.js` сбрасывает флаг провайдера, потому что исход известен). Копия §115 утверждала первую причину, что во втором, более частом случае — ложь про деньги клиента.
- **Сделано:** семь переводов называют только факт (ничего не списано, кредиты вернулись на баланс); тест запрещает называть причину и требует факт про деньги в каждом языке.
- **Проверки:** 4 мутации, все падают. backend **1385/1385**, frontend **355/355**, `tsc` чисто.
- **Моя ошибка:** первая версия теста проверяла факт про деньги только по-английски — мутация китайской копии выжила; добавлено обязательное слово про баланс для каждого языка.
- **Коммит:** `e1d54b6f`. Реестр 364–366.
- **Осталось:** описи «голых» 5xx не покрывают `index.js` (23), `textOutputValidation.js` (16), `keywordIdeas.js` (7), `loginLockout.js` (5), `mail.js` (5), `auth.js` (4), `email-verify.js` (3), административные (4).

### 2026-11-20 — «Пины не сохранены» приходило как общая 500 и приглашало заплатить второй раз

- **Найденный дефект:** при неудачной записи сгенерированных пинов (`index.js:2177`) клиент получал «внутренняя ошибка сервера», а §116 добавлял фехтованный текст «проверьте очередь проверки через минуту» — куда ничего не попадёт, потому что упало сохранение. Запрос фехтован как `unknown`, резервация сохранена, поэтому повтор генерирует и **списывает второй раз**.
- **Сделано:** `generationSaveFailedError()` — 500 с кодом `generation_save_failed`; копия на 7 языках: изображения есть, сохранить не удалось, кредиты зарезервированы, новый запуск спишет снова — сначала поддержка. Тест запрещает в этой копии «очередь проверки» и «ничего не списано».
- **Проверки:** 4 мутации, все падают. backend **1386/1386**, frontend **356/356**, `tsc` чисто, инвентарь 164/1381.
- **Процессная ошибка:** полный прогон был убит вместе с командой-родителем и оставил 26 ложных «not ok»; повтор в `nohup` — 1386/1386.
- **Коммит:** `1f11d2bf`. Реестр 367–369.
- **Осталось:** описи «голых» 5xx не покрывают `index.js` (22), `textOutputValidation.js` (16), `keywordIdeas.js` (7), `loginLockout.js` (5), `mail.js` (5), `auth.js` (4), `email-verify.js` (3), административные (4).

### 2026-11-20 — Непригодный ответ нейросети приходил на три платных маршрута как голая 502

- **Найденный дефект:** `textOutputValidation.js` (16) и `keywordIdeas.js` (7) отвечали на непригодный вывод модели голой 502; статус не несёт сообщение, поэтому клиент `/analyze`, `/boards`, `/pins` и `/keyword-ideas` читал «внутренняя ошибка» и не знал, что попытка ничего не стоила. §115 покрыл только `/pins`.
- **Сделано:** `invalidAiOutput` + код `ai_output_invalid` во всех 23 отказах; копия на 7 языках («ничего не списано — попробуйте снова»), перевод на 502/503.
- **Проверки:** 5 мутаций, все падают. Охранник — инвентарь с полом на модуль и самопроверкой сканера. backend **1389/1389**, frontend **357/357**, `tsc` чисто, инвентарь 165/1384.
- **Мои ошибки в тесте:** ждал один прямой `httpError(5xx)` там, где помощник присваивает результат; синтетический образец заканчивался `); }`, а сканер привязан к `;\n`.
- **Коммит:** `5e797d08`. Реестр 370–372.
- **Осталось:** описи «голых» 5xx не покрывают `index.js` (22), `loginLockout.js` (5), `mail.js` (5), `auth.js` (4), `email-verify.js` (3), административные (4).

### 2026-11-20 — «Миграция 164 не применена» и «база не ответила» были одним сообщением

- **Найденный дефект:** административные маршруты замка входа отвечали 503 с текстом «примените миграцию 164», но 5xx не несёт текст — оператор читал «внутренняя ошибка» и на ошибку развёртывания, и на временный сбой базы.
- **Сделано:** два кода — `login_lockout_migration_missing` (миграции нет, блокировка не работает) и `login_lockout_unavailable` (служба не ответила); 7 языков; тест запрещает советовать повтор вместо миграции. Клиентский путь входа намеренно без кода — экран уже предлагает единственное действие.
- **Проверки:** 5 мутаций, все падают. Инвентарь по четырём модулям входа: 10 сайтов, у каждого письменная причина, пол на 10, сканер самопроверен. backend **1393/1393**, frontend **358/358**, `tsc` чисто, инвентарь 166/1388.
- **Коммит:** `9e457829`. Реестр 373–375.
- **Осталось:** `index.js` — 22 «голых» 5xx (почти все «сервис временно недоступен»), административные модули — 4 сайта.

### 2026-11-20 — Изображение с непригодной ценой приглашало повтор с новым списанием

- **Найденный дефект:** при непригодной авторитетной цене провайдера маршрут перегенерации бросал голую 502; клиент видел «внутренняя ошибка» и повторял, хотя изображение уже создано, а резервация удержана.
- **Сделано:** `generationSaveFailedError(message)` — тот же код `generation_save_failed`, своя строка журнала. Плюс опись `index.js` (21 сайт) и административной очереди Pinterest (2): ровно одна письменная причина на сайт, устаревшее исключение — отказ, денежные факты §118/§121 запрещено снова делать голыми 5xx.
- **Проверки:** 4 мутации, все падают. backend **1396/1396**, `tsc` чисто, инвентарь 167/1391.
- **Коммит:** `72e4491b`. Реестр 376–378.
- **Осталось:** живые оплата, публикация, хранилище, `/analyze` на реальном сайте — 0 % проверки (UA-066); миграции 164/165 и проверка замка входа — за владельцем (UA-070, UA-071); гонки против новой пары миграций — UA-073.

### 2026-11-20 — Документация отправляла владельца к чужому действию

- **Найденный дефект:** §121 сослался на UA-068 (очередь удаления аккаунта) вместо UA-070 (миграции 164/165); реестр ссылался на «прогон UA-065», который никогда не был написан. Неверный номер уводит владельца к другой процедуре, и текст об этом не предупреждает.
- **Сделано:** ссылка исправлена; прогон гонок получил собственное действие **UA-073** (гонки проходили на `010..163`, с миграциями 164/165 — ни разу); счётчик UA-067 приведён к реальному (54). Новый охранник: каждая ссылка `UA-0xx` в `docs/` обязана иметь заголовок в `USER_ACTIONS.md`.
- **Проверки:** 3 мутации, все падают. backend **1396/1396**, инвентарь 168/1394.
- **Моя ошибка:** собственное резюме «гонки не запускались ни разу» было сильнее фактов — исправлено по реестру (строка 46).
- **Коммит:** `44073d8c`. Реестр 379–381.
- **Осталось:** UA-067/UA-070/UA-071/UA-073 — за владельцем; живые оплата, публикация, хранилище, `/analyze` — 0 % проверки (UA-066).

### 2026-11-20 — Охранник документации и моя процессная ошибка

- **Найденный дефект:** первая версия охранника `UA-0xx` валила сборку на историческом упоминании («прогон UA-065» в разделе 122) — запись о прошлом не является указанием владельцу.
- **Сделано:** номер в «ёлочках» считается цитатой и не проверяется; самопроверка сканера покрывает оба случая.
- **Проверки:** 2 мутации, обе падают. backend **1396/1396**.
- **Моя процессная ошибка:** проверка и `git commit` снова шли одной командой — тест упал, коммит прошёл (§107.6 повторилась). Коммит `44073d8c` содержал документацию, не проходившую собственный новый тест; исправление — отдельным коммитом.
- **Реестр:** строки 382–383.

### 2026-11-20 — `docs:`-коммит, тронувший backend-тест

- **Найденный дефект (мой):** `8623e91d` с заголовком `docs:` изменил и `backend/test/user-actions-reference.test.js`. Охранник `documentation-integrity` поймал это строкой «claims to be documentation only but touched …».
- **Сделано:** коммит внесён в карту исключений `CODE_IN_DOCS_COMMITS` с письменной причиной (карта требует строку реестра — она добавлена). Правило для будущего: правку охранника и её документацию не складывать в один `docs:`-коммит.
- **Проверки:** `documentation-integrity` 6/6 после добавления строки реестра; хронология перегенерирована.
- **Реестр:** строка 384, раздел 122.9.

### 2026-11-20 — Выдуманный хеш в реестре и `&&` вместо проверки кода возврата

- **Найденные дефекты (мои):** в строку 384 записан хеш, которого нет в репозитории; проверка и `git commit` снова связаны `&&`, который видит код возврата `grep`, а не теста — коммит прошёл при двух упавших проверках (третий раз за день).
- **Сделано:** хеш заменён на реальный `8623e91d`; восстановлена нумерация разделов (пропуск 122.8 ломал ссылку в сгенерированной строке хронологии); проверка теперь печатает `EXIT=` и коммит выполняется отдельной командой только при нуле.
- **Проверки:** `documentation-integrity` 6/6, `user-actions-reference` 3/3, `EXIT=0` до коммита.
- **Реестр:** раздел 122.9, строка 384.

### 2026-11-20 — Пульс аренды публикации никто не сравнивал с окном восстановления

- **Найденный риск:** воркер обновляет аренду публикации каждые 60 с (`pinterest.js`), SQL считает аренду брошенной после 20 минут (миграция 128). Согласованность не проверялась; короткое окно объявило бы здорового воркера брошенным посреди публикации и дало бы дубликат пина.
- **Сделано:** охранник читает обе стороны (интервал из воркера, окно из самой новой миграции), требует три обновления на окно, оба читателя самопроверяются на синтетических образцах.
- **Проверки:** 3 мутации, все падают. backend **1401/1401**, инвентарь 169/1396.
- **Мои ошибки:** читатель брал первый множитель `10 * 60_000` (мутация выжила); первая SQL-мутация изменила не то вхождение окна; харнесс восстановил миграцию из испорченного текста (исправлено из резервной копии).
- **Коммит:** `00d12cf1`. Реестр 385–387.
- **Осталось:** `isLeaseLost()` не используется (решение принимает `assertClaimCurrent` перед POST /pins) — мёртвая поверхность; живые оплата/публикация/хранилище — 0 % проверки (UA-066).

### 2026-11-20 — Мёртвый флаг «аренда потеряна» на объекте безопасности

- **Найденный дефект:** `createScheduleClaimHeartbeat` возвращал `isLeaseLost()`, который проверяли три теста и не вызывал ни один производственный код. На объекте, охраняющем публикацию, это читается как «потеря аренды останавливает воркер» — неправда: флаг сэмплируется раз в минуту, а настоящий забор — `assertClaimCurrent` непосредственно перед POST /pins.
- **Сделано:** флаг и переменная удалены, предупреждение осталось единственным наблюдаемым; тест утверждает, что свойства быть не должно.
- **Проверки:** 2 мутации, обе падают. backend **1401/1401**.
- **Коммит:** `bd1a7584`. Реестр 388–389.
- **Осталось:** живые оплата/публикация/хранилище — 0 % проверки (UA-066); за владельцем — UA-067, UA-070, UA-071, UA-073.

### 2026-11-20 — Сводка партии писем не сходилась

- **Найденный дефект:** письмо отправлено, подтверждение отвергнуто (строку держит другой воркер) — исход не попадал ни в «отправлено», ни в «ошибка». Партия отчитывалась `{processed: 1, sent: 0, failed: 0}`, и оператор не видел неучтённое письмо (и возможный дубль активационного письма).
- **Сделано:** диспетчер считает `unconfirmed`; тесты требуют `sent + failed + unconfirmed === processed`. Поведение отправки не менялось.
- **Проверки:** 3 мутации, все падают. backend **1402/1402**, инвентарь 169/1397.
- **Коммит:** `3d2e686a`. Реестр 390–391.
- **Осталось:** `unconfirmed` пока не выводится в админ-панели (`/admin/billing/email-outbox` отдаёт здоровье по статусам, не агрегат партии); живые оплата/публикация/хранилище — 0 % проверки (UA-066).

### 2026-11-20 — Исключение утверждало, что оператор прочитает номер миграции

- **Найденный дефект:** отказ переотправки писем при отсутствующей миграции 165 — 503 с номером миграции в тексте, который 5xx заменяет общей фразой; при этом опись платежей исключала именно этот сайт с ложной причиной «номер миграции — ровно то, что нужно оператору».
- **Сделано:** отказ несёт код `email_requeue_migration_missing` (7 языков, номер миграции в тексте), ложное исключение удалено; оставшееся исключение получило правдивую причину.
- **Проверки:** 3 мутации, все падают (после того как тест стал проверять код). backend **1402/1402**, frontend **359/359**, `tsc` чисто.
- **Мои ошибки:** пакетный харнесс отчитался о выжившей мутации, которая падает при отдельном прогоне; тест не проверял код — дополнен.
- **Коммит:** `9301c07a`. Реестр 392–394.
- **Осталось:** живые оплата/публикация/хранилище — 0 % проверки (UA-066); за владельцем — UA-067, UA-070, UA-071, UA-073.

### 2026-11-20 — Усечённая партия задач могла сказать оператору «готово к финализации»

- **Найденный дефект:** финансовая очередь читает журналы задач партиями с потолком 500 строк; полная партия использовалась как полный журнал. Видимые задачи запроса могли выглядеть закрытыми (`reconciled_failure_awaiting_finalization`), а задача за потолком — всё ещё идти у провайдера. Для решения о возврате денег это худшее направление ошибки.
- **Сделано:** усечение обнаруживается, получает высший приоритет (`task_journal_truncated_integrity_review`) и попадает в ответ как `truncated.tasks`; полная партия сохраняет прежнюю причину.
- **Проверки:** 4 мутации, все падают. backend **1405/1405**, инвентарь 169/1400.
- **Коммит:** `bae9b8e8`. Реестр 395–396.
- **Осталось:** при усечении очередь не дочитывает остаток (честно предупреждает, дочитывание курсором — отдельный шаг); живые оплата/публикация/хранилище — 0 % проверки (UA-066).

### 2026-11-20 — Лимиты Pinterest были записаны дважды

- **Найденный дефект:** каждый бюджет Pinterest объявлялся дважды — в сборке лимитера и в экспортируемой карте `limits`, которую проверяют тесты. Изменение одной копии оставляло вторую в противоречии: продакшн мог разрешать вдвое больше при зелёном наборе.
- **Сделано:** числа в одной замороженной таблице, лимитеры через `fromTable(key)`, экспорт — тот же объект; лимитеры с ключом по IP читают окно и лимит оттуда же.
- **Проверки:** 4 мутации, все падают. backend **1406/1406**, инвентарь 169/1401.
- **Коммит:** `a03c6b4a`. Реестр 397–398.
- **Осталось:** хранилище лимитов остаётся `MemoryStore` (умножение бюджетов при нескольких инстансах) — решение для масштабирования, записано в §128.5; живые оплата/публикация/хранилище — 0 % проверки (UA-066).

### 2026-11-20 — Опубликованный пин можно было вернуть в очередь как «одобренный»

- **Найденный дефект:** `POST /pins/:id/status` охранял только отказ; вернуть уже опубликованный (или стоящий в календаре) пин в `approved` разрешалось без проверок, и он снова появлялся в очереди проверки как непубликовавшийся.
- **Сделано:** `assertPinCanBeApproved` — 409 `publication_reconciliation_required` для публикации, 409 `pin_already_scheduled` для расписания; ошибка чтения пробрасывается, а не считается пустотой; тест держит порядок «охранник до записи».
- **Проверки:** 4 мутации, все падают. backend **1411/1411**, инвентарь 170/1406.
- **Коммит:** `cb727aa6`. Реестр 399–400.
- **Осталось:** проверка и запись не атомарны (узкое окно; повторная публикация всё равно фехтуется журналом) — §129.5; живые оплата/публикация/хранилище — 0 % проверки (UA-066).

### 2026-11-20 — «Вы ещё ничего не опубликовали» при пяти провалах

- **Найденный дефект:** `isEmptySummary` решает судьбу всей панели аналитики и смотрел только на успешные публикации и планы. Аккаунт, у которого в окне было пять провалившихся публикаций, видел пустое состояние «вы ещё ничего не опубликовали».
- **Сделано:** провалы, отмены и дата последней публикации считаются историей; пустота — только когда истории нет.
- **Проверки:** 3 мутации, все падают. frontend **361/361**, `tsc` чисто.
- **Правка теста:** фикстура пустого состояния наследовала дату публикации — наследование убрано (это и есть исправление). Первая версия правки дала дубликат ключа, поймал `tsc` (`TS1117`).
- **Коммит:** `e5828076`. Реестр 401–402.
- **Осталось:** живые оплата/публикация/хранилище — 0 % проверки (UA-066); DOM-тесты невозможны (реестр npm недоступен), проверена функция, а не отрисовка.

### 2026-11-20 — Самое важное сообщение публикации было по-русски для всех языков

- **Найденный дефект:** предупреждение «Pinterest мог создать пин, не отправляйте повторно» в `PublishPinButton` было литералом, хотя остальной компонент берёт строки из таблицы переводов. Немецкий или китайский клиент читал единственную инструкцию, защищающую от дубликата, на чужом языке.
- **Сделано:** ключ `publishing.publishUncertain` + 8 ключей компонента на 7 языках; тест по исходнику запрещает кириллицу в компоненте, тесты по языкам требуют инструкцию «не отправляйте повторно».
- **Проверки:** 3 мутации, все падают. frontend **365/365**, `tsc` чисто.
- **Мои ошибки:** пакетная чистка локалей удалила несвязанный ключ `analytics.publishingNow` (восстановлено из git, правка переделана); вставка шла до проверки типов; одна мутация ложно отчиталась как выжившая (подтверждена отдельным прогоном).
- **Коммит:** `9cb5675b`. Реестр 403–405.
- **Осталось:** проверен только компонент публикации, полная инвентаризация жёстких строк — отдельный шаг; живые оплата/публикация/хранилище — 0 % проверки (UA-066).

### 2026-11-20 — Записаны 604 строки жёсткой кириллицы

- **Найденная недоработка:** после §131 остались 26 компонентов и страниц с русским текстом внутри — **604 строки** (лендинг, админ-панель).
- **Сделано:** инвентарь с потолком на файл и общим итогом: рост в учтённом файле, новый файл с кириллицей и устаревшая запись ломают тест; сканер самопроверен на литерале, комментарии и обращении к переводу.
- **Проверки:** 3 мутации, все падают. frontend **368/368**, `tsc` чисто.
- **Мои ошибки:** в сгенерированном тесте настоящие переносы вместо `\r\n` (дважды), поймал `tsc`.
- **Коммит:** `7abbc339`. Реестр 406–407.
- **Осталось:** 604 строки остаются непереведёнными — потолок не даёт расти, но не уменьшает; перевод лендинга и админ-панели требует копирайта. Живые оплата/публикация/хранилище — 0 % проверки (UA-066).

### 2026-11-20 — Запись о жёстких строках считала комментарии

- **Найденная недоработка:** потолок §132 считал любую строку с кириллицей — комментарии, JSDoc, регэкспы, уже переведённые файлы. Запись врала в обе стороны и прятала настоящие утечки.
- **Сделано:** сканер вырезает комментарии и пропускает developer-строки: 529 строк в 18 файлах (было 604 в 27). Найдены и исправлены три настоящие утечки: `CheckEmail` и ссылка «назад» отдавали английский пяти языкам, у бота была русская подпись — добавлены `authCopy.checkEmailMissingAddress`, `common.back`, `bot.floatingButton` на 7 языках.
- **Проверки:** 3 мутации, все падают. frontend **368/368**, `tsc` чисто.
- **Мои ошибки:** heredoc снова превратил `\n`/`\r\n` в настоящие переносы (четыре раза), поймал `tsc`.
- **Коммит:** `cdc3c83c`. Реестр 408–410.
- **Осталось:** 529 строк в 18 файлах — лендинг (126), админ-очередь (61), цены (39), контакты (36), финансы (36), очередь проверки (33): нужен копирайт на 7 языках; живые оплата/публикация — 0 % проверки (UA-066).

### 2026-11-20 — Оболочка приложения говорила по-русски

- **Найденная недоработка:** в `App.tsx` семь русских литералов — фолбэки «Без названия»/«Без доски», ошибка загрузки расписания, весь экран отказа в доступе, кнопка «Обновить». Каждый клиент видел их на своём языке интерфейса.
- **Сделано:** `common.untitled`, `common.noBoard`, `appErrors.scheduleLoadError`, группа `adminAccess`, `common.refresh` на 7 языках; `App.tsx` = 0, потолок 529 → 522. Мутацией найдена дыра: русская заглушка в нерусской локали не ловилась вообще → тест запрещает кириллицу в любой локали, кроме `ru.ts`.
- **Проверки:** 4 мутации, все падают и называют нужный тест. frontend **370/370**, `tsc` чисто.
- **Мои ошибки:** heredoc снова испортил `\n` (пятый раз); первый `grep` по локалям дал ложную кириллицу из-за диапазона в Git Bash — числа пересчитаны через `node`, иначе в документы попал бы ложный факт.
- **Коммит:** `fb7e0db7`. Реестр 411–413.
- **Осталось:** 522 строки в 17 файлах; `PinGenerator.tsx` держит **русские ключевые слова** для подсказок темы — для нерусского запроса подсказка не срабатывает вовсе (дефект поведения, не перевод); живые оплата/публикация — 0 % (UA-066).

### 2026-11-20 — Подбор доски работал только на двух языках

- **Найденная недоработка:** `PinGenerator` подбирал доску по теме английскими и русскими стемами, а категорию доски — только английскими. Клиент на es/pt/de/fr/zh не совпадал ни с чем и молча получал `boards[1]`; русская доска «Рецепты» тоже не совпадала с `recipe`.
- **Сделано:** правило вынесено в `src/lib/boardRecommendation.ts` — стемы 7 языков, без диакритики, `null` вместо произвольной доски. Тесты на всех семи языках, сквозной выбор, пустые случаи.
- **Проверки:** 5 мутаций, все падают. frontend **376/376**, `tsc` чисто. Потолок 522 → 514, в тесте объявлена его граница (`lib`/`utils` вне охвата и почему).
- **Мои ошибки:** мутация с диакритикой сначала «выжила», потому что стенд заменял несуществующий литерал — мутация не применилась (повтор §126); перезапуск с проверкой изменения файла падает.
- **Коммит:** `c963e466`. Реестр 414–416.
- **Осталось:** `src/utils/timezone.ts` собирает клиентские фразы о расписании по-русски (бейдж `МСК`, «Автогенерация запускается в …»), `src/lib/apiErrorMessages.ts` держит 5 русских фолбэков — следующий пункт. 514 строк в 16 файлах; живые оплата/публикация — 0 % (UA-066).

### 2026-11-20 — Часовые пояса были английскими для пяти языков

- **Найденная недоработка:** `SettingsView` рисовал `language === 'ru' ? nameRu : nameEn` — es/pt/de/fr/zh выбирали пояс по-английски; тип опции нёс только два имени.
- **Сделано:** `src/utils/timezoneNames.ts` — 55 названий на 7 языках; `missingTimezoneNames` читает таблицы (а не фолбэк), тест доказывает строгость вымышленной зоной. Удалён мёртвый код `formatTimeDisplay` / `getTimezoneInfo` / `convertMoscowToLocal` — в первых двух жили двухъязычные фразы о расписании.
- **Проверки:** 5 мутаций, все падают. frontend **382/382**, `tsc` чисто.
- **Мои ошибки:** удалил `getOffsetDiffMinutesToMoscow` как «мёртвый» — `tsc` показал живое использование, файл восстановлен из git и удаление переделано; первый детектор проверял фолбэк и потому ничего не проверял; heredoc снова испортил `\n` (шестой раз).
- **Коммит:** `19fb375d`. Реестр 417–419.
- **Осталось:** 514 строк в 16 файлах (лендинг 126, админ-очередь 61, цены 39, контакты 36, финансы 36, очередь проверки 33); живые оплата/публикация/хранилище — 0 % (UA-066).

### 2026-11-20 — Сбой аналитики приходил безымянной общей ошибкой

- **Найденная недоработка:** `getPublicationSummaryOrUnavailable` давал 503 без `details.code` → клиент получал общий текст «внутренняя ошибка»; пустой `ownerId` (ошибка вызывающего) выдавался за недоступность сервиса.
- **Сделано:** 503 несёт `analytics_unavailable`, клиент переводит на 7 языков («история не потеряна»); `invalid_owner_id` логируется отдельным событием и пробрасывается как серверная ошибка. Тесты: код на 503, отказ от проглатывания, копия на 7 языках, код не принимается на 404.
- **Проверки:** 5 мутаций, все падают. backend **1413/1413**, frontend **386/386**, `tsc` чисто.
- **Мои ошибки:** прогон `node --test test/` (Node искал модуль `test`); фоновый прогон без `nohup` убит вместе с родителем (повтор §118) — перезапуск дал 1413/1413; гвардия инвентаря тестов поймала +2 декларации (базовый файл поднят 1406 → 1408).
- **Коммит:** `b4bbd6d7`. Реестр 420–422.
- **Осталось:** `pinterest.js`, `billing.js` (ветки вебхука), `accountDeletionWorker`, арифметика окна в `analytics.js`; 514 строк кириллицы в 16 файлах; живые оплата/публикация/хранилище — 0 % (UA-066).

### 2026-11-20 — Ценовой экран называл деньги только по-русски

- **Найденная недоработка:** `period: '/ мес'` (4 тарифа), `accounts: 'до 3'/'до 10'/'безлимит*'`, названия пакетов `'Пакет S/M/L'` и двухъязычный бейдж «Выгодно» — пять языков из семи читали это на экране оплаты.
- **Сделано:** ключи `perMonth`, `packS/M/L`, `accountsUpTo` (с `{count}`), `accountsUnlimited`, `bestValue` на 7 языках; отдельный тест требует плейсхолдер (иначе «до» без числа); тест по исходнику запрещает возврат литералов. Потолок 514 → 505.
- **Проверки:** 5 мутаций, все падают. frontend **391/391**, `tsc` чисто.
- **Мои ошибки:** дважды ошибся в подсчёте вхождений `period: '/ мес',` (сначала ждал три, реально четыре) — скрипт остановился на утверждении, правка не применилась вслепую.
- **Коммит:** `0b1f0821`. Реестр 423–425.
- **Осталось:** списки возможностей тарифов на той же странице **по-английски для всех языков** (нужен копирайт на 7 языков); русские фолбэки `t.purchases?.x || 'Оплачено'` и двухъязычные ветки истории покупок — следующий пункт; 505 строк кириллицы в 16 файлах; живые оплата/публикация — 0 % (UA-066).

### 2026-11-20 — История покупок отвечала по-русски или по-английски

- **Найденная недоработка:** восемь сообщений на денежном экране строились двухъязычной веткой или русским фолбэком: ошибки загрузки цен, ошибка истории, «Загружаем историю…», «Повторить», пустая история, «Заказ», «Демонстрация».
- **Сделано:** ключи `purchases.loadTariffsError / loadPacksError / loadHistoryError / historyLoading / retry / emptyHistory / orderLabel / demoLabel` на 7 языках; тест по исходнику запрещает двухъязычные ветки. Потолок 505 → 497, `PricingView` 30 → 22.
- **Проверки:** 4 мутации, все падают. frontend **393/393**, `tsc` чисто.
- **Мои ошибки:** мутация французской строки сначала утверждала несуществующий литерал — стенд остановился, переписано на регэксп по значению.
- **Коммит:** `a3086a3f`. Реестр 426–428.
- **Осталось:** русские фолбэки `t.purchases?.statusX || 'Оплачено'` (ловушка, не срабатывает), подсказка про поддержку при зависшем платеже, демо-диалог и FAQ; списки возможностей тарифов по-английски для всех языков; 497 строк кириллицы в 16 файлах; живые оплата/публикация — 0 % (UA-066).

### 2026-11-20 — Совет при зависшем платеже говорил на двух языках

- **Найденная недоработка:** записка «не создавайте повторную покупку» существовала только ru/en; демо-диалог, «Продлить тариф» и два фолбэка ошибки платежа — тоже.
- **Сделано:** 6 ключей `pricing.*` на 7 языках; тест требует в каждой локали **запрет повтора**, а не непустую строку; тест по исходнику ловит `language === 'ru' ?` с кириллицей. Потолок 497 → 487, `PricingView` 22 → 12.
- **Проверки:** 4 мутации, все падают (четвёртая после доработки теста).
- **Мои ошибки:** мутация двухъязычной ветки сначала выжила — тест по локалям не видит ветку в компоненте, потолок в другом файле; добавлен самостотельный тест по исходнику.
- **Коммит:** `c1c249dd`. Реестр 429–431.
- **Осталось:** форматирование чисел `language === 'ru' ? 'ru-RU' : 'en-US'` даёт американский формат пяти языкам — следующий пункт; списки возможностей тарифов по-английски; 487 строк кириллицы в 16 файлах; живые оплата/публикация — 0 % (UA-066).

### 2026-11-20 — Проверка реестра путала строку 429 с HTTP-статусом

- **Найденная недоработка:** страж документации строил карту «номер → строка» по всем `| N |` документа, поэтому строка реестра 429 подменялась строкой таблицы HTTP-статусов из §26 и верная ссылка на `c1c249dd` объявлялась битой.
- **Сделано:** общий `registerBody()` — и проверка нумерации, и проверка цитат читают только срез таблицы реестра.
- **Проверки:** 3 мутации, все падают по правильной причине; `documentation-integrity` 6/6.
- **Мои ошибки:** мутация `deadbeef` упала на «коммит не существует», а не на цитате; нормализация переводов строк обнулила хронологию — оба раза падение было не по той причине, стенд переделан.
- **Коммит:** `750ceb12`. Реестр 432–434.
- **Осталось:** формат чисел на ценовом экране (`'ru-RU' : 'en-US'` для пяти языков) — следующий пункт; 487 строк кириллицы в 16 файлах; живые оплата/публикация — 0 % (UA-066).

### 2026-11-20 — Американский формат чисел у пяти языков

- **Найденная недоработка:** все форматтеры выбирали `language === 'ru' ? 'ru-RU' : 'en-US'` → es/pt/de/fr/zh видели `1,990.00` вместо `1.990,00` на ценовом экране, в онбординге, на лендинге и контактах.
- **Сделано:** `src/lib/intlLocale.ts` — одно отображение на 7 языков + `currencyForLanguage`; 5 мест переведены. Тест проверяет **цифры** (1990.50 = `1,990.50` в en и не так в de/fr/es), а не константу.
- **Проверки:** 4 мутации, все падают. frontend **400/400**, `tsc` чисто.
- **Осталось:** `toLocaleString()` без локали в админ-модулях и русский фолбэк `'Дата неизвестна'` — следующий пункт; 487 строк кириллицы в 16 файлах; живые оплата/публикация — 0 % (UA-066).
- **Коммит:** `f1448cf2`. Реестр 435–437.

### 2026-11-20 — Админские даты зависели от браузера оператора

- **Найденная недоработка:** шесть мест в админ-панели форматировали `toLocaleString()` без локали: порядок дня/месяца и разделители зависели от браузера; в `AdminPaymentCreationRequests` был русский фолбэк `'Дата неизвестна'`.
- **Сделано:** `src/lib/dateFormat.ts` — одна функция, одна локаль по языку панели, один видимый фолбэк вместо `Invalid Date`; шесть мест переведены. Тесты: детерминизм, различие de/en, `null`/`''`/`'not-a-date'`/`NaN` → фолбэк.
- **Проверки:** 3 мутации, все падают. frontend **405/405**, `tsc` чисто.
- **Коммит:** `e6bd12c9`. Реестр 438–440.
- **Осталось:** админ-панель целиком русская (≈300 строк, нужен копирайт); 487 строк кириллицы в 16 файлах; списки возможностей тарифов по-английски; живые оплата/публикация — 0 % (UA-066).

### 2026-11-20 — UA-067 называла устаревшее число коммитов

- **Найденная недоработка:** инструкция владельцу говорила «59 коммитов» при фактических **102** — ровно там, где решается вопрос о пуше.
- **Сделано:** счётчик приведён к `git rev-list --count origin/main..main`; страж `user-actions-reference` требует настоящее число (мутация «много коммитов» падает).
- **Проверки:** 1 мутация падает; `user-actions-reference` 3/3, backend **1413/1413**, frontend **405/405**.
- **Осталось:** счётчик приходится обновлять вручную после каждого блока; админ-панель русская целиком; списки возможностей тарифов по-английски; 487 строк кириллицы в 16 файлах; живые оплата/публикация — 0 % (UA-066).

### 2026-11-20 — Счётчики кредитов и админская дата шли за браузером

- **Найденная недоработка:** после §142/§143 остались пять `toLocaleString()` на счётчиках кредитов в `PricingView` и `toLocaleDateString()` в `AdminMail`.
- **Сделано:** `formatCredits(value, language)` и `formatTimestamp`; тесты расширены (отвергают `.toLocaleString()`/`.toLocaleDateString()`, `AdminMail` добавлен в список).
- **Проверки:** 2 мутации падают; frontend **405/405**, `tsc` чисто.
- **Коммит:** `5bf05764`. Реестр 442–443.
- **Осталось:** админ-панель русская целиком; списки возможностей тарифов по-английски; 487 строк кириллицы в 16 файлах; живые оплата/публикация/хранилище/`/analyze` — 0 % (UA-066).

### 2026-11-20 — UA-067 выдавала снимок за постоянную величину

- **Найденная недоработка:** число коммитов в UA-067 подавалось как факт, хотя меняется после каждого коммита (59 → 102 → 105).
- **Сделано:** «105 коммитов на момент записи, 2026-11-21» + команда пересчёта рядом; страж `user-actions-reference` требует настоящее число (мутация «много коммитов» падает).
- **Проверки:** 1 мутация падает; `user-actions-reference` 3/3.
- **Осталось:** число всё равно устареет — это снимок; автопроверка невозможна, любой коммит меняет величину. Админ-панель русская целиком; списки возможностей тарифов по-английски; 487 строк кириллицы; живые оплата/публикация — 0 % (UA-066).

### 2026-11-21 — Гонки против `010..165` прошли (UA-073 закрыт)

- **Проверено владельцем:** `verify-sql-windows.ps1 -Concurrency -KeepGoing` → `PASS: baseline + 157 migrations applied; 53 SQL integration files passed.` + `PASS: 10 isolated concurrency tests passed.`, PostgreSQL 18.6, одноразовые базы созданы и удалены.
- **Что это закрывает:** сочетание миграций 164/165 с 10 сценариями гонок не было проверено ни разу (прошлый полный прогон — на `010..163`).
- **Чего это не доказывает:** рабочая база — Supabase; 164/165 туда ещё не применены (UA-070/071). Одноразовый кластер удаляется в конце гейта.
- **Реестр:** 445–446. Раздел 147. Коммит — docs §147.
- **Следующее:** применить 164/165 в рабочей базе → проверить `429 login_locked` → staging по UA-066.

### 2026-11-21 — Миграции 164/165 применены в Supabase; моя проверка называла несуществующие функции

- **Проверено владельцем:** 164 (`Success`) и 165 (`Success`) выполнены в SQL Editor проекта Supabase; `requeue_email_outbox` виден в `pg_proc`.
- **Моя ошибка:** в инструкции я назвал функции `register_failed_login`/`clear_failed_logins` — таких нет. Реальные: `login_lock_state`, `record_failed_login`, `clear_login_failures`, `clear_login_failures_by_email` (проверено `grep` по миграции и по `loginLockout.js`). Ложный `0 rows` читался как «миграция не применилась».
- **Не подтверждено (честно):** полный список четырёх функций замка — до запуска исправленного запроса.
- **Реестр:** 447. Раздел 148.
- **Дальше:** `5 rows` → `backend\.env` → `npm start` → `429 login_locked` → staging UA-066.

### 2026-11-21 — 164/165 подтверждены в рабочей базе; найдена блокировка `npm start`

- **Проверено владельцем:** запрос вернул **5 rows** — все четыре функции замка (`login_lock_state`, `record_failed_login`, `clear_login_failures`, `clear_login_failures_by_email`) и `requeue_email_outbox`. Миграции 164/165 в Supabase применены.
- **Найдено:** PowerShell 5.1 блокирует `npm start` политикой выполнения (`npm.ps1`, `UnauthorizedAccess`) — обход `npm.cmd start` или `Set-ExecutionPolicy -Scope Process -Bypass`, записано как UA-074.
- **Реестр:** 448–449. Раздел 149.
- **Осталось:** запустить бэкенд и проверить `429 login_locked` (UA-071); staging UA-066 — 0 %.

### 2026-11-21 — Найден корень падений: `backend/.env` не читался

- **Дефект:** `.env.example`, инструкции и `.gitignore` требуют/защищают `backend/.env`, но `npm start` = `node index.js` без `dotenv` — файл был декоративным. Владелец заполнил ключи, они игнорировались, процесс падал с безымянным `{"level":"fatal","event":"process.uncaught_exception"}`.
- **Решение:** `--env-file-if-exists=.env` в `start`, `worker`, `worker:account-deletion`, `cron:schedule`; `test` намеренно не читает `.env`. Зависимость не добавлена.
- **Проверено:** до — fatal без причины; после — `GET /health` → `{"ok":true,"uptime_seconds":7}`. Новый страж `startup-loads-env.test.js` (3 проверки), мутация (убран флаг) роняет 2 из 3.
- **Не сделано:** замок входа вживую — в базе 0 пользователей, нужен тестовый аккаунт; диагностика фатальных ошибок всё ещё скрывает причину.
- **Реестр:** 450–452. Раздел 150.

### 2026-11-21 — Фатальные ошибки теперь называют причину

- **Дефект:** `{"level":"fatal","event":"process.uncaught_exception"}` без причины — владелец не мог узнать, чего не хватает; именно поэтому §150 дважды остался незамеченным.
- **Решение:** в журнал идут `error_name` + статический код (`config_jwt_secret_missing`, `config_supabase_service_role_missing`, `config_supabase_url_missing`); текст ошибки, стек и причина rejection не пишутся.
- **Проверено вживую:** `"error_code":"config_supabase_service_role_missing"`; сервер с рабочим `.env` отвечает `/health` → `{"ok":true,"uptime_seconds":474}`.
- **Мутации:** 4, все падают. Свои ошибки: два теста не покрывали обработчик и `startupConfig`; мутация дважды била не в то вхождение `record.error_code` (повтор §123/§126).
- **Реестр:** 453–454. Раздел 151.
- **Осталось:** замок входа вживую (нужен тестовый аккаунт), staging UA-066 — 0 %.

### 2026-11-21 — Окно политики: заголовок и «закрыть» были двухъязычными

- **Дефект:** `isRussian ? 'Политика конфиденциальности' : 'Privacy Policy'` и то же для `aria-label` — немецкий/китайский клиент видел английский текст. Тело политики существует только ru/en — это отдельное, честно записанное ограничение.
- **Сделано:** `terms.privacyPolicyTitle`, `terms.closeLabel` на 7 языках; потолок 486 → 484 строки, 16 → 15 файлов.
- **Проверки:** 3 мутации падают; frontend **409/409**, `tsc` чисто.
- **Моя ошибка:** первый тест запрещал любую `isRussian ?`, включая законный выбор тела — уточнён.
- **Реестр:** 455–457. Раздел 152. Коммит §152.
- **Осталось:** тело политики ru/en; 484 строки кириллицы в 15 файлах (в основном админ-панель); замок входа вживую (0 пользователей в базе); staging UA-066 — 0 %.

### 2026-11-21 — Удалено мёртвое окно входа (326 строк, `@ts-nocheck`)

- **Дефект:** `components/auth/AuthModal.tsx` никто не монтировал, но он был копией самого чувствительного экрана, с 23 русскими строками и `// @ts-nocheck` — TypeScript не проверял ни строки.
- **Сделано:** файл удалён; из `AuthContext` убраны `isAuthModalOpen`/`closeAuthModal` (ничего не рендерили); `openAuthModal` сохранён (переход на `/login`/`/register`). Новый `lib/deadCodeGuard.test.ts` — 5 проверок. Потолок 484 → 461 строка, 16 → 14 файлов.
- **Мутации:** 3, падают на тестах 2, 5, 3.
- **Мои ошибки:** список из `git ls-files` не видел новый файл (сирота выжила) → теперь `readdirSync`; возврат `closeAuthModal` не ловился → добавлена проверка; мутация `@ts-nocheck` сначала падала не по той причине (пересоздавала файл по тому же пути).
- **Проверки:** frontend **414/414**, `tsc` чисто.
- **Реестр:** 458–461. Раздел 153. Коммит §153.
- **Осталось:** 461 строка кириллицы в 14 файлах (~330 — админ-панель); тело политики ru/en; замок входа вживую (0 пользователей); staging UA-066 — 0 %.

### 2026-11-21 — Замок входа проверен на живом сервере; регистрация из браузера не доходила до backend

- **Проверено (UA-071 → ВЫПОЛНЕНО):** 5 неверных паролей → `401 invalid_credentials`; 6-я попытка → `429 login_locked`, `retryAfterSeconds: 900`; верный пароль во время блокировки → тоже `429`, отсчёт `890`; `clear_login_failures_by_email` → `{rows:1,cleared:true}`; вход → `200` + токен.
- **Найдено:** регистрация через браузер уходила на `onrender.com`, потому что `frontend/.env` был создан после старта Vite, а `api.ts` по умолчанию использует чужой хост. Прямой `POST /register` к localhost → `HTTP 200`.
- **Не проверено:** обратный отсчёт в браузере (логика проверена), настоящее письмо подтверждения (SMTP — заглушка).
- **Осталось в базе:** тестовый аккаунт `qa.lockout@pinposy.com` — удалить перед запуском.
- **Моя ошибка:** вырезая UA-071 по границам `####`, я удалил блок UA-072, оформленный `###`; тест `user-actions-reference` поймал сразу, блок восстановлен из git.
- **Реестр:** 462–463. Раздел 154 (включая 154.6). UA-071 обновлён.

### 2026-11-21 — Секреты в `.env` не попадут в GitHub: проверено и закреплено тестом

- **Опасение владельца:** «это улетит в GitHub». Проверено: `git ls-files` не содержит ни одного `.env`; `git check-ignore -v backend/.env` → `backend/.gitignore:2:.env`; `git log --all -- backend/.env` — пусто, никогда не коммитился.
- **Сделано:** `backend/test/secrets-never-committed.test.js` — 4 проверки (ни один `.env`/`.env.*` не отслеживается; оба правила игнора; пустая история; вопрос задаётся самому git через `check-ignore`). 3 мутации падают, индекс после них восстановлен (`tracked .env: 0`).
- **Решение:** копировать SMTP из Render сейчас не нужно — для локальной проверки подтверждение ставится в базе; SMTP нужен перед первым реальным клиентом.
- **Реестр:** 469–472. Раздел 156. Коммит §156.

### 2026-11-21 — Текст «сервер просыпается после простоя» заменён на честный

- **Дефект:** сообщение о недоступном сервере во всех 7 языках утверждало догадку о чужой инфраструктуре («возможно, просыпается после простоя»). Владелец читала его трижды, пока причина была в устаревшем `VITE_API_URL`.
- **Сделано:** текст заменён на «Сервер не отвечает. Проверьте соединение и попробуйте снова через минуту» (7 языков); в dev-режиме без `VITE_API_URL` печатается `[api] VITE_API_URL is not set; requests go to …`; новый `networkMessageHonesty.test.ts` (4 проверки). 4 мутации падают.
- **Моя ошибка:** heredoc снова испортил регулярное выражение (`TS1161`), от регулярки отказался.
- **Проверки:** frontend **418/418**, `tsc` чисто.
- **Реестр:** 473–476. Раздел 157. Коммит §157.

### 2026-11-21 (вечер) — Регистрация из браузера заработала, почта подтверждена вручную

- **Проверено:** после удаления `frontend/.env.local` браузер обращается к `127.0.0.1:8080`; регистрация `daleksandrova866@gmail.com` прошла, страница `/check-email` отображена, в таблице `users` появилась вторая строка.
- **Сделано ассистентом:** `email_verified = True` для этого аккаунта (1 строка) — вход возможен без письма.
- **Не сделано:** письма не отправляются — `MAIL_SMTP_*` остаются заглушками (§155). Пароль владельца ассистенту неизвестен и не запрашивался.
- **Журнал:** `docs/USER_ACTIONS.md` → «Продолжение журнала — 2026-11-21, вечер», шаги 12–14.
- **Реестр:** 477–478. Раздел 158.

### 2026-11-21 — Ключ AI-провайдера был заглушкой; предупреждения о заглушках печатались слишком поздно

- **Проверено по факту:** владелец вошла в кабинет — открылся онбординг (`/app`, шаг 1 «Что вы продвигаете?»). Это подтверждает вход и работу `/app`.
- **Дефект 1:** `GPTUNNEL_API_KEY=<gptunnel-key>` уходил в `Authorization`; провайдер вернул бы `401`, клиент получил бы невнятный отказ на генерации. Теперь `503 {"code":"ai_provider_not_configured"}`, значение ключа не печатается.
- **Дефект 2:** предупреждения `mail.config_placeholder`/`ai.provider_placeholder` стояли внутри колбэка `app.listen` и при занятом порту не появлялись. Перенесены до `app.listen`; живой запуск на 8099 печатает оба.
- **Мутации:** 5, все падают (`not ok 1` ×3, `not ok 4` ×2).
- **Моя ошибка:** ждал `error.status`/`error.code`, а `httpError` даёт `httpStatus` и `details.code` (`withCode` — в `auth.js`).
- **Не проверено:** живая генерация — нужен настоящий ключ `GPTUNNEL_API_KEY`.
- **Реестр:** 479–482. Раздел 159. Инвентарь: 174 файла / 1427 объявлений.

### 2026-11-21 — Написан план полной готовности к привлечению пользователей

- **Файл:** `docs/RELEASE_READINESS_PLAN.md`. 14 блоков (инфраструктура, почта, вход и безопасность, генерация и кредиты, Pinterest, оплата, фоновые процессы, интерфейс и языки, админка, наблюдаемость, юридическое), 14 приёмочных цепочек C1–C14 и гейт релиза из 10 условий.
- **Факты, на которых стоит план:** сайт и `/health` отвечают `200`; юридические тексты только `ru`/`en`; тарифы `start`/`pro`; пакеты кредитов 100/500/1000; 9 модулей админки; фоновые процессы `scheduleWorker`, `scheduleCron`, `accountDeletionWorker`.
- **Записано как незакрытое:** публикация в Pinterest и оплата ни разу не проходили вживую, staging отсутствует, юридические тексты на 2 языках из 7. Оценка: ~82 % технически, ~55 % к приёму денег.
- **Реестр:** 484–486. Раздел 160.


### 2026-11-22 — Регистрация не должна терять обязательную отметку согласия (AUD-402)

- **Актуальный base перед исправлением:** `main` `5486a264f61acf5ec0dc26a74266201279325fea`.
- **Корневая причина:** fallback регистрации считал `terms_accepted_at` необязательной profile-column. При отсутствующей миграции 166 повторная вставка создавала пользователя без timestamp. Даже ошибка по `name`/другому optional profile field запускала fallback без всех profile fields, включая consent.
- **Исправление:** `backend/auth.js` теперь fail-closed при ошибке отсутствующей `terms_accepted_at`: controlled 503 до retry; аккаунт и verification token не создаются. Retry для старой схемы сохраняет серверный timestamp.
- **Регрессия:** `backend/test/auth.test.js` расширен: optional-column retry проверяет валидный timestamp; отдельный тест missing consent column требует ровно одну попытку вставки, 0 users и 0 verification tokens.
- **Коммиты:** source `91e6edf09ca5eefe611556bb0bb70f176d3fc0ab`; tests `f4ddd2508a3d3ddb8e0bc60ae66b19a321daeabd`; audit `097eefc38fadf3108e6b5dbba7d028955def1c78`; owner action `fc85704faffb112428b4145d8eb18acb644ecb2c`.
- **Blobs после публикации:** `backend/auth.js` `27df9536e2fda081fc6812f22147ff6cab70c712`; `backend/test/auth.test.js` `93e7554f0aa1151905e0e9aa0e00b4227e1f8b24`; `docs/audits/2026-11-22-consent-persistence-fail-closed.md` — audit report.
- **Проверки:** GitHub re-fetch подтвердил обновлённые source/test blobs и diff; Node test suite НЕ запускался в этой среде. Последние Actions jobs на предыдущих commits завершались до первого шага (`runner_id=0`, `steps=0`); новый результат CI пока не подтверждён. Не объявлять тесты PASS.
- **Production safety:** production DB, реальные данные, платежи, Pinterest, DNS и deployment не трогались.
- **Блокировка владельца:** UA-075 — проверить/применить additive migration `166_user_terms_consent.sql` и подтвердить наличие `public.users.terms_accepted_at`. До этого регистрация корректно откажет, если колонка отсутствует.
- **Следующий шаг:** проверить новые CI runs и продолжить ревью PR #96 отдельно от main; не включать S3/CDN image-base flag до реализации фактической загрузки/удаления объектов в целевом storage.


### 2026-11-22 — Рабочий период закрыт: код опубликован, CI runner заблокировал runtime

- **Последний проверенный main перед документационным closeout:** `6d0998afc4faabddca16ee134fa52fbf36b299f7`; base дерева для closeout: `347bfa2ad160b0819026ea6d1c76c161d9f3ac72`.
- **Публикация:** source `91e6edf09ca5eefe611556bb0bb70f176d3fc0ab`, regression test `f4ddd2508a3d3ddb8e0bc60ae66b19a321daeabd`, owner action `fc85704faffb112428b4145d8eb18acb644ecb2c`, state `a6d01304ee964f4e87f478eca5848963edd4129b`, documentation register `1093a34c4fd599bcc4584e99458527af2b555684`, audit update `6d0998afc4faabddca16ee134fa52fbf36b299f7`.
- **CI:** workflow run `45030088767`, job `137231548164` (`postgres-atomicity`) ended `failure` with `runner_id=0`, `steps=[]`; no test command started. The failure is runner allocation, not an observed assertion failure. No rerun was attempted because the same zero-step runner failure has repeatedly occurred and cannot be repaired by code changes in this session.
- **Vercel:** `success` status on code and test commits and documentation HEAD `1093a34c4fd599bcc4584e99458527af2b555684`; this status is not proof of production deployment. No production deployment action was initiated.
- **PR #96:** remains open/not merged. Review comment `7080191005` records two merge blockers: its consent fallback can regress the new main fix, and `PIN_IMAGE_PUBLIC_BASE_URL` does not switch actual upload/delete provider (both still use Supabase Storage). Do not enable target S3/CDN URL until provider operations and lifecycle/recovery are implemented consistently.
- **Confirmed from GitHub:** main code and test file blobs were re-fetched after publication; compare against base showed only intended source, regression test and documentation changes. Node tests and Docker build remain NOT RUN here.
- **Owner gate:** UA-075. Verify migration 166 in the intended Supabase project; no production DB was accessed.
- **Next independent task:** reconcile PR #96 with main, remove/complete the incomplete storage cutover safely, then get a real runner to execute the full backend/frontend/SQL gates. Live SMTP, GPTunnel generation, Prodamus payment and Pinterest publish remain unverified.


- **Documentation closeout commit:** `b32597409054ce2b2fedc7732369a81b2edb21d5` (state/register/audit synchronized in one commit). Final GitHub ref is checked after this closeout.

### 2026-11-22 — Исправлена ложная формулировка о доставке письма (AUD-403)

- **Кодовая база:** `b32597409054ce2b2fedc7732369a81b2edb21d5`; перед публикацией main имел документационный HEAD `d9ad180640636783c2591909ba63540c0aaea1f9`.
- **Дефект:** `register()` возвращал `verificationEmailSent: false`, но безусловное поле `message` утверждало, что письмо отправлено. При отключённом/неработающем SMTP это направляло пользователя проверять пустой ящик.
- **Исправление:** `backend/auth.js` — сообщение теперь зависит от результата `sent`; успешный текст сохранён, неуспешный честно сообщает об ошибке отправки и предлагает запросить письмо повторно. Регистрация и API-контракт не меняются.
- **Регрессия:** `backend/test/auth.test.js` — тест неуспешной отправки требует честный текст и запрещает успешное обещание.
- **Проверка:** точечный diff подготовлен на основе текущих GitHub blobs; Node runtime тесты в этой среде не запускались. CI runner по-прежнему не исполняет шаги; не считать тест PASS.
- **PR #96:** head `bc3271dcf49b9a093974f03705eeb8a04149abc8`, остаётся open/unmerged. Auth fallback должен сохранять fail-closed consent из main. `PIN_IMAGE_PUBLIC_BASE_URL` не меняет provider upload/delete: обе операции остаются в Supabase Storage; не включать до полного provider cutover и проверок.
- **Владелец:** UA-075 (migration 166) остаётся открытым; UA-076 — выполнить backend tests локально, если CI runner недоступен.
- **Безопасность:** production DB/data, SMTP, платежи, Pinterest, DNS и deployment не затрагивались.
- **Следующий шаг:** проверить опубликованный diff и commit SHA; продолжить безопасное извлечение/согласование только тех частей PR #96, которые не меняют storage provider и не регрессируют consent.

### AUD-403 closeout — публикация и фактический CI результат

- **Source + regression test commit:** `f84885b0c0b8f07f38c897d0a2f5946c7afd0d43` (parent `d9ad180640636783c2591909ba63540c0aaea1f9`).
- **Blobs:** `backend/auth.js` `0cbc29525afeb087ffc697140adc58b7e621d413`; `backend/test/auth.test.js` `ed541cc98b693cd3575324cca5948434c6bbf774`; AUD-403 `ac48b2dc08bf83684d72e6d349d5e507ce67cced`.
- **GitHub diff:** повторно получен из commit API; source +4/-2, test +2/-0. Только условное сообщение и две регрессионные assertions.
- **Actions:** run `45030627525` jobs backend `137233202645` и frontend `137233202903`; run `45030627510` postgres job `137233202516`. Все завершились failure с `runner_id=0`, `steps=[]`; runtime тесты не стартовали.
- **Vercel:** на момент проверки combined status `pending`; не считать deployment завершённым.
- **Публикация:** main ref подтверждён на source/test commit до этого документационного closeout. История не переписывалась; первая попытка commit на устаревшем parent `e73ffb4766172bda61dfef795b05d1e456e0e7ca` не вошла в main; после refresh выполнен корректный commit поверх актуального `d9ad180...`.
- **Открыто:** UA-075 и UA-076; PR #96 остаётся open. Следующий безопасный шаг — локальный backend test suite/runner, затем отдельно reconcile PR #96 без storage cutover.

### 2026-11-22 — Verification gate синхронизирован с миграцией 166 (AUD-404)

- **Base main:** `e76f9d8704282800faab8306efdfc10ed07b1d3b`.
- **Подтверждённый инвентарь:** GitHub tree содержит 157 active migrations `010–166`, без пропусков; `166_user_terms_consent.sql` присутствует.
- **Дефект:** Linux verify требовал `010–165` / 152 файла; Windows verify — `010–161` / 152 файла. Корректная текущая схема не проходила preflight migration replay.
- **Исправление:** оба скрипта теперь требуют contiguous `010–166` / 157 файлов; Linux diagnostic count исправлен. Contract test обновлён и дополнен проверкой реального списка файлов.
- **Проверка:** static diff and migration tree inventory verified; Node/PostgreSQL runtime NOT RUN. Не считать gate runtime PASS.
- **Production safety:** миграции не применялись ни к production, ни к Supabase; проверка предназначена только для локальной disposable PostgreSQL.
- **Владелец:** UA-077 — локально выполнить migration-only replay при наличии PostgreSQL.
- **Следующий шаг:** проверить source/test publication и актуальный SHA; после этого дождаться локального или рабочего CI runtime результата.

### AUD-404 post-commit review — исправлено экранирование inventory test

- При обязательном review commit `4ff3b3509d103ae27d945c1faf7bb2e289112428` обнаружено: новый JS regex был double-escaped и искал буквальный `\\d`, а не numeric prefix.
- Исправлено в regression test: теперь pattern `/^\d{3}_.+\.sql$/` корректно отбирает миграционные filenames. Linux/Windows script range fix не затронут.
- Это была ошибка тестового fixture, пойманная статическим review до runtime; не считать тест пройденным. Новый test blob и final commit будут записаны после публикации.



### 2026-11-22 — Windows migration replay summary corrected (AUD-405)

- **Finding:** after AUD-404, Windows replay validation required the correct contiguous 010–166 / 157-file chain, but PASS/FAIL summary still displayed 010–161.
- **Fix:** `scripts/verify.ps1` summary now says `001 + 010-166`; regression in `backend/test/verify-script-migration-chain.test.js` requires the current range and rejects the stale one.
- **Evidence:** script commit `d1cdf597e5568951eabbd57f3552e9b984cf29db`, test commit `7a57d1aa16b9aea8971e1093675bc817b355b30a`, audit commit `567b852ede0141f003b6e1a4b70185b6bf9e0d71`.
- **Runtime:** Node tests and PostgreSQL replay NOT RUN in this session; no runtime PASS claimed.
- **Safety:** no production database or external service accessed. Owner acceptance remains UA-077.
- **Next:** refresh CI status and continue the next independent release gate; preserve the local disposable-PostgreSQL acceptance blocker.

### 2026-11-22 — AUD-404/AUD-405 release-gate closeout (main reconciliation)

- **Current main before this docs commit:** `6bba725ff4e60ba5163da210ad49f6e8a200eec3`.
- **Code/test commits:** AUD-404 verify scripts `4ff3b3509d103ae27d945c1faf7bb2e289112428`; regex correction `e02b16f3d1e0a2625878a172f49c9379295cb7b2`; AUD-405 Windows summary `d1cdf597e5568951eabbd57f3552e9b984cf29db`; regression `7a57d1aa16b9aea8971e1093675bc817b355b30a`.
- **Current blobs:** verify.sh `ae05d6f5075091475ade646b9c3eaafd9ded899e`; verify.ps1 `d4f447d08c92fcbc6585103867d691d7a749e881`; test `03a9fba19b7b65096e9d142106f6cc349568de29`.
- **CI:** runs `45031148970`, `45031148954`, `45031140844` failed before steps (`runner_id=0`, `steps=[]`). No runtime tests or SQL replay executed.
- **Vercel:** `success` on current docs HEAD; not production deployment proof.
- **PR #96:** comment `7080314663` added; PR remains open, consent/storage cutover blockers remain.
- **Owner gates:** UA-077 and UA-078 local disposable PostgreSQL/backend acceptance pending. No production SQL executed.


### 2026-11-22 — PR #96 storage migration safety review (AUD-406)

- **Scope:** static review of the unmerged PR #96 only; findings do not describe current main behavior.
- **Findings posted:** legacy Supabase image URLs are not recognized by deletion when custom public base is configured; S3-to-S3 copy replaces image Content-Type with `application/octet-stream`; copy resume/verify relies on size rather than byte checksum.
- **Review comment:** PR #96 comment `7080338627`; PR remains open and unmerged.
- **Report:** `docs/audits/2026-11-22-pr96-storage-migration-review.md` (commit `69f95f7de4288ae1a1e3bf7e0b6a1820aa255db4`).
- **Verification:** static patch review only. No Docker build, tests, backup/restore, or storage transfer run.
- **Safety:** no production credentials, production DB, or external storage operations used.
- **Next:** address the three review findings with regression tests before merge consideration; continue independent main-branch readiness work.


## Working-period closeout — 2026-11-22

- **Main HEAD before this closeout:** `b55523be6c6d3e54fe21ad536586124074dde721`.
- **Completed code task:** AUD-405 corrected Windows migration summary range; source commit `d1cdf597e5568951eabbd57f3552e9b984cf29db`, regression commit `7a57d1aa16b9aea8971e1093675bc817b355b30a`.
- **Review task:** AUD-406 reviewed unmerged PR #96; comment `7080338627` records legacy image URL deletion, S3 Content-Type and checksum blockers. PR remains open; not merged.
- **Documentation:** AUD-405/AUD-406 reports and corresponding state, action queue and register entries published. Current owner gates: UA-078 (local backend tests + disposable PostgreSQL replay), UA-079 (PR #96 fixes and regression acceptance).
- **CI:** source/test Actions runs `45031148970` and `45031148954` failed before execution; observed runner allocation failure (runner ID 0, zero steps). No Node test or PostgreSQL replay PASS is inferred. Vercel status on `b55523be6c6d3e54fe21ad536586124074dde721` was `success`; this is not deployment acceptance.
- **Safety:** no production database, production storage, Prodamus, Pinterest or deployment was touched.
- **Next:** first obtain actual local/available-runner runtime evidence for UA-078; independently require PR #96 review fixes under UA-079. Continue code review after those gates without claiming launch readiness.


### 2026-11-22 — Review queue malformed DB envelopes now fail closed (AUD-407)

- **Base:** `ffda1f191ab6e470a51ae0db9eec1934d0ece8d4`.
- **Root cause:** `GET /review-queue` treated malformed successful related `pins`/`pin_schedules` query results as empty arrays via `result.data || []`. Missing/malformed evidence could cause queue rows to be classified stale and deleted.
- **Fix:** reusable `readArrayQueryResult` in `backend/fetchAllPages.js`; pager validates every page and overflow probe; review queue validates every batched pins/schedules envelope before reconciliation.
- **Regression:** malformed pins/schedules HTTP tests require 502 and zero queue DELETE; helper and route-contract tests added; inventory updated from 1433 to 1437 declarations.
- **Commits:** helper `8b80eff40db9e87e1bcd91c5a89cbaf0f1cdd3be`; route `9d6b1c9d04d99053568157775b1b2eff787f1a3a`; tests `d3187215dacb1e0eba2f1c672fa87b769a46bbed`, `0a76269dd9cc617c96fb534029f369794ca64a29`, `5bb199b37bc76bc360b4f1311274c79a5d82686c`; inventory `3db7df927f6cd9a51b866fb3c2f8bc31ac491a8a`; audit `4aec2622631c8009a3b696eb9206e675f3c8783e`.
- **Static publication verification:** re-fetched all changed source/test/inventory blobs; confirmed validator usage, no route fallback, validation before reconciliation, and counts 110 + 5 + 3 (inventory total 1437). Full evidence in `docs/audits/2026-11-22-review-queue-malformed-envelope.md`.
- **Runtime:** Node tests NOT RUN; no runtime PASS. Older PR #95 was not merged due stale base; fix was applied narrowly to current main.
- **Safety:** no production DB/data or external services touched.
- **Next:** get backend test execution through a working local/CI runner (UA-076/078 pending); continue independent code review.


### 2026-11-22 — Failed schedule retry now requires valid metadata (AUD-408)

- **Finding:** `GET /schedule` used `result.data || []` for attempts/publications/active-account metadata. Malformed successful envelopes could be interpreted as evidence that retry was safe.
- **Fix:** all three metadata groups now use `readArrayQueryResult`. DB errors and malformed envelopes return the schedule with failed rows explicitly `retryable:false`, `retry_reason:"metadata_unavailable"`; no retry safety is inferred from malformed data.
- **Regression:** HTTP test for malformed attempts metadata; source contract requires strict validation for attempts/publications/accounts and forbids fallback. Test inventory 1437 → 1439.
- **Commits:** implementation `afc394d904f082028d00ce0068414e4d73b9e1df`; HTTP test `94ae91a3d5bef3b0d09536972956329ddba0c630`; contract `6978b9995c0f5327705d4ea823c1d734e21e667f`; inventory `cfe386007abe41ae4c3286eccf6826be96802872`; report `c7dc4a522d8e31e90bf305327fe42648f1eb6539`.
- **Static publication:** re-fetched changed files; validated 3 metadata groups, safe fallback, no unsafe route fallback; inventory matches 111 API tests + 2 schedule contract tests, total 1439.
- **Runtime:** tests NOT RUN; no runtime PASS claimed.
- **Safety:** no production DB, external Pinterest, Prodamus, Storage or deployment touched.
- **Next:** UA-076 targeted/full backend tests on working local runner; continue release-readiness review.

### 2026-11-22 — Billing inventory and schedule account recovery fail closed (AUD-409)

- **Base:** `cfe386007abe41ae4c3286eccf6826be96802872`.
- **Finding:** admin pending-order and webhook-exception endpoints could treat malformed successful query results as empty lists; schedule account recovery could treat malformed attempts/publications/duplicate reads as no history and calculate retry eligibility.
- **Fix:** `readArrayQueryResult` now validates billing inventory arrays and all retry metadata arrays in `POST /schedule/:id/reconcile-account`. Non-null account data must be an object whose ID exactly matches the selected account. Invalid metadata returns `retryable:false`, `retry_reason:"metadata_unavailable"`.
- **Regression tests:** malformed webhook exception and pending order HTTP responses must return 502; schedule account-recovery contract requires strict array and account identity checks. Inventory updated 1439 → 1442.
- **Commits:** source `42e4546998d50944ff2ab486c0210e2d0484f3d2`; HTTP tests `e2cc97edee60e3267f07d8975c496f32ecd48233`; schedule contract `dfc64df387d7a39f5ce4d84496c6c168a02a6f3f`; inventory `5e88940e1479639824c5411251a66dae8bfbfa9b`; audit `6b36bf3dee26c233638bd8fcab3ca7a842f290d6`.
- **Blobs:** index `d98404479adffa3d5dcca09528c72b33487b02fc`; API tests `3c545e069a47921aefb753293a2e4b272b4e544a`; schedule contract `9af064c4de7231d3e35b268546f79c98ca35d9de`; inventory `8cd88664b6882fc645153b13bbd03f96b30418e2`.
- **Static verification:** GitHub re-fetch confirmed source/test blobs, validator call sites, no old billing array fallbacks in the affected handlers, account identity guard and inventory totals (1442; API test count 113; schedule contract count 3).
- **Runtime:** Node tests NOT RUN. Recent GitHub Actions jobs failed before producing steps; no runtime PASS claimed. Vercel status was pending on the latest checked main documentation commit.
- **Safety:** no production DB, payment provider, Pinterest, Storage, DNS or deployment touched.
- **Next:** UA-080 local targeted and full backend runtime tests; then continue code review of remaining payment and publication failure paths.

## Working-period closeout — 2026-11-22 (AUD-409)

- **Main HEAD before closeout:** `5daa766760c8b5aa3af83c1ff286c4421128dc39`.
- **Completed:** AUD-409 strict validation for admin payment inventories and schedule account-recovery metadata; source commit `42e4546998d50944ff2ab486c0210e2d0484f3d2`, HTTP regressions `e2cc97edee60e3267f07d8975c496f32ecd48233`, schedule contract `dfc64df387d7a39f5ce4d84496c6c168a02a6f3f`, inventory `5e88940e1479639824c5411251a66dae8bfbfa9b`.
- **Documentation:** AUD-409 report, state, owner action UA-080 and documentation register published. Current document blobs: state `bc23dc1d33d69b5bc576e925a10bb4921e3e9a08`; actions `9632dd60c5ae74ee58417048b0d1383e0d357e2d`; register `b6439408ec9a21cb90d86468b6efb0f54e771a65`; audit `fbd56b3f51c2015a61f950760ae50bd2d84cb9f9`.
- **Publication verification:** re-fetched current main code/tests/inventory; strict billing/reconciliation checks present; test inventory 1442 (113 API authenticated-read declarations, 3 schedule contract declarations).
- **Actions:** latest backend/frontend/postgres jobs on code commit `5e88940e1479639824c5411251a66dae8bfbfa9b` failed before steps: runner IDs 0, steps empty; logs unavailable (`BlobNotFound`). No test command ran.
- **Vercel:** combined status pending on main docs commit `5daa766760c8b5aa3af83c1ff286c4421128dc39`; no build/deployment PASS or production deployment is claimed.
- **Runtime:** Node tests NOT RUN; all code validation in this working period is static GitHub re-fetch/source-contract inspection.
- **Safety:** no production DB, production Storage, Prodamus, Pinterest, DNS or deployment touched.
- **Next:** owner runtime acceptance UA-080/UA-076 on a local Node runner, then continue independent payment fulfillment and publication-path review. Do not retry Actions until runner allocation is restored or a working runner is available.

### 2026-11-22 — Billing subscription and email-outbox malformed reads fail closed (AUD-410)

- **Base:** `a5a1a3709f028a6a0a2d7629059a7fe647c00d18`.
- **Finding:** user/admin subscription list reads and email-outbox health converted malformed successful query envelopes/counts into empty lists or zero. Admin could miss subscriptions, dead mail or queue backlog.
- **Fix:** `backend/billing.js` uses shared `readArrayQueryResult` for subscription rows, user email join, outbox oldest/dead lists. Outbox count responses require a non-negative safe integer; malformed count/list returns 502.
- **Regressions:** malformed admin subscription list returns 502 and does not proceed to users lookup; outbox health rejects malformed count and dead-row envelopes. Inventory 1442 → 1444.
- **Commits:** implementation `63c383029b8e6ff4f3e92d54bd6167b43c745952`; API regression `b2cd1d445772cd24fbcccb84aff25ec9e5fc136d`; outbox regression `6fbcf5bfc68d8268e30e717b5d98903b4160ad19`; inventory `0223cb5eec423007fc9c6284f9c5dbd20d6b6d4c`; audit `066fba1f0872bbd3fa78c3434c429aa589c6586f`.
- **Blobs:** billing `2e3bdb5b8a593487aefea6209d0d35e3cc8e2c4e`; API tests `e901b0958bde330bd31d0446c091a448caf81fcf`; outbox tests `8caff235e2de7a1c17186f179fda0bef8bf6753a`; inventory `5cdd4c950908d5a7d7bc96cf3a8ca5d6661d36b3`.
- **Static verification:** re-fetched source/test/inventory; strict validators present; old empty/zero fallbacks absent in `backend/billing.js`; counts match (1444 total; API 114; outbox 6).
- **Runtime:** NOT RUN. GitHub Actions on latest code/tests failed before steps (runner IDs 0; no logs). Vercel pending on inventory commit; no deployment PASS claimed.
- **Safety:** no production database, provider, SMTP, Storage, Pinterest, DNS or deployment touched.
- **Next:** UA-081/UA-080 focused and full backend runtime; continue payment history/reconciliation review.

### 2026-11-22 — Retention candidate inventory validates RPC array (AUD-411)

- **Base:** AUD-410 inventory commit `0223cb5eec423007fc9c6284f9c5dbd20d6b6d4c`.
- **Finding:** `GET /admin/storage/retention-candidates` used `data || []` on `list_pin_image_retention_candidates` (SQL `RETURNS TABLE`). A malformed RPC envelope could be shown as an empty inventory.
- **Fix:** route now uses `readArrayQueryResult({ data, error })`; malformed data returns 502. Added HTTP regression requiring 502, no candidate list and no mutations. Inventory 1444 → 1445.
- **Commits:** route `f7d6ade5601db604b1eb7dfc778aa21769f2bca9`; test `1d78395fb5c0a542e3146ee2971edf0fd7d4edd6`; inventory `c8f0835a5907863af4f9481c765c4c7a16b7d499`; audit `c110f8592ecc726c1828c6e3ce7110e76e68bded`.
- **Blobs:** index `a065f4743d0a510e219c8dfcc1f86849d40ffffa`; API tests `0a5b6b01835c1edf004dd86f67232fd8d8a0a8ff`; inventory `f4c901494fee1135415b2eaaf5444119bfbf995d`.
- **Static verification:** re-fetched changed source/test/inventory; strict validator and test count confirmed. Runtime NOT RUN; no PASS claimed.
- **Safety:** no production DB, Storage cleanup, provider, Pinterest, DNS or deployment touched.
- **Next:** focused storage/admin tests and full backend runtime through UA-081/UA-080; continue read-contract review.

### 2026-11-22 — Financial reconciliation and credit history validate query arrays (AUD-412)

- **Base:** AUD-411 inventory commit `c8f0835a5907863af4f9481c765c4c7a16b7d499`.
- **Finding:** admin financial operations queue used `data || []` for primary generation/regeneration/reservation reads, task batches and matching-request reads. Credit purchase history also treated malformed data as empty. This could hide unresolved provider/refund tasks, credit reservations or customer purchases.
- **Fix:** shared `readArrayQueryResult` now validates all affected arrays; truncation flags derive only from validated rows. Credit purchase history fails closed.
- **Regressions:** financial reconciliation tests malformed envelopes at six query positions; customer credit history returns 502 before balance derivation. Inventory 1445 → 1447.
- **Commits:** financial source `0958b429a9d559ee621dea48c6360afe7b2c4251`; financial tests `78698054d968483de3006d1cfbed315854eb33a0`; credit source `d08d535056b611b38133883f4131cafed7174866`; credit HTTP test `b31b1f4acc184cd889fcb1d86550f1e7dcc44148`; inventory `19c883abb7811fc0ba7307fc99b267a5e3a73e95`; audit `f042bf92967042031f8a5c98d47bfc8660b2e473`.
- **Blobs:** financial source `a6359ee7e91bb695c5aa6fabc692bc4d93513b27`; credit source `24bca345435b20a17e8cb5f0796eca890d6f6d98`; finance tests `d44821f16951e63d653c6ab6d528d5151e42e1ff`; API tests `6f53d93ad39b9c8b4437fca20f26dd425a8063c6`; inventory `38601e89955dfd518eb9755ee8f716beac4c78d9`.
- **Static verification:** re-fetched source/test/inventory; no empty-array fallbacks remain in affected modules; 1447 declarations (finance 7, API 116).
- **Runtime:** NOT RUN; CI jobs still fail before steps. No test PASS claimed.
- **Safety:** no production DB/provider/Storage/email/Pinterest/DNS/deployment touched.
- **Next:** run UA-081/UA-080 local focused + full backend suite; continue financial read-path review.

## Working-period closeout — 2026-11-22 (AUD-410–412)

- **Main HEAD before final closeout:** `9526edcf9a3158fbafea7bbe500f844db0d6553a`.
- **Completed and published:** AUD-410 billing subscription/email-outbox strict read validation; AUD-411 retention RPC strict array validation; AUD-412 financial reconciliation and credit purchase history strict reads. All code, regression declarations, inventory and audits are on `main`.
- **Commits:** AUD-410 source `63c383029b8e6ff4f3e92d54bd6167b43c745952`, tests `b2cd1d445772cd24fbcccb84aff25ec9e5fc136d` / `6fbcf5bfc68d8268e30e717b5d98903b4160ad19`, inventory `0223cb5eec423007fc9c6284f9c5dbd20d6b6d4c`; AUD-411 route `f7d6ade5601db604b1eb7dfc778aa21769f2bca9`, test `1d78395fb5c0a542e3146ee2971edf0fd7d4edd6`, inventory `c8f0835a5907863af4f9481c765c4c7a16b7d499`; AUD-412 financial source `0958b429a9d559ee621dea48c6360afe7b2c4251`, tests `78698054d968483de3006d1cfbed315854eb33a0`, credit source `d08d535056b611b38133883f4131cafed7174866`, credit test `b31b1f4acc184cd889fcb1d86550f1e7dcc44148`, inventory `19c883abb7811fc0ba7307fc99b267a5e3a73e95`.
- **Inventory:** 1447 declarations; actual declaration counts match modified files (API authenticated reads 116; email-outbox 6; admin financial operations 7).
- **Static publication check:** re-fetched changed source/test/inventory; strict validators confirmed; no `data || []` fallbacks remain in `backend/billing.js`, `backend/adminFinancialOperations.js` or `backend/creditsBilling.js`; retention RPC route now validates its table result.
- **Runtime:** Node tests NOT RUN. Latest Actions jobs on code commit `19c883abb7811fc0ba7307fc99b267a5e3a73e95` fail with `runner_id=0`, `steps=null`; no command executed. UA-080/081 remain pending for local Node 22 focused/full suite.
- **Vercel:** latest checked main status `pending` on docs commit `9526edcf9a3158fbafea7bbe500f844db0d6553a`. PR #96 contains a Vercel author-verification blocker on commit `bc3271dcf49b9a093974f03705eeb8a04149abc8`; UA-082 requires owner account/commit identity check. No deployment Ready claimed.
- **PR #96:** remains open/unmerged. UA-079 now includes legacy URL deletion, Content-Type, checksum verification, end-to-end storage provider wiring and consent timestamp fallback. `PIN_IMAGE_PUBLIC_BASE_URL` must not be enabled for S3/CDN until the full lifecycle adapter and migration are implemented/tested. No merge/cutover performed.
- **Documentation:** AUD-410/411/412 reports, PROJECT_STATE, USER_ACTIONS UA-081/082 and DOCUMENTATION_REGISTER updated. No production database, Prodamus, SMTP, Pinterest, Storage, DNS or deployment touched.
- **Next:** owner runtime acceptance (UA-080/081/082); continue independent review of remaining payment history/admin read contracts. Release readiness remains blocked until actual tests, Vercel deployment and external payment/storage paths are verified.

