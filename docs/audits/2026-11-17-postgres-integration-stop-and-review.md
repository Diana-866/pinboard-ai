# PinPosy — остановка и системный разбор PostgreSQL integration gate

Дата: 2026-11-17  
Проверяемая ветка: `main`  
Commit владельца: `c92cb6d402686abbca583ecb8871e7b2f9c1fc8f`

## 1. Причина остановки

Владелец попросил остановить дальнейшую разработку и оценить, что именно делается, зачем и насколько последовательно. До этого момента рабочий поток был сосредоточен на запуске отдельного PostgreSQL SQL integration gate. В этом документе фиксируется read-only анализ текущего результата и предлагается более системный порядок дальнейшей проверки.

**Ограничение этой остановки:** никаких изменений application code, миграций, SQL integration tests, fixtures, CI workflow или БД в рамках данного разбора не выполнялось. Изменяются только документы, чтобы сохранить доказательства и выводы.

## 2. Точный результат владельца на commit c92cb6d4

Владелец сообщил:

- `git status --short` — пустой вывод до pull.
- `git pull --ff-only origin main` завершился fast-forward с `758eba5e` до `c92cb6d4`.
- `git rev-parse HEAD` и `git rev-parse origin/main` совпали: `c92cb6d402686abbca583ecb8871e7b2f9c1fc8f`.
- Node contract suite: **18 тестов, 17 PASS, 1 FAIL**. Падает тест проверки project→board и board→pin cascade foreign keys. Ожидаемое регулярное выражение содержит `\\\\s` в regex literal; оно ищет буквальную последовательность backslash+s, а не whitespace. Исходный SQL содержит обычные пробелы.
- Несмотря на неуспешный contract gate, владелец запустил guarded PostgreSQL runner. Это отклонение от записанного порядка: runner разрешено запускать только после PASS всех contract tests. Сам runner сохранил собственные safety guards.
- Runner подтвердил чистый checkout на `c92cb6d4`, listener PID 15220, data directory `X:\\PinPosy-verify-pg18`, скрытый ввод пароля и server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Disposable DB: `pinposy_sqlint_bb8532df036144f0`.
- CI legacy/upgrade fixture применился; **140 migrations 010–149** применились; обе inline assertions прошли.
- SQL integration tests **1–7 из 46** прошли.
- Тест 8/46 `account-deletion-storage-manifest.integration.sql` остановился при вызове `finalize_account_deletion(uuid,uuid)`: отсутствует колонка `users.subscription_tier`.
- Runner подтвердил cleanup: 0 оставшихся сессий, `DROP DATABASE`, сообщение `Removed disposable database pinposy_sqlint_bb8532df036144f0`.
- Тесты 9–46 не выполнялись. SQL integration gate остаётся **NOT PASSED**.

## 3. Source-level diagnosis

Проверены следующие актуальные файлы GitHub:

| Файл | Blob SHA | Что подтверждает |
|---|---|---|
| `db/migrations/001_baseline.sql` | `105a13cfba4746206191dcf2bd68d5514912f08c` | Каноническая таблица `users` содержит `subscription_tier`, `name`, `surname`, `onboarded`; baseline также определяет cascade FK boards/pins |
| `backend/test/postgres-integration-upgrade-fixture.sql` | `bf9aad94a6b4381777586a97a88f3dc6eab373a6` | Текущий standalone fixture не объявляет `subscription_tier`, `name`, `surname`, `onboarded` |
| `.github/workflows/atomic-payment-integration.yml` | `ad8d456eed5829c7aba0c8b9bfea314516b3e9d4` | CI workflow содержит отдельную inline-копию users fixture с тем же набором колонок |
| `db/migrations/138_account_deletion_finalize_tombstone.sql` | `c99463878dd828f0e7722f27777ffdb3c6e90b23` | `finalize_account_deletion` обновляет `subscription_tier`, `name`, `surname`, `onboarded`, а также другие поля |
| `backend/test/account-deletion-storage-manifest.integration.sql` | `ea271e77c8bf18986b996bee09ec99751abc73f0` | Test 8 вызывает finalization и проверяет tombstone и сохранение финансовых ledger rows |
| `backend/test/postgres-integration-runner-contract.test.js` | `9e03e2448dca977c25114185ecd12bd46408e5e7` | Cascade contract assertion имеет неверное двойное экранирование regex |

