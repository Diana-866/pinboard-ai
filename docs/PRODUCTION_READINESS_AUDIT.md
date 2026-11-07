# PinPosy — аудит, исправления и план выхода в production

> **Назначение:** единый долговременный журнал технических находок и план работ от текущего PR до безопасного публичного запуска.
>
> **Последнее обновление:** 2026-11-07  
> **Репозиторий:** `Diana-866/pinboard-ai`  
> **Аудируемый PR:** #4, `feat/persisted-boards-api` → `fix/atomic-payment-fulfillment`  
> **Проверенный HEAD на момент создания документа:** `751514f9b7a9b3128b9ab367c2f0f554e4c3ee81`  
> **Состояние PR:** открыт, Draft.  
>
> Этот документ ведётся как источник истины для последующих сессий. Перед каждым новым этапом агент обязан прочитать этот файл и `HANDOFF.md`, обновить HEAD и проверить, не изменились ли указанные участки кода.

---

## 1. Правила ведения аудита

1. Не удалять закрытые находки: переводить их в `FIXED`, указывать commit и тест, подтверждающий исправление.
2. Не ставить `FIXED` только на основании изменения кода. Нужны тесты и проверка фактического результата.
3. Различать:
   - **Подтверждено** — дефект следует из проверенного кода/SQL.
   - **Условный риск** — возникает при конкретном сбое, гонке или конфигурации.
   - **Не проверено** — не хватает доступа, CI-логов, production-конфигурации или реального теста.
4. Статический аудит не равен запуску тестов. Не заявлять о прохождении CI, если GitHub не предоставил успешный run.
5. Не запускать без отдельного согласования production-миграции, реальные платежи, платные генерации, реальные публикации Pinterest и destructive-операции.
6. Не просить пользователя присылать секреты. Секреты должны вводиться только в менеджеры секретов соответствующих сервисов.
7. Перед изменениями проверить актуальные файлы и HEAD: строки и логика могли измениться.
8. Для каждой исправленной находки добавить регрессионный тест или объяснить, почему автоматический тест невозможен.
9. Все новые сессии начинают с чтения этого документа и `HANDOFF.md`.

### Статусы
- `OPEN` — требуется исправление или дополнительная проверка.
- `IN_PROGRESS` — выполняется.
- `FIXED_UNVERIFIED` — код изменён, но тест/CI не подтвердил.
- `FIXED` — исправление подтверждено тестом.
- `ACCEPTED_RISK` — осознанно оставлено с документированным основанием.
- `BLOCKED` — нужен доступ/решение/действие владельца.

### Приоритеты
- **P0** — безопасность, потеря денег/данных, неконтролируемые дубликаты, критический блокер запуска.
- **P1** — важная бизнес-логика, восстановление, некорректная публикация, блокирующие ошибки сборки.
- **P2** — UX, эксплуатационная надёжность, наблюдаемость, неполные сценарии.
- **P3** — улучшения, документация, удобство.

---

## 2. Реестр найденных проблем

### AUD-001 — Отклонённый пин можно запланировать и опубликовать
- **Приоритет:** P1
- **Статус:** FIXED_UNVERIFIED
- **Тип:** подтверждённый дефект бизнес-логики; серверные проверки добавлены.
- **Область:** Pinterest approval / schedule worker.
- **Исходное наблюдение:** endpoint планирования и `publishPin()` не проверяли approval status.
- **Исправление:** `POST /pins/:id/schedule` теперь отклоняет пины, не имеющие `status=approved`; центральная функция `publishPin()` повторно проверяет статус непосредственно перед подготовкой публикации. Это также защищает worker и direct publish path, если пин отклонили уже после создания расписания.
- **Коммиты:** `ae937c0a7d442ae2ae56b05f859c657b213faa12` (`backend/pinterest.js`); `a111f1cccffe9ead4b5db9c77d6add41c013392e` (`backend/index.js`).
- **Оставшаяся проверка:** добавить/выполнить regression tests для rejected schedule, rejected-after-schedule worker и approved publish. Проверка конкурентной смены статуса в промежутке между чтением пина и внешним POST также не реализована; при необходимости потребуется атомарная блокировка/версионирование.
- **Критерий закрытия:** тесты подтверждают отказ в обоих entry points и отсутствие HTTP POST к Pinterest для rejected pin.

