# PinPosy — действия, требующие участия пользователя

Этот файл — очередь конкретных действий, которые нельзя выполнить из GitHub/текущей среды ассистента. После получения результата ассистент обязан сверить его с актуальным `main`, отметить задачу выполненной/заблокированной и записать результат в `docs/PROJECT_STATE.md`.

- **Повторная проверка обязательного PostgreSQL gate (2026-11-16, main docs HEAD 2f838cdd082e79fed8b63e01845d5291e8a9875d):** после документационного commit GitHub запустил runs `43936400253` (backend `133542018499`, frontend `133542018960`) и `43936400260` (postgres-atomicity `133542018246`); следующий HEAD от текущей проверки запустил `43936487681` (backend `133542325408`, frontend `133542325882`) и `43936487679` (postgres-atomicity `133542325836`). Все шесть jobs завершились через 1–2 секунды с `failure`, `runner_id: 0`, пустым `runner_name`, `steps: 0`. Ни одна команда checkout/test/typecheck/build/SQL replay не стартовала. Это runner allocation failure, а не результат тестирования кода.
- **Windows fallback:** PR #90 `ci: run backend and frontend checks on Windows self-hosted runner` повторно прочитан: он остаётся `open` и `draft`, содержит workflow с `runs-on: [self-hosted, Windows, X64]` и manual `migrations_only` input; PR не объединялся. Наличие подключённого Windows runner не подтверждено. Нужна проверка в GitHub Actions → Runners: runner должен быть online/idle и иметь labels `self-hosted`, `Windows`, `X64`; затем владелец должен запустить workflow на актуальном `main` с `migrations_only=true`. Запускать только на loopback PostgreSQL test instance, не production. Если runner отсутствует/offline — выполнить локально `powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1 -MigrationsOnly` из корня свежего checkout `main`, сохранив полный stdout/stderr/exit code без секретов.
- **Vercel:** combined status на текущем `main` docs HEAD `2f838cdd082e79fed8b63e01845d5291e8a9875d` — `failure`, target `build-rate-limit`; это quota, не build result. Ранее успешный deployment другого application commit не подтверждает текущую версию.

- **Финальная проверка после фиксации этого задания (2026-11-16):** новый run `43936696213` на documentation HEAD `698a8f64a9b73ded104014ffc83c60240977c09d` также завершился `failure`; jobs `133543052272` (frontend) и `133543053331` (backend) имеют `runner_id: 0`, пустой `runner_name`, `steps: 0`, завершились примерно за 1 секунду. Это дополнительно подтверждает, что GitHub-hosted runner не начал выполнять workflow. Никакие frontend/backend tests или build не запускались.
## UA-001 — проверить бинарники PostgreSQL 18 и свободное место

- **Разрешение владельца получено (2026-11-16):** пользователь явно разрешил создать отдельный временный PostgreSQL 18.6 cluster только в новом каталоге на X:, на отдельном порту и с bind/listen только `127.0.0.1`. Запрещено затрагивать работающий PostgreSQL (в т.ч. PID 5632), его data directory, `PIN_TRIAL` и production. Разрешение распространяется только на создание и проверку disposable cluster; миграционный replay будет отдельным последующим шагом после проверки идентичности кластера и подтверждения безопасного endpoint. Создание кластера ещё не подтверждено.


- **Фактический результат от владельца (2026-11-16):** `initdb --version` → PostgreSQL 18.6; `pg_ctl --version` → PostgreSQL 18.6; `Test-Path ...\\postgres.exe` → `True`; свободно на X: `167,962,349,568` байт (примерно 156.4 GiB). Дополнительно пользователь сообщил о работающем процессе `postgres.exe` PID `5632`, ParentProcessId `4336`; этот процесс и существующий data directory не трогались. Предварительные условия для отдельного disposable cluster имеются. Создание кластера и запуск миграций требуют отдельного явного согласия пользователя.


- **Статус:** [x] Read-only проверки выполнены; изолированный кластер ещё не создан.
- **Приоритет:** блокирует чистый PostgreSQL migration replay.
- **Почему требуется:** локальная служба PostgreSQL 18 запущена в `X:\Program Files\PostgreSQL\18\data`, но пароль роли `Alekc` неизвестен. Мы не будем сбрасывать пароль, менять `pg_hba.conf`, останавливать существующую службу или использовать её каталог данных. План — создать отдельный временный кластер PostgreSQL в новом каталоге на отдельном loopback-only порту, выполнить replay миграций в нём и удалить только созданный временный кластер.
- **Команды (только чтение; не запускают сервер и не меняют данные):**
  ```powershell
  & 'X:\Program Files\PostgreSQL\18\bin\initdb.exe' --version
  & 'X:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' --version
  Test-Path 'X:\Program Files\PostgreSQL\18\bin\postgres.exe'
  Get-PSDrive X | Select-Object Name, Free, Used
  ```
- **Ожидаемый результат:** версии `initdb` и `pg_ctl`; `True` для `postgres.exe`; свободное место на диске X:.
- **Передать ассистенту:** полный вывод четырёх команд. Не передавать пароли, содержимое конфигураций, переменные окружения или токены.
- **Запрещено до отдельной инструкции:** запускать `initdb`; запускать `verify.ps1 -MigrationsOnly`; менять пароль/роли или `pg_hba.conf`; останавливать службу `postgresql-x64-18`; использовать или очищать `X:\Program Files\PostgreSQL\18\data`; запускать миграции на `PIN_TRIAL` или production.
- **Следующий шаг после результата:** ассистент подготовит команды для создания нового disposable cluster в отдельном каталоге, на отдельном порту, с `listen_addresses=127.0.0.1`, отдельной временной ролью и базой; сначала проверит параметры cleanup и целевой endpoint. После replay будет записан полный лог, затем временный кластер будет штатно остановлен и удалён. Существующий кластер не затрагивается.

## Правило очереди

- Новые действия добавляются с уникальным ID, причиной, точными командами, ожидаемым результатом и запретами.
- Выполненные задачи не удаляются: статус и фактический результат сохраняются для истории.
- Если задачу можно безопасно выполнить ассистенту через GitHub или доступные инструменты, она не должна перекладываться на пользователя.

- **Повторная проверка ассистентом (2026-11-16, main HEAD `66f9b293891e44f6b4b1516b24ae82665315a923`):** текущая изолированная Linux execution-среда ассистента имеет Node.js `v22.16.0` и npm, но не содержит `psql`, `postgres`, `initdb`, `docker`, `podman`, `pwsh` или `powershell`; каталоги PostgreSQL socket `/var/run/postgresql` и `/run/postgresql` отсутствуют; checkout репозитория в этой среде также отсутствует. Поэтому Linux replay завершится корректным отказом до создания БД, а Windows replay физически недоступен. Это не сведения о компьютере пользователя: ранее зафиксированный PostgreSQL 18 на диске X: остаётся отдельной пользовательской машиной. Согласно safety-ограничению UA-001 ассистент НЕ запускал `verify.ps1 -MigrationsOnly`, не запускал/не останавливал PostgreSQL service, не трогал существующий data directory и не подключался к Supabase/production. Проверены актуальные `scripts/verify.sh`, `scripts/verify.ps1`, `db/supabase-stub.sql`, `db/migrations/001_baseline.sql` (канонический путь — внутри `db/migrations/`) и migration-chain static test. Настоящий SQL replay не выполнен; следующий необходимый шаг — получить от владельца только вывод четырёх read-only PowerShell команд, перечисленных выше, после чего подготовить отдельный disposable cluster в новом каталоге и на loopback-порту.

- **Новые runs после обновления паспорта (2026-11-16, code HEAD `dfdd4281d9c17c241786bfb6cf928fc900af9200`):** runs `43936938640` (backend `133543896947`, frontend `133543897300`) и `43936938737` (postgres-atomicity `133543897726`) завершились `failure` за 1–2 секунды; все jobs `runner_id: 0`, пустой `runner_name`, `steps: 0`. Runs `43936936465` / `43936936499` на documentation HEAD `2c325ca43508c2fb3247b2398fac36be33b89a96` дали тот же результат (`133543889029`, `133543889371`, `133543889689`). Ни одна команда не стартовала. Свежий code HEAD включает commit `test(i18n): correct recovery count template assertion`; это не меняет DB replay blocker. Billing/Actions settings по-прежнему требуют проверки владельцем.
- **Повторная проверка на актуальном main (2026-11-16, HEAD `1e40d12aca727660bd7d5c49c834142b14d8079b`):** runs `43937089740` (postgres-atomicity job `133544422571`) и `43937089818` (backend `133544423381`, frontend `133544423668`) на code HEAD `1e40d12` завершились `failure`; все jobs `runner_id: 0`, пустой `runner_name`, `steps: 0`. На предыдущих HEAD `8d5833476fb805559d9fbac5ec0fec772f539c54` runs `43937079163` (frontend `133544382405`, backend `133544382787`) и `43937079153` (postgres-atomicity `133544382643`) дали тот же результат; на docs HEAD `111b14a47ac3a00a4bbc864a06d82f5b6ca815fc` runs `43937006562` (frontend `133544133658`, backend `133544134133`) и `43937006656` (postgres-atomicity `133544133844`) также завершились до runner. Никакие workflow steps не стартовали.
- **Повторная проверка локального execution environment (2026-11-16):** container runtime — Linux x86_64, root, Node `v22.16.0`, npm `10.9.2`; `psql`, `postgres`, `initdb`, `pg_ctl`, Docker, Podman, PowerShell/pwsh отсутствуют; `/var/run/postgresql` и `/run/postgresql` отсутствуют. `apt-cache policy postgresql` не находит доступного кандидата, а DNS/network probe к GitHub завершается `Could not resolve host`; локального checkout нет. Невозможно безопасно установить PostgreSQL или получить полный source checkout в этой среде. Это проверка среды ассистента, не компьютера пользователя. UA-001 read-only проверки на X: остаются необходимыми; не запускать initdb/verify.ps1 до результата пользователя.
- **Повторная проверка после локализации generator scheduling/validation (2026-11-16, актуальный code HEAD `aaf84b452eb4e09844a90040ba6c267c8d9df5bf`):** runs `43937588967` (backend job `133546158870`, frontend job `133546159438`) и `43937588823` (postgres-atomicity job `133546157863`) завершились `failure` без выделения runner: у всех `runner_id: 0`, пустой `runner_name`, `steps: 0`. Никакой lint/typecheck, frontend/backend test, build, migration или SQL integration step не стартовал. Оба актуальных workflow (`.github/workflows/persisted-boards-checks.yml`, `.github/workflows/atomic-payment-integration.yml`) настроены на `ubuntu-latest`; PostgreSQL workflow объявляет disposable service `postgres:16`, но этот job также не получил runner. Следовательно, конфигурация self-hosted PR #90 не объясняет эти конкретные failures; API подтверждает только отсутствие runner assignment, но не раскрывает account-level cause. Vercel combined status для code HEAD `aaf84b452eb4e09844a90040ba6c267c8d9df5bf` — `failure`, target `build-rate-limit`; успешная сборка/deploy не подтверждены.
- **Последняя проверка CI на актуальном main (2026-11-16, code HEAD `c82a64e1f265378a9c78d70c4df0fbf59cc11dc8`):** runs `43937799440` (postgres-atomicity job `133546904911`) и `43937799549` (frontend job `133546905443`, backend job `133546906059`) завершились `failure` до запуска runner: все jobs имеют `runner_id: 0`, пустой `runner_name`, `steps: 0`. Это не свидетельствует о провале тестов приложения: сами команды не стартовали. Повторные runs на docs HEAD `555bf457eaeb7f439e5173fb1bcc389a35c566a0` — `43937790390` и `43937790228` — имеют тот же результат. Не удалось подтвердить причину выделения runner через repository API; проверка account billing, payment method и Actions policies остаётся владельцу (UA-002).
- **Повторная проверка GitHub Actions на актуальном main (2026-11-16, docs HEAD `1a8a6d99baabbe37073191bfc974a64cb613d843`):** run `43938035006` содержит jobs `133547725577` (backend) и `133547725893` (frontend); run `43938009174` содержит `133547632770` (postgres-atomicity). Все три завершились `failure` до выделения runner: `runner_id: 0`, `runner_name` пуст, `steps: 0`. Поэтому backend/frontend runtime, SQL integration и миграционный replay по-прежнему не запускались. Это runner-allocation failure, не доказательство дефекта кода и не результат тестов. Владелец должен проверить account billing/usage и Actions policies согласно этой UA-002, когда вернётся; production не затронут.
- **Повторная проверка CI после последнего обновления main (2026-11-16, HEAD `2f66842dcbf1f0f614bb9781f518c35c8298e152`):** run `43938148743` — frontend job `133548127819` и backend job `133548128191`; run `43938148707` — postgres-atomicity job `133548126641`. Все три завершились `failure` до назначения runner (`runner_id: 0`, пустой `runner_name`, `steps: 0`). Следовательно, ни один migration/SQL/backend/frontend test step не стартовал. Попытка получить job logs вернула 404 BlobNotFound; подробная причина runner allocation по API не раскрыта. Не интерпретировать это как failing application tests. Проверка GitHub billing/Actions policy остаётся владельцу (см. UA-002); не передавать секреты или платёжные данные.
- **Актуальная проверка CI на main HEAD `1bc598ad0888165a07ae35d1cff9f5a7dbcafe0c` (2026-11-16):** runs `43938352568` (frontend `133548841458`, backend `133548842095`) и `43938352582` (postgres-atomicity `133548841515`) завершились `failure`; все jobs имеют `runner_id: 0`, пустой `runner_name`, `steps: 0`, время выполнения около 2 секунд. Check runs не содержат summary/output text; получение job logs вернуло `404 BlobNotFound`, annotations endpoint недоступен через подключённый GitHub read-интерфейс. Значит, конкретная причина allocation на уровне аккаунта не раскрыта; сами тесты не стартовали.
- **Self-hosted fallback PR #90:** run `43908889550`, job `133445082390`, создан `2026-11-16T16:33:58Z`, всё ещё `queued`; labels `self-hosted`, `Windows`, `X64`, но `runner_id: 0`, `runner_name` пустой, `runner_group_id: 0`, steps отсутствуют. Следовательно, Windows self-hosted runner не забрал задачу; PR остаётся draft/open и основан на старом base SHA `0b856ae4965eb41b5fc4def364941c63629edb4a`, поэтому не является путём подтверждённой проверки.
- **Vercel:** commit status для `1bc598ad0888165a07ae35d1cff9f5a7dbcafe0c` — `failure`, описание `Deployment rate limited — retry in 24 hours` (target `build-rate-limit`). Это ограничение deployment quota, не результат сборки. Текущий HEAD не имеет подтверждённого deployment; более ранний успешный deployment другого commit не подтверждает этот HEAD.
- **Действие владельца:** проверить GitHub Settings → Actions → Runners (зарегистрирован ли Windows runner, online/idle ли он, labels совпадают ли); GitHub Settings → Billing & Licensing / budgets / payment method; Repo Settings → Actions → General / policies. Проверить Vercel usage/build quota. Не присылать токены, пароли или платёжные реквизиты; достаточно итоговых статусов и скриншота без секретов.
## UA-002 — восстановить запуск GitHub Actions

