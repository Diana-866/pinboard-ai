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
- [ ] Проверить каждую миграцию и порядок применения.
- [ ] Проверить все функции, триггеры, RLS policies, индексы и ограничения.
- [ ] Проверить соответствие SQL фактическим обращениям backend.
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
- `scripts/verify.sh` перебирает SQL-файлы; нужно проверить, не запускает ли он исторические миграции `002–008` или опасную `009`.
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
- [~] Проведены десять пакетов backend-аудита: core, auth/account lifecycle, billing/credits/Prodamus, GPTunnel/Pinterest admin recovery, Pinterest OAuth/account lifecycle, scheduler/worker, image storage lifecycle, project/board/pin/account deletion, API route map и platform primitives; отчёты `docs/backend-audit/01-core-modules.md`–`10-platform-primitives.md`. Полный backend/frontend/migration audit ещё не завершён.
- [ ] Построчно проанализировать все исходники frontend.
- [ ] Проанализировать все миграции и SQL-тесты.
- [ ] Проанализировать тесты, скрипты, workflow и конфигурации.
- [ ] Проанализировать документацию и выявить противоречия.
- [ ] Составить полный file-by-file реестр.
- [ ] Пересмотреть все открытые PR и ветки, классифицировать: принять / исправить / закрыть / отложить.
- [ ] Подготовить окончательный технический baseline и приоритеты.

### Этап 1 — воспроизводимость проверок
- [ ] Проверить Node/npm версии и scripts обоих package.json.
- [ ] Исправить verify script, если он запускает неканонические SQL.
- [!] Запуск backend unit/integration tests: GitHub Actions jobs падают до шагов выполнения; checkout regression workflow run #10 attempt 2 и последние integration runs без шагов. Исполнение тестов не подтверждено; требуется работоспособный runner.
- [ ] Запустить frontend typecheck/lint/tests/build.
- [ ] Запустить migration chain на чистой тестовой PostgreSQL.
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

**NEXT: продолжить сверку оставшихся handler branches и SQL/RPC, затем завершить file-by-file backend audit и полный migration chain. API inventory завершён: 73 прямых Express routes, dynamic admin refund routes и Pinterest module routes отражены в `docs/backend-audit/09-index-api-map.md`; helper branches/DB RPC ещё требуют полной сверки. В main устранены неограниченные коллекционные scans: `GET /projects`, `GET /boards`, `GET /projects/:id/boards`, `GET /schedule`, `GET /review-queue`, `GET /boards/:id/pins` — bounded `fetchAllPages` (500/page, 10k ceiling, HTTP 413 overflow); admin stats `users` и `credit_transactions` — 500/page, 100k ceiling, HTTP 413 overflow. Review queue reconciliation ограничена пятью параллельными lookup-запросами. Для календаря, очереди review, board pins и admin stats добавлены regression tests; runtime tests не подтверждены. Остаточные продуктовые риски: AI analysis/keywords без утверждённой тарификации/резерва кредитов; `boards/generate` без durable idempotency key; Pinterest rate limiter process-local; клиентская cursor pagination ещё не реализована. Следом сверить каждый endpoint с сервисами, SQL/RPC и тестами; затем полностью проверить frontend (mock/demo data, real API paths, build/typecheck), migration chain на disposable PostgreSQL и staging E2E. GitHub Actions runs `43899467019`/`43899467236` и `43899474201`/`43899474181` завершились failure до создания шагов; повторный запуск failed jobs также завершился без steps, logs недоступны. Node/PostgreSQL tests и frontend build НЕ подтверждены. Vercel: latest GitHub status `pending`; build result not yet available (earlier runs had `build-rate-limit`). Не помечать тесты пройденными. Удаление аккаунта закрыто feature gate и требует staging-валидации перед включением. PR #88 не объединять: checkout fix адресно перенесён в main, PR основан на старом SHA. Не запускать реальные платежи и не менять production.**