### AUD-002 — Поздний успешный ответ Pinterest не восстанавливает schedule из unknown
- **Приоритет:** P1
- **Статус:** FIXED_UNVERIFIED
- **Тип:** подтверждённая проблема согласованности; добавлен транзакционный SQL fix.
- **Наблюдение:** worker A начинает публикацию; recovery worker B после таймаута переводит schedule в `unknown`; worker A позднее получает успешный ответ. Ранее completion обновлял журнал попытки, а schedule обновлялся отдельным запросом только при `status='publishing'`.
- **Исправление:** migration `047_pinterest_late_success_schedule_reconciliation.sql` расширяет `complete_pinterest_publish_v2`: в одной транзакции с фиксацией remote publication и attempt status соответствующее расписание того же owner/pin/account переводится из `publishing` или `unknown` в `published`. `cancelled` и `failed` не перезаписываются; чужой аккаунт/владелец не затрагивается.
- **Коммит:** `e819e2bffe1ec2415bd215c4edbc59ee7b37cc95`.
- **Оставшаяся проверка:** прогнать migration chain на PostgreSQL 16 и добавить SQL regression tests: late success after unknown, повторный completion, несовпадающий account/user, cancelled schedule. CI на актуальном HEAD пока не подтверждён.
- **Историческая сверка:** migration `048_reconcile_historical_pinterest_unknown_schedules.sql` однократно восстанавливает старые `unknown` только при совпадении user/pin/account и одинакового remote ID в attempt journal и publication ledger. Коммит `c8104f7daf1faaaae1701d9354945877ae75ce0d`.
- **Оставшаяся проверка:** обе миграции требуют прогона на чистой PostgreSQL 16 и upgrade-копии схемы; SQL regression tests и CI пока не подтверждены.
### AUD-003 — Ложный unknown при падении до создания журнала публикации
- **Приоритет:** P1
- **Статус:** FIXED_UNVERIFIED
- **Тип:** подтверждённая проблема восстановления; добавлено fencing-решение.
- **Наблюдение:** schedule переводится в `publishing` при claim; до создания attempt journal выполняются дополнительные проверки. При падении в этом промежутке внешний Pinterest POST ещё не отправлен, но прежний recovery ошибочно переводил задание в `unknown`.
- **Исправление:** migration `049_pinterest_schedule_claim_fencing.sql` добавляет уникальный UUID `claim_token` на каждое получение schedule. Worker перед созданием attempt journal вызывает `begin_scheduled_pinterest_publish`, который блокирует schedule row, проверяет владельца, pin/account/board, статус и точный claim token, а затем в той же транзакции создаёт/резервирует публикационный journal через существующий `begin_pinterest_publish_v2`. Если recovery первым заблокировал строку и отозвал старый token, запоздавший worker не сможет зарезервировать attempt и не дойдёт до Pinterest POST.
- **Recovery:** если stale `publishing` старше 20 минут и matching attempt journal отсутствует, token инвалидируется, запись возвращается в `scheduled` с минутной задержкой. Если matching journal уже существует, outcome остаётся `unknown` и требует reconciliation; подтверждённая публикация сначала восстанавливается в `published`. Worker также фильтрует итоговые UPDATE по claim token, чтобы старый экземпляр не перезаписал состояние нового claim. Trigger в migration 049 автоматически очищает token при любом переходе schedule из `publishing` в другое состояние.
- **Коммиты:** `85c8afe4ededc8dc1d83e019201a75eded388bfe` (migration 049); `c65e9c708385b12522b4fa801d2e9784062228b5` (worker fencing); `e9e984ebf8b9f8786904a1a99889c497f42b99b6` и `8da643dd6241e3e9b7a0a240a9c2e44a0965bc9a` (SQL regression fixtures); `8a5d58162a43cc27a6db2bc57e203bd8777f1d67` (CI migration chain); `27c5d9f8dcb47b1bc97ab8284d9d13e1aac3e592` (worker token cleanup).
- **Regression coverage:** PostgreSQL integration checks now cover crash before journal, stale-token rejection, fresh-token success, stale published reconciliation and ambiguous journal retention. CI workflow applies migrations 047–050 before SQL integration suites.
- **Оставшаяся проверка:** миграции и SQL regression suite не подтверждены. Для HEAD `630356553a0dab522ef5c2ed4df273bbcb580c6b` GitHub Actions вернули `failure` для `Persisted boards integration checks`, `Prodamus webhook tests` и `Atomic payment fulfillment integration`; jobs не содержат steps, а скачивание логов завершилось `BlobNotFound`. Это не позволяет установить, запускался ли SQL/Node код и какая причина отказа. Vercel check на том HEAD был `success`. Локального PostgreSQL runtime здесь нет. До фактического зелёного PostgreSQL CI статус остаётся `FIXED_UNVERIFIED`.

### AUD-004 — Несогласованная retry policy между путями публикации
- **Приоритет:** P1
- **Статус:** FIXED_UNVERIFIED
- **Тип:** подтверждённая неоднородность устранена единым серверным признаком безопасного повтора.
- **Наблюдение:** раньше direct publish повторно открывал любую `failed` attempt, а manual retry блокировал даже доказанно безопасные отказы; scheduled worker не повторял ни одну attempt с журналом.
- **Исправление:** migration `050_pinterest_unified_safe_retry_policy.sql` добавляет `pinterest_publish_attempts.retry_safe NOT NULL DEFAULT false`. Только `fail_pinterest_publish_v2(..., p_outcome_unknown=false)` выставляет флаг true; ambiguous outcomes переводятся в `unknown` и не повторяются. `begin_pinterest_publish_v2` разрешает повтор только для `failed AND retry_safe=true` и атомарно сбрасывает флаг при переходе в `processing`. Manual retry проверяет тот же маркер и сохраняет существующий журнал; scheduled worker читает этот флаг и использует тот же RPC. Старые failed-записи консервативно остаются заблокированными (default false).
- **Клиентское поведение:** direct publish получает явный 409 для failed attempt без retry-safe marker; неизвестные/processing/published состояния не запускают новый POST.
- **Тесты:** unit tests покрывают safe failed, unsafe failed, unknown и processing; PostgreSQL integration test проверяет отказ при unsafe legacy failed, установку маркера через failure RPC, manual retry и последующее использование того же маркера direct/scheduled begin RPC.
- **Коммиты:** `2707f5f2` (migration 050); `3da085d5` (direct publish + worker journal lookup); `7df57276` (retry policy helper); `a6ec5a85` (unit tests); `d7fbb579` (CI migration chain); `e6ec2d3d` (SQL integration coverage); `de5f66e0` (scheduler documentation).
- **Оставшаяся проверка:** migration 050 и SQL/Node tests ещё не подтверждены фактическим PostgreSQL 16 прогоном. Workflow `Atomic payment fulfillment integration` на HEAD `6c0dec157f71d8afeefc093e73ed34764e7f553b` завершился failure; job не вернул steps, скачивание логов дало `BlobNotFound`. На более позднем HEAD `bb6e72efd48c7d5bbaccc15221ca26ddef9b74e0` нового workflow run пока нет. Vercel check для последнего HEAD завершился failure с сообщением `build-rate-limit` (ограничение сборок провайдера, а не подтверждённая ошибка исходников). До зелёного PostgreSQL CI и успешной frontend-сборки статус остаётся `FIXED_UNVERIFIED`.