- **Статус:** [ ] Ожидает проверки владельцем GitHub-аккаунта.
- **Приоритет:** блокирует автоматическое выполнение frontend/backend runtime tests и PostgreSQL integration workflow.
- **Почему требуется:** новые runs после коммитов этого сеанса `43929679075`, `43929679157`, `43929788159`, `43929788203` завершились `failure` примерно через две секунды. Для run `43929788159` GitHub Jobs API вернул jobs `frontend` (`133518807878`) и `backend` (`133518808328`) с `runner_id: 0`, `steps: []`; для run `43929788203` job `postgres-atomicity` (`133518808158`) также завершился до шагов. Следовательно, новые тесты, typecheck, build и SQL не стартовали; это pre-runner failure, не результат выполнения кода.
- **Что проверить в GitHub UI:**
  1. Открой GitHub → Settings аккаунта → Billing & Licensing → Budgets and alerts / Usage и проверь Actions usage, лимиты/бюджеты и наличие hard stop.
  2. Проверь статус платёжного метода и наличие просроченного платежа/ограничений аккаунта. Не отправляй сюда платёжные данные.
  3. Открой репозиторий `Diana-866/pinboard-ai` → Settings → Actions → General; проверь, что Actions разрешены, политика доступа к actions не блокирует workflows, а workflow permissions соответствуют требуемым read/write permissions.
  4. Если репозиторий принадлежит организации или находится под её политиками, попроси владельца/администратора организации проверить Actions policies и billing.
- **Передать ассистенту:** только краткий итог: есть ли hard stop/лимит, просроченный платёж или запрет Actions; включены ли Actions и какие workflow permissions выставлены. Секреты, платёжные реквизиты и токены не присылать.
- **Ограничения:** не менять workflow YAML, не выдавать новые permissions и не менять тариф/способ оплаты без отдельного согласования; сначала только прочитать настройки и сообщить результат.
- **Следующий шаг после результата:** повторно запустить/проверить workflow на актуальном `main`, убедиться, что у jobs появился runner и реальные steps. Только после фактического запуска анализировать логи тестов и устранять code failures.

- **Последняя проверка ассистентом (2026-11-16):** после новых frontend commits GitHub снова создал и сразу завершил без запуска runner следующие runs: `43931336693` (frontend/backend) и `43931336611` (postgres-atomicity). Jobs API для run `43931336693`: frontend job `133524232523` и backend job `133524233122`, оба `runner_id: 0`, `steps: []`; для run `43931336611`: postgres job `133524233003`, `runner_id: 0`, `steps: []`. Это подтверждает, что блокировка сохраняется и тестовые команды не стартовали. Vercel combined status для code commit `2a61bc317b2c8384aea20f572462076bcb655f61` также `failure` с target `build-rate-limit`; build log не предоставлен.
- **Атрибуция:** эту проверку runs/jobs выполнил ассистент через GitHub API; account billing/settings не видны из API и должны быть проверены владельцем аккаунта в UI.
- **Повторная проверка после billing fixes (2026-11-16):** runs `43932071627` (frontend/backend) и `43932071691` (postgres-atomicity) также завершились без запуска шагов. Jobs `133526852206` (backend), `133526852641` (frontend) и `133526852798` (postgres-atomicity) имеют `runner_id: 0`, `steps: []`. Дополнительные runs для audit commit `d55f4f9f7063853ac90dc9902ca1ad920985023d` также завершились `failure`; никаких test/build/SQL steps не выполнялось.
- **Vercel:** combined status для code commit `6b17db6fa8a0f0e850f79278eb02acaa31699f73` остаётся `failure`, target `build-rate-limit`; это не лог сборки и не подтверждение ошибки исходного кода.
- **Повторная проверка на актуальном main (2026-11-16, HEAD `5ed3e72f7f86dd4844fe8b63eae545edb8d2ecde`):** runs `43933655454` (Persisted boards integration checks) и `43933655423` (Atomic payment fulfillment integration) завершились `failure` за 1–2 секунды. Jobs `133532411549` (frontend), `133532412261` (backend) и `133532414220` (postgres-atomicity) имеют `runner_id: 0`, `steps: []`; ни typecheck, ни frontend/backend tests, ни SQL replay не стартовали. Это подтверждённый pre-runner blocker, не результат тестирования кода. Vercel combined status для HEAD `5ed3e72f7f86dd4844fe8b63eae545edb8d2ecde` остаётся `failure`, target `build-rate-limit`; build log отсутствует. Проверку runs/jobs и commit status выполнил ассистент через GitHub API; настройки billing/Actions account по-прежнему доступны только владельцу в UI.

- **Последняя проверка после frontend package 09 (2026-11-16, HEAD `4068f3a84a1e75aeeec602bde5bd06b42a2bcb84`):** run `43934289603` (Persisted boards integration checks) jobs `133534665248` (backend) и `133534665540` (frontend) завершились `failure` с `runner_id: 0`, `steps: []`. Run `43934289736` (Atomic payment fulfillment integration) job `133534667872` (postgres-atomicity) также завершился `failure` с `runner_id: 0`, `steps: []`, несмотря на промежуточный статус run `in_progress` в списке runs. Ни одна команда тестов, typecheck, build или SQL не стартовала. Vercel combined status для HEAD — `failure`, описание `Deployment rate limited — retry in 24 hours`, target `build-rate-limit`; это ограничение deployment, не build log. Проверка jobs/status выполнена ассистентом через GitHub API. UA-002 остаётся открытым до проверки владельцем billing/Actions settings.

- **Повторная проверка после package-09 onboarding fixes (2026-11-16, code commit `4d1d7785c453783ec512e45bab911d99ebec91dc`):** run `43934717765` (Persisted boards integration checks) jobs `133536188888` (backend) и `133536189382` (frontend) завершились `failure` с `runner_id: 0`, `steps: []`; run `43934717604` (Atomic payment fulfillment integration) job `133536188154` (postgres-atomicity) также завершился `failure` с `runner_id: 0`, `steps: []`. Ни тесты, ни typecheck/build, ни SQL replay не запускались. Vercel status для code commit — `failure`, описание `Deployment rate limited — retry in 24 hours`, target `build-rate-limit`; это deployment quota blocker, не результат сборки. Проверка выполнена ассистентом через GitHub API. UA-002 остаётся открытым до проверки владельцем GitHub billing/Actions settings.

- **Повторная проверка на актуальном main (2026-11-16, HEAD `9c13296c2b085613131dfd91fc2af7133b0e4b17`):** runs `43934727147` (Persisted boards integration checks) и `43934727130` (Atomic payment fulfillment integration) завершились `failure` до запуска runner. Jobs `133536221831` (frontend), `133536222301` (backend) и `133536219993` (postgres-atomicity) имеют `runner_id: 0`, `steps: []`; ни один тест, typecheck, build или SQL replay не выполнялся. Vercel combined status для HEAD также `failure`, target `build-rate-limit`, build log отсутствует. Результат получен ассистентом через GitHub API; проверка аккаунтных Actions budgets/permissions остаётся задачей владельца.

- **Последняя проверка после auth accessibility changes (2026-11-16, HEAD `eef583d3eeefadef4e01a4a315ef76dc418fc32a`):** на ближайшем code commit `277dfe9f6925b5213fa170d4a12475ded11fee9b` run `43934941679` (Persisted boards integration checks) jobs `133536953346` (frontend) и `133536953936` (backend) завершились `failure` с `runner_id: 0`, `steps: []`; run `43934942905` (Atomic payment fulfillment integration) job `133536957984` (postgres-atomicity) также завершился `failure` с `runner_id: 0`, `steps: []`. Более новые runs `43934960067` и `43934959915` на HEAD были в состоянии `queued` при проверке; они не доказывают запуск шагов. Vercel status на code commit — `failure`, описание `Deployment rate limited — retry in 24 hours`, target `build-rate-limit`. Ни тесты, ни typecheck/build, ни SQL replay не подтверждены как запущенные. UA-002 остаётся открытым; проверить account billing, Actions policies/permissions и затем повторно подтвердить реальные runner/steps.

- **Повторная проверка на актуальном main (2026-11-16, HEAD `2d0197be25d8467618bb51c51348074033eb3e9b`):** runs `43934958706` (frontend/backend) и `43934958250` (postgres-atomicity) завершились `failure` без запуска runner. Jobs `133537015661` (backend), `133537016279` (frontend) и `133537014159` (postgres-atomicity) имеют `runner_id: 0`, `steps: []`; тесты, typecheck, build и SQL replay не стартовали. Vercel combined status для HEAD — `failure`, target `build-rate-limit`, build log отсутствует. Это инфраструктурный pre-runner/deployment-rate-limit blocker, а не подтверждённый code failure. Проверку выполнил ассистент через GitHub API; account billing/Actions settings остаются owner-only.

- **Последняя проверка после package-09 навигационной локализации (2026-11-16, HEAD `d30768512b154a002b35d179734faded81c6b62f`):** run `43935273966` (Persisted boards integration checks) jobs `133538115121` (frontend) и `133538115605` (backend), а также run `43935274026` (Atomic payment fulfillment integration) job `133538115975` (postgres-atomicity) завершились `failure` с `runner_id: 0`, `steps: []`. Runs `43935281863` и `43935281923` на предыдущем state commit были `queued` при проверке; это не подтверждает выполнение шагов. Vercel status для HEAD — `failure`, `Deployment rate limited — retry in 24 hours`, target `build-rate-limit`. Ни тесты, ни typecheck/build, ни SQL replay не подтверждены как запущенные. UA-002 остаётся открытым до проверки владельцем GitHub billing/Actions settings.

- **Проверка после очередных package-09 commits (2026-11-16, HEAD `0c542bbd53c319738b67ede5b6b1d742340f20d7`):** run `43935341632` (Persisted boards integration checks) jobs `133538351601` (backend) и `133538352186` (frontend), а также run `43935341604` (Atomic payment fulfillment integration) job `133538352735` (postgres-atomicity) завершились `failure` с `runner_id: 0`, `steps: []`. Ни одна test/typecheck/build/SQL step не запускалась. Vercel status для HEAD — `failure`, описание `Deployment rate limited — retry in 5 minutes`, target `https://vercel.com/docs/limits#rate-limits`; это rate-limit response, не build log. UA-002 остаётся открытым; после проверки billing/Actions settings владельцем повторить проверку с реальным runner.

- **Последняя проверка после package-09 password-toggle fixes (2026-11-16):** актуальный `main` HEAD `11267635ff05333d1d15754f7e7fa79f20f85964` (документационный commit; последний code HEAD в проверенном CI — `0c542bbd53c319738b67ede5b6b1d742340f20d7`). Runs `43935341632` (frontend/backend) и `43935341604` (postgres-atomicity) завершились `failure` до запуска runner. Jobs `133538351601` (backend), `133538352186` (frontend), `133538352735` (postgres-atomicity) имеют `runner_id: 0`, `steps: []`. Vercel combined status для текущего HEAD — `failure`, target `build-rate-limit`, build log отсутствует. Никакие runtime checks не запускались; owner должен проверить Actions billing/permissions и Vercel quota.

- **Повторная проверка после обновления паспорта проекта (2026-11-16, HEAD `9c0c863617d4c965594223a5ab6bd767ba1f75dd`):** runs `43935408594` (Atomic payment fulfillment integration) job `133538587572` (postgres-atomicity), и `43935408658` (Persisted boards integration checks) jobs `133538587582` (frontend), `133538587982` (backend) завершились `failure` с `runner_id: 0`, `steps: []`. Это повторное pre-runner failure; никакие тесты/build/SQL не исполнялись. UA-002 остаётся открытым до проверки настроек GitHub account billing и Actions permissions владельцем.


- **Повторная проверка после package-09 auth form fixes (2026-11-16):** актуальный `main` HEAD на момент чтения — `dd0425b157067b42ec7ca1451025bc70358f0f1f`. Runs `43935515983` (Persisted boards integration checks) jobs `133538953685` (frontend) и `133538954674` (backend), а также `43935516070` (Atomic payment fulfillment integration) job `133538954752` (postgres-atomicity) завершились `failure`; все три jobs имеют `runner_id: 0`, `steps: []`. Следовательно, frontend/backend tests, typecheck, build и SQL replay не запускались. Vercel status текущего HEAD — `failure`, `Deployment rate limited — retry in 24 hours`, target `build-rate-limit`; это лимит платформы, не ошибка сборки. UA-002 остаётся открытым; требуется проверка владельцем GitHub billing/Actions permissions и Vercel quota.


- **Проверка после FE-19 review localization (2026-11-16):** code/documentation HEAD для workflow run — `c7315a3c086226566e6c7c0f3fced2fb40691954`. Runs `43935942411` (Persisted boards integration checks) jobs `133540420412` (backend) и `133540421082` (frontend), а также `43935942502` (Atomic payment fulfillment integration) job `133540420758` (postgres-atomicity) завершились `failure`; все три jobs имеют `runner_id: 0`, `steps: []`. Runtime tests/typecheck/build/SQL не запускались. Для более позднего документационного HEAD `abce40fa9a0fb682e4a4efe8e822085138d980a7` Vercel commit status пока не вернул запись; последняя явная Vercel запись остаётся rate-limit failure на предыдущем HEAD, а не source build failure. UA-002 остаётся открытым до проверки владельцем GitHub billing/Actions permissions.

