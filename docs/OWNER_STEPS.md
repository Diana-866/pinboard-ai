# Что нужно от вас: пошагово

Этот файл — инструкция владельцу для целевого VPS **AdminVPS Start, Россия, Ubuntu 24.04, 4 vCPU, 8 ГБ RAM, 80 ГБ NVMe**. Конфигурация рассчитана на этот размер: минимальный self-hosted Supabase без Studio, Analytics, Realtime, Imgproxy и pooler плюс PinPosy API, worker публикации, worker удаления и Caddy.

**Безопасность:** пароли, JWT, API-ключи, токены Pinterest и Prodamus не присылайте в чат, скриншоты или GitHub. Вводите секреты прямо на сервере в файлы `deploy/supabase/.env` и `deploy/.env`. Не открывайте наружу PostgreSQL (5432) или Kong (8000). Наружу нужны только SSH, HTTP и HTTPS.

---

## 1. VPS AdminVPS Start

В панели ADMINVPS проверьте, что выбран именно такой сервер:

- Регион: Россия
- ОС: Ubuntu 24.04 LTS
- CPU: 4 ядра
- RAM: 8 ГБ
- Диск: 80 ГБ NVMe

Не подключайте платные дополнительные услуги или marketplace-образы без отдельного согласования. Запишите публичный IPv4 и логин SSH. Приватный SSH-ключ остаётся только на вашем компьютере.

### Первый вход

В Windows откройте PowerShell:

```powershell
ssh root@ВАШ_IP
```

Если AdminVPS выдал другой логин, замените `root`. При первом подключении проверьте fingerprint сервера в панели провайдера и подтвердите его только при совпадении.

### Обновить Ubuntu и включить firewall

Выполните на сервере:

```bash
apt update
apt full-upgrade -y
apt install -y ca-certificates curl git openssl ufw fail2ban
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

Проверьте, что в списке разрешены SSH, 80 и 443. **Не добавляйте правила для 5432 или 8000.** Перед отключением SSH-входа по паролю сначала проверьте вход по ключу в новом окне PowerShell, иначе можно потерять доступ к серверу.

### Небольшой swap для защиты от OOM

На VPS с 8 ГБ RAM оставьте 2 ГБ swap как аварийный запас (не как замену RAM). Команда безопасно пропускает создание, если swap-файл уже включён:

```bash
if [ -e /swapfile ]; then
  if ! swapon --show=NAME --noheadings | grep -qx '/swapfile'; then
    echo '/swapfile exists but is not active; inspect it manually before proceeding.' >&2
    exit 1
  fi
else
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
fi
grep -qxF '/swapfile none swap sw 0 0' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
printf 'vm.swappiness=10\n' > /etc/sysctl.d/99-pinposy-swap.conf
sysctl --system
swapon --show
free -h
```

Ожидаемый результат: swap около 2 ГБ виден в `swapon --show`. Если файл уже существует, но не включён, не перезаписывайте его автоматически — сначала проверьте его состояние.

---

## 2. Docker и файлы PinPosy

### Установить Docker Engine + Compose

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker --version
docker compose version
```

Обе последние команды должны показать версии, а не `command not found`.

### Скачать проект

Для чистой установки:

```bash
mkdir -p /opt/pinposy
cd /opt/pinposy
git clone https://github.com/Diana-866/pinboard-ai.git
cd /opt/pinposy/pinboard-ai
```

Если репозиторий к этому моменту станет приватным, используйте SSH deploy key или GitHub CLI, авторизованный на сервере. Не вставляйте PAT в URL клонирования и не сохраняйте его в shell history.

Создайте общую внутреннюю сеть для двух Compose-проектов:

```bash
docker network inspect pinposy-internal >/dev/null 2>&1 || docker network create pinposy-internal
```

### Настроить Supabase secrets

Скопируйте пример конфигурации:

```bash
cp deploy/supabase/.env.example deploy/supabase/.env
nano deploy/supabase/.env
```

Сгенерируйте два секрета. Пароль Postgres — hex, чтобы он безопасно помещался в connection URL:

```bash
openssl rand -hex 32
openssl rand -base64 48
```

Первое значение впишите в `POSTGRES_PASSWORD`, второе — в `JWT_SECRET`. Не добавляйте пробелы вокруг `=`. Сохраните файл, затем:

```bash
chmod 600 deploy/supabase/.env
```

Сгенерируйте API keys из Supabase JWT secret в защищённый файл:

```bash
set -a
. deploy/supabase/.env
set +a
node backend/scripts/generate-supabase-keys.js "$JWT_SECRET" > /root/pinposy-supabase-keys.txt
chmod 600 /root/pinposy-supabase-keys.txt
cat /root/pinposy-supabase-keys.txt
```

В выводе будут `ANON_KEY` и `SERVICE_ROLE_KEY`. Это секретные значения. Не отправляйте вывод никому.

Откройте `deploy/supabase/.env` и `deploy/supabase/kong.yml`:

```bash
nano deploy/supabase/.env
nano deploy/supabase/kong.yml
```

В `deploy/supabase/.env` впишите оба ключа. В `kong.yml` замените `ANON_KEY_VALUE_HERE` и `SERVICE_ROLE_KEY_VALUE_HERE` соответствующими значениями. Не используйте `sed` с секретами: ручная замена в редакторе предотвращает случайную порчу значения спецсимволами.

В `deploy/supabase/.env` оставьте:

```dotenv
API_EXTERNAL_URL="http://supabase-kong:8000"
```

### Запустить Supabase

```bash
docker compose -f deploy/supabase/docker-compose.yml config -q
docker compose -f deploy/supabase/docker-compose.yml up -d
docker compose -f deploy/supabase/docker-compose.yml ps
docker compose -f deploy/supabase/docker-compose.yml exec -T db pg_isready -U supabase_admin -d postgres
```

Ожидается, что `db`, `kong`, `rest`, `auth` и `storage` работают, а `pg_isready` сообщает, что база принимает соединения.

Проверьте Kong локально на сервере:

```bash
set -a
. deploy/supabase/.env
set +a
curl -sS -o /dev/null -w "HTTP %{http_code}\n" -H "apikey: $ANON_KEY" http://127.0.0.1:8000/rest/v1/
```

Порт 8000 привязан только к loopback и не должен быть доступен извне.

### Применить миграции PinPosy

Миграции запускаются через официальный проектный скрипт `deploy/apply-migrations.cjs`, который ведёт checksum-журнал и останавливается при изменении уже применённого SQL.

На сервере запустите одноразовый Node 22 контейнер в общей Docker-сети. Он установит только клиент PostgreSQL, подключится к контейнеру `db` и применит миграции:

```bash
set -a
. deploy/supabase/.env
set +a
docker run --rm --network pinposy-internal \
  -v "$PWD:/workspace:ro" -w /workspace \
  -e DATABASE_URL="postgres://supabase_admin:$POSTGRES_PASSWORD@db:5432/postgres" \
  node:22-bookworm-slim bash -lc \
  'apt-get update && apt-get install -y --no-install-recommends postgresql-client && node deploy/apply-migrations.cjs'
```

Дождитесь сообщения об успешном применении миграций. Если скрипт остановился на ошибке, не повторяйте вручную отдельные SQL-файлы и не удаляйте Docker volumes — сохраните вывод ошибки.

### Настроить backend и запустить PinPosy

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
chmod 600 deploy/.env
```

Обязательно заполните:

- `SUPABASE_URL=http://supabase-kong:8000` — без `/rest/v1`;
- `SUPABASE_ANON_KEY` и `SUPABASE_SERVICE_ROLE_KEY` — ключи из Supabase;
- отдельный `JWT_SECRET` для сессий PinPosy (можно сгенерировать `openssl rand -hex 32`; это не Supabase JWT secret);
- `GPTUNNEL_API_KEY`;
- `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET`, `PINTEREST_REDIRECT_URI`, `PINTEREST_TOKEN_ENCRYPTION_KEY`;
- `PRODAMUS_*` — только после отдельной проверки платёжных настроек;
- SMTP/HTTPS-почту по инструкции в разделе 7;
- `CADDY_DOMAIN=www.pinposy.com`, `CADDY_EMAIL`;
- `PUBLIC_BACKEND_URL`, `BACKEND_URL`, `FRONTEND_URL`, `PINPOSY_BACKEND_URL` — актуальные HTTPS-адреса.