### AUD-005 — Изменение пина после планирования меняет фактически публикуемый контент
- **Приоритет:** P2
- **Статус:** FIXED_UNVERIFIED
- **Тип:** подтверждённое поведение устранено snapshot-контрактом для новых расписаний.
- **Контракт:** новое расписание фиксирует title, description, image URL и итоговую destination URL (явную ссылку или website URL проекта) в момент планирования.
- **Реализация:** migration `051_pinterest_schedule_content_snapshot.sql` добавляет nullable snapshot-поля; `POST /pins/:id/schedule` сохраняет их; worker передаёт snapshot в `publishPin()`, а календарь отображает snapshot title/image/link вместо изменённой live-версии. Проверка owner и актуального approval остаётся по исходному пину, но отправляемый Pinterest creative берётся из snapshot.
- **Совместимость:** старые расписания с NULL snapshot сохраняют прежнее live-pin поведение; восстановить их исторический контент задним числом невозможно.
- **Изображение:** storage использует уникальные пути `pins/<timestamp>-<random>.<ext>`, поэтому редактирование пина не перезаписывает файл по старому URL.
- **Тесты:** добавлены unit tests на ограничение длины полей, immutable snapshot resolution и legacy fallback; frontend mapping отображает snapshot; migration 051 включена в PostgreSQL CI chain. До успешного выполнения CI статус остаётся `FIXED_UNVERIFIED`.

### AUD-006 — Legacy schedules без Pinterest account_id могут перестать публиковаться
- **Приоритет:** P2
- **Статус:** FIXED_UNVERIFIED
- **Тип:** compatibility-риск закрыт безопасным пользовательским reconciliation flow для записей без истории публикации.
- **Реализация:** migration `052_reconcile_legacy_pinterest_schedule_accounts.sql` добавляет атомарную RPC-функцию. Новый `POST /schedule/:id/reconcile-account` принимает выбор пользователя, проверяет принадлежность аккаунта пользователю, затем проверяет сохранённую Pinterest-доску реальным GET-запросом от имени именно этого аккаунта. Только после этого RPC привязывает schedule и возвращает его в очередь.
- **Выбор аккаунта:** один активный профиль предлагается как единственный кандидат, но действие подтверждает пользователь; при нескольких профилях endpoint требует явный ID; без подключённых профилей возвращает понятную ошибку. UI календаря показывает соответствующее действие только для failed schedule без account ID.
- **Защитные условия SQL:** разрешены только состояния scheduled/failed; требуется сохранённая доска и принадлежащий пользователю одобренный pin; account должен быть активен и иметь token; любая существующая attempt/publication history для pin блокирует reconciliation; дублирующее активное расписание в том же account также блокирует операцию. Unknown/publishing/published не перепривязываются.
- **Тесты:** добавлены unit tests на один/несколько/ноль аккаунтов и недопустимый выбор; PostgreSQL integration cases проверяют успешную привязку при отсутствии журнала и отказ при legacy attempt history. Migration 052 включена в CI chain.
- **Ограничение:** проверка доступности доски выполняется backend API runtime; SQL integration test покрывает транзакционные guards, но не имитирует Pinterest API. Статус `FIXED_UNVERIFIED` до успешного CI.

### AUD-007 — UI показывал настройки автопубликации без серверной синхронизации
- **Приоритет:** P2
- **Статус:** FIXED_UNVERIFIED
- **Тип:** устранено ложное обещание автоматизации; серверная автоматическая генерация не заявляется.
- **Решение:** не реализовывать фоновую генерацию без отдельной очереди/экономической модели и серверных настроек. Удалены checkbox ночной автогенерации, время запуска, быстрые пресеты времени и callback, который менял только React state. Диапазоны min/max переименованы в ориентиры ручного планирования и остаются browser-local в `localStorage`.
- **Интерфейс:** описание календаря и названия/пояснения диапазонов обновлены на всех семи языках. Текст прямо указывает, что значения локальны и не запускают автоматическую генерацию или публикацию. Часовой пояс оставлен как локальная настройка отображения календаря и ввода времени.
- **Worker:** по-прежнему выполняет только уже созданные пользователем расписания; диапазоны min/max и browser-local preferences не читаются и не влияют на него.
- **Тесты/проверка:** исходники календаря, App и Dashboard проверены на отсутствие autoTime/nightlyAuto/onUpdateAccountAutoTime; проверены новые локализованные тексты. TypeScript build не подтверждён CI, поэтому статус `FIXED_UNVERIFIED`.

### AUD-008 — TypeScript ошибка в календаре: useEffect не импортирован
- **Приоритет:** P1
- **Статус:** FIXED_UNVERIFIED
- **Тип:** подтверждённая ошибка статической проверки по исходнику; исправление внесено.
- **Область:** `frontend/src/components/calendar/PublishingCalendar.tsx`.
- **Наблюдение:** компонент использует `useEffect()`, но импорт React hooks не содержит useEffect; lint script запускает `tsc --noEmit`.
- **Исправление:** добавлен `useEffect` в import из React.
- **Коммит:** `d15aac42d096057efd2bb313fca934b9ce2171a6`.
- **Проверка:** исходник повторно прочитан; import присутствует. Typecheck пока не подтверждён: соответствующий GitHub Actions job завершился без steps/logs.