- **Повторная проверка после FE-19/FE-20/FE-21 frontend changes (2026-11-16, code HEADs `23a74a15b119ca777421b9fc9755a70c76405319` and documentation HEAD `2cfa001edf1323127fdd1cbb3a91f01a170b3bbb`):** runs `43936022163` (frontend job `133540697637`, backend job `133540698428`), `43936022278` (postgres-atomicity job `133540696410`), `43936068684` (frontend `133540857753`, backend `133540858236`), `43936068473` (postgres-atomicity `133540857429`) and `43936085788` (postgres-atomicity `133540918186`) all ended `failure` with `runner_id: 0`, empty runner name and zero steps. No frontend/backend tests, typecheck, build or SQL replay started. Vercel combined status for documentation HEAD `2cfa001edf1323127fdd1cbb3a91f01a170b3bbb` is `failure` with target `build-rate-limit`; no successful deployment/build is confirmed. Проверку выполнил ассистент через GitHub API; account billing/Actions policies remain owner-only. UA-002 remains open.


- **Последняя проверка после FE-23 (2026-11-16, main HEAD `9f411b51c451043ad76748db9ee3ba6736c83fb3`):** run `43936215441` (Persisted boards integration checks) jobs `133541370353` (frontend) и `133541370620` (backend), а также run `43936215453` (Atomic payment fulfillment integration) job `133541370957` (postgres-atomicity) завершились `failure` до runner; все три имеют `runner_id: 0`, `steps: []`. Ни тесты, ни typecheck, ни build, ни SQL replay не запускались. Vercel status текущего HEAD — `failure`, `Deployment rate limited — retry in 24 hours`, target `build-rate-limit`; это platform quota, не source build failure. UA-002 остаётся открытым до проверки владельцем GitHub billing/Actions permissions и Vercel quota.

- **Повторная проверка после FE-23 locale contract updates (2026-11-16, code HEAD `9f411b51c451043ad76748db9ee3ba6736c83fb3`):** runs `43936194510` (frontend `133541299073`, backend `133541299919`), `43936194498` (postgres-atomicity `133541298707`), `43936203945` (backend `133541330744`, frontend `133541331112`), `43936204010` (postgres-atomicity `133541330743`), `43936215441` (frontend `133541370353`, backend `133541370620`) and `43936215453` (postgres-atomicity `133541370957`) all completed `failure` in 1–2 seconds with `runner_id: 0`, empty runner name and zero steps. No test/typecheck/build/SQL command started. Vercel status for `9f411b51c451043ad76748db9ee3ba6736c83fb3` is `failure`, target `build-rate-limit`; no build success or deployment confirmed. Проверка через GitHub API; owner billing/Actions settings remain outstanding. UA-002 remains open.

- **Повторная проверка после package-09 notification/review localization (2026-11-16, main HEAD `b6b7e5f222f949d3ecab2d75588ed5bbf7ee361f`):** runs `43936287500` (backend `133541622532`, frontend `133541622835`), `43936298152` (frontend `133541658541`, backend `133541658617`), `43936298555` (postgres-atomicity `133541659573`), `43936312834` (frontend `133541711465`, backend `133541712021`) and `43936312843` (postgres-atomicity `133541710954`) all completed `failure` in 1–2 seconds with `runner_id: 0`, empty runner name and zero steps. No frontend/backend tests, typecheck, build or SQL replay started. Vercel status for this HEAD remains `failure`, target `build-rate-limit`; no build/deployment success confirmed. UA-002 remains owner action.

## UA-003 — подтвердить production account-deletion worker и точность privacy disclosures

- **Статус:** [ ] Ожидает проверки владельцем production-инфраструктуры.
- **Приоритет:** до публичного запуска. В privacy policy заявлено удаление персональных данных и OAuth-токенов в течение 30 дней, но код принимает запрос на удаление только если worker включён.
- **Что установлено по коду:** `backend/accountDeletionWorkerGate.js` включает pipeline только при `ACCOUNT_DELETION_WORKER_ENABLED=true`. `backend/index.js` запускает embedded worker только при этом opt-in и пишет `account_deletion_worker.disabled_in_production`, если в production флаг выключен. `POST /account/deletion-request` в таком случае возвращает 503 (fail closed); при включённом worker требуется повторный пароль, RPC увеличивает `token_version` и закрывает сессии, а отдельный worker выполняет этапы инвентаризации/отзыва Pinterest/удаления/финализации. Production env и логи ассистенту недоступны.
- **Что проверить в Render production (только чтение):**
  1. Есть ли `ACCOUNT_DELETION_WORKER_ENABLED=true` в environment backend service. Не присылай значение других переменных и секреты.
  2. В свежих deploy/runtime logs присутствует ли `account_deletion_worker.enabled`, а не `account_deletion_worker.disabled_in_production`.
  3. Есть ли регулярные `account_deletion_worker.batch_completed` и нет ли повторяющихся ошибок/застрявших deletion jobs. Не создавай тестовое удаление реального аккаунта.
  4. Подтверди, что реально можно выполнить полный цикл удаления в staging/test account и соблюсти 30-дневный срок. Если worker ещё не готов, не включай его в production вслепую; сначала staging validation, затем согласовать корректировку политики с юристом.
- **Privacy policy / инфраструктура:**
  5. Подтверди, что bucket `pin-images` действительно public и что Pinterest-compatible image URLs требуют такой доступности. Русская политика синхронизирована с уже существующим английским disclosure о публичных URL изображений (commit `0cd90e941deecd487f9a086037d10569eee222c5`).
  6. Сверь фактические subprocessors и регионы обработки данных с обеими privacy policy: GPTunnel, Render, Supabase, Pinterest, Prodamus и почтовый провайдер. Если provider/region изменился, нужно обновить RU/EN policy до запуска пользователей.
  7. Проверь точность публичных реквизитов оператора, статуса самозанятого, INN и `support@pinposy.com`, а также условий возврата/сроков оплаты. Не присылай сюда документы или платёжные данные.
- **Передать ассистенту:** только статус флага worker (включён/выключен), наличие worker startup/batch log, подтверждение staging deletion cycle, актуальные провайдеры/регионы и перечень нужных правок policy. Не отправляй секреты, токены, пароли, полные банковские данные или персональные документы.
- **Ограничения:** не менять production environment, не включать worker, не выполнять удаление реального аккаунта и не менять юридические условия без отдельного согласования.
- **Следующий шаг после результата:** сопоставить production конфигурацию с deletion SLA, подтвердить staging proof и при необходимости подготовить согласованные RU/EN legal changes. Затем повторить account lifecycle checks на disposable test account.
- **Повторная проверка после package-09 accessibility/i18n изменений (2026-11-16):** runs `43934977585` (frontend/backend) и `43934977547` (postgres-atomicity) завершились `failure` без запуска runner. Jobs `133537084072` (backend), `133537084568` (frontend) и `133537084111` (postgres-atomicity) имеют `runner_id: 0`, `steps: []`. Vercel status для актуального code commit `119587c602bba7fb5b322e5378cb40d0c30ca74e` — `failure`, target `build-rate-limit`; это не build log.
- **Атрибуция:** проверка выполнена ассистентом через GitHub Actions API; account billing, limits, payment status and Actions policies остаются невидимыми без доступа владельца аккаунта.
- **Повторная проверка после локализации ManualApprovalDesk и account-scoped notifications (2026-11-16):** runs `43936156788` (frontend/backend) и `43936156342` (postgres-atomicity) снова завершились до выполнения шагов. Jobs `133541166488` (backend), `133541167318` (frontend) и `133541164336` (postgres-atomicity) имеют `runner_id: 0`, `steps: []`. Vercel combined status для code commit `173eb0dc607eacd5369dbb7836b66339610caf16` остаётся `failure`, target `build-rate-limit`; это не результат сборки.
- **Вывод:** frontend/backend tests, SQL integration и build по-прежнему не запускались. UA-002 остаётся обязательным действием владельца; проверка billing/Actions settings в UI не может быть выполнена через GitHub repository API.

- **Повторная проверка CI на main HEAD `0cc7a1fd3fac03a56a29beb1e6b2d51236ff00a6` (2026-11-16):** runs `43938584575` и `43938584552` завершились failure до назначения runner. Jobs: backend `133549670286`, frontend `133549670716`, postgres-atomicity `133549670628`; у всех `runner_id=0`, пустой `runner_name`, `steps=[]`, длительность около двух секунд. Тестовые команды не стартовали. Это не результат проверки приложения. Владелец по-прежнему должен выполнить UA-001 (четыре read-only команды проверки PostgreSQL 18 и места на X:) и UA-002 (проверить GitHub billing/Actions policies и доступность self-hosted Windows runner). Не запускать replay на существующем пользовательском кластере, PIN_TRIAL или production. Скрипты на текущем main перепроверены: Linux использует локальный Unix socket и явный порт; Windows — `127.0.0.1` и явный порт. В этой среде ассистента PostgreSQL/Docker/PowerShell/checkout отсутствуют, поэтому воспроизвести DB gate здесь нельзя.


- **Дополнительная проверка CI после документационного commit на main (2026-11-16):** runs `43938802993` и `43938802951` на HEAD `8c796d9877683e4cfdbe47ba3c74116c9df484dd` завершились failure до запуска workflow steps. Jobs: postgres-atomicity `133550441606`, backend `133550439503`, frontend `133550440315`; у всех `runner_id=0`, пустой `runner_name`, `steps=[]`. Команды тестов и replay не выполнялись. Это очередное подтверждение недоступности runner, а не ошибка тестируемого кода. Требуются UA-001 (read-only проверка локальных PostgreSQL 18 binaries и свободного места) и UA-002 (проверка владельцем GitHub billing/Actions policy и доступности Windows self-hosted runner). Никакие пароли/секреты не запрашиваются; существующий PostgreSQL cluster не останавливать и не использовать для replay.


- **CI runner status / изменение фильтрации документационных коммитов (2026-11-16), окончательный результат:** runs `43939013573` и `43939013494` завершились failure до назначения runner. Jobs: postgres-atomicity `133551186427`, frontend `133551185805`, backend `133551186476`; у всех `runner_id=0`, пустой `runner_name`, `steps=[]`. Workflow-file commits сами запустили CI, что ожидаемо: фильтры игнорируют docs/README, а не изменения .github/workflows. В обоих workflow filters проверены в push и pull_request; ручной `workflow_dispatch` сохранён. Будущие docs-only коммиты должны обходить эти два workflow. UA-002 остаётся нерешённым: требуется проверка GitHub billing/Actions policies и online Windows self-hosted runner.

- **CI после package-09 FE-25 (2026-11-16, code commit cebbe9ca537dd51349876f4e757db1f0efbc12fe):** runs `43940229730` (Atomic payment fulfillment integration, postgres-atomicity job `133555483026`) и `43940229160` (Persisted boards integration checks, backend job `133555481123`, frontend job `133555481704`) завершились `failure` до выделения runner. Все три job имеют `runner_id: 0`, пустой `runner_name`, `steps: 0`; workflow-команды не стартовали. Это не результат тестов приложения. Account-level billing/Actions policy и online self-hosted runner остаются недоступны через repository API; UA-002 остаётся действием владельца. Никакие платежные данные или секреты не нужны. Новый актуальный main после документационной записи: `a8f9343a3100ce5a0ad505a6ee98068f4bd4ebb6`.
- **CI после package-09 FE-26 (2026-11-16, code commit `4556683c2540b5513ddc490d29d8de2d196ca2f5`):** runs `43940507484` (Persisted boards integration checks: frontend job `133556452273`, backend job `133556452724`) и `43940506056` (Atomic payment fulfillment integration: postgres-atomicity job `133556446415`) завершились `failure` до назначения runner. Все три job имеют `runner_id: 0`, пустой `runner_name`, `steps: 0`; workflow-команды не стартовали. Это не результат frontend/backend/SQL tests. UA-002 остаётся действием владельца: проверить account billing/usage и Actions policies, а также доступность online Windows self-hosted runner с требуемыми labels. Секреты и платёжные данные не нужны.

