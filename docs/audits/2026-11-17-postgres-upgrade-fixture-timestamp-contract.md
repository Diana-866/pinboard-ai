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
| `db/migrations/023_revoke_sessions_after_password_reset.sql` | `56887896f8650d56d727e59c3c37388e73f7c37` | Первое добавление `users.token_version integer not null default 0` |
| `db/migrations/055_auth_token_version.sql` | `45735f1c2b18f6a1e7a7d640593f97d5efa29308` | Повторное idempotent добавление/нормализация `token_version` |
| `db/migrations/127_account_lifecycle.sql` | `4c869aee3e6a3e1ae12dcf5e4fc9f45a4292c7fd` | Подтверждает, что `account_status` добавляется миграцией 127 |
| `db/migrations/138_account_deletion_finalize_tombstone.sql` | `c99463878dd828f0e7722f27777ffdb3c6e90b23` | Поля, используемые финализацией account deletion |
| `backend/test/postgres-integration-sql-manifest.txt` | `aa773d020841f6925b4f63f4a6d96fb95cf4e3a6` | Упорядоченный список 46 SQL integration tests |
| `backend/test/account-deletion-storage-manifest.integration.sql` | `ea271e77c8bf18986b996bee09ec99751abc73f0` | Контракт сценария, ранее упавшего на test 8 |
| `backend/test/postgres-integration-upgrade-fixture.sql` | до исправления: `f6bd2d55d812446ce2c56a32dc857feb7fa4bcec`; после: `0d1236b722193fb18e4bbd2d0bd258c018d4cd77` | Standalone upgrade fixture |
| `.github/workflows/atomic-payment-integration.yml` | до исправления: `1487c3f4da4a599bced728f62bad32e871f67afd`; после: `b8bee6bba38d25afdaaa015f8027c4aefd722346` | CI inline copy of upgrade fixture and migrations |
| `backend/test/postgres-integration-runner-contract.test.js` | до исправления: `078127f115d54f275f5d4be1359250a5e53dfc90`; после: `daceb31d99230b409c487cc39d10dc3ee1ef7102` | Source-level guards for fixture contract |

## 3. Что подтвердилось

1. Текущий standalone fixture содержит все baseline column names для десяти таблиц, кроме `users.token_version`. Это исключение намеренное: migration 023 впервые добавляет поле после исходного legacy fixture; migration 055 повторно применяет idempotent definition/normalization. `account_status` также отсутствует до миграции 127 и добавляется ею.
2. Поля `subscription_tier`, `name`, `surname` и `onboarded`, использованные финализацией migration 138, теперь присутствуют в standalone fixture и CI inline fixture.
3. В новом contract test присутствует сравнение набора baseline columns с fixture и отдельные проверки nullability/default/cascade/timestamp semantics. В файле 20 top-level `test(...)` declarations по подсчёту строк `^test\(`; это source count, не результат запуска.
4. Standalone fixture и CI heredoc fixture совпадают после удаления документирующей первой строки и нормализации отступов.
5. Найдены ещё два несовпадения timestamp type, которые не были закрыты предыдущим изменением:
   - `auth_tokens.created_at`: baseline = `timestamptz`, fixture = `timestamp without time zone`;
   - `credit_transactions.created_at`: baseline = `timestamp without time zone`, fixture = `timestamptz`.
   Эти различия не являются частью исторических миграционных изменений и не должны искусственно менять семантику тестовой схемы.

## 4. Исправления этого этапа

Изменены только тестовая схема, её CI-копия и source-contract test:

- `backend/test/postgres-integration-upgrade-fixture.sql`: исправлены оба `created_at` типа. Commit `dd518aed667e5a7657617e4c40cbdcd9e0e04b77`, blob `0d1236b722193fb18e4bbd2d0bd258c018d4cd77`.
- `.github/workflows/atomic-payment-integration.yml`: синхронно исправлена inline fixture. Commit `a09dfea5051c563b5bad3509adf928ff21463720`, blob `b8bee6bba38d25afdaaa015f8027c4aefd722346`.
- `backend/test/postgres-integration-runner-contract.test.js`: добавлена проверка `auth_tokens.created_at timestamptz`; существующая проверка `credit_transactions.created_at timestamp without time zone` теперь соответствует fixture. Commit `3bee9ba503e7709bee51e7826988750be2ece04e`, blob `3242ba970ab898fb14971cbabab7fe6293b2af95`. После этого в main добавлена дополнительная assertion для migration 023: commit `565e8775d5af05f486f8cc1ac75f15edba74aa35`, итоговый blob `daceb31d99230b409c487cc39d10dc3ee1ef7102`.

Production migrations и application code не менялись.

## 5. Проверки и ограничения

Выполнены только source-level проверки по повторно загруженным GitHub-файлам:

- оба timestamp-типа после изменения соответствуют baseline;
- новая assertion присутствует;
- contract file содержит 20 top-level test declarations;
- standalone fixture и CI inline fixture совпадают после нормализации.

**Не выполнялись:** Node contract suite, PowerShell parser/runtime, PostgreSQL migration replay, 46 SQL integration tests, Bash concurrency suite, backend/frontend runtime tests. Успешность этих проверок не заявляется.