### AUD-009 — Pinterest remote pin ID теряется в frontend mapping
- **Приоритет:** P2
- **Статус:** OPEN
- **Тип:** подтверждённый UX/data mapping gap.
- **Область:** `frontend/src/App.tsx`, calendar.
- **Наблюдение:** backend сохраняет `pinterest_pin_id`, но mapping расписания не передаёт его в UI-модель.
- **Риск:** календарь не может дать пользователю прямой переход к опубликованному пину.
- **Исправить:** прокинуть ID и построить безопасную ссылку на опубликованный объект, если формат/доступность URL подтверждены.
- **Тесты:** опубликованный schedule показывает ссылку; отсутствующий remote ID не создаёт ложную ссылку.

### AUD-010 — Кнопка Retry в UI может быть доступна при серверном запрете повторной попытки
- **Приоритет:** P2
- **Статус:** OPEN
- **Тип:** подтверждённое расхождение UI/API.
- **Наблюдение:** UI показывает retry для failed schedule, но backend/RPC может блокировать retry из-за существующего attempt journal.
- **Исправить:** возвращать серверный `retryable`/reason и отображать действие только при разрешённом переходе; сервер остаётся источником истины.
- **Тесты:** UI states для retryable/non-retryable failed; API отказ не маскируется.

### AUD-011 — CI jobs завершаются до появления runner steps и логов
- **Приоритет:** P0 для release confidence
- **Статус:** BLOCKED
- **Тип:** неустановленная причина инфраструктурного сбоя.
- **Наблюдение:** три workflow (atomic payment integration, Prodamus webhook tests, persisted boards integration) завершались failure; GitHub API возвращал `runner_id=0`, пустые steps, `logs_url=null`; скачивание логов возвращало `BlobNotFound`.
- **Важно:** причина не установлена. Не утверждать, что виноваты permissions, Actions policy или YAML, пока нет доказательств.
- **Что уже проверено:** на предоставленном владельцем скриншоте GitHub Actions разрешены (`Allow all actions and reusable workflows`). Workflow token permission установлен на read repository contents/packages; это само по себе не доказывает причину падения тестовых jobs.
- **Дальше:** проверить детали новых run, GitHub service status при повторении, runner availability и настройки организации/репозитория. Не расширять permissions без конкретной необходимости.
- **Критерий закрытия:** все нужные workflows завершились success на актуальном HEAD; сохранены run links и результаты.

### AUD-012 — Замена изображения может оставлять orphan objects в Storage
- **Приоритет:** P2
- **Статус:** OPEN
- **Тип:** подтверждённый риск утечки/накопления объектов.
- **Наблюдение:** image replacement/regeneration обновляет URL, но старый объект не удаляется и не найден надёжный реестр/cleanup.
- **Риск:** лишние расходы и неуправляемый рост хранилища.
- **Исправить:** ввести безопасный object lifecycle/registry и удаление только после успешной DB-ссылки и проверки отсутствия ссылок.
- **Тесты:** замена изображения, DB failure, retry, shared object reference.

### AUD-013 — Storage upload success + DB journal failure может приводить к повторной загрузке
- **Приоритет:** P2
- **Статус:** OPEN
- **Тип:** подтверждённый условный сценарий.
- **Наблюдение:** upload может пройти, а запись storage_url в журнал — упасть. При повторе backend не видит сохранённый URL и может загрузить тот же результат ещё раз.
- **Риск:** orphan objects и лишний трафик/стоимость.
- **Исправить:** детерминированный object key/idempotent upsert, reconciliation или журнал upload intent/result.
- **Тесты:** upload success + DB write failure + retry; повтор не создаёт второй объект.

### AUD-014 — Legacy regenerate flow не имеет полноценного provider task journal/idempotency
- **Приоритет:** P1
- **Статус:** OPEN
- **Тип:** подтверждённый условный риск.
- **Область:** `POST /pins/:id/regenerate`.
- **Наблюдение:** старый flow может вызвать провайдера, а затем упасть на Storage/DB; повтор способен создать ещё одну платную генерацию.
- **Исправить:** перевести regenerate на общий journal + provider idempotency + claim fencing либо отключить legacy endpoint до переноса.
- **Тесты:** provider accepted → storage/db failure → retry; одна provider task и одно списание.

### AUD-015 — Две разные generation idempotency keys могут одновременно пройти balance preflight
- **Приоритет:** P1
- **Статус:** OPEN
- **Тип:** подтверждённый concurrency/financial risk.
- **Наблюдение:** две новые задачи с разными ключами могут одновременно пройти предварительную проверку баланса и обе обратиться к AI provider; при финальном списании одна может не пройти.
- **Риск:** сервис оплачивает генерацию, за которую пользователь не был успешно списан.
- **Исправить:** атомарное резервирование стоимости до provider call с корректным release/settlement или эквивалентная транзакционная модель.
- **Тесты:** две параллельные генерации при балансе на одну; provider calls/ledger/balance согласованы.

### AUD-016 — Генерация текстового плана может повторно тарифицироваться при сбое до записи journal
- **Приоритет:** P2
- **Статус:** OPEN
- **Тип:** подтверждённый условный риск.
- **Наблюдение:** text plan формируется до устойчивой записи журнала; если запись не удалась и пользователь начинает новую попытку с новым ключом, текстовый provider call может повториться.
- **Исправить:** сохранять intent/idempotency до первого платного provider step или документировать границу оплаты.
- **Тесты:** сбой записи перед/после text provider call.

