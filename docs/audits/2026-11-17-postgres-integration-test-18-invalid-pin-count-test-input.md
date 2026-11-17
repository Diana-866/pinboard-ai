# PostgreSQL integration test 18/46 — invalid test payload masked refund guard

Дата: 2026-11-17  
Репозиторий: `Diana-866/pinboard-ai`, branch `main`  
Owner run commit: `0d31c813e39e420e26c5ebee0edadea1928df00d`

## 1. Owner runtime transcript and outcome

Владелец предоставил полный вывод guarded runner после синхронизации clean main:
- До pull `git status --short` был пуст.
- Fast-forward: `d736814d → 0d31c813`.
- `HEAD` и `origin/main` совпадали: `0d31c813e39e420e26c5ebee0edadea1928df00d`; итоговый worktree чистый.
- Runner подтвердил PostgreSQL listener PID `15220`, data directory `X:\PinPosy-verify-pg18` и server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Создана только disposable DB `pinposy_sqlint_ca5527ced768460b`.
- Upgrade fixture, 140 migrations `010–149` и обе CI inline assertions завершились без фатальной ошибки.
- SQL tests `1–17/46` прошли; test `18/46`, `provider-refund-reconciliation-guard.integration.sql`, завершился ошибкой `invalid pin count`.
- Тесты `19–46` не запускались. SQL integration gate **NOT PASSED**.
- Cleanup завершился: runner остановил сессии disposable DB, выполнил `DROP DATABASE` и вывел `Removed disposable database pinposy_sqlint_ca5527ced768460b`.
- Сообщения PostgreSQL `NOTICE` во время миграций сами по себе не были причиной остановки; runner дошёл до SQL test 18.

Пароль временной роли в документацию не включён и не запрашивался.

## 2. Root cause — test input, not demonstrated production defect

Проверены актуальные GitHub source files:
- `backend/test/provider-refund-reconciliation-guard.integration.sql`, исходный blob `d0634050d78748cf4675ea6a5bd78679c9bb66b4`;
- `db/migrations/012_atomic_generation_charge.sql`, blob `29d8ef5c4565974d181e641bf0c447b64abd7bd6`;
- `db/migrations/054_pin_generation_credit_reservations.sql`, blob `2d2e52d11b396b7027ef492bbe41a5b2f431cc77`;
- `db/migrations/071_pin_generation_completion_journal_guard.sql`, blob `d92b41dc7938c8bd098ce4b76885bb975313a460`;
- `db/migrations/072_provider_refund_reconciliation_settlement_guard.sql`, blob `39ea82b0d451aec60c66f4dea62d9523b0fd2b71`.

В первой части test 18 создаётся generation request с одной task, task фиксируется как `failed`, а provider refund metadata остаётся неизвестной (`provider_refunded = NULL`, `provider_reconciled_at = NULL`). Тест хотел проверить, что попытка завершить request как completed блокируется trigger guard из migration 072 с сообщением `generation provider refund reconciliation is incomplete`.

Однако исходный тест вызывал:

```sql
perform public.complete_pin_generation_request(
  v_user::text,v_board,v_key,v_claim,'[]'::jsonb,1
);
```

Source review migration 054 показал порядок выполнения: completion function сначала вызывает `save_generated_pins_and_charge(...)`, затем обновляет request status на `completed`. Функция сохранения в migrations 012/054 проверяет количество пинов и отклоняет пустой массив (`v_count < 1`) с `invalid pin count`. Поэтому execution не доходил до status UPDATE и trigger guard migration 072 не проверялся. Ошибка — некорректный входной payload теста, маскирующий целевую проверку; этот transcript сам по себе не доказывает дефект production logic.

## 3. Exact correction published

Изменён только `backend/test/provider-refund-reconciliation-guard.integration.sql`: вместо пустого массива тест передаёт один валидный pin JSON с непустыми `image_url`, `title`, `model_used`, допустимым `aspect_ratio='2:3'` и `credits_cost=1`, а также `p_amount=1`. Это соответствует ограничениям save function и позволяет execution дойти до обновления request status, где ожидается отказ trigger guard 072 из-за неразрешённого refund outcome.

Ожидаемая транзакционная семантика: если trigger guard выбрасывает ожидаемое исключение внутри PL/pgSQL exception block, подоператор completion должен откатить промежуточный debit/insert/reservation state; последующие assertions теста проверяют, что request остаётся `processing`, а reservation остаётся `reserved`. Это обоснование по коду; runtime ещё не подтверждён.

Изменение опубликовано:
- Commit: `ea2016eed79de2854785f53d9d77a0d485d57d76`
- Новый blob: `1ae496bdd596c848d18dc33a8f50e90de7b9cb78`
- Изменённый файл: только `backend/test/provider-refund-reconciliation-guard.integration.sql`.

Production application code, migrations, CI fixture/workflow, runner, production/PIN_TRIAL и persistent verification cluster не менялись.

## 4. Assistant action log

1. Прочитан owner transcript целиком до первой ошибки и cleanup.
2. Сверены актуальные `PROJECT_STATE.md`, `USER_ACTIONS.md`, `DOCUMENTATION_REGISTER.md` и test 18 на GitHub.
3. Повторно получены source migrations 012, 045, 046, 054, 063, 064, 066, 071, 072, 073, 074, 075 и 077 для проверки цепочки функций и trigger conditions.
4. Установлено, что пустой массив отклоняется раньше status UPDATE; поэтому ожидаемый guard 072 не достигался.
5. Изменён только test input; изменение опубликовано отдельным commit.
6. Создаётся этот audit, затем обновляются PROJECT_STATE, USER_ACTIONS и DOCUMENTATION_REGISTER.
7. Assistant не запускал PowerShell, psql, PostgreSQL или локальный Node. Runtime output принадлежит владельцу. После correction test 18 не запускался; тесты 18–46 остаются runtime-unverified.

## 5. Verification and limits

Source-level checks:
- Migration 054 подтверждает, что completion вызывает save function до request status update.
- Migration 054 save function подтверждает ограничения на pin array, ownership, поля pin и равенство суммы `credits_cost` с `p_amount`.
- Migration 072 подтверждает точный guard error, который ожидал test.
- Исправленный payload удовлетворяет проверенным входным ограничениям save function.

Не проверено runtime:
- Повторный Node contract suite после этого изменения.
- Повторный guarded PostgreSQL run.
- Прохождение теста 18 с новым payload.
- SQL tests 19–46.
- Bash concurrency, backend/frontend runtime suites.

SQL integration gate остаётся **NOT PASSED**. Нельзя объявлять 46/46 PASS на основании source review.

## 6. Safety and next step

- Не повторять runner до синхронизации актуального main и выполнения Node contract gate.
- Не обходить runner safety guards.
- Не использовать production/PIN_TRIAL.
- Не останавливать PID 15220 и не изменять/удалять `X:\PinPosy-verify-pg18`.
- Не передавать пароль, токены или .env.
- После Node PASS владелец может выполнить guarded runner только по обновлённым инструкциям UA-011; при первой ошибке остановиться и сохранить полный вывод, включая cleanup.
- SQL PASS допустим только после fixture, всех 140 migrations, двух inline assertions, всех 46 SQL tests и подтверждённого cleanup disposable DB.