- **Повторная preflight-проверка ассистентом (2026-11-16, актуальный main HEAD `cb0f6148695c2e020c756b58796d8a10d3dceba8`):** заново прочитаны `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, `backend/package.json` и `frontend/package.json`; подтверждено, что обязательный NEXT не изменился: clean disposable PostgreSQL replay `001_baseline.sql` + migrations `010–148`, затем SQL integration и backend runtime suite. Main HEAD подтверждён через GitHub commit search; combined status HEAD содержит Vercel `failure` с target `build-rate-limit`, то есть quota/rate limit, а не результат сборки. Повторная проверка текущей Linux execution-среды: Node `v22.16.0`, npm `10.9.2`; `psql`, `postgres`, `initdb`, `pg_ctl`, Docker, Podman, PowerShell/pwsh отсутствуют; PostgreSQL socket directories отсутствуют; локального checkout в `/mnt/data` нет. Следовательно, disposable replay из этой среды невозможен. Это не проверка компьютера пользователя. UA-001 остаётся ожидающей: нужны только четыре read-only PowerShell outputs, уже перечисленные выше; после них можно подготовить отдельный disposable cluster и не трогать существующий PostgreSQL data directory. UA-002 остаётся ожидающей проверки владельцем GitHub Actions billing/policies/runner. Никакие миграции, тесты, production/PIN_TRIAL DB, платежи, Pinterest или deployment не запускались/не менялись. Не создавалась фиктивная отметка о прохождении gate; NEXT не обходился.


- **Продолжение preflight ассистентом (2026-11-16, перед проверкой main HEAD 9fbe4ddf8cb3cdc0bee4c1379e458a6efd7b0925):** повторно сверены scripts/verify.sh (blob 63b605d6e079275c0dd8c41de549f9a997dcee4a), scripts/verify.ps1 (blob 6614843edaafd4924c90c679a0f9fe232e59a0f0), workflow YAML для PostgreSQL atomicity и persisted boards. Оба workflow используют ubuntu-latest, но прошлые попытки не выделяли runner; PR #90 — отдельный Windows self-hosted workflow, остаётся open и не объединён. Повторно исследована доступность изолированного replay в Linux container: процесс root, git и apt-get доступны, но psql/postgres/initdb/pg_ctl отсутствуют; локальный apt cache не содержит пакета PostgreSQL, а DNS для github.com не разрешается (git ls-remote завершился Could not resolve host). Установка PostgreSQL и получение checkout из этой среды поэтому сейчас невозможны. Важно: это новый assistant container, а не пользовательский Windows ПК; UA-001 не закрыт и replay не выполнялся. Скрипт verify.sh --migrations-only явно требует psql и локальный Unix socket /var/run/postgresql, проверяет точную цепочку 139 миграций 010–148, создаёт только уникальную disposable DB и удаляет только её; он не подключается к удалённой/production БД. Windows verify.ps1 -MigrationsOnly требует локальный psql и loopback 127.0.0.1. NEXT не обойдён; код/SQL/production не менялись. UA-001 и UA-002 по-прежнему требуют действий владельца, описанных выше.

- **Актуальная preflight-проверка перед обязательным DB gate (2026-11-16, main HEAD на момент проверки `f6fe3893958373cbade6122ab5372f0b0b44b65b`):** повторно прочитаны `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, `scripts/verify.ps1` и `scripts/verify.sh`. NEXT не изменён: только clean disposable PostgreSQL replay baseline `db/migrations/001_baseline.sql` + migrations `010–148` (139 files), затем SQL integration и backend runtime. В assistant container фактически проверено: Debian 13, Node v22.16.0/npm 10.9.2; `psql`, `postgres`, `initdb`, `pg_ctl`, Docker, Podman, PowerShell/pwsh отсутствуют; `apt-cache policy postgresql` не показывает candidate; DNS lookup `github.com` не возвращает адрес; checkout отсутствует. Ни установка, ни replay не состоялись и не запускались. Это не проверка Windows ПК пользователя. Не запускать replay на существующем кластере PostgreSQL 18, `PIN_TRIAL` или production.

  **Дополнительная проверка UA-002 / PR #90:** PR #90 повторно прочитан через GitHub; он по-прежнему `open`, `draft`, `merged=false`, base SHA `0b856ae4965eb41b5fc4def364941c63629edb4a` отстаёт от актуального main. Его Windows job run `43908889550` / job `133445082390` всё ещё `queued`, без назначенного runner и без шагов; labels требуются `self-hosted`, `Windows`, `X64`. Это не доказательство, что runner установлен или online. Официальная документация GitHub указывает, что self-hosted runner должен быть online/idle и совпадать со всеми `runs-on` labels; список доступен в репозитории → Actions → Management → Runners → Self hosted (либо Settings → Actions → Runners). Windows 10/11 x64 поддерживаются. Справка: https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow и https://docs.github.com/en/actions/reference/runners/self-hosted-runners . Для регистрации runner GitHub выдаёт временный registration token; не присылать ассистенту token и не публиковать его.

  **Vercel:** combined status текущего документационного HEAD `f6fe3893958373cbade6122ab5372f0b0b44b65b` — `failure` с target `build-rate-limit`; это deployment quota, не результат build. Не пытаться многократно запускать deploy до снятия лимита.

  **Что остаётся от владельца:** UA-001 — только четыре уже перечисленные read-only PowerShell-команды, чтобы подтвердить бинарники PostgreSQL 18 и свободное место X:. UA-002 — проверить GitHub Actions billing/usage, hard stop/permissions и наличие runner со статусом Online/Idle и нужными labels. Не устанавливать runner и не менять account settings без необходимости/понимания последствий; сначала прислать только безопасный итог без секретов. До получения результатов UA-001/UA-002 и успешного реального replay ни один DB/backend runtime gate не закрывать.


- **Повторная попытка GitHub Actions после transient retry (2026-11-16):** на актуальном main HEAD `d7a3a27093e553621f15abd87191483a2424e837` повторно запрошен rerun failed jobs для run `43942173293` (atomic payment / postgres-atomicity) и `43942173514` (persisted boards / frontend + backend); API принял оба запроса. Attempt 2 завершился за 2 секунды: job `133563989630` postgres-atomicity, `133564011092` frontend и `133564011478` backend — все `failure`, `runner_id: 0`, пустой runner name, `steps: []`, labels `ubuntu-latest`. Checkout, npm ci, tests, build и SQL commands не стартовали. Логи jobs недоступны (GitHub log blob 404 для этих jobs), поэтому точную первопричину allocation отказа API не раскрывает. Это не failure приложения и не результат миграций. Не запускать повторные retries без новой причины/изменения доступности runner: повтор не помог. Владелец всё ещё должен проверить GitHub Actions account usage/billing/policies и наличие self-hosted runner online/idle; UA-001 остаётся необходимым для Windows disposable PostgreSQL cluster. Никакие секреты не запрашивались, настройки GitHub/runner не менялись.


- **Обновление preflight 2026-11-16 (main HEAD `4b3d187897a82bc8c8a83813bc4c2684d3ba66dd`):** повторно подтверждено, что обязательный DB gate остаётся заблокирован до UA-001/безопасной изолированной среды. Assistant container: Debian 13, Node v22.16.0/npm 10.9.2/git есть; PostgreSQL binaries/client, Docker/Podman, PowerShell, socket dirs и checkout отсутствуют; DNS github.com не разрешается. Никакой replay или runtime tests не запускался.
  - PR #90: всё ещё open/draft/unmerged; head `27f0f6a1e9f0b8e1e3e7f8e3aa9fe4ff38662157`; compare с main `4b3d187897a82bc8c8a83813bc4c2684d3ba66dd` = diverged, 3 commits ahead / 455 behind. GitHub metadata `mergeable=true` не отменяет divergence и не означает, что PR безопасно обновлять/сливать. Run `43908889550` и job `133445082390` по-прежнему queued; шаги не начались, runner не назначен. Не выполнять повторные retry и не делать массовый update branch/rebase.
  - Combined status main HEAD: Vercel `failure`, target `build-rate-limit`; это quota blocker, не доказательство успешной или неуспешной сборки приложения.
  - UA-001 (read-only проверка локальных PostgreSQL 18 binaries/free space), UA-002 (Actions billing/permissions + matching Windows runner Online/Idle), UA-003 (production account-deletion worker/privacy disclosure) остаются открытыми. Секреты/пароли/runner registration tokens не запрашивать. Не трогать существующий кластер, PIN_TRIAL или production.


- **Повторная preflight-сверка 2026-11-16 (main HEAD `1bd5423eb3126bc3bcb9c50e7dbbb82ca56d4132`):** актуальные NEXT и скрипты проверены заново. Assistant environment: Debian 13; Node v22.16.0/npm 10.9.2/git доступны, но PostgreSQL binaries/client, Docker/Podman, PowerShell/pwsh и checkout отсутствуют; PostgreSQL socket dirs нет, DNS github.com не разрешается. Clean replay и backend runtime suite не запускались.
  - Main HEAD не имеет новых Actions runs для docs-only commit (workflow path filters исключают docs); combined status — Vercel `failure`, target `build-rate-limit`, не результат сборки приложения.
  - PR #90 сейчас `open`, `draft`, `merged=false`, `mergeable=false`; compare с main: `diverged`, 3 commits ahead / 456 behind. Windows run `43908889550`, job `133445082390` всё ещё queued без steps/назначенного runner. Не объединять и не обновлять эту устаревшую ветку автоматически.
  - UA-001 (четыре read-only PowerShell проверки PostgreSQL 18/free space), UA-002 (GitHub Actions billing/policies и Windows runner Online/Idle), UA-003 (production account-deletion worker/privacy disclosures) остаются ожидающими. Не присылать пароли, токены или secrets. Не трогать существующий PostgreSQL cluster, PIN_TRIAL или production.


- **Сверка обязательного DB gate 2026-11-16 (main HEAD `e3db7f8523b43594fc55215b351d87d53d1b8240`):** повторно проверены проектный паспорт, scripts, migration-chain test и canonical baseline. Требуемый порядок не изменился: disposable PostgreSQL replay `001_baseline.sql` + ровно 139 migrations `010–148`, затем SQL integration и backend runtime. В assistant environment PostgreSQL binaries/client, Docker/Podman, PowerShell/pwsh и checkout отсутствуют; DNS GitHub не разрешается. Никакие replay/tests/DB commands не запускались. PR #90 остаётся open/draft/unmerged; compare с main теперь `diverged`, 3 commits ahead / 457 behind (ранее было 456); metadata `mergeable=true` не отменяет отставание. Windows job `43908889550` / `133445082390` всё ещё queued, без steps/runner assignment. Текущий main docs HEAD: Actions runs не обнаружены, Vercel status `failure` target `build-rate-limit` (deployment quota, не build result). UA-001/002/003 остаются открытыми. **После возвращения владельца:** выполнить UA-001 четырьмя read-only командами для PostgreSQL 18 binaries и свободного места X:, затем перед созданием отдельного disposable cluster согласовать следующий шаг; проверить UA-002 (Actions billing/policies и Windows runner Online/Idle с labels `self-hosted`, `Windows`, `X64`). Не присылать секреты, пароли или runner registration tokens. Не трогать существующий PostgreSQL cluster, `PIN_TRIAL` или production.

## UA-001 — disposable PostgreSQL 18 replay (обновление 2026-11-16)

**Согласование владельца получено:** разрешён отдельный временный PostgreSQL cluster только в новом каталоге на X:, на отдельном порту, bind только `127.0.0.1`. Существующий кластер (включая работающий ранее обнаруженный процесс `postgres.exe` PID 5632), `PIN_TRIAL` и production не трогать.

**Действие владельца, Step 1 (read-only preflight):**
- Каталог `X:\\PinPosy-verify-pg18`: свободен (Test-Path = false).
- TCP port `55439`: свободен (Get-NetTCPConnection -LocalPort 55439 -State Listen не вернул listener).
- `X:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe`: найден (Test-Path = true).
- `pg_ctl --version`: PostgreSQL 18.6.
- Предыдущий preflight: `initdb.exe` и `pg_ctl.exe` версии 18.6, `postgres.exe` найден, X: свободно 167,962,349,568 bytes; работающий postgres PID 5632 не останавливался и не изменялся.

**Что это подтверждает:** можно продолжать подготовку изолированного временного кластера. Это НЕ означает, что кластер создан или миграции выполнены.

**Следующий шаг:** сверить initdb authentication options и создать новый data directory только после повторной проверки отсутствия каталога и доступности порта. Любая команда подключения/создания БД должна использовать явный host `127.0.0.1` и порт `55439`. Не использовать системный/default port 5432. Не запускать `scripts/verify.ps1 -MigrationsOnly` до проверки, что соединение идёт именно к новому disposable cluster и роль/аутентификация корректны.


### UA-001 — уточнение PostgreSQL client PATH (2026-11-16)

Владелец прислал результат проверки: `pg_ctl` и `psql` версии 18.6 доступны в `X:\\Program Files\\PostgreSQL\\18\\bin`. Однако системный `Get-Command psql` указывает на PostgreSQL 17: `C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe`. Для migration replay нельзя полагаться на неявный поиск `psql` в PATH: нужно вызывать бинарник PG18 полным путём (или временно изменить PATH только в текущем окне PowerShell). В сообщении отсутствовал вывод `initdb.exe --help`; параметры auth пока не подтверждены. Каталог и кластер не создавались, сервер не запускался.


### UA-001 — initdb options verified (2026-11-16)

Полный вывод `initdb.exe --help` получен. Подтверждены параметры `--auth-host`, `--auth-local`, `-U`, `-W`, `-D`, `-k`. План инициализации отдельного временного кластера:
- каталог: `X:\\PinPosy-verify-pg18` (проверен как отсутствующий);
- роль суперпользователя: `pinposy_verify_admin`;
- TCP и local auth: `scram-sha-256`;
- пароль вводится интерактивно, не присылается ассистенту и не включается в команду;
- бинарник вызывается полным путём PG18, так как PATH указывает на psql PG17.
На момент записи initdb ещё не запускался. Следующий пользовательский шаг — повторно проверить отсутствие каталога и выполнить только initdb; запуск сервера будет отдельным последующим шагом с bind только на 127.0.0.1 и port 55439.


### UA-001 — PostgreSQL 18 initdb completed (2026-11-16)

Пользователь выполнил инициализацию нового кластера в `X:\\PinPosy-verify-pg18`. Вывод подтверждает успешное завершение (Готово), роль `pinposy_verify_admin`, SCRAM-SHA-256 для TCP/local и включённые data checksums. Пароль вводился интерактивно, в переписке не раскрывался.
**Обнаруженный нюанс:** Windows выбрал локаль `Russian_Russia.1251`, поэтому initdb создал кластер с encoding `WIN1251`. До запуска сервера требуется read-only проверка, что все SQL-входы для replay (stub, canonical baseline, активные migrations 010–148) совместимы с WIN1251, а также согласовать client encoding. Пока сервер не запускался; порт 55439 не использовался; существующий PID 5632, PIN_TRIAL и production не затронуты. Ничего не удалять и не переинициализировать без отдельного согласия пользователя.


### UA-001 — SQL encoding preflight passed (2026-11-16)

Пользователь запустил read-only PowerShell проверку 141 SQL-файла: `db/supabase-stub.sql`, `db/migrations/001_baseline.sql`, 139 активных миграций 010–148. Все файлы строго декодированы из UTF-8 и проверены на представимость в Windows-1251. Итог: 141 проверено, 0 несовместимых. Проверка не исполняла SQL и не доказывает успешность replay. Следующий шаг — повторная проверка целевого data directory и свободного TCP 55439, затем запуск только на 127.0.0.1:55439.


### UA-001 — disposable PostgreSQL 18 server started (2026-11-16)

Пользователь проверил временный data directory `X:\\PinPosy-verify-pg18`: файл `PG_VERSION` содержит `18`; TCP port `55439` был свободен. После этого выполнил запуск через PG18 `pg_ctl.exe` с явными параметрами `-h 127.0.0.1 -p 55439 -c listen_addresses=127.0.0.1`. Фактический вывод: «ожидание запуска сервера.... готово», «сервер запущен»; проверка `$LASTEXITCODE -ne 0` не сработала, значит команда завершилась успешно. Это ещё не независимая проверка listener/процесса/каталога. SQL, миграции и создание тестовой БД не выполнялись. Следующее действие — read-only подтверждение статуса, loopback listener, процесса и параметров сервера через PG18 psql.


### UA-001 — PostgreSQL 18 server identity and loopback isolation verified (2026-11-16)

