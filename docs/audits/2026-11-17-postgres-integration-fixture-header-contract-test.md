# PinPosy — исправление ложного падения fixture parity contract test

Дата: 2026-11-17  
Ветка: `main`  
Owner checkout перед исправлением: `72bafc7a1a0e1921e4155eacc6d38df610f39780`

## 1. Контекст и фактический результат владельца

Владелец выполнил синхронизацию локального checkout:
- `git status --short` до pull — пусто.
- `git pull --ff-only origin main` завершился fast-forward: `c92cb6d4 → 72bafc7a`.
- `git rev-parse HEAD` и `git rev-parse origin/main` совпали: `72bafc7a1a0e1921e4155eacc6d38df610f39780`.
- Итоговый `git status --short` — пусто.

Команда `node --test backend/test/postgres-integration-runner-contract.test.js` завершилась **19 PASS / 1 FAIL из 20**. Единственный сбой — тест `upgrade fixture stays byte-for-byte aligned with CI legacy schema setup` (строка 31 файла contract test). В diff assertion было видно:
- actual начинается непосредственно с `create table public.users`;
- expected начинается с общего комментария `-- CI upgrade-compatibility fixture. Cluster roles are provisioned by verify-integration.ps1.`, после которого идёт тот же SQL.

## 2. Причина

Повторно получены из GitHub:
- contract test до исправления: blob `daceb31d99230b409c487cc39d10dc3ee1ef7102`;
- standalone fixture: blob `0d1236b722193fb18e4bbd2d0bd258c018d4cd77`;
- CI workflow содержит тот же header comment внутри fixture heredoc.

Функция `extractHeredocAfter()` сохраняет комментарий CI fixture. В тесте expected исключает только cluster role statements, а actual дополнительно фильтрует строку комментария `-- CI upgrade-compatibility fixture.`. Поэтому сравнение, заявленное как byte-for-byte parity (с исключением role statements), искусственно удаляло строку только с одной стороны. SQL schema content не расходился; assertion содержал асимметричную нормализацию.

## 3. Исправление

Изменён только `backend/test/postgres-integration-runner-contract.test.js`: actual теперь нормализует line endings через split/join и удаляет завершающие пустые строки, но сохраняет общий header comment. Исключение cluster role statements остаётся только в expected, поскольку эти роли создаются runner отдельно и отсутствуют в standalone fixture.

- Новый contract blob: `03fc5d1973fcbc376367755009f310475e7cde44`.
- Commit: `e3517cdc717476bdba8e6d1f5f9fa289fb28be8f`.

Production code, migrations, CI workflow, standalone SQL fixture, SQL integration tests и базы данных не изменялись.

## 4. Проверки и ограничения

После update выполнена запись через GitHub Contents API; новый commit и blob SHA получены от GitHub. Это подтверждает публикацию исходника, но **не подтверждает выполнение Node-тестов**. Assistant не имеет доступа к локальному Windows checkout, PowerShell или локальному PostgreSQL verification cluster и не заявляет запуск тестов.

Node gate остаётся **ожидающим повторного выполнения владельцем**. До полного PASS contract suite запрещено запускать `scripts/verify-integration.ps1`. PostgreSQL SQL integration остаётся **NOT PASSED**: предыдущий runtime результат не закрыт, все 46 тестов не подтверждены.

## 5. Действия ассистента и последовательность

1. Прочитан пользовательский transcript синхронизации и полный вывод Node test failure.
2. Повторно получены с GitHub contract test, standalone fixture, CI workflow, PROJECT_STATE, USER_ACTIONS и DOCUMENTATION_REGISTER.
3. Сопоставлены строки начала expected/actual и правило фильтрации; установлен дефект тестовой нормализации.
4. Изменён только actual-side normalization в contract test; изменение опубликовано commit `e3517cdc717476bdba8e6d1f5f9fa289fb28be8f`.
5. Создан этот audit report, после чего должны быть последовательно обновлены PROJECT_STATE, USER_ACTIONS и DOCUMENTATION_REGISTER.
6. Runtime проверки не выполнялись; результаты не выдумывались.

## 6. Следующий шаг владельца

После публикации всех документационных commits:
1. `git status --short`
2. `git pull --ff-only origin main`
3. `git rev-parse HEAD` и `git rev-parse origin/main` — должны совпасть; worktree должен быть чистым.
4. `node --test backend/test/postgres-integration-runner-contract.test.js`
5. Передать полный вывод и exit code.

Если любой Node test FAIL — остановиться и передать лог. Только при полном Node PASS разрешается перейти к PowerShell Parser check и затем к guarded disposable PostgreSQL runner согласно UA-006. Не использовать production/PIN_TRIAL, не останавливать PID 15220, не удалять `X:\\PinPosy-verify-pg18`, не передавать пароль или другие секреты в чат.
