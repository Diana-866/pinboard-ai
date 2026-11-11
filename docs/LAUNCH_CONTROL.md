# PinPosy — план доведения до публичного запуска

> **Единый реестр требований и источник процентов:** [docs/MASTER_REQUIREMENTS.md](./MASTER_REQUIREMENTS.md). Инфраструктурный этап и его отдельный процент: [docs/INFRASTRUCTURE_REQUIREMENTS.md](./INFRASTRUCTURE_REQUIREMENTS.md). Этот файл — операционный план, правила автономной работы и журнал. При расхождении продуктового scope приоритет у MASTER_REQUIREMENTS.md.

Последнее обновление: 2026-11-09  
Рабочий репозиторий: `Diana-866/pinboard-ai`  
Рабочая ветка на момент составления: `feat/persisted-boards-api`  
Последний подтверждённый HEAD на момент AUD-062: `6401be2a41932f1e4360d11cfb0897ce7b919b81`

> Этот документ — единая точка продолжения работы. При каждом сообщении пользователя «Продолжай» сначала сверяться с этим файлом и актуальным GitHub. При сообщении «Я на месте» / «Я вернулась» открыть раздел «Задания пользователя» и выдать только актуальные действия по шагам. Отмечать выполненное, не терять результаты и не просить повторять уже сделанное.

## 1. Правила совместной работы

### Когда пользователь пишет «Продолжай»
- Пользователь не у компьютера. Самостоятельно анализировать репозиторий, менять код, добавлять тесты, документацию и миграции, исправлять подтверждённые дефекты.
- Не задавать пользователю вопросы и не выдавать действия, требующие её участия.
- Перед работой сверяться с этим планом, HANDOFF.md, актуальным HEAD, открытыми PR и состоянием CI.
- Делать небольшие логические коммиты в рабочей ветке; после каждого этапа проверять изменённые файлы и фиксировать SHA/результаты.
- Не утверждать, что тесты прошли, если они реально не запускались.
- Обновлять разделы «Журнал работы» и «Задания пользователя».
- Если для продолжения необходим секрет, платёж, DNS, внешняя учётная запись, ручная проверка или действие в панели провайдера — записать его как задание, но не ждать пользователя и продолжить независимую работу.

### Когда пользователь пишет «Я на месте» / «Я вернулась»
- Прекратить автономные изменения, которые требуют внешних действий или могут повлиять на production.
- Прочитать этот файл и показать задания по приоритету.
- Выдавать действия короткими пронумерованными шагами: сайт/раздел → что нажать/ввести → ожидаемый результат → что прислать обратно.
- Не просить раскрывать пароли, API keys, webhook secrets и токены в чат. Пользователь вводит секреты только в панели соответствующего сервиса.
- После выполнения отмечать задачу как завершённую и записывать результат/дату в этот файл.

## 2. Безопасные правила релизов

1. Production-домен и текущая рабочая БД не должны становиться полигоном для экспериментов.
2. Не выполнять merge в main, production deploy, production migration, DNS-переключение, реальные списания/возвраты и реальные Pinterest-публикации без отдельного явного согласования.
3. Цель — ранняя онлайн-проверка, но через отдельную preview/staging-среду и отдельную тестовую БД/Storage. Предпочтительная схема: preview deployment → staging backend → staging PostgreSQL/Storage → тестовые внешние интеграции. Только после проверки — отдельное согласование production-релиза.
4. Не подключать staging к production Supabase, production Prodamus или реальным Pinterest-аккаунтам без осознанного разрешения и проверки изоляции.
5. Существующие домен и сервисы сохранять до успешного переноса и проверенного rollback. Не удалять старые ресурсы сразу после миграции.
6. Бюджет всех технических сервисов — не более 4000 ₽/месяц. По возможности оплата российской картой.
7. Не строить критическую инфраструктуру на Timeweb, Beget, Yandex или Selectel. Beget сейчас остаётся регистратором pinposy.com, но это не означает, что его DNS/почта должны остаться целевыми.
8. Сервис мультиязычный и рассчитан не только на пользователей из РФ.
9. Все новые миграции — forward-only; не переписывать уже применённые миграции. Перед production migration обязательны backup, проверка на staging и план отката/восстановления.

## 3. Цель ближайшей недели

Получить презентабельную, доступную по отдельному адресу preview-версию, где можно безопасно проверить:
- главную страницу и адаптивность;
- регистрацию/вход в изолированной тестовой среде;
- создание проекта и досок;
- генерацию тестового контента;
- сохранение пинов и списание тестовых кредитов;
- интерфейс тарифов и тестовый платёжный сценарий, если Prodamus предоставляет безопасный demo/test режим;
- подключение Pinterest только после проверки разрешений и тестового аккаунта.

Это целевой ориентир, не гарантия даты: блокеры GitHub/Vercel, внешние одобрения и перенос инфраструктуры могут сдвинуть сроки. Не обещать публичную регистрацию на production, пока не проверены безопасность, платежи, резервное копирование, юридические документы и восстановление.

## 4. Полный план работ

Статусы: [ ] не начато · [~] в работе · [x] подтверждено · [!] блокер/нужна проверка пользователя.

### Этап A — восстановить воспроизводимые проверки (самый высокий приоритет)
- [ ] Разобрать почему GitHub Actions jobs завершаются failure без steps/logs (runner_id=0 / BlobNotFound); проверить workflow YAML, triggers, permissions, concurrency, billing/limits и доступность runner.
- [ ] Получить реальный прогон на текущем HEAD, а не полагаться на старые CI-результаты.
- [ ] Запустить backend unit tests и интеграционные тесты.
- [ ] Запустить frontend tests/lint/typecheck/build.
- [ ] Запустить PostgreSQL integration tests на одноразовой БД, включая всю цепочку миграций.
- [ ] Исправить реальные ошибки и повторить полный набор.
- [ ] Отдельно выяснить Vercel build-rate-limit и обеспечить доступный preview build.
Критерий выхода: актуальный коммит имеет успешные backend, frontend и PostgreSQL проверки; артефакты/logs доступны.

### Этап B — аудит и стабилизация приложения
- [ ] Инвентаризировать все frontend routes/screens и API endpoints.
- [ ] Для каждого экрана определить: реальные данные, mock/demo данные или незавершённая интеграция.
- [ ] Проверить регистрацию, вход, восстановление доступа, выход, сессии и права пользователя.
- [ ] Проверить проекты, доски, пины, редактирование, удаление и сохранение после перезагрузки.
- [ ] Проверить обработку пустых состояний, ошибок API, повторных запросов, загрузки и мобильную адаптацию.
- [ ] Проверить мультиязычность, часовые пояса, валюты/форматирование.
- [ ] Удалить production-facing заглушки и явно пометить недоступные функции.
- [ ] Проверить административные endpoints и отсутствие доступа обычного пользователя.
Критерий выхода: все основные пользовательские сценарии работают с API и сохраняются в БД; нет критичных mock-функций, выдаваемых за готовые.

