# Backend audit — batch 02: authentication and account lifecycle

**Дата:** 2026-11-16  
**Проверенная база:** `main`, HEAD `19bd95f4cb2318ce1296df22a96b4646dbc6f2e0`  
**Объём:** 7 backend-модулей, 11 относящихся к ним тестовых/контрактных файлов, 6 auth SQL migrations. Это целевой пакет, не полный аудит.

## Проверенные backend-модули

| Файл | Назначение | Результат |
|---|---|---|
| `backend/auth.js` | Регистрация и вход | Email/password валидируются; bcrypt; фиктивный hash для неизвестного пользователя; проверка пароля до статуса email; неподтверждённый email не получает JWT; конфликт уникальности обрабатывается как 409. |
| `backend/bearerToken.js` | Разбор Authorization | Принимается ровно один Bearer credential; malformed/multi-token заголовки отклоняются. |
| `backend/sessionToken.js` | JWT-сессии | HS256 закреплён явно; TTL 7 дней; в claim включён tokenVersion; verify ограничен HS256. |
| `backend/email-verify.js` | Подтверждение email | Случайный токен 32 bytes, в БД передаётся SHA-256; TTL 24 часа; cooldown и выдача токена делегированы атомарному RPC; анонимный resend возвращает одинаковый ответ. |
| `backend/password-reset.js` | Восстановление пароля | Публичный ответ не раскрывает существование email; токен хешируется; смена пароля делегирована атомарному RPC; frontendUrl из запроса не используется. |
| `backend/mail.js` | SMTP/IMAP | Транзакционная почта отделена от IMAP и ответов поддержки; настройки проверяются до отправки; лимит тела письма/почтового сообщения ограничен на читающем endpoint. Полный аудит админских mail routes и поведения IMAP ещё нужен. |
| `backend/accountLifecycle.js` | Экспорт данных и запрос удаления | Экспорт использует allowlist чувствительных полей, ownership graph и пагинацию; неполные разделы отражаются в degradedSections; удаление fail-closed без worker и требует повторной проверки пароля. |

## Проверенные маршруты в backend/index.js

- `/register`, `/login`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password`.
- `/me`, `/account/export`, `/account/deletion-request`.
- `requireAuth` сверяет JWT tokenVersion с текущей строкой users; сбой чтения БД возвращает 503.
- На auth/recovery/verification endpoints установлены IP rate limits; resend дополнительно ограничен на уровне аккаунта атомарным SQL RPC.
- Удаление аккаунта не выполняет физическое удаление в HTTP-запросе; принимает запрос только при включённом worker.

## SQL-контракты

Просмотрены:
- `002_auth_tokens.sql`
- `005_email_verified.sql`
- `020_atomic_password_reset.sql`
- `021_atomic_email_verification.sql`
- `022_atomic_email_verification_issuance.sql`
- `023_revoke_sessions_after_password_reset.sql`
- `024_password_reset_email_cooldown.sql`
- `055_auth_token_version.sql`

Проверено по коду: issuance/consumption блокируют user row до token row; cooldown сериализован; пароль, погашение токена и увеличение token_version выполняются в одной транзакции; security-definer функции закрепляют search_path и права исполнения ограничены service_role. Migration 055 добавляет NOT NULL/default 0 и неотрицательное ограничение.

## Проверенные тесты и контракты

- `backend/test/auth.test.js`
- `backend/test/bearer-token.test.js`
- `backend/test/session-token.test.js`
- `backend/test/account-lifecycle.test.js`
- `backend/test/auth-recovery-concurrency.sh`
- `backend/test/auth-recovery.integration.sql`
- `backend/test/auth-schema-contract.sql`
- `backend/test/registration-input-validation.test.js`
- `backend/test/email-verification-concurrency.sh`
- `backend/test/password-reset-issuance-concurrency.sh`
- `backend/test/email-locales.test.js`
- `backend/test/email-outbox.test.js`
- `backend/test/app-boot.test.js`

Тесты содержат проверки enumeration resistance, token algorithm pinning, password reset/session revocation, атомарности recovery RPC, concurrent issue/consume, account export redaction/pagination и fail-closed deletion. Наличие тестов не означает, что они были запущены.

## Подтверждённые замечания

1. **Startup/readiness gap:** `backend/index.js` только пишет warning при отсутствии `JWT_SECRET`, но не останавливает запуск. `/health` при этом отвечает `{ok:true}`; вход не сможет подписать JWT, а защищённые запросы будут отвергаться. Это подтверждённый дефект конфигурационной готовности, но не доказательство, что production env сейчас отсутствует. Требуется отдельная проверка startup config и readiness.
2. Не найдено подтверждённого обхода авторизации или утечки credential material в просмотренных auth/account lifecycle модулях.
3. Полный аудит `mail.js` admin routes, всех вызывающих мест, всех 150 файлов backend/test и всех миграций не выполнен.

## Проверки исполнения

- GitHub Combined Status для проверенного HEAD `19bd95f4`: Vercel = success.
- Это не подтверждает backend unit tests, PostgreSQL integration tests или production integrations.
- В этой сессии исходники читаются через GitHub; Node/PostgreSQL test suite локально не запускался.
- Production DB, Render/Supabase env и реальные email отправки не проверялись и не изменялись.

## Следующий шаг

Продолжить аудит billing/credits/Prodamus: `billing.js`, `creditsBilling.js`, `credits.js`, `creditPacks.js`, `prodamus.js`, `prodamusWebhookBody.js`, финансовые admin-модули и соответствующие тесты/миграции. Не запускать реальные платежи и не менять production.
