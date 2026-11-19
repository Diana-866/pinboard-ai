# PinPosy — действия, требующие участия пользователя

Этот файл — очередь конкретных действий, которые нельзя выполнить из GitHub/текущей среды ассистента. После получения результата ассистент обязан сверить его с актуальным `main`, отметить задачу выполненной/заблокированной и записать результат в `docs/PROJECT_STATE.md`.

- **Повторная проверка обязательного PostgreSQL gate (2026-11-16, main docs HEAD 2f838cdd082e79fed8b63e01845d5291e8a9875d):** после документационного commit GitHub запустил runs `43936400253` (backend `133542018499`, frontend `133542018960`) и `43936400260` (postgres-atomicity `133542018246`); следующий HEAD от текущей проверки запустил `43936487681` (backend `133542325408`, frontend `133542325882`) и `43936487679` (postgres-atomicity `133542325836`). Все шесть jobs завершились через 1–2 секунды с `failure`, `runner_id: 0`, пустым `runner_name`, `steps: 0`. Ни одна команда checkout/test/typecheck/build/SQL replay не стартовала. Это runner allocation failure, а не результат тестирования кода.
- **Windows fallback:** PR #90 `ci: run backend and frontend checks on Windows self-hosted runner` повторно прочитан: он остаётся `open` и `draft`, содержит workflow с `runs-on: [self-hosted, Windows, X64]` и manual `migrations_only` input; PR не объединялся. Наличие подключённого Windows runner не подтверждено. Нужна проверка в GitHub Actions → Runners: runner должен быть online/idle и иметь labels `self-hosted`, `Windows`, `X64`; затем владелец должен запустить workflow на актуальном `main` с `migrations_only=true`. Запускать только на loopback PostgreSQL test instance, не production. Если runner отсутствует/offline — выполнить локально `powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1 -MigrationsOnly` из корня свежего checkout `main`, сохранив полный stdout/stderr/exit code без секретов.
- **Vercel:** combined status на текущем `main` docs HEAD `2f838cdd082e79fed8b63e01845d5291e8a9875d` — `failure`, target `build-rate-limit`; это quota, не build result. Ранее успешный deployment другого application commit не подтверждает текущую версию.

- **Финальная проверка после фиксации этого задания (2026-11-16):** новый run `43936696213` на documentation HEAD `698a8f64a9b73ded104014ffc83c60240977c09d` также завершился `failure`; jobs `133543052272` (frontend) и `133543053331` (backend) имеют `runner_id: 0`, пустой `runner_name`, `steps: 0`, завершились примерно за 1 секунду. Это дополнительно подтверждает, что GitHub-hosted runner не начал выполнять workflow. Никакие frontend/backend tests или build не запускались.
## UA-001 — проверить бинарники PostgreSQL 18 и свободное место

- **Разрешение владельца получено (2026-11-16):** пользователь явно разрешил создать отдельный временный PostgreSQL 18.6 cluster только в новом каталоге на X:, на отдельном порту и с bind/listen только `127.0.0.1`. Запрещено затрагивать работающий PostgreSQL (в т.ч. PID 5632), его data directory, `PIN_TRIAL` и production. Разрешение распространяется только на создание и проверку disposable cluster; миграционный replay будет отдельным последующим шагом после проверки идентичности кластера и подтверждения безопасного endpoint. Создание кластера ещё не подтверждено.


- **Фактический результат от владельца (2026-11-16):** `initdb --version` → PostgreSQL 18.6; `pg_ctl --version` → PostgreSQL 18.6; `Test-Path ...\postgres.exe` → `True`; свободно на X: `167,962,349,568` байт (примерно 156.4 GiB). Дополнительно пользователь сообщил о работающем процессе `postgres.exe` PID `5632`, ParentProcessId `4336`; этот процесс и существующий data directory не трогались. Предварительные условия для отдельного disposable cluster имеются. Создание кластера и запуск миграций требуют отдельного явного согласия пользователя.


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
- Каталог `X:\PinPosy-verify-pg18`: свободен (Test-Path = false).
- TCP port `55439`: свободен (Get-NetTCPConnection -LocalPort 55439 -State Listen не вернул listener).
- `X:\Program Files\PostgreSQL\18\bin\psql.exe`: найден (Test-Path = true).
- `pg_ctl --version`: PostgreSQL 18.6.
- Предыдущий preflight: `initdb.exe` и `pg_ctl.exe` версии 18.6, `postgres.exe` найден, X: свободно 167,962,349,568 bytes; работающий postgres PID 5632 не останавливался и не изменялся.

**Что это подтверждает:** можно продолжать подготовку изолированного временного кластера. Это НЕ означает, что кластер создан или миграции выполнены.

**Следующий шаг:** сверить initdb authentication options и создать новый data directory только после повторной проверки отсутствия каталога и доступности порта. Любая команда подключения/создания БД должна использовать явный host `127.0.0.1` и порт `55439`. Не использовать системный/default port 5432. Не запускать `scripts/verify.ps1 -MigrationsOnly` до проверки, что соединение идёт именно к новому disposable cluster и роль/аутентификация корректны.


### UA-001 — уточнение PostgreSQL client PATH (2026-11-16)

Владелец прислал результат проверки: `pg_ctl` и `psql` версии 18.6 доступны в `X:\Program Files\PostgreSQL\18\bin`. Однако системный `Get-Command psql` указывает на PostgreSQL 17: `C:\Program Files\PostgreSQL\17\bin\psql.exe`. Для migration replay нельзя полагаться на неявный поиск `psql` в PATH: нужно вызывать бинарник PG18 полным путём (или временно изменить PATH только в текущем окне PowerShell). В сообщении отсутствовал вывод `initdb.exe --help`; параметры auth пока не подтверждены. Каталог и кластер не создавались, сервер не запускался.


### UA-001 — initdb options verified (2026-11-16)

Полный вывод `initdb.exe --help` получен. Подтверждены параметры `--auth-host`, `--auth-local`, `-U`, `-W`, `-D`, `-k`. План инициализации отдельного временного кластера:
- каталог: `X:\PinPosy-verify-pg18` (проверен как отсутствующий);
- роль суперпользователя: `pinposy_verify_admin`;
- TCP и local auth: `scram-sha-256`;
- пароль вводится интерактивно, не присылается ассистенту и не включается в команду;
- бинарник вызывается полным путём PG18, так как PATH указывает на psql PG17.
На момент записи initdb ещё не запускался. Следующий пользовательский шаг — повторно проверить отсутствие каталога и выполнить только initdb; запуск сервера будет отдельным последующим шагом с bind только на 127.0.0.1 и port 55439.


### UA-001 — PostgreSQL 18 initdb completed (2026-11-16)

Пользователь выполнил инициализацию нового кластера в `X:\PinPosy-verify-pg18`. Вывод подтверждает успешное завершение (Готово), роль `pinposy_verify_admin`, SCRAM-SHA-256 для TCP/local и включённые data checksums. Пароль вводился интерактивно, в переписке не раскрывался.
**Обнаруженный нюанс:** Windows выбрал локаль `Russian_Russia.1251`, поэтому initdb создал кластер с encoding `WIN1251`. До запуска сервера требуется read-only проверка, что все SQL-входы для replay (stub, canonical baseline, активные migrations 010–148) совместимы с WIN1251, а также согласовать client encoding. Пока сервер не запускался; порт 55439 не использовался; существующий PID 5632, PIN_TRIAL и production не затронуты. Ничего не удалять и не переинициализировать без отдельного согласия пользователя.


### UA-001 — SQL encoding preflight passed (2026-11-16)

Пользователь запустил read-only PowerShell проверку 141 SQL-файла: `db/supabase-stub.sql`, `db/migrations/001_baseline.sql`, 139 активных миграций 010–148. Все файлы строго декодированы из UTF-8 и проверены на представимость в Windows-1251. Итог: 141 проверено, 0 несовместимых. Проверка не исполняла SQL и не доказывает успешность replay. Следующий шаг — повторная проверка целевого data directory и свободного TCP 55439, затем запуск только на 127.0.0.1:55439.


### UA-001 — disposable PostgreSQL 18 server started (2026-11-16)

Пользователь проверил временный data directory `X:\PinPosy-verify-pg18`: файл `PG_VERSION` содержит `18`; TCP port `55439` был свободен. После этого выполнил запуск через PG18 `pg_ctl.exe` с явными параметрами `-h 127.0.0.1 -p 55439 -c listen_addresses=127.0.0.1`. Фактический вывод: «ожидание запуска сервера.... готово», «сервер запущен»; проверка `$LASTEXITCODE -ne 0` не сработала, значит команда завершилась успешно. Это ещё не независимая проверка listener/процесса/каталога. SQL, миграции и создание тестовой БД не выполнялись. Следующее действие — read-only подтверждение статуса, loopback listener, процесса и параметров сервера через PG18 psql.


### UA-001 — PostgreSQL 18 server identity and loopback isolation verified (2026-11-16)

Пользователь выполнил read-only проверки временного кластера. `pg_ctl status` сообщил PID `15220` и executable `X:/Program Files/PostgreSQL/18/bin/postgres.exe`, data directory `X:/PinPosy-verify-pg18`, параметры `-h 127.0.0.1 -p 55439 -c listen_addresses=127.0.0.1`. `Get-NetTCPConnection` показал listener `127.0.0.1:55439`, PID 15220. PG18 `psql.exe` read-only запрос вернул: database `postgres`, user `pinposy_verify_admin`, server address `127.0.0.1`, port `55439`, data directory `X:/PinPosy-verify-pg18`, server encoding `WIN1251`, version `PostgreSQL 18.6`. Пароль вводился локально, в переписке не раскрывался. Подтверждено, что временный сервер слушает только loopback. Миграции не выполнялись и тестовая БД не создавалась. Перед следующим этапом нужно сверить локальный checkout с main, проверить хэш скрипта и корректно выставить PG18 `psql` в PATH плюс `PGUSER=pinposy_verify_admin` только в текущем PowerShell-сеансе (verify.ps1 не задаёт `-U` явно).


### UA-001 — локальная ветка отстаёт от GitHub main (2026-11-16)

Пользователь выполнил `git fetch origin`. Получено: локальный HEAD `0d393d34a0fbccf24dc46eefe5bf69281db965c5`, `origin/main` `ab5ab3e83f3f2bef68b6715b92d37a68cefc0320`, статус `main...origin/main [behind 420]`; `git status --short --branch` не показал незакоммиченных изменений. Хэш локального `scripts/verify.ps1` равен `6614843edaafd4924c90c679a0f9fe232e59a0f0` и совпадает с проверенным GitHub-файлом. Локальная ветка в целом устарела на 420 коммитов. Рекомендован следующий шаг: fast-forward only pull, без merge commit и без reset. Никаких миграций или тестов не запускалось.


### UA-001 — fast-forward sync локального main завершён (2026-11-16)

Пользователь выполнил `git pull --ff-only origin main`; операция прошла успешно. Локальная ветка обновлена с `0d393d34a0fbccf24dc46eefe5bf69281db965c5` до `ba6caa67ad9903b964172e9d0ce2d5609be0bbd0`, fast-forward затронул 90 файлов (4221 insertions, 705 deletions). После операции `git status --short --branch` вывел `## main...origin/main` (чисто), `git rev-parse HEAD` — `ba6caa67ad9903b964172e9d0ce2d5609be0bbd0`. Локальный checkout синхронизирован с origin/main. Никакие тесты и миграции не запускались. Следующий шаг — контролируемый migration-only replay на временном PG18 cluster (127.0.0.1:55439), без frontend/backend проверок.


## UA-001 — повторить migration replay после исправления 140 (2026-11-16)