### 3.1. Ошибка SQL test 8 — schema fixture не содержит полей, которые использует production migration

Канонический baseline определяет следующие поля `users`:

- `subscription_tier`
- `name`
- `surname`
- `onboarded`

В текущем upgrade fixture их нет. Migration 138 использует все четыре в одном `UPDATE public.users`. PostgreSQL остановился на первом отсутствующем поле — `subscription_tier`. После исправления только этого поля вероятны следующие ошибки на `name`, `surname` или `onboarded`, поскольку они также отсутствуют в fixture и используются тем же UPDATE.

Это сильное свидетельство системного расхождения fixture с теми частями baseline-контракта, которые требуются account-deletion finalization. Не следует удалять эти присваивания из production migration или ослаблять проверку tombstone. Сначала нужно согласовать тестовую схему с реальным legacy schema contract.

### 3.2. Это уже повторяющийся класс ошибок, а не единичная опечатка

В предыдущих прогонах SQL integration gate последовательно выявил:

1. Отсутствие `users.is_admin` в upgrade fixture.
2. Отсутствие `boards.cover_url`.
3. Отсутствие cascade FK `boards.project_id → projects.id` и `pins.board_id → boards.id`.
4. Теперь — отсутствие `users.subscription_tier`, а также source-level видно отсутствие `name`, `surname`, `onboarded`, которые использует migration 138.

Каждый отдельный дефект исправлялся локально, но общий подход не выявил заранее все необходимые поля и связи. Поэтому повторение подобных остановок ожидаемо, пока не будет проведена системная сверка schema contract.

### 3.3. Contract test тоже содержит дефект

В файле `backend/test/postgres-integration-runner-contract.test.js` строка cascade assertion использует regex вида `/project_id\\\\s+uuid.../`. В JavaScript regex literal это означает поиск буквального `\\s`, а не пробельных символов. Правильная regex-форма — `/project_id\\s+uuid.../`.

Это не ошибка SQL fixture и не ошибка production FK; это ошибка самой проверки контракта. Из-за неё contract gate справедливо завершился FAIL.

## 4. Оценка того, что мы делаем

### Что логично и полезно

- Сначала проводить технический аудит и проверять миграции до production-переключений — правильно.
- Разделять migration replay и SQL integration tests — правильно. Ранее успешный replay baseline + migrations 010–148 не доказывает прохождение upgrade fixture + migrations 010–149 + 46 integration tests.
- Использовать отдельную disposable database и строгую проверку server identity — правильно.
- Проверять account deletion end-to-end: публикации, Storage manifest, удаление пользовательского контента, pseudonymous tombstone и сохранение финансовых записей — важно для целостности данных.
- Не исправлять ошибки путём отключения FK, удаления защитных условий или изменения production миграций без доказательств — правильно.
- Записывать owner transcripts, assistant source changes, точные SHAs, ограничения и cleanup — необходимо и соответствует требованию владельца.

### Что сейчас идёт неправильно или неэффективно

1. **Слишком реактивная диагностика fixture.** Мы исправляем поля и связи по одной после того, как SQL runtime доходит до соответствующего теста. Нужно заранее составить schema contract для fixture.
2. **Слабая защита contract suite.** Проверки фиксируют отдельные известные поля и связи, но не весь минимальный контракт, необходимый миграциям и тестам.
3. **Повторение regex-ошибок.** Тесты source contract сами требуют внимательной проверки и реального запуска до SQL runner.
4. **Нарушение gate-последовательности.** На этом запуске SQL runner был запущен после 17/18 contract tests. Runner сохранил safety guards и disposable DB cleanup, но порядок был неправильным и не должен повторяться.
5. **Смешение разработки и стабилизации тестовой инфраструктуры.** В текущем потоке мы не добавляем пользовательские функции PinPosy; мы стабилизируем тестовый стенд и миграционный gate. Это полезная подготовительная работа, но её нельзя называть завершением продуктовой разработки.
6. **Слишком раннее объявление root cause только по первой SQL ошибке.** Одно исправленное поле может открыть следующее. До следующего прогона нужно проверить все поля, FK и другие зависимости, используемые соответствующим критическим сценарием.

