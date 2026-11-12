# PinPosy (pinboard-ai)

AI-сервис планирования и создания контента для Pinterest: анализ сайта, генерация идей досок и пинов, изображения, ручное утверждение и публикация через официальный Pinterest API.

**Сайт:** https://pinposy.com
**Бэкенд:** https://pinboard-ai-backend.onrender.com

## Структура

```
backend/   — Express API (Node.js): аутентификация, проекты, доски, пины, кредиты, админка
frontend/  — React 19 + Vite + TypeScript + Tailwind 4 (SPA)
docs/      — документы для заявки Pinterest API и сопроводительные материалы
```

## Стек

| Слой | Сейчас | Цель (переезд на РФ-инфраструктуру) |
|---|---|---|
| Фронтенд | Vercel | статика на своём сервере/CDN в РФ |
| Бэкенд | Render | VPS/контейнер в РФ (Docker) |
| База данных | Supabase (PostgreSQL) | managed PostgreSQL в РФ |
| AI | GPTunnel (gptunnel.ru) | без изменений |
| Платежи | — (план: Prodamus) | Prodamus |

## Локальная разработка

Бэкенд:
```bash
cd backend
npm install
JWT_SECRET=dev-secret SUPABASE_URL=... SUPABASE_ANON_KEY=... GPTUNNEL_API_KEY=... npm start
```

Фронтенд:
```bash
cd frontend
npm install
npm run dev
```

## Проверка перед деплоем

GitHub Actions на аккаунте не запускаются (раннеры заблокированы лимитом оплаты),
поэтому проверка идёт одной командой локально:

```bash
./scripts/verify.sh              # бэкенд: node --check + тесты; фронтенд: tsc + тесты + сборка
./scripts/verify.sh --migrations # плюс прогон всех миграций на чистой PostgreSQL
```

Скрипт печатает итог по шагам и завершается с ненулевым кодом, если что-то упало.
Для шага с миграциями нужен локальный PostgreSQL (`psql`) и файл
`db/supabase-stub.sql` — он создаёт роли Supabase и `auth.uid()`.

## Переменные окружения бэкенда

Полный список с назначением и признаком обязательности — в
[`backend/.env.example`](backend/.env.example). Кратко:

| Переменная | Назначение |
|---|---|
| `JWT_SECRET` | подпись JWT-токенов |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (или `SUPABASE_ANON_KEY`) | доступ к БД |
| `GPTUNNEL_API_KEY` | ключ AI-провайдера |
| `FRONTEND_URL` | CORS: адрес фронтенда |
| `PINPOSY_SCHEDULER_SECRET` | секрет внутреннего вызова воркера публикаций (≥32 символа) |
| `ADMIN_SECRET` | секрет админ-операций |
| `ENABLE_DEV_TOPUP` | `true` — включает тестовое пополнение кредитов (только вне production) |
| `PINTEREST_TOKEN_ENCRYPTION_KEY` | Активный 32-байтовый ключ AES-256-GCM для токенов Pinterest (base64 или 64 hex-символа) |
| `PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS` | Необязательный предыдущий ключ на период безопасной ротации; старые токены будут перешифровываться при чтении аккаунта |

### Ротация ключа Pinterest

При смене `PINTEREST_TOKEN_ENCRYPTION_KEY` сначала установите новый ключ как активный, а старый — в `PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS`. Старые зашифрованные токены останутся читаемыми и будут перешифрованы новым ключом при следующем чтении соответствующего аккаунта. Не удаляйте предыдущий ключ, пока не убедитесь, что все сохранённые Pinterest-аккаунты были перешифрованы; иначе неиспользуемые аккаунты могут потерять доступ.

## План и требования

- Единый продуктовый чек-лист и методика процентов: `docs/MASTER_REQUIREMENTS.md`
- Отдельный этап инфраструктуры: `docs/INFRASTRUCTURE_REQUIREMENTS.md`
- Операционный план и журнал: `docs/LAUNCH_CONTROL.md`

## Фоновая публикация Pinterest

Планировщик запускается **отдельным постоянно работающим worker-процессом**, а не внутри web-сервера и не в браузере.

### Развёртывание worker

Создайте отдельный Background Worker из этого же репозитория и той же ветки, что и backend:

- **Root / Working directory:** `backend`
- **Build command:** `npm ci`
- **Start command:** `npm run worker`
- **Restart policy:** автоматический перезапуск при сбое

Переменные окружения:

| Переменная | Где задаётся | Значение |
|---|---|---|
| `PINPOSY_SCHEDULER_SECRET` | backend и worker | Один и тот же случайный секрет минимум 32 символа |
| `PINPOSY_BACKEND_URL` | worker | HTTPS URL backend, например `https://pinboard-ai-backend.onrender.com` |
| `PINPOSY_SCHEDULER_INTERVAL_MS` | worker, необязательно | Интервал опроса, по умолчанию 30000 мс |
| `PINPOSY_SCHEDULER_REQUEST_TIMEOUT_MS` | worker, необязательно | Тайм-аут запроса, по умолчанию 120000 мс, максимум 900000 мс |