- Первый локальный replay на временном PostgreSQL 18.6 достиг migration 140 и завершился с SQL syntax error. Disposable DB `pinposy_verify_13212ccdd0602` успешно удалена самим verify script; временный cluster `X:\PinPosy-verify-pg18` на `127.0.0.1:55439` оставлен работающим.
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
- **Ничего нового от владельца не требуется сверх UA-004.** Когда владелец вернётся: в PowerShell из `X:\!PROGECT\pinboard-ai` проверить clean `main`, выполнить `git pull --ff-only origin main`, затем `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1 -PostgresPort 55439`. Ввести пароль только в скрытый локальный prompt; передать полный stdout/stderr/exit code без пароля и иных секретов.
- При любом отказе preflight остановиться и передать точный вывод; не обходить guard. Не использовать production, PIN_TRIAL, существующий кластер/PID 5632 и не удалять временный кластер `X:\PinPosy-verify-pg18`. После успешного прогона ассистент проверит фактический результат и cleanup, затем выдаст следующий отдельный шаг по Bash concurrency suite.


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
   [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\scripts\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
   if ($errors.Count -gt 0) { $errors | Format-List; throw 'PowerShell parser check failed.' }
   'PASS: PowerShell parser'
   ```

3. Only if the parser prints `PASS: PowerShell parser`, run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1 -PostgresPort 55439
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
- Не запускать на production/PIN_TRIAL; не останавливать существующий PostgreSQL/PID 5632; не удалять временный кластер `X:\PinPosy-verify-pg18`.

**Что означает текущий PASS:** подтверждён только синтаксический разбор PowerShell-файла. Он не подтверждает запуск runner, соединение с PostgreSQL, миграции, 46 SQL tests или cleanup.

После получения результата ассистент сверит число выполненных тестов, exit code и cleanup. Только при подтверждённых SQL integration PASS и cleanup можно перейти к отдельной подготовке Bash concurrency suite. До этого UA-005 и backend runtime suite заблокированы.


### UA-004 follow-up — PostgreSQL identity guard CIDR mismatch (2026-11-17)

**Важно:** это отдельный SQL integration runner, а не уже пройденный migration replay. 2026-11-16 `scripts/verify.ps1` успешно выполнил `001_baseline.sql` + 139 миграций `010–148` на disposable PostgreSQL 18.6; результат `MIGRATION REPLAY PASSED`, временная БД удалена. Этот успешный результат сохраняет статус PASS.

**Статус: runner остановился на identity guard; SQL fixture и тесты не запускались.**

Владелец сообщил, что:
- локальный checkout был чистым и fast-forward обновлён до `21226c6d`;
- runner подтвердил clean `main`, PID `15220` и data directory `X:\PinPosy-verify-pg18`;
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
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1 -PostgresPort 55439`.
4. Передать полный вывод, exit code и cleanup confirmation без секретов. Если identity guard или любой preflight снова отказывает — остановиться и прислать точный вывод. Не обходить проверки, не редактировать настройки сервера вручную.

До подтверждённых SQL integration PASS и удаления disposable DB Bash concurrency и backend runtime suites остаются заблокированы.


### Canonical migration replay — do not ask the owner to repeat it (2026-11-17)

The owner supplied the complete successful PowerShell transcript for the migration-only replay. It was run from `X:\!PROGECT\pinboard-ai` against PostgreSQL 18.6 at `127.0.0.1:55439`, data directory `X:/PinPosy-verify-pg18`, server encoding WIN1251 and client encoding UTF8. The guarded preflight checked branch `main`, clean tree, historical HEAD `ebb1040ac73e600dfdbfc57d8aa765f9713441a2`, SHA-256 object hashes for migration 140 and `scripts/verify.ps1`, PostgreSQL 18 `psql.exe`, and exactly one loopback listener on port 55439. The temporary role password was read as a SecureString, used only in the process environment, and the previous environment values and PATH were restored in `finally`.

The command executed `scripts/verify.ps1 -MigrationsOnly -PostgresPort 55439`. It created disposable database `pinposy_verify_196929316b56e`, applied Supabase test stubs, `001_baseline.sql`, and all migrations `010–148` (139 migrations), then successfully dropped the disposable database. Explicit terminal evidence: `PASS PostgreSQL migration replay (001 + 010-148)`, `All configured checks passed.`, `MIGRATION REPLAY PASSED`. **This migration replay is PASS and must not be described as unrun.**

This is not the later separate SQL integration runner and does not establish execution of its inline assertions or 46 SQL test files. Maintain separate statuses. Full procedure and safety interpretation are recorded in `docs/PROJECT_STATE.md` under “Canonical local PostgreSQL migration replay procedure”. Do not ask the owner to rerun this already successful replay merely to resolve the separate integration-runner identity-guard issue.


### UA-004 follow-up — migration 018 constraint collision (2026-11-17)

**Owner-side result:** after clean fast-forward to `33fdee6f3da62495ed3137ebf06cb04b91c3ffcb`, PowerShell parser returned `PASS`. The guarded runner passed repository/server identity checks, created disposable DB `pinposy_sqlint_389e6a26525c4ee8`, applied the upgrade fixture and reached migration `018_preferred_language.sql`. PostgreSQL reported that `users_preferred_language_check` already exists. The runner then successfully terminated connections, dropped the disposable database and confirmed `Removed disposable database ...`.

**Status:** SQL integration remains blocked at migration 018. The 2 inline assertions and 46 SQL test files were not reached. The independent migration-only replay `001 + 010–148` remains PASS.

**Next diagnostic:** inspect the precise constraint catalog state immediately before migration 018 and capture full `psql` error context. Static review of the current fixture and migrations 010–017 does not show this named constraint being created, while migration 018 explicitly drops it before adding it. Root cause is unresolved; do not remove or weaken the constraint speculatively.

**Safety:** temporary database cleanup is confirmed. Do not stop PID `15220`, alter/reinitialize `X:\PinPosy-verify-pg18`, touch production/PIN_TRIAL, or bypass runner guards. Node contract test remains unverified unless a separate result is supplied.


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
- `node --test .\backend\test\postgres-integration-runner-contract.test.js`: **10 passed, 0 failed, 10 total**. All named contract checks in the output passed, including the corrected diagnostic-heading assertion.
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


### UA-011 — integration run passed migrations and inline assertions; SQL test 1/46 failed

Owner transcript summary:
- `git status --short` was empty.
- `git pull --ff-only origin main` fast-forwarded `13166c8c..c047f44c`.
- `git rev-parse HEAD` and `git rev-parse origin/main` both returned `c047f44cce666e6dbe844cf318a4b314dd60040c`.
- `node --test backend/test/postgres-integration-runner-contract.test.js`: 12 tests, 12 pass, 0 fail.
- PowerShell Parser API: `PowerShell Parser: PASS`.
- Guarded runner command: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`.

Runner confirmed clean synchronized main; approved listener PID 15220 and data directory `X:\PinPosy-verify-pg18`; hidden password prompt; server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.

Disposable DB `pinposy_sqlint_b39373fd69614fe7` was created. Fixture passed, all 139 migrations 010–148 passed, and both inline assertions passed. The first of 46 SQL tests failed:
`backend/test/pinterest-unknown-schedule-reconciliation.integration.sql:110`
`schedule remote pin identity conflict incorrectly promoted schedule`
psql exit code 3. Remaining 45 SQL tests did not run.

Cleanup confirmed by runner output: session termination, DROP DATABASE, and `Removed disposable database pinposy_sqlint_b39373fd69614fe7`. This is a test failure, not a runner/PowerShell failure. SQL integration remains NOT PASSED.

Assistant fetched the failing test and migrations 091, 092, 093 and 148. Test blob `20f04be636298e0cdb33ce1725cd2558e4121e9e`; migration blobs: 091 `6da23cf6851e28e8fbecbf4d7a3831008ab9c86b`, 092 `acca458a7c4abb236ea056e18c46c0628355ceb4`, 093 `03d126ad051bd192d32a64d06ac0f5b9e007e895`, 148 `5bdad254de1d4bb19d68bd9618561da55216f9b8`.

The test sets schedule remote ID to `remote-already-recorded` while attempt/publication ledger agree on `remote-confirmed-123`; it expects reconciliation to return zero and preserve the schedule as unknown with the original ID. Migration 093 appears to contain that exact guard, but runtime behavior contradicted the static source. Root cause is OPEN. Do not alter expected behavior or migration logic until the effective runtime function is inspected.

Assistant created audit `docs/audits/2026-11-17-pinterest-unknown-schedule-reconciliation-test-failure.md`. Next diagnostic will report the returned count, actual schedule fields and effective function body (`pg_get_functiondef`) when the assertion fails, and inspect later migration overrides. Owner action is not required until the diagnostic patch is committed and published. Do not manually connect to production/PIN_TRIAL or modify the persistent verification cluster.


### UA-012 — диагностический вывод при сбое Pinterest reconciliation (2026-11-17)

Assistant получил owner transcript: local main и origin/main были синхронизированы на `c047f44cce666e6dbe844cf318a4b314dd60040c`; `git status --short` пустой; Node contract suite 12/12 PASS; PowerShell Parser PASS. Guarded runner применил fixture, 139 миграций 010–148 и 2 inline assertions, затем SQL test 1/46 `pinterest-unknown-schedule-reconciliation.integration.sql:110` завершился ошибкой `schedule remote pin identity conflict incorrectly promoted schedule` (psql exit 3). Disposable DB `pinposy_sqlint_b39373fd69614fe7` удалена, runner явно подтвердил удаление; tests 2–46 не запускались.

Assistant повторно прочитал тест и migration 093. В migration 093 присутствует guard по remote ID, но runtime результат противоречит статическому чтению. Для следующего безопасного запуска assistant изменил только диагностическую ветку failing test: при нарушении ожидания теперь собираются row count, фактические status/remote ID расписания и тело эффективной функции через `pg_get_functiondef`. Основное ожидаемое поведение теста не изменено.

Изменённый файл: `backend/test/pinterest-unknown-schedule-reconciliation.integration.sql`; blob `95d01cccc1e8ec722b5c101e9a7939cda1b393c0`; commit `aa1eb96daaf4b2d3148f596372850e43b5052b7a`.

Assistant выполнил только GitHub read/update и статическое сравнение файлов; локальные тесты и PostgreSQL не запускались. Владелец должен синхронизировать `main`, затем повторить guarded runner. Ввод пароля только в скрытом prompt. Не обращаться к production/PIN_TRIAL, не останавливать PID 15220 и не удалять `X:\PinPosy-verify-pg18`. SQL integration остаётся NOT PASSED.


- **SQL integration attempt at main `5d3548a5` (2026-11-17):** owner showed clean status before pull; `git pull --ff-only origin main` fast-forwarded `c047f44c..5d3548a5`; `git rev-parse HEAD` and `git rev-parse origin/main` both returned `5d3548a58eb7e53469cf43893f189403a2c2088b`. The guarded runner verified the approved temporary PostgreSQL target (PID 15220, `X:\PinPosy-verify-pg18`) and identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`, then created disposable DB `pinposy_sqlint_1b70f80297f04d60`. The CI fixture, all 140 migrations `010–149`, both inline assertions, and SQL tests 1/46 and 2/46 passed. Test 3/46 (`pinterest-schedule-cancellation-race.integration.sql:93`) failed because `users.is_admin` was missing. Runner confirmed cleanup and printed `Removed disposable database pinposy_sqlint_1b70f80297f04d60`. Tests 4–46 did not run; SQL integration NOT PASSED.
- **Root cause and fix:** canonical `db/migrations/001_baseline.sql` defines `users.is_admin boolean default false`, but both the GitHub Actions fixture and standalone upgrade fixture omitted it. The test's insert is valid against the canonical baseline. Assistant added the column to both fixture definitions and added a contract assertion. Source commits: workflow `763f91a0e58a505df9823f37479a08a08856f388`; standalone fixture `698bcb4b07df2b636a4378679dbbc1de55f69ac2`; contract test `7a9a53f9bae5fdce29d4941295e17ce8b802985a`. Full analysis: `docs/audits/2026-11-17-postgres-integration-fixture-is-admin-missing.md` (commit `918f0bbf97d51514f1ed74b5785c4bbebdfc7210`).
- **Required owner action:** after the assistant finishes the documentation commits, fast-forward only, confirm clean status and equal HEAD/origin/main, then run `node --test backend/test/postgres-integration-runner-contract.test.js`. If it passes, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`. Enter the temporary password only at the hidden prompt. Send complete output; do not report PASS unless all 46 SQL tests and cleanup succeed.


- **Follow-up source review (2026-11-17):** assistant corrected an over-escaped regex in the new fixture contract assertion. Contract test commit `89d5fd4baf14f790141fe1cb244a6f282d68e004`, blob `54c0ba51ce8a3ac2e5a6b677be6a3b6950a1448c`. Re-fetched workflow/fixture/test and source-level comparison confirmed CI and standalone fixture bodies match exactly after the existing normalization; both contain `is_admin boolean default false`; assertion is present; contract file has 13 test declarations. This is not a test run. Owner must still run Node contract suite before the guarded SQL integration rerun.


## 2026-11-17 — очередной запуск SQL integration: ошибка типов в тесте 3/46

Владелец выполнил синхронизацию с `main`: чистый status; `git pull --ff-only origin main` обновил `5d3548a5 → 5617a53095249ce45aafe4bdad17ad39781b668e`; `HEAD` и `origin/main` совпали.

Команды и результаты:
- `node --test backend/test/postgres-integration-runner-contract.test.js` — **13/13 PASS**, 0 failed.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1` — runner проверил clean synchronized main, PID 15220, каталог `X:\PinPosy-verify-pg18`, скрытый ввод пароля и identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Disposable DB: `pinposy_sqlint_004e2422a382484b`.
- Upgrade fixture, 140 миграций 010–149 и две inline CI assertions — успешно.
- SQL tests: 1/46 и 2/46 — успешно; 3/46 `pinterest-schedule-cancellation-race.integration.sql`, строка 93 — ошибка `operator does not exist: text = uuid`. Остальные 43 теста не запускались.
- Cleanup: runner завершил сессии, выполнил DROP DATABASE и вывел `Removed disposable database pinposy_sqlint_004e2422a382484b`.

Диагноз: `db/migrations/015_persistent_pin_schedule.sql` задаёт `pin_schedules.user_id` как TEXT; SQL test сравнивал его с переменной UUID без cast в двух UPDATE. Исправлено только тестовое сравнение на `v_user_id::text`; production migrations не менялись. Добавлен Node contract guard на оба cast.

Опубликованы:
- SQL test commit `c0db3c5e5f4cc2ead97443693b78bdd79622be53`, blob `adb8b7669052021ce2537b5a2985786bab13a4d7`.
- Node contract commit `de1d765e53e30e0617ec7994f1e22bdeaff4e025`, blob `ba228cbaef5ea83ff7d9c22221b3921f8087f4dd`.
- Audit: `docs/audits/2026-11-17-postgres-integration-schedule-user-id-type-mismatch.md`.

⚠️ Следующий шаг после публикации всех документов: `git pull --ff-only origin main`, проверить чистый status и равенство HEAD/origin/main; выполнить Node contract suite; при PASS повторить guarded runner. Вводить пароль только в скрытом prompt. SQL integration пока **NOT PASSED**.

Количество проверок в Node contract-файле теперь 14 (подсчитано по исходнику после добавления проверки двух cast); это не результат запуска. Нужно выполнить тесты локально.


### UA — запуск SQL integration 2026-11-17: FK в тестовой очистке account deletion

**Что выполнено владельцем**
- `git status --short` — пусто; `git pull --ff-only origin main` обновил `5617a530 → 8ebae45e`; обе команды `git rev-parse HEAD` и `git rev-parse origin/main` вернули `8ebae45ed1dd141b8ca08a0104c8127041ea2a62`.
- `node --test backend/test/postgres-integration-runner-contract.test.js` — **14 tests, 14 pass, 0 fail**.
- Запущен `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`.
- Runner проверил clean synchronized main, listener PID 15220, каталог `X:\PinPosy-verify-pg18`, скрытый ввод пароля и identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Создана disposable DB `pinposy_sqlint_88f6d6f8b1654c23`. Fixture, 140 миграций 010–149, две inline assertions и SQL tests 1–5/46 прошли.
- Test 6/46 `account-deletion-reauth-version.integration.sql:65` упал с FK RESTRICT `account_deletion_jobs_request_id_fkey` при удалении request. Остальные tests 7–46 не запускались.
- Runner завершил сессии (0 remaining), выполнил DROP DATABASE и подтвердил `Removed disposable database pinposy_sqlint_88f6d6f8b1654c23`.

**Причина и изменение**
- Migration 130 создаёт job и append-only event для принятого deletion request; обе записи ссылаются на request через RESTRICT. Event нельзя удалять из-за immutable trigger. Старый test пытался вручную удалить request, поэтому ломался в очистке.
- Изменён только SQL test: BEGIN/ROLLBACK вокруг DO block; ручные DELETE удалены. Production migrations не менялись.
- SQL blob `90486cf3499f54f36a4bda50f88f326f52e5bf0a`, commit `61e508df37ed1a3ff6c0c6c57622dfa65b6c1b26`.
- Добавлен contract guard: blob `3801da4c55a12aa7668eb940f3ab1cbd753bab2c`, commit `2860d0df79c2eb0d7bef7a727171a45b79202402`.
- Audit: `docs/audits/2026-11-17-postgres-integration-reauth-test-fk-cleanup.md`.

**⚠️ Следующие действия владельца после публикации всех документов**
```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
node --test backend/test/postgres-integration-runner-contract.test.js
```
Если все 15 contract tests PASS, выполнить:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```
Пароль — только в скрытом prompt. Прислать полный вывод. Не запускать runner, если Node suite падает или HEAD не совпадает с origin/main. SQL integration пока **NOT PASSED**.

- Follow-up: assistant reviewed its newly added contract assertion before asking owner to run it, caught over-escaped regex patterns, and replaced them with literal `indexOf`/`includes` checks. Final contract blob `4681aa4ab8155a0c5c8b649e35bfdd3085fd8d2f`, commit `ace9c270f8ad789a0135cdbe4c0b1bceac768e4e`. Node suite has **not** been run after this final correction; keep the 15-test execution as the next owner gate.


## UA — повтор SQL integration: durable queue Storage manifest guard (2026-11-17)

**Результат владельца**
- Checkout synchronized at `01a7fd7f8ab60bfc6e380cef01352b6d6ae2f038`; clean worktree; `HEAD` = `origin/main`.
- Node contract suite: **15/15 PASS**.
- Guarded runner: fixture PASS; migrations 010–149 (140) PASS; two inline assertions PASS; SQL tests 1–6/46 PASS; test 7/46 `account-deletion-durable-queue.integration.sql` failed with `account deletion Storage manifest is required`.
- Disposable DB `pinposy_sqlint_ab121efa0ee94999` cleanup confirmed (0 sessions; DROP DATABASE; explicit removed message). Tests 8–46 not run. SQL integration NOT PASSED.

**Исправление**
- Migration 144 проверяет Storage manifest до обновления статуса job; тест ошибочно ожидал старое сообщение от inventory trigger из migration 131. Marker из migration 137 можно записать только после inventory, поэтому первый guard ожидаемо именно Storage manifest.
- Исправлен только expected error/comment в `backend/test/account-deletion-durable-queue.integration.sql`: blob `733295e89326d675be7c3e7c4a7dcd71c1dc1022`, commit `24889b82c1b9221fed49716dad25a3a6d02f75e8`.
- Добавлен Node contract guard: blob `c5dcbf017955d1c125f91ec75c2e4df13a036b4e`, commit `684acac9a226e6a3a442c076a1806ad10fd6b788`.
- Audit: `docs/audits/2026-11-17-postgres-integration-durable-queue-storage-manifest-guard.md`.

**⚠️ Следующие действия владельца после публикации всех документов**
```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
node --test backend/test/postgres-integration-runner-contract.test.js
```
Если все **16** contract tests PASS и HEAD совпадает с origin/main, выполнить:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```
Пароль вводить только в скрытом prompt. Не запускать runner при падении Node suite или несовпадении HEAD. Не останавливать PID 15220, не удалять `X:\PinPosy-verify-pg18`, не трогать production/PIN_TRIAL.


## UA — SQL integration 2026-11-17: boards.cover_url missing from upgrade fixture

**Результат владельца**
- Синхронизация: локальный `HEAD` и `origin/main` = `546492915c1861b834098a1dace2e5c585e847d9`.
- Node contract suite: **16/16 PASS**.
- Guarded runner: fixture PASS; 140 миграций 010–149 PASS; две inline assertions PASS; SQL tests 1–7/46 PASS.
- Тест 8/46 `account-deletion-storage-manifest.integration.sql` упал на строке 380: `column "cover_url" of relation "boards" does not exist`. Тесты 9–46 не запускались.
- Временная БД `pinposy_sqlint_452f781659d544cd` удалена runner'ом; подтверждены 0 оставшихся сессий, DROP DATABASE и сообщение Removed disposable database. SQL integration пока **NOT PASSED**.

**Диагностика и исправление**
- В каноническом `db/migrations/001_baseline.sql` поле `public.boards.cover_url text` есть. Его не было в двух upgrade fixtures: standalone SQL и workflow GitHub Actions. Migration 141 использует `boards.cover_url` при сборе board-cover объектов для Storage manifest. Создание PL/pgSQL функции не выявило отсутствие колонки; ошибка проявилась при выполнении теста.
- Добавлено `cover_url text` в оба fixture, production migration не менялась:
  - workflow blob `959399fc34989298ac060bd42a605312d7c86073`, commit `5b91890019f8a2758686946fcf85ce9de9f2eb5e`;
  - standalone fixture blob `e57795b598e16939952f180ac36bc942336d0444`, commit `1783ba84a3d30454445c909459dfc559510128bb`.
- Добавлен Node contract assertion о наличии `cover_url` в fixture и baseline. Первоначальный regex draft оказался over-escaped; assistant исправил его на split-based extraction до передачи теста владельцу. Final contract blob `fe2a1ce4cfb0ca7e06ff0c2b4d087d40943db66a`, commit `91d787eb945d2065a89a98e38ac51679f2461ed4`. Сейчас в файле 17 test declarations по source inspection, новый suite ещё не запускался.
- Audit: `docs/audits/2026-11-17-postgres-integration-storage-manifest-board-cover-fixture.md`, commit `6d2230a98fab683d67e1cecd54cb966e68f02223`.

**Действия assistant**
- Прочитаны из GitHub baseline, обе fixture-версии, workflow, failing SQL test, migration 141 и журналы документации; сравнен boards schema и usage cover_url.
- Обновлены два fixture, добавлен и исправлен contract test, создан audit, обновляются PROJECT_STATE, USER_ACTIONS и DOCUMENTATION_REGISTER.
- Assistant не запускал Node, PowerShell, psql или PostgreSQL. 16/16 PASS — результат владельца на старом commit, не подтверждение новых изменений.

**⚠️ Следующий шаг после публикации всех документов**
```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
node --test backend/test/postgres-integration-runner-contract.test.js
```
Если checkout чистый, HEAD = origin/main и все **17** contract tests PASS:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```
Пароль — только в скрытом prompt. Не останавливать PID 15220, не удалять `X:\PinPosy-verify-pg18`, не трогать production/PIN_TRIAL. Прислать полный вывод и подтверждение cleanup. SQL integration не считать пройденным, пока не пройдут все 46 тестов.


## UA — SQL integration 2026-11-17: upgrade fixture omitted cascade FKs

**Результат владельца**
- Синхронизация: локальный `HEAD` = `origin/main` = `758eba5efdceb4f76c99b9d0077301e7c3fe58d8`, worktree чистый.
- Node contract: **16 PASS / 1 FAIL из 17**. Единственный сбой — проверка `cover_url`: в SQL fixture записано `cover_url   text`, а regex требовал один пробел. Это ошибка проверки, не отсутствие поля.
- Несмотря на падение Node suite, runner был запущен. Fixture PASS, 140 миграций 010–149 PASS, две inline assertions PASS, SQL tests 1–7/46 PASS.
- Тест 8/46 `account-deletion-storage-manifest.integration.sql` упал на FK `boards_project_id_fkey`: удаление проекта блокировалось существующей board. Тесты 9–46 не запускались.
- Disposable DB `pinposy_sqlint_a28d8185bc44448f` удалена: 0 сессий, DROP DATABASE и явное сообщение runner об удалении. SQL integration **NOT PASSED**.

**Диагностика и исправление**
- Migration 137 удаляет проект и рассчитывает на каскадное удаление дочерних boards и pins. В canonical baseline заданы `boards.project_id REFERENCES projects(id) ON DELETE CASCADE` и `pins.board_id REFERENCES boards(id) ON DELETE CASCADE`. Оба cascade отсутствовали в CI и standalone upgrade fixtures. Ошибка — расхождение тестовой схемы с baseline; production функцию и FK не ослабляли.
- Исправлены оба fixture:
  - standalone blob `bf9aad94a6b4381777586a97a88f3dc6eab373a6`, commit `b22ed9e255fe799fd3be91caf36b5c71f03a1387`;
  - CI workflow blob `ad8d456eed5829c7aba0c8b9bfea314516b3e9d4`, commit `0724225a5ad324ba2eb9107ddaf202745d8761a4`.
- Добавлен contract test для обеих каскадных связей: blob `cb9af9c67b1b1bbbc2073279a9fc7e3d0aa2491d`, commit `07e5a4a87350ba80f49adb4f3ba8bc1fbbf9c4cc`.
- Regex проверки `cover_url` исправлен на `\s+`: final contract blob `9e03e2448dca977c25114185ecd12bd46408e5e7`, commit `edadd964bcd82246051f4934298038e76e909fb2`. Теперь в contract suite **18** тестов по source inspection; после исправления они ещё не запускались.
- Audit: `docs/audits/2026-11-17-postgres-integration-storage-manifest-project-board-cascade-fixture.md`, latest audit update commit `9775d4df9ba1990ef305fc92677cd4d0eb43acd7`.

**Действия assistant**
- Прочитаны transcript владельца, migration 137, canonical baseline, оба fixture, failing SQL test, contract test и документация.
- Сопоставлены порядок удаления и FK-правила; исправлены только CI/standalone fixture и contract assertions; production migration не менялась.
- Создан audit, обновлены PROJECT_STATE, USER_ACTIONS и DOCUMENTATION_REGISTER. Assistant использовал GitHub source reads/writes; локально Node, PowerShell, psql и PostgreSQL не запускал.

**⚠️ Следующие действия владельца после публикации всех документов**
```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
node --test backend/test/postgres-integration-runner-contract.test.js
```
Если worktree чистый, HEAD = origin/main и все **18** contract tests PASS:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```
Пароль — только в скрытом prompt. Не запускать runner при падении Node suite. Не останавливать PID 15220, не удалять `X:\PinPosy-verify-pg18`, не трогать production/PIN_TRIAL. SQL integration не считать пройденным, пока не пройдут все 46 тестов и cleanup.


## UA — 2026-11-17: владелец остановил разработку для системного разбора SQL integration gate

**Синхронизация и contract suite**
- Владелец выполнил fast-forward pull с `758eba5e` до `c92cb6d4`.
- `git rev-parse HEAD` и `git rev-parse origin/main` совпали: `c92cb6d402686abbca583ecb8871e7b2f9c1fc8f`.
- Node suite: **18 tests, 17 pass, 1 fail**. Падает cascade contract assertion: в regex literal перед `s` двойное экранирование; это defect проверки, а не SQL FK.

**Guarded SQL runner — фактический owner transcript**
- Runner подтвердил clean main, PID 15220, data directory `X:\PinPosy-verify-pg18`, hidden password prompt и server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Disposable DB: `pinposy_sqlint_bb8532df036144f0`.
- Fixture PASS; migrations **010–149 (140)** PASS; оба inline assertions PASS; SQL tests **1–7/46 PASS**.
- Test 8/46 `account-deletion-storage-manifest.integration.sql` failed inside `finalize_account_deletion(uuid,uuid)`: `users.subscription_tier` missing.
- Cleanup confirmed: 0 sessions, DROP DATABASE, `Removed disposable database pinposy_sqlint_bb8532df036144f0`. Tests 9–46 не запускались; SQL integration **NOT PASSED**.
- Важно: runner был запущен при результате Node suite 17/18. Это нарушило ранее записанное условие запуска только после PASS contract suite. Не повторять; guarded runner сохранил собственные safety checks и disposable cleanup.

**Read-only source analysis**
- Baseline `001_baseline.sql` содержит `subscription_tier`, `name`, `surname`, `onboarded`; standalone и CI fixtures не содержат эти четыре поля.
- Migration 138 использует все четыре поля в одном UPDATE. Поэтому исправление только `subscription_tier` может просто открыть следующую ошибку по `name`, `surname` или `onboarded`.
- Это повторяющийся класс fixture mismatch после `is_admin`, `boards.cover_url` и cascade FKs. Требуется предварительная сверка schema contract для всех критических сценариев, а не точечные догадки по очередной первой ошибке.
- Assistant fetched baseline, migrations 127/137/138, standalone fixture, CI workflow, test 8, contract test and current docs. Assistant only inspected GitHub source; no local Node/PowerShell/psql/PostgreSQL execution.
- Создан audit: `docs/audits/2026-11-17-postgres-integration-stop-and-review.md`. В рамках остановки не менялись application code, migrations, fixtures, CI workflow, SQL tests или DB; обновляется только документация.

**⛔ ТЕКУЩИЙ СТАТУС: ПАУЗА**
- Не запускать повторно `scripts/verify-integration.ps1`, пока Node contract suite не будет полностью PASS.
- Не вносить следующие fixture/code fixes до согласования системного плана schema-contract inventory.
- Пока не требуется выполнять новые команды на компьютере. Сначала владелец рассматривает анализ.
- Сохранить PID 15220 и `X:\PinPosy-verify-pg18`; не трогать production/PIN_TRIAL; пароль вводить только в скрытый prompt.


## UA-005 — проверить обновлённый schema-contract gate после синхронизации main (2026-11-17)

**Почему требуется:** assistant исправил два расхождения timestamp types в тестовых fixtures и добавил source-contract assertion. Runtime execution недоступен из среды assistant: нет доступа к пользовательскому Windows checkout, PowerShell и локальному PostgreSQL verification cluster. Нельзя объявить тесты PASS только по чтению исходников.

**Сначала — синхронизация и Node gate**
1. В корне локального checkout выполнить:
   ```powershell
   git status --short
   git pull --ff-only origin main
   git rev-parse HEAD
   git rev-parse origin/main
   git status --short
   ```
2. Продолжать только если worktree чистый и `HEAD` совпадает с `origin/main`. На момент записи ожидаемый latest commit: `ad08033e39e982d2fdcb12e63dfc32eddb3559a3` (перед запуском сверить фактический main; документационные commits могут изменить HEAD).
3. Запустить:
   ```powershell
   node --test backend/test/postgres-integration-runner-contract.test.js
   ```
4. Ожидается 21 test declaration по source inspection. Передать полный stdout/stderr и exit code. Если хотя бы один тест FAIL — **СТОП**: SQL runner не запускать, сначала сохранить точный вывод и сообщить assistant.

**Только если Node suite полностью PASS**
1. Выполнить PowerShell Parser API check для `scripts/verify-integration.ps1` (без запуска скрипта) и передать результат.
2. Запустить guarded runner только в ранее разрешённом disposable PostgreSQL 18.6:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1 -PostgresPort 55439
   ```
3. Runner обязан самостоятельно подтвердить clean synchronized main, loopback-only endpoint, listener PID 15220, data directory `X:\PinPosy-verify-pg18` и точную server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`. Пароль вводить только в hidden prompt; не отправлять его assistant.
4. Передать полный лог без секретов. SQL gate считается пройденным только при PASS fixture, всех 140 migrations 010–149, двух inline assertions, всех 46 SQL tests и подтверждённом удалении только disposable DB.

**Запрещено**
- Не запускать SQL runner при failed/неполном Node suite.
- Не использовать production, PIN_TRIAL или существующую БД; не останавливать PID 15220 и не удалять persistent verification cluster.
- Не присылать пароли, токены, .env или другие секреты.
- Не запускать Bash concurrency suite и backend runtime suite до полного SQL PASS и cleanup.

**Статус:** [ ] Ожидает владельца. После получения вывода assistant обязан перепроверить актуальный main, записать фактический результат и обновить статус в PROJECT_STATE.md.

## UA-006 — уточнённый schema-contract gate после полной source-инвентаризации (2026-11-17)

UA-006 supersedes the stale expected commit and 21-test count in UA-005. Current contract source has **20 top-level `test(...)` declarations**. `token_version` is first introduced by migration 023 and reasserted by 055.

**Когда вернёшься к компьютеру — сначала синхронизация:**
```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```
Продолжать только если worktree чистый и `HEAD` совпадает с `origin/main`. Не сверяться с заранее зашитым SHA: `main` может продвинуться дополнительными documentation commits.

**Первый gate — только Node contract suite:**
```powershell
node --test backend/test/postgres-integration-runner-contract.test.js
```
Передать полный stdout/stderr и exit code. По исходнику ожидается 20 top-level tests; PASS подтверждается только реальным завершением Node с 0 failures. Если хотя бы один FAIL — **СТОП**, SQL runner не запускать.

**Только при полном Node PASS:**
1. Повторить PowerShell Parser API check для `scripts/verify-integration.ps1`.
2. Запустить guarded runner на ранее разрешённом disposable PostgreSQL 18.6:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
   ```
3. Пароль временной роли вводить только в hidden prompt; не отправлять его в чат. Runner должен подтвердить clean synchronized main, loopback-only endpoint, PID 15220, data directory `X:\PinPosy-verify-pg18` и server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
4. Передать полный вывод без секретов. SQL gate закрывается только при PASS fixture, 140 migrations 010–149, двух inline assertions, всех 46 SQL tests и подтверждённом cleanup только disposable DB. При первом failure остановиться и сохранить лог.

**Текущие внешние CI ограничения:** GitHub Actions runs `44068607386`, `44068607454`, `44070232846`, `44070232989` имеют FAILURE без доступных steps/logs; причина до запуска job неизвестна. Vercel current status указывает `build-rate-limit`. Эти статусы не заменяют локальный Node/SQL gate.

**Запрещено:** production/PIN_TRIAL, изменение/удаление persistent verification cluster, остановка PID 15220, секреты в чате, запуск SQL runner при failed Node suite, запуск Bash/backend runtime suite до полного SQL PASS.

**Статус:** [ ] Ожидает владельца. После получения вывода assistant должен снова проверить актуальный `main`, сохранить фактические результаты и обновить PROJECT_STATE/REGISTER.

**Дополнение к UA-006 — повтор CI также не дошёл до шагов**
- Выполнен один rerun runs `44070232846` и `44070232989` (attempt 2). Новые jobs: `133996278489`, `133996306977`, `133996307323`; все завершились FAILURE с `steps: null`, `logs_url: null`. Test execution не подтверждён, причина неизвестна.
- При желании восстановить hosted CI отдельно проверьте GitHub Actions runner/usage/settings в интерфейсе GitHub. Это не заменяет локальный Node gate и не требует менять код наугад.


## UA-007 — повторный Node contract gate после исправления fixture parity assertion (2026-11-17)

**Предыдущий owner run**
- Локальный checkout был чистым до pull; fast-forward `c92cb6d4 → 72bafc7a`.
- `HEAD` = `origin/main` = `72bafc7a1a0e1921e4155eacc6d38df610f39780`; итоговый `git status --short` пуст.
- `node --test backend/test/postgres-integration-runner-contract.test.js`: **19 PASS / 1 FAIL из 20**. Единственная ошибка — тест сравнения standalone upgrade fixture с CI heredoc: actual-side фильтр удалял общий header comment, expected-side его сохранял.

**Что исправлено ассистентом**
- Только в `backend/test/postgres-integration-runner-contract.test.js` удалён лишний actual-side фильтр строки `-- CI upgrade-compatibility fixture.`; сравнение сохраняет общий комментарий на обеих сторонах. Исключение cluster role statements из expected сохранено.
- Contract commit: `e3517cdc717476bdba8e6d1f5f9fa289fb28be8f`; blob `03fc5d1973fcbc376367755009f310475e7cde44`.
- Audit: `docs/audits/2026-11-17-postgres-integration-fixture-header-contract-test.md`.

**Когда вернёшься к PowerShell — синхронизация**
```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```
Продолжать только при чистом worktree и равных HEAD/origin/main.

**Повторный Node gate**
```powershell
node --test backend/test/postgres-integration-runner-contract.test.js
```
Передать полный stdout/stderr и exit code. Ожидается 20 tests по исходнику; PASS подтверждается только фактическим результатом Node с 0 failures. При любом FAIL — STOP, SQL runner не запускать.

**Только после полного Node PASS**
- Выполнить PowerShell Parser API check.
- Затем guarded runner по ранее согласованной инструкции UA-006, только в разрешённом disposable PostgreSQL 18.6 и при подтверждении runner всех safety guards.
- SQL integration PASS возможен только после успешного fixture, 140 migrations 010–149, двух inline assertions, всех 46 SQL tests и подтверждённого cleanup disposable DB.

**Запрещено:** запускать runner при failed/incomplete Node suite; обращаться к production/PIN_TRIAL; останавливать PID 15220; менять/удалять `X:\PinPosy-verify-pg18`; передавать секреты в чат.

**Статус:** [ ] Ожидает владельца. Документационные commits после contract fix могут продвинуть main; ориентироваться на фактический HEAD, а не заранее заданный SHA.


## UA-008 — следующий gate после Node contract suite 20/20 PASS (2026-11-17)

### Фактический owner результат
- Checkout до pull был чистым.
- `git pull --ff-only origin main` fast-forward: `72bafc7a → 9beca59b`.
- `HEAD` = `origin/main` = `9beca59b21c1f41c330bc7df03abb3189866766e`; итоговый worktree чистый.
- `node --test backend/test/postgres-integration-runner-contract.test.js`: **20 PASS / 0 FAIL**, 20 tests total, exit code 0.
- Node contract gate закрыт. SQL integration по-прежнему **NOT PASSED**.

### Следующее действие владельца — PowerShell Parser API check (не запускает runner)

Из корня репозитория выполнить:

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path .\scripts\verify-integration.ps1),
    [ref]$tokens,
    [ref]$errors
) | Out-Null
if ($errors.Count -gt 0) {
    $errors | Format-List
    exit 1
}
"PASS: verify-integration.ps1 parsed successfully; syntax errors: 0"
```

Передать полный вывод и exit code. Это синтаксический parse check; он не запускает скрипт, не требует пароля и не подключается к PostgreSQL.

### Только при Parser PASS
1. Ещё раз проверить чистый checkout и синхронизацию с main:
   ```powershell
   git status --short
   git pull --ff-only origin main
   git rev-parse HEAD
   git rev-parse origin/main
   git status --short
   ```
   Продолжать только если worktree чистый и HEAD = origin/main.
2. Только затем запускать guarded runner согласно UA-006, без изменения параметров/целевого сервера:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
   ```
3. Пароль временной роли вводить только в hidden prompt; не отправлять его в чат.
4. Передать полный лог без секретов. SQL PASS — только при успешном fixture, 140 migrations 010–149, двух inline assertions, всех 46 SQL tests и подтверждённом удалении disposable DB.

### STOP / запрещено
- При Parser FAIL runner не запускать.
- Не использовать production/PIN_TRIAL.
- Не останавливать PID 15220; не изменять и не удалять `X:\PinPosy-verify-pg18`.
- Не присылать пароль, токены, .env или иные секреты.
- Не запускать Bash concurrency или backend runtime suite до полного SQL PASS и cleanup.

**Статус:** Node gate [x]; PowerShell Parser gate [ ] ожидает владельца; PostgreSQL SQL integration [ ] NOT PASSED.


## UA-009 — guarded PostgreSQL integration runner после Node и Parser PASS (2026-11-17)

### Закрытые gates по owner transcript
- Синхронизация перед Parser check: чистый worktree; fast-forward `9beca59b → 3f554999`; `HEAD` = `origin/main` = `3f5549990ce71c2e4ff86a393eabbf1d2776f944`.
- Node contract suite: **20/20 PASS** (см. UA-008 и audit Node contract 20-pass).
- PowerShell Parser API для `scripts/verify-integration.ps1`: **PASS**, сообщение `syntax errors: 0`.
- Parser gate закрыт. Это не является запуском runner и не доказывает SQL integration PASS.

### Следующее действие владельца
Сначала синхронизировать документационные commits:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Продолжать только если до/после pull worktree чистый, ветка `main`, а HEAD совпадает с origin/main.

Только затем запустить:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Runner попросит пароль временной роли через скрытый prompt. Пароль не копировать в чат, лог или документацию.

### Обязательные safety guards runner
Runner должен сам подтвердить:
- checkout на `main`, успешный `git fetch origin main`, чистый worktree и HEAD = origin/main;
- psql по ожидаемому пути;
- ровно один TCP listener на `127.0.0.1:55439`;
- listener принадлежит `postgres.exe`, command line содержит loopback host, port 55439 и data directory `X:\PinPosy-verify-pg18`;
- server identity строго `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`;
- создание новой случайной disposable DB с префиксом `pinposy_sqlint_`; никакая существующая DB не должна переиспользоваться.

Если любой guard не проходит — **STOP**, не обходить проверку и не менять порт/путь/сервер. При первом failure во время fixture/migration/assertion/test — runner должен завершиться и выполнить cleanup; сохранить полный вывод, включая результат cleanup.

### Критерии результата
SQL integration PASS допускается только при успешном:
1. upgrade fixture;
2. всех 140 migrations 010–149;
3. двух inline assertions;
4. всех 46 SQL integration tests;
5. cleanup: 0 оставшихся сессий, DROP disposable DB и подтверждение, что DB отсутствует.

После завершения передать полный лог без секретов и exit code. Если ошибка cleanup — отдельно отметить её; не объявлять PASS.

### Запрещено
- Production/PIN_TRIAL.
- Останавливать PID 15220.
- Изменять или удалять `X:\PinPosy-verify-pg18`.
- Передавать пароли, токены, .env и иные секреты.
- Запускать Bash concurrency или backend runtime suites до полного SQL PASS и cleanup.

**Статус:** Node 20/20 [x]; PowerShell Parser 0 errors [x]; PostgreSQL SQL integration [ ] ожидает owner runtime.

## UA-010 — повтор guarded PostgreSQL integration после исправления теста 15/46 (2026-11-17)

### Зафиксированный owner run
- Владелец запустил guarded runner на чистом synchronized main `d736814d78aa9cefbc9c6367104a98d236123c1b`.
- Safety guards прошли: listener PID 15220, data directory `X:\PinPosy-verify-pg18`, server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Fixture, 140 migrations 010–149, две inline assertions и SQL tests 1–14/46 прошли.
- SQL test 15/46 упал на сравнении TEXT `credit_transactions.user_id` с UUID `v_user`. Тесты 16–46 не запускались; SQL integration NOT PASSED.
- Cleanup: 0 оставшихся сессий; disposable DB `pinposy_sqlint_99741a5f1e5a47e6` удалена и её отсутствие подтверждено.

### Исправление уже опубликовано
- Только в `backend/test/legacy-regeneration-reservation-guard.integration.sql`: оба ledger-count predicates теперь используют `user_id=v_user::text`, что соответствует canonical baseline и migrations 010/075.
- Commit: `9f2648d0ac18f1b3e40c59accb68e5274df6985a`.
- Новый blob: `198a1714ce805e77a39c6e8a4334122b6a5fe09f`.
- Подробный audit: `docs/audits/2026-11-17-postgres-integration-test-15-text-uuid-mismatch.md`.

### Следующее действие владельца
Сначала синхронизировать все commits (test fix + audit + state + this action log + register) и убедиться, что checkout чистый:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Продолжать только если ветка `main`, worktree чистый и HEAD совпадает с origin/main. Затем повторить guarded runner без изменения параметров:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Пароль временной роли вводить только в hidden prompt; не передавать пароль, токены или .env. Передать полный вывод и exit code без секретов. Runner должен снова подтвердить все safety guards и выполнить только случайную disposable DB. При первом failure — STOP, сохранить cleanup output; не обходить guards.

### Критерий закрытия
SQL integration PASS — только если fixture, все 140 migrations 010–149, обе inline assertions, все 46 SQL tests и cleanup disposable DB успешно подтверждены. Если следующий тест упадёт, tests после него останутся не проверены.

### Запрещено
- Не использовать production/PIN_TRIAL.
- Не останавливать PID 15220.
- Не изменять и не удалять `X:\PinPosy-verify-pg18`.
- Не запускать Bash concurrency/backend runtime suites до полного SQL PASS и cleanup.

**Статус:** Node contract 20/20 PASS (owner transcript, prior commit); PowerShell Parser 0 errors (owner transcript, prior commit); PostgreSQL SQL integration **NOT PASSED**, ожидает повторного owner run после test-only fix.


## UA-011 — Node gate после исправления входа test 18/46 (2026-11-17)

### Зафиксированный owner run
- Владелец синхронизировал clean main до `0d31c813e39e420e26c5ebee0edadea1928df00d`; runner подтвердил PID 15220, `X:\PinPosy-verify-pg18` и server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Fixture, 140 migrations 010–149, две inline assertions и SQL tests 1–17/46 прошли. Test 18/46 упал с `invalid pin count`; tests 19–46 не запускались. SQL integration **NOT PASSED**.
- Cleanup подтверждён: disposable DB `pinposy_sqlint_ca5527ced768460b` удалена.

### Опубликованное исправление
- В `backend/test/provider-refund-reconciliation-guard.integration.sql` completion теперь получает один валидный pin JSON вместо пустого массива. Это позволяет пройти раннюю проверку `save_generated_pins_and_charge` и дойти до trigger guard migration 072, который тест и должен проверять.
- Commit `ea2016eed79de2854785f53d9d77a0d485d57d76`; blob `1ae496bdd596c848d18dc33a8f50e90de7b9cb78`.
- Подробный incident audit: `docs/audits/2026-11-17-postgres-integration-test-18-invalid-pin-count-test-input.md`.

### Следующее действие владельца — сначала только Node contract gate
Синхронизировать все commits (test correction + audit + PROJECT_STATE + UA-011 + register) и проверить clean synchronized main:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Продолжать только если branch `main`, worktree чистый и `HEAD` совпадает с `origin/main`. Затем выполнить:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js
```

Передать полный вывод и exit code. Если хотя бы один тест FAIL — **СТОП**, guarded PostgreSQL runner не запускать; сохранить вывод и сообщить assistant.

### Только после Node PASS
После подтверждённого полного Node PASS и синхронизации актуального main разрешён guarded runner:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Не менять параметры и не обходить guards. Пароль вводить только в hidden prompt; не отправлять пароль, токены или `.env`. При первой SQL ошибке — STOP, сохранить полный лог, включая cleanup, и передать его без секретов.

### Критерий закрытия и запреты
SQL integration PASS — только если fixture, все 140 migrations 010–149, две inline assertions, все 46 SQL tests и cleanup disposable DB успешно подтверждены. При падении тестов после него не запускались.

- Не использовать production/PIN_TRIAL.
- Не останавливать PID 15220.
- Не изменять и не удалять `X:\PinPosy-verify-pg18`.
- Не передавать пароли, токены, `.env`.
- Не запускать Bash concurrency/backend runtime suites до полного SQL PASS и cleanup.

**Статус:** Node contract 20/20 PASS (предыдущий owner transcript; после изменения test 18 требуется повторный gate); PowerShell Parser 0 errors PASS (предыдущий owner transcript); PostgreSQL SQL integration **NOT PASSED**.


## UA-012 — повторный guarded PostgreSQL integration run после Node PASS (2026-11-17)

### Зафиксированный prerequisite
- Владелец синхронизировал clean main на `6d982d1414490ed210502f834018a1a1a6d9d8a2`: HEAD = origin/main; worktree чистый.
- После test-only correction для test 18 владелец повторил `node --test backend/test/postgres-integration-runner-contract.test.js`: **20/20 PASS**, 0 failures, 0 skipped.
- Предыдущий PowerShell Parser API check для неизменённого runner: PASS, 0 syntax errors.
- Предыдущий PostgreSQL run остановился на test 18/46; tests 19–46 не запускались. SQL integration **NOT PASSED**. Исправленный test 18 ещё не runtime-проверен.

### Следующее действие владельца
Сначала получить все документационные commits и проверить чистый synchronized main:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Продолжать только при branch `main`, пустом worktree и равенстве HEAD/origin/main. Затем выполнить без изменения параметров:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Пароль временной роли вводить только в hidden prompt. Не отправлять пароль, токены или `.env`. Передать полный вывод и exit code без секретов.

### STOP и критерий PASS
- При любом safety guard failure или первой SQL ошибке — **СТОП**; сохранить полный лог, включая cleanup, и передать его. Не обходить guards.
- SQL integration PASS разрешён только если подтверждены upgrade fixture, все 140 migrations 010–149, обе CI inline assertions, все 46 SQL tests и успешный cleanup disposable DB.
- Если тест N упадёт, тесты N+1–46 считаются не выполненными.
- Не использовать production/PIN_TRIAL; не останавливать PID 15220; не изменять и не удалять `X:\PinPosy-verify-pg18`; не запускать Bash concurrency/backend runtime suites до полного SQL PASS и cleanup.

**Статус:** Node contract 20/20 PASS; PowerShell Parser 0 syntax errors PASS; PostgreSQL SQL integration **NOT PASSED**, ожидает повторного guarded owner run.


## UA-013 — повторная проверка PostgreSQL после исправления test 19/46 (2026-11-17)

### Зафиксированный owner run
- Чистый synchronized checkout: `4df18de1fbc8ae98b3d316d945cce7f973b244de`.
- Guarded runner прошёл safety checks: PID 15220; data directory `X:\PinPosy-verify-pg18`; server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Fixture, 140 migrations 010–149, две inline assertions и SQL tests 1–18/46 прошли; test 19/46 упал из-за попытки установить `pin_regeneration_requests.claim_token=NULL` при ограничении NOT NULL.
- Tests 20–46 не запускались. Cleanup disposable DB `pinposy_sqlint_e44cc1cd1e6d4d57` подтверждён (0 sessions, DROP DATABASE, explicit removal). SQL integration **NOT PASSED**.

### Опубликованное исправление
- Историческая migration 077 восстановлена без изменений.
- Новая additive migration: `db/migrations/150_preserve_regeneration_claim_token_on_refund_finalization.sql`. Она заменяет функцию `finalize_reconciled_pin_regeneration_failure`, не обнуляя обязательный claim token.
- SQL test 19 дополнен проверкой, что token после финализации совпадает с исходным.
- Runner, CI, migration-chain test и local Linux/Windows replay scripts/contracts обновлены на contiguous migrations 010–150 (141 files).
- Подробный аудит: `docs/audits/2026-11-17-postgres-integration-test-19-regeneration-claim-token-not-null.md`.

### Следующие действия владельца — строго по порядку

1. Получить все source и documentation commits и проверить чистый synchronized main:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Продолжать только если branch `main`, worktree чистый, а HEAD совпадает с origin/main. Сохранить полный hash HEAD.

2. Выполнить Node contract, canonical migration-chain и local replay-contract gates:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Ожидается полный PASS; contract suite теперь включает дополнительную проверку migration 150 и chain 010–150. При любом FAIL — **СТОП**, прислать полный вывод; guarded SQL runner не запускать.

3. После Node PASS выполнить PowerShell Parser API check для изменённого guarded runner:

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\scripts\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
"PowerShell Parser PASS: 0 syntax errors"
```

При любой syntax error — **СТОП**, SQL runner не запускать.

4. Только после двух gate PASS выполнить guarded PostgreSQL integration runner:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Пароль временной роли вводить только в скрытом prompt. Не отправлять пароль, токены или `.env`.

### STOP и критерий PASS
- При первой SQL ошибке остановиться и передать полный вывод, включая cleanup. Тесты после первого упавшего теста считаются невыполненными.
- SQL integration PASS только при успешном fixture, всех **141 migrations 010–150**, обеих CI inline assertions, всех **46 SQL tests** и подтверждённом cleanup disposable DB.
- Не обходить runner guards, не менять порт/PID/data directory, не использовать production/PIN_TRIAL, не останавливать PID 15220 и не изменять/удалять `X:\PinPosy-verify-pg18`.
- Не запускать Bash concurrency/backend runtime suites до полного SQL PASS и cleanup.

**Текущий статус:** Node 20/20 PASS и Parser 0 errors относятся к предыдущему source state; после добавления migration 150 и обновления runner оба gate требуют повторного owner выполнения. PostgreSQL integration **NOT PASSED**.


## UA-014 — повторная PostgreSQL integration verification после test 20/46 (2026-11-17)

**Статус:** ожидает действий владельца. SQL integration **NOT PASSED**.

### Что произошло
- На исходном synchronized HEAD `0b56648d04e43c87fb656a59dc1e21411a5b877f` Node suite: 37 PASS / 2 FAIL из 39. Обе ошибки были в contract tests: over-escaped RegExp helper для baseline-column inventory и stale Linux replay expectation (148 / старый count).
- PowerShell Parser API: 0 syntax errors PASS для прежней версии runner.
- Guarded SQL runner: fixture, 141 migrations 010–150 и две CI inline assertions PASS; SQL tests 1–19 PASS; test 20/46 упал на `invalid repetition count(s)` в `_admin_record_provider_refund_action`. Tests 21–46 не запускались.
- Cleanup успешен: 0 sessions, DROP disposable database, explicit removal confirmed.
- Причина: migration 078 содержит PostgreSQL regex bound `{7,499}` в CHECK constraint и PL/pgSQL validation. PostgreSQL finite repetition upper bound ограничен 255. Добавлена migration 151 с `{7,}`; историческая 078 не изменялась.

### Следующие действия — строго по порядку

1. Синхронизировать main и проверить чистое состояние:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Продолжать только если branch `main`, worktree чистый и HEAD совпадает с origin/main. Новый source HEAD должен быть зафиксирован в ответе.

2. Запустить Node gates:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Ожидаемый результат — полный PASS. При любом FAIL остановиться и прислать полный вывод; SQL runner не запускать.

3. После Node PASS выполнить Parser API для обновлённого runner:

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\scripts\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
"PowerShell Parser PASS: 0 syntax errors"
```

При ошибке — STOP, SQL runner не запускать.

4. Только после обоих PASS выполнить guarded runner:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Пароль временной роли вводить только в скрытом prompt; не присылать пароль/секреты.

### Критерий SQL PASS и безопасность
- PASS только если fixture, все **142 migrations 010–151**, обе inline assertions, все **46 ordered SQL tests** и cleanup disposable DB успешны.
- При первой SQL ошибке — STOP и прислать полный вывод вместе с cleanup. Более поздние тесты считаются невыполненными.
- Не обходить guards, не менять порт/PID/data directory, не останавливать PID 15220, не трогать `X:\PinPosy-verify-pg18`, не использовать production/PIN_TRIAL.
- Не запускать Bash concurrency/backend runtime suites до полного SQL PASS и cleanup.

Подробный incident audit: `docs/audits/2026-11-17-postgres-integration-test-20-provider-refund-regex-repetition-limit.md`.


## UA-015 — PostgreSQL integration rerun after test 26/46 privilege fix (2026-11-17)

**Статус:** ожидает действий владельца. PostgreSQL SQL integration **NOT PASSED**.

### Что исправлено
- На owner run fixture, migrations 010–151 (142 файла), обе inline assertions и SQL tests 1–25 прошли.
- Test 26/46 `security-definer-search-paths.integration.sql` обнаружил, что SECURITY DEFINER trigger function `release_failed_pin_regeneration_reservation()` доступна anon/authenticated из-за неотозванного default PUBLIC EXECUTE.
- Добавлена migration 152, которая отзывает EXECUTE у PUBLIC, anon, authenticated и service_role. Historical migration 066 оставлена неизменной.
- CI, migration-chain tests, Linux/Windows replay scripts и guarded runner обновлены на 143 миграции 010–152.
- Подробности: `docs/audits/2026-11-17-postgres-integration-test-26-security-definer-trigger-execute.md`.

### Следующие действия — строго по порядку

1. Синхронизировать main и проверить чистое состояние:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Продолжать только если branch `main`, worktree чистый и HEAD совпадает с origin/main. Запишите новый полный HEAD SHA.

2. Запустить Node gates:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Ожидается полный PASS. При любом FAIL остановиться и прислать полный вывод; SQL runner не запускать.

3. После Node PASS выполнить PowerShell Parser API для обновлённого runner:

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\scripts\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
"PowerShell Parser PASS: 0 syntax errors"
```

При ошибке — STOP, SQL runner не запускать.

4. Только после обоих PASS выполнить guarded PostgreSQL runner:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Пароль временной роли вводить только в скрытом prompt; не присылать пароль/токены/.env.

### Критерий SQL PASS и безопасность
- PASS только если fixture, все **143 migrations 010–152**, обе CI inline assertions, все **46 ordered SQL tests** и cleanup disposable DB успешны.
- При первой SQL ошибке — STOP и прислать полный вывод вместе с cleanup. Более поздние тесты считаются невыполненными.
- Не обходить guards, не менять порт/PID/data directory, не останавливать PID 15220, не трогать `X:\PinPosy-verify-pg18`, не использовать production/PIN_TRIAL.
- Не запускать Bash concurrency/backend runtime suites до полного SQL PASS и cleanup.


## UA-016 — rerun PostgreSQL integration after image deletion quarantine fix (2026-11-17)

**Статус:** ожидает действий владельца. PostgreSQL SQL integration **NOT PASSED**.

### Что произошло на предыдущем запуске
- На clean synchronized HEAD `b9ff75ba8342417a93386a01a09e569b9266a4f5`: Node suite 40/41 PASS; один contract test упал, потому что динамический RegExp helper не извлекал существующую таблицу `users`. PowerShell Parser прошёл: 0 syntax errors.
- Несмотря на Node FAIL, владелец запустил guarded runner. Fixture, 143 migrations 010–152 и обе inline assertions прошли; SQL tests 1–27/46 PASS; test 28 `pin-image-deletion-claims.integration.sql` упал: expired external delete claim был повторно захвачен с новой 60-секундной lease, а не переведён в permanent quarantine. Tests 29–46 не запускались.
- Cleanup успешен: 0 sessions, disposable DB удалена, отсутствие подтверждено.
- Причина production regression: migration 145 расширила image-reference inventory, но переопределением `claim_pin_image_deletion` вернула retry behavior, нарушив quarantine policy migrations 083/104.
- Исторические migrations не менялись. Добавлена additive migration 153, сохраняющая expanded references и permanent quarantine. Node RegExp helper исправлен. CI, migration chain, Linux/Windows replay scripts и guarded runner обновлены на 144 migrations 010–153.
- Подробный отчёт: `docs/audits/2026-11-17-postgres-integration-test-28-expired-image-delete-quarantine-regression.md`.

### Следующие действия — строго по порядку

1. Синхронизировать main и проверить чистое состояние:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Продолжать только если branch `main`, worktree чистый и HEAD совпадает с origin/main. Зафиксировать полный SHA нового HEAD.

2. Запустить Node gates:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Ожидается полный PASS. При любом FAIL — **СТОП**, прислать полный вывод; Parser и SQL runner не запускать.

3. Только после Node PASS выполнить PowerShell Parser API:

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\scripts\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
"PowerShell Parser PASS: 0 syntax errors"
```

При syntax error — **СТОП**, SQL runner не запускать.

4. Только после обоих gate PASS выполнить guarded PostgreSQL runner:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Пароль временной роли вводить только в скрытом prompt. Не присылать пароль, токены или `.env`.

### Критерий PASS и безопасность
- PostgreSQL integration PASS только при успешном fixture, всех **144 migrations 010–153**, обеих CI inline assertions, всех **46 ordered SQL tests** и подтверждённом cleanup disposable DB.
- При первой SQL ошибке остановиться и прислать полный вывод вместе с cleanup; следующие тесты считать невыполненными.
- Не обходить guards, не менять порт/PID/data directory, не останавливать PID 15220, не трогать `X:\PinPosy-verify-pg18`, не использовать production/PIN_TRIAL.
- Не запускать Bash concurrency/backend runtime suites до полного SQL PASS.


## UA-017 — rerun after approved-pin fixture correction and Windows chain-contract correction (2026-11-17)

**Статус:** ожидает действий владельца. PostgreSQL SQL integration **NOT PASSED**; тесты 29–46 ещё не запускались.

### Что зафиксировано по последнему запуску
- Checkout: clean synchronized `main` на `d0155f20da307fc774da18c1ba69e44b19dfcada`.
- Node contract gate упал на устаревшем matcher: тест ожидал `10..152`, тогда как `scripts/verify.ps1` содержит актуальный диапазон `10..153`.
- PowerShell Parser API для `scripts/verify-integration.ps1`: PASS, 0 syntax errors.
- Несмотря на Node FAIL, guarded runner был запущен: fixture, 144 migrations 010–153 и две CI inline assertions прошли; SQL tests 1–27 прошли; test 28 упал при создании schedule snapshot с `only approved pins can be scheduled`. Migration 148 намеренно требует approved pin. Tests 29–46 не запускались.
- Disposable DB `pinposy_sqlint_87acdec0a62c4574` успешно удалена, 0 оставшихся сессий.
- Исправления опубликованы: schedule fixture теперь явно создаёт approved pin; Windows replay contract ожидает 10..153. Production SQL и migrations не менялись.
- Подробности и SHA: `docs/audits/2026-11-17-postgres-integration-test-28-approved-pin-fixture-and-runner-contract.md`.

### Строгая последовательность владельца

1. Сначала синхронизировать GitHub main и подтвердить чистый checkout:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Продолжать только на чистом `main`, когда HEAD совпадает с origin/main. Передать полный SHA.

2. Выполнить Node gates:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Требуется полный PASS. При любом FAIL — **СТОП**, прислать полный вывод; Parser и SQL runner не запускать.

3. Только после Node PASS — PowerShell Parser API:

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\\scripts\\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
"PowerShell Parser PASS: 0 syntax errors"
```

4. Только после обоих PASS — guarded PostgreSQL replay:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Пароль вводить только в скрытом prompt; пароль/токены/.env не присылать.

### Критерий PASS и запреты
- SQL PASS только если fixture, все 144 migrations 010–153, обе inline assertions, все 46 SQL tests и cleanup disposable DB завершились успешно.
- При первой ошибке остановиться и прислать полный вывод вместе с cleanup. Последующие тесты считать невыполненными.
- Не обходить guards, не менять порт/PID/data directory, не останавливать PID 15220, не трогать `X:\\PinPosy-verify-pg18`, не использовать production/PIN_TRIAL.
- Не запускать Bash concurrency/backend runtime suites до полного SQL PASS.


## UA-018 — rerun after terminal generation-journal fixture and migration-153 contract correction (2026-11-17)

**Статус:** ожидает действий владельца. PostgreSQL SQL integration **NOT PASSED**; tests 29–46 не запускались.

### Последний запуск владельца

- Local checkout был clean/synchronized на `7662d856aa3b2af8870d8d44686b92331b4bc0da`.
- PowerShell Parser API: PASS, 0 syntax errors.
- Node failure excerpt: migration-153 contract проверял порядок `pin_generation_requests → pin_review_queue → boards`, тогда как SQL migration содержит `pin_generation_requests → boards → pin_review_queue`. Полный aggregate summary Node не предоставлен.
- Guarded runner: fixture, 144 migrations 010–153, обе CI inline assertions и SQL tests 1–27 PASS. Test 28/46 `pin-image-deletion-claims.integration.sql` failed: `generation task journal is not terminal` из migration 071 при попытке завершить parent generation request. Tests 29–46 не запускались.
- Cleanup: 0 remaining sessions; disposable DB `pinposy_sqlint_98bf42130a244300` удалена и её отсутствие подтверждено.
- Причина: fixture создавала generation task со status по умолчанию `prepared`, а затем переводила parent request в `completed`. Migration 071 корректно требует terminal task status и соответствующий provider outcome. Production guard ослаблять нельзя.
- Исправлен только fixture: generation task теперь создаётся с `status='failed'` и `provider_outcome_status='failed'`, при этом `storage_url` остаётся durable image reference. Исправлен Node matcher, чтобы он соответствовал реальному порядку ссылок migration 153.
- Подробности и SHA: `docs/audits/2026-11-17-postgres-integration-test-28-terminal-generation-task-journal-and-contract-order.md`.

### Строгая последовательность владельца

1. Синхронизировать main и подтвердить clean checkout:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Продолжать только если branch `main`, worktree чистый и HEAD совпадает с origin/main. Передать полный SHA.

2. Выполнить Node gates:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Требуется полный PASS. При любом FAIL — **СТОП**, прислать полный вывод; Parser и SQL runner не запускать.

3. Только после Node PASS выполнить PowerShell Parser API:

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\\scripts\\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
"PowerShell Parser PASS: 0 syntax errors"
```

4. Только после обоих PASS выполнить guarded PostgreSQL runner:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Пароль временной роли вводить только в скрытом prompt; пароль/токены/.env не присылать.

### Критерий SQL PASS и безопасность

- PASS только если fixture, все **144 migrations 010–153**, обе CI inline assertions, все **46 ordered SQL tests** и cleanup disposable DB успешны.
- При первой SQL ошибке — **СТОП** и прислать полный вывод вместе с cleanup. Более поздние тесты считаются невыполненными.
- Не обходить guards, не менять порт/PID/data directory, не останавливать PID 15220, не трогать `X:\\PinPosy-verify-pg18`, не использовать production/PIN_TRIAL.
- Не запускать Bash concurrency/backend runtime suites до полного SQL PASS и cleanup.


## UA-019 — повтор Node gates после исправления upgrade-fixture regex и диапазона миграций (2026-11-17)

**Статус:** ожидает действий владельца. Исправленный Node gate ещё не запускался. PostgreSQL SQL integration **NOT PASSED**.

### Последний запуск владельца

- Рабочее дерево было чистым до и после синхронизации; локальный HEAD и origin/main совпадали на `0fc877a0aa5dd47d565f77b9873fc4c62edbf807`.
- Node suite: **42 теста, 39 PASS, 3 FAIL**.
- Ошибки: matcher не захватывал существующую таблицу `public.users` из upgrade fixture; migration-list contract ожидал 143 вместо актуальных 144 миграций 010–153; dynamic RegExp выбрасывал `Unmatched ')'`.
- Исправлен только Node contract: оба прямых users regex matcher приведены к корректному regex escaping, динамический RegExp helper использует корректное escaping JavaScript-строки, диапазон миграций обновлён до 010–153 / 144.
- Final source commit: `3c2d82bfafef40d16d6ae6c3eb7f4c7d7292e698`; blob: `2f0e54ad47ffd05cfca500568a3f962cb6af6c93`.
- Audit: `docs/audits/2026-11-17-postgres-node-contract-upgrade-fixture-regex-and-migration-count.md`.
- Ассистент не запускал Node/PowerShell/psql/PostgreSQL/CI. Parser и SQL runner после текущего Node FAIL не запускались.

### Строгая последовательность владельца

1. Синхронизировать main:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Продолжать только при clean worktree и полном совпадении HEAD с origin/main. Передать полный SHA.

2. Повторить Node gates:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Требуется **42/42 PASS**. При любом FAIL — **СТОП**, прислать полный вывод; Parser и SQL runner не запускать.

3. Только после Node PASS выполнить PowerShell Parser API check из предыдущего UA и получить 0 syntax errors.

4. Только после Node и Parser PASS выполнить:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

### Критерий SQL PASS и безопасность

- PASS только при успешных fixture, 144 migrations 010–153, двух CI inline assertions, всех 46 SQL tests и cleanup disposable DB.
- При первой SQL ошибке остановиться и прислать полный вывод вместе с cleanup; последующие тесты считать невыполненными.
- Не обходить guards, не менять PID 15220, port 55439 или data directory; не трогать `X:\\PinPosy-verify-pg18`; не использовать production/PIN_TRIAL.
- Пароль вводить только в скрытом prompt. Не присылать пароль, токены или содержимое `.env`.
- Не запускать последующие Bash concurrency/backend runtime suites до полного SQL PASS.


## UA-020 — повтор Node gates после исправления capture group в динамическом RegExp (2026-11-17)

**Статус:** ожидает действий владельца. Исправленный Node gate ещё не запускался. PostgreSQL SQL integration **NOT PASSED**.

### Последний запуск владельца

- Node suite: **42 теста, 41 PASS, 1 FAIL**.
- Единственный FAIL: `upgrade fixture preserves every canonical baseline column except fields introduced by later migrations`; динамический RegExp завершился `Unmatched ')'`.
- Причина: в строке RegExp была экранирована литеральная открывающая SQL-скобка, но отсутствовала открывающая скобка capture group для тела определения таблицы.
- Исправлен только `backend/test/postgres-integration-runner-contract.test.js`: добавлена capture group. Commit `c4de3c67537cac08daadfbf6f461304bd4b61889`; blob `2765d21320bf1847efb73cf3453d0d3597289df7`.
- Подробности: `docs/audits/2026-11-17-postgres-node-contract-dynamic-regexp-capture-group.md`.
- Ассистент не запускал Node, PowerShell, psql, PostgreSQL или CI. Parser и SQL runner после Node FAIL не запускались.

### Действия владельца

1. Синхронизировать main и проверить чистое дерево:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

2. Повторить Node gates:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Требуется **42/42 PASS**. При любом FAIL — **СТОП**, прислать полный вывод. Не запускать Parser или SQL runner.

3. Только после Node PASS выполнить PowerShell Parser API check из предыдущих UA; требуется 0 syntax errors.

4. Только после Node и Parser PASS выполнить guarded runner:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

SQL PASS — fixture, 144 migrations 010–153, 2 CI inline assertions, все 46 SQL tests и подтверждённый cleanup disposable DB. При первой SQL ошибке остановиться и прислать полный вывод и cleanup.

Не обходить guards, не менять PID 15220 / port 55439 / data directory, не трогать `X:\\PinPosy-verify-pg18`, не использовать production/PIN_TRIAL. Пароли, токены и содержимое `.env` не присылать.


## UA-021 — PowerShell Parser gate после подтверждённого Node PASS (2026-11-17)

**Статус:** ожидает действий владельца. Node gate **42/42 PASS** подтверждён владельцем; PostgreSQL integration ещё не запускалась после этого PASS.

### Подтверждённый Node результат

- Локальный HEAD = origin/main = `6512dc8aa4ae882e8be91877185a262787b02f87`; рабочее дерево чистое.
- Node: **42 tests, 42 pass, 0 fail, 0 cancelled, 0 skipped**.
- Подробности в `docs/audits/2026-11-17-postgres-node-contract-dynamic-regexp-capture-group.md`.

### Следующий шаг — только PowerShell Parser

Синхронизируй документационные изменения:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Убедись, что рабочее дерево чистое и HEAD совпадает с origin/main. Затем выполни:

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\\scripts\\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
"PowerShell Parser PASS: 0 syntax errors"
```

Требуется **0 syntax errors**. Если Parser вернёт ошибки — **СТОП**, пришли полный вывод; SQL runner не запускай.

Только после Parser PASS разрешён следующий шаг — guarded integration runner:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Критерий полного SQL PASS: fixture, 144 миграции 010–153, 2 CI inline assertions, все 46 SQL tests и подтверждённый cleanup disposable DB. При первой SQL ошибке остановись и пришли полный вывод и cleanup.

Не обходить guards, не менять PID 15220 / port 55439 / data directory, не трогать `X:\\PinPosy-verify-pg18`, не использовать production/PIN_TRIAL. Пароли, токены и содержимое `.env` не присылать.


## UA-022 — Guarded PostgreSQL integration run after both pre-gates PASS (2026-11-17)

**Статус:** разрешено владельцу выполнить; результат ожидается.

### Предварительные gates — подтверждены владельцем

- Node contract suite: **42/42 PASS**.
- PowerShell Parser API: **0 syntax errors** for `scripts/verify-integration.ps1`.
- Последняя синхронизированная точка перед этими документационными изменениями: `73a1aef18eaee621783b879aa97ae1527ec9ba5a`, HEAD = origin/main, worktree clean.

### 1. Синхронизировать актуальную документацию

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Продолжать только при чистом дереве и совпадении HEAD/origin/main.

### 2. Запустить guarded integration runner

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Не запускать параллельные replay/runner процессы. Не обходить проверки безопасности, не менять PID 15220, port 55439 или data directory; не трогать `X:\\PinPosy-verify-pg18`; не использовать production/PIN_TRIAL.

### 3. Передать полный результат

Нужен полный вывод от начала до завершения, включая:
- создание/проверку disposable fixture и целевой БД;
- все 144 миграции 010–153;
- обе CI inline assertions;
- итог каждого SQL integration test (ожидается 46);
- итог cleanup и удаление только созданной runner БД.

Если возникнет первая ошибка — остановиться, ничего вручную не чинить и не повторять runner до разбора. Пришли полный вывод ошибки и cleanup. Не присылай пароли, токены или содержимое `.env`.

**Критерий SQL PASS:** все перечисленные этапы завершились успешно, все 46 тестов прошли, cleanup подтверждён. Node/Parser PASS сами по себе не означают PostgreSQL integration PASS.


## UA-023 — Rerun PostgreSQL integration after test 28 fixture correction (2026-11-17)

**Статус:** ожидает владельца. Предыдущий SQL runner: **FAIL 27/46**, но временная БД успешно удалена.

### Предыдущий запуск — факты

- Fixture applied; 144 migrations 010–153 applied; 2 CI inline assertions passed.
- SQL tests 1–27 passed.
- Test 28 failed because fixture marked parent generation request `completed` while its only task was `failed` and nullable `pins` remained NULL. Migration 071 correctly rejected the inconsistent completion.
- Cleanup confirmed: disposable DB `pinposy_sqlint_954a7251fb504472` was dropped and reported removed. Tests 29–46 did not run.
- Assistant changed only `backend/test/pin-image-deletion-claims.integration.sql`: parent now has terminal `failed` status and `provider_task_failed` error code, consistent with the failed task. No production SQL/migration change.
- Detailed audit: `docs/audits/2026-11-17-postgres-integration-test-28-parent-generation-terminal-state-fixture.md`.

### 1. Synchronize

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Require clean worktree and HEAD = origin/main.

### 2. Rerun Node contract gates

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Require **42/42 PASS**. If any failure, stop and send full output; do not run SQL runner.

The PowerShell runner was not changed by this fixture-only correction, so the previously owner-confirmed Parser result (0 syntax errors) remains the current parser evidence.

### 3. Only after Node PASS, rerun guarded PostgreSQL integration

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Send complete output. Expected progression: 144 migrations, 2 inline assertions, all 46 SQL tests, confirmed cleanup. Stop at first error; do not manually modify database or repeat runner before diagnosis.

Do not bypass guards, change PID 15220 / port 55439 / data directory, touch `X:\\PinPosy-verify-pg18`, or use production/PIN_TRIAL. Do not send passwords, tokens, or `.env` contents.

## UA-024 — проверить исправление tombstone для удалённых изображений (migration 154)

- **Статус:** [ ] Ожидает выполнения владельцем.
- **Причина:** guarded PostgreSQL run на исходном main `7c679f475ceaaf7cdd4d2eb953c97fd84f41c374` прошёл 144 миграции и SQL-тесты 1–27, но тест 28 обнаружил, что `begin_pin_image_upload()` повторно резервирует путь со статусом `deleted`. Причина — migration 145 потеряла постоянную tombstone-проверку из migration 090/098.
- **Исправление в GitHub:** добавлена migration 154; восстановлен отказ `already_deleted` при сохранении расширенного списка durable references из migration 145. Обновлены contract tests, migration-chain tests, Linux/Windows replay scripts, guarded Windows runner и CI workflow. Исторические миграции и SQL fixture не переписывались.
- **⚠️ Сначала синхронизация — в PowerShell из `X:\\!PROGECT\\pinboard-ai`:**
  ```powershell
  git status --short
  git pull --ff-only origin main
  git rev-parse HEAD
  git rev-parse origin/main
  git status --short
  ```
  HEAD должен совпасть с актуальным `origin/main`, рабочее дерево должно быть чистым.
- **⚠️ Затем Node contract gate:**
  ```powershell
  node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
  ```
  Ожидается **43/43 PASS**. При любом FAIL остановиться.
- **⚠️ Затем PowerShell Parser gate:**
  ```powershell
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\\scripts\\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
  "PowerShell Parser PASS: 0 syntax errors"
  ```
- Только если оба gate прошли, выполнить:
  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
  ```
  Полный PASS требует fixture, **145 migrations 010–154**, двух CI assertions, **46/46 SQL tests** и успешного удаления disposable DB.
- **Запреты:** не менять PostgreSQL listener PID 15220, порт 55439 и каталог `X:\\PinPosy-verify-pg18`; не обходить проверки; не использовать production/PIN_TRIAL; не присылать пароль, токены или содержимое `.env`.
- **Фактический статус до повторного запуска:** SQL integration **FAIL 27/46**; tests 29–46 не запускались. Node 42/42 и Parser 0-error — предыдущие результаты, полученные до migration 154 и изменённых runner scripts; они не засчитываются для новой версии.
- **Подробности:** `docs/audits/2026-11-17-postgres-integration-test-28-deleted-image-path-tombstone-regression.md`.


## UA-025 — повторная проверка test 28: уникальные image paths и migration-154 contract

- **Статус:** [ ] Ожидает выполнения владельцем.
- **Что исправлено в GitHub:** migration-154 Node contract regex исправлены; SQL fixture AUD-260 теперь использует четыре уникальных 32-символьных hex object IDs. Production SQL и миграции не менялись.
- **Причина:** предыдущий guarded run на HEAD `21f0bb3c6889ce2cc0830add015d9d5b1c7b7b5d` применил fixture, 145 миграций 010–154 и две CI assertions; SQL tests 1–27 прошли. Test 28 упал с `invalid pin image upload finalization`, потому что AUD-260 повторно использовал пути, уже quarantined или referenced в более ранних блоках. Disposable DB удалена. Node excerpt также выявил over-escaped matcher в contract migration 154. PowerShell Parser в том же сообщении прошёл: 0 syntax errors.
- **⚠️ Сначала синхронизация — PowerShell из `X:\!PROGECT\pinboard-ai`:**
  ```powershell
  git status --short
  git pull --ff-only origin main
  git rev-parse HEAD
  git rev-parse origin/main
  git status --short
  ```
  Требуется чистое дерево и HEAD = origin/main.
- **⚠️ Затем Node gates:**
  ```powershell
  node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
  ```
  Ожидается **43/43 PASS**. Если фактическое число тестов отличается, ориентироваться на итог Node runner; при любом FAIL остановиться и прислать полный вывод. SQL runner до успешного Node gate не запускать.
- PowerShell runner не менялся в этом исправлении, а владелец только что подтвердил Parser PASS (0 syntax errors); повторять Parser необязательно для неизменённого файла.
- **Только после полного Node PASS** выполнить guarded runner:
  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
  ```
  Требуемый полный результат: fixture applied; **145 migrations 010–154**; 2 CI inline assertions; **46/46 SQL tests**; успешное удаление disposable DB.
- Остановиться на первой ошибке и прислать полный вывод. Не запускать runner повторно до разбора.
- **Запреты:** не менять listener PID 15220, порт 55439 и каталог `X:\PinPosy-verify-pg18`; не обходить guards; не использовать production/`PIN_TRIAL`; не присылать пароль, токены или содержимое `.env`.
- **Текущий статус:** Node contract и SQL fixture исправлены на уровне исходников, но runtime-проверка ещё не выполнена. SQL integration остаётся **FAIL 27/46**; tests 29–46 не запускались.
- **Подробный аудит:** `docs/audits/2026-11-17-postgres-integration-test-28-upload-finalization-fixture-path-collision-and-migration154-contract-regex.md`.


## UA-026 — Verify migration 155 regeneration replay image-reference fix

**Reason:** The owner-provided guarded PostgreSQL run applied migrations 010–154 and passed SQL tests 1–27, but test 28 proved that `claim_pin_image_deletion()` could claim an image still referenced by `pin_regeneration_requests.result_pin.image_url`. Migration 145 had overwritten the earlier guard from migration 104; migration 155 restores it while preserving permanent quarantine.

After synchronizing, run the gates in this exact order:

1. Confirm clean main sync:
   ```powershell
   git status --short
   git pull --ff-only origin main
   git rev-parse HEAD
   git rev-parse origin/main
   git status --short
   ```
   Require clean tree and equal HEAD/origin/main.
2. Run the Node gate:
   ```powershell
   node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
   ```
   Require **44 tests, 44 pass, 0 fail**. Stop on any failure.
3. Run the PowerShell parser check:
   ```powershell
   $tokens = $null
   $errors = $null
   [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\scripts\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
   if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
   "PowerShell Parser PASS: 0 syntax errors"
   ```
   Require 0 syntax errors. Stop on any failure.
4. Only after gates 1–3 pass, run:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
   ```
   Require fixture success, **146 migrations 010–155**, both CI inline assertions, all **46 ordered SQL tests**, and confirmed cleanup of the disposable database.

**Safety:** Preserve PostgreSQL listener PID 15220, port 55439 and data directory `X:\\PinPosy-verify-pg18`. Do not stop or reconfigure that server, bypass safety guards, use production/`PIN_TRIAL`, or share passwords, tokens or `.env` contents. Stop at the first failure and provide the complete relevant output.

**Current result:** Previous SQL run is **FAIL 27/46**; test 28 failed, tests 29–46 did not run. Migration 155 and the replay-chain updates are not yet runtime-verified. The nine Bash concurrency scripts remain outside this SQL runner.

**Detailed audit:** `docs/audits/2026-11-17-postgres-test-28-regeneration-replay-image-reference-guard-regression.md`.


## UA-027 — Verify migration 156 upload-reservation regeneration replay guard

**Статус:** ожидает владельца.

**Причина:** guarded PostgreSQL run на clean main `484a7857e243ab8629b4056bb226b1dfea05806f` применил 146 миграций 010–155, обе CI assertions и прошёл SQL tests 1–27. Test 28 выявил, что `begin_pin_image_upload()` разрешил резервирование URL, который остаётся в `pin_regeneration_requests.result_pin.image_url`. Disposable DB `pinposy_sqlint_d2afcaa5940843eb` успешно удалена; tests 29–46 не запускались.

**Исправление в GitHub:** migration 156 восстановила replay-reference guard, сохранив tombstone `deleted`/`quarantined`, полный inventory migration 154 и service-role-only grants. Обновлены contract tests, migration-chain tests, Linux/Windows replay scripts, guarded runner и CI; ожидается 147 миграций 010–156. Подробности: `docs/audits/2026-11-17-postgres-test-28-upload-regeneration-replay-reference-regression-migration-156.md`.

### 1. Синхронизация

Из PowerShell в `X:\\!PROGECT\\pinboard-ai`:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Требуется чистое дерево и HEAD = origin/main.

### 2. Node contract gate

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Требуется **45 tests, 45 pass, 0 fail**. При любом FAIL остановиться.

### 3. PowerShell Parser gate (скрипт обновлён)

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\\scripts\\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
"PowerShell Parser PASS: 0 syntax errors"
```

Требуется 0 syntax errors. При ошибке SQL runner не запускать.

### 4. Только после обоих PASS — guarded PostgreSQL runner

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Требуется: fixture applied; **147 migrations 010–156**; 2 CI inline assertions; **46/46 SQL tests**; подтверждённое удаление disposable DB. Остановиться на первой ошибке и прислать полный вывод.

**Безопасность:** сохранить listener PID 15220, порт 55439, каталог `X:\\PinPosy-verify-pg18`. Не останавливать и не перенастраивать сервер, не обходить guards, не использовать production/`PIN_TRIAL`, не отправлять пароли/токены/`.env`.

**Текущий статус:** SQL integration **FAIL 27/46** (test 28); tests 29–46 не запускались. Migration 156, Node contract и изменённые replay scripts пока не runtime-verified. Девять Bash concurrency scripts остаются отдельным непроверенным этапом.


## UA-028 — повторная проверка Node-контракта migration 156 и SQL test 29

**Статус:** ожидает владельца.

**Причина:** guarded run на clean main `5aee55dcf504dbb4e8ece704733681afcb4436f0` применил fixture, 147 миграций 010–156 и обе CI assertions; SQL tests 1–28 прошли. Test 29 упал при первом INSERT pin с `pin image object is not available for new references`. Disposable DB `pinposy_sqlint_ebd8138f1c3143c8` удалена, tests 30–46 не запускались. Одновременно Node contract для migration 156 упал из-за over-escaped regex; общий счётчик Node-тестов в присланном фрагменте отсутствовал. PowerShell Parser прошёл: 0 syntax errors.

**Исправления в GitHub (только тесты):**
- Node contract migration 156: исправлены четыре regex literals, чтобы они соответствовали реальному SQL и стилю контрактов migrations 154/155.
- SQL test 29: старый image path строится из UUID тестового пользователя, replay path — из UUID проекта. Это устраняет конфликт с test 28, который использовал прежний фиксированный путь `generation-eeee...eeee.png` и оставлял lifecycle tombstone. Триггер не ослаблялся.
- Production SQL, миграции, runner и CI не менялись.
- Подробный аудит: `docs/audits/2026-11-17-postgres-test-29-retention-inventory-path-collision-and-migration156-contract-regex.md`.

### 1. Синхронизация

Из PowerShell в `X:\\!PROGECT\\pinboard-ai`:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Требуется чистое дерево и HEAD = origin/main.

### 2. Node contract gate

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Ожидается **45 tests, 45 pass, 0 fail**. Если фактическое количество отличается, пришли полный итог; при любом FAIL остановиться. SQL runner до Node PASS не запускать.

### 3. PowerShell Parser gate

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\\scripts\\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
"PowerShell Parser PASS: 0 syntax errors"
```

Требуется 0 syntax errors.

### 4. Только после Node и Parser PASS — guarded PostgreSQL runner

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Требуется fixture applied; **147 migrations 010–156**; 2 CI inline assertions; **46/46 ordered SQL tests**; подтверждённое удаление disposable DB. Остановиться на первой ошибке и прислать полный вывод.

**Безопасность:** сохранить listener PID 15220, порт 55439 и каталог `X:\\PinPosy-verify-pg18`. Не останавливать/перенастраивать сервер, не обходить guards, не использовать production/`PIN_TRIAL`, не присылать пароли, токены или `.env`.

**Текущий статус:** SQL integration **FAIL 28/46** (test 29); tests 30–46 не запускались. Исправленные Node contract и SQL fixture пока не runtime-verified. Девять Bash concurrency scripts остаются отдельным непроверенным этапом.


## UA-029 — Повторить PostgreSQL integration после исправления credit-ledger expectations

**Статус:** ожидает владельца.

**Причина:** на clean main `b8e8073bd81f510f7648ab9c584584a24f9d40cf` Node gate прошёл **45/45**, PowerShell Parser — **0 syntax errors**; guarded runner применил fixture, 147 миграций 010–156 и 2 CI assertions. SQL tests 1–33 прошли. Test 34 (`postgres-integration.sql`) выявил устаревшие ожидания: фактический баланс 140 вместо 100. Disposable DB `pinposy_sqlint_fb3cc84d67ee46ab` удалена; tests 35–46 не запускались.

**Исправление в GitHub (только тест):** в `backend/test/postgres-integration.sql` ожидаемый баланс изменён на 140, число ledger rows — с 2 на 4, заголовок migration chain — на 010–156. Арифметика: начальные 10 + покупки 100 + 25 + 15 − расход 10 = 140; три покупки и одна adjustment создают четыре ledger rows. Production SQL не менялся. Подробности: `docs/audits/2026-11-17-postgres-test-34-credit-ledger-expectations.md`.

### 1. Синхронизация

В PowerShell из `X:\\!PROGECT\\pinboard-ai`:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Требуется чистое дерево и HEAD = origin/main.

### 2. Node contract gate

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Требуется **45 tests, 45 pass, 0 fail**.

### 3. PowerShell Parser gate

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\\scripts\\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
"PowerShell Parser PASS: 0 syntax errors"
```

Требуется 0 syntax errors.

### 4. Только после Node и Parser PASS — guarded PostgreSQL runner

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Требуется fixture applied; **147 migrations 010–156**; 2 CI inline assertions; **46/46 ordered SQL tests**; подтверждённое удаление disposable DB. Остановиться на первой ошибке и прислать полный вывод.

**Безопасность:** сохранить PostgreSQL listener PID 15220, port 55439 и data directory `X:\\PinPosy-verify-pg18`. Не останавливать/перенастраивать сервер, не обходить guards, не использовать production/`PIN_TRIAL`, не присылать пароли, токены или `.env`.

**Текущий статус:** SQL integration **FAIL 33/46** (test 34); tests 35–46 не запускались. Исправленный SQL test опубликован, но ещё не runtime-verified. Девять Bash concurrency scripts остаются отдельным непроверенным этапом.


## UA-030 — Повторить PostgreSQL integration после фикса баланса reservation fixture

**Статус:** ожидает владельца.

**Причина:** на clean main `0868d0b3f87a45bf1c680c73efd6ca53ccb16eea` Node gate прошёл **45/45**, PowerShell Parser — **0 syntax errors**. Guarded runner применил upgrade fixture, 147 миграций 010–156 и 2 CI assertions; SQL tests 1–33 прошли, test 34 упал на второй reservation по 60 кредитов. Причина: после трёх покупок и -10 adjustment тест имел 140 кредитов, тогда как последующий reservation/debit сценарий явно рассчитывал на 100.

**Опубликованный фикс только в тесте:** после проверки исходных 140 кредитов и четырёх ledger rows добавлено дополнительное списание 40 через штатную `adjust_credits_balance_and_log`; тест проверяет баланс 100 и пятый ledger row до двух конкурирующих резервирований. Production SQL не менялся. Подробности и точные SHA: `docs/audits/2026-11-17-postgres-test-34-generation-reservation-fixture-balance.md`.

### 1. Синхронизация

В PowerShell из `X:\\!PROGECT\\pinboard-ai`:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Требуется чистое дерево и HEAD = origin/main.

### 2. Node contract gate

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Требуется **45 tests, 45 pass, 0 fail**. При любом FAIL остановиться и прислать полный вывод.

### 3. PowerShell Parser gate

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\\scripts\\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
"PowerShell Parser PASS: 0 syntax errors"
```

Требуется 0 syntax errors.

### 4. Только после Node и Parser PASS — guarded PostgreSQL runner

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Требуется fixture applied; **147 migrations 010–156**; 2 CI inline assertions; **46/46 ordered SQL tests**; подтверждённое удаление disposable DB. Остановиться на первой ошибке и прислать полный вывод.

**Безопасность:** сохранить PostgreSQL listener PID 15220, порт 55439 и каталог `X:\\PinPosy-verify-pg18`. Не останавливать/перенастраивать сервер, не обходить guards, не использовать production/`PIN_TRIAL`, не присылать пароли, токены или `.env`.

**Последний подтверждённый статус:** SQL tests 1–33 PASS, test 34 FAIL до фикса; tests 35–46 не запускались. Исправленный SQL fixture опубликован, но ещё не runtime-verified. Девять Bash concurrency scripts остаются отдельным непроверенным этапом.


## UA-031 — Повторить PostgreSQL integration после исправления unknown-provider reservation fixture

**Статус:** ожидает владельца.

**Причина:** на чистом main `0c413265da7c6b09c0ed6fd58d68ed8e299a5a8b` Node gate прошёл **45/45**, PowerShell Parser — **0 syntax errors**; guarded runner применил fixture, 147 миграций 010–156 и 2 CI assertions. SQL tests 1–33 прошли; test 34 упал на проверке удержания резерва после неизвестного исхода провайдера. Disposable DB `pinposy_sqlint_9f82b9c7dc774317` удалена; tests 35–46 не запускались.

**Причина и исправление:** migration 088 корректно освобождает резерв при переходе в `unknown`, если durable image-task journal пуст: до записи задачи изображение не могло быть отправлено провайдеру. Тест создавал запрос и резерв вручную, но не создавал task row. Исправлена только `backend/test/postgres-integration.sql`: перед переводом `reservation-test-key-0002` в `unknown` добавляется связанная строка `pin_generation_tasks` со статусом `submitting`, моделирующая возможную отправку billable image task. Production SQL и миграции не менялись. Подробности: `docs/audits/2026-11-17-postgres-test-34-unknown-provider-reservation-task-fixture.md`.

### 1. Синхронизация

В PowerShell из `X:\\!PROGECT\\pinboard-ai`:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Требуется чистое дерево и HEAD = origin/main.

### 2. Node contract gate

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Требуется **45 tests, 45 pass, 0 fail**. При любом FAIL остановиться и прислать полный итог.

### 3. PowerShell Parser gate

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\\scripts\\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
"PowerShell Parser PASS: 0 syntax errors"
```

Требуется 0 syntax errors.

### 4. Только после Node и Parser PASS — guarded PostgreSQL runner

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Требуется fixture applied; **147 migrations 010–156**; 2 CI inline assertions; **46/46 ordered SQL tests**; подтверждённое удаление disposable DB. Остановиться на первой ошибке и прислать полный вывод.

**Безопасность:** сохранить PostgreSQL listener PID 15220, порт 55439 и каталог `X:\\PinPosy-verify-pg18`. Не останавливать/перенастраивать сервер, не обходить guards, не использовать production/`PIN_TRIAL`, не присылать пароли, токены или `.env`.

**Последний подтверждённый статус:** SQL tests 1–33 PASS, test 34 FAIL до этого исправления; tests 35–46 не запускались. Исправленный fixture опубликован, но ещё не runtime-verified. Девять Bash concurrency scripts остаются отдельным непроверенным этапом.

## UA-032 — Повторить PostgreSQL integration после исправления reservation contract в test 34

**Статус:** ожидает владельца.

**Основание:** на чистом main `a256df3a8dc45be9e082a18fb3f1374341e4eb3c` Node suite прошёл **45/45**, PowerShell Parser — **0 syntax errors**. Guarded runner применил fixture, 147 миграций 010–156 и две CI inline assertions; SQL tests 1–33 прошли. Test 34 завершился ошибкой `generation credit reservation is missing`; disposable DB `pinposy_sqlint_e7bae68c80ff4f2a` удалена. Tests 35–46 не запускались.

**Исправление:** migration 054 требует вызвать `reserve_pin_generation_credits` после `begin_pin_generation_request` и до `complete_pin_generation_request`. Только тестовый fixture обновлён: добавлен резерв 5 кредитов для idempotency case; неизвестная provider reservation остаётся активной до проверки блокировки конкурирующего debit, затем fixture переводит запрос в definitive failed и проверяет trigger release; atomic retry проверяет отказ 76-credit reservation при балансе 75, затем пополняет 1 кредит, резервирует 76 и завершает генерацию. Production SQL и migrations не менялись. Подробности: `docs/audits/2026-11-17-postgres-test-34-generation-completion-reservation-fixture.md`.

### 1. Синхронизация

В PowerShell из `X:\\!PROGECT\\pinboard-ai`:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Требуется чистое дерево и HEAD = origin/main.

### 2. Node contract gate

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Требуется **45 tests, 45 pass, 0 fail**. При любом FAIL остановиться и прислать полный итог.

### 3. PowerShell Parser gate

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\\scripts\\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
"PowerShell Parser PASS: 0 syntax errors"
```

Требуется 0 syntax errors.

### 4. Только после Node и Parser PASS — guarded PostgreSQL runner

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Требуется fixture applied; **147 migrations 010–156**; 2 CI inline assertions; **46/46 ordered SQL tests**; подтверждённое удаление disposable DB. Остановиться на первой ошибке и прислать полный вывод.

**Безопасность:** сохранить PostgreSQL listener PID 15220, порт 55439 и каталог `X:\\PinPosy-verify-pg18`. Не останавливать/перенастраивать сервер, не обходить guards, не использовать production/`PIN_TRIAL`, не присылать пароли, токены или `.env`.

**Последний подтверждённый статус:** Node 45/45 PASS; Parser 0 errors; SQL tests 1–33 PASS, test 34 FAIL до этого исправления; tests 35–46 не запускались. Финальный fixture опубликован, но ещё не runtime-verified. Девять Bash concurrency scripts остаются отдельным непроверенным этапом.


## UA-033 — Повторить PostgreSQL integration после исправления approval fixture в test 34

**Статус:** синхронизация выполнена; Node 45/45 и PowerShell Parser 0 ошибок подтверждены; ожидается guarded PostgreSQL runner.

**Основание:** на clean main `60251392b65f4a44941c0b1f24950e72b6cf23e6` Node tests прошли **45/45**, PowerShell Parser — **0 syntax errors**; runner применил fixture, 147 миграций 010–156 и две CI inline assertions. SQL tests 1–33 прошли; test 34 завершился ошибкой `first Pinterest publish reservation must start`. Disposable DB `pinposy_sqlint_164fb8a1f4684d95` удалена; tests 35–46 не запускались.

**Причина и исправление:** migration 148 требует, чтобы Pinterest publication и schedule creation выполнялись только для pin со статусом `approved`. Генерация сохраняет pin как `pending`; тест 34 ошибочно сразу пытался публиковать/планировать такие строки. Исправлен только `backend/test/postgres-integration.sql`: основной сгенерированный pin явно одобряется до publication/scheduling, а uncertain, late-success и schedule-lifecycle pins создаются со статусом `approved`. Production SQL и миграции не менялись. Подробности: `docs/audits/2026-11-17-postgres-test-34-pinterest-publication-approval-fixture.md`.

### 1. Синхронизация

В PowerShell из `X:\\!PROGECT\\pinboard-ai`:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Требуется чистое дерево и HEAD = origin/main.

### 2. Node contract gate

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Требуется **45 tests, 45 pass, 0 fail**. При любом FAIL остановиться и прислать полный итог.

### 3. PowerShell Parser gate

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\\scripts\\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
"PowerShell Parser PASS: 0 syntax errors"
```

Требуется 0 syntax errors.

### 4. Только после Node и Parser PASS — guarded PostgreSQL runner

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Требуется upgrade fixture applied; **147 migrations 010–156**; 2 CI inline assertions; **46/46 ordered SQL tests**; подтверждённое удаление disposable DB. Остановиться на первой ошибке и прислать полный вывод.

**Безопасность:** сохранить PostgreSQL listener PID 15220, порт 55439 и каталог `X:\\PinPosy-verify-pg18`. Не останавливать/перенастраивать сервер, не обходить guards, не использовать production/`PIN_TRIAL`, не присылать пароли, токены или `.env`.

**Последний подтверждённый статус:** SQL tests 1–33 PASS; test 34 FAIL до approval-fixture исправления; tests 35–46 не запускались. Node 45/45 и Parser 0 errors были до последнего SQL fixture изменения; повторить оба gate. Исправленный fixture ещё **не runtime-verified**. Девять Bash concurrency scripts остаются отдельным непроверенным этапом.


**Подтверждение синхронизации владельцем (2026-11-17):** исходное и итоговое `git status --short` пусты; `git pull --ff-only origin main` прошёл fast-forward; `HEAD` = `origin/main` = `ff1ea965d644008d7fcd1160516042b288a4690a`. Повторная синхронизация не требуется, если локальная ветка не изменится.

**Следующее действие:** выполнить разделы 2 и 3 выше (Node 45/45, затем PowerShell Parser 0 ошибок). Полный guarded runner — только после обоих PASS. Результаты этих двух gates после последнего SQL fixture изменения пока не предоставлены; до их получения fixture остаётся NOT RUNTIME-VERIFIED.


**Результаты повторных предварительных gates (2026-11-17):**
- Node contract/migration/replay-chain: **45 tests, 45 pass, 0 fail, 0 skipped**.
- PowerShell Parser: **0 syntax errors**.
- Оба результата получены после approval-fixture изменения и синхронизации до `948df3b9c9590fd78e6beb1690dcd3785e91d54f`.

### 5. Следующий шаг — guarded PostgreSQL integration runner

Теперь, и только теперь, можно выполнить из `X:\\!PROGECT\\pinboard-ai`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Условия успешного завершения:
- upgrade fixture применён;
- применены **147 migrations 010–156**;
- прошли **2 CI inline assertions**;
- все **46/46 ordered SQL integration tests** прошли;
- runner подтвердил cleanup disposable database.

Остановиться при первой ошибке и передать полный вывод, включая итог cleanup. Не запускать вручную отдельные SQL-файлы в другой БД и не обходить runner guards.

**Безопасность:** сохранить PostgreSQL listener PID 15220, port 55439 и data directory `X:\\PinPosy-verify-pg18`. Не останавливать/перенастраивать сервер, не использовать production/`PIN_TRIAL`, не присылать пароли, токены или `.env`.

**Текущий статус:** Node 45/45 PASS и Parser 0 ошибок подтверждены после fixture change; guarded PostgreSQL runtime ещё не выполнен. Девять Bash concurrency scripts остаются отдельным непроверенным этапом.


## UA-033 — обновление результата guarded PostgreSQL rerun (2026-11-17)

**Статус:** запуск выполнен; остановлен на SQL test 34; ожидается расследование ассистента. Повторно запускать полный runner до диагностики не нужно.

**Фактический результат владельца:** локальный `main` fast-forwarded с `948df3b9` на `1b855857c4df31b9233819e404bd697591f28acb`; рабочее дерево чистое. `scripts/verify-integration.ps1` подтвердил clean checkout, disposable PostgreSQL 18.6 PID 15220 на `127.0.0.1:55439`, создал disposable DB `pinposy_sqlint_9f1cf3d0c7f74745`, применил upgrade fixture и 147 migrations 010–156; обе inline assertions прошли. SQL tests 1–33 PASS; test 34/46 FAIL: `billing webhook audit table privileges are too broad or insufficient` в `backend/test/postgres-integration.sql:965` / assertion line 940. Tests 35–46 не запускались. Disposable DB удалена, что подтверждено runner output.

**Что дальше делает ассистент:** исследует assertion, active migration/table grants и focused privilege integration test; не меняет production SQL/privileges до установления причины. Подробности: `docs/audits/2026-11-17-postgres-test-34-billing-webhook-audit-privileges.md`.

**Ограничения владельца:** пока не запускать runner повторно; не останавливать/перенастраивать PID 15220, порт 55439 или `X:\\PinPosy-verify-pg18`; не использовать production/`PIN_TRIAL`; не передавать секреты. После диагноза ассистент даст только необходимые повторные gates и конкретные команды, если они потребуются.


## UA-034 — повторить PostgreSQL gates после исправления privilege assertion (2026-11-17)

**Статус:** ожидает владельца; опубликованный source fix пока не проверен runtime.

**Причина:** test 34 содержал противоречие: migration 042 и focused privilege test разрешают `service_role SELECT` для защищённого административного чтения, но inline assertion общего PostgreSQL test 34 ошибочно запрещал SELECT. Исправлен только `backend/test/postgres-integration.sql`; теперь общий тест проверяет тот же полный privilege matrix, что и focused test. Production grants/migrations не менялись.

**Source fix:** commit `5cf3b1c2b589ba73205e823ec30f28b9193a1c60`; blob `405ebc7b556ea051525513439b37582d7904d2e6`. Подробности: `docs/audits/2026-11-17-postgres-test-34-billing-webhook-audit-privilege-assertion-fix.md`.

### 1. Синхронизация (PowerShell, из X:\\!PROGECT\\pinboard-ai)

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Требуется clean tree и HEAD = origin/main. Если pull не fast-forward или дерево не чистое — остановиться и прислать вывод; не использовать reset/rebase/clean.

### 2. Node contract gates

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Требуется 45 tests, 45 pass, 0 fail, 0 skipped.

### 3. PowerShell Parser gate

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\\scripts\\verify-integration.ps1), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List *; exit 1 }
"PowerShell Parser PASS: 0 syntax errors"
```

Требуется 0 syntax errors.

### 4. Guarded PostgreSQL integration — только после обоих PASS

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Требуется fixture applied, 147 migrations 010–156, 2 CI inline assertions, **46/46 ordered SQL tests**, подтверждённый cleanup disposable database. При первой ошибке остановиться и сохранить полный вывод; не запускать тесты вручную в другой БД и не обходить guards.

**Безопасность:** сохранить PostgreSQL listener PID 15220, порт 55439 и data directory `X:\\PinPosy-verify-pg18`. Не останавливать/перенастраивать сервер, не использовать production/`PIN_TRIAL`, не присылать пароли, токены или `.env`.

Девять Bash concurrency scripts остаются отдельным непроверенным этапом. До получения нового вывода исправление остаётся **NOT RUNTIME-VERIFIED**.


### UA-034 update — synchronization completed (2026-11-17)

Owner transcript: pre-pull and post-pull `git status --short` were empty; `git pull --ff-only origin main` fast-forwarded `1b855857..3e186f14`; local HEAD and origin/main both equal `3e186f149bbda21235c1389ca5ce16de7619cd61`. The six-file update was received successfully.

**Completed:** synchronization only.

**Still required, in order:**
1. Run the Node command in UA-034. Expected: 45 tests, 45 pass, 0 fail, 0 skipped. Stop and send the full output if any expectation differs.
2. Only after Node passes, run the PowerShell Parser gate in UA-034. Expected: 0 syntax errors.
3. Only after both pass, run the guarded PostgreSQL integration command in UA-034. Do not skip gates or run the SQL suite manually.

The source fix remains **NOT RUNTIME-VERIFIED**. Do not infer a passing test suite from the successful Git pull.


### UA-034 update — Node contract gate passed (2026-11-17)

Owner evidence after syncing to `45fb5f300b1cd334ad8128a76f5d694f52389861`: the three Node test files completed with TAP summary **45 tests / 45 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo** (108.1713 ms). This gate is now confirmed PASS.

**Next action:** run only the PowerShell Parser gate in UA-034. Expected output: `PowerShell Parser PASS: 0 syntax errors`. If any parser errors occur, stop and send the complete output. Do not run the guarded PostgreSQL integration command until the parser gate also passes.

The SQL assertion correction is still **NOT RUNTIME-VERIFIED**; this Node suite checks contracts and migration/replay-chain expectations, not actual PostgreSQL execution. The earlier SQL run remains failed at test 34/46; a new guarded run must demonstrate all 46 tests and disposable database cleanup.


### UA-034 evidence update — PowerShell Parser gate passed (2026-11-17)

Owner synced the documentation fast-forward to `097765bd924cb938103ac4ec779b17af23eacf2c`; `git status --short` was empty and `HEAD == origin/main == 097765bd924cb938103ac4ec779b17af23eacf2c`. The PowerShell Parser invocation against `scripts/verify-integration.ps1` completed with exact output: `PowerShell Parser PASS: 0 syntax errors`.

Together with the previously recorded Node gate (**45/45 pass, no failures or skips**), both preflight gates are PASS. **Next owner action:** run the guarded integration runner exactly as specified earlier in UA-034:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Run it only from the clean, synchronized checkout and preserve the complete output. Stop at the first failure and send the full transcript. Do not rerun manually against another database, do not target production or `PIN_TRIAL`, and do not disclose secrets. A passing result must explicitly demonstrate the upgrade fixture, 147 migrations 010–156, both CI inline assertions, all 46/46 ordered SQL integration tests, and successful disposable DB cleanup. Until that evidence exists, the SQL assertion fix is NOT RUNTIME-VERIFIED.


### UA-034 update — guarded runner stopped before PostgreSQL (2026-11-17)

**Status:** synchronization required; do not interpret this as a SQL test result.

Owner ran the guarded integration command. It fetched `origin/main` and stopped because local HEAD was `097765bd924cb938103ac4ec779b17af23eacf2c` while origin/main was `30e1ac9f9e5eaf5e79496c1ceda5b7e42a55749d`. GitHub comparison confirms exactly four commits ahead and zero behind; all four are documentation-only. No code, migrations, tests, runner or CI files changed.

The runner's first guarded operation is `Assert-RepositoryState`; the mismatch occurs before PostgreSQL listener validation, password prompt, psql, role/database creation, migrations or SQL tests. No SQL tests ran and no disposable DB was created. The historical SQL result remains FAIL at test 34/46; the privilege assertion fix remains NOT RUNTIME-VERIFIED.

**Next owner action — PowerShell, from `X:\\!PROGECT\\pinboard-ai`:**

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Require empty status before/after pull and identical HEAD/origin SHA. If pull is not a fast-forward, or the working tree is not clean, stop and send the full output; do not use reset, rebase, clean or force operations.

After synchronization, rerun the Node 45/45 gate and PowerShell Parser 0-error gate in UA-034, then run the guarded integration runner only if both pass. Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`; do not target production/`PIN_TRIAL`, bypass guards, run SQL manually or disclose secrets. Nine Bash concurrency scripts remain a separate unverified gate.

Detailed record: `docs/audits/2026-11-17-postgres-runner-sync-guard-stop.md`.


### UA-034 update — guarded PostgreSQL runner stopped at empty password (2026-11-17)

Owner confirmed clean synchronization: `git pull --ff-only origin main` fast-forwarded `30e1ac9f..9206d830`; pre/post `git status --short` were empty; local HEAD and origin/main both equal `9206d83076c4ea59c0d66be15482bf58d7217226`. The three Node test files passed **45/45** with 0 failures, cancellations, skips or todos.

The guarded runner then verified the synchronized checkout and local PostgreSQL listener (PID 15220; data directory `X:\\PinPosy-verify-pg18`), but stopped at the hidden prompt with `A non-empty temporary PostgreSQL password is required.`

Source inspection confirms the runner rejects an empty SecureString before setting PGPASSWORD or invoking psql. No database connection, temporary role creation, disposable database creation, migration, inline assertion or SQL test occurred. No disposable DB cleanup was needed. This is not a PostgreSQL authentication failure and not a SQL test result. Historical SQL status remains FAIL at test 34/46; the privilege assertion fix remains NOT RUNTIME-VERIFIED.

**Next owner action:** use the same guarded command only when the non-empty password for the approved local temporary role `pinposy_verify_admin` is available. Enter it only into the hidden local prompt. Never send the password in chat, documentation, command text, Git or logs. If the credential is unknown, stop and resolve it locally; do not weaken runner checks, manually run SQL, or target production/`PIN_TRIAL`.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Preserve listener PID 15220 and `X:\\PinPosy-verify-pg18`. A successful result must show the upgrade fixture, 147 migrations 010–156, two CI inline assertions, 46/46 SQL integration tests and confirmed disposable database cleanup. Stop at the first error. Nine Bash concurrency scripts remain a separate unverified gate.

Detailed incident: `docs/audits/2026-11-17-postgres-runner-empty-temporary-password-stop.md`.


### UA-034 update — second runner synchronization stop (2026-11-17)

Owner reran the guarded PostgreSQL runner while local HEAD was `9206d83076c4ea59c0d66be15482bf58d7217226`. The runner fetched origin/main at `5fa8d042f7e85339565bae9a8f34e8ebe654100d` and stopped at the repository synchronization guard. The remote had advanced because the assistant had just published documentation-only updates. No PostgreSQL listener validation, password prompt, psql call, DB connection, role/database creation, migration, inline assertion or SQL test occurred in this attempt.

**Next owner action — synchronize only via fast-forward:**

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Require empty status before/after and identical HEAD/origin SHA. If either condition fails, stop and send the complete output. Never use reset, rebase, clean, force or bypass the runner guard.

After successful synchronization, rerun:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Node 45/45 and PowerShell Parser 0-error were previously passed against the same code snapshot; the intervening commits are documentation-only. If any source, migration, test, runner or CI file changed, stop and re-evaluate those gates first. If the runner reaches the hidden password prompt, enter a non-empty password for the approved temporary role only if known; never send it in chat or write it to files/logs. If unknown, stop.

Preserve approved local cluster identity when revalidated: PID 15220, port 55439, `X:\\PinPosy-verify-pg18`. Do not target production/`PIN_TRIAL`, run SQL manually or weaken safety checks. Full incident: `docs/audits/2026-11-17-postgres-runner-second-sync-guard-stop.md`. SQL assertion fix remains NOT RUNTIME-VERIFIED; historical SQL run remains FAIL at test 34/46; nine Bash concurrency scripts remain unverified.


### UA-034 update — PostgreSQL test 35/46 exposed an invalid OAuth assertion; test correction published (2026-11-17)

**Owner run evidence**
- Owner synchronized clean local main from `9206d830` to `68d32f33`; `HEAD = origin/main = 68d32f33a6760b27577cbe15716f0c61c97984ef`; pre/post worktree status empty.
- Guarded runner verified listener PID 15220, `X:\\PinPosy-verify-pg18`, and exact server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`. Password was entered only at the hidden prompt.
- Disposable DB `pinposy_sqlint_66dec8d3e0aa48e4`: fixture PASS; migrations 010–156 (**147**) PASS; two inline assertions PASS; SQL tests 1–34/46 PASS; test 35/46 `pinterest-oauth.integration.sql` failed with `stale OAuth callback left active credentials after token-version change`; tests 36–46 NOT RUN.
- Cleanup PASS: 0 remaining sessions, disposable DB dropped and explicit removal confirmed. Overall SQL integration remains **NOT PASSED**.

**Source finding and published correction**
- The test first reconnects a Pinterest account, leaving it legitimately active, then simulates password reset by incrementing `users.token_version`.
- Migration 032 correctly rejects the stale callback with `reason='stale_session'` before changing existing Pinterest account rows.
- The old test incorrectly required zero active credentials for the whole user, effectively expecting password reset to disconnect the pre-existing Pinterest account.
- Only the SQL test was changed: it now checks the stale-session rejection, preservation of the reconnected account/credentials, and absence of an old-session account.
- A Node source-contract assertion was added for this behavior.
- Audit: `docs/audits/2026-11-17-postgres-integration-test-35-pinterest-oauth-stale-session-assertion.md`.

**Next owner action — after pulling all documentation commits and confirming clean synchronized main**

Run the three-file Node gate:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Expected result: **46 tests, 46 pass, 0 fail, 0 skipped, 0 todo**. This is the expected count after adding one contract assertion to the previous 45-test suite; it is not a result yet. If any test fails or the count differs, STOP and send the full output. Do not run the PostgreSQL runner.

The PowerShell Parser previously passed with 0 syntax errors and the runner file has not changed in this correction. If the Node gate passes, run the guarded runner exactly as before:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Enter the temporary-role password only at the hidden prompt; never send it in chat. Stop at the first SQL error and provide the full output including cleanup. SQL integration PASS requires fixture, 147 migrations 010–156, both inline assertions, all 46/46 SQL tests and confirmed disposable database cleanup.

Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`. Do not touch production/`PIN_TRIAL`, use manual SQL, bypass guards or run the nine Bash concurrency scripts before SQL PASS.

### UA-034 update — PostgreSQL test 38 fixture diagnosis and next gate (2026-11-17)

Owner-provided runner evidence:
- Guarded runner verified clean synchronized `main` at `62b2a859c8516fe98b174072d3642018d2dff419`.
- Local PostgreSQL listener PID 15220, data directory `X:\\PinPosy-verify-pg18`, server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`. Password was entered only at the hidden prompt.
- Disposable database `pinposy_sqlint_eb01275b9a8246a4`: fixture PASS; 147 migrations 010–156 PASS; two inline assertions PASS; SQL tests 1–37 PASS; test 38/46 failed with `{"status": "pin_not_approved"}`; tests 39–46 NOT RUN.
- Cleanup PASS: runner dropped only the disposable DB and printed its removal confirmation. Overall SQL integration remains NOT PASSED.
- The owner separately ran Node **46/46 PASS** before the latest source-contract addition; it does not cover the new assertion.

Source review found the test created its legacy-history pin as `pending`. Migration 148's current `begin_pinterest_publish_v2` checks for `approved` first and returns `pin_not_approved` before evaluating the legacy-history fence. Migrations 149–156 do not redefine this function. Thus the test setup short-circuited its intended assertion; the response does not mean a retry was allowed.

Assistant published test-only changes:
- `backend/test/pinterest-account-publication.integration.sql`: legacy fixture pin now `approved`; failure message now states that the manual-reconciliation fence was not reached. Commit `49ffed74ec6b16d2f875a99b0f300445d860592c`, blob `5179ca814d7cbe84a45569d3ae8494de959ae43d`.
- `backend/test/postgres-integration-runner-contract.test.js`: added a source-contract guard for approved fixture status and migration guard order. Commit `2b2b14407cb7cfba68375d19aba298a015a4d2a8`, blob `818a136572644af87ec6b2cfb08dcba909df6430`.
- Audit: `docs/audits/2026-11-17-postgres-integration-test-38-pinterest-legacy-history-fixture.md`.

**Next owner action — synchronize documentation and source commits, then run the Node gate:**

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Require empty status before/after and identical HEAD/origin SHA. Do not use reset, rebase, clean, force or bypass guards. Then run:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Expected result is **47 tests, 47 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**. This is the expected count after adding one contract test; it is not yet an executed result. If the count differs or any test fails, STOP and send the full output. Do not run the PostgreSQL runner.

Only after Node **47/47 PASS**, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Enter the temporary-role password only at the hidden prompt. Stop at the first SQL error and send the full output including cleanup. SQL integration PASS requires fixture, 147 migrations 010–156, both inline assertions, all 46/46 SQL tests and confirmed disposable DB cleanup. Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`; never target production/`PIN_TRIAL`, run SQL manually or disclose credentials. Nine Bash concurrency scripts remain a separate unverified gate.

### UA-034 update — Node preflight passed 47/47 (2026-11-17)

Owner synchronized local `main` to `d266f57da57f8219e5e1f42616111b32ad76d748`; the supplied transcript shows clean worktree before/after and `HEAD == origin/main`. Owner ran the prescribed three-file Node command. Result: **47 tests, 47 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**; duration 112.4228 ms. The new approved-pin legacy-history source-contract test passed.

This only verifies Node source/migration-chain contracts. It does not verify the SQL fixture at runtime or execute PostgreSQL tests. Previous SQL run stopped at test 38/46; tests 39–46 remain unrun, and SQL integration is NOT PASSED.

**Next owner action after pulling this documentation commit and confirming clean synchronized main:** run the guarded PostgreSQL runner:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
```

Use the existing approved local verification cluster only (listener PID 15220, port 55439, data directory `X:\\PinPosy-verify-pg18`). Enter the temporary-role password only at the hidden prompt; never send it. Do not bypass guards or target production/`PIN_TRIAL`. Stop on first SQL error and send the complete output including cleanup. Full SQL PASS requires fixture, all 147 migrations 010–156, both inline assertions, all 46/46 SQL tests and confirmed disposable DB cleanup. Nine Bash concurrency scripts remain a separate unverified gate.


### UA-034 update — PostgreSQL test 38 follow-up: primary pin fixture correction (2026-11-17)

Owner-provided run:
- Local main fast-forwarded cleanly from d266f57da57f8219e5e1f42616111b32ad76d748 to ce3bcc98ec09d6acfff726b7bd71265c70832791; HEAD = origin/main and status clean.
- Guarded runner verified PostgreSQL listener PID 15220, port 55439, data directory X:\PinPosy-verify-pg18 and identity 127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006. Password entered only at hidden prompt.
- Disposable DB pinposy_sqlint_bd50f191982f4df6: upgrade fixture PASS; migrations 010–156 (147/147) PASS; inline assertions 2/2 PASS; SQL tests 1–37 PASS; test 38/46 failed at line 895 with first account publication did not start: {"status": "pin_not_approved"}. Tests 39–46 NOT RUN. Cleanup PASS; disposable DB removal confirmed. SQL integration remains NOT PASSED.

Diagnosis: the previously fixed legacy-history fixture is a separate pin. The primary multi-account fixture v_pin was still inserted as pending and immediately published. Migration 148 correctly enforces approved status and returns pin_not_approved. This is a test-fixture issue; do not weaken production approval enforcement.

Assistant published:
- SQL fixture primary v_pin changed to approved: commit 2b9b6a266c37b22086678acb994c09ce56af5b82, blob 5b1f9f98662c9f2903b4edb983bb3b34f0aa3b09.
- Existing Node source-contract test strengthened to assert both primary and legacy fixtures are approved and guard ordering remains correct; no additional test case, expected total remains 47: commit a1b5cbccf74c0a85dcf7c7d22de00d47e84fa3e2, blob 1ee73760a8bbeeaa42152b61f2139c371c8d677f.
- Detailed audit: docs/audits/2026-11-17-postgres-integration-test-38-pinterest-legacy-history-fixture.md.

**Next owner action — after synchronizing the complete documentation batch**

First run and require clean fast-forward synchronization:

\`\`\`powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
\`\`\`

Then rerun the three-file Node preflight because its existing source-contract assertion was strengthened:

\`\`\`powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
\`\`\`

Require exactly **47 tests, 47 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**. This is the expected count, not a result yet. If any failure or count mismatch occurs, stop and send the full output; do not run the PostgreSQL runner.

Only after Node 47/47 PASS, rerun:

\`\`\`powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
\`\`\`

Use only the approved local verification cluster (PID 15220, port 55439, X:\PinPosy-verify-pg18). Enter the temporary-role password only at the hidden prompt; never send it. Stop at the first SQL error and include all output and cleanup. Do not touch production/PIN_TRIAL, bypass runner guards, or run SQL manually. Full SQL PASS requires all 46/46 SQL tests and confirmed disposable DB cleanup. Nine Bash concurrency scripts remain a separate unverified gate.


Assistant documentation note: two JavaScript wrapper SyntaxErrors occurred while preparing this incident's documentation payloads. Both occurred before any GitHub write from the failed attempt; neither changed the repository. Both were retried successfully. See the linked test-38 audit for the full action chronology. These were documentation tooling errors, not owner command failures.


### UA-034 update — owner rerun reached migration 148 schedule guard; nine test fixtures corrected (2026-11-17)

Owner-provided transcript:
- Fast-forward sync from `ce3bcc98ec09d6acfff726b7bd71265c70832791` to `2bc539c7ce8d8f801ef1149f51dc18c9cd67137e`; `HEAD` and `origin/main` matched; worktree clean.
- Node preflight: 47/47 PASS (113.104 ms). This was run before the newest source-contract extension.
- Guarded PostgreSQL runner verified the approved local cluster: listener PID 15220, port 55439, data directory `X:\PinPosy-verify-pg18`, identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Disposable DB `pinposy_sqlint_826d2469ae4649c6`: upgrade fixture PASS, migrations 010–156 147/147 PASS, inline assertions 2/2 PASS, SQL tests 1–37 PASS; test 38/46 failed on the in-flight schedule insert with `only approved pins can be scheduled`. Tests 39–46 NOT RUN.
- Cleanup PASS: no remaining sessions, disposable DB dropped and removal confirmed. SQL integration remains NOT PASSED.
- The accidental SHA-as-command PowerShell error was harmless and did not alter Git state. Password was entered only at the hidden prompt and was not shared.

Diagnosis and assistant-published test-only correction:
- Migration 148's BEFORE INSERT trigger on `pin_schedules` requires the referenced pin to be approved.
- Full fixture audit found nine pending pins that are inserted into schedule rows: `v_inflight_pin`, `v_crash_pin`, `v_safe_crash_pin`, `v_unsafe_crash_pin`, `v_retry_pin`, `v_manual_retry_pin`, `v_attempt_retry_pin`, `v_safe_retry_pin`, `v_disconnect_race_pin`.
- All nine SQL fixture statuses were changed to approved: commit `563648df9d1c9c24674dbac1bd01f9b532ff865f`, blob `a447055478216e3f2cc7333dcf95af4bec2c2632`.
- Existing Node contract test was extended to assert all nine fixtures and the migration-148 schedule trigger; no new test case was added, so expected suite count remains 47. Commit `0fd17599f4598559872965f07d5b01d2fadb19e2`, blob `61f20c281dd5448f295126ab42da3f9716d5d9fc`.
- No production code, migrations, runner, CI workflow or live database changed.
- Full action chronology and exact owner evidence: `docs/audits/2026-11-17-postgres-integration-test-38-pinterest-legacy-history-fixture.md` (latest blob `dbf503101a8d047df7041688173828e9dbffe77e`).

**Next owner action — pull the complete documentation batch and verify clean synchronized main:**

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Then rerun the Node preflight because its existing contract test was extended:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Require exactly **47 tests, 47 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**. This is the expected count, NOT a result yet. If it fails or the count differs, stop and send the complete output; do not run the PostgreSQL runner.

Only after Node 47/47 PASS, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Enter the temporary-role password only at the hidden prompt; never send it. Use only the approved local verification cluster (PID 15220, port 55439, `X:\PinPosy-verify-pg18`). Stop at the first SQL error and include the complete transcript and cleanup. Do not target production/`PIN_TRIAL`, bypass guards or run SQL manually.

SQL integration PASS requires the upgrade fixture, all 147 migrations, both inline assertions, all 46/46 SQL tests and confirmed disposable DB cleanup. Nine Bash concurrency scripts remain a separate unverified gate.


### UA-035 — Synchronize and verify the latest PostgreSQL test-38 fixture correction (2026-11-17)

**Why this action is required:** GitHub `main` is at `5b82dc7bdf3912c75b15f309d8e16ea8c7799a30`. The latest SQL fixture and Node contract changes are already on main, but neither has been runtime-verified after the final nine-fixture correction. The last owner PostgreSQL run stopped at test 38/46; tests 39–46 remain unexecuted.

**1. Synchronize safely (PowerShell, local project directory):**

```powershell
git status --short
```

If the worktree is not clean, STOP and preserve the local changes; do not stash, reset or overwrite them automatically. If clean:

```powershell
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Require HEAD and origin/main to match and the final status to be empty. Expected remote documentation HEAD at the time this action was written: `5b82dc7bdf3912c75b15f309d8e16ea8c7799a30`; a newer fast-forward is acceptable if it is on main and the worktree remains clean.

**2. Run the Node preflight (only after successful sync):**

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```

Require exactly **47 tests, 47 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**. This is the expected count, not a claimed result. If the count differs or any test fails, STOP and provide the complete output; do not start PostgreSQL.

**3. Run the guarded PostgreSQL suite only after Node 47/47 PASS:**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

The runner must revalidate its own safety guards and the previously approved local PostgreSQL cluster (reported earlier as listener PID 15220, port 55439, data directory `X:\PinPosy-verify-pg18`). If the identity differs, stop. Enter a known non-empty temporary-role password only at the runner's hidden prompt. Never send it in chat, paste it into a transcript, or write it to a file. If the password is unavailable, stop; do not try alternatives or touch production/`PIN_TRIAL`.

Stop at the first SQL failure. Preserve the complete output, including the cleanup section. SQL integration is PASS only when the upgrade fixture, 147 migrations 010–156, both inline assertions, all **46/46 SQL tests**, and disposable database cleanup all pass. Tests 39–46 have not yet been reached in the last recorded run. Do not skip tests or weaken guards.

**Afterward:** provide the full Node and runner output (redacting any accidental secrets). If SQL passes, the next project gate is the nine Bash concurrency scripts; do not start them before SQL PASS. If blocked by local environment, record the exact stop and continue only independent tasks.

**Assistant-side review in this continuation:** checked current main/history and the controlling docs; reviewed the remaining eight SQL test sources at a targeted static level; observed Vercel `build-rate-limit`. No runtime commands or database access were performed by the assistant. Full action record: `docs/audits/2026-11-17-development-continuation-sql-gate.md`.


### UA-036 — Resolve the Prodamus GitHub Actions run after CI coverage repair (2026-11-17)

**Reason:** Prodamus checkout workflow now includes ambiguous checkout and billing security regression tests in both push/PR path filters and the Node invocation. The source-contract test was corrected, but GitHub Actions run `44171126761` for commit `75ad3fdd0e7988d4a56fe464341c475ca0edf079` initially failed. A failed-job rerun was queued. The available API log download returned 404 `BlobNotFound`, and step details were empty, so the exact cause is not yet known.

**Owner action only if rerun remains failed or logs are unavailable:** open <https://github.com/Diana-866/pinboard-ai/actions/runs/44171126761>, select the latest attempt, inspect the failed `checkout-regressions` job, and download/copy its complete log. Provide the error section and failing step, with secrets redacted. Do not rerun unrelated jobs repeatedly. If the run is green, send the run URL and its four-test summary.

The workflow must execute exactly these four files in its Node command: `test/prodamus-webhook.test.js`, `test/payment-creation-settlement.test.js`, `test/prodamus-ambiguous-checkout.test.js`, `test/billing-security-contract.test.js`. No test should be skipped or weakened.

The separate PostgreSQL integration owner action UA-035 remains open and unchanged: sync clean main, run the three-file Node preflight (47/47 expected), then only on success run the guarded disposable PostgreSQL runner; require 46/46 SQL tests plus cleanup. Do not connect to production or use PIN_TRIAL. These two CI/local gates are independent.


### UA-036 update — Prodamus CI rerun is still failed; logs unavailable (2026-11-17)

The failed-job rerun of <https://github.com/Diana-866/pinboard-ai/actions/runs/44171126761> completed with **FAILURE** on attempt 2. Latest job ID: `134350415751`; GitHub's Jobs API returned no step list or log URL, and log download returned 404 `BlobNotFound`. Exact failing step and cause remain unknown. Do not run another blind retry. Please open the Actions run URL, inspect/download the latest attempt's `checkout-regressions` job log, and provide the failed step and error output with secrets redacted. The workflow and regression-test changes are published but are NOT runtime-verified. Vercel currently reports `build-rate-limit` on the documentation HEAD; do not treat deployment as successful.


### UA-037 — No owner action required for webhook audit persistence code change (2026-11-18)

**Assistant implementation published:** webhook audit persistence now treats only a duplicate `event_hash` unique constraint as an idempotent webhook retry; unrelated unique violations and other DB errors propagate. Added tests and wired them into Prodamus checkout CI push/PR filters and Node command. Detailed report: `docs/audits/2026-11-18-prodamus-webhook-audit-persistence-guard.md`.

**Owner action:** none for the code edit. Do not send credentials or access production systems. Runtime verification still depends on GitHub Actions obtaining a runner; the latest Prodamus run `44304664637` failed without job steps/logs. If this persists, UA-036 remains the owner action to inspect/download the run log from the GitHub UI and provide the failing step with secrets redacted. The independent PostgreSQL UA-035 remains open; it requires only the previously documented local disposable-DB runner and must not touch production/`PIN_TRIAL`.


### UA-038 — Prodamus checkout regression verification after RUB amount-field fix (2026-11-18)

**Assistant implementation:** `backend/prodamus.js` now validates RUB callbacks using `sum` only; `currency_sum` remains reserved for non-RUB callbacks with an explicit matching `currency`. Regression coverage was added to `backend/test/prodamus-webhook.test.js`. Commits: source `d35733a03c2370971d3b41ea603c52186f6e2143`; test `2cb3bc60a52f23a96c5fdca7c3cc4e54dd7c5240`. Detailed report: `docs/audits/2026-11-18-prodamus-rub-webhook-amount-selection.md`.

**Owner action:** none required for the source edit itself. The assistant did not execute Node tests in this session. Require the Prodamus checkout workflow to run and pass all five files in `.github/workflows/prodamus-checkout-tests.yml`, especially `test/prodamus-webhook.test.js`. If the latest workflow fails and GitHub still exposes no logs, use existing UA-036 to inspect the Actions UI and provide the failing step/log with secrets redacted; do not perform blind reruns. UA-035 remains independent and unchanged: guarded local PostgreSQL SQL integration must reach 46/46 tests plus disposable DB cleanup before the SQL gate can pass. Never use production or PIN_TRIAL for this verification.


### UA-038 addendum — amount-field metadata and webhook URL preflight follow-up (2026-11-18)

A post-change source review found and fixed a metadata inconsistency: `getWebhookPaymentAmount` now reports `amountField: "sum"` for RUB and `"currency_sum"` for non-RUB, matching the actual selected amount. Commit: `ce36d6ee38a3df4cc0fb450445bcf5ea02d3c0c8`. The existing regression asserts the RUB metadata value. This source correction is NOT RUNTIME-VERIFIED.

Additional commits on main validate per-request webhook override URLs as HTTPS without embedded credentials and preflight subscription/credit callback URLs before reserving checkout idempotency: `8ee8bc5036ecabbbcb24341111b5f5b91ca56947`, `dab469b742abcfcabd217c810298440bfd849a63`, `86a2c3978cddb36f44d9eb148ca63cf671c7098d`. Regression/source-contract coverage was added in `e57a0ea93e4206ebe848eb23fd6923865e7da17b`, `cc6f81ad0d0077878eba8a359fb3721ab5c60812`, and `9e93163b7a6cd9c0a69ea206f26d9709fcce4f6d`. The assistant reviewed and retained these changes. Owner action remains to require the Prodamus workflow to pass all five configured test files; do not treat Vercel status as test evidence. UA-035 PostgreSQL integration remains separate and unchanged.


### UA-036 update — latest Prodamus checkout run still fails without inspectable steps (2026-11-18)

Latest run for source/test HEAD `9e93163b7a6cd9c0a69ea206f26d9709fcce4f6d`: <https://github.com/Diana-866/pinboard-ai/actions/runs/44306870084>. Conclusion FAILURE; job `134810593751` (`checkout-regressions`) has `logs_url: null`, `steps: null`, and the steps endpoint returns an empty list. The test command's execution and the exact failure cause remain UNKNOWN. Do not rerun blindly. Please inspect this latest run in the GitHub Actions UI, download/copy the complete failed-job log and provide the failed step/error with secrets redacted. Related persisted-boards run `44306870062` and atomic-payment run `44306870099` also failed without established causes; prioritize only the Prodamus log needed to verify the payment gate. The new RUB amount regression and HTTPS callback preflight are published but NOT RUNTIME-VERIFIED. UA-035 PostgreSQL remains independent.


### UA-039 — Prodamus webhook URL HTTPS guard verification (2026-11-18)

**Assistant implementation published:**
- Per-request Prodamus notification URLs are now validated as HTTPS URLs without embedded credentials.
- Subscription and credit checkout handlers validate configured callback URLs before reserving payment idempotency or creating local payment rows.
- Added helper, handler-level no-side-effects and source-contract regressions. Existing Prodamus checkout workflow already includes the relevant paths and tests.
- Detailed implementation, commit chronology and verification boundary: `docs/audits/2026-11-18-prodamus-webhook-url-https-guard.md`.

**Owner action:** no local code-edit action is required. Do not send credentials or touch production. Runtime verification remains blocked because the latest Prodamus Actions run `44306613409` failed before any inspectable job step; job `134809710833` reported `runner_id: 0`, empty runner name and no steps. If this persists, use existing UA-036: inspect the latest run in GitHub UI and provide the failed step/annotation details with secrets redacted. Do not blindly rerun workflows. The independent PostgreSQL gate UA-035 remains open and unchanged; require its guarded local disposable DB runner, all 46/46 SQL tests and cleanup. The external Prodamus form webhook setting must also be verified in the owner account before real payments; this code cannot inspect that setting.


### UA-040 — Prodamus outbound API endpoint HTTPS regression verification (2026-11-18)

**Assistant implementation published:**
- `backend/prodamus.js:baseUrl()` now rejects malformed, non-HTTPS and credential-bearing `PRODAMUS_URL` values before sending the HMAC-signed checkout request. A blank value continues to use the HTTPS shop-ID default.
- Added `backend/test/prodamus-endpoint-security.test.js` and wired it into the Prodamus checkout workflow's push/PR filters and six-file Node command.
- Source commit: `ff78fe371b83c4b2b7bfeb21462618461aa2337c`; test final blob: `6f6a7c9b6584977e4da3ca00d0cda6e39a4abe62`; workflow commit: `0db356d326fe2a1640291ff82f6596c7fe414b58`. Full chronology and verification boundary: `docs/audits/2026-11-18-prodamus-api-endpoint-https-guard.md`.

**Owner action:**
1. Do not change production environment variables or test against a real Prodamus account.
2. Check the Prodamus checkout workflow on commit `0db356d326fe2a1640291ff82f6596c7fe414b58`. Require the job to show all six Node test files executing and passing, including `prodamus-endpoint-security.test.js`.
3. If GitHub Actions again fails before runner allocation or exposes no steps/logs, use UA-036 to inspect the latest run in GitHub UI and provide the failed step/error with secrets redacted. Do not blindly rerun.
4. If Actions remains unavailable, run from the local repository after syncing `main`: `cd backend`, then `npm ci`, then `node --test test/prodamus-endpoint-security.test.js`; for the full workflow-equivalent suite run `node --test test/prodamus-webhook.test.js test/payment-creation-settlement.test.js test/prodamus-ambiguous-checkout.test.js test/billing-webhook-audit.test.js test/billing-security-contract.test.js test/prodamus-endpoint-security.test.js`. Report only command output and exit code; never send secrets.
5. UA-035 PostgreSQL integration and external Prodamus dashboard webhook URL verification remain independent gates.

**Verification status:** source, test and workflow were re-fetched and diffs statically inspected. No local runtime test was executed by the assistant. Vercel status on the code/test/workflow HEAD was PENDING at last check; no deployment is confirmed. The new regression remains NOT RUNTIME-VERIFIED. No production resources or external services were touched.


**UA-040 addendum — CI source-contract correction (2026-11-18):** The endpoint-security suite was added as the sixth Node file and to both workflow path filters. Static inspection then found the source-contract test still expected the old five-file command. Corrected it to require the exact six-file command and both path-filter entries. Commit: `05bd81bbbb9775e2f671e8d730c9d5442fa8b9a8`; final test blob: `0823cb96a2c1ec4ee00c55e8524432dbfa2316e3`. Latest Prodamus run for this contract correction: <https://github.com/Diana-866/pinboard-ai/actions/runs/44307390644>; job `134812379544` failed before any step was exposed (`runner_id: 0`, empty runner name, `steps: []`, two inaccessible annotations). It is unknown whether the Node command ran; do not classify the tests as failed or passed. If the owner inspects this run, provide the actual annotation/log details with secrets redacted. No blind rerun. Detailed addendum: `docs/audits/2026-11-18-prodamus-api-endpoint-https-guard.md`.


**UA-040 addendum — redirect forwarding guard (2026-11-18):** Further review found Axios follows redirects by default. Added `maxRedirects: 0` to the signed Prodamus checkout POST and a regression simulating HTTP 307 and asserting the redirect option is disabled. Source commit `f89803b544a78ef15fc4d75220225d4f89edb53a`; test commit `facc0c992b122106f72d7adc80e70a0f28b82fff`. Existing Prodamus workflow already executes this test file. Runtime test remains NOT VERIFIED. At last check Vercel status on test commit was PENDING and no Actions result for that commit was available. After syncing `main`, require a successful workflow run visibly executing all six files. If it fails before runner allocation/no steps, use UA-036 and provide the exact annotation/log with secrets redacted; do not blindly rerun. Do not change production settings or use real payments. Detailed report: `docs/audits/2026-11-18-prodamus-api-endpoint-https-guard.md`.


### UA-035 addendum — migration 157 and expanded disposable PostgreSQL suite (2026-11-18)

This supersedes the earlier UA-035 counts and migration range, without changing its safety rules.

- Current canonical migration chain: baseline 001 + migrations 010–157 (**148 migrations**).
- Current SQL integration manifest: **47 SQL tests** (previously 46).
- Current Node preflight command still uses the same three files, but source now contains **50 top-level tests** by static count: runner contract 31, migration chain 2, verify-script contract 17. This is an expected source count only, not a runtime result.
- Updated workflow `.github/workflows/atomic-payment-integration.yml`, `scripts/verify-integration.ps1`, `scripts/verify.sh`, `scripts/verify.ps1`, migration-chain test, runner-contract test and SQL manifest. New migration 157 is `db/migrations/157_payment_fulfillment_user_first_lifecycle_fence.sql`; new SQL test is `backend/test/payment-deletion-lifecycle-fence.integration.sql`.
- Do not use the earlier expected counts 147 migrations / 46 SQL tests. Follow UA-041 for the exact current commands and acceptance criteria.
- Latest owner-independent Actions attempt `44308754607` failed before exposing any job step: job `134817075814`, empty steps endpoint, logs download 404 `BlobNotFound`. It is unknown whether PostgreSQL provisioning began; no SQL test execution is evidenced. Do not blindly rerun. UA-036 remains the separate owner path for inspecting GitHub UI annotations/logs.

### UA-041 — Verify payment fulfillment lifecycle fence on disposable PostgreSQL (2026-11-18)

**Purpose:** runtime-verify migration 157 and its regression without touching production, staging, Supabase, or real payment-provider systems.

**Published changes:**
- Migration 157 changes `credit_paid_purchase` and `activate_paid_subscription` to lock `users` before the payment row and reject entitlement fulfillment when `account_status` is not `active`.
- New SQL regression proves a canceled credit purchase and canceled subscription cannot grant entitlement to a deletion-pending account.
- The disposable runner now applies 148 migrations (010–157) and executes 47 SQL integration tests.
- Source migration commit `2f7ef442872c4c16d501f2d19a5ba9f0601533da`; final SQL test commit `63c02f2e7540e8f510e819c5728957c25e065931`. Full file/commit inventory: `docs/audits/2026-11-18-payment-fulfillment-account-lifecycle-fence.md`.

**Owner steps (Windows PowerShell, local project directory):**

1. Check worktree and synchronize safely:
   ```powershell
   git status --short
   ```
   If not clean, STOP and preserve local changes. If clean:
   ```powershell
   git pull --ff-only origin main
   git rev-parse HEAD
   git rev-parse origin/main
   git status --short
   ```
   Require HEAD = origin/main and an empty status. Do not reset, stash, force-push, or overwrite local work.

2. Run the exact Node preflight:
   ```powershell
   node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
   ```
   Expected: **50 tests, 50 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**. This is a static expected count, not a claimed result. If count differs or any test fails, STOP; provide complete output and do not start PostgreSQL.

3. Only after Node 50/50 PASS, run the guarded disposable PostgreSQL suite:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
   ```
   The runner must independently confirm its expected local-only PostgreSQL 18.6 cluster, listener 127.0.0.1:55439, expected PID/data directory, encoding, and temporary role. If any identity differs, STOP. Use only the runner's hidden password prompt; never paste passwords, connection strings, or secrets into chat or logs. Do not connect to Supabase, production, staging, or `PIN_TRIAL`.

4. Stop on the first SQL failure. Preserve full output including cleanup. PASS requires the upgrade fixture, all **148 migrations 010–157**, both inline assertions, all **47/47 SQL tests**, and confirmed disposable database/role cleanup. Do not skip a test or weaken a safety preflight.

5. The new regression specifically requires: both fulfillment RPCs reject a deletion-pending account; credit balance remains unchanged; canceled purchase remains uncredited with no ledger row; canceled subscription remains without paid period; user tariff stays at baseline `none`.

6. Return full command output and exit codes with any accidental secrets redacted. If blocked by local PostgreSQL availability, role password, identity mismatch, or other environment issue, stop and report the exact blocker; do not try alternative clusters or remote databases.

**Current runtime status:** NOT VERIFIED. GitHub Actions run `44308754607` failed before exposing any steps; job `134817075814` had no inspectable steps and logs endpoint returned 404 `BlobNotFound`. Vercel status on code/test HEAD `63c02f2e7540e8f510e819c5728957c25e065931` is FAILURE target `build-rate-limit`, not a build log. No production resource or real payment was accessed.

**Important scope limitation:** migration 157 is only the first safety boundary. The immutable provider receipt / entitlement decision journal described in AUD-400/401 and a two-session deletion-vs-payment race harness are still unimplemented. Even after this local suite passes, do not enable live payments or invite first users until those remaining gates and the full application/runtime/deployment checks are complete.


### UA-042 — Runtime verification of migration 158 and Prodamus receipt regressions (2026-11-18)

**Supersedes UA-041's old migration and test counts.** Current canonical sequence: baseline 001 + 149 migrations 010–158; SQL manifest: 48 tests; Node preflight: 51 top-level tests (32 runner contract + 2 migration chain + 17 verify-script contract).

1. In the local project directory, run `git status --short`. If not clean, STOP and preserve local changes. If clean, run `git pull --ff-only origin main`, then compare `git rev-parse HEAD` with `git rev-parse origin/main`; require equality and an empty status. Never reset, stash, rebase or force-push.
2. Run:
   ```powershell
   node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
   ```
   Expected: **51/51 pass**, zero failures/cancellations/skips/todo. If the count differs or any test fails, STOP and provide the complete output; do not start PostgreSQL.
3. Only after Node 51/51 PASS, run:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\verify-integration.ps1
   ```
   The script must independently validate the expected local-only PostgreSQL 18.6 instance, loopback listener 127.0.0.1:55439, expected PID/data directory, encoding and temporary role. If any identity differs, STOP. Use only its hidden password prompt; never paste passwords, connection strings or secrets into chat/logs. Do not use production, staging, Supabase or PIN_TRIAL.
4. PASS requires the upgrade fixture, **149 migrations 010–158**, both inline assertions, **48/48 SQL tests**, and confirmed disposable database/role cleanup. Stop on the first SQL failure; do not skip tests or weaken preflights. Receipt SQL coverage must prove deduplication, normalized facts, receipt UPDATE/DELETE rejection, restricted direct DML/RPC grants and terminal decision overwrite rejection.
5. Return full stdout/stderr and exit codes, redacting accidental secrets. If blocked by local binaries, identity mismatch or cleanup failure, report the exact blocker; do not switch to a remote database.

**Current runtime status:** NOT VERIFIED. The above suites were not executed by the assistant. Vercel reports `build-rate-limit` on code/test HEAD; this is not a build result. No successful Actions run is evidenced. Nine Bash concurrency scripts and the two-session deletion-vs-payment race remain separate open gates.

**Safety:** this action is exclusively local disposable PostgreSQL verification. Do not enable live payments, run production SQL, send real callbacks or invite first users based on static verification alone.


### UA-042 addendum — migration 159 runner/manifest parity (2026-11-18)

This supersedes UA-042's earlier 48-SQL-test expectation. Current verified source inventory:
- Canonical migrations: **150 files, 010–159**.
- Ordered SQL integration manifest: **49 unique tests**, including `payment-provider-receipt-fulfillment.integration.sql`.
- Node preflight remains **51 expected tests** (32 runner-contract + 2 migration-chain + 17 verify-script contract).

The assistant updated `scripts/verify-integration.ps1` to require 49 manifest entries and added the receipt-bound fulfillment integration test to `backend/test/postgres-integration-sql-manifest.txt`. The runner still validates a clean synchronized `main`, the expected local PostgreSQL 18.6 loopback instance and temporary database/role cleanup. Do not bypass any guard.

Run the existing UA-042 sequence exactly as written, but require **49/49 SQL tests** (not 48/48). Stop on any Node preflight failure, identity mismatch, SQL failure or cleanup failure. No production, staging, Supabase or PIN_TRIAL database.

### UA-043 — verify webhook audit amount-field regression (2026-11-18)

**Purpose:** runtime-check that billing exception audit evidence uses the amount field matching explicit currency metadata.

**Changes:** `backend/billingWebhookAudit.js` now uses `currency_sum` only when a non-empty explicit currency other than RUB is supplied; absent currency and RUB use `sum`. Three regressions cover absent currency with conflicting fields, explicit RUB with conflicting fields, and explicit USD.

**Owner command (local project directory):**
```powershell
node --test backend/test/billing-webhook-audit.test.js
```
Return the complete output and exit code. Do not change or skip assertions to obtain a pass. This test is independent of UA-042's guarded PostgreSQL sequence.

**Current runtime status:** NOT VERIFIED. The assistant did not execute Node locally. GitHub Actions runs `44312380107`, `44312445576`, and `44312456380` for Prodamus regression testing failed before runner allocation (runner_id 0, empty runner name, no steps). The exact failure cause is unknown; do not infer that this Node test ran.

### UA-043 addendum — current source and runner references

- Webhook audit source commit: `33b84fb7872c2739e1c2893f0917c1b398081c0b`; blob `4f5c63d83459731e6c4ced9cf04ed9718fab883a`.
- Regression commit: `40722066c0bcba996b6670299a14d490b6044d4d`; blob `c8e1a488c2a5effeffd0447011d3b5eb42aaa60e`.
- Migration 159 runner alignment: `724ec0088c8f2b68920a0413486e4158b2d944f7`; manifest: `84544dd7a48b31f4b9b894ccba1f50b008b968d1`.
- Full analysis: `docs/audits/2026-11-18-prodamus-webhook-audit-currency-and-migration159-runner-alignment.md`.


### UA-044 — verify terminal receipt identity regression (2026-11-18)

**Purpose:** runtime-check migration 159's guard against reusing a terminal Prodamus receipt for a different local payment.

**Regression:** `backend/test/payment-provider-receipt-fulfillment.integration.sql` now attempts both:
- reusing a granted credit receipt for a different credit purchase, requiring the terminal identity conflict and proving no balance/ledger mutation;
- reusing a granted subscription receipt for a different subscription, requiring the terminal identity conflict and proving the second subscription stays canceled and the second user's tariff remains `none`.

**Execution:** this test is already included in the 49-entry SQL manifest and the CI atomic-payment workflow. Follow UA-042: synchronize local `main`, require Node preflight 51/51 PASS, then run the guarded local disposable PostgreSQL runner. Require all 150 migrations 010–159 and 49/49 SQL tests plus cleanup PASS. Do not use production, staging, Supabase or PIN_TRIAL. Stop on the first failure and provide full output and exit codes.

**Current runtime status:** NOT VERIFIED. GitHub Actions on commit `a6f10ab8ced8959a9bd008e782c6fd102de335df` failed before runner allocation: atomic job `134833780856`, persisted-board jobs `134833780522` and `134833780968`, all runner_id 0 with no steps. No evidence the SQL test executed.

**References:** migration 159 blob `30519439d7423cbc84db1fbca2cc638b74c60723`; SQL regression blob `6c2bb6c9504c0c0f8ab0e6c940c92e19888b1500`; commit `3eb25129c89c49230bf2147f692c27884c112054` (migration) and `a6f10ab8ced8959a9bd008e782c6fd102de335df` (test).


### UA-045 — Verify receipt-bound payment/account-deletion concurrency (2026-11-18)

**Purpose:** runtime-check the new two-session race harness for both payment-first and deletion-first lock ordering.

**Changes:** added `backend/test/payment-deletion-receipt-race-concurrency.sh` and wired it into the guarded disposable PostgreSQL suite. The test waits for real PostgreSQL lock holders/waiters and checks:
- Payment-first: exactly one credit ledger row, balance 105, receipt decision `granted`, and the deletion lifecycle update commits only after payment.
- Deletion-first: unchanged balance 5, no credit ledger row, canceled purchase unchanged, and receipt decision `withheld_account_lifecycle`.

**Important scope boundary:** the test models the account-deletion acceptance fence with an update to `users.account_status` under the same user-row lock; it does not call the full deletion-request queue RPC or worker. It currently covers credits, not subscriptions.

**Owner verification (local project directory):**
1. Run `git status --short`. If not clean, stop and preserve local changes. If clean, run `git pull --ff-only origin main`; verify `git rev-parse HEAD` equals `git rev-parse origin/main`.
2. Run:
   ```bash
   bash -n backend/test/lib/assert-disposable-postgres.sh backend/test/*-concurrency.sh
   node --test backend/test/postgres-concurrency-safety-contract.test.js
   ```
   Require both commands to exit 0. Do not edit assertions to obtain a pass.
3. Inspect the GitHub Actions run for `.github/workflows/atomic-payment-integration.yml` on the synchronized commit. Require the SQL integration steps and the isolated concurrency suite to execute and pass; the suite now runs **10** scripts. The workflow creates a unique disposable clone and drops it on exit. If the job fails before runner allocation or exposes no steps/logs, report runtime as UNKNOWN; do not infer a test result or blindly rerun.
4. Full database acceptance still requires baseline plus **150 migrations 010–159**, **49/49 SQL integration tests**, all **10 concurrency scripts**, and confirmed disposable database cleanup. Stop on the first failure. Never use production, staging, Supabase or PIN_TRIAL.

**Current runtime status:** NOT VERIFIED. The assistant re-fetched the test, runner and contract from main but did not execute Bash, Node or PostgreSQL. Vercel reports `build-rate-limit` on source head `1e85641290ba3c360856aad734d858a3150aed13`; this is not a build or deployment result.

**References:** race test blob `0e2da4a83e2b0bda1d9f729868fca3fba04819c5`; runner blob `827a2cd063d64668102bdf36e97e4a73dffba0af`; contract blob `ab84f345305ee793a74e30cb4ad9ff871b62e69c`; report `docs/audits/2026-11-18-payment-deletion-receipt-race-concurrency.md`.


### UA-046 — current migration 160 and ten-script concurrency verification (2026-11-18)

**Superseding inventory:** canonical migrations **151 (010–160)**; ordered SQL integration tests **49 unique**; Bash concurrency scripts **10 unique**; Node migration preflight **51 expected tests**. This supersedes UA-042/UA-044's 150-migration (010–159) acceptance figures; the 49 SQL and 51 Node counts remain unchanged.

**Owner steps (local project directory):**
1. Run `git status --short`. If dirty, STOP and preserve local changes. If clean, run `git pull --ff-only origin main`, then require `git rev-parse HEAD` = `git rev-parse origin/main` and clean status.
2. Run the UA-042 Node preflight command; require **51/51 PASS**. Run UA-043's `node --test backend/test/billing-webhook-audit.test.js`; require exit 0.
3. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`. Require the runner to verify its exact local PostgreSQL 18.6 loopback target and disposable database/role, apply the upgrade fixture, all **151 migrations 010–160**, both inline assertions, all **49/49 SQL tests**, and confirm cleanup. Stop on any failure. Never use production, staging, Supabase or PIN_TRIAL.
4. Run:
   ```bash
   bash -n backend/test/lib/assert-disposable-postgres.sh backend/test/*-concurrency.sh
   node --test backend/test/postgres-concurrency-safety-contract.test.js
   ```
   Require both to exit 0. The actual concurrency execution is wired into `.github/workflows/atomic-payment-integration.yml` and runs against a unique disposable clone. Do not execute the runner against a shared database or fabricate GitHub run identity values locally.
5. Inspect the current atomic-payment Actions run. PASS requires the migration replay, SQL tests and all **10/10 concurrency scripts** to visibly execute and pass, followed by disposable clone cleanup. If the job fails before runner allocation or has no steps/logs, report runtime UNKNOWN and provide the run/job URL; do not infer a test result or blindly rerun.

**Current runtime status:** NOT VERIFIED. Latest observed atomic run `44314411889` / job `134836635174` and persisted-boards run `44314412188` / jobs `134836636827`, `134836637267` failed with runner_id 0 and no steps. No Node, Bash, PostgreSQL or SQL pass is claimed.

**Scope boundary:** the new payment/deletion race currently models the lifecycle acceptance fence with a direct `users.account_status` update and covers credit fulfillment. It does not invoke the full deletion queue RPC/worker or test subscription races. This remains an engineering task after the runtime suite is demonstrably executable.

**References:** migration 160 blob `7005ec7ce7a802312bb1376284892309a67fa226`; SQL test blob `f7fdc7a05bba1bc45f2b4f78652a7365422b4778`; Windows runner blob `a1af92050d64db66f5081c1425e49247ef074173`; concurrency runner blob `827a2cd063d64668102bdf36e97e4a73dffba0af`; concurrency contract blob `ab84f345305ee793a74e30cb4ad9ff871b62e69c`; detailed report `docs/audits/2026-11-18-payment-deletion-receipt-race-concurrency.md`.


### UA-046 — Verify migration 160, atomic Prodamus fulfillment and deletion-race suite (2026-11-18)

Supersedes the older migration count in UA-042/UA-044/UA-045. Current expected inventory: baseline 001 + 151 migrations 010–160, 49/49 SQL integration tests, 52 Node preflight tests, and 10 Bash concurrency scripts.

1. In the local project directory, run git status --short. If not clean, STOP and preserve local changes. If clean, run git pull --ff-only origin main; then require git rev-parse HEAD = git rev-parse origin/main and an empty worktree. Never reset, stash, rebase or force-push.
2. Run the Node preflight:
   powershell:
   node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
   Require 51/51 PASS, zero failures/cancellations/skips/todo. Stop on any failure or count mismatch.
3. Run the focused payment unit tests:
   powershell:
   node --test backend/test/prodamus-webhook.test.js backend/test/payment-provider-receipts.test.js backend/test/billing-webhook-audit.test.js backend/test/billing-security-contract.test.js
   Require exit 0; preserve full output. Do not bypass a failing assertion.
4. If Bash is available, run syntax and contract checks:
   bash:
   bash -n backend/test/lib/assert-disposable-postgres.sh backend/test/*-concurrency.sh
   node --test backend/test/postgres-concurrency-safety-contract.test.js
   Require exit 0 and 10 unique guarded scripts. This is not a substitute for actually running the race harness.
5. Only after Node preflight passes, run the guarded local disposable PostgreSQL replay:
   powershell:
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
   The runner must independently validate its expected local PostgreSQL 18.6 loopback instance (127.0.0.1:55439), PID/data directory, encoding and temporary role. Require upgrade fixture, 151 migrations 010–160, both inline assertions, 49/49 SQL tests, and confirmed disposable database/role cleanup. If any identity differs, STOP. Never use production, staging, Supabase or PIN_TRIAL.
6. Inspect the GitHub Actions run for .github/workflows/atomic-payment-integration.yml. Require the SQL integration and unique disposable-clone concurrency suite to actually execute and pass, including both lock orders in payment-deletion-receipt-race-concurrency.sh. If the runner fails before allocation or exposes no steps/logs, classify runtime as UNKNOWN; do not infer a pass or blindly rerun.
7. Return full outputs and exit codes, redacting secrets. Do not paste passwords, connection strings or tokens into chat.

Important scope limitation: the race script currently tests the user-row lifecycle fence by updating account_status; it does not invoke the full account-deletion acceptance queue/worker and does not test subscription races. Those remain engineering gates.

Current runtime status: NOT VERIFIED. Assistant performed static GitHub re-fetch only. Vercel reports build-rate-limit on source head 1e85641290ba3c360856aad734d858a3150aed13; this is not a source build or deployment result. No Actions PASS is evidenced.

Safety: no production SQL, real payment callback, external provider account or live user data may be used for these checks.


### UA-045 addendum — actual deletion acceptance RPC and subscription race coverage (2026-11-18)

The current `payment-deletion-receipt-race-concurrency.sh` supersedes the earlier test scope. It no longer simulates deletion with a direct `UPDATE users.account_status`; it invokes `request_account_deletion(user_id, 'password_reauth', token_version)`. It now exercises four lock-order cases:
1. credit payment first, then deletion request;
2. deletion request first, then credit payment;
3. subscription payment first, then deletion request;
4. deletion request first, then subscription payment.

The assertions require a persisted pending deletion request/preflight job and the correct credit ledger/balance or subscription tariff/period, together with the terminal receipt decision. The script leaves immutable deletion event rows in the disposable clone; run only through the unique-clone CI suite, which drops the database after completion.

Updated blobs: race script `005a431480d7ca7a9640d67689815f2aec53233e`; safety contract `ce734f544ffc0ec58c10f1dc4d4f4dd86a7238c9`; report `09f2e9932bfb48ef112dbd59dbd53ac7709ecd12`.

**Runtime status remains NOT VERIFIED.** The Bash syntax and Node contract checks have not been executed in this session, and no PostgreSQL race result is available. Require visible CI execution and cleanup PASS; no inference from pre-runner failures.


### UA-047 — Verify corrected full deletion/payment race harness (2026-11-18)

**Supersedes the earlier race-script blobs in UA-045/UA-046.** Current script blob: `afc49ebe635d765bccec8af249f19f1ae6b1e504`; concurrency contract blob: `9250e28e4a891d8744a0d56a0c8422f03a4ea012`; detailed correction report: `docs/audits/2026-11-18-payment-deletion-receipt-race-concurrency.md` (blob `0985e2571d2ef5e612151e11ddb5184c2f7acd68`).

**Review corrections:** migration 130's actual deletion RPC signature is `request_account_deletion(uuid, text, bigint)`; both race call sites now pass the fixture token version. The test no longer attempts to delete immutable deletion requests/events or suppress FK failures. It intentionally leaves fixtures inside the unique disposable database clone, and its EXIT trap stops background sessions and removes temporary files. The payment-first assertion verifies the immutable `request_accepted` event and the token-version fence.

**Owner runtime sequence (local project directory):**
1. Run `git status --short`; stop if dirty. If clean, `git pull --ff-only origin main`; verify HEAD equals origin/main and worktree is clean.
2. Run `bash -n backend/test/lib/assert-disposable-postgres.sh backend/test/*-concurrency.sh` and `node --test backend/test/postgres-concurrency-safety-contract.test.js`. Require exit 0 and ten unique guarded scripts.
3. Run only the workflow's `backend/test/run-disposable-concurrency-suite.sh` against its unique disposable clone, or inspect the matching GitHub Actions job. Do not invoke the race script against a shared or persistent database: it deliberately leaves append-only deletion events, and the outer runner must drop the entire clone.
4. Require all four race cases (credits/subscription × payment-first/deletion-first) to execute, each lock waiter to be observed, all balance/ledger/tariff/period/decision assertions to pass, and disposable database cleanup to be confirmed.
5. Continue full acceptance only after 151 migrations, 49 SQL integration tests and the 52 Node preflight tests pass. Never use production, staging, Supabase or PIN_TRIAL.

**Current runtime status:** NOT VERIFIED. Assistant performed source re-fetch/static contract inspection only; Bash, Node, PostgreSQL and full CI were not run. No PASS is claimed.


### UA-047 addendum — latest race harness and independent lock-wait verification (2026-11-18)

The latest source supersedes UA-047's prior script/contract blob references. Current race script blob: `308214f70ca518016aa6d39b33ce0e2ee466e081`; current concurrency safety contract blob: `12721cfaad66b32eddb68c023d4c426dff4db4a2`; migration-130 signature source blob: `1dcf7844444b4a70be1be49946d5a4c4265ce40f`; detailed report blob: `905799b006802acd7e19c875467e15ec6ad30786`.

Latest test strengthens the deletion-first case: credit and subscription fulfillment now wait in two separate PostgreSQL sessions simultaneously; the test requires both lock waiters to be observed before the deletion transaction is released. The acceptance request must increment token_version from 0 to exactly 1 on both user and request rows. The EXIT trap stops child processes and cleans temporary files; immutable deletion fixtures remain inside the disposable clone for outer drop.

Run the UA-047 commands only after syncing to latest main. Runtime remains NOT VERIFIED; static inspection is not a substitute for Bash, Node and PostgreSQL execution.


### UA-048 — current payment/deletion race script and CI status (2026-11-18)

This supersedes the race-script and safety-contract blob references in UA-045/UA-047:
- Race script: `backend/test/payment-deletion-receipt-race-concurrency.sh`, blob `308214f70ca518016aa6d39b33ce0e2ee466e081`.
- Concurrency safety contract: `backend/test/postgres-concurrency-safety-contract.test.js`, blob `12721cfaad66b32eddb68c023d4c426dff4db4a2`.
- Audit report: `docs/audits/2026-11-18-payment-deletion-receipt-race-concurrency.md`, blob `502235615aadaf1f0e345a0ac5e01ccfac48657a`.

Current harness contract:
- Both deletion call sites pass `request_account_deletion(uuid, 'password_reauth', token_version)`.
- The accepted request must advance the user and request token versions from 0 to exactly 1 and emit one immutable `request_accepted` event.
- Payment-first holds the user lock while both credit and subscription receipt-bound fulfillment RPCs run, then the deletion acceptance RPC proceeds.
- Deletion-first starts credit and subscription fulfillment in separate sessions and requires both to be observed waiting on the deletion transaction's user-row lock before it commits.
- The race fixtures are append-only and intentionally remain in the unique disposable clone; the outer runner must drop the clone. Do not invoke the race script against a persistent/shared database.

Static counts remain 151 migrations (010–160), 49 unique SQL tests and 10 unique concurrency scripts. Latest observed atomic Actions run `44315382265`, job `134839972556`, failed before runner allocation (runner_id 0, no steps). Runtime remains NOT VERIFIED. Follow UA-046 for full owner acceptance and UA-047/UA-048 for the race harness; do not infer any test pass.


### UA-048 addendum — latest durable deletion-queue assertions (2026-11-18)

Current race script blob: `805a076a23e40e0b7263c5a45bb88035d7c4603b`; Node contract blob: `e315d6cb694465e3ea116c2cf828ef13d8d1f268`; updated audit blob: `af7c20792eda12fd547b934a93b0479a976505c8`.

The latest test requires exactly one immutable `request_accepted` event and exactly one pending `preflight` job in both payment-first and deletion-first outcomes. Deletion-first still proves two independent payment sessions wait simultaneously. Runtime remains NOT VERIFIED; execute the Bash syntax, Node contract and full unique disposable-clone CI suite after syncing to latest main. Do not run the race script against a persistent database.


### UA-049 — verify durable deletion preflight enqueueing in payment races (2026-11-18)

Current race script blob: `805a076a23e40e0b7263c5a45bb88035d7c4603b`; safety contract blob: `e315d6cb694465e3ea116c2cf828ef13d8d1f268`; audit blob: `619402188b5bd00dea0a0c31e755fb5f154170e4`.

The payment/deletion race now additionally requires exactly one `account_deletion_jobs` row for the user request, with `step_key='preflight'` and `status='pending'`, after both payment-first and deletion-first lock orders. The contract test requires this assertion. Deletion-first verifies both independent payment sessions wait on the user lock before release, then confirms the user balance/ledger, purchase/subscription states, tariff/period and both withheld receipt decisions.

Run UA-047/UA-048's synchronization and runtime sequence. The full acceptance counts remain 151 migrations (010–160), 49 SQL tests, 52 Node preflight tests and 10 unique concurrency scripts. Require visible execution and cleanup PASS. Latest atomic run `44315630744`, job `134840855489`, failed before runner allocation; runtime remains NOT VERIFIED. Do not infer that any tests ran.


### UA-050 — execute four isolated deletion/payment race cases (2026-11-18)

Current race script blob: `6f1c08950a4a449f5c041aebdf65ca257bd29b4e`; Node concurrency contract blob: `91e53359eee7257279e45a6ede7f6d74f86a3ef8`; audit blob: `63a74e23ac2f2267b5242ff9db8fbc7800dbb19f`.

The race harness is now structured as four isolated cases, each with its own user/payment/receipt fixture: credit payment-first, credit deletion-first, subscription payment-first and subscription deletion-first. Each uses the actual three-argument deletion RPC, token-version fence, immutable acceptance event and pending preflight job assertions. Credit and subscription entitlements are asserted independently. The outer concurrency runner must drop the entire disposable DB clone because immutable deletion fixtures are intentionally retained.

After syncing latest main, run UA-046 preflight and then Bash syntax + Node concurrency contract checks. Require the GitHub Actions atomic-payment workflow to visibly execute all ten concurrency scripts and all four race cases, then confirm disposable clone cleanup. Runtime remains NOT VERIFIED; no test pass is inferred from static checks or runner-allocation failures.


### UA-050 — verify four independent payment/deletion lock-order cases (2026-11-18)

This supersedes the combined-session race-script descriptions in UA-045 through UA-049. Current race script blob `6f1c08950a4a449f5c041aebdf65ca257bd29b4e`; concurrency contract blob `91e53359eee7257279e45a6ede7f6d74f86a3ef8`; report blob `63a74e23ac2f2267b5242ff9db8fbc7800dbb19f`.

The script now runs four separate fixtures:
1. Credit fulfillment wins the user-row lock; deletion acceptance waits.
2. Deletion acceptance wins; credit fulfillment waits and is withheld.
3. Subscription fulfillment wins; deletion acceptance waits.
4. Deletion acceptance wins; subscription fulfillment waits and is withheld.

Each case uses the real three-argument deletion RPC, the exact fixture token version, a PostgreSQL-observed lock waiter, one immutable `request_accepted` event, one pending `preflight` job and the appropriate receipt decision and entitlement checks. The test fixtures remain in the unique disposable database clone, which the outer runner drops.

Run the UA-046/UA-047 acceptance sequence after synchronizing a clean local `main`: 52 Node preflight tests; focused payment Node tests; 151-migration Windows disposable replay and 49 SQL tests; Bash syntax and concurrency contract; then inspect the atomic CI run for all 10 scripts. Require actual steps and cleanup PASS. The latest atomic run `44315808409`, job `134841470669`, and persisted-board run `44315808507`, jobs `134841470967`/`134841471629`, failed before runner allocation. Runtime remains NOT VERIFIED; no test pass is claimed.


**Latest correction (2026-11-18):** four cases are now separate functions with independent fixtures and independent payment sessions; script blob `6f1c08950a4a449f5c041aebdf65ca257bd29b4e`, contract blob `91e53359eee7257279e45a6ede7f6d74f86a3ef8`, audit blob `63a74e23ac2f2267b5242ff9db8fbc7800dbb19f`. The exact deletion RPC signature is `request_account_deletion(uuid,text,bigint)`; each call passes the fixture token version. Runtime remains NOT VERIFIED.


### UA-051 — run the corrected 52-test Node preflight (2026-11-18)

This supersedes all prior 51-test Node preflight counts in UA-042/UA-046/UA-050. The exact current expected breakdown is:
- `backend/test/postgres-integration-runner-contract.test.js`: 33
- `backend/test/db-migration-chain.test.js`: 2
- `backend/test/verify-script-migration-chain.test.js`: 17
- **Total: 52 tests.**

From the clean synchronized local project directory, run:
```powershell
node --test backend/test/postgres-integration-runner-contract.test.js backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js
```
Require 52/52 PASS, zero failures, cancellations, skips or todo. Preserve full output and exit code. Do not alter or skip tests to force a pass.

Other expected acceptance counts remain 151 migrations (010–160), 49 SQL integration tests and 10 unique concurrency scripts. The four independent payment/deletion race cases are covered in UA-050. Runtime remains NOT VERIFIED until these commands and the isolated PostgreSQL/CI suite visibly execute and pass.

Count report: `docs/audits/2026-11-18-payment-deletion-receipt-race-concurrency.md`, blob `355f09b2374eb773962817ed1860c12435a3cfc5`.


### UA-052 — verify migration 161 and atomic-only Prodamus grant decisions (2026-11-18)

**Finding fixed in source:** main contained migration 161, but the canonical Node chain test and Linux/Windows replay runners still stopped at migration 160 (151 files), and the SQL integration workflow needed to apply 161. This could cause the new payment grant hardening to be omitted from local replay or fail the canonical chain check.

Current expected inventory: baseline 001 + **152 active migrations 010–161**, **49** SQL integration tests, **52** Node preflight tests, and **10** disposable concurrency scripts. No SQL manifest entry was added; the existing payment receipt integration SQL was extended with migration-161 assertions.

**Updated source:** migration 161 blob `1565937b13a668af8f894a6e3ee5a8d471c384b4`; Linux runner `5f3d64a9e772d2246276dc83a619d23ea6ee9d68`; Windows migration runner `23bb3f9f0059b8459b662700ff79e64b6e53b058`; Windows SQL runner `d7bc53a65409ea5e2dbc9a4b658768616f52ce8a`; canonical chain test `d2957ada44467ce1aecdef9147140ac4ab48aa4f`; migration script contract `3b7e75e070204262895cae42e36af38b83cca36c`; SQL regression `00fbe5af225daa0c9c81429a608b8e8240f2b5af`; Node runner contract `00ca9a40add8d3f21497d0bb5c5d649620b0b294`.

**Owner runtime sequence (local clean checkout only):**
1. Run `git status --short`; stop if dirty. If clean, `git pull --ff-only origin main`; verify `git rev-parse HEAD` equals `git rev-parse origin/main`.
2. Run `node --test backend/test/db-migration-chain.test.js backend/test/verify-script-migration-chain.test.js backend/test/postgres-integration-runner-contract.test.js`. Require all **52** tests to pass.
3. Run `bash -n scripts/verify.sh` and `bash -n backend/test/lib/assert-disposable-postgres.sh backend/test/*-concurrency.sh`. If PowerShell is available, parse `scripts/verify.ps1` and `scripts/verify-integration.ps1` with the PowerShell parser.
4. On a confirmed local disposable PostgreSQL 18.6 instance only, run `scripts/verify.ps1 -MigrationsOnly -PostgresPort 55439` (use the actual isolated test port if different). Require baseline + 010–161 to apply and the runner's own database cleanup to succeed.
5. Run `scripts/verify-integration.ps1 -PostgresPort 55439` only against the dedicated local test cluster with the expected disposable role/data directory. Require all 152 migrations and all 49 SQL tests to pass, including the new direct-grant denial and private-helper privilege checks. Never target production, Supabase, staging or PIN_TRIAL.
6. Inspect GitHub Actions atomic-payment run: require visible steps, migration 161 applied after 160, the receipt fulfillment SQL test executed, and actual job PASS. A job failing before runner allocation is not a test result.

**Current status:** source and static contracts updated; Bash/Node/PowerShell/PostgreSQL/SQL/CI runtime remains **NOT VERIFIED**. Keep live payments and first-user invitations blocked until runtime PASS and Prodamus production configuration are independently confirmed.

Detailed report: `docs/audits/2026-11-18-migration161-grant-guard-and-runner-alignment.md`.


### UA-053 — verify deterministic account-deletion preflight pagination (2026-11-18)

Found and fixed a real inventory correctness defect: the deletion worker paginated subscriptions, projects and boards with PostgREST `.range()` but without `.order()`, despite a comment claiming stable ordering. Unordered page boundaries can omit or duplicate identifiers and undercount the subscription-derived email outbox or board/pin hierarchy in the deletion preflight inventory.

The worker now applies ascending primary-key `id` ordering before every page range. Regression test explicitly requires ordered `subscriptions`, `projects` and `boards` queries.

Current worker blob: `446961d5b9a75c1007d07e76cefef4a548b943b8`; test blob: `5882650d115a31b5b6d472db183d6771e142947e`; audit: `docs/audits/2026-11-18-account-deletion-preflight-stable-pagination.md`.

Owner verification: after clean main sync, run `node --test backend/test/account-deletion-worker.test.js`; require exit 0. Also include this test in the full backend Node suite. Do not run the account-deletion worker against production or real user accounts; it remains behind the explicit rollout gate. Runtime remains NOT VERIFIED.


### UA-054 — проверить симметричную NULL amount-защиту Prodamus grant helper (2026-11-18)

- **Статус:** [ ] Ожидает локального Node/PostgreSQL runtime; статический diff уже опубликован, runtime не подтверждён.
- **Что исправлено:** в migration 161 добавлена явная проверка `v_payment_amount IS NULL` для subscription grant path; ранее такая проверка была только для credits. Canonical baseline сейчас объявляет `subscriptions.amount NOT NULL`, но helper теперь явно защищает обе ветви одинаково.
- **Что добавлено:** Node static contract требует ровно два явных NULL amount guards — для credits и subscriptions.
- **Файлы/коммиты:** migration blob `039b778b89f8d592eda92a7f199176030a1eeb49`, commit `2d3a478d17e4c17995cd2ba407f31b93224a906f`; test blob `252ab03a5146605a28cb01f465c17d7bf8947f97`, commit `4c02b2afcd2240f08bb9903e5b9afb3cd7442f27`.
- **Выполнить после синхронизации main:** `node --test backend/test/postgres-integration-runner-contract.test.js`; затем полный backend Node suite и disposable PostgreSQL runner из UA-052. Требовать exit 0 и сохранить полный результат.
- **Ограничения:** не применять миграцию к production/Supabase/PIN_TRIAL; не использовать реальные платежи или аккаунты; не передавать секреты. Статическая проверка двух guards не заменяет SQL runtime.


### UA-052 addendum — latest private grant-helper evidence checks (2026-11-18)

Migration 161 received a follow-up hardening commit. The private grant helper now verifies that the local amount is present, equals the immutable provider receipt amount within 0.01, and uses the same normalized currency for both credits and subscriptions. It also refuses a decision already bound to another payment kind, payment ID or user.

Current migration 161 blob: `039b778b89f8d592eda92a7f199176030a1eeb49` (commit `6360f302eb5ef6a93c8c624523f1d5ea07eef852`). Payment receipt SQL privilege test blob: `8007fbfc84ade10d7dbe1b6fc4cdda3b5a7e872d` (commit `48495387d933fc93000ce0cbce9a5abca0aeb850`). PostgreSQL runner Node contract blob: `252ab03a5146605a28cb01f465c17d7bf8947f97` (commit `bcc9e1fe68ee715dd8a244e06f95aedd0e7de1e4`).

The new static contract requires two missing-amount guards and exact amount/currency/payment identity checks. Runtime remains NOT VERIFIED. Latest observed atomic Actions run `44317800999` failed before runner allocation (job `134848439716`, zero steps); do not treat this as a test failure or a pass. Re-run the UA-052 clean local acceptance sequence after syncing latest main.


### UA-052 final source-reference synchronization (2026-11-18)

Older source blob references earlier in UA-052 are historical. Current exact blobs are indexed in the final reconciliation table at the end of `docs/DOCUMENTATION_REGISTER.md`. Current main has 152 migrations (010–161), 49 SQL tests, 52 Node preflight tests and 10 concurrency scripts. Latest atomic Actions run `44317872327` failed before job steps were available; no runtime result is claimed. Vercel remains `build-rate-limit`. Execute UA-052, UA-053 and UA-054 only on the clean local checkout and disposable PostgreSQL environment; do not use production or real accounts/payments.


### Final status refresh — 2026-11-18

Latest atomic Actions run `44318275401` / job `134850094393` concluded failure, but GitHub returned no job steps; no test execution is evidenced. Latest persisted-boards run `44318275331` also concluded failure. Vercel status on the then-current main HEAD is **pending**, replacing the earlier build-rate-limit failure; pending is not deployment success. Do not claim CI/build/runtime PASS. Current static inventory remains 152 migrations, 49 SQL tests, 52 Node preflight tests and 10 concurrency scripts. Keep payments and first-user invitations blocked until actual runtime gates pass.


### UA-055 — verify deterministic admin statistics pagination (2026-11-18)

- **Статус:** [ ] Regression added and published; Node runtime is NOT VERIFIED.
- **Причина:** admin `users` and `credit_transactions` were paginated by offset without a deterministic order. This can skip/repeat rows and corrupt dashboard totals and credit metrics.
- **Исправление:** `backend/admin.js` applies unique primary-key `id ASC` before each range. Regression `backend/test/admin-stats-pagination.test.js` verifies three pages per table and ordering on all six requests.
- **Current blobs:** admin source `87bcb9d9d540a1ec4a0700d01f0f94f04a916faf`; test `7788913a7fa20eab951956661ac3d0b0d496866e`. Commits: `ffdb871971c7e6702737e8c3bfc8828bd75696c9`, `9779a201658a92b0b6b6f9a7b33c3035220768a4`.
- **Команда:** после clean sync выполнить `node --test backend/test/admin-stats-pagination.test.js`; затем полный backend Node suite. Требовать exit 0; сохранить вывод и Node version.

### UA-053 addendum — invalid Storage manifest RPC response regression (2026-11-18)

Mainline commit `031da170684d9ff5d5b2add436d9b9bcd18e2460` now fails closed if either initial or final Storage-manifest RPC returns a non-array (including null), instead of treating a malformed/null response as an empty manifest. Regression coverage exists in `backend/test/account-deletion-worker.test.js` for both cases. Current worker blob `d01f59307612b700e9873017da32d5c93025c60a`; test blob `5882650d115a31b5b6d472db183d6771e142947e`. Execute `node --test backend/test/account-deletion-worker.test.js` on local test environment only. Do not enable the worker or process real user accounts.


### UA-053 current-source reconciliation (2026-11-18)

Further mainline hardening rejects non-array paginated inventory responses (including null) instead of treating them as empty. Current worker blob `1df861ccc0f05cc8b787f51c5e111bc07d3660cb`, test blob `292c619f9717f862589aecadfa9f9855662b7f9b`; commits `04bb175803eb2524834785d0599e4d37a77ed2e3` and `185d1d8015ee629dbd95a7da0a10de2db835241e`. These current blobs supersede earlier worker/test SHAs recorded in the initial UA-053 addendum. Run `node --test backend/test/account-deletion-worker.test.js` only locally; do not enable the worker or use real accounts.


**UA-053 audit reference refresh (2026-11-18):** detailed report `docs/audits/2026-11-18-account-deletion-preflight-stable-pagination.md` current blob `d0c94414069590d462a956c701d98c935654f217`. It documents both the null paginated inventory-page guard and initial/final Storage-manifest array validation. No runtime or real-account execution is authorized by this note.


### Latest verification status — 2026-11-18

- Latest atomic Actions run `44318456320` / job `134850721164`: failure summary, no job steps returned. Latest persisted-boards run `44318455249`: failure. No test execution or PASS is evidenced.
- Vercel status on pre-note main HEAD `18056e35326265c24301979461bbc1692b162914`: FAILURE / `build-rate-limit` (platform quota, not source compilation evidence).
- Current worker/test blobs are `1df861ccc0f05cc8b787f51c5e111bc07d3660cb` / `292c619f9717f862589aecadfa9f9855662b7f9b`; current admin/test blobs are `87bcb9d9d540a1ec4a0700d01f0f94f04a916faf` / `7788913a7fa20eab951956661ac3d0b0d496866e`. UA-053/055 cover their local Node tests.
- Runtime remains NOT VERIFIED. Keep first-user invitations, live payments and deletion-worker rollout blocked until the owner-run Node suite, disposable PostgreSQL/SQL suite, concurrency suite and build gates have actual successful output.


### UA-056 — current platform status (2026-11-18)

- **Статус:** blocked externally; no source test failure is inferred.
- Current main HEAD: `c4667efd110e09d3ebaf84a307d4f6ca6849570d`; latest code/test commit: `185d1d8015ee629dbd95a7da0a10de2db835241e`.
- GitHub combined status on both commits reports Vercel `failure` / `build-rate-limit`. Do not interpret this as a source build or test failure; deployment is not confirmed.
- Latest recorded atomic Actions run: `44318275401`, job `134850094393`; GitHub returned no steps. No test command is evidenced as started. Do not repeatedly rerun until the account/runner limitation is resolved.
- Continue with owner-local Node and disposable PostgreSQL commands from UA-052, UA-053 and UA-055. Do not use production, real payments or real accounts.


### UA-056 — Pinterest scheduler claim RPC malformed response regression (2026-11-18)

- **Статус:** [ ] Код и регрессионные тесты опубликованы; Node/PostgreSQL runtime NOT VERIFIED.
- **Первопричина:** успешный RPC response с `data: null` или не-массивом ошибочно считался пустой очередью из-за `(dueRows || [])`. Это могло скрыть сбой выдачи задач и отметить scheduler run успешным, оставив публикации необработанными.
- **Исправление:** `backend/scheduleResponse.js` экспортирует `isValidClaimedScheduleRows`; `backend/pinterest.js` проверяет массив, лимит 1, полную идентичность и уникальные schedule IDs до подсчёта/heartbeat/обработки.
- **Тесты:** `backend/test/schedule-response.test.js` и `backend/test/pinterest-scheduler-route-contract.test.js`.
- **Blobs:** helper `7170f77c44442bdf12a33c4b63996978d8705f80`; route `d66d34f9042c55371c2a34ef8e74931b391a9e0c`; unit test `c5b4084903e96f5fa808e8fbff31e222a8dfd5f6`; route test `d7f8936167432a3444c0f444968318cf5c919b6c`.
- **Команды на clean local checkout:** `node --test backend/test/schedule-response.test.js backend/test/pinterest-scheduler-route-contract.test.js`; затем `node --test backend/test/schedule-worker.test.js backend/test/pinterest-scheduler-health.test.js`. После Node PASS — scheduler SQL integration tests в disposable PostgreSQL: `pinterest-schedule-claim-heartbeat.integration.sql`, `pinterest-scheduler-completion-fencing.integration.sql`, `pinterest-stale-schedule-recovery.integration.sql`. Не использовать production.


### UA-056 — validate Pinterest scheduler claim RPC payload before processing (2026-11-18)

- **Finding:** scheduler treated `data: null` or malformed `claim_due_pin_schedules` payload as an empty queue via `(dueRows || []).length` and `dueRows || []`. It could mark a scheduler run successful while due work was silently unprocessed. It also began processing rows without validating the complete identity needed for lease fencing and the publication journal.
- **Fix:** added `isValidClaimedScheduleRows(rows, limit)`; accepts a valid empty array or bounded batch only, requires complete nonblank identity fields (`id`, `user_id`, `pin_id`, `pinterest_account_id`, `pinterest_board_id`, `claim_token`) and unique schedule IDs. Route validates immediately after the RPC and before counting, heartbeat or processing.
- **Current blobs:** `backend/scheduleResponse.js` `7170f77c44442bdf12a33c4b63996978d8705f80`; `backend/pinterest.js` `d66d34f9042c55371c2a34ef8e74931b391a9e0c`; `backend/test/schedule-response.test.js` `c5b4084903e96f5fa808e8fbff31e222a8dfd5f6`; route contract `d7f8936167432a3444c0f444968318cf5c919b6c`; source claim RPC schema is migration 049 blob `5ade3e2e7a3bd2c3161ef537486fb9101c7c2c05`.
- **Commits:** validator `1acc3aa120a5b073afccf3132b0bf4ea9310f924`; unit regression `fb48f225540f4c2d9fa10251ae9faab4a9bee82c`; route `793bc081efc6a27c442fe0faa41cacccbde49fa0`; route contract `10f634594a774e963cf02caecfd263546347e094`.
- **Owner runtime commands:** after clean sync, run `node --test backend/test/schedule-response.test.js backend/test/pinterest-scheduler-route-contract.test.js`; then `node --test backend/test/schedule-worker.test.js backend/test/pinterest-scheduler-health.test.js`. Require exit 0 and preserve output. Next run only the disposable PostgreSQL scheduler heartbeat/completion-fencing/stale-recovery SQL tests. Do not invoke live Pinterest publishing or production cron.
- **Status:** source and static contract re-fetched; Node/PostgreSQL/CI runtime NOT VERIFIED. Keep scheduled publishing and first-user launch blocked until runtime/staging acceptance.

Detailed audit: `docs/audits/2026-11-18-pinterest-scheduler-claim-response.md` (blob `78cac2a515f45884780918f7cc4e651747ce53dc`).


### UA-056 addendum — scheduler HTTP response consumer validation (2026-11-18)

The scheduler runner previously accepted `data.ok === true` without validating counters/results, despite the existing shared contract helper. It now calls `isValidScheduleWorkerResponse` before treating a batch as successful. Current source blob `4eff5a721a8f5668876056109902e57ccb8ae1e5`, test blob `9757a340c8c2653aa4f71ef42c68a09feea88eb0`; commits `68ef687186539530a37623dffaca28a73662970b`, `460a54ac3a1da36d728796a5af329fcbd994c941`. Run `node --test backend/test/schedule-worker.test.js` together with schedule-response and route-contract tests. Runtime NOT VERIFIED.


### UA-056 platform status addendum (2026-11-18)

Latest observed push-triggered runs after scheduler hardening: atomic payment run `44319160489` / job `134853192142`, and persisted-boards run `44319160390` / jobs `134853191735`, `134853192203`. Both concluded failure; GitHub's jobs response returned `steps: null`, so no test command execution is evidenced. Combined Vercel status for main HEAD `2468bccc99762afdc47306ffda0e06b2da846ead` was `failure / build-rate-limit`. This is platform/runner evidence, not a source test failure or pass. Runtime acceptance remains blocked until the owner resolves runner allocation/quota and runs the focused Node/PostgreSQL commands above.


### UA-057 — current platform status after scheduler response hardening (2026-11-18)

- **Статус:** Vercel provider build limit; CI/runtime remain NOT VERIFIED.
- Current main HEAD: `2468bccc99762afdc47306ffda0e06b2da846ead`; latest code/test commit: `460a54ac3a1da36d728796a5af329fcbd994c941` (worker response-contract regression) and implementation `68ef687186539530a37623dffaca28a73662970b`.
- Combined status on both commits reports Vercel `failure` / `build-rate-limit`. This is not evidence of a source build/test failure; deployment is not confirmed.
- Latest recorded atomic Actions run: `44318456320`; no job steps returned. Do not infer a test result or repeatedly rerun while the external runner/limit blocker persists.
- Run the UA-056 scheduler-focused Node commands and the disposable PostgreSQL scheduler SQL tests only on the clean local environment. Do not run live Pinterest publishing or production cron.


### UA-056 addendum — strict response fixtures and latest CI status (2026-11-18)

Mainline commit `ff8549114d407b66bcbca1e8ac40421bde238cfc` aligned legacy worker test fixtures with the strict one-row response contract; current test blob `ca4bf9a3635c1e29bd328ccc38c68d849772e0c0`. Audit updated at commit `df07d8e64173dc8528f7e059115b184aba59098d`. Latest push runs `44319401720` (atomic payment) and `44319401655` (persisted boards) failed without job steps/logs; no test execution is evidenced. Vercel status remains `build-rate-limit`. Do not infer runtime failure or success; run focused Node tests and disposable PostgreSQL suites after runner/plan quota is restored.


### UA-056 addendum — scheduler worker fixtures aligned to strict response validation (2026-11-18)

The worker now rejects malformed `ok: true` responses unless counters and result rows form a complete valid contract. Updated `backend/test/schedule-worker.test.js` so every successful mock uses a complete empty, published or scheduled response. The one-row lease test no longer claims three rows; it asserts one scheduled row. Current test blob `ca4bf9a3635c1e29bd328ccc38c68d849772e0c0`; fixture correction commit `ff8549114d407b66bcbca1e8ac40421bde238cfc`; audit blob `a09bb595bec2708c190df3b16e64bc9cf7b3bd46`.

Run `node --test backend/test/schedule-worker.test.js` alongside the UA-056 route/claim tests. Runtime remains NOT VERIFIED; no live Pinterest publishing or production cron.


### UA-057 final branch status — 2026-11-18

- Current published main HEAD: `731efc620d19b624e073ca7991bc922a3e46a4c4`; latest code/test commit: `ff8549114d407b66bcbca1e8ac40421bde238cfc`.
- Vercel combined status on main is `failure / build-rate-limit`; deployment is not confirmed and this is not evidence of source-test failure.
- Latest recorded Actions runs: atomic payment `44319401720`, persisted boards `44319401655`; both have no job steps/logs returned. Runtime NOT VERIFIED.
- Run owner-local focused Node tests (UA-053, UA-055, UA-056) and disposable PostgreSQL checks only after restoring runner access. No production DB, real payment, live Pinterest publication or real account deletion.


### UA-058 — email outbox claim RPC contract regression (2026-11-18)

- **Статус:** код и регрессионные тесты опубликованы; Node/PostgreSQL runtime NOT VERIFIED.
- **Первопричина:** `dispatchPendingSubscriptionEmails()` преобразовывал `data: null`/malformed response от `claim_email_outbox` в `[]`, затем возвращал успешный `processed: 0`. SQL migration 030 определяет RPC как `SETOF public.email_outbox`; корректная пустая очередь — массив `[]`.
- **Исправление:** проверяется весь batch до SMTP/mark/retry: ограниченный массив, уникальные ID, `claim_token`, `subscription_id`, `recipient_email`, `template_key`, object `payload`. Некорректный ответ бросает ошибку, не отправляя ни одного письма.
- **Файлы:** `backend/billing.js` blob `3818dedcfbbbac0fa6a1f36b9009328a07d97d67`; `backend/test/email-outbox.test.js` blob `da9438ed59e9d3c3e791a1feee8ffb5ff25f12ad`; migration 030 blob `75a4d24e85327384f6089e2d340c9841a857e8eb`.
- **Коммиты:** `4bd9145198a643a5878652054cd41ae77cb529a1`, `c1fc19af5d217a58c29dcbda0d0bdf64ac761f0c`; audit commit `d8f6f6ae22469bd58cce46a8d2beb2f743870f18`.
- **Команды на clean local checkout:** `node --test backend/test/email-outbox.test.js`; затем focused billing/webhook tests from the project manifest. PostgreSQL acceptance: run the email outbox claim/mark/retry SQL scenarios only against disposable PostgreSQL, checking empty result `[]`, claimed row identity, and stale-lease recovery. Не использовать production.
- **Ограничение:** тесты в этой среде не запускались. No SMTP or real customer mail was sent. Do not mark this integration as verified until owner runtime evidence is recorded.

### UA-058 platform status addendum (2026-11-18)

After the email outbox source/test commits, Actions runs `44320063124`, `44320063459`, `44320068909`, and `44320069081` ended in failure; all returned job records had `steps: null`. Vercel remains `failure / build-rate-limit` on current main. These results do not prove tests ran or source failed. Node/PostgreSQL runtime remains NOT VERIFIED. Do not repeatedly retry while runner/quota blockers persist; run the UA-058 local commands and disposable PostgreSQL acceptance after the owner restores a working environment.


### UA-059 — account deletion claim RPC malformed response regression (2026-11-18)

- **Статус:** код и регрессионные тесты опубликованы; Node/PostgreSQL runtime NOT VERIFIED; worker остаётся disabled.
- **Первопричина:** `tick()` использовал `jobs || []` для `claim_account_deletion_jobs`; malformed/null RPC payload трактовался как пустая очередь. Неполная задача также могла попасть в `processJob()` без проверки lease identity и стадии.
- **Исправление:** `isValidDeletionJobBatch()` проверяет ограниченный массив, `job_id/request_id/user_id/claim_token`, разрешённую стадию, `attempts`, `lease_expires_at`, уникальность ID; вся пачка проверяется до первого stage RPC.
- **Файлы:** `backend/accountDeletionWorker.js` blob `2b937219c865352e6b3f4167e9568c732c377a67`; `backend/test/account-deletion-worker.test.js` blob `351c77a749abed04b59aef3684568670ace9d802`; migration 130 blob `1dcf7844444b4a70be1be49946d5a4c4265ce40f`.
- **Коммиты:** source `2cdf0c9fceca0f80d061de24c8a477daf0cd3cf1`; regression `ffad0d99dace0119afeb0b29d7c20844b675f315`; audit `a765c492764c56232b732cf61eb6bf70f4cced21`.
- **Проверки владельца:** `node --test backend/test/account-deletion-worker.test.js`; затем durable queue/worker SQL integration tests в disposable PostgreSQL. Проверить, что malformed claim вызывает только claim RPC и ни одного stage RPC. Production запрещён.


### UA-059 platform status addendum (2026-11-18)

Latest Actions runs after account-deletion claim validation: `44320553737`, `44320553241`, `44320543687`, `44320543564`; all failed and job responses contained `steps: null`. Vercel remains `failure / build-rate-limit`. No Node/PostgreSQL test execution is evidenced. The worker remains disabled. Run UA-058/UA-059 focused tests and disposable SQL tests only after restoring runner/local runtime access; do not retry production actions.


### UA-060 — account deletion worker strict-claim fixture alignment (2026-11-18)

- **Статус:** исправление тестовых fixtures опубликовано; Node/PostgreSQL runtime NOT VERIFIED.
- **Причина:** после добавления строгой проверки claim rows 14 успешных worker stubs всё ещё возвращали неполные объекты. Из-за отсутствия `request_id`, `attempts` и `lease_expires_at` тесты завершались бы на входной валидации, не достигая проверяемых сценариев.
- **Изменение:** все 14 валидных claim fixtures дополнены тремя обязательными полями. Специально неполный `job-incomplete` в negative regression test оставлен без исправлений.
- **Файлы:** `backend/accountDeletionWorker.js` blob `2b937219c865352e6b3f4167e9568c732c377a67`; `backend/test/account-deletion-worker.test.js` blob `94c7683aba347fb98293a2bb63d2328a4d3404d6`; migration 130 blob `1dcf7844444b4a70be1be49946d5a4c4265ce40f`.
- **Коммиты:** test `33299508fcef9cab4141fec4a8974294e0f53a40`; audit `6bbcca306f65ba4c3fb0f170ef29c5ab535d5d4c`.
- **Проверка владельца:** после clean `git pull --ff-only origin main` выполнить `node --test backend/test/account-deletion-worker.test.js`; сохранить полный вывод и exit code. Затем выполнить только disposable PostgreSQL integration tests для durable account-deletion queue/worker. Не запускать worker против production и не включать его в production.
- **Ожидаемый результат:** Node test exit code 0; malformed claim payload вызывает только claim RPC; корректные preflight/erase/finalize fixtures проходят strict validator; SQL queue tests проходят на disposable DB. При любом падении приложить полный вывод, ничего не обходить.


### UA-061 — account deletion exact-count runtime acceptance (2026-11-18)

- **Статус:** fail-closed code and regression tests published; runtime Node/PostgreSQL NOT VERIFIED.
- **Причина:** exact count response `null`/missing silently coerced to zero in account deletion preflight, potentially undercounting user data.
- **Изменение:** strict `normalizeExactCount` accepts only non-negative safe integers across direct owned tables, email_outbox and pins.
- **Файлы:** `backend/accountDeletionWorker.js` blob `3b045acd8600f372a712f0792760eb3145ea1e87`; `backend/test/account-deletion-worker.test.js` blob `ca4786fe629e75662715027c100664bfaa40254b`; audit `docs/audits/2026-11-18-account-deletion-exact-count-fail-closed.md`.
- **Коммиты:** source `84fd644bd1da61461af41925ed111e1b6be8fb22`; test `2a356ba88c3aabdf2da5c57e534c67fd4612ed0d`; audit `3dc4e48ef01daa03c2f684b787eff1585b47d091`.
- **Проверка владельца:** после `git pull --ff-only origin main` выполнить `cd backend; node --test test/account-deletion-worker.test.js`. Сохранить полный вывод и exit code. Затем выполнить только disposable PostgreSQL integration suite по account deletion durable queue/storage manifest. Production не использовать; worker не включать.
- **Ожидаемый результат:** focused Node tests exit code 0; malformed count fails with `invalid_exact_count`, while true zero remains valid. Любое падение сохранить без обхода.


### UA-061 CI status addendum (2026-11-18)

CI was triggered by the source/test commits. Atomic-payment integration runs `44321585302` and `44321591813`, and persisted-boards runs `44321585307` and `44321591809`, all concluded failure. The latest jobs returned `steps: null`; log retrieval returned `BlobNotFound`, so there is no evidence that test commands ran. Vercel still reports `build-rate-limit`. Do not interpret these as a test PASS or a source regression. Owner must run the focused Node test and disposable PostgreSQL acceptance from UA-061 when local runtime is available.


### UA-062 — account deletion Storage manifest batch acceptance (2026-11-18)

- **Статус:** fail-closed validation and regression tests published; Node/PostgreSQL runtime NOT VERIFIED.
- **Причина:** worker ранее проверял Storage manifest по одной записи непосредственно перед удалением. Некорректный успешный RPC-ответ мог привести к частичному удалению до обнаружения следующей плохой/дублирующей записи; размер ответа не сверялся с контрактным пределом 100.
- **Изменение:** полная проверка массива до первого Storage side effect: максимум 100 записей, только bucket `pin-images`, разрешённый managed path, уникальные пары bucket/path. Ответ контрольного запроса с лимитом 1 также отклоняется при размере больше 1.
- **Файлы:** `backend/accountDeletionWorker.js` blob `92ea2372231ea87988548776b5f4208d050b807a`; `backend/test/account-deletion-worker.test.js` blob `5539dbdb79daed9e325ded45610b9a29d4680dc1`; audit `docs/audits/2026-11-18-account-deletion-storage-manifest-batch-validation.md`.
- **Коммиты:** source final `d41c16d4caee20d5cd5ed01ecebb45123e255102`; tests `98a65d8669baf7349946063e5dcfd9d34859557f`; audit `211bb555b0d3a212d1322e39a8ce2e8b49ad3d3d`.
- **Проверка владельца:** `git pull --ff-only origin main`; затем `cd backend`; `node --test test/account-deletion-worker.test.js`. Сохранить полный вывод и exit code. После этого выполнить только disposable PostgreSQL integration tests для durable deletion queue и Storage manifest.
- **Ожидаемый результат:** duplicate/oversized/unsafe manifest response отвергается до первого `deleteImageObject`; valid empty/one-row manifest принимается. Не использовать production, не включать account-deletion worker, не обходить упавшие тесты.

### UA-062 platform-status addendum (2026-11-18)

- После публикации source/test изменений проверены combined statuses: Vercel context = `success` для test commit `98a65d8669baf7349946063e5dcfd9d34859557f` и для documentation HEAD `3e641569209385fb8c9caaef3db0ead0065f5cbc` на момент проверки.
- `fetch_commit_workflow_runs` для test commit и source commit `d41c16d4caee20d5cd5ed01ecebb45123e255102` вернул пустой список workflow runs. Это не подтверждает запуск Node tests. Vercel check success сам по себе не доказывает успешный пользовательский production deploy.
- Node test и PostgreSQL integration остаются NOT VERIFIED; сохранить worker disabled.

### UA-063 — запуск SQL-gate после первой успешной runtime-проверки Node/frontend (2026-11-18)

- **Статус:** ожидает владельца. SQL-миграции, SQL integration suite и concurrency suite остаются NOT VERIFIED.
- **Почему требуется именно ваше действие:** ассистент впервые реально прогнал Node и frontend проверки (backend 729/729, frontend 225/225, `tsc --noEmit` чисто, `npm run build` успешен), но SQL-гейт выполнить не смог. Причины зафиксированы по факту, а не предположительно: установленный PostgreSQL 17 неполный (`initdb` падает на отсутствующем `share/postgres.bki`), `scripts/verify.sh` требует Linux-socket `/var/run/postgresql`, Docker/Podman отсутствуют, npm registry недоступен, а попытка подключиться к работающему `127.0.0.1:5432` с предоставленным паролем была заблокирована политикой среды (`Queries local PostgreSQL using a disclosed password; credential access is unsafe`).
- **Что нужно сделать (один из вариантов):**
  1. **Предпочтительно — полная серверная установка PostgreSQL.** Установить PostgreSQL с серверными компонентами (должен существовать каталог `share` с `postgres.bki`), затем выполнить:
     `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-integration.ps1 -PostgresPort 55439`
     Скрипт требует чистый локальный `main` и запускает последовательно: baseline + 152 миграции `010–161`, две inline-проверки, 49 SQL integration файлов, очистку disposable БД. Прислать полный вывод, exit code и подтверждение, что disposable БД удалена.
  2. **Либо** выполнить эквивалентный прогон на любом доступном disposable-кластере (не production, не PIN_TRIAL) и прислать вывод.
- **Ограничения:** не запускать на production, на PIN_TRIAL или на существующей рабочей БД; не включать account-deletion worker; не проводить реальных платежей; не публиковать пароли и строки подключения в переписке/документации.
- **Ожидаемый результат:** миграции применяются без ошибок, 49 SQL-файлов проходят, disposable БД удалена. Любое падение прислать целиком — обходить или «подгонять» тесты не нужно.
- **После получения результата:** ассистент обновит `docs/PROJECT_STATE.md`, зафиксирует фактические результаты и перейдёт к staging/E2E-сценариям.


### UA-064 — запуск SQL-gate одной командой (скрипт подготовлен, 2026-11-18)

- **Статус:** готово к запуску владельцем. Этот шаг закрывает самую большую непроверенную область проекта.
- **Почему это делаете вы, а не ассистент:** пароль, переданный в переписке, не может быть использован ассистентом — защитный слой среды отклоняет такие запросы («credential access is unsafe»), и обходить это нельзя. Поэтому подготовлен скрипт, который запрашивает пароль **интерактивно у вас**: он не попадает ни в переписку, ни в файлы, ни в историю команд.
- **Что запустить (одна команда):**
  ```powershell
  cd X:\!PROGECT\pinboard-ai
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-sql-windows.ps1
  ```
  Если PostgreSQL слушает не 5432 или пользователь другой:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-sql-windows.ps1 -PostgresPort 5433 -PostgresUser postgres
  ```
  Быстрая проверка только схемы, без SQL-тестов: добавьте `-SkipIntegration`.
- **Что скрипт делает:** проверяет loopback-хост, контрастность цепочки миграций `010..161` (иначе отказ, чтобы не применять частичную схему), создаёт **одноразовую** БД `pinposy_verify_<random>`, применяет `db/supabase-stub.sql`, `001_baseline.sql`, grant перед миграцией 039 и все активные миграции, затем прогоняет SQL-файлы в порядке CI (читает список из workflow, с порогом ≥40 файлов) плюс 4 файла из второго workflow. В конце — удаление только своей БД в `finally`.
- **Что скрипт НЕ делает:** не трогает `PIN_TRIAL`, production, `pinposy_test` и любую существующую БД; не включает worker удаления аккаунта; не делает платежей; не публикует ничего в интернет.
- **Что прислать:** весь вывод консоли, `exit code` и строку `PASS: baseline + N migrations applied; M SQL integration files passed.` Если упало — пришлите имя файла из строки `FAIL:` и текст ошибки; подгонять тесты не нужно.
- **Ограничение:** скрипт рассчитан на серверный PostgreSQL (нужны роли и право создавать БД). Если установленный PostgreSQL — клиентский (без `share/postgres.bki`), скрипт всё равно сработает против уже запущенного сервера, потому что не создаёт новый кластер.

#### UA-064 — результат первого прогона (2026-11-18) и новая команда

- **Прогон выполнен владельцем.** Что подтвердилось фактически: локальный сервер PostgreSQL 18.6, одноразовая БД создана и удалена корректно, цепочка `010..161` непрерывна, **все 152 миграции применились без ошибок**, первые 13 SQL integration файлов прошли.
- **Что упало:** 14-й файл `payment-provider-receipt-fulfillment.integration.sql` — `ОШИБКА: незавершённая строка с $` (`LINE 1: do $$`). Причина: коммит `31882a97` переписал терминатор `$$;` в `$;`, файл стал непригоден к запуску, но его никогда не исполняли, поэтому дефект жил незамеченным. Исправлено коммитом `b4882674`.
- **Что улучшено в скрипте по итогам прогона:**
  1. статическая проверка сбалансированности dollar-quotes во всех 223 SQL-файлах **до** запроса пароля (можно ловить такие дефекты вообще без базы);
  2. UTF-8 для psql (`PGCLIENTENCODING`, `chcp 65001`) — в первом прогоне текст ошибки был нечитаемым;
  3. stderr psql больше не печатается как `System.Management.Automation.RemoteException`;
  4. режим `-KeepGoing` — проходить все файлы и выдавать список падений в конце.
- **Новая команда (рекомендуется именно она):**
  ```powershell
  cd X:\!PROGECT\pinboard-ai
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-sql-windows.ps1 -KeepGoing
  ```
- **Ожидаемый результат:** `PASS: baseline + 152 migrations applied; 53 SQL integration files passed.` Если что-то падает — в конце будет список `backend/test/<файл>`; пришлите его целиком вместе с текстом ошибок над ним.
- **Что осталось непроверенным:** SQL-файлы №15–53 (39 файлов) и скрипт конкуренции `backend/test/run-disposable-concurrency-suite.sh`.

#### UA-064 — РЕЗУЛЬТАТ: гейт пройден (2026-11-18)

- **Статус: выполнено.** Четвёртый прогон завершился `PASS: baseline + 155 migrations applied; 53 SQL integration files passed.` (155 = baseline + 154 активные миграции `010..163`). Это означает, что **вся схема БД и все 53 SQL-контракта проверены на живом PostgreSQL 18.6**.
- **Что было найдено и исправлено по итогам прогонов** (все — реальные дефекты, не «подгонка тестов»): непригодный к запуску SQL-файл (терминатор `$;`), **потеря письма об активации подписки** (миграция `162`: платящий пользователь не получал письмо с миграции 157), **токен аренды воркера в ответе админ-RPC** (миграция `163`), неверный SQLSTATE `restrict_violation` в обработчике удаления пина.
- **Следующее действие владельца (новое, UA-065):** прогнать тесты гонок — они не запускались ни разу:
  ```powershell
  cd X:\!PROGECT\pinboard-ai
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-sql-windows.ps1 -Concurrency -KeepGoing
  ```
  Это выполнит полный replay схемы, 53 SQL-файла и затем 10 сценариев конкуренции против той же одноразовой БД. Пароль снова вводится вами интерактивно. Ожидаемый результат: две строки `PASS`. Если bash не найден — скрипт скажет об этом прямо, тогда запустите без `-Concurrency`.
- **Не забыть:** `git push origin main` (локально накоплено 23 коммита, среда ассистенту push запрещает).

#### UA-066 — staging и сквозной сценарий (следующий рубеж)

- **Зачем:** всё, что можно было проверить без секретов, теперь проверено (схема, 53 SQL-контракта, 10 гонок, 790 backend-тестов, 234 frontend-теста). Осталось главное для платного продукта: живые деньги и живая публикация.
- **Что нужно подготовить:**
  1. Отдельный проект Supabase для staging (не production) и его `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`.
  2. SMTP-доступ (или тестовый ящик) для писем: подтверждение email, сброс пароля, письмо об активации подписки.
  3. Prodamus в тестовом режиме: `PRODAMUS_SHOP_ID`, `PRODAMUS_SECRET`, `PRODAMUS_URL` (только HTTPS).
  4. Приложение Pinterest с правами `boards:read`, `pins:read`, `pins:write` и тестовый аккаунт.
  5. `NODE_ENV=production` на staging и `FRONTEND_URL`/`PUBLIC_BACKEND_URL` по фактическим адресам.
- **Куда вписывать:** только в переменные окружения платформы. В репозиторий, документацию и переписку секреты не попадают — это правило сессии, и оно не меняется.
- **Сценарий, который нужно пройти целиком (в этом порядке):**
  1. регистрация → письмо с подтверждением приходит → переход по ссылке → аккаунт подтверждён;
  2. вход → создание проекта → генерация пина (списываются кредиты, баланс и журнал совпадают);
  3. согласование пина → расписание на ближайшее время;
  4. подключение Pinterest через OAuth → публикация по расписанию → пин реально виден в Pinterest;
  5. оплата подписки минимальной суммой → приходит письмо об активации (это то, что чинилось миграцией 162) → тариф применён;
  6. удаление аккаунта → все данные и файлы удалены, публикации остановлены.
- **Что прислать:** на каждом шаге — что сработало, что нет, и текст ошибок. По результатам я исправлю найденное и обновлю документацию.
- **Важно:** платёж проводить только минимальной суммой и только с вашего явного согласия; production-база и production-магазин не используются.

#### UA-067 — `git push origin main`: 43 коммита (2026-11-18)

- **Что сделать:**
  ```powershell
  cd X:\!PROGECT\pinboard-ai
  git log --oneline origin/main..HEAD   # посмотреть, что уезжает
  git push origin main
  ```
- **Почему это важно:** среда ассистенту запрещает публиковать изменения (`git push` блокирован политикой), поэтому всё, что сделано после `ebc30e92`, существует только локально. В GitHub этого пока нет.
- **Что уезжает (кратко):** глобальный rate limit, SQL-gate и его защитные тесты, 12 исправленных дефектов (включая письмо активации подписки и утечку lease-токена в админ-RPC), ограничения цены пакетов кредитов, полный экспорт аккаунта (формат v2), исправления воркера удаления, единый `purpose` для сессионных токенов, покрытие обновления Pinterest-токена, инвентарь очереди удаления для админа, проверки авторизации/владения маршрутами и целостности документации.
- **Что ожидать:** в репозитории появится 43 коммита; `main` останется линейным (никаких force-push и переписывания истории не делалось).

#### UA-068 — как посмотреть очередь удаления аккаунта (2026-11-18)

- **Зачем:** заблокированное удаление аккаунта — это юридическое обязательство со сроком. Теперь его состояние можно запросить, а не искать в логах.
- **Как:** с токеном администратора:
  ```powershell
  curl.exe -H "Authorization: Bearer <ADMIN_JWT>" "https://<backend>/admin/account-deletion/inventory?limit=20"
  ```
- **Что смотреть:**
  - `requests.pending` — сколько удалений в очереди; `oldest_pending_age_minutes` — сколько ждёт самое старое;
  - `jobs.blocked` — задачи, которые **сами не перезапустятся** (исчерпаны попытки: 8 для preflight, 100 для стирания);
  - `requiring_attention[]` — по каждой такой задаче шаг, число попыток, безопасный код ошибки и возраст.
- **Что делать при `blocked > 0`:** прислать ответ эндпоинта — по `error_code` я скажу, что именно не удалось (например, `storage_manifest_batch_remaining`), и подготовлю исправление.
- **Важно:** эндпоинт только читает. Ничего не удаляет и не перезапускает.