Пользователь выполнил read-only проверки временного кластера. `pg_ctl status` сообщил PID `15220` и executable `X:/Program Files/PostgreSQL/18/bin/postgres.exe`, data directory `X:/PinPosy-verify-pg18`, параметры `-h 127.0.0.1 -p 55439 -c listen_addresses=127.0.0.1`. `Get-NetTCPConnection` показал listener `127.0.0.1:55439`, PID 15220. PG18 `psql.exe` read-only запрос вернул: database `postgres`, user `pinposy_verify_admin`, server address `127.0.0.1`, port `55439`, data directory `X:/PinPosy-verify-pg18`, server encoding `WIN1251`, version `PostgreSQL 18.6`. Пароль вводился локально, в переписке не раскрывался. Подтверждено, что временный сервер слушает только loopback. Миграции не выполнялись и тестовая БД не создавалась. Перед следующим этапом нужно сверить локальный checkout с main, проверить хэш скрипта и корректно выставить PG18 `psql` в PATH плюс `PGUSER=pinposy_verify_admin` только в текущем PowerShell-сеансе (verify.ps1 не задаёт `-U` явно).


### UA-001 — локальная ветка отстаёт от GitHub main (2026-11-16)

Пользователь выполнил `git fetch origin`. Получено: локальный HEAD `0d393d34a0fbccf24dc46eefe5bf69281db965c5`, `origin/main` `ab5ab3e83f3f2bef68b6715b92d37a68cefc0320`, статус `main...origin/main [behind 420]`; `git status --short --branch` не показал незакоммиченных изменений. Хэш локального `scripts/verify.ps1` равен `6614843edaafd4924c90c679a0f9fe232e59a0f0` и совпадает с проверенным GitHub-файлом. Локальная ветка в целом устарела на 420 коммитов. Рекомендован следующий шаг: fast-forward only pull, без merge commit и без reset. Никаких миграций или тестов не запускалось.


### UA-001 — fast-forward sync локального main завершён (2026-11-16)

Пользователь выполнил `git pull --ff-only origin main`; операция прошла успешно. Локальная ветка обновлена с `0d393d34a0fbccf24dc46eefe5bf69281db965c5` до `ba6caa67ad9903b964172e9d0ce2d5609be0bbd0`, fast-forward затронул 90 файлов (4221 insertions, 705 deletions). После операции `git status --short --branch` вывел `## main...origin/main` (чисто), `git rev-parse HEAD` — `ba6caa67ad9903b964172e9d0ce2d5609be0bbd0`. Локальный checkout синхронизирован с origin/main. Никакие тесты и миграции не запускались. Следующий шаг — контролируемый migration-only replay на временном PG18 cluster (127.0.0.1:55439), без frontend/backend проверок.


## UA-001 — повторить migration replay после исправления 140 (2026-11-16)

- Первый локальный replay на временном PostgreSQL 18.6 достиг migration 140 и завершился с SQL syntax error. Disposable DB `pinposy_verify_13212ccdd0602` успешно удалена самим verify script; временный cluster `X:\\PinPosy-verify-pg18` на `127.0.0.1:55439` оставлен работающим.
- Исправление migration 140 уже находится в GitHub main: `b2cb16ca75d7723f345ecd270cb77cc72149be51`. В локальном checkout пользователя всё ещё старая версия файла, поэтому повторный запуск до fast-forward sync запрещён.
- **Единственное необходимое действие владельца:** выполнить `git pull --ff-only origin main` из корня репозитория, затем прислать только вывод `git rev-parse HEAD` и `git hash-object db/migrations/140_account_deletion_review_queue_image_manifest.sql`. Пароли/секреты не присылать. После сверки ассистент подготовит один обновлённый блок повторного replay с проверкой точного HEAD и blob SHA.
- Не удалять и не переинициализировать временный cluster; не останавливать его без отдельного согласия. Production, PIN_TRIAL и существующий PostgreSQL cluster не трогать.


### UA-001 — replay failure captured; corrected migration synchronized locally (2026-11-16)

- **Первый replay пользователя:** `scripts/verify.ps1 -MigrationsOnly -PostgresPort 55439` на PostgreSQL 18.6 (`127.0.0.1:55439`, `X:/PinPosy-verify-pg18`, WIN1251 server / UTF8 client). Создана disposable DB `pinposy_verify_13212ccdd0602`; stub, baseline `001_baseline.sql` и миграции 010–139 прошли, выполнение остановилось на migration 140: syntax error near `THEN`, строка 118; exit code 1. Полный replay 001 + 010–148 не пройден.
- **Очистка:** finally-блок verify script выполнил `pg_terminate_backend` (0 строк) и успешный `DROP DATABASE`; disposable DB удалена. Временный кластер оставлен запущенным. Production, PIN_TRIAL и существующий PostgreSQL PID 5632 не затронуты.
- **Причина и исправление ассистента:** в migration 140 выявлены повреждённая URL-regex validation и отсутствующий lookup job/request. В commit `b2cb16ca75d7723f345ecd270cb77cc72149be51` исправлены эти блоки; обе выборки `pin_review_queue.payload.imageUrl` и `payload.image_url` сохранены. Файл повторно прочитан с GitHub. Commit не считать проверенным до replay.
- **Синхронизация пользователя:** `git pull --ff-only origin main` fast-forward с `ba6caa67ad9903b964172e9d0ce2d5609be0bbd0` до `ebb1040ac73e600dfdbfc57d8aa765f9713441a2`; 3 файла, 34 insertions, 2 deletions. Локальный blob SHA migration 140 `484e589c32940ad9df8ef67de71c43b27fddf76c` совпадает с blob SHA, полученным ассистентом из GitHub main.
- **Статус и следующий шаг:** исправленная миграция синхронизирована, повторный replay ещё не запускался; DB gate открыт. Следом повторить только migration replay, проверив HEAD `ebb1040ac73e600dfdbfc57d8aa765f9713441a2` и blob SHA `484e589c32940ad9df8ef67de71c43b27fddf76c`. Frontend/backend suites не запускать; временный кластер не останавливать и не удалять без отдельного согласия.


### UA-001 — повторный PostgreSQL migration replay успешно пройден (2026-11-16)

- Пользователь подтвердил целевой сервер перед запуском: 127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|UTF8|PostgreSQL 18.6 on x86_64-windows, compiled by msvc-19.44.35228, 64-bit.
- До запуска локальная ветка была синхронизирована пользователем командой git pull --ff-only origin main: HEAD ebb1040ac73e600dfdbfc57d8aa765f9713441a2; blob SHA db/migrations/140_account_deletion_review_queue_image_manifest.sql — 484e589c32940ad9df8ef67de71c43b27fddf76c.
- Пользователь выполнил повторный запуск scripts/verify.ps1 -MigrationsOnly -PostgresPort 55439 с PG18 client, PGUSER=pinposy_verify_admin, client encoding UTF8 и временным паролем, введённым локально через secure prompt. Секрет не передавался в чат; временная переменная окружения восстановлена/очищена после выполнения.
- Скрипт создал disposable DB pinposy_verify_196929316b56e; применил Supabase stubs, 001_baseline.sql, затем каждую миграцию с 010 по 148 включительно. В том числе исправленная миграция 140 и миграции 141–148 завершились без фатальной SQL-ошибки.
- Итоговый вывод: PASS PostgreSQL migration replay (001 + 010-148), All configured checks passed., MIGRATION REPLAY PASSED. Повторный replay успешен.
- Cleanup скрипта: pg_terminate_backend вернул 0 строк; DROP DATABASE для pinposy_verify_196929316b56e выполнен успешно. Временный кластер X:/PinPosy-verify-pg18 оставлен запущенным.
- В выводе присутствовали сообщения о пропуске отсутствующих объектов (идемпотентные DROP/ALTER/trigger/policy действия); они не остановили выполнение. Часть русских уведомлений отображалась некорректно в терминале. Серверный WIN1251 и клиентский UTF8 были явно подтверждены до запуска; все SQL-шаги завершились успешно.
- Запуск был ограничен loopback 127.0.0.1:55439 и отдельным data directory X:/PinPosy-verify-pg18. Production, PIN_TRIAL, существующий PostgreSQL cluster/PID 5632 не затронуты. Запуск проверял только migration replay; frontend/backend suites не выполнялись.
- Статус: DB migration replay gate закрыт; исправление migration 140 проверено полным replay 001 + 010–148. Следующее действие ассистента — выбрать следующий незакрытый этап по актуальному docs/PROJECT_STATE.md, а не повторять уже пройденный replay. Не останавливать и не удалять временный кластер без отдельного согласия пользователя.


### UA-001 — migration replay PASS и подготовка SQL integration suite (2026-11-16)

- Пользователь предоставил полный вывод повторного `scripts/verify.ps1 -MigrationsOnly -PostgresPort 55439`: целевой сервер `127.0.0.1:55439`, data directory `X:/PinPosy-verify-pg18`, PostgreSQL 18.6, server encoding WIN1251, client encoding UTF8. Локальный checkout был на HEAD `ebb1040ac73e600dfdbfc57d8aa765f9713441a2`; migration 140 blob SHA `484e589c32940ad9df8ef67de71c43b27fddf76c`.
- Успешно создана и затем удалена скриптом disposable DB `pinposy_verify_196929316b56e`; применены Supabase stubs, baseline 001 и миграции 010–148. Итоговый статус PASS; подробности в предыдущей записи UA-001 и в `docs/PROJECT_STATE.md`.
- Ассистент после этого прочитал актуальные с GitHub main: `docs/PROJECT_STATE.md`, `scripts/verify.ps1`, `backend/package.json`, дерево репозитория, `backend/test/postgres-integration.sql`, `docs/backend-audit/13-sql-migration-static-review.md`, `.github/workflows/atomic-payment-integration.yml` (включая этапы подготовки схемы, применения миграций и SQL tests). Это была read-only проверка.
- Выявлено существенное различие: `scripts/verify.ps1 -MigrationsOnly` выполняет только canonical fresh-install replay и не запускает SQL integration suite. CI workflow использует отдельный legacy/upgrade fixture с ролями anon/authenticated/service_role, вручную созданными таблицами и helper function, затем применяет миграции и запускает ordered SQL tests и bash concurrency tests. Следовательно, интеграционные тесты нужно запускать в отдельной disposable БД, воспроизводя workflow, а не на production/PIN_TRIAL и не поверх уже удалённой БД replay.
- В рамках этой read-only проверки SQL integration tests не запускались, новых БД не создавалось, SQL и код не изменялись. Следующий шаг — подготовить и проверить отдельный безопасный runner, который воспроизводит workflow на loopback PostgreSQL 18.6 и удаляет только созданную им disposable БД. Временный кластер остаётся запущенным; production, PIN_TRIAL и существующий PostgreSQL PID 5632 не затронуты.


### UA-001 — уточнение SQL integration prerequisite (2026-11-16)

- Ассистент прочитал полный post-migration блок `.github/workflows/atomic-payment-integration.yml` и перечень команд: 46 SQL integration file invocations, 2 inline SQL DO checks и 9 bash concurrency scripts. Они выполняются после отдельного legacy/upgrade fixture и полного применения миграций 010–148; это не тот же тест, что canonical baseline replay.
- Найдена устаревшая первая строка `backend/test/postgres-integration.sql`: в ней было написано, что тест запускается после миграций 010–052, хотя текущий workflow применяет 010–148.
- Ассистент исправил только комментарий (без изменения SQL логики) в commit `72c6638eba9393a8f9515bcbbf1ca6f8526e9d84`, затем повторно прочитал начало файла с GitHub и подтвердил новую формулировку: полный ordered migration chain 010–148.
- Ни один SQL integration test и ни один bash concurrency test не запускался. Production/PIN_TRIAL и временная БД не затрагивались. Для следующего этапа требуется безопасный runner, который создаёт свою disposable БД, применяет CI fixture и 010–148, запускает SQL тесты в workflow-порядке и удаляет только свою БД. Пользователь должен синхронизировать code commit перед запуском такого runner; документационные commits отдельно от code sync не требуют.


### UA-001 — журнал commit SHA документационных и кодовых изменений (2026-11-16)

- Для восстановления полной последовательности в истории main зафиксированы commits: PROJECT_STATE — `e95db14918b0de07bd6298595ac211898b1ebc37`, `a93c8652c2a21f2f113874e43c2d3c8a5d3dc0f3`, `c9d61fd53898e34817d10241679247cae0fcb883`; USER_ACTIONS — `4e8d843cb176cbd4cb50c28aa603887241a984db`, `89ce779995a76a56239a9018bfbe2849db5851d6`, `9e0d6b4b5a1f66302930e4e2e2626eef9ce35f45`; SQL static review report — `b15d38cfabe569d871d9b2b386713d56a0c72fc5`.
- Кодовый commit, исправивший устаревший prerequisite-комментарий SQL integration test: `72c6638eba9393a8f9515bcbbf1ca6f8526e9d84`.
- Эти записи дополнены для того, чтобы связать историю действий с конкретными Git commits. Следующий пользовательский sync требуется только после появления следующего code commit; последние commits, меняющие только документацию, не требуют немедленного pull для SQL тестирования.


### Integration-suite preparation review (2026-11-16; read-only)

- Re-read the current GitHub `main` copies of `.github/workflows/atomic-payment-integration.yml`, `backend/package.json`, `scripts/verify.ps1`, `db/supabase-stub.sql`, `backend/test/postgres-integration.sql`, `docs/PROJECT_STATE.md`, and the SQL migration review report before choosing the next step. Current latest recorded main commit is `9fbf85845b8ee1797a8c149689f720512dd3fe54` (documentation-only update to `docs/USER_ACTIONS.md`).
- Confirmed the successful fresh-install migration replay does not exercise the CI integration fixture or integration tests: `scripts/verify.ps1 -MigrationsOnly` creates a separate disposable DB, applies the Supabase stub + canonical `001_baseline.sql` + migrations `010–148`, and then drops that DB.
- Re-read the CI integration workflow. Its integration DB is a distinct upgrade-compatibility fixture: it creates roles `anon`, `authenticated`, `service_role`, legacy-shaped core tables and the baseline `adjust_credits_balance(text, integer)` helper; it applies migrations `010–148` with a special permissive-grants setup immediately before migration 039; then runs the ordered SQL checks and concurrency shell scripts. Workflow currently references 46 SQL files and 9 bash concurrency scripts (lists are maintained in the workflow itself). It also contains two inline SQL DO-block assertions before the ordered file-based tests.
- This pass was inspection only. No SQL was executed, no database was created/changed, no application code was changed, and no production/PIN_TRIAL/existing PostgreSQL cluster was accessed. The temporary cluster `X:/PinPosy-verify-pg18` on `127.0.0.1:55439` remains as previously directed.
- Decision: do not point the canonical migration replay script at this fixture and do not run SQL files individually. Next implementation task is a dedicated Windows PowerShell disposable integration runner that reproduces the workflow fixture, migration order (including the migration-039 grant precondition), both inline DO checks, and exact ordered SQL file list; it must validate loopback/server/data-directory identity before creating a uniquely named database and drop only that database in a finally block. The 9 bash concurrency scripts require a separate explicit Bash-runtime compatibility check and must not be silently counted as executed by the SQL runner.
- Verification status: migration replay gate remains PASS; CI integration suite remains NOT RUN. No integration-runner implementation or test result is claimed in this entry.


