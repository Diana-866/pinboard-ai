# Backend audit — batch 03: billing, credits and Prodamus

**Дата:** 2026-11-16  
**Проверенная база до изменений:** `main`, HEAD `8857aed217183f6f5589b3b7d1c14b4508a8e9f5`  
**Проверенная база после изменений:** `main`, HEAD `9adc5133ee9e4f38500028558330774836441973`  
**Объём:** 11 backend-модулей, 25 тематических backend test/SQL files из дерева, 10 относящихся к биллингу/кредитам SQL migrations. Проверка статическая; полный runtime/integration аудит не завершён.

## Проверенные модули

- `backend/billing.js` — создание подписки, webhook, история и админские сводки.
- `backend/creditsBilling.js` — создание покупки кредитов, webhook, история.
- `backend/credits.js` — чтение баланса и атомарное изменение через RPC.
- `backend/creditPacks.js` — серверный каталог пакетов и цен.
- `backend/prodamus.js` — создание checkout, подпись, webhook verification, статус/сумма/валюта и проверка checkout URL.
- `backend/prodamusWebhookBody.js` — bounded parser nested multipart fields; отклоняет prototype keys, конфликтующие и повторные поля.
- `backend/paymentCreationIdempotency.js` — durable idempotency state machine.
- `backend/paymentOrderId.js` — order IDs с OS CSPRNG.
- `backend/billingWebhookAudit.js` — минимальный deduplicated fingerprint для signed webhook exceptions без сохранения customer email/raw payload.
- `backend/adminFinancialOperations.js` — read-only queue старых generation/regeneration/reservation операций.
- `backend/adminPaymentCreationRequests.js` и `backend/adminProviderRefundActions.js` — административная сверка платежей и узкие RPC actions; маршруты в `backend/index.js` защищены `requireAuth, requireAdmin`.

## Просмотренные SQL-контракты

- `006_subscriptions.sql`, `007_credit_purchases.sql`
- `010_atomic_credit_ledger.sql`, `011_atomic_subscription_activation.sql`
- `029_billing_webhook_exceptions.sql`, `037_billing_webhook_currency_audit.sql`
- `072_provider_refund_reconciliation_settlement_guard.sql`, `073_provider_refund_reconciliation_workflow.sql`, `074_respect_active_credit_reservations_in_ledger_adjustments.sql`
- `116_idempotent_prodamus_checkout_creation.sql`, `117_payment_creation_provider_order_reference.sql`, `118_settle_payment_creation_after_webhook.sql`

Проверенные контракты: локальные цены не берутся из клиентской суммы; checkout idempotency уникален на пользователя; provider order привязывается до внешнего запроса; ambiguous checkout не переоткрывается; webhook signature проверяется до поиска заказа; success требует совпадения суммы/валюты; баланс+ledger+purchase marker атомарны; subscription activation и paid period атомарны; повторные callbacks не должны повторно начислять кредиты/период; settlement требует точного order/kind/user/local payment identity.

## Проверенные тестовые файлы

- `admin-payment-creation-requests.test.js`
- `admin-provider-refund-actions.test.js`
- `admin-refund-validators.test.js`
- `billing-security-contract.test.js`
- `billing-webhook-audit.test.js`
- `demo-payment-guard.test.js`
- `payment-creation-settlement.test.js`
- `payment-order-id.test.js`
- `payment-record-cleanup.test.js`
- `prodamus-ambiguous-checkout.test.js`
- `prodamus-webhook.test.js`
- `tariff.test.js`, `tariff-self-select.test.js`
- `credit-concurrency.sh`
- `credit-reservation-ledger-guard.integration.sql`
- `payment-creation-idempotency.integration.sql`
- `payment-creation-settlement.integration.sql`
- `pin-generation-credit-reservations.integration.sql`
- `pin-regeneration-credit-reservations.sh`
- `prodamus-credit-fulfillment.integration.sql`
- `billing-webhook-audit-privileges.integration.sql`
- `provider-refund-legacy-inventory.sql`
- `provider-refund-operator-actions.integration.sql`
- `provider-refund-reconciliation-guard.integration.sql`
- `provider-refund-reconciliation-workflow.integration.sql`

## Подтверждённый дефект и исправление

**Дефект:** `backend/prodamus.js` использовал `validateStatus: () => true`, но затем извлекал checkout URL из тела ответа без проверки HTTP status. Следовательно, ответ 503/redirect с полем `link` мог быть принят как созданный счёт.

**Исправление в main:**
- Принимать checkout URL только для HTTP 2xx.
- Только явный HTTP 4xx помечать `providerRejected`.
- HTTP 3xx, 5xx, отсутствующий/невалидный status и network failure считать ambiguous.
- Для явного 4xx закрывать локальную pending запись условным UPDATE и только после подтверждённого RPC transition освобождать idempotency key.
- Если cleanup или RPC не подтверждены — оставлять запрос в unknown; не разрешать повторный счёт.
- Одинаковая политика используется для подписок и покупки кредитов.
- Добавлены regression cases для 2xx, 4xx, 5xx, redirects, network failure, cleanup failure и неуспешного RPC подтверждения.
- Добавлен GitHub Actions workflow `.github/workflows/prodamus-checkout-tests.yml`, запускающий Prodamus unit regressions на push в main и PR.

## CI / build evidence

Для commit `9adc5133ee9e4f38500028558330774836441973`:
- Новый workflow запустился на push и завершился failure до появления шагов job. Повторный запуск (run attempt 2) также завершился failure без шагов. Job steps пусты, логи выполнения недоступны; это runner/setup failure до исполнения команд, а не результат Node tests. Node tests пока НЕ подтверждены.
- Другие backend/PostgreSQL workflow также завершились failure до шагов; это не доказывает падение самих тестов.
- Vercel status = failure, target указывает `build-rate-limit`; frontend build не подтверждён.
- Нельзя заявлять, что unit или integration tests прошли.
- Production DB, Prodamus account, реальные платежи и env не проверялись и не изменялись.

## Сверка PR

- PR #88 касается той же проблемы checkout failure handling, но его base SHA устарел (`1914c5c5`); изменения перенесены адресно в main, PR не объединялся.
- PR #3 — историческая атомаризация Prodamus fulfillment; остаётся открытым и требует отдельной сверки с текущим main.
- Остальные открытые PR не объединялись и в этом пакете не классифицировались.

## Остатки / следующий шаг

1. Дождаться повторного GitHub Actions запуска и получить фактический результат тестов; при реальном тестовом дефекте исправить.
2. Продолжить backend аудит оставшихся модулей и полного `backend/index.js`.
3. Отдельно проверить migration chain и schema compatibility на disposable PostgreSQL; production migrations не запускать.
4. Проверить реальную Prodamus staging configuration/test payment только после отдельного staging readiness review; live платежи не запускались.
