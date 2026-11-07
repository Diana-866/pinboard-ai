# PinPosy — план доведения до публичного запуска

Последнее обновление: 2026-11-07  
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