PinPosy — единый паспорт проекта и план работ

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
- [ ] Составить карту API endpoint → handler → сервис → таблицы/внешние API.
- [ ] Проверить авторизацию, ownership, валидацию, rate limits, ошибки и транзакции.
- [ ] Запустить полный актуальный backend test suite.

### База данных
- SQL находится в `db/`, включая `db/migrations/`, архив и тестовые сценарии.
- В каталоге миграций обнаружено 147 файлов; это число файлов, не утверждение о применённой схеме.
- Выявлена каноническая baseline-миграция `001_baseline.sql`; файлы `002–008` помечены как исторические, `009` требует отдельной проверки и не должен автоматически применяться.
- [ ] Проверить каждую миграцию и порядок применения.
- [ ] Проверить все функции, триггеры, RLS policies, индексы и ограничения.
- [ ] Проверить соответствие SQL фактическим обращениям backend.
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
- `scripts/verify.sh` перебирает SQL-файлы; нужно проверить, не запускает ли он исторические миграции `002–008` или опасную `009`.
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
- [~] Проведены восемь ограниченных пакетов backend-аудита: core, auth/account lifecycle, billing/credits/Prodamus, GPTunnel/Pinterest admin recovery, Pinterest OAuth/account lifecycle, scheduler/worker, image storage lifecycle и project/board/pin/account deletion; отчёты `docs/backend-audit/01-core-modules.md`–`08-project-board-pin-account-deletion.md`. Остальные модули, маршруты и тесты не проверены.
- [ ] Построчно проанализировать все исходники frontend.
- [ ] Проанализировать все миграции и SQL-тесты.
- [ ] Проанализировать тесты, скрипты, workflow и конфигурации.
- [ ] Проанализировать документацию и выявить противоречия.
- [ ] Составить полный file-by-file реестр.
- [ ] Пересмотреть все открытые PR и ветки, классифицировать: принять / исправить / закрыть / отложить.
- [ ] Подготовить окончательный технический baseline и приоритеты.

### Этап 1 — воспроизводимость проверок
- [ ] Проверить Node/npm версии и scripts обоих package.json.
- [ ] Исправить verify script, если он запускает неканонические SQL.
- [!] Запуск backend unit/integration tests: GitHub Actions jobs падают до шагов выполнения; checkout regression workflow run #10 attempt 2 и последние integration runs без шагов. Исполнение тестов не подтверждено; требуется работоспособный runner.
- [ ] Запустить frontend typecheck/lint/tests/build.
- [ ] Запустить migration chain на чистой тестовой PostgreSQL.
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

**NEXT: продолжить построчный аудит оставшихся handler-блоков `backend/index.js` и сверить API-карту с фактическими сервисами, SQL/RPC и тестами. В ходе дополнительной проверки `GET /schedule` переведён на общий bounded pager (500/page, cap 10k, HTTP 413 при overflow); добавлен route contract test, runtime test ещё не запускался. Затем проверить оставшиеся backend-модули, миграции и frontend. API-карта 73 маршрутов уже создана в `docs/backend-audit/09-index-api-map.md`, но полный построчный аудит entrypoint не закрыт. Зафиксированы продуктовые риски: AI analysis/keywords без тарификации/резерва кредитов, boards/generate без idempotency key и process-local rate limits. Project/board lists теперь читаются внутренними страницами до 10 000 строк без тихого PostgREST truncation; клиентская cursor pagination остаётся будущим улучшением. Отдельный блокер: GitHub Actions runs `43898273377` и `43898273367` завершились failure до создания job steps; Node/PostgreSQL tests не запускались; нужен работоспособный runner и реальный запуск. Vercel: последнее наблюдаемое состояние build-rate-limit. Не помечать тесты пройденными. Удаление аккаунта закрыто feature gate и требует staging-валидации перед включением. PR #88 не объединять: checkout fix адресно перенесён в main, PR основан на старом SHA. Не запускать реальные платежи и не менять production.

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
