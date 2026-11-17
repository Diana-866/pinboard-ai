# PostgreSQL test 34 — Pinterest publication approval fixture

## Контекст и исходное доказательство

Владелец синхронизировал локальную ветку `main` с `origin/main`; оба указателя совпали на `60251392b65f4a44941c0b1f24950e72b6cf23e6`, рабочее дерево было чистым. Локальные проверки владельца:
- Node contract / migration-chain / replay-chain: **45/45 PASS**.
- PowerShell Parser для `scripts/verify-integration.ps1`: **0 syntax errors**.
- Guarded PostgreSQL runner: upgrade fixture применён; все **147 миграций 010–156** применены; обе CI inline assertions прошли.
- SQL integration tests **1–33 прошли**; test **34/46** остановился на `first Pinterest publish reservation must start`.
- Runner завершил cleanup: disposable DB `pinposy_sqlint_164fb8a1f4684d95` удалена; 0 оставшихся backend sessions.
- Tests 35–46 не запускались.

Источник runtime evidence — полный вывод владельца, переданный в сообщении 2026-11-17. Ассистент не запускал локальные Node, PowerShell, psql или PostgreSQL команды.

## Диагностика

1. Получены актуальные с GitHub `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, `docs/DOCUMENTATION_REGISTER.md`, `backend/test/postgres-integration.sql`, migrations 148 и 149 и test-contract source.
2. Сверены участки test 34, где создаются пины, вызываются `begin_pinterest_publish_v2` и создаются расписания.
3. Migration 148 (`db/migrations/148_atomic_pin_publication_status_fencing.sql`) явно проверяет статус пина под блокировкой: если статус отличается от `approved`, `begin_pinterest_publish_v2` возвращает `{status: 'pin_not_approved'}`. Та же миграция запрещает создавать расписание для пина, статус которого не `approved`.
4. Migration 012 и canonical baseline подтверждают, что обычная генерация сохраняет новые пины со статусом `pending`.
5. Test 34 использовал созданный генерацией `v_pin` и ещё два дополнительных публикационных пина со статусом `pending`, после чего ожидал `started`. Дополнительный schedule-lifecycle pin также создавался как `pending`, хотя затем передавался в создание расписания.
6. Следовательно, первая проверка не отражала актуальный production contract. Ошибка вызвана неполной тестовой фикстурой, а не основанием изменять защитную логику migration 148.

## Исправление

Изменён только `backend/test/postgres-integration.sql`:
- основной сгенерированный `v_pin` явно переводится в `approved` перед сценарием Pinterest publication/scheduling;
- дополнительные `uncertain` и `late-success` pins создаются сразу со статусом `approved`;
- отдельный `schedule-test-pin` также создаётся со статусом `approved`.

Это моделирует успешное ручное одобрение до публикации/планирования и сохраняет защиту migration 148. Production SQL, миграции, backend/frontend код, runner и CI workflow не менялись.

## Публикация

- Файл: `backend/test/postgres-integration.sql`
- Предыдущий blob SHA: `dbdf95829a54cc160d0764f76075d2c92137d5d0`
- Новый blob SHA: `fce98ac3665f92b6126d2164439295d7c29c0e31`
- Commit: `29b393ece2738f94b5ecb9ac5a74663f8581d66e`

## Проверки и ограничения

- Изменение внесено после проверки четырёх уникальных контекстов; каждый заменён ровно один раз.
- GitHub Contents API принял изменение и вернул commit/blob SHA выше.
- Повторный runtime прогон после исправления **ещё не выполнен**.
- Node 45/45 и PowerShell Parser 0 ошибок относятся к состоянию до этого изменения; их необходимо повторить на синхронизированном commit.
- PostgreSQL test 34 после исправления **НЕ ПРОВЕРЕН**; tests 35–46 также не проверены в последнем прогоне.
- Не выполнялись production SQL, миграции на постоянной БД, deployment или изменения внешних сервисов.

## Следующий шаг владельца

Синхронизировать latest main, повторить Node contract gate, PowerShell Parser gate, затем guarded PostgreSQL runner. Требовать 147 миграций 010–156, две CI assertions, 46/46 SQL tests и подтверждённый cleanup disposable DB. Остановиться на первой ошибке. Сохранить существующий защищённый PostgreSQL listener PID 15220, порт 55439 и каталог `X:\\PinPosy-verify-pg18`; не использовать production/`PIN_TRIAL` и не обходить guards. Девять Bash concurrency scripts остаются отдельным непроверенным этапом.
