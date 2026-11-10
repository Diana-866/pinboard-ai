# AUD-242 — не требовать OAuth reconnect при обычном истечении access token

Дата: 2026-11-09

## Проблема
`expires_at` описывает срок действия access token, а не refresh token. Ранее `isPinterestReauthRequired` трактовал любой прошедший или некорректный `expires_at` как необходимость повторного OAuth-подключения. В `PinterestCard` это также блокировало загрузку досок. При наличии действующего refresh token такой аккаунт можно восстановить штатным refresh flow, который уже сериализован lease и защищён uncertainty fence.

## Исправление
- `needs_reauth` остаётся true при `refresh_state='uncertain'`: результат ротации мог быть потерян, старый refresh token нельзя безопасно повторять.
- Истёкший или некорректный access-token expiry сам по себе больше не требует OAuth, если refresh token присутствует.
- Если access token истёк/expiry некорректен и refresh token отсутствует, UI по-прежнему предлагает повторное подключение.
- Отсутствующий `expires_at` остаётся нейтральным для legacy-аккаунтов; код не выдумывает дату истечения.
- Существующий API flow при получении 401 пытается обновить access token через account-scoped refresh; браузеру по-прежнему не передаются credentials.

## Регрессии
- Истёкший access token + refresh token → `needs_reauth=false`.
- Истёкший access token без refresh token → `needs_reauth=true`.
- Некорректный expiry + refresh token → `needs_reauth=false`.
- Некорректный expiry без refresh token → `needs_reauth=true`.
- Состояние `uncertain` по-прежнему требует OAuth независимо от expiry.

## Проверка
Unit-тесты добавлены в `backend/test/pinterest-public-account.test.js`. Исходный workflow backend tests уже запускает Node test suite. Изменённые файлы повторно читаются через GitHub API. Локальные Node/Frontend/PostgreSQL тесты не запускались; CI необходимо оценить отдельно. Production, реальные Pinterest API-вызовы, миграции, deployment и merge не затрагивались.