Не включайте demo payment, dev top-up или self-select tariff в production.

Проверьте конфигурацию и запустите:

```bash
docker compose -f deploy/docker-compose.yml config -q
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml ps
curl -fsS https://www.pinposy.com/health
```

Для HTTPS домен должен указывать A-записью на IP сервера, а входящие 80/443 должны быть разрешены. DNS не меняйте без отдельного согласования.

---

## 3. Резервные копии

Первый бэкап базы создайте до реальных пользователей и повторяйте ежедневно. Скрипт `deploy/backup.sh` проверяет дамп через `pg_restore --list` и удаляет старые копии только после успешной проверки нового файла.

Пока отдельное внешнее хранилище не выбрано, сохраняйте бэкап на сервере для быстрого восстановления и **дополнительно копируйте зашифрованный файл на свой компьютер**. Не храните единственную копию на том же VPS и не загружайте незашифрованный дамп в публичное облако.

Восстановление — отдельная операция: сначала остановить приложение, сделать копию текущей базы и проверить дамп на временной базе. Не выполнять `docker compose down -v`, `docker volume rm` или удаление каталогов с данными.

---

## 4. Pinterest: адрес возврата

Пока сервер включается, это можно сделать заранее.

1. Откройте сайт Pinterest для разработчиков → войдите под своим аккаунтом → откройте ваше
   приложение (оно в режиме Trial).
2. Найдите раздел с настройками приложения и поле **Redirect URI** (адрес возврата).
3. Вставьте ровно эту строку:
   ```
   https://www.pinposy.com/api/integrations/pinterest/callback
   ```
4. Проверьте, что в областях доступа (scopes) отмечены: `boards:read`, `boards:write`,
   `pins:read`, `pins:write`, `user_accounts:read`.
5. Сохраните.

**Что должно получиться:** адрес сохранён в приложении, ошибок нет.

**Что прислать в ответ:** скриншот раздела с адресом возврата (ключи и секрет на скриншот
не попадут, если не открывать их). Значения `Client ID` и `Secret` вписываются только на сервере.

---

## 5. Вопросы, на которые нужен ваш ответ

1. **Где физически стоит сервер.** Для политики конфиденциальности нужно написать страну
   размещения данных. Скажите, что указать: «Россия» или другую страну — впишу в текст.
   Пока в тексте стоит пометка `[ЛОКАЦИЯ СЕРВЕРА]`.
2. **Память сервера.** Выбран AdminVPS Start с 8 ГБ RAM. Это соответствует рекомендуемому минимуму Supabase для полного self-hosted стека. После запуска нужно измерить фактическую память и свободное место; дополнительные платные ресурсы не подключать без отдельного решения.
3. **Обещания в тарифах.** На странице тарифов упомянуты «Trend Radar» и «мониторинг
   конкурентов». В программе этих функций нет. Убрать эти строки или оставить как планы
   на будущее? Напишите «убрать» или «оставить».

---

## 6. Видео для Pinterest: что снимать (не сейчас, перед подачей заявки)

Видео до 2 минут, записывается прямо с экрана (звук не нужен, интерфейс на английском).
Снимайте **на реальном сервере** (`https://www.pinposy.com`), не на локальной копии.

**Важно про Trial и Sandbox.** PinPosy сейчас использует обычный API host `https://api.pinterest.com/v5` и обычный OAuth token endpoint. Это ожидаемо для приложения с Trial access: Pinterest создаёт Trial Pins/Boards как sandbox-сущности, видимые только создателю. Не переключайте API host на `api-sandbox.pinterest.com` только из-за Trial: отдельная Sandbox среда требует отдельный sandbox token и предназначена для тестирования API. Standard access нужен, чтобы Pins были видны широкой аудитории.

Видео для заявки — это демонстрационная запись экрана с OAuth и публикацией, **не video Pin**. Отдельный Sandbox API не поддерживает создание video Pins. В ролике честно показывайте результат Trial и не утверждайте, что пин доступен публично.