### AUD-017 — GPTunnel result URL истекает через 48 часов
- **Приоритет:** P2
- **Статус:** OPEN
- **Тип:** подтверждённое внешнее ограничение и условный риск восстановления.
- **Наблюдение:** документация провайдера указывает срок жизни исходной result URL 48 часов; длительная недоступность Storage может сделать восстановление невозможным.
- **Исправить:** мониторить возраст queued/running/succeeded-not-stored задач; retry/backoff; алерт до истечения URL; рассмотреть надёжное раннее копирование результата.
- **Тесты:** имитация outage и приближения expiry.
- **Примечание:** TTL idempotency key провайдера отдельно не подтверждён.

### AUD-018 — Проектный analyze endpoint и board generation не имеют явной credit/idempotency защиты
- **Приоритет:** P2
- **Статус:** OPEN — требуется продуктовая спецификация.
- **Наблюдение:** `/projects/:id/analyze` ограничен rate limiter, но не обнаружена credit charge/idempotency; `/projects/:id/boards/generate` также не использует явное списание.
- **Риск:** неконтролируемые расходы или, если функции задуманы бесплатными/включёнными в тариф, непреднамеренное изменение бизнес-модели.
- **Исправить:** зафиксировать, какие операции бесплатны, включены в тариф или тарифицируются отдельно; реализовать серверные лимиты и учёт расходов.
- **Тесты:** тарифные границы, параллельные запросы, лимиты.

### AUD-019 — Неоднозначность отключения Pinterest и legacy публикаций
- **Приоритет:** P2
- **Статус:** OPEN
- **Тип:** ограничение документировано; требует UX/acceptance decision.
- **Наблюдение:** локальные credentials удаляются, но OAuth grant на стороне Pinterest отдельно не отзывается; уже отправленный внешний запрос нельзя отменить. Старые schedule без account_id могут потребовать ручного решения.
- **Исправить:** UI должен ясно объяснять отличие локального disconnect от revoke grant; при возможности добавить официальный revoke flow; показать пользователю судьбу queued schedules.
- **Тесты:** disconnect до worker, во время внешнего запроса, несколько аккаунтов.

### AUD-020 — Нет полного набора concurrency/HTTP tests для платежных webhook
- **Приоритет:** P1
- **Статус:** OPEN
- **Тип:** пробел покрытия, а не доказанный двойной платёж.
- **Наблюдение:** SQL atomicity/ledger защищают от повторного начисления в проверенных сценариях; остаются непокрытыми параллельные webhook, ambiguous DB response, cancel-vs-success и полный HTTP handler.
- **Исправить:** добавить HTTP-level тесты и параллельные callbacks для subscription и credit purchases.
- **Тесты:** два одновременных одинаковых webhook; timeout после commit; повтор после timeout; конфликт cancel/success; неверная сумма/currency/signature.

### AUD-021 — Email outbox допускает повторную отправку при неопределённом SMTP результате
- **Приоритет:** P2
- **Статус:** OPEN
- **Тип:** известное at-least-once поведение.
- **Наблюдение:** SMTP может принять письмо, но DB mark-as-sent может упасть; повтор обработки отправит письмо повторно.
- **Исправить:** определить приемлемость at-least-once; добавить provider message id/reconciliation и/или идемпотентный delivery adapter, если доступен.
- **Тесты:** SMTP accepted + DB update failure.

### AUD-022 — Bucket configuration и лимиты upload/rehost могут расходиться
- **Приоритет:** P2
- **Статус:** OPEN
- **Тип:** условный конфигурационный риск.
- **Наблюдение:** backend rehost допускает до 8 MB, а конфигурация bucket ранее проверялась на 5 MB; runtime config validation не охватывает все политики bucket.
- **Исправить:** единый источник лимитов; проверка реальной конфигурации bucket; ясные ошибки на frontend.
- **Тесты:** граничные размеры, MIME, signature, storage policy mismatch.

### AUD-023 — Не проверены гонки редактирования/удаления пина с публикацией
- **Приоритет:** P2
- **Статус:** OPEN
- **Тип:** непокрытый concurrency сценарий.
- **Наблюдение:** schedule pin FK cascade; attempt journal сохраняется отдельно. Не подтверждён тест изменения/удаления пина между чтением worker и внешним POST.
- **Исправить:** определить допустимое поведение; согласовать locking/snapshot/soft delete.
- **Тесты:** edit/delete во время claim, перед POST и после POST.

### AUD-024 — Pinterest multi-account: не хватает нескольких регрессионных сценариев
- **Приоритет:** P2
- **Статус:** OPEN
- **Тип:** пробел покрытия.
- **Уже покрыто по статическому анализу/имеющимся SQL tests:** разные аккаунты изолированы; disconnect одного не должен затрагивать другой; FK защищают историю.
- **Добавить тесты:** reconnect того же external Pinterest ID сохраняет internal account ID; параллельные OAuth callbacks; legacy rows без account_id; восстановление старых schedule.
- **Не заявлять дефект из-за отсутствия тестов.**