### Этап C — генерация, кредиты и постоянное хранилище
- [ ] Пройти полный сценарий генерации через staging GPTunnel.
- [ ] Проверить расчёт цены для каждой модели и соответствие списания фактическим задачам.
- [ ] Проверить недостаточный баланс, повторный запрос, timeout, unknown, восстановление и двойное нажатие.
- [ ] Проверить сохранение изображений в постоянное объектное хранилище; отсутствие временных ссылок в готовых пинах.
- [ ] Проверить квоты, лимиты, rate limits, максимальный размер и формат файлов.
- [ ] Проверить очистку orphaned files и корректное удаление пользовательских данных.
Критерий выхода: нет двойных списаний/генераций; результат остаётся доступным после перезапуска backend.

### Этап D — платежи и тарифы
- [ ] Перепроверить Prodamus configuration, webhook signature, idempotency и обработку повторной доставки.
- [ ] Проверить все credit packs и планы: none/analytics/start/pro/agency и соответствующие ограничения.
- [ ] Проверить истечение/продление/отмену подписки, возврат/неуспешную оплату, повтор webhook.
- [ ] Проверить отображение баланса и истории транзакций.
- [ ] Проверить email/уведомления после платежа.
- [ ] Провести demo/test payment в отдельной среде; только затем отдельно согласовать реальный минимальный платёж.
Критерий выхода: один подтверждённый платёж даёт ровно одно зачисление/изменение тарифа; повтор webhook не меняет баланс повторно.

### Этап E — Pinterest и расписание
- [ ] Получить подтверждение доступов Pinterest API / нужных scopes и проверить ограничения Standard Access.
- [ ] Настроить OAuth redirect URLs и отдельные staging credentials.
- [ ] Проверить подключение, список аккаунтов/досок, disconnect и повторное подключение.
- [ ] Проверить шифрование токенов и ключи active/previous; подготовить защищённый backup ключей.
- [ ] Проверить refresh, rotation, uncertain state и восстановление после сетевого сбоя.
- [ ] Проверить ручную публикацию на тестовом аккаунте/доске.
- [ ] Проверить schedule, отмену, retry, worker, claim fencing и журнал попыток.
- [ ] Настроить staging cron/worker и мониторинг; production cron включать только по согласованию.
Критерий выхода: тестовая публикация подтверждена Pinterest; повторные попытки не создают дубликаты; отключённый аккаунт не публикует.

### Этап F — целевая инфраструктура и перенос
- [ ] Зафиксировать целевую архитектуру в рамках лимита 4000 ₽/мес и доступности оплаты российской картой.
- [ ] Выбрать primary PostgreSQL, независимый backup target, object storage, backend hosting, DNS/CDN/WAF и почту.
- [ ] Исключить Timeweb, Beget, Yandex и Selectel из критической целевой инфраструктуры; проверить поставщиков по фактическим условиям, цене, регионам, доступности и способам оплаты.
- [ ] Поднять staging/preview окружение отдельно от production.
- [ ] Подготовить миграцию Supabase PostgreSQL: schema, users, projects, boards, pins, credits, payments, Pinterest state, auth dependencies.
- [ ] Подготовить перенос Storage и проверить целостность/доступность файлов.
- [ ] Настроить автоматические зашифрованные резервные копии в независимое хранилище.
- [ ] Выполнить тест восстановления в чистую БД и измерить RPO/RTO.
- [ ] Подготовить план переключения DNS с низким риском и rollback.
- [ ] Переносить почту отдельно, сохраняя доступ к старому ящику на переходный период.
Критерий выхода: восстановление из независимой копии доказано; приложение работает на целевой staging-инфраструктуре; стоимость подтверждена расчётом.

### Этап G — безопасность, эксплуатация и юридическая готовность
- [ ] Проверить CORS, CSRF, cookies, session expiry, OAuth state/PKCE, SSRF, file uploads и секреты.
- [ ] Проверить RLS и изоляцию данных двух разных пользователей.
- [ ] Проверить rate limiting на всех дорогих/чувствительных endpoints; при горизонтальном масштабировании использовать shared store.
- [ ] Проверить логирование без токенов, паролей, платёжных секретов и персональных данных.
- [ ] Настроить uptime/error monitoring, alerts, health checks и журнал инцидентов.
- [ ] Настроить резервные копии и периодические restore drills.
- [ ] Проверить privacy policy, terms, cookie notice (если требуется), контакты поддержки, удаление/экспорт данных и применимые требования для целевых рынков.
- [ ] Подготовить поддержку пользователей, возвраты и процедуру реагирования на инциденты.
Критерий выхода: нет открытых критических/высоких уязвимостей; backup restore и оповещения проверены.

### Этап H — preview, закрытая бета и production launch
- [ ] Создать отдельный preview/staging deployment и отдельный адрес (предпочтительно staging/preview subdomain; DNS менять только после согласования).
- [ ] Проверить HTTPS, redirects, CORS, callback URLs, cookies, env vars и доступность из целевых регионов.
- [ ] Провести внутреннее тестирование по чек-листу.
- [ ] Пригласить небольшую закрытую группу тестировщиков; включить лимиты и поддержку.
- [ ] Собрать ошибки/обратную связь и устранить блокирующие дефекты.
- [ ] Провести финальный security, payment, Pinterest, restore и load smoke test.
- [ ] Составить release checklist и rollback plan.
- [ ] Только после отдельного согласования: merge, production migrations, DNS cutover, включение платежей и worker.
Критерий 100%: пользователь может безопасно зарегистрироваться, оплатить, получить кредиты, создавать/сохранять контент и пользоваться обещанными функциями; мониторинг и восстановление проверены.

## 5. Задания пользователя

Правило: выдавать эти действия только после сообщения «Я на месте». Не отправлять пользователю действия во время автономной разработки.

### Сейчас — ожидают участия пользователя
Пока нет действий, которые нужно немедленно выполнить. Сначала автономно разбираем CI, код и готовим staging-план, чтобы не просить пользователя открывать панели без точной необходимости.

### Следующие действия — подготовить, но пока не просить
- [ ] Приготовить доступ к Vercel project settings, чтобы пользователь мог посмотреть build usage/limits и подтвердить настройки preview deployment.
- [ ] Приготовить точный список необходимых env vars без значений секретов для staging backend/frontend.
- [ ] Приготовить инструкции по созданию отдельной тестовой БД и Storage, без касания production.
- [ ] Приготовить Prodamus demo/test flow и критерии проверки webhook.
- [ ] Приготовить Pinterest developer settings checklist: app status, redirect URI, scopes, test account.
- [ ] После выбора целевых провайдеров — дать пользователю пошаговые инструкции регистрации/оплаты/создания ресурсов.
- [ ] Перед DNS/почтой/production migration — отдельное согласование и подробный rollback plan.

