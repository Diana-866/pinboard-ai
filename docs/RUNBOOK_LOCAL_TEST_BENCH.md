# Локальный стенд PinPosy (без денег и без production)

Стенд поднимается целиком внутри рабочей среды агента: временная PostgreSQL, слой REST (PostgREST),
почтовый приёмник и сам backend. Ничего не уходит в Supabase, Render, Prodamus или Pinterest,
данные пользователей не затрагиваются.

Проверено 2026-11-22: регистрация → письмо → подтверждение → вход → профиль → создание проекта.

## 1. PostgreSQL и схема

```bash
sudo pg_ctlcluster 16 main start

DB=pinposy_bench
sudo -u postgres psql -X -q -d postgres -c "DROP DATABASE IF EXISTS \"$DB\""
sudo -u postgres psql -X -q -d postgres -c "CREATE DATABASE \"$DB\""
P="psql -X -q -h /var/run/postgresql -v ON_ERROR_STOP=1"
sudo -u postgres $P -d "$DB" -f db/supabase-stub.sql
sudo -u postgres $P -d "$DB" -f db/migrations/001_baseline.sql
for f in $(ls db/migrations/0[1-9][0-9]_*.sql db/migrations/1[0-6][0-9]_*.sql | grep -v 001_baseline); do
  sudo -u postgres $P -d "$DB" -f "$f" || break
done
```

`db/supabase-stub.sql` создаёт роли `anon`, `authenticated`, `service_role` и `auth.uid()` —
без него baseline не применяется.

## 2. REST-слой (PostgREST)

Backend обращается к `SUPABASE_URL/rest/v1/...`, поэтому нужен PostgREST и прокси, срезающий
префикс `/rest/v1` (сам PostgREST его не знает).

```bash
# бинарник
curl -sSL -o /tmp/pgrst.tar.xz https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
tar -xf /tmp/pgrst.tar.xz -C /tmp

# роль postgres: пароль только для стенда
sudo -u postgres psql -X -q -d postgres -c "ALTER USER postgres PASSWORD 'benchpw'"

cat > /tmp/pgrst.conf <<'EOF'
db-uri = "postgres://postgres:benchpw@127.0.0.1:5432/pinposy_bench"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "bench_secret_do_not_use_in_prod_0123456789"
server-port = 3002
server-host = "127.0.0.1"
EOF
(setsid nohup /tmp/postgrest /tmp/pgrst.conf >/tmp/pgrst.log 2>&1 </dev/null &)
```

Ключи для backend генерируются локально (HS256, `role=service_role` / `role=anon`, срок 10 лет)
тем же секретом, что `jwt-secret` PostgREST — supabase-js не проверяет ключ, проверяет PostgREST.

Прокси `/rest/v1` → PostgREST слушает `127.0.0.1:3001`.

## 3. Почта

Транзакционная почта требует TLS (`requireTLS`), поэтому приёмник — aiosmtpd с самоподписанным
сертификатом, а backend запускается с `NODE_TLS_REJECT_UNAUTHORIZED=0` (только стенд!).
Письма складываются в `/tmp/mail/NNN.eml`; ссылка подтверждения достаётся из text/plain части.

```bash
python3 -m pip install --quiet aiosmtpd
openssl req -x509 -newkey rsa:2048 -keyout /tmp/key.pem -out /tmp/cert.pem -days 2 -nodes -subj "/CN=127.0.0.1"
# /tmp/smtpsink.py — Controller с authenticator, принимающим любой логин, и handle_DATA, сохраняющим письмо
(setsid nohup python3 /tmp/smtpsink.py >/tmp/smtp.log 2>&1 </dev/null &)
```

## 4. Backend

```bash
cd backend
K=$(cat /tmp/service.jwt); A=$(cat /tmp/anon.jwt)
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production PORT=4000 NODE_TLS_REJECT_UNAUTHORIZED=0 \
  SUPABASE_URL=http://127.0.0.1:3001 SUPABASE_SERVICE_ROLE_KEY="$K" SUPABASE_ANON_KEY="$A" \
  JWT_SECRET="bench_jwt_secret_0123456789abcdef0123456789" \
  FRONTEND_URL=http://127.0.0.1:5173 PUBLIC_BACKEND_URL=http://127.0.0.1:4000 \
  PINPOSY_SCHEDULER_SECRET="bench_scheduler_secret_1234567890abc" ADMIN_SECRET="bench_admin_secret" \
  MAIL_SMTP_HOST=127.0.0.1 MAIL_SMTP_PORT=2525 MAIL_SMTP_USER=bench@pinposy.test \
  MAIL_SMTP_PASS=benchpass MAIL_FROM=support@pinposy.test \
  setsid nohup node index.js > /tmp/be.log 2>&1 </dev/null &
```

Требования, на которых легко споткнуться: `JWT_SECRET` ≥ 32 байт, иначе процесс падает с
`config_jwt_secret_missing`; `SUPABASE_SERVICE_ROLE_KEY` обязателен вне `development/test`.

## 5. Сценарий проверки

```bash
curl -s http://127.0.0.1:4000/ready                                  # {"ok":true}
curl -s -X POST http://127.0.0.1:4000/register -H 'Content-Type: application/json' \
  -d '{"email":"test@pinposy.test","password":"StrongPass123","name":"Тест","terms_accepted":true}'
# токен из письма:
python3 - <<'PY'
import email,re,glob
msg=email.message_from_bytes(open(glob.glob('/tmp/mail/*.eml')[-1],'rb').read())
for p in msg.walk():
    if p.get_content_type()=='text/plain':
        print(re.search(r'token=([A-Za-z0-9_-]+)',p.get_payload(decode=True).decode()).group(1)); break
PY
curl -s -X POST http://127.0.0.1:4000/verify-email -H 'Content-Type: application/json' -d '{"token":"<TOKEN>"}'
curl -s -X POST http://127.0.0.1:4000/login -H 'Content-Type: application/json' \
  -d '{"email":"test@pinposy.test","password":"StrongPass123"}'      # token + user
curl -s http://127.0.0.1:4000/me -H "Authorization: Bearer <TOKEN>"  # профиль
curl -s -X POST http://127.0.0.1:4000/projects -H "Authorization: Bearer <TOKEN>" \
  -H 'Content-Type: application/json' -d '{"website_url":"https://example.com","niche":"home decor"}'
```

Результат 2026-11-22: регистрация 200, письмо ушло, подтверждение 200, вход 200, профиль 200,
проект 201. Проверка `website_url: http://127.0.0.1/admin` → 422 (защита от локальных адресов работает).

## 6. Чего стенд не покрывает

- Реальную почту через SMTP-провайдера (доставляемость, SPF/DKIM).
- GPTunnel: генерация платная и требует ключа; на стенде не запускалась.
- Prodamus: реальные платежи и вебхуки (проверяются только подписью в тестах).
- Pinterest OAuth и публикацию — нужен настоящий аккаунт и одобрение приложения.
- Supabase Storage: загрузка изображений на стенде не проверялась (нужен S3-совместимый слой).
