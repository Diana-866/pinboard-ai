# PinPosy — schema-contract сверка upgrade fixture и timestamp types

Дата: 2026-11-17  
Ветка: `main`  
Исходный HEAD перед этим этапом: `bd0d973d459996885224e1940a4a74a369eb578e`  
Последовательные commits исправления: `dd518aed667e5a7657617e4c40cbdcd9e0e04b77`, `a09dfea5051c563b5bad3509adf928ff21463720`, `3bee9ba503e7709bee51e7826988750be2ece04e`

## 1. Почему выполнялась сверка

Последняя запись в `docs/PROJECT_STATE.md` фиксировала остановку SQL integration на тесте 8/46: `finalize_account_deletion` обращалась к `users.subscription_tier`, отсутствовавшей в upgrade fixture. Отчёт `docs/audits/2026-11-17-postgres-integration-stop-and-review.md` требовал сначала системно сверить schema contract, а не устранять каждую следующую ошибку по одному полю.

После этого на `main` уже находился commit `bd0d973d459996885224e1940a4a74a369eb578e`, который расширил fixture до полного набора baseline columns для десяти базовых таблиц (с осознанным исключением `users.token_version`) и добавил contract assertions. Это изменение ещё не было отражено в журнале проекта.

## 2. Источники, повторно прочитанные с GitHub

| Файл | Blob SHA | Использование |
|---|---|---|
| `db/migrations/001_baseline.sql` | `105a13cfba4746206191dcf2bd68d5514912f08c` | Канонические колонки и типы десяти baseline tables |
| `db/migrations/055_auth_token_version.sql` | `45735f1c2b18f6a1e7a7d640593f97d5efa29308` | Подтверждает, что `token_version` добавляется миграцией 055 |
| `db/migrations/127_account_lifecycle.sql` | `4c869aee3e6a3e1ae12dcf5e4fc9f45a4292c7fd` | Подтверждает, что `account_status` добавляется миграцией 127 |
| `db/migrations/138_account_deletion_finalize_tombstone.sql` | `c99463878dd828f0e7722f27777ffdb3c6e90b23` | Поля, используемые финализацией account deletion |
| `backend/test/postgres-integration-sql-manifest.txt` | `aa773d020841f6925b4f63f4a6d96fb95cf4e3a6` | Упорядоченный список 46 SQL integration tests |
| `backend/test/account-deletion-storage-manifest.integration.sql` | `ea271e77c8bf18986b996bee09ec99751abc73f0` | Контракт сценария, ранее упавшего на test 8 |
| `backend/test/postgres-integration-upgrade-fixture.sql` | до исправления: `f6bd2d55d812446ce2c56a32dc857feb7fa4bcec`; после: `0d1236b722193fb18e4bbd2d0bd258c018d4cd77` | Standalone upgrade fixture |
| `.github/workflows/atomic-payment-integration.yml` | до исправления: `1487c3f4da4a599bced728f62bad32e871f67afd`; после: `b8bee6bba38d25afdaaa015f8027c4aefd722346` | CI inline copy of upgrade fixture and migrations |
| `backend/test/postgres-integration-runner-contract.test.js` | до исправления: `078127f115d54f275f5d4be1359250a5e53dfc90`; после: `3242ba970ab898fb14971cbabab7fe6293b2af95` | Source-level guards for fixture contract |

## 3. Что подтвердилось