Vercel combined status для раннего commit `bd0d973...` показывал SUCCESS, но этот статус не переносится на следующие commits. На текущем main `441cd742caffa6e25cefe27b5edb0de8ace7fe22` и source commit `565e8775d5af05f486f8cc1ac75f15edba74aa35` Vercel возвращает FAILURE с target `build-rate-limit` — quota/rate-limit blocker, не доказанная ошибка кода. Push-triggered GitHub Actions runs: `44068607386` (atomic) и `44068607454` (persisted boards) на `bd0d973...`; `44070232846` (atomic) и `44070232989` (persisted boards) на `565e877...`. Все эти runs завершились FAILURE; для проверенных jobs GitHub API возвращает `steps: null`, `logs_url: null`, downloadable logs отсутствуют. Следовательно, ни один test step не подтверждён как запущенный; причина pre-step failure остаётся неизвестной, эти runs нельзя трактовать как красные результаты Node/SQL tests.

Production, PIN_TRIAL, Supabase, платежи, Pinterest, DNS, локальный PostgreSQL владельца и persistent verification cluster не затрагивались. Секреты не запрашивались и не читались.

## 6. Следующий обязательный gate

1. Владелец синхронизирует локальный checkout с актуальным `origin/main` и подтверждает clean worktree.
2. Запускает `node --test backend/test/postgres-integration-runner-contract.test.js`. Ожидается 21 test case, но PASS должен подтверждаться фактическим stdout/exit code.
3. Только при полном Node PASS выполняет PowerShell parser check и guarded `scripts/verify-integration.ps1 -PostgresPort 55439` на ранее разрешённом disposable PostgreSQL 18.6. Перед запуском runner обязан подтвердить loopback endpoint, PID 15220, data directory `X:\\PinPosy-verify-pg18` и server identity; пароль вводится только в hidden prompt.
4. SQL gate закрывается только после PASS всех 140 migrations 010–149, двух inline assertions, всех 46 SQL tests и подтверждённого cleanup disposable DB. При первом fail остановиться, сохранить точный лог и не запускать следующие suites.
5. До этого SQL integration остаётся NOT PASSED. Не запускать Bash concurrency suite и backend runtime suite раньше SQL gate; не затрагивать production/PIN_TRIAL.

Этот audit фиксирует системную сверку и исправления fixture. Он не объявляет PinPosy готовым к публичному запуску.

## 7. Дополнительная полная инвентаризация миграций и SQL test sources

- С GitHub `main` получены все 140 active migration files `010–149`. Targeted source scan для всех отсутствовавших baseline columns показал: `users.token_version` добавляется migration 023 и повторно обрабатывается migration 055; `account_status` вводится migration 127 (это post-baseline поле). Ни одна из migrations 010–149 не вводит `subscription_tier`, `name`, `surname`, `onboarded`, `created_at`, `projects.website_url/goal/site_summary/analyzed_at` или `boards.created_at`; поэтому эти поля должны существовать в legacy fixture до upgrade chain.
- Получены все 46 SQL-файлов из manifest `backend/test/postgres-integration-sql-manifest.txt` (blob `aa773d020841f6925b4f63f4a6d96fb95cf4e3a6`) и выполнен source-level обзор ссылок на таблицы, INSERT/UPDATE и transaction boundaries. Покрытие включает Pinterest schedule/reconciliation/publication/OAuth, account deletion, payments/Prodamus, credits/generation/refunds, privileges/security-definer, image lifecycle/retention, board idempotency и regeneration. Это не runtime execution и не утверждение, что каждый assertion был исполнен.
- В CI workflow уже есть шаг запуска Node contract suite; workflow migration list теперь содержит ровно 140 contiguous migrations 010–149. Source-level проверки: fixture/CI heredoc equality PASS; baseline column diff — только `users.token_version`; critical defaults/nullability/cascade/timestamp semantics проверены; contract test count — 20 top-level declarations.
- После коммита `3bee9ba...` дополнительно исправлен contract test: он теперь явно проверяет первое добавление `token_version` в migration 023 и повторное в migration 055. Commit `565e8775d5af05f486f8cc1ac75f15edba74aa35`, contract blob `daceb31d99230b409c487cc39d10dc3ee1ef7102`.
- GitHub Actions runs `44068607386`, `44068607454`, `44070232846`, `44070232989` завершились FAILURE до видимых шагов; API отдаёт `steps: null`, `logs_url: null`. Это external CI/pre-step blocker с неустановленной причиной, а не доказательство падения самих тестов. Vercel current status — `build-rate-limit`.
- Ассистент не запускал Node, PowerShell, psql, PostgreSQL или локальный Windows checkout. Никакие runtime PASS не заявляются. SQL integration остаётся NOT PASSED.

### GitHub Actions rerun attempt — no steps or logs available (2026-11-17)

- По решению продолжить автономную диагностику выполнен один rerun двух failed workflow runs на source commit `565e8775d5af05f486f8cc1ac75f15edba74aa35`: atomic payment run `44070232846` и persisted boards run `44070232989`. API подтвердил принятие rerun (`success: true`).
- Attempt 2 обоих runs снова завершился `failure` практически сразу. Новые job IDs: atomic `133996278489`; persisted boards `133996306977` (backend) и `133996307323` (frontend). `fetch_workflow_run_jobs` вернул `steps: null`, `logs_url: null`; скачивание logs не доступно. Поэтому ни Node contract suite, ни SQL/Backend/Frontend test steps не подтверждены как запущенные.
- Вывод: CI pre-step blocker воспроизводится даже при rerun; его причина неизвестна по доступным данным. Не менять application code ради этого статуса и не считать это результатом тестов. Для восстановления CI может потребоваться отдельная проверка GitHub Actions runner/usage/settings владельцем; локальный Node gate остаётся следующим обязательным шагом.