### AUD-025 — Cron и production миграции для Pinterest worker не подтверждены
- **Приоритет:** P0 для функции автопубликации
- **Статус:** BLOCKED / проверить production
- **Тип:** production readiness blocker, основанный на документации, текущее состояние инфраструктуры не проверено.
- **Наблюдение:** `docs/pinterest/scheduler-setup.md` сообщает, что внешний cron не настроен, а миграции 015–017 не применены к рабочей БД. Production environment напрямую не проверялся.
- **Риск:** расписание сохраняется, но автоматически не исполняется.
- **Действия:** проверить актуальное состояние deployment/DB; настроить cron только после тестов и безопасного применения миграций; проверить endpoint с тестовым аккаунтом и отдельной доской.
- **Критерий закрытия:** cron active, heartbeat/last-run наблюдаем, schedule test проходит end-to-end, ошибки/unknown видны оператору.

### AUD-026 — Production encryption key и Pinterest API access не подтверждены
- **Приоритет:** P0 перед подключением реальных пользователей
- **Статус:** BLOCKED
- **Тип:** production configuration not verified.
- **Наблюдение:** документация требует `PINTEREST_TOKEN_ENCRYPTION_KEY`, `PINPOSY_SCHEDULER_SECRET`, Pinterest OAuth credentials и соответствующий API access. Наличие ключей в хостинге не проверялось.
- **Действия:** проверить наличие переменных без раскрытия значений; задать ключи в secret manager; создать резервную копию encryption key; проверить Pinterest Standard Access и scopes.
- **Важно:** не менять ключ шифрования простой заменой, иначе старые токены не расшифруются.

### AUD-027 — Frontend/Backend/DB migration and rollback readiness not yet verified
- **Приоритет:** P0 перед публичным запуском
- **Статус:** OPEN
- **Тип:** release readiness gap.
- **Действия:** подготовить повторяемый deploy, backup/restore rehearsal, migration ledger, rollback plan, smoke tests и разделение staging/production.
- **Критерий закрытия:** восстановление из резервной копии продемонстрировано на отдельной среде; миграции применяются последовательно; rollback limitations documented.

---

## 3. Положительные результаты и уже существующие защиты

Это не означает, что вся система протестирована end-to-end. Ниже — то, что обнаружено в коде/миграциях и тестовых сценариях:

- Генерация пинов списывает кредиты в транзакции при завершении; сохранение пинов, ledger и списание связаны атомарным SQL RPC.
- Generation idempotency key и provider task journal сохраняют повторяемость задачи; migration 046 добавляет claim fencing token для защиты от устаревшего worker.
- Старая попытка генерации с неверным claim token должна быть отклонена.
- Prodamus webhook проверяет подпись, заказ, сумму и валюту; кредитный ledger защищён уникальностью покупки и транзакционным начислением.
- Subscription activation использует SQL locks/transactional update; в проверенных сценариях повторный webhook не продлевает период повторно.
- Pinterest публикация использует журнал попыток и блокирует автоматический повтор неопределённого результата, чтобы не создавать дубликаты.
- Pinterest board проверяется от имени того же аккаунта перед публикацией.
- Worker использует атомарный claim с `SKIP LOCKED`.
- Multi-account модель разделяет аккаунты и публикации; disconnect одного аккаунта не должен удалять другой.
- OAuth tokens шифруются AES-256-GCM при наличии обязательного ключа.
- SECURITY DEFINER функции имеют отдельное ужесточение search_path в миграциях.
- SSRF controls, image signature/MIME validation и отсутствие redirect-following проверялись статически; подтверждённой SSRF уязвимости не найдено.
- Не обнаружено доказательства двойного начисления кредитов или повторного продления подписки в просмотренных SQL путях. Это не заменяет конкурентные HTTP tests.

---

## 4. CI и проверка качества

На HEAD, зафиксированном выше, три GitHub Actions workflow возвращали failure до получения runner steps/logs:
- Atomic payment fulfillment integration.
- Prodamus webhook tests.
- Persisted boards integration checks.

GitHub API возвращал пустые steps, `runner_id=0`, `logs_url=null`; архив логов — `BlobNotFound`. Причина не установлена.

Владелец предоставил скриншот Actions permissions:
- `Allow all actions and reusable workflows` включено.
- `GITHUB_TOKEN` default permissions — read repository contents/packages.
- Это не даёт основания объявлять permissions причиной падения.

**Запрещено считать SQL/Node/concurrency tests пройденными только потому, что workflow YAML содержит их команды.** Нужен зелёный run с логами на актуальном HEAD.

### Минимальный quality gate
- [ ] Frontend typecheck.
- [ ] Frontend lint.
- [ ] Backend unit tests.
- [ ] PostgreSQL integration tests на PostgreSQL 16.
- [ ] Concurrency shell tests.
- [ ] Prodamus webhook HTTP tests.
- [ ] Pinterest schedule/publication tests.
- [ ] Generation provider-boundary and recovery tests.
- [ ] E2E smoke tests на staging.
- [ ] Все workflow зелёные на commit, который планируется к merge.

---

## 5. Инфраструктурная цель (сверено с предыдущим обсуждением)

Ограничения владельца:
- Общий бюджет инфраструктуры — не более **4 000 ₽/месяц**.
- Учитывать оплату российской картой.
- Не использовать **Timeweb, Beget, Yandex Cloud, Selectel**.
- Не связывать все компоненты с одним провайдером.
- Мигрировать поэтапно, не выключая работающие компоненты до проверки замены.

