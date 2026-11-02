# Агент 3 — Pinterest API: что сделать (по шагам)

Дата: 2 ноября 2026. Проект PinPosy (React + Vite, Express, Supabase, Render + Vercel).

## Что в этом архиве

| Файл | Что это | Куда положить |
|---|---|---|
| `db/migrations/008_pinterest_accounts.sql` | таблицы `pinterest_accounts`, `pinterest_publications` (идемпотентно, старые таблицы не меняются) | выполнить в Supabase SQL Editor |
| `backend/pinterest.js` | OAuth, доски, публикация пинов, обновление токена | `backend/pinterest.js` (новый файл) |
| `frontend/src/components/settings/PinterestCard.tsx` | карточка «Pinterest» в настройках | `frontend/src/components/settings/` |
| `frontend/src/components/pins/PublishPinButton.tsx` | кнопка «Опубликовать в Pinterest» для карточки пина | `frontend/src/components/pins/` |

---

## Шаг 1. Ключи Pinterest

1. Открыть `https://developers.pinterest.com/apps/`, войти тем аккаунтом, на который регистрировали PinPosy.
2. Нажать на приложение **PinPosy**.
3. Скопировать **App ID** → это `PINTEREST_CLIENT_ID`.
4. Нажать **Show / Reveal** рядом с **App secret** и скопировать → это `PINTEREST_CLIENT_SECRET`.
5. Найти поле **Redirect URIs** (в настройках приложения) и вписать ровно:
   `https://pinboard-ai-backend.onrender.com/integrations/pinterest/callback`
   Без слэша на конце. Сохранить (**Save**).
6. В разделе **Scopes** включить: `boards:read`, `boards:write`, `pins:read`, `pins:write`, `user_accounts:read`.

## Шаг 2. Переменные на Render

Render → pinboard-ai-backend → **Environment** → **Add Environment Variable**:

| Имя | Значение |
|---|---|
| `PINTEREST_CLIENT_ID` | App ID |
| `PINTEREST_CLIENT_SECRET` | App secret |
| `PINTEREST_REDIRECT_URI` | `https://pinboard-ai-backend.onrender.com/integrations/pinterest/callback` |

**Save Changes** → подождать деплой.

## Шаг 3. Миграция

Supabase → SQL Editor → New query → вставить весь файл `008_pinterest_accounts.sql` → **Run**.
Ожидаемо: `Success. No rows returned`.

## Шаг 4. Файлы и одна строка в index.js

1. Скопировать `backend/pinterest.js` в папку `backend/`.
2. Скопировать `PinterestCard.tsx` в `frontend/src/components/settings/`.
3. Скопировать `PublishPinButton.tsx` в `frontend/src/components/pins/`.
4. Открыть `backend/index.js`, найти строку `// --- Админка ---` и **над ней** вставить одну строку:

```js
require("./pinterest").registerRoutes(app, { requireAuth, requireTariff, handleError });
```

(именно так, с точкой с запятой; переменные уже объявлены выше в файле)

5. Открыть `frontend/src/components/settings/SettingsView.tsx`:
   - в начале файла, после других импортов, добавить:
```tsx
import { PinterestCard } from './PinterestCard';
```
   - найти комментарий `{/* 2. THEME SELECTION */}` и **над ним** вставить:
```tsx
      {/* Pinterest */}
      <PinterestCard />

```
6. Опубликовать пины из карточки: в компоненте карточки пина (там, где кнопки «Утвердить») добавить:
```tsx
import { PublishPinButton } from './PublishPinButton';
...
<PublishPinButton pinId={pin.id} />
```

## Шаг 5. Пуш

```
git add -A
git commit -m "Add Pinterest API integration: OAuth, boards, pin publishing"
git push origin main
```

## Проверка для вас

1. Render → Logs: строка `[pinterest] роуты подключены, интеграция настроена`.
2. `https://pinboard-ai-backend.onrender.com/integrations/pinterest/status` с заголовком `Authorization: Bearer <ваш токен>` → `{"configured":true,"connected":false}`.
3. Кабинет → Настройки → карточка «Pinterest» → «Подключить Pinterest» → страница Pinterest → «Разрешить» → возврат на `/app?pinterest=connected` → статус «Подключён: @логин».
4. Supabase: `select username, expires_at from pinterest_accounts;` → одна строка.
5. Опубликовать одобренный пин → пин появился в вашем настоящем аккаунте Pinterest.
6. Supabase: `select pin_id, pinterest_pin_id from pinterest_publications;` → строка с id пина Pinterest.
7. Повторный клик «Опубликовать» → ответ `already_published: true`, второй пин в Pinterest не создаётся.