### Журнал действий пользователя
| Дата | Задание | Результат | Статус |
|---|---|---|---|
| — | Пока нет выданных заданий | — | — |

## 6. Журнал автономной разработки

### 2026-11-07 — исходное состояние
- Проверена ветка `feat/persisted-boards-api`, HEAD `c27b563693380d398d3d9e7e560cf7782a13025f`.
- PR #4 «Persist user boards through the API» открыт и Draft; PR #3 Prodamus atomic payments открыт и Draft. Не объединены.
- В HANDOFF.md отражены миграции/аудиты до 061, генерация, атомарные платежи, Pinterest scheduling, токенизация и rate limiting.
- Последние три CI workflow завершились failure; jobs имеют `steps=null`, runner/log evidence недоступны. Не считать тесты пройденными.
- Vercel сообщал `build-rate-limit`.
- Production, production DB, DNS и реальные платежи/публикации не изменялись.
- Следующая автономная задача: изучить причины нестарта GitHub Actions, workflow YAML и доступные job/run details; затем проверить package scripts и доступные тестовые команды, исправлять CI до достоверного результата.

### Обязательный формат каждой следующей записи
- Дата / AUD-ID.
- Что проверено.
- Что изменено (пути файлов).
- Commit SHA и актуальный HEAD.
- Какие тесты действительно запускались и их результат.
- Что осталось непроверенным.
- Новые задания пользователя (если есть).
- Production/merge/deploy статус.


### 2026-11-07 — AUD-060: CI runner diagnosis
- Проверен актуальный HEAD `930fd05e6ba17ec6ff437ef82dbc2bb0cb79ccf3` и три PR workflow runs, созданные для этого commit.
- Все три workflow (Persisted boards integration checks, Prodamus webhook tests, Atomic payment fulfillment integration) завершились failure практически сразу после создания.
- Проверены jobs через GitHub Actions API: все четыре jobs имеют `runner_id=0`, пустой `runner_name`, `steps=[]`; время от создания до завершения около 1–2 секунд. Ни одна команда workflow не подтверждена как запущенная.
- Запрос job logs возвращает `BlobNotFound`; это согласуется с отсутствием фактически назначенного runner/логов, а не с конкретной ошибкой npm/SQL-тестов.
- Workflow YAML содержит обычный `runs-on: ubuntu-latest`, корректные PR triggers для base branch PR #4 (`fix/atomic-payment-fulfillment`) и `permissions: contents: read`. Признака ошибки синтаксиса или отсутствующего job в просмотренных YAML нет.
- Combined status для HEAD показывает Vercel failure с `build-rate-limit`; это отдельный внешний лимит Vercel и не объясняет runner_id=0 в GitHub Actions.
- Причину, почему GitHub не назначает hosted runner, по доступному API установить нельзя: endpoint настроек Actions permissions недоступен через подключённый GitHub API. Возможные области проверки в интерфейсе GitHub: Actions enabled/disabled, account spending/billing limits, hosted runner availability/service incident. Это пока гипотезы, не установленная причина.
- Следующий шаг после восстановления runner: повторить workflow, получить реальные логи и исправлять уже подтверждённые ошибки тестов. Не отключать проверки и не помечать их успешными вручную.
- Production, PR merge, migrations, DNS и deployment не затрагивались.


### 2026-11-07 — AUD-061: повторная проверка Pinterest OAuth/crypto и PostgreSQL CI coverage
- Проверены `backend/pinterestTokenCrypto.js`, `backend/pinterest.js`, unit tests шифрования и публичной проекции аккаунта, migration 036/062, SQL regression `backend/test/pinterest-multi-account-oauth.integration.sql` и workflow `.github/workflows/atomic-payment-integration.yml`.
- Подтверждено: migration 062 действительно включена в последовательность disposable PostgreSQL CI (строка применения после 061); затем workflow проверяет refresh uncertainty trigger и запускает SQL integration test многоаккаунтного OAuth.
- Regression охватывает reconnect без нового refresh token, сохранение uncertainty, блокировку устаревшего refresh worker и снятие fence после получения нового refresh token.
- Ротация ключей: fallback на previous key, lazy re-encryption при чтении аккаунта; uncertain account не перешифровывается. Предыдущий ключ нельзя удалять до полной миграции всех аккаунтов.
- Публичная проекция Pinterest status/disconnect использует allowlist и исключает access_token, refresh_token, user_id; есть отдельные unit tests.
- Обнаружено ограничение покрытия: нет отдельного runtime integration test для самого `decodeAccountRecord`/optimistic re-encryption race; имеющиеся crypto unit tests проверяют fallback и re-encryption на уровне crypto helper, не DB concurrency. Это кандидат на следующий тест.
- Важно: статическая проверка кода и YAML выполнена; Node/PostgreSQL runtime не запускались успешно, поскольку GitHub Actions jobs до сих пор не получали runner. Никаких claims о зелёных тестах.
- Production/merge/deploy/production migrations не затрагивались.


### 2026-11-07 — AUD-062: regression coverage for Pinterest token lazy-re-encryption concurrency
- Закрыта часть test gap из AUD-061: вынесена функция декодирования/ленивой миграции токенов аккаунта в отдельный dependency-injected модуль `backend/pinterestAccountRecord.js`; production wrapper в `backend/pinterest.js` передаёт реальные Supabase и crypto dependencies.
- Добавлен `backend/test/pinterest-account-record.test.js` с шестью сценариями: optimistic compare-and-swap по `id + user_id + updated_at`; проигранная гонка (PostgREST не вернул строку) не запускает blind update и возвращает исходный снимок, декодируемый прежним ключом; `refresh_state='uncertain'` пропускает миграцию; ciphertext активного ключа не вызывает запись; успешный CAS возвращает и декодирует именно сохранённую строку; ошибка БД приводит к отказу, а не к молчаливому продолжению.
- Изменённые файлы: `backend/pinterest.js`, новый `backend/pinterestAccountRecord.js`, новый `backend/test/pinterest-account-record.test.js`.
- Коммиты последовательных изменений: helper `2ae1e1322d5f8c44970cf14cfd74ee309f70df3f`; тест `e83dd850f5f5b463a40efcbe42a81169590b4b93`; успешный CAS regression `6401be2a41932f1e4360d11cfb0897ce7b919b81`; production refactor `908a5f704bc2355f299e67e644ccb0aca8ef2661`.
- Временный изолированный Node.js harness, собранный по текущим helper/test source, выполнен локально в `/tmp`: 6/6 сценариев прошли. Это не запуск полного `backend/npm test`, не PostgreSQL integration и не GitHub Actions; репозиторный CI runner blocker из AUD-060 остаётся.
- Следующая проверка: проверить поведение успешного CAS (возврат обновлённой строки) и потенциальный случай, когда update error означает transient DB outage; затем повторно изучить CI runner состояние и продолжить frontend/API audit.
- Пользовательских действий пока не требуется. Production, merge, deploy, production migrations, DNS, платежи и реальные Pinterest операции не затрагивались.


