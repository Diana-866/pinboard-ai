# PinPosy — пакеты кредитов (разовые покупки через Prodamus)

Что добавлено: покупка пакетов кредитов **100 / 500 / 1000** за **190 / 790 / 1290 ₽**.
Кредиты из пакетов **не сгорают**: после оплаты вебхук Prodamus зачисляет их на
`users.credits_balance` (запись `topup` в `credit_transactions`, видна на `/credits`).

---

## 1. Что изменилось в коде

### Бэкенд (`backend/`)

| Файл | Что это |
|---|---|
| `creditPacks.js` | **Новый.** Серверный каталог пакетов и цен (единственный источник цен). Сумма от клиента не используется никогда. |
| `creditsBilling.js` | **Новый.** `createCreditsPayment` (pending-покупка + ссылка Prodamus), `handleCreditsWebhook` (идемпотентное зачисление), `listUserCreditPurchases` (история). |
| `prodamus.js` | **Восстановлен.** В архиве файл был повреждён (дублированный `const provided`, отсутствовали `require` и хелперы `signPayload`/`isConfigured`/…). Поведение сохранено: HMAC-SHA256 от JSON-канонической строки с отсортированными ключами, base64, заголовок `Sign`; поддержка `PRODAMUS_SECRET_WEBHOOK`, hex-подписи и «плоского» payload. |
| `index.js` | Подключены маршруты `GET /billing/credit-packs`, `POST /billing/credits`, `GET /billing/credit-purchases`; вебхук `/billing/webhook` теперь диспетчер: `order_id` с префиксом `ppc-` → пакеты кредитов, остальные → подписки. |

### Фронтенд (`frontend/src/`)

| Файл | Что это |
|---|---|
| `lib/billing.ts` | Добавлены `fetchCreditPacks`, `startCreditsPurchase`, `buyCreditsAndRedirect`, `fetchCreditPurchases` и типы. |
| `components/pricing/PricingView.tsx` | Вкладка «Кредиты» (внутри существующих вкладок «Подписка»/«Кредиты») — карточки пакетов **без упоминания себестоимости и наценки** (удалены столбцы cost/netProfit/margin), таблица пакетов, история покупок (`credit_purchases`) со статусами. Кнопки реально создают платёж и уводят на Prodamus. |
| `components/layout/Header.tsx` | Бейдж кредитов в шапке показывает живой `users.credits_balance` вместо захардкоженного 840. |
| `i18n/locales/*.ts` (7 локалей) | Добавлены `pricing.paymentError`, `pricing.paymentCreating`; в `ru.ts` — блок `purchases` (история покупок). В остальных локалях UI берёт русский фолбэк через `?.`. |

### Тесты (`test/`)

- `test/credits-flow.js` — **новый**: каталог, покупка, вебхук (успех/повтор/плохая подпись/чужая сумма/отмена), идемпотентность.
- `test/billing-flow.js` — прежний тест подписок проходит без изменений (регрессия).

Запуск обоих: `node test/credits-flow.js && node test/billing-flow.js` (из корня проекта; сеть и Supabase не нужны).

---

## 2. Миграция БД

Файл: `db/migrations/007_credit_purchases.sql`. Идемпотентна — можно запускать повторно.

Применение: Supabase Dashboard → SQL Editor → New query → вставить содержимое файла → Run.

Что создаёт: таблицу `credit_purchases` (аналог `subscriptions` для разовых покупок):
`user_id`, `package_id` (`pack_100 | pack_500 | pack_1000`), `credits`, `status`
(`pending | success | canceled | denied`), `provider_payment_id` (**unique** — ключ
идемпотентности вебхука), `amount`, `currency`, `paid_at`, `balance_credited_at`.
RLS включён; бэкенд ходит сервисным ключом.

---

## 3. Переменные окружения (Render)

Ничего нового не требуется — используются те же ключи, что у подписок:

| Переменная | Назначение |
|---|---|
| `PRODAMUS_SHOP_ID`, `PRODAMUS_SECRET` | магазин и секрет (обязательны; иначе `/billing/credits` вернёт 503) |
| `PRODAMUS_SECRET_WEBHOOK` | (опц.) отдельный секрет уведомлений |
| `PRODAMUS_DEMO=true` | демо-режим Prodamus (`demo_mode=1` в ссылке) |
| `PUBLIC_BACKEND_URL` | публичный URL бэкенда — из него строится `urlNotification` (вебхук) |
| `FRONTEND_URL` | URL возврата после оплаты (`/app?payment=success`) |

Проверка после деплоя: `GET https://<backend>/billing/health` и
`GET https://<backend>/billing/credit-packs` (должен вернуть 3 пакета).

---

## 4. В личном кабинете Prodamus

1. В настройках платёжной формы укажите URL уведомления: `https://<PUBLIC_BACKEND_URL>/billing/webhook` (один вебхук обслуживает и подписки, и пакеты).
2. Включите «Демо-режим» (или задайте `PRODAMUS_DEMO=true` на Render) для тестовых оплат.

---

## 5. Как проверить демо-оплатой (критерий задачи)

1. Примените миграцию 007 (раздел 2), задеплойте бэкенд с переменными из раздела 3.
2. Войдите в кабинет → «Тарифы» → вкладка **«Кредиты»** → выберите пакет (например, «Пакет M — 500», 790 ₽) → «Купить кредиты».
3. На странице Prodamus пройдите демо-оплату (карта тестовая, деньги не списываются).
4. После редиректа в кабинет:
   - шапка и «Тарифы» показывают **новый баланс** (фронт опрашивает `/me`);
   - раздел кредитов (`/credits`) содержит запись `topup` с описанием пакета и суммой +500;
   - на вкладке «Кредиты» в «Истории покупок» запись со статусом «Оплачено».
5. Идемпотентность: если Prodamus пришлёт вебхук повторно — баланс не удвоится
   (зачисление только при переходе `pending → success`, проверено тестом).

Ручная проверка вебхука локально (без сети):

```bash
cd backend && npm install
cd .. && node test/credits-flow.js && node test/billing-flow.js
```

---

## 6. Частые проблемы

| Симптом | Причина / решение |
|---|---|
| 503 «Приём платежей не настроен» | не заданы `PRODAMUS_SHOP_ID` / `PRODAMUS_SECRET` |
| 500 «Проверьте, что миграция 007 применена» | таблицы `credit_purchases` нет — выполните миграцию |
| Вебхук 403 «Подпись не принята» | секрет уведомления не совпадает: проверьте `PRODAMUS_SECRET_WEBHOOK` / `PRODAMUS_SECRET` |
| Оплата прошла, баланс не вырос | проверьте логи Render (`[credits-billing] …`); если было «balance update failed» — Prodamus ретраит, зачисление произойдёт при повторе |
| Сумма не совпадает (`amount mismatch`) | Prodamus прислал другую сумму — зачисление заблокировано намеренно; проверьте цены в личном кабинете Prodamus и в `backend/creditPacks.js` |

---

## 7. Смена цен

Цены меняются в одном месте: `backend/creditPacks.js` (`CREDIT_PACKS`). При изменении
сумм синхронизируйте цены в личном кабинете Prodamus (если сверка включена) и
карточки на вкладке «Кредиты» (`PricingView.tsx`, массив `creditPacks`).

Примечание к архиву: `node_modules` бэкенда и фронтенда в zip не включены —
выполните `npm install` в `backend/` и `frontend/`.