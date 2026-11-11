# AUD-240 — устаревший Pinterest OAuth callback после повторного подключения

Дата: 2026-11-09

## Проверка

- OAuth callback подписывает `attempt_id`, `generation`, `token_version` и browser-binding hash в state.
- `commit_pinterest_oauth_attempt_v2` блокирует строку `pinterest_oauth_connection_state` и проверяет точное совпадение generation, attempt ID, token version и срока действия до изменения аккаунта.
- Новый OAuth attempt и disconnect увеличивают generation/сбрасывают текущую попытку. Повторное подключение той же внешней Pinterest identity использует стабильную строку аккаунта.
- Вывод: механизм fencing уже присутствовал; нового runtime-дефекта в production-коде при статическом анализе не обнаружено.

## Улучшение

- Расширен `backend/test/pinterest-oauth.integration.sql`.
- Новый сценарий:
  1. Начинается OAuth attempt C.
  2. Pinterest-аккаунт отключается, attempt C становится устаревшим.
  3. Новый attempt D повторно подключает ту же внешнюю Pinterest identity и сохраняет новый access/refresh token pair в прежнюю account row.
  4. Поздний callback C приходит с тем же external Pinterest ID, но со старыми username и токенами.
  5. Тест требует отказа stale callback и проверяет, что username, оба токена и active/disconnected state остаются от свежего подключения, а account UUID не меняется.
- Существующий workflow уже выполняет `backend/test/pinterest-oauth.integration.sql`; новый шаг CI и новая migration не требуются.

## Пользовательский эффект

Если пользователь отключил Pinterest, затем подключил тот же аккаунт заново, а старое окно OAuth неожиданно завершилось позже, старый callback не сможет затереть новые токены. Пользователь не потеряет новое подключение и не получит неожиданное отключение из-за запоздавшей вкладки.

## Статус проверки

- SQL regression test обновлён в GitHub branch `feat/persisted-boards-api`.
- Существующий fencing в production-коде не менялся, так как уже реализует требуемую защиту.
- Статический read-back и CI pending; SQL не запускался локально.
- Production DB, Pinterest API, deployment и merge не затрагивались.