| Время | Что на экране | Что делаете |
|---|---|---|
| 0:00–0:10 | Страница входа | Входите в заранее созданный аккаунт (`demo@…`), без ввода пароля на камеру |
| 0:10–0:25 | Онбординг / проект | Вставляете адрес сайта, выбираете нишу |
| 0:25–0:50 | Генерация | Нажимаете «Generate», показываете готовые пины (картинка + заголовок + описание) |
| 0:50–1:05 | Согласование | Открываете «Approval», утверждаете один пин |
| 1:05–1:35 | **Подключение Pinterest** | Нажимаете «Connect Pinterest» → открывается **экран согласия Pinterest** → нажимаете «Give access» → возвращаетесь в PinPosy и видите подключённый аккаунт. Этот экран обязателен: без него заявку не рассматривают |
| 1:35–1:50 | Публикация | Выбираете доску, жмёте «Publish», показываете статус «Published» и время публикации |
| 1:50–2:00 | Аналитика | Открываете «Analytics»: видно, что пин опубликован (реальные числа сервиса) |

**Что прислать в ответ:** файл видео (mp4) или ссылку на него. Заявку подаём только после вашей
команды «подаём».

---

## 7. Почта: SMTP + HTTPS API fallback

PinPosy поддерживает SMTP для обычной отправки и дополнительный HTTPS API транспорт на случай, если хостер блокирует SMTP connect.

### Основной SMTP

В `deploy/.env` заполните:

- `MAIL_SMTP_HOST`
- `MAIL_SMTP_PORT=465` (implicit TLS) или `587` (STARTTLS)
- `MAIL_SMTP_USER`
- `MAIL_SMTP_PASS`
- `MAIL_FROM` — адрес на вашем подтверждённом домене

Не используйте незашифрованный SMTP. Если провайдер даёт только порт 25 без TLS, не включайте его.

### Резервный HTTPS API (Unisender Go)

1. Создайте/используйте аккаунт Unisender Go и получите API key для транзакционных писем.
2. Подтвердите домен отправителя в панели Unisender Go. Добавьте SPF/DKIM DNS-записи, которые выдаст именно Unisender Go. Если SPF уже существует, измените одну существующую запись; не создавайте вторую SPF TXT.
3. В `deploy/.env` задайте:
   ```dotenv
   MAIL_HTTP_API_KEY="<API key>"
   MAIL_HTTP_API_URL="https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json"
   MAIL_HTTP_API_FROM="no-reply@pinposy.com"
   MAIL_HTTP_API_FROM_NAME="PinPosy"
   ```
   Ключ храните только в `deploy/.env`, не в Git и не в браузере. Если ваш аккаунт находится на `go1` или `go2`, используйте endpoint соответствующего дата-центра с тем же путём `/ru/transactional/api/v1/email/send.json`.
4. Перезапустите backend после изменения env:
   ```bash
   docker compose -f deploy/docker-compose.yml up -d --force-recreate backend worker-publish worker-account-deletion
   ```
5. По умолчанию оставьте `MAIL_HTTP_API_IDEMPOTENCE_ENABLED=false`. Ручной `idempotence_key` поддерживается API, но повтор того же ключа в течение минуты будет отклонён, а не вернёт результат первой отправки. Если включаете параметр, учитывайте это при повторных попытках; ключ вычисляется из стабильного message ID. Автоматическую генерацию ключей самим провайдером можно отдельно запросить у поддержки.
6. Проверьте регистрацию/восстановление пароля на staging и убедитесь, что письмо пришло. Не отправляйте тесты на реальные клиентские адреса.

**Как работает fallback:** SMTP остаётся основным. HTTPS API вызывается только при явной ошибке подключения к SMTP (`CONN/CONNECT`, например `ECONNREFUSED`). Ошибка после начала передачи письма (`DATA`) не переключается автоматически: это могло бы создать дубликат. В случае SMTP connect failure письмо отправляется через HTTPS API. `idempotence_key` по умолчанию не передаётся, чтобы повторная попытка после неоднозначного API-ответа не получила отказ по тому же ключу. Ручной ключ поддерживается API; автоматическую генерацию ключей провайдером можно отдельно включить через поддержку. Только после подтверждения можно включить `MAIL_HTTP_API_IDEMPOTENCE_ENABLED=true`; тогда ключ вычисляется из стабильного message ID.

Unisender Go Web API использует HTTPS POST, заголовок `X-API-KEY` и endpoint `email/send.json`. Схема и ответы описаны в [официальной документации](https://godocs.unisender.ru/web-api-ref).