Ранее предложенная целевая схема (это зафиксированное предложение, а не подтверждение уже созданных аккаунтов/договоров):
| Компонент | Предложенный сервис | Статус |
|---|---|---|
| Frontend | Cloudflare Pages Free | предложено; актуальную доступность/оплату проверить |
| Backend | Amvera | предложено; проверить тариф, регион, российскую оплату |
| PostgreSQL | Amvera Managed PostgreSQL | предложено; проверить backup/restore и стоимость |
| Object storage / независимые backups | Cloud.ru Object Storage | предложено; проверить доступность/условия/стоимость |
| Домен | pinposy.com | желаемый домен из прежнего плана; проверить регистрацию/продление |
| Платежи | Prodamus | существующая интеграция/план |
| AI provider | GPTunnel | существующая интеграция; расходы считать отдельно |
| Pinterest | Pinterest API | зависит от доступа/проверки Standard Access |
| Cron / background jobs | ещё не выбран | выбрать отдельный надёжный механизм |
| Monitoring / alerting | ещё не выбран | выбрать после определения требований |
| DNS | требуется решение | не создавать single-provider dependency |

Оценки 780–980 ₽/мес из предыдущего обсуждения были предварительными, не являются подтверждёнными текущими котировками. Финальный бюджет нужно пересчитать по актуальным тарифам, лимитам, трафику, резервным копиям и фактическим расходам GPTunnel.

### Предлагаемая последовательность миграции
1. Оставить текущие Vercel/Supabase компоненты рабочими.
2. Развернуть backend на выбранном новом backend host, временно используя текущие DB/Storage.
3. Проверить auth, API, webhook, generation, logs и rollback.
4. Перенести object storage в Cloud.ru; проверить доступность изображений для Pinterest и восстановление.
5. Адаптировать DB/RPC слой и перенести PostgreSQL; сверить schema/data counts, выполнить backup/restore rehearsal.
6. Переключить frontend/API по DNS постепенно; контролировать ошибки и latency.
7. Включить cron/worker только после миграций и staging E2E.
8. Выключать старые компоненты только после периода стабильной работы и подтверждённого rollback plan.

До выполнения каждого шага нельзя считать следующий шаг разрешением на отключение старой инфраструктуры.

---

## 6. План работ до публичного запуска

### Этап A — закрыть аудит и исправить код
- [ ] Перепроверить все AUD-* на актуальном HEAD.
- [ ] Исправить P0/P1, затем P2.
- [ ] На каждую находку добавить regression test.
- [ ] Удалить/объединить legacy endpoints, если они обходят новые гарантии.
- [ ] Проверить все API на ownership/authz, тарифы, rate limits, input validation.
- [ ] Проверить privacy/terms, account deletion, data export/retention.
- [ ] Сверить UI copy с реальными функциями.

### Этап B — стабилизировать CI
- [ ] Установить причину отсутствия runner/logs.
- [ ] Добиться зелёных workflows.
- [ ] Проверить чистый install/build на lockfile.
- [ ] Проверить migration chain с чистой PostgreSQL 16.
- [ ] Добавить coverage для HTTP handlers и concurrent callbacks.

### Этап C — staging
- [ ] Отдельные staging DB/storage/keys.
- [ ] Без реальных платежей и публичных Pinterest публикаций на первом этапе.
- [ ] Smoke tests регистрации, входа, восстановления пароля, email verification.
- [ ] Проверка тарифов и доступа.
- [ ] Sandbox/test payment flow, если Prodamus предоставляет подходящий режим.
- [ ] Test generation с лимитированным бюджетом.
- [ ] Pinterest test account/board после подтверждения доступа.
- [ ] Cron/worker, retries, unknown reconciliation.
- [ ] Logs, metrics, alerts, error reporting.

### Этап D — production infrastructure
- [ ] Подтвердить актуальные тарифы/оплату выбранных провайдеров.
- [ ] Создать production secrets непосредственно в secret managers.
- [ ] Backup policy и отдельная копия encryption keys.
- [ ] Backup restore rehearsal.
- [ ] Migration plan с preflight и rollback.
- [ ] DNS/TLS, SMTP SPF/DKIM/DMARC.
- [ ] Monitoring и alerting.
- [ ] Rate limits, abuse prevention, cost ceilings.
- [ ] Проверить legal pages, privacy, terms, contact/support.

### Этап E — закрытый запуск
- [ ] Только владелец и тестовые пользователи.
- [ ] Лимиты генерации и расходов.
- [ ] Контроль платежей, ledger и webhook retries.
- [ ] Проверка Pinterest publish/reconciliation.
- [ ] Проверка удаления аккаунта и данных.
- [ ] Отслеживание ошибок и обратной связи.
- [ ] Исправить блокирующие дефекты до расширения аудитории.

### Этап F — публичный запуск
Публичный запуск разрешён только если:
- [ ] Все P0/P1 закрыты или формально приняты владельцем как риск.
- [ ] Все критические CI workflows зелёные на release commit.
- [ ] Staging E2E прошёл.
- [ ] Backup restore проверен.
- [ ] Billing/credits reconciliation подтверждён.
- [ ] Generation idempotency/recovery проверены.
- [ ] Pinterest scheduling/publishing/unknown recovery проверены либо Pinterest-функция явно выключена и не обещается пользователям.
- [ ] Monitoring/alerts и support path работают.
- [ ] Есть rollback plan и понятный release owner.

---

## 7. Что требуется от владельца

Пользователю **не нужно** присылать в чат пароли, токены, API keys, cookies, database URLs или encryption keys.

Действия владельца будут запрашиваться только когда они действительно необходимы:
- выбрать/подтвердить продуктовые решения (например, snapshot контента при планировании);
- создать/оплатить аккаунт у выбранного провайдера, если потребуется;
- добавить секреты самостоятельно в secret manager;
- подтвердить production migration/deployment и внешние платежные действия;
- проверить доступ к Pinterest Standard API, если это требует действия владельца;
- принять явное решение о публичном запуске.