## 5. Рекомендуемый порядок дальнейшей работы — пока НЕ выполнять

Это план для согласования после паузы, а не разрешение автоматически менять код.

1. **Инвентаризация schema contract.** Сопоставить canonical baseline, upgrade fixture, CI inline fixture, migrations 010–149 и SQL test manifest. Для каждой таблицы, затронутой integration tests, выписать необходимые колонки, типы, nullability, defaults, FK, cascade/restrict semantics, indexes и triggers.
2. **Разделить намеренные legacy omissions и accidental omissions.** Некоторые колонки могут отсутствовать в upgrade fixture намеренно, потому что их добавляет более поздняя migration (например, token-version evolution). Нельзя просто копировать baseline целиком и случайно лишить тесты upgrade-смысла. Для каждого отличия нужна причина и migration, которая его вводит.
3. **Проверить полный account deletion path.** Для migration 138 перечислить все колонки, которые использует функция; подтвердить, какие из них должны существовать до migrations 010–149 и какие добавляются цепочкой. Проверить зависимости migration 137–144 и SQL test 8.
4. **Сделать контрактные тесты содержательными.** Добавить assertions для полного необходимого schema contract, а не только для последней обнаруженной колонки. Исправить regex и проверить его Node runtime.
5. **Уменьшить дублирование fixtures.** Рассмотреть единый SQL fixture-файл, который используют и локальный runner, и CI, либо гарантировать byte-for-byte alignment уже существующим contract test. Не менять CI semantics без проверки.
6. **Только после статической сверки** запускать Node contract suite. SQL runner запускать исключительно если contract suite полностью PASS и checkout синхронизирован.
7. **Считать gate завершённым только при** PASS всех 140 migrations 010–149, обеих inline assertions, всех 46 SQL tests и подтверждённом cleanup disposable DB.
8. После успешного gate вернуться к следующему пункту общего плана PinPosy; не путать это с завершением полного backend/frontend audit или production readiness.

## 6. Safety и ограничения

- Disposable DB `pinposy_sqlint_bb8532df036144f0` удалена runner'ом; cleanup подтверждён в owner transcript.
- Listener PID 15220 и persistent verification cluster `X:\\PinPosy-verify-pg18` не останавливались и не удалялись.
- Production / PIN_TRIAL не затрагивались.
- Секреты не запрашивались и не записывались.
- Assistant выполнял только GitHub source reads для этого анализа; Node, PowerShell, psql и PostgreSQL локально не запускал.
- Все выводы runtime ограничены предоставленным owner transcript. Assistant не может независимо подтвердить локальное состояние компьютера.
- SQL integration: **NOT PASSED**; tests 9–46 не выполнялись.

## 7. Что именно было сделано assistant в рамках этого разбора

1. Прочитан owner transcript с fast-forward sync, Node test output и полным runner output.
2. Повторно получены актуальные GitHub source versions для baseline, migrations 127/137/138, standalone fixture, CI workflow, SQL test 8, contract tests и трёх документов проекта.
3. Сопоставлены поля `users` в baseline и fixture, а также поля, изменяемые `finalize_account_deletion`.
4. Проверено, что текущая cascade contract regex не соответствует ожидаемой семантике whitespace.
5. Проверены последние записи журнала, чтобы оценить последовательность gate и полноту документации.
6. Создан этот audit; изменения кода не выполнялись.

**Итог:** остановка была оправданной. Сам integration gate полезен и нужен, но текущий способ устранять fixture mismatch по одной ошибке за раз следует заменить предварительной системной сверкой schema contract. До согласования и выполнения этого плана никакие новые source-code изменения или новые SQL integration runs не требуются.