- Дополнительная проверка AUD-062: выполнен временный изолированный Node.js test harness для шести сценариев из нового unit test. Результат: 6 passed, 0 failed. Harness находился в `/tmp/pinposy-aud062`, не менял рабочий репозиторий и проверял выделенный helper, а не весь backend. Полный `npm test`, PostgreSQL и CI по-прежнему не подтверждены.


- Повторная проверка CI после новых commits: workflow runs `42376959908`, `42376959739`, `42376959704` завершились failure через ~1–2 секунды; у всех jobs `runner_id=0`, пустой `runner_name`, `steps=[]`. Это подтверждает, что полный backend/frontend/PostgreSQL CI по-прежнему даже не стартует; причина не установлена. Вручную rerun не делался, чтобы не тратить попытки без устранения runner blocker.


### 2026-11-07 — AUD-063: boards API/frontend persistence and misleading analytics audit
- Проверены backend routes в `backend/index.js`: создание проекта привязывает `user_id=req.userId`; чтение проекта фильтрует `id + user_id`; списки проектов фильтруются по пользователю; генерация и чтение досок сначала проверяют владельца проекта; получение доски/пинов использует owner-check через relation `boards → projects → user_id`; изменение доски/пина дополнительно ограничивает update связанным `project_id/board_id`.
- Проверен frontend `App.tsx`: список досок загружается через `GET /boards`; создание доски использует принадлежащий текущему пользователю проект (создаёт проект, если его ещё нет), затем `POST /boards`; новый элемент в state получает ID из ответа БД. Это подтверждает реальную persistence path в source, но не доказывает live e2e.
- Найден UX-дефект: BoardsManager показывал фиктивный SEO score (в том числе 92/100 и локальное «Optimized!»), просмотры/пины и ключевые слова, хотя API не возвращает Pinterest analytics и оптимизация не сохранялась. Эти поля были демо-значениями из UI, не реальными данными.
- Исправлено: удалён fake optimize callback/state и кнопка; убраны неподтверждённые SEO/keyword/weekly target/analytics widgets; созданным доскам задаются нейтральные нулевые значения; добавлено пустое состояние. Доски отображаются без выдуманных метрик.
- Изменены файлы: `frontend/src/components/boards/BoardsManager.tsx`, `frontend/src/App.tsx`.
- Проверка source-level assertions: owner-scoped persistence calls присутствуют; fake optimize prop/callback, SEO badge и mock keywords отсутствуют; empty state присутствует. Это статическая проверка, не TypeScript build.
- Frontend scripts доступны: `npm run lint` (tsc --noEmit), `npm test` (tsx --test src/utils/*.test.ts), `npm run build`; фактический запуск пока невозможен через GitHub Actions из-за runner_id=0 blocker. Локальный checkout/Node runtime в этом рабочем контексте недоступен.
- Не проверено: runtime RLS в Supabase, чужой project/board/pin ID через API, race conditions при удалении/переносе, browser E2E и production persistence.
- Production, DB, merge, deployment и реальные Pinterest API не затрагивались.


### 2026-11-07 — AUD-064: безопасный повтор генерации после окончательной ошибки
- Прослежен frontend → backend generation flow: `PinGenerator` сохраняет fingerprint/idempotency key в sessionStorage; backend `begin_pin_generation_request` возвращает отдельные состояния completed/processing/unknown/failed. Состояние `unknown` намеренно блокирует повторную отправку, поскольку provider мог уже выполнить платную задачу; состояние `failed` означает окончательный исход и допускает новую попытку с новым ключом.
- Найден UX-дефект: после окончательного `generation_request_failed` frontend сохранял старый ключ. Повторное нажатие отправляло тот же ключ и сервер снова возвращал 409; пользователь не мог начать новую попытку без изменения параметров запроса.
- Исправлено: добавлен `frontend/src/utils/generationRetry.ts` — классификатор только явного кода `generation_request_failed`. `PinGenerator.tsx` при таком ответе создаёт и сохраняет новый idempotency key. Для `generation_in_progress` и `generation_outcome_unknown` ключ сохраняется, чтобы не создать дублирующую платную генерацию.
- Добавлен `frontend/src/utils/generationRetry.test.ts` с 4 тестами: окончательная ошибка, неизвестный исход, выполняющийся запрос, посторонние/некорректные ошибки.
- Файлы: `frontend/src/components/pins/PinGenerator.tsx`, `frontend/src/utils/generationRetry.ts`, `frontend/src/utils/generationRetry.test.ts`.
- Проверка: статически сопоставлена логика backend state machine и ApiError.data. Node/tsx, полный frontend test suite, typecheck и build не запускались; GitHub Actions runner blocker AUD-060 не устранён. Новый unit test добавлен, но НЕ считается выполненным.
- Отдельно подтверждено: generation reservation держит кредиты для in-flight/unknown задач; окончательный failed переводит reservation в released, unknown сохраняет reservation. Не менять это поведение без provider reconciliation.
- Production, DB, PR merge, deploy, платежи и Pinterest публикации не затрагивались.

**Status:** AUD-064 / SAFE_DEFINITIVE_RETRY_KEY_ROTATION / UNKNOWN_OUTCOME_KEY_PRESERVED / TEST_ADDED_RUNTIME_UNVERIFIED.


### 2026-11-07 — AUD-065: persistence of edited pin aspect ratio
- В `PinGenerator.tsx` найдено расхождение: выбор формата пина (2:3 / 9:16 / 4:5 / 3:4 / 1:1) менял только React state. После перезагрузки интерфейс возвращал сохранённый `aspect_ratio` из БД, поэтому выбор пользователя терялся.
- Исправлено: смена формата теперь отправляет owner-scoped `PATCH /pins/:id` с `aspect_ratio`; интерфейс обновляет локальное состояние только после успешного ответа. На время сохранения переключатели блокируются, чтобы не допустить конкурирующих быстрых запросов. При ошибке показывается сообщение, локальное значение не меняется.
- Backend PATCH route расширен поддержкой `aspect_ratio` и принимает только общий allowlist `2:3, 9:16, 4:5, 3:4, 1:1`. Проверка владельца `getPinWithOwnerCheck` выполняется до обновления; SQL update дополнительно фильтруется по pin id и board id.
- Подтверждено статически: `pins.aspect_ratio` — текстовое поле в baseline schema; значения совместимы с UI и генератором. Существующие PATCH title/description сохранены.
- Файлы: `frontend/src/components/pins/PinGenerator.tsx`, `backend/index.js`.
- Выполнены source-level assertions: allowlist, валидация, owner-check-before-update, API call, disabled while saving и update state by pin ID. Runtime API tests, TypeScript check, frontend build и PostgreSQL tests не запускались из-за GitHub Actions jobs без runner/steps.
- Production, база данных, deployment и PR merge не затрагивались.

**Status:** AUD-065 / ASPECT_RATIO_UPDATE_PERSISTED / OWNER_SCOPED / RUNTIME_UNVERIFIED.


### 2026-11-07 — AUD-066: serialize pin edits before scheduling
- Найден race condition в генераторе: выбор заголовка запускал PATCH без ожидания и сразу менял UI; описание сохранялось только при blur без отслеживания незавершённого запроса. Пользователь мог сразу нажать планирование, и API расписания снимал snapshot пина до завершения последнего PATCH.
- Исправлено в `frontend/src/components/pins/PinGenerator.tsx`: PATCH-операции одного пина сериализуются; заголовок обновляет локальное состояние только после успешного ответа; описание отправляет фактическое значение из textarea на blur; перед созданием расписания ожидается последняя незавершённая запись для текущего пина. Если сохранение завершилось ошибкой, планирование прекращается, чтобы не зафиксировать устаревший snapshot.
- Это не меняет backend API или production data. Проверка пока source-level; TypeScript, browser E2E и реальный API flow не запускались из-за известного GitHub Actions runner blocker.
- Не проверено: сохранение при закрытии вкладки/потере сети, восстановление редактора после полного reload, а также конкурентные изменения из нескольких вкладок.

**Status:** AUD-066 / PIN_EDITS_SERIALIZED / SCHEDULE_WAITS_FOR_PENDING_SAVE / RUNTIME_UNVERIFIED.


### 2026-11-07 — AUD-067: восстановление сохранённых пинов в генераторе
- Найден UX/data continuity gap: backend уже предоставлял owner-scoped `GET /boards/:id/pins`, но при повторном открытии генератора `generatedPins` начинался пустым и не восстанавливался из БД.
- Добавлена загрузка сохранённых пинов выбранной доски при открытии генератора и смене доски. Восстанавливаются ID, название, описание, URL изображения и допустимый `aspect_ratio`; неподдерживаемое/пустое значение безопасно отображается как `2:3`.
- Добавлены состояние загрузки, видимая ошибка загрузки и блокировка повторной генерации, пока идёт восстановление. Запрос игнорирует поздний ответ после смены доски/unmount, чтобы старые данные не перезаписали новую доску.
- Переключение формата теперь использует ту же последовательную очередь PATCH, что и title/description, чтобы все изменения одного пина выполнялись по порядку.
- Изменён только `frontend/src/components/pins/PinGenerator.tsx`; backend уже имел нужный endpoint. Проверки — статические source assertions; TypeScript/build/browser/API/Postgres не запускались. Production и БД не затрагивались.

**Status:** AUD-067 / SAVED_PINS_RESTORED_ON_BOARD_SELECT / RUNTIME_UNVERIFIED.


### 2026-11-07 — AUD-068: generation concurrency test aligned with credit reservations
- Проверены текущие generation lifecycle migrations 044/045/046/054, backend generation route, GPTunnel adapter, SQL reservation regression и concurrency shell test.
- Найден тестовый дефект: `backend/test/generation-concurrency.sh` проверял конкурентное завершение и гонку failure/completion, вызывая `complete_pin_generation_request` без предварительного `reserve_pin_generation_credits`. После миграции 054 RPC completion закономерно отклоняет такой вызов, поскольку для списания требуется активная резервация. Это делало concurrency test устаревшим относительно текущего контракта.
- Исправлено: тест создаёт резервацию на 5 кредитов сразу после создания основного запроса и отдельно для race-запроса. Остальные сценарии (stale claim fencing, duplicate completion, terminal race) не менялись.
- Статическая проверка: оба completion-сценария теперь имеют соответствующий reservation call; фактический PostgreSQL concurrency script и CI не запускались из-за ранее зафиксированного runner issue. Не утверждать, что runtime test прошёл.
- В production коде/БД ничего не менялось. PR #4 остаётся Draft; merge/deploy не выполнялись.

**Status:** AUD-068 / GENERATION_CONCURRENCY_TEST_CONTRACT_FIXED / RUNTIME_UNVERIFIED.


### 2026-11-07 — AUD-069: align reservation rounding with per-image settlement
- Аудит выявил расхождение: резерв рассчитывался как `ceil(unit_price × count × markup)`, а фактическая сумма списания складывается из `ceil(actual_image_price × markup)` отдельно для каждого изображения. При дробных значениях округление на весь пакет может дать меньшую сумму, чем сумма индивидуальных округлений.
- Добавлен `backend/generationPricing.js` с чистой функцией `calculateGenerationReservation`: проверяет входные данные и рассчитывает резерв как `ceil(configured_unit_price × markup) × count`, согласованно с моделью списания поштучно.
- `backend/index.js` использует helper перед вызовом GPTunnel; добавлен `backend/test/generation-pricing.test.js` (4 теста: стандартные цены, дробная цена, одиночная/максимальная партия, невалидные параметры).
- Важное ограничение: helper устраняет ошибку агрегатного округления, но не гарантирует защиту от повышения фактической цены GPTunnel выше локального `MODEL_PRICES`. В ответах провайдера цена динамическая; требуется отдельный этап: сверить официальный каталог/единицы цены и определить безопасный price ceiling или механизм довнесения резерва до первой отправки задачи. Нельзя считать ценовую модель полностью закрытой.
- Проверки только статические по изменениям и связям импорта. Node tests, полный backend suite, PostgreSQL и CI не запускались; runtime unverified.
- Production не менялся, реальных запросов GPTunnel не отправляли, PR #4 не мержили.

**Status:** AUD-069 / PER_IMAGE_ROUNDING_FIXED / PROVIDER_PRICE_CEILING_OPEN / RUNTIME_UNVERIFIED.


### 2026-11-07 — AUD-070: GPTunnel pricing contract and uncovered text-provider spend
- Повторно проверены backend/gptunnel.js, backend/pins.js, backend/boards.js, backend/analyze.js, generation route в backend/index.js и SQL migration 054.
- Официальная документация GPTunnel подтверждает:
  - GET /api/v2/media/models?type=IMAGE возвращает доступные модели и ставки; единица price_unit обязательна для правильной интерпретации ставки. Сама ставка не всегда равна итоговой цене.
  - POST /api/v2/media/price рассчитывает точную цену конкретной media-задачи до запуска и без списания; price — сумма в RUB с учётом скидок и тем же расчётом, что при фактическом запуске. Для некоторых моделей есть оговорки по входным метрикам.
  - GET /v1/models возвращает ставки LLM, а успешный /v1/chat/completions возвращает usage.total_cost вместе с токенами и стоимостью input/output.
- Hardcoded MODEL_PRICES нельзя считать источником истины. Перед media submission можно получать котировку по точному model/prompt/params/inputs; после выполнения сверять фактическую цену с quote. Документация: https://docs.gptunnel.ru/creative-lab/price/, https://docs.gptunnel.ru/creative-lab/models/, https://docs.gptunnel.ru/api/models/, https://docs.gptunnel.ru/api/chat-completions/.
- Обнаружен неучтённый расход: generateText() использует платный gpt-4o и выбрасывает usage.total_cost, возвращая только строку. Вызовы: backend/pins.js (план перед изображениями; расход не включён в reservation/settlement), backend/boards.js (POST /projects/:id/boards/generate), backend/analyze.js (POST /projects/:id/analyze).
- Migration 054 не позволяет изменить сумму существующего резерва: повтор с другой суммой завершается generation reservation amount mismatch. Completion отклоняет charge выше активного резерва. Нельзя просто прибавить текстовую стоимость к финальному списанию без предварительного безопасного увеличения/переоформления резерва и обновления SQL lifecycle.
- Следующий этап: единый billable-operation ledger/резервирование для LLM и media; ограничить input/output tokens и оценивать/резервировать верхнюю границу до текстового вызова; сохранять provider usage/cost в идемпотентном журнале; списывать согласованную сумму атомарно. Для media использовать /media/price до отправки и блокировать submission при недоступной/невалидной котировке; при расхождении quote/final price не повторять provider call, а фиксировать инцидент и безопасно обрабатывать уже выполненную задачу. Пользовательскую кредитную политику определить до изменения тарифов.
- Код/миграции в AUD-070 намеренно не менялись: текущая схема не поддерживает безопасное довнесение резерва, а менять клиентское списание без согласованного правила рискованно. Production не менялся; provider API с ключом не вызывался; runtime/DB/CI не запускались.
**Status:** AUD-070 / OFFICIAL_QUOTE_ENDPOINT_CONFIRMED / LLM_USAGE_COST_AVAILABLE / TEXT_SPEND_UNACCOUNTED_IN_THREE_FLOWS / RESERVATION_RESIZE_NOT_SUPPORTED / IMPLEMENTATION_DESIGN_REQUIRED / RUNTIME_UNVERIFIED.


### 2026-11-07 — AUD-071: GPTunnel billing adapter groundwork (not wired to user flows)
- Добавлены в backend/gptunnel.js безопасные низкоуровневые адаптеры: quoteImageTask() вызывает POST /api/v2/media/price с теми же model/prompt/params.aspect_ratio; normalizeMediaQuote() принимает только code=0, currency=RUB и конечную неотрицательную числовую цену; дополнительно сверяет возвращённую модель с запрошенной и отклоняет котировку, если aspect_ratio проигнорирован провайдером.
- Добавлена generateTextWithUsage(): возвращает текст, model/requestId и usage (prompt/completion/total tokens, costs, totalCost); при отсутствии корректного usage.total_cost по умолчанию выбрасывает GPTUNNEL_USAGE_COST_MISSING. Поддержан maxTokens для будущего ограничения выходных токенов.
- Сохранена обратная совместимость generateText(): она использует общий adapter, но не требует usage.total_cost, поскольку существующие три caller-а пока не подключены к новому reservation/ledger. Это сознательный переходный режим, а не завершённое billable accounting.
- Добавлен backend/test/gptunnel-pricing.test.js: проверка тела quote запроса и точного результата; отказы на неправильную валюту/код/отсутствующую/нечисловую/отрицательную цену; сохранение usage и request id; fail-closed при отсутствии total_cost в строгом режиме; legacy compatibility при отсутствии usage.
- Критически важно: quoteImageTask и generateTextWithUsage пока не вызываются из generatePins/boards/analyze/index.js. Нельзя считать provider costs учтёнными; это только adapter groundwork. Также reservation 054 остаётся неизменным: одноразовый фиксированный amount, без атомарного увеличения и без отдельного ledger для text operations.
- Следующий шаг: спроектировать миграцию для атомарного reserve-adjust operation, отдельного идемпотентного journal provider charges (media quote/final price и LLM request_id/usage), лимитов токенов, release/settlement при definitive/unknown outcomes и общей блокировки списаний. Не менять пользовательские цены/credits mapping без явной продуктовой политики. Важно не делать повторный billable provider call при неопределённом результате.
- Runtime tests/Node suite/CI/PostgreSQL не запускались: GitHub Actions runner issue остаётся. Проверены только содержимое файлов, экспорты и связность тестовых сценариев статически. Provider API не вызывался, production/DB не менялись, PR #4 не мержен.
**Status:** AUD-071 / MEDIA_QUOTE_ADAPTER_ADDED / LLM_USAGE_ADAPTER_ADDED / NOT_WIRED / TESTS_ADDED_RUNTIME_UNVERIFIED / RESERVATION_LEDGER_DESIGN_OPEN.


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


### 2026-11-07 — AUD-073 implementation: persist provider terminal outcomes (migration 063)
- Добавлена миграция `db/migrations/063_pin_regeneration_provider_outcomes.sql`: provider_status, provider_refunded, provider_error_code/title, provider_reconciled_at и claim-token-fenced RPC `record_pin_regeneration_provider_outcome`.
- RPC сохраняет provider terminal facts отдельно от пользовательского списания. Идентичный replay идемпотентен; конфликтующий replay, другой task ID или stale claim отклоняются. `refunded=false` + цена — reconciled platform expense; отсутствующий refund остаётся NULL и reconciliation timestamp остаётся NULL.
- Маршрут `POST /pins/:id/regenerate` записывает done outcome до rehosting; failed outcome записывается до перехода в failed. Если сохранить provider failure не удалось, request остаётся unknown. Recovery через уже сохранённый task ID использует тот же adapter metadata.
- Добавлен disposable PostgreSQL integration script `backend/test/pin-regeneration-provider-outcome.sh`: success, refunded=false, missing refund, identical/conflicting replay, stale claim.
- **Блокер перед deploy:** миграция 063 не применена; integration script, Node suite, PostgreSQL и CI не запускались. Backend code нельзя выкатывать до применения миграции на тестовой БД и успешного выполнения SQL integration test.
- Не изменялись user credit amount, tariff, balances, production DB, GPTunnel credentials, deploy, DNS, Prodamus, Pinterest или merge PR.

**Status:** AUD-073 / PROVIDER_OUTCOME_JOURNAL_ADDED / ROUTE_WIRED / SQL_RUNTIME_UNVERIFIED / DO_NOT_DEPLOY_BEFORE_MIGRATION_TEST.


### 2026-11-07 — AUD-074: multi-pin provider outcome journal (migration 064)
- Проверен основной multi-pin generation path: GPTunnel failed-task metadata терялся в `pins.js`; SQL journal сохранял только внутренний error code. Успешные provider prices/result URLs сохранялись, но не имели отдельного terminal reconciliation marker.
- Добавлена миграция `db/migrations/064_pin_generation_provider_outcomes.sql`: поля provider_outcome_status/refunded/error code/title/reconciled_at и claim-fenced RPC `record_pin_generation_provider_outcome`. Lock order parent request → task соответствует migration 046. Identical replay идемпотентен; conflicting facts и stale claims отклоняются.
- `backend/pins.js` и `backend/index.js` теперь сохраняют успешный outcome до rehosting и failed outcome с gross price/refund/error metadata. Если provider failure не имеет task ID, он остаётся unknown. Recovery snapshot включает outcome fields.
- Добавлен `backend/test/pin-generation-provider-outcome.sh`: success, refunded true/false, missing refund, replay conflict, stale claim, отсутствие user-credit settlement.
- **Блокер перед deploy:** migration 064 не применена; Bash/SQL/Node/CI tests не запускались. Сначала disposable PostgreSQL и интеграционный сценарий, только затем staging deployment.
- LLM text usage accounting и exact GPTunnel media quotes до task submission всё ещё не реализованы. Не изменялись user credit pricing, balances, production DB, deploy, payments, DNS, Pinterest или PR merge.

**Status:** AUD-074 / MULTI_PIN_PROVIDER_OUTCOME_JOURNAL_ADDED / ROUTE_WIRED / SQL_RUNTIME_UNVERIFIED / DO_NOT_DEPLOY_BEFORE_MIGRATION_TEST.


### 2026-11-07 — AUD-075: exact quote and reservation lifecycle
- Проверен порядок основного route: reserve по локальному MODEL_PRICES → платный gpt-4o plan → persist plan → image task submit → фактическая цена → settlement. GPTunnel text usage сейчас не сохраняется.
- Exact image quote можно запросить только после появления task prompt/ratio, но reservation создаётся раньше. `reserve_pin_generation_credits` запрещает повтор с другой суммой, а `complete_pin_generation_request` отклоняет charge выше reservation. Поэтому прямое подключение quote без state-machine/atomic resize небезопасно.
- Добавлен чистый helper `calculateQuotedGenerationPricing` в `backend/generationPricing.js`: считает user credits по текущей формуле отдельно на каждый pin и сохраняет отдельный totalProviderCostRub. Добавлены тесты в `backend/test/generation-pricing.test.js`.
- Создан `docs/audits/AUD-075-exact-quote-and-reservation-lifecycle.md` с последовательностью безопасной интеграции: billable operation journal, persisted plan, exact quote, atomic reservation resize, затем submit.
- Тесты helper не запускались. SQL/Node/Bash/CI не запускались. Production не затронут.
- Следующая задача: спроектировать миграцию атомарного resize резервирования и append-only provider operation journal; не подключать котировку к live flow до split plan/submit и recovery.

**Status:** AUD-075 / QUOTED_PRICING_HELPER_ADDED / FLOW_AUDITED / NO_ROUTE_WIRING / NOT_DEPLOYABLE_AS_FULL_QUOTE_BILLING.


### 2026-11-07 — AUD-075 follow-up: atomic reservation resize groundwork
- Добавлена миграция `db/migrations/065_resize_pin_generation_credit_reservation.sql` с RPC `resize_pin_generation_credit_reservation`: claim-token fence, processing-only, активный reservation only, lock order user → request → reservation; проверяет остальные активные резервы.
- Увеличение резерва отклоняется атомарно при недостаточном доступном балансе; уменьшение допускается. Ошибка не должна менять старую сумму.
- Добавлен `backend/test/generation-reservation-resize.sh`: увеличение при защите другого резерва, превышение баланса без мутации, уменьшение, stale claim.
- RPC пока не подключён к route; SQL test не запускался. Никаких production изменений.

### AUD-076 — single-pin regeneration must reserve credits

- Fixed in feature branch: regeneration now reserves from the shared credit pool before a new provider task is submitted; settlement consumes that reservation atomically; definitive provider failure releases it; unknown outcome keeps it held.
- Migration: `db/migrations/066_pin_regeneration_credit_reservations.sql`.
- Test added: `backend/test/pin-regeneration-credit-reservations.sh`.
- **Gate:** migration and test have not been run. Do not deploy. First apply all pending migrations to a disposable PostgreSQL database in order, run the SQL test suite, and verify unknown/failure recovery and credit balances. Only then consider staging.
- No user action is required while autonomous repository work continues. When the user returns, provide the database test instructions as a separate short action block; do not request credentials in chat.


## Уточнение владельца: публикации продолжаются после logout (2026-11-09)

Владелец подтвердил критическое продуктовое правило: если пользователь заранее запланировал публикации, они должны выйти в назначенное время независимо от того, вошёл ли он в PinPosy. Logout, закрытие браузера, истечение сессии или переход на другой PinPosy-аккаунт не должны отменять, ставить на паузу или удалять серверную очередь. Worker работает независимо от сессии и браузера, в том числе при долгосрочном расписании.

- Явная отмена/редактирование пользователем меняет соответствующее задание.
- Подтверждённое удаление PinPosy-аккаунта отменяет его будущие публикации и блокирует дальнейшую обработку этих заданий.
- Disconnect Pinterest-интеграции не стирает расписание: задания сохраняются в состоянии ожидания повторной авторизации/восстановления доступа, пока пользователь не отменит их или не удалит PinPosy-аккаунт.
- После рестарта worker должен восстановить обработку и корректно разобрать просроченные задания без потери и дубликатов.
- Очередь ручной проверки (P4) и очередь запланированных публикаций (P6) — две разные очереди; persistence требуется для обеих, но публикации дополнительно должны автономно исполняться.

Требования добавлены в MASTER_REQUIREMENTS.md (P6.14–P6.19) и INFRASTRUCTURE_REQUIREMENTS.md (I2.7–I2.10). До внедрения и тестов это требования, а не заявление о том, что production worker уже работает.

### 2026-11-12 — самообслуживание аккаунта (экспорт данных + запрос на удаление), P1.8

- **Что проверено:** `main` синхронизирован с `origin/main`; очередь ручной проверки уже серверная (113 + маршруты `/review-queue`); крупнейший незакрытый пункт с подтверждённым дизайном, но без реализации — P1.8 (удаление аккаунта и экспорт данных, AUD-114/372/389–400 содержали только дизайн).
- **Что изменено:**
  - `db/migrations/127_account_lifecycle.sql` (новый) — `users.account_status`, `users.deletion_requested_at`, таблица `account_deletion_requests`, SECURITY DEFINER RPC `request_account_deletion` с `search_path=pg_catalog,public`, доступ только `service_role`.
  - `backend/accountLifecycle.js` (новый) — экспорт по графу владения с allowlist колонок и приём запроса на удаление (bcrypt-reauth → RPC, fencing через `token_version`).
  - `backend/index.js` — маршруты `GET /account/export`, `POST /account/deletion-request`; `backend/auth.js` — запрет входа при `account_status != active`.
  - `frontend/src/utils/accountDataExport.ts` (+тест), секция «Данные и аккаунт» в `frontend/src/components/settings/SettingsView.tsx`, ключи в `i18n/types.ts` и 7 локалях.
  - Тесты: `backend/test/account-lifecycle.test.js` (7), `frontend/src/utils/accountDataExport.test.ts` (3); в `db-migration-chain.test.js` граница цепочки `123 → 127`.
- **Commit SHA:** `4ed5da52` (запушен в `origin/main`).
- **Тесты (запускались реально):** backend `node --check` + `node --test` → 538/538 pass; frontend `tsc --noEmit` → 0, `tsx --test` → 145/145 pass, `vite build` → 0; replay цепочки `001_baseline` + `010–127` на чистой PostgreSQL 18 → 127 файлов, exit 0, 32 таблицы в `public`.
- **Production:** backend `https://api.pinposy.com` жив (`/health` → `{"ok":true}`), новые маршруты отдают 401 (а не 404) — код выкачен Render'ом; фронтенд на `https://www.pinposy.com` содержит маркеры `pinposy-export-` и `account/deletion-request` — сборка Vercel выкачена.
- **Что осталось непроверенным / требует действия владельца:**
  - `127_account_lifecycle.sql` **не применена** к рабочей Supabase (миграции применяются вручную в SQL Editor; локальных DB-креденшелов нет). До применения `POST /account/deletion-request` вернёт 503; `GET /account/export` работает уже сейчас.
  - Физическая очистка данных (отдельный контролируемый этап, P6.17) не реализована.
  - Перед применением 127 к рабочей базе — резервная копия и staging-прогон (см. `docs/database.md`).
- **Новые задания пользователя:** применить `db/migrations/127_account_lifecycle.sql` в Supabase SQL Editor (после backup).
- **Production/merge/deploy статус:** merge и deploy выпущены; production SQL migration не выполнялась.

### 2026-11-12 — заморозка публикаций удаляемого аккаунта (P6.17)

- **Что проверено:** синхронизация `main` с `origin/main` (`959081e3`); самое свежее определение `claim_due_pin_schedules` — миграция 093; обнаружено, что ни один ремонтный/claim-путь worker'а не проверяет `users.account_status`, то есть расписания аккаунта в `deletion_pending` продолжали бы публиковаться. Это прямо противоречит правилу владельца (P6.17) и логически продолжает блок 127.
- **Что изменено:**
  - `db/migrations/128_account_deletion_stops_publications.sql` (новый) — единое правило «владелец существует и `users.account_status <> 'active'`» (join `users.id::text = pin_schedules.user_id`) применено в трёх SECURITY DEFINER функциях. `claim_due_pin_schedules` отменяет ещё не опубликованные расписания такого аккаунта (`status='cancelled'`) до всех прочих ремонтов и исключает аккаунт из финального claim; `renew_pin_schedule_claim` возвращает `false`, из-за чего worker прерывается на `assertClaimCurrent` перед `POST /pins`; `begin_scheduled_pinterest_publish` отклоняет резервацию до создания journal-строки. Уже `published`/`publishing`/`unknown` строки и активные аккаунты не затрагиваются; строки не удаляются.
  - `backend/test/account-deletion-publication-fence.integration.sql` (новый) — изолированный тест: due-расписание fenced-аккаунта не выдаётся worker'у и становится `cancelled`, in-flight claim не продлевается, резервация отклоняется (42501), при этом активный контрольный аккаунт по-прежнему клеймится и продлевается.
  - `.github/workflows/atomic-payment-integration.yml` — в шаг применения миграций добавлены 121–128 (ранее список обрывался на 120, из-за чего SQL integration-тесты собирались на устаревшей схеме); зарегистрирован новый тест.
  - `backend/test/db-migration-chain.test.js` — граница канонической цепочки `127 → 128`.
- **Commit SHA:** `caeb8623` (запушен в `origin/main`).
- **Тесты (запускались реально):** backend `node --test` → 538/538 pass; frontend `tsc --noEmit` → 0, `tsx --test` → 145/145 pass, `vite build` → 0; replay цепочки на чистой PostgreSQL 18 (stub + `001_baseline` + `010–128`) → 128 файлов, exit 0, 32 таблицы; новый SQL-тест → exit 0; регрессия `pinterest-stale-schedule-recovery.integration.sql` → exit 0.
- **Production:** кода backend/frontend не менялось (только SQL-миграция + CI). Миграция 128 **не применена** к рабочей Supabase; до её применения (вместе с 127) future-публикации удаляемого аккаунта продолжают обрабатываться. Прямые пользовательские сценарии не затронуты.
- **Что осталось непроверенным / требует действия владельца:**
  - Применить `127` + `128` к рабочей Supabase (после backup и staging-прогона) — иначе fence не действует в production.
  - Физическая очистка данных удалённого аккаунта — отдельный контролируемый этап, пока не реализован.
- **Новые задания пользователя:** применить `db/migrations/127_account_lifecycle.sql` и `db/migrations/128_account_deletion_stops_publications.sql` в Supabase SQL Editor в этом порядке (после backup).
- **Production/merge/deploy статус:** merge в `main` и deploy CI-конфигурации выполнены; production SQL migration не выполнялась.

### 2026-11-11 — Account deletion UX correctness
- Проверен текущий account lifecycle rollout: backend принимает запрос, аннулирует сессии и переводит аккаунт в `deletion_pending` через migration 127; migration 128 блокирует будущие Pinterest-публикации такого аккаунта.
- Обнаружено несоответствие продукта фактическому поведению: экран Settings во всех семи локалях обещал физическое удаление данных в течение 30 дней, но автоматический worker физического удаления ещё не реализован. Такой срок нельзя обещать пользователю.
- Исправлены `frontend/src/i18n/locales/{en,ru,es,pt,de,fr,zh}.ts`: подтверждение теперь честно сообщает, что запрос принят, доступ отключён, а данные ещё не удалены.
- Добавлен `frontend/src/utils/accountDeletionCopy.test.ts`, который блокирует возврат неподдержанного обещания срока удаления. Файл входит в glob существующего `npm test` frontend.
- Коммиты: локализации `2ffd030d`, `bedcc776`, `83d0b891`, `3756af09`, `85c0df1e`, `8457aeeb`, `31e4f27e`; regression test `ceac4d1f`. Текущий HEAD на момент записи: `ceac4d1f9fcd54e638b153719f45c298c247ba6a`.
- Проверка: все семь файлов повторно прочитаны с GitHub и содержат исправленный текст. Тесты Node/TypeScript фактически не запускались; для HEAD пока нет опубликованных CI checks/workflow runs.
- Vercel на предыдущем подтверждённом HEAD сообщал `build-rate-limit`; новый deployment не подтверждён. Production runtime не проверялся.
- Production DB не менялась: migrations 127 и 128 остаются ожидающими резервной копии, staging-прогона и отдельного действия владельца. Физическое удаление данных не реализовано и остаётся отдельной обязательной задачей с политикой хранения финансовых/платёжных записей.
- Следующая продуктовая задача: спроектировать и реализовать контролируемую фазу физического удаления с сохранением обязательных финансовых доказательств, безопасной обработкой Pinterest/storage/email данных и повторяемым журналом выполнения; до этого не обещать срок удаления пользователю.