Никакие production-изменения не выполняются автоматически на основании общего согласия на разработку: перед необратимыми или платными действиями требуется отдельное подтверждение конкретной операции.

---

## 8. Журнал изменений этого документа

| Дата | Изменение |
|---|---|
| 2026-11-07 | Создан единый реестр аудита по результатам статической проверки PR #4; зафиксированы находки AUD-001…AUD-027, статус CI, ограничения production readiness и предварительная инфраструктурная схема. |
| 2026-11-07 | Исправлен импорт `useEffect` в календаре (AUD-008), commit `d15aac42d096057efd2bb313fca934b9ce2171a6`; исправление ожидает успешного typecheck. На новом HEAD CI jobs снова завершились без steps и логов (BlobNotFound), причина не установлена. |
| 2026-11-07 | Добавлена серверная проверка `status=approved` при создании расписания и непосредственно в `publishPin()` (AUD-001), commits `ae937c0a7d442ae2ae56b05f859c657b213faa12` и `a111f1cccffe9ead4b5db9c77d6add41c013392e`. Статус `FIXED_UNVERIFIED`: regression tests/CI ещё не подтверждены. |
| 2026-11-07 | Migration 047 атомарно восстанавливает schedule из `unknown` при позднем подтверждённом успехе Pinterest (AUD-002), commit `e819e2bffe1ec2415bd215c4edbc59ee7b37cc95`. Ожидает PostgreSQL regression tests и CI; старые unknown-записи требуют отдельной сверки. |
| 2026-11-07 | Migration 048 сверяет исторические `unknown` с опубликованными attempt и publication ledger по одинаковому remote ID (AUD-002), commit `c8104f7daf1faaaae1701d9354945877ae75ce0d`. Выполнение SQL не подтверждено до применения миграции. |
| 2026-11-07 | AUD-003: migration 049 добавляет fenced schedule claims и безопасный requeue только при отсутствии attempt journal; worker резервирует журнал под действующим claim token, SQL integration fixtures и PostgreSQL CI migration chain обновлены. Коммиты: `85c8afe4`, `c65e9c70`, `e9e984eb`, `8a5d5816`, `8da643dd`, `27c5d9f8`. Статус `FIXED_UNVERIFIED` до фактического PostgreSQL CI. |
| 2026-11-07 | Проверка CI для HEAD `630356553a0dab522ef5c2ed4df273bbcb580c6b`: три workflow jobs завершились `failure`, но GitHub не вернул steps/logs (download `BlobNotFound`); Vercel check был `success`. Причина workflow failure не установлена, результаты не засчитываются как ошибка кода или как успешные тесты. |
| 2026-11-07 | Усилено завершение AUD-003: migration 049 теперь очищает claim token триггером при выходе из `publishing`; PostgreSQL integration test дополнительно проверяет очистку token после восстановления опубликованной записи. Коммиты `b3dfc1bb`, `80f06634`. |
| 2026-11-07 | AUD-004: migration 050 вводит единый `retry_safe` marker для direct/scheduled/manual retry; повтор существующего журнала разрешён только для подтверждённого pre-create отказа, ambiguous и исторические failed блокируются. Добавлены unit/SQL regression tests и CI migration step. Коммиты `2707f5f2`, `3da085d5`, `7df57276`, `a6ec5a85`, `d7fbb579`, `e6ec2d3d`, `de5f66e0`. Статус `FIXED_UNVERIFIED` до PostgreSQL CI. |
| 2026-11-07 | Ужесточена безопасность migration 050: пропущенный параметр `p_outcome_unknown` теперь по умолчанию трактуется как ambiguous; PostgreSQL regression test проверяет, что такой вызов переводит попытку в `unknown` и не допускает повтор. Коммиты `c886225e`, `aa0deb45`. |

**Текущее заключение:** PR #4 нельзя считать готовым к merge или публичному запуску. Документ фиксирует аудит, а не выполненные исправления. На момент создания файла код не изменялся в рамках закрытия перечисленных находок; production не менялся, миграции в рабочую БД не применялись, реальные платежи/генерации/Pinterest публикации не выполнялись.


| 2026-11-07 | AUD-005: migration 051 и backend фиксируют content snapshot при создании нового Pinterest schedule; worker публикует snapshot, legacy rows сохраняют live-pin fallback. Добавлены unit tests, CI migration step и документация. Статус FIXED_UNVERIFIED до фактического PostgreSQL CI. |

| 2026-11-07 | Дополнено AUD-005: календарь показывает сохранённые title/image/destination snapshot для новых расписаний, а не изменённую live-версию пина. |

| 2026-11-07 | AUD-006: migration 052, account-reconciliation RPC, endpoint с проверкой Pinterest board, календарный UI выбора аккаунта, unit/SQL regression tests и документация. Статус FIXED_UNVERIFIED до успешного CI. |

| 2026-11-07 | Дополнительное укрепление AUD-006: reconciliation RPC блокирует восстановление не одобренного pin; lock order account→schedule выровнен с disconnect RPC, чтобы снизить риск deadlock; конфликт уникального active schedule возвращается как контролируемый отказ. |

| 2026-11-07 | AUD-007: удалены UI-переключатель автогенерации, время запуска и локальный React callback; лимиты переименованы в локальные ориентиры ручного планирования, предупреждение локализовано на 7 языков. Автоматизация не обещается до реализации серверной очереди. Статус FIXED_UNVERIFIED до frontend CI. |