### UA-004 — запуск подготовленного SQL integration runner на временном PostgreSQL (2026-11-16)

**Статус: ожидает владельца; до его возвращения никаких действий не требуется.**

Причина: GitHub Actions integration workflow использует отдельный legacy/upgrade fixture, не покрытый уже успешно пройденным fresh-install migration replay. Ассистент подготовил локальный runner и вынес из workflow fixture, две inline SQL assertions и ordered manifest из 46 SQL integration tests. Runner добавлен в main: `scripts/verify-integration.ps1`.

Когда владелец вернётся к ПК, выполнить из корня `X:\!PROGECT\pinboard-ai`:

1. Проверить, что текущая ветка — `main`, а рабочее дерево чистое. Если есть незакоммиченные изменения, остановиться и сообщить об этом; не делать reset/stash/clean.
2. Выполнить fast-forward sync: `git pull --ff-only origin main`.
3. Запустить: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1 -PostgresPort 55439`.
4. Когда скрипт попросит пароль роли `pinposy_verify_admin`, ввести его непосредственно в скрытый prompt. Пароль, переменные окружения с паролем и секреты не копировать в чат.
5. Передать ассистенту полный текстовый вывод команды, включая итоговые PASS/ошибку и сообщения cleanup. Не присылать пароль.

Безопасность runner: перед созданием БД проверяет чистый local main == origin/main, единственный listener `127.0.0.1:55439`, процесс `postgres.exe`, точный data directory `X:\PinPosy-verify-pg18`, PostgreSQL 18.6, server encoding WIN1251 и роль `pinposy_verify_admin`. Клиентская кодировка UTF8. Создаёт уникальную disposable DB `pinposy_sqlint_<suffix>`, применяет CI upgrade fixture, миграции 010–148 с grants precondition перед 039, две inline checks и 46 SQL tests; finally удаляет только собственную БД и роли, созданные этим runner. Если preflight не совпадает, runner должен завершиться до создания тестовой БД.

Не выполнять runner на production, PIN_TRIAL или существующем PostgreSQL cluster/PID 5632. Не останавливать и не удалять временный кластер `X:\PinPosy-verify-pg18` без отдельного согласования. Девять Bash concurrency scripts этим runner не выполняются и будут отдельным следующим этапом после SQL suite. PowerShell parser/runtime и SQL integration suite ещё не запускались; не считать runner PASS до получения фактического вывода.


### UA-004 — автономная повторная сверка перед локальным запуском (2026-11-16)

- Ассистент повторно сверил актуальный GitHub main (b2a60ef25e574a1ed80f99f5e2a8abb77f543696), docs/PROJECT_STATE.md, runner scripts/verify-integration.ps1, contract test и CI workflow.
- Подтверждено: обязательный следующий шаг не изменился — владелец должен запустить runner на своём Windows ПК и временном PostgreSQL 18.6 (127.0.0.1:55439, X:/PinPosy-verify-pg18). Ассистент не имеет доступа к этому локальному процессу/PowerShell и не может достоверно выполнить этот шаг самостоятельно.
- Во время этой сверки не запускались SQL/тесты, не создавались БД, не изменялись код и production. Не присылать пароль/секреты в чат.
- После возвращения владельца: выполнить ранее приведённые в этом разделе UA-004 команды и прислать полный вывод. Только после проверки результата закрывать SQL integration gate и переходить к отдельной оценке Bash concurrency scripts.

### UA-004 — CI runner повторно не назначен (2026-11-16)

После добавления contract Node test и PowerShell parser step GitHub Actions run `43949890305` на HEAD `b2a60ef25e574a1ed80f99f5e2a8abb77f543696` завершился failure до выполнения шагов. Job `133589252669` (postgres-atomicity) вернул `steps: null`, `logs_url: null`; список шагов пуст. Следовательно ни contract test, ни PowerShell parser, ни SQL integration tests фактически не исполнялись. Это не результат успешного/неуспешного тестирования кода, а повторение внешнего pre-step runner blocker. Vercel combined status также failure с target `build-rate-limit`, без build log.

UA-004 по локальному запуску остаётся обязательным и неизменным: после возвращения владельца проверить clean main, выполнить `git pull --ff-only origin main`, запустить `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1 -PostgresPort 55439`, ввести пароль только в скрытый локальный prompt и передать полный вывод без секретов. Не запускать на production/PIN_TRIAL; не трогать PID 5632 и не удалять временный кластер. Все 46 SQL-файлов дополнительно статически проверены на попытки выхода за пределы disposable DB: опасных database/role/system/psql-connect/shell/file/terminate операций не найдено; SQL тесты не запускались.


### UA-004 — дополнительные safety fixes и повторная блокировка GitHub runner (2026-11-16)

После дополнительной статической проверки исправлена ошибка длины имени disposable БД: `pinposy_sqlint_` + 16 hex chars = 31 символ, а не 32. Параметры runner теперь жёстко закреплены на единственном разрешённом порту 55439, PostgreSQL 18.6 client path, data directory `X:\PinPosy-verify-pg18` и роли `pinposy_verify_admin`; нельзя передать другой target через параметры. Добавлена проверка manifest entry на отсутствие path traversal и расширение `.sql`; после DROP DATABASE runner отдельно проверяет, что БД действительно отсутствует. Contract test расширен соответствующими assertions. Кодовые commits: `e45710af`, `0beb49f3`, `fdd5046e`, `bb86b4d0`, `43dfdcc3` (дополнительные тестовые/исправительные commits отражены в PROJECT_STATE).

После этих изменений GitHub Actions runs `43950729248` (job `133592183546`, postgres-atomicity) и `43950729228` (jobs `133592183976` backend, `133592184569` frontend) снова завершились failure до шагов: `steps: null`, `logs_url: null`. Следовательно contract Node test и PowerShell parser CI step не выполнялись. Vercel status остаётся failure с target `build-rate-limit`, без build log. Это не тестовый результат приложения.

**Действие владельца не изменилось:** из чистого checkout на ветке main выполнить `git pull --ff-only origin main`, затем `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1 -PostgresPort 55439`. Runner сам остановится до создания БД, если target не совпадает. Пароль вводить только в скрытый prompt; прислать полный вывод без пароля. Не трогать production, PIN_TRIAL, PID 5632 и не удалять временный кластер.


### Актуальная проверка Vercel после документационного commit (2026-11-16)

- Проверен commit status для текущего `main` HEAD `37d6ea4e4b595a8555e0cc9eabb22e8b08d5d9c2` после исправления stale admin observation.
- Vercel сообщает `failure`: `Deployment rate limited — retry in 24 hours` (target `build-rate-limit`). Это ограничение частоты deployment, а не результат сборки; build не подтверждён ни успешным, ни неуспешным.
- Для этого документационного HEAD GitHub Actions run не создан. Следующий контроль статуса выполнять после окна ограничения; не инициировать платный upgrade и не менять deployment settings без решения владельца.
- UA-004 по SQL integration runner остаётся отдельным обязательным локальным действием владельца и не заменяется Vercel status.

### Повторная проверка UA-004 и Vercel для main HEAD 946e062 (2026-11-16)

- Повторно подтверждено: UA-004 требует локального fast-forward sync и запуска `scripts/verify-integration.ps1 -PostgresPort 55439` на изолированном PostgreSQL 18.6. Пароль — только в скрытом PowerShell prompt; полный вывод передать без секрета. Не использовать production/PIN_TRIAL, PID 5632 и не удалять временный кластер.
- На момент проверки ассистент не имеет доступа к пользовательскому Windows checkout/PowerShell/кластеру, поэтому не может выполнить этот шаг самостоятельно. SQL integration suite, 9 Bash concurrency scripts и backend Node suite остаются НЕ ЗАПУЩЕНЫ в этой сессии.
- HEAD до документационной записи: `946e062ab49bf0dfaa5876176c2d55bb383b6ed5`. Для него GitHub Actions run отсутствует, поскольку commit меняет только docs и workflow `paths-ignore` исключает `docs/**`; отсутствие run не является результатом тестов.
- Vercel status на этом HEAD: `failure`, `Deployment rate limited — retry in 24 hours`, target `build-rate-limit`, timestamp `2026-11-16T20:34:53Z`. Это rate-limit до подтверждённой сборки, а не build error. Не менять тариф/настройки без решения владельца.

### Повтор CI attempt 2 — hosted runner снова не выполнил шаги (2026-11-16)

- В диагностических целях повторно запущены failed jobs из runs `43950729248` (postgres-atomicity) и `43950729228` (backend + frontend), attempt 2. Source SHA: `43dfdcc3b89f4a852bd065495f2dfd781ade737a` (кодовый HEAD; docs-only commits позже).
- Результат: все три jobs снова `failure` до первого шага (`steps: null`; postgres steps endpoint вернул `[]`). Загрузка postgres logs завершилась `BlobNotFound`, то есть диагностического runner log GitHub не предоставил. Ни PowerShell parser, ни Node contract test, ни SQL suite, ни backend/frontend tests/build не выполнялись.
- Это внешний hosted-runner/pre-step blocker, не ошибка тестов PinPosy. Не выдавать failure за runtime defect или PASS. Локальный UA-004 остаётся NEXT и выполняется только на отдельном PostgreSQL 18.6 согласно инструкции выше.
- Никакие production resources, базы, платежи, Pinterest credentials или Vercel settings не менялись.

### Повторная проверка UA-004 и решение по PR #90 (2026-11-16)

- UA-004 остаётся обязательным локальным действием владельца: fast-forward sync `main`, затем `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1 -PostgresPort 55439` на заранее созданном отдельном PostgreSQL 18.6. Пароль вводить только в скрытый prompt; присылать вывод без секрета. Не использовать production/PIN_TRIAL, существующий кластер или PID 5632.
- Рассмотрен PR #90 (`ci: run backend and frontend checks on Windows self-hosted runner`): draft, `mergeable_state=unknown`, requires `[self-hosted, Windows, X64]`. Он не запускает job без подходящего self-hosted runner и не заменяет UA-004. Оставлен открытым и не объединён до подтверждения наличия и безопасности runner.
- Для текущего main HEAD `51cc8ca14acb08f19243c1f0256b5407766156c6` Actions run отсутствует; Vercel продолжает сообщать `Deployment rate limited — retry in 24 hours` (20:36:58Z). Это не результат сборки.
- Никаких локальных/production ресурсов и настроек не меняли; фактические SQL, backend/frontend тесты и build не запускались.

### UA-004 — повторная сверка инструкции и доступности среды (2026-11-16)

- Перед этой записью проверены текущий `main` и `scripts/verify-integration.ps1`; runner не запускался, поскольку пользовательский Windows checkout/PowerShell и изолированный PostgreSQL cluster не доступны ассистенту.
- Требуемое действие остаётся прежним: в `X:\!PROGECT\pinboard-ai` убедиться в clean `main`, выполнить `git pull --ff-only origin main`, затем `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1 -PostgresPort 55439`. Ввести пароль `pinposy_verify_admin` только в скрытый локальный prompt. Передать полный stdout/stderr без пароля и иных секретов.
- Не использовать production, `PIN_TRIAL`, существующий PostgreSQL cluster или PID 5632; не удалять временный кластер `X:\PinPosy-verify-pg18`. При несовпадении preflight остановиться и прислать ошибку, не обходить защиту.
- После SQL suite и подтверждённого cleanup следующий этап — отдельно проверить Bash runtime и выполнить 9 concurrency scripts; затем backend Node suite. Не запускать их заранее.
- Для `main` HEAD `75e3ca335e3aedcc808ec8953c09201ddf0b96b1` GitHub Actions runs отсутствуют; Vercel rate limit всё ещё блокирует подтверждение deployment. PR #90 остаётся draft и не является заменой локального gate.
- Никакие секреты, production-сервисы и локальные ресурсы не менялись.

### UA-005 — Bash concurrency suite (отложено до закрытия UA-004)

**Статус: отложено; сейчас никаких действий от владельца не требуется.**

Во время проверки обнаружено, что прежние девять Bash concurrency scripts по умолчанию подключались к `localhost:5432/pinposy_test` и использовали общие временные файлы. Этот риск исправлен: scripts теперь отказываются работать без явного `PINPOSY_ALLOW_DISPOSABLE_DB_TESTS=1`, loopback PostgreSQL target и имени отдельной БД `pinposy_verify_<suffix>`; они проверяют фактическую БД/адрес сервера и используют изолированный temp directory.

**Не запускай девять scripts вручную и не пытайся обойти новый guard.** Сначала должен быть успешно завершён UA-004 (SQL integration runner). После получения его полного вывода ассистент подготовит отдельный проверенный disposable-DB setup/runner для Bash concurrency suite и только затем даст точную команду владельцу. Не использовать `pinposy_test`, production, PIN_TRIAL или любую общую БД.


### Контрольная точка автономной работы (2026-11-17)

- Проверен актуальный main; последний исходный code/docs HEAD перед записью контрольной точки: `4de5190e3a16b101ee19528110263bc354925744`. В `docs/PROJECT_STATE.md` записано, что NEXT остаётся UA-004 и почему его нельзя выполнить из удалённой среды ассистента.
- **Ничего нового от владельца не требуется сверх UA-004.** Когда владелец вернётся: в PowerShell из `X:\\!PROGECT\\pinboard-ai` проверить clean `main`, выполнить `git pull --ff-only origin main`, затем `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1 -PostgresPort 55439`. Ввести пароль только в скрытый локальный prompt; передать полный stdout/stderr/exit code без пароля и иных секретов.
- При любом отказе preflight остановиться и передать точный вывод; не обходить guard. Не использовать production, PIN_TRIAL, существующий кластер/PID 5632 и не удалять временный кластер `X:\\PinPosy-verify-pg18`. После успешного прогона ассистент проверит фактический результат и cleanup, затем выдаст следующий отдельный шаг по Bash concurrency suite.


### Диагностика GitHub Actions (2026-11-17) — без нового действия владельца

- Ассистент повторно запустил failed jobs для runs `43955465209` и `43955465181` (attempt 2), чтобы проверить, был ли сбой временным.
- Повторные jobs завершились failure; GitHub не предоставил шаги и job logs (BlobNotFound). Причина не установлена; результаты тестов неизвестны.
- Это не меняет UA-004 и не требует от владельца дополнительных действий. Сначала выполнить UA-004 как записано выше; не запускать Bash suite до успешного SQL integration runner.


### UA-004 — follow-up after Windows PowerShell parser failure (2026-11-17)

The owner-reported run did not reach PostgreSQL setup or SQL execution. The PowerShell source had UTF-8 Cyrillic text without a BOM; the runner has now been corrected by adding a UTF-8 BOM (commit `db08fe681ad0727b5296e5f3ea686a6ca4a12378`). A contract assertion requiring the BOM was added in commit `a2f58b2aae9d3f79fdb753506a4ad55ae8337bfe`. Full investigation and rationale: `docs/audits/2026-11-17-powershell-runner-utf8-bom-fix.md`.

**Next steps — do not skip the parser-only check:**

1. Confirm clean `main`, then run `git pull --ff-only origin main`.
2. In the same PowerShell session, run:

   ```powershell
   $tokens = $null
   $errors = $null
   [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\\scripts\\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
   if ($errors.Count -gt 0) { $errors | Format-List; throw 'PowerShell parser check failed.' }
   'PASS: PowerShell parser'
   ```

3. Only if the parser prints `PASS: PowerShell parser`, run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1 -PostgresPort 55439
   ```

4. Enter the password only in the hidden local prompt. Return the full output, process exit code, and cleanup confirmation without passwords, tokens, or environment values.

If parser check fails, stop and send its full output; do not run the integration runner. If runner preflight fails, do not bypass it. Never use production, PIN_TRIAL, existing PostgreSQL service/PID 5632, or delete the temporary cluster. Bash concurrency tests remain blocked until SQL integration PASS and disposable database cleanup are both confirmed.


### UA-004 — owner parser check passed; run guarded SQL integration runner (2026-11-17)

**Статус: следующий шаг владельца. Parser-only check пройден; SQL runner ещё не запускался.**

Владелец подтвердил:
- `git pull --ff-only origin main` обновил локальную ветку с `e187ce33` до `28b50f44`.
- PowerShell Parser check выполнен дважды; оба раза выведено `PASS: PowerShell parser`, ошибок разбора нет.

После последнего pull ассистент добавил новые записи в документацию и тем самым продвинул `main`. Поэтому сначала убедиться, что локальное дерево чистое, и подтянуть именно эти последние документационные commits:

```powershell
git status --short
git pull --ff-only origin main
```

Если `git status --short` показывает незакоммиченные изменения, остановиться и прислать вывод; не выполнять reset/stash/clean. После успешного fast-forward и только если дерево чистое, выполнить из корня репозитория:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1 -PostgresPort 55439
```

- Пароль роли `pinposy_verify_admin` вводить только в скрытом локальном prompt. Не копировать пароль, токены или значения переменных окружения в чат.
- Передать полный stdout/stderr, exit code и явное сообщение о cleanup disposable DB.
- Если preflight сообщает о несовпадении ветки, listener, PID, data directory, версии PostgreSQL, кодировок или роли — остановиться и прислать точный текст ошибки. Не обходить guard и не исправлять состояние кластера самостоятельно.
- Не запускать на production/PIN_TRIAL; не останавливать существующий PostgreSQL/PID 5632; не удалять временный кластер `X:\\PinPosy-verify-pg18`.

**Что означает текущий PASS:** подтверждён только синтаксический разбор PowerShell-файла. Он не подтверждает запуск runner, соединение с PostgreSQL, миграции, 46 SQL tests или cleanup.

После получения результата ассистент сверит число выполненных тестов, exit code и cleanup. Только при подтверждённых SQL integration PASS и cleanup можно перейти к отдельной подготовке Bash concurrency suite. До этого UA-005 и backend runtime suite заблокированы.


### UA-004 follow-up — PostgreSQL identity guard CIDR mismatch (2026-11-17)

**Важно:** это отдельный SQL integration runner, а не уже пройденный migration replay. 2026-11-16 `scripts/verify.ps1` успешно выполнил `001_baseline.sql` + 139 миграций `010–148` на disposable PostgreSQL 18.6; результат `MIGRATION REPLAY PASSED`, временная БД удалена. Этот успешный результат сохраняет статус PASS.

**Статус: runner остановился на identity guard; SQL fixture и тесты не запускались.**

Владелец сообщил, что:
- локальный checkout был чистым и fast-forward обновлён до `21226c6d`;
- runner подтвердил clean `main`, PID `15220` и data directory `X:\\PinPosy-verify-pg18`;
- после скрытого ввода пароля runner получил адрес сервера в форме `127.0.0.1/32`, тогда как сравнивал с `127.0.0.1`, и выдал `PostgreSQL identity mismatch`;
- ошибка возникла на identity query до проверки/создания ролей и до создания disposable DB. По последовательности кода `$createdDatabase` ещё равен `$null`, `$createdRoles` пуст; следовательно runner не запускал fixture, migrations, inline assertions, SQL tests и не имел своей disposable DB для cleanup. Кластер не останавливать и не переинициализировать.

**Исправление ассистента:**
- `scripts/verify-integration.ps1`: заменить текстовое представление `inet_server_addr()::text` на `host(inet_server_addr())`, которое возвращает адрес без CIDR-маски и соответствует ожидаемому `127.0.0.1`. Commit: `a0de3046d924abcedb267076d03e365e6b9b0353`, blob: `05787d0f8067d3412ed10e06856e7b1cdfce1c6d`.
- `backend/test/postgres-integration-runner-contract.test.js`: добавить контрактную проверку нормализации inet-адреса. Commit: `4495b4b4dd52b3f82f43859d640bbab571a3466e`, blob: `ce331fba2e06bb63473cfedf1c586003606b09c4`.
- Node contract test, PowerShell parser и повторный runner ещё не выполнялись после этого изменения.

**Следующий шаг владельца:**
1. Выполнить `git status --short`. Если есть изменения — остановиться, ничего не сбрасывать.
2. При чистом дереве выполнить `git pull --ff-only origin main`.
3. Повторить parser-only check для изменённого runner. Только при `PASS: PowerShell parser` снова выполнить guarded runner:
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1 -PostgresPort 55439`.
4. Передать полный вывод, exit code и cleanup confirmation без секретов. Если identity guard или любой preflight снова отказывает — остановиться и прислать точный вывод. Не обходить проверки, не редактировать настройки сервера вручную.

До подтверждённых SQL integration PASS и удаления disposable DB Bash concurrency и backend runtime suites остаются заблокированы.


### Canonical migration replay — do not ask the owner to repeat it (2026-11-17)

The owner supplied the complete successful PowerShell transcript for the migration-only replay. It was run from `X:\\!PROGECT\\pinboard-ai` against PostgreSQL 18.6 at `127.0.0.1:55439`, data directory `X:/PinPosy-verify-pg18`, server encoding WIN1251 and client encoding UTF8. The guarded preflight checked branch `main`, clean tree, historical HEAD `ebb1040ac73e600dfdbfc57d8aa765f9713441a2`, SHA-256 object hashes for migration 140 and `scripts/verify.ps1`, PostgreSQL 18 `psql.exe`, and exactly one loopback listener on port 55439. The temporary role password was read as a SecureString, used only in the process environment, and the previous environment values and PATH were restored in `finally`.

The command executed `scripts/verify.ps1 -MigrationsOnly -PostgresPort 55439`. It created disposable database `pinposy_verify_196929316b56e`, applied Supabase test stubs, `001_baseline.sql`, and all migrations `010–148` (139 migrations), then successfully dropped the disposable database. Explicit terminal evidence: `PASS PostgreSQL migration replay (001 + 010-148)`, `All configured checks passed.`, `MIGRATION REPLAY PASSED`. **This migration replay is PASS and must not be described as unrun.**

This is not the later separate SQL integration runner and does not establish execution of its inline assertions or 46 SQL test files. Maintain separate statuses. Full procedure and safety interpretation are recorded in `docs/PROJECT_STATE.md` under “Canonical local PostgreSQL migration replay procedure”. Do not ask the owner to rerun this already successful replay merely to resolve the separate integration-runner identity-guard issue.


### UA-004 follow-up — migration 018 constraint collision (2026-11-17)

**Owner-side result:** after clean fast-forward to `33fdee6f3da62495ed3137ebf06cb04b91c3ffcb`, PowerShell parser returned `PASS`. The guarded runner passed repository/server identity checks, created disposable DB `pinposy_sqlint_389e6a26525c4ee8`, applied the upgrade fixture and reached migration `018_preferred_language.sql`. PostgreSQL reported that `users_preferred_language_check` already exists. The runner then successfully terminated connections, dropped the disposable database and confirmed `Removed disposable database ...`.

**Status:** SQL integration remains blocked at migration 018. The 2 inline assertions and 46 SQL test files were not reached. The independent migration-only replay `001 + 010–148` remains PASS.

**Next diagnostic:** inspect the precise constraint catalog state immediately before migration 018 and capture full `psql` error context. Static review of the current fixture and migrations 010–017 does not show this named constraint being created, while migration 018 explicitly drops it before adding it. Root cause is unresolved; do not remove or weaken the constraint speculatively.

**Safety:** temporary database cleanup is confirmed. Do not stop PID `15220`, alter/reinitialize `X:\\PinPosy-verify-pg18`, touch production/PIN_TRIAL, or bypass runner guards. Node contract test remains unverified unless a separate result is supplied.


### UA-004 next owner run — capture migration 018 catalog state (2026-11-17)

The runner now prints each migration filename and, immediately before `018_preferred_language.sql`, executes a read-only query against `pg_constraint` for `users_preferred_language_check`, including schema, table, type and definition. It does not modify the DB. Source commits: runner `2c75a0d5639bfa43629a83d03fcd8d760c78368d`; contract assertion `883c065b97e52010ba99fa3a79d3420e73d56e92`. The Node contract test and updated parser/runner are not yet verified.

**Owner action:** `git status --short` (must be empty), `git pull --ff-only origin main`, rerun the PowerShell Parser API check, then run the guarded integration runner only if parser PASS. Send the complete output from the diagnostic line through failure/cleanup and exit code. Do not rerun migration-only replay. Do not stop PID `15220`, alter/reinitialize the temporary cluster, bypass guards, or touch production/PIN_TRIAL. The previous disposable DB cleanup was confirmed.


### UA-004 follow-up — expanded migration 018 diagnostics (2026-11-17)

Owner's latest run at `2ced41640849cca5d46d16b200f801327e6ca160` passed identity guard and migrations 010–017. The pre-018 named-constraint query printed no rows, but migration 018 still failed claiming `users_preferred_language_check` already exists. Temporary DB `pinposy_sqlint_1a99cf2946b14838` was dropped and removal confirmed. The 2 inline assertions and 46 SQL tests were not reached.

Runner now emits database identity, all constraints on `public.users`, matching named constraints across schemas/tables, and same-named relations; psql migration execution requests verbose error/context and echoes errors. Commits: runner `eb95ccf5126ec833e5f7f55092bef82c173cd48b`; contract source test `5837793afd56968e1f5695177c79361640cea204`. These changes are untested until the owner runs them.

**Next owner action:** sync clean `main`, run parser check, then guarded runner. Send full output of all four diagnostic record types and the verbose PostgreSQL error including SQLSTATE/context. No migration/schema changes until this evidence identifies the collision. Do not stop PID `15220`, alter/reinitialize the cluster, bypass guards, or touch production/PIN_TRIAL.


### UA-004 follow-up — expanded catalog diagnostic failed before migration 018 (2026-11-17)

Owner's latest transcript confirms:
- Clean checkout fast-forwarded from `2ced4164` to `d48fdde95765a5b254e92bc05388af7f32661e8d`.
- PowerShell Parser API: `PASS: PowerShell parser`.
- Runner passed repository/server identity guards; listener PID `15220`, data directory `X:/PinPosy-verify-pg18`, identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Disposable DB `pinposy_sqlint_f6ff758b193649be` was created; fixture and migrations 010–017 completed.
- The diagnostic query immediately before migration 018 failed with `operator does not exist: text || "char"`. It returned no diagnostic rows and migration 018 was not invoked during this attempt.
- The runner successfully terminated DB sessions, dropped the disposable database, checked its absence and printed the removal confirmation.
- Inline assertions and 46 SQL tests remain NOT RUN. Do not interpret this diagnostic-query error as the original migration-018 duplicate being fixed or reproduced.

Assistant corrected the read-only diagnostic by casting catalog `contype` and `relkind` fields to text and added a source-contract assertion. This is not runtime-verified. Detailed history is in the audit section 9 and project-state journal.

**Next owner action:** pull the newest `main`, verify clean status and PowerShell parser, then rerun the guarded integration runner. Capture all four diagnostic prefixes and the complete error context. Do not bypass guards, alter migrations/fixture manually, stop PID 15220, or touch production/PIN_TRIAL. The separate migration-only replay remains PASS; this SQL integration gate remains blocked.



### UA-004 follow-up — contract test stale diagnostic message (2026-11-17)

Owner transcript:
- Fast-forwarded local `main` from `d48fdde9` to `844514ab`.
- Node contract suite: **9 passed, 1 failed, 10 total**. Failure at the contract test asserting the former diagnostic heading `Diagnostic: matching constraints immediately before migration 018`; the live runner's expanded heading is `Diagnostic: database and public.users constraints immediately before migration 018:`.
- All other contract assertions passed, including explicit text casts for PostgreSQL catalog `contype` and `relkind`.
- PowerShell Parser API: **PASS**.
- This transcript contains no post-fix integration-runner invocation, no new temporary database, no migrations, and no SQL integration tests.

Assistant changed only the stale expected heading in the Node contract test. Commit `a4472b204bf6c66f02c0adb8c9d1db79579c47ea`; test blob `902a0d700a1b145d7e48ad5f0cc856c5bd6f99a1`. This correction is not yet test-verified.

**Next owner action:** pull latest clean `main`; rerun the Node contract test and PowerShell Parser API check. If both pass, rerun the guarded integration runner and provide its full output. Do not bypass safety guards or touch production/PIN_TRIAL. The SQL integration gate remains BLOCKED until the runner completes all fixture, 139 migrations, two inline assertions and 46 SQL tests, followed by confirmed disposable DB cleanup.


### UA-004 follow-up — corrected Node contract suite passes (2026-11-17)

Owner transcript:
- `git status --short` printed no entries before synchronization.
- `git pull --ff-only origin main` fast-forwarded local `main` from `844514ab` to `7f0084ca`; five files changed, 49 insertions and one deletion.
- `node --test .\\backend\\test\\postgres-integration-runner-contract.test.js`: **10 passed, 0 failed, 10 total**. All named contract checks in the output passed, including the corrected diagnostic-heading assertion.
- The current transcript ends immediately after the Node test output. It does not contain a PowerShell Parser API invocation or a guarded PostgreSQL integration-runner invocation.

Interpretation and boundaries:
- The stale expected log string is now confirmed fixed by the passing contract suite.
- Previous PowerShell Parser API PASS was recorded against an earlier pulled revision; re-run it on current `7f0084ca` before invoking the integration runner.
- No new disposable database was created and no migrations, inline assertions or SQL integration tests ran in this turn.
- Next owner action: run the documented PowerShell Parser API check; if PASS, execute the guarded integration runner and send the full output. Keep all safety guards; do not stop PID 15220, alter the temporary PostgreSQL cluster, or touch production/PIN_TRIAL.


### UA-004 follow-up — PowerShell Parser PASS on current main (2026-11-17)

Owner transcript and result:
- Owner ran the PowerShell Parser API against `scripts/verify-integration.ps1` with `$ErrorActionPreference = 'Stop'`, initialized `$tokens` and `$errors`, and called `[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path ...).Path, [ref]$tokens, [ref]$errors)`.
- The parser error branch did not execute; terminal output: **`PASS: PowerShell parser`**.
- Together with the immediately preceding owner result of **10/10** Node contract checks, the source-level checks are now green for this revision.

Scope boundary:
- Parser validation does not execute PowerShell commands in the runner. No PostgreSQL identity guard, disposable database creation, migration, inline assertion, SQL integration test or cleanup occurred in this transcript.
- The SQL integration gate remains NOT PASSED / NOT YET RE-RUN after the catalog diagnostic cast fix.

Assistant action: fetched current runner, Node contract test and tracking documents from GitHub `main`, checked the source blob identities, and recorded the supplied owner transcript and limits in the project state, owner action log and audit. No source file or database was modified by this documentation update.

**Next owner action:** execute the guarded runner on clean synchronized `main`; provide the full output. Do not stop PID 15220, alter/reinitialize the temporary cluster, bypass guards, or touch production/PIN_TRIAL. Confirm all expected stages and final disposable database absence before marking the SQL integration gate PASS.


### UA-005 — integration runner invocation blocked by execution policy (2026-11-17)

Owner transcript:
```powershell
PS X:\!PROGECT\pinboard-ai> .\scripts\verify-integration.ps1
... Невозможно загрузить файл ...\scripts\verify-integration.ps1, так как выполнение сценариев отключено в этой системе ...
FullyQualifiedErrorId : UnauthorizedAccess
```

Interpretation: PowerShell rejected the script before loading/executing its body. The hidden password prompt was not reached. No PostgreSQL connection, target identity check, disposable database creation, migrations, inline SQL assertions, SQL integration tests or cleanup occurred. This is an execution-policy launch block, not a PostgreSQL test failure.

Assistant work: retrieved current runner, Node contract test and four documentation files from GitHub `main`; reviewed the runner's fixed port 55439, identity guards, hidden secure password prompt and `finally` cleanup; then recorded this exact incident and its boundary. No source code or database was changed by this documentation update.

Safe retry (process scope only; does not persistently alter machine/user policy):
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Enter the temporary PostgreSQL role password only in the script's hidden prompt. Never pass it as an argument or send it in chat. If a Group Policy still blocks the child process, stop and report the message; do not change LocalMachine/CurrentUser policy or weaken the runner's internal safety checks.

Next: run the process-scoped command above and send complete output. SQL integration remains NOT PASSED until the fixture, 139 migrations, two inline assertions, all 46 SQL tests and disposable DB cleanup are verified.


### UA-006 — process-scoped runner starts, then blocks on stale local main (2026-11-17)

Owner supplied this sequence:

1. Direct invocation ` .\scripts\verify-integration.ps1` was rejected by PowerShell execution policy (`PSSecurityException / UnauthorizedAccess`); the script body did not load.
2. Process-scoped invocation `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1` launched the script. It fetched origin and reported:
   - `7f0084ca..b8d04ffc main -> origin/main`
   - `Safety stop: local main (7f0084ca8ff0681b56c214c3f7020f9d029c2ef5) is not synchronized with origin/main (b8d04ffc9636fb7f4bc506aaf06f9bd6c86241cc)`
   - PowerShell surfaced the runner's deliberate error at line 199.

Interpretation and scope: source inspection of runner blob `74c128b4c6933b8b5aba888e4abeb01200df2ab6` confirms the local-vs-origin comparison happens before the secure password prompt at line 103 and disposable DB creation at line 143. Thus no PostgreSQL connection, database creation, fixture, migration, inline assertion, SQL test or cleanup was reached. The runner stopped safely because the local branch was stale.

Assistant actions: fetched the latest runner and all tracking documents from GitHub `main`; inspected guard order; recorded both owner invocations and exact commit IDs in the project state, action log and audit; updated the documentation register with resulting blob SHAs; re-fetched the updated docs to verify them. No local machine, repository checkout, database or source file was modified by the assistant.

**Next owner action:**
```powershell
 git status --short
 git pull --ff-only origin main
 git rev-parse HEAD
 git rev-parse origin/main
```

Only run the pull if `git status --short` is empty. Expected result after a successful fast-forward: the two `rev-parse` outputs match. If the worktree is dirty or pull fails, stop and send the output; do not reset or discard anything. Then rerun:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

SQL integration remains NOT PASSED; this run did not reach PostgreSQL.


### UA-007 — owner fast-forward pull and HEAD/origin synchronization PASS (2026-11-17)

Owner transcript:
```powershell
git status --short
# no output; worktree clean

git pull --ff-only origin main
# Fast-forward: 7f0084ca..95b7aa3c
# four documentation files changed, 220 insertions(+), 0 deletions(-)

git rev-parse HEAD
# 95b7aa3cadfdb0b5d213ec65d2d61cf47ffcf990

git rev-parse origin/main
# 95b7aa3cadfdb0b5d213ec65d2d61cf47ffcf990
```

Result: clean worktree before pull; fast-forward-only update succeeded; local HEAD and origin/main resolve to the identical commit `95b7aa3cadfdb0b5d213ec65d2d61cf47ffcf990`. The stale-checkout guard condition is now satisfied according to this owner transcript.

Assistant work: fetched current runner, contract test and four documentation files from GitHub main; checked source blob identities (runner `74c128b4c6933b8b5aba888e4abeb01200df2ab6`, contract test `902a0d700a1b145d7e48ad5f0cc856c5bd6f99a1)); inspected the runner's current safety-check ordering; recorded the owner transcript, exact results and next action in the project journal, this action log and audit; updated the documentation register and re-fetched updated docs to verify their blob SHAs. The assistant did not execute local Git commands, change source code, connect to PostgreSQL, create/drop databases, touch production/PIN_TRIAL or handle secrets.

This is a Git synchronization PASS only. The SQL integration runner has not yet been rerun successfully after the synchronization; no SQL integration result is claimed.

**Next owner action:**
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Enter the temporary role password only at the hidden prompt. Send the complete output, including final disposable database cleanup confirmation. SQL integration remains NOT PASSED until fixture, 139 migrations, two inline assertions, all 46 SQL integration tests and cleanup have succeeded.


### UA-008 — runner rejected because assistant advanced origin/main after owner's sync (2026-11-17)

Owner supplied output from:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

The script fetched remote and showed `95b7aa3c..a98f8821 main -> origin/main`, then stopped with exact mismatch:
- local main: `95b7aa3cadfdb0b5d213ec65d2d61cf47ffcf990`
- origin/main: `a98f8821f345677271add7d53a3cbe94840f2f0d`

**Assistant accountability:** the assistant had created documentation commit `a98f8821` after the owner had synchronized local main to `95b7aa3c`, then gave an incorrect next instruction to run the script immediately. The assistant should have instructed another fast-forward pull after its own documentation commit. The user followed the assistant's instruction; this is an assistant sequencing mistake, not an owner mistake.

Inspection of runner blob `74c128b4c6933b8b5aba888e4abeb01200df2ab6` confirms the equality guard at lines 59–61 runs before hidden password prompt (line 103) and disposable DB creation (line 143). No PostgreSQL or SQL test activity occurred.

Assistant actions: fetched current runner and four documentation files; checked source order and exact commit IDs; traced the mismatch to the assistant's immediately preceding documentation commit; appended this incident and accountability statement to project state, action log and audit; updated the documentation register; and verified the resulting docs. No local machine or database operation was performed.

**Corrected owner action — required after this documentation commit:**
```powershell
git status --short
# Continue only if empty:
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
```

When the two hashes match, run the guarded process-scoped integration command immediately, with no intervening assistant commit:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Any later assistant documentation commit advances origin/main again and requires another pull before a subsequent runner invocation. Do not reset, force, or discard local work. SQL integration remains NOT PASSED.


### UA-009 — guarded PostgreSQL integration run reached migration 018, then cleaned up

Owner transcript:
- `git status --short` produced no output.
- `git pull --ff-only origin main` fast-forwarded `95b7aa3c..13166c8c`.
- `git rev-parse HEAD` and `git rev-parse origin/main` both returned `13166c8cd476a13a787e9584f5b914430f702cc1`.
- Ran `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`.

Runner verified clean synchronized checkout; listener PID 15220, data dir `X:\PinPosy-verify-pg18`; hidden password prompt; server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`. It created disposable DB `pinposy_sqlint_318fd598c73448c5`, applied fixture and migrations 010–017, then failed while applying migration 018. The pre-018 diagnostic listed only the expected NOT NULL and primary-key constraints for public.users and did not print a matching named constraint/relation row.

**Important interpretation:** the visible psql text is garbled. It contains a NOTICE (SQLSTATE 00000) that `users_preferred_language_check` does not exist and is being skipped, corresponding to the intentional `DROP CONSTRAINT IF EXISTS` statement. The supplied transcript does not establish the actual subsequent ERROR or its SQLSTATE. Root cause is therefore OPEN; do not attribute failure to this NOTICE or edit migration 018 without further evidence.

Cleanup is confirmed: runner terminated DB sessions, ran `DROP DATABASE`, and printed `Removed disposable database pinposy_sqlint_318fd598c73448c5`. No inline assertions and no 46 SQL tests ran. SQL integration remains NOT PASSED.

Assistant read-only investigation fetched and inspected: runner blob `74c128b4c6933b8b5aba888e4abeb01200df2ab6`; migration 018 blob `4f524034d8504c3111e376fb91b30e65a8b86884`; upgrade fixture blob `49a817c5e238eda201b8821a9c052585f36e0217`; ordered SQL manifest blob `aa773d020841f6925b4f63f4a6d96fb95cf4e3a6`; baseline migration blob `105a13cfba4746206191dcf2bd68d5514912f08c`. Fixture creates a fresh users table without preferred_language; migration 018 adds the column, drops any old named check constraint, adds the check, and creates an index. The runner diagnostic already checks direct constraints, target-named constraints across relations, and same-named pg_class relations, but the owner transcript shows none of the target name. This does not yet explain psql's nonzero exit.

**Next:** improve diagnostic fidelity (unambiguous UTF-8 error capture and exact SQLSTATE/statement) and add narrow catalog inspection around each statement in migration 018. Re-run only through the guarded disposable-db runner. No production/PIN_TRIAL or persistent verification data may be touched.


### UA-010 — runner diagnostics patch published; owner verification pending (2026-11-17)

After recording UA-009, assistant re-fetched current source and identified that the runner has global `$ErrorActionPreference = 'Stop'` while invoking native `psql.exe` with stderr redirected into the PowerShell pipeline. Owner's previous failure surfaced a NOTICE with SQLSTATE 00000 as the exception and omitted the runner's own `psql failed (exit N)` wrapper. Diagnosis: Windows PowerShell 5.1 likely promoted the native stderr record to a terminating error before `$LASTEXITCODE` was read. The garbled Cyrillic additionally indicated incorrect native-output decoding despite PostgreSQL client encoding UTF8. This is not proof of an SQL defect in migration 018.

Assistant changed `scripts/verify-integration.ps1` so `Invoke-Psql` saves the prior error preference and console output encoding, temporarily uses `Continue` and UTF-8 output decoding, captures merged native output and `$LASTEXITCODE`, then restores both settings in `finally`. Existing nonzero exit-code handling and all safety/cleanup guards remain in place.
- Runner commit `b5b43c86213209e1cacefd8807fce188439dc11d`, blob `d1137519b254f31a8d669405d355956b1fb23ddf`.

Assistant added two source-contract tests to `backend/test/postgres-integration-runner-contract.test.js`: scoped stderr handling/exit-code capture/restoration, and scoped UTF-8 decoding/restoration.
- Test commit `e24511b5219315928baefb3563ef959c16cc86ec`, blob `088c23d854c9be56320b2728f1e4cbe6b107f8a5`.

Assistant re-fetched both changed files and verified their blob hashes, expected source strings, and 12 total `test(...)` declarations. These are read-only source checks, NOT executed tests. Assistant did not execute Node, Windows PowerShell, psql or PostgreSQL and did not access local workstation, production/PIN_TRIAL or secrets. The previous disposable DB cleanup remains confirmed; no DB exists from this assistant work.

**Owner verification required after all assistant docs commits:** clean fast-forward local main; run `node --test backend/test/postgres-integration-runner-contract.test.js`; optionally run the PowerShell parser check; then run the guarded `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`. Password only through hidden prompt. Report full output. If migration 018 still errors, its actual UTF-8 server ERROR and SQLSTATE must be diagnosed before any migration change. SQL integration remains NOT PASSED.