1. Текущий standalone fixture содержит все baseline column names для десяти таблиц, кроме `users.token_version`. Это исключение намеренное: migration 055 добавляет поле после исходного legacy fixture. `account_status` также отсутствует до миграции 127 и добавляется ею.
2. Поля `subscription_tier`, `name`, `surname` и `onboarded`, использованные финализацией migration 138, теперь присутствуют в standalone fixture и CI inline fixture.
3. В новом contract test присутствует сравнение набора baseline columns с fixture и отдельные проверки nullability/default/cascade/timestamp semantics. Всего в файле 21 top-level `test(...)` declaration по source inspection; это не результат запуска.
4. Standalone fixture и CI heredoc fixture совпадают после удаления документирующей первой строки и нормализации отступов.
5. Найдены ещё два несовпадения timestamp type, которые не были закрыты предыдущим изменением:
   - `auth_tokens.created_at`: baseline = `timestamptz`, fixture = `timestamp without time zone`;
   - `credit_transactions.created_at`: baseline = `timestamp without time zone`, fixture = `timestamptz`.
   Эти различия не являются частью исторических миграционных изменений и не должны искусственно менять семантику тестовой схемы.

## 4. Исправления этого этапа

Изменены только тестовая схема, её CI-копия и source-contract test:

- `backend/test/postgres-integration-upgrade-fixture.sql`: исправлены оба `created_at` типа. Commit `dd518aed667e5a7657617e4c40cbdcd9e0e04b77`, blob `0d1236b722193fb18e4bbd2d0bd258c018d4cd77`.
- `.github/workflows/atomic-payment-integration.yml`: синхронно исправлена inline fixture. Commit `a09dfea5051c563b5bad3509adf928ff21463720`, blob `b8bee6bba38d25afdaaa015f8027c4aefd722346`.
- `backend/test/postgres-integration-runner-contract.test.js`: добавлена проверка `auth_tokens.created_at timestamptz`; существующая проверка `credit_transactions.created_at timestamp without time zone` теперь соответствует fixture. Commit `3bee9ba503e7709bee51e7826988750be2ece04e`, blob `3242ba970ab898fb14971cbabab7fe6293b2af95`.

Production migrations и application code не менялись.

## 5. Проверки и ограничения

Выполнены только source-level проверки по повторно загруженным GitHub-файлам:

- оба timestamp-типа после изменения соответствуют baseline;
- новая assertion присутствует;
- contract file содержит 21 test declaration;
- standalone fixture и CI inline fixture совпадают после нормализации.

**Не выполнялись:** Node contract suite, PowerShell parser/runtime, PostgreSQL migration replay, 46 SQL integration tests, Bash concurrency suite, backend/frontend runtime tests. Успешность этих проверок не заявляется.

Combined status commit `bd0d973...` до наших трёх изменений показывал Vercel SUCCESS. Это не подтверждает сборку/деплой новых commits `dd518ae`, `a09dfea`, `3bee9ba`. Для последнего commit GitHub Actions workflow runs через доступный PR-filtered endpoint не вернулись; это не доказывает отсутствие всех push-triggered runs.

Production, PIN_TRIAL, Supabase, платежи, Pinterest, DNS, локальный PostgreSQL владельца и persistent verification cluster не затрагивались. Секреты не запрашивались и не читались.

## 6. Следующий обязательный gate

1. Владелец синхронизирует локальный checkout с актуальным `origin/main` и подтверждает clean worktree.
2. Запускает `node --test backend/test/postgres-integration-runner-contract.test.js`. Ожидается 21 test case, но PASS должен подтверждаться фактическим stdout/exit code.
3. Только при полном Node PASS выполняет PowerShell parser check и guarded `scripts/verify-integration.ps1 -PostgresPort 55439` на ранее разрешённом disposable PostgreSQL 18.6. Перед запуском runner обязан подтвердить loopback endpoint, PID 15220, data directory `X:\\PinPosy-verify-pg18` и server identity; пароль вводится только в hidden prompt.
4. SQL gate закрывается только после PASS всех 140 migrations 010–149, двух inline assertions, всех 46 SQL tests и подтверждённого cleanup disposable DB. При первом fail остановиться, сохранить точный лог и не запускать следующие suites.
5. До этого SQL integration остаётся NOT PASSED. Не запускать Bash concurrency suite и backend runtime suite раньше SQL gate; не затрагивать production/PIN_TRIAL.

Этот audit фиксирует системную сверку и исправления fixture. Он не объявляет PinPosy готовым к публичному запуску.
