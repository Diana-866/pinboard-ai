# Развёртывание PinPosy на новой инфраструктуре (Amvera)

Документ описывает переезд с текущего контура (Vercel + Render + Supabase + Beget) на схему
с независимыми компонентами и бюджетом до 4000 ₽/мес. Он рассчитан на выполнение «с нуля»,
без спешки и без простоя для пользователей: старый контур работает, пока новый не проверен.

## 1. Целевая схема

| Компонент | Сейчас | Цель | Зачем |
|---|---|---|---|
| Frontend | Vercel | статика на Amvera (или Cloudflare Pages) | убрать внешний билд-лимит и зависимость от одного провайдера |
| Backend (web) | Render | контейнер на Amvera | управляемый запуск, регион РФ, дешёвый тариф |
| Воркер расписания | Render Background Worker | отдельный контейнер на Amvera | публикации не зависят от web-процесса |
| Воркер удаления аккаунтов | Render Background Worker | отдельный контейнер на Amvera | удаление данных по запросу пользователя |
| База | Supabase | managed PostgreSQL на Amvera | бэкапы, регион, предсказуемая цена |
| Storage | Supabase Storage | S3-совместимое хранилище (Amvera/VK Cloud) | изображения пинов переживают смену провайдера |
| DNS | Beget | Cloudflare или deSEC | независимость от регистратора и хоста |
| Почта | Beget/провайдер | Яндекс 360 / Mail.ru для домена + SMTP для писем | транзакционные письма не зависят от одного хостинга |

Ориентир по бюджету (проверить цены на amvera.ru перед оплатой): backend 290 ₽ + воркеры 2×290 ₽ +
PostgreSQL 290–490 ₽ + статика 170–290 ₽ ≈ **1040–1360 ₽/мес**, остальное — запас на Storage и почту.

## 2. Что уже готово в репозитории

- `backend/Dockerfile` — образ для web-процесса и воркеров (одна сборка, три команды запуска).
- `backend/.dockerignore` — в образ не попадают `.env`, `node_modules`, тесты.
- `scripts/verify.sh` — проверка схемы и тестов на чистой базе (исправлен диапазон миграций).
- `scripts/smoke-backend.sh` — проверка живого бэкенда после деплоя.
- `scripts/backup-postgres.sh` — резервная копия с проверкой читаемости.
- `scripts/restore-verify.sh` — проверка копии восстановлением на одноразовую базу.
- Схема БД: `001_baseline.sql` + 157 миграций `010–166`, применяется на пустой базе без ошибок.

## 3. Порядок переезда

### Шаг 1. База

1. Создать managed PostgreSQL в Amvera (или внешний managed PostgreSQL).
2. Записать строку подключения в менеджер секретов, не в репозиторий.
3. Применить схему **строго по порядку**:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/supabase-stub.sql   # только если база не Supabase-совместима
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001_baseline.sql
for f in $(ls db/migrations/0[1-9][0-9]_*.sql db/migrations/1[0-6][0-9]_*.sql | grep -v 001_baseline); do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || break
done
```

4. Проверить: `SELECT count(*) FROM information_schema.tables WHERE table_schema='public';` — 36 таблиц.

> Примечание. `db/supabase-stub.sql` создаёт роли `anon/authenticated/service_role` и `auth.uid()`,
> нужные базовым миграциям. На «чистом» PostgreSQL без них baseline не применится.

### Шаг 2. Backend

1. В Amvera создать проект типа **Docker**, подключить репозиторий `Diana-866/pinboard-ai`, каталог сборки — `backend`.
2. Порт контейнера — `3000` (или задать `PORT`).
3. Переменные окружения (значения брать из текущего Render, ничего не печатать в чат):

| Переменная | Обязательна | Назначение |
|---|---|---|
| `NODE_ENV` | да | `production` |
| `PORT` | нет | по умолчанию 3000 |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | да | доступ к базе (для новой базы — новые значения) |
| `SUPABASE_ANON_KEY` | да (fallback) | публичный ключ |
| `JWT_SECRET` | да, ≥32 байт | подпись сессий; после смены все сессии завершатся |
| `FRONTEND_URL` | да | CORS и ссылки в письмах |
| `PUBLIC_BACKEND_URL` | да | адрес вебхука Prodamus |
| `PINPOSY_SCHEDULER_SECRET` | да | секрет вызова воркера расписания |
| `ADMIN_SECRET` | да | админ-операции |
| `GPTUNNEL_API_KEY` | да | генерация |
| `PRODAMUS_SHOP_ID`, `PRODAMUS_SECRET`, `PRODAMUS_SECRET_WEBHOOK` | да для оплаты | приём платежей |
| `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET`, `PINTEREST_REDIRECT_URI`, `PINTEREST_TOKEN_ENCRYPTION_KEY` | да для Pinterest | OAuth и шифрование токенов |
| `MAIL_SMTP_HOST/PORT/USER/PASS/FROM` | да для писем | подтверждение почты, чеки |
| `ENABLE_DEV_TOPUP` | нет | не включать на production |

4. Запустить, дождаться `GET /ready` → `{"ok":true}`.
5. Отдельные контейнеры-воркеры: та же сборка, команда `npm run worker` и `npm run worker:account-deletion`,
   те же переменные плюс `PINPOSY_BACKEND_URL` у воркера расписания.

### Шаг 3. Frontend

1. Собрать с `VITE_API_URL=https://<адрес backend>` (обязательно: адрес «запекается» в бандл при сборке).
2. Выложить `frontend/dist` как статику.
3. Проверить `/`, `/login`, `/app` — 200 и отсутствие ошибок в консоли.

### Шаг 4. Домен, DNS, почта

1. Домен оставить у текущего регистратора до успешной проверки нового контура.
2. DNS перевести на Cloudflare/deSEC, повторить записи A/AAAA/CNAME, TTL снизить заранее (за сутки).
3. Почта: создать ящики на новом провайдере, прописать SPF, DKIM, DMARC; проверить отправку и получение.
4. Только после проверки — переключить домен. Старые ресурсы не удалять минимум две недели.

### Шаг 5. Приёмка переезда

```bash
./scripts/smoke-backend.sh --base-url https://<новый backend> --expect-ready ok
DATABASE_URL="<новая база>" BACKUP_DIR=/tmp/b ./scripts/backup-postgres.sh
PGHOST=127.0.0.1 PGUSER=postgres ./scripts/restore-verify.sh --dump /tmp/b/<файл>.dump
```

Плюс вручную: регистрация → письмо → подтверждение → вход → создание проекта → доска → генерация
(нужен рабочий ключ GPTunnel) → тарифы → демо-платёж Prodamus.

## 4. Откат

- DNS возвращается на старый адрес (TTL уже низкий).
- Старый Render/Vercel не удаляются до двух недель успешной работы нового контура.
- База: переключение `SUPABASE_URL` обратно на старую базу; данные, созданные на новой базе за это время,
  переносятся отдельным скриптом (не автоматически — решение владельца).

## 5. Чего в этом документе нет

- Точных цен и названий тарифов Amvera: их нужно смотреть на сайте перед оплатой.
- Настроек Storage: перенос объектов Supabase Storage требует отдельного скрипта и проверки ссылок
  (в плане работ — после переезда базы).
- Проверки реального платежа и Pinterest: они требуют боевых ключей и выполняются владельцем.