Сгенерируйте секрет криптографически стойким генератором, сохраните его только в настройках окружения обоих сервисов. Не помещайте секрет в Git, frontend или URL.

Worker обращается к закрытому endpoint `POST /internal/pinterest/schedule/run` и обрабатывает не более одной записи за запрос. Если worker остановлен, задания остаются в PostgreSQL и не исполняются до его восстановления. Перед включением реальных публикаций необходимо применить все необходимые миграции расписания на отдельной staging-БД и проверить OAuth, публикацию, повторный запуск worker и восстановление просроченного задания. **Не включайте worker на production без отдельного согласования и проверки миграций.**

### Более экономный режим для Cron Job

Если хостинг не поддерживает постоянно работающие Background Workers на доступном тарифе, можно запускать один ограниченный тик из Cron Job:

- **Root / Working directory:** `backend`
- **Build command:** `npm ci`
- **Command:** `npm run worker:once`
- **Schedule:** `* * * * *` (каждую минуту; один запуск обрабатывает не более одной публикации)
- **Environment:** те же `PINPOSY_BACKEND_URL` и `PINPOSY_SCHEDULER_SECRET`, что указаны выше.

Каждый запуск делает ровно один аутентифицированный запрос к backend и завершает процесс. Очередь остаётся в PostgreSQL; если предыдущий тик ещё выполняется, backend отвечает `busy` без повторного захвата задания. Это не бесплатный тип сервиса Render, но Cron Jobs тарифицируются по фактическому времени выполнения; ориентир минимального compute-плана — $0.00016 за минуту. Перед включением реальных публикаций всё равно требуется staging-проверка миграций и Pinterest OAuth.



## Фоновое физическое удаление аккаунтов

Физическое удаление выполняется отдельным постоянно работающим worker-процессом. Он обрабатывает только аккаунты в состоянии `deletion_pending`, использует durable queue и fenced RPC, удаляет только объекты из заранее сохранённого Storage manifest и сохраняет финансовые записи. Запуск worker не означает, что миграции уже применены.

### Подготовка и безопасный запуск

1. Сделайте резервную копию production PostgreSQL и проверьте восстановление копии.
2. На отдельной staging-БД последовательно примените канонические миграции до `147_account_deletion_storage_batch_retry.sql` включительно. В частности, должны присутствовать миграции `127–147`; не применяйте их выборочно или в произвольном порядке.
3. Запустите `./scripts/verify.sh --migrations` и SQL integration test `backend/test/account-deletion-storage-manifest.integration.sql` на disposable/staging базе. Проверьте полный сценарий тестового аккаунта: preflight, отзыв Pinterest credentials, очистка содержимого и Storage, сохранение финансовых записей, финализация tombstone и повторный запуск после искусственного сбоя.
4. Только после успешной staging-проверки примените те же миграции к production в SQL Editor, строго по порядку, после резервной копии. Не передавайте ключи или дампы в чат.
5. Создайте отдельный Background Worker из той же проверенной ветки и commit, что и backend:
   - **Root / Working directory:** `backend`
   - **Build command:** `npm ci`
   - **Start command:** `npm run worker:account-deletion`
   - **Restart policy:** автоматический перезапуск при сбое
   - **Environment:** те же `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` и `NODE_ENV=production`, что у backend.
6. Сначала включите worker на staging и убедитесь, что он обрабатывает только тестовый аккаунт. Для production запуска используйте отдельное подтверждение владельца после проверки миграций и staging.

Переменные worker:

| Переменная | Значение |
|---|---|
| `SUPABASE_URL` | URL того же Supabase проекта, что использует backend |
| `SUPABASE_SERVICE_ROLE_KEY` | серверный service-role ключ; не использовать anon key |
| `NODE_ENV` | `production` |
| `ACCOUNT_DELETION_WORKER_INTERVAL_MS` | необязательно; интервал опроса, по умолчанию 30000 мс, минимум 5000 мс |

**Не включайте** `ACCOUNT_DELETION_WORKER_ENABLED=true` на web backend одновременно с отдельным worker: это запустит второй poller. Переменная нужна только для встроенного режима backend, который по умолчанию выключен. Для рекомендуемого отдельного Background Worker её задавать не нужно.

Если worker остановить, незавершённые задания останутся в durable queue; после повторного запуска обработка продолжится. Не удаляйте вручную строки очереди, Storage manifest или lifecycle-журнала для «починки» зависшего удаления.

## Документы

- Политика конфиденциальности: `frontend/src/legal/privacy-policy.ru.md` / `.en.md` (отображается на `/privacy`)
- Условия использования: `frontend/src/legal/terms.ru.md` / `.en.md` (отображается на `/terms`)
- Заявка в Pinterest API: `docs/pinterest/` (описание, обоснование scopes, сценарий демо-видео, чек-лист)

## План разработки

Актуальный план и журнал выполнения — в `planning.md`.
