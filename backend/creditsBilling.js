// Разовые покупки пакетов кредитов через Prodamus.
// Таблица: credit_purchases (db/migrations/007_credit_purchases.sql)
// Каталог пакетов: backend/creditPacks.js (цены задаются ТОЛЬКО там; сумма от клиента не используется).
//
// Эндпоинты (подключены в index.js):
//   GET  /billing/credit-packs        — каталог пакетов для UI
//   POST /billing/credits             — создать покупку и вернуть ссылку Prodamus
//   GET  /billing/credit-purchases    — история покупок пользователя (кабинет)
//   POST /billing/webhook-credits     — отдельный вебхук (или общий /billing/webhook с диспетчем по префиксу order_id)
//
// Пакеты НЕ сгорают: зачисление через adjustBalance(user_id, +credits, 'topup', …).

const supabase = require("./supabase");
const prodamus = require("./prodamus");
const { persistWebhookException } = require("./billingWebhookAudit");
const { httpError, validateEnum } = require("./validate");
const { CREDIT_PACKS, normalizePackId, packAmount } = require("./creditPacks");
const { createPaymentOrderId } = require("./paymentOrderId");
const { beginPaymentCreation, attachPaymentCreationOrder, denyUnsentPaymentRecord, completePaymentCreation, markPaymentCreationUnknown, failPaymentCreation } = require("./paymentCreationIdempotency");

// Префикс order_id покупок кредитов: по нему общий вебхук /billing/webhook
// различает подписки (pp-…) и пакеты кредитов (ppc-…).
const ORDER_PREFIX = "ppc";

function publicBase() {
  return String(process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || "")
    .trim()
    .replace(/\/+$/, "");
}

function frontendBase() {
  return (
    String(process.env.FRONTEND_URL || "https://pinposy.com")
      .split(",")[0]
      .trim()
      .replace(/\/+$/, "") || "https://pinposy.com"
  );
}

/**
 * POST /billing/credits  { package_id }
 * Создаёт pending-запись покупки и возвращает ссылку на оплату Prodamus.
 */
async function createCreditsPayment(userId, body, idempotencyKey) {
  const packageId = normalizePackId(body && body.package_id);
  if (!packageId) {
    throw httpError(422, "package_id: допустимые значения — pack_100, pack_500, pack_1000");
  }
  const currency = validateEnum(
    (body && body.currency) || "rub",
    ["rub"],
    "rub",
    "Валюта"
  );

  if (!prodamus.isConfigured()) {
    throw httpError(
      503,
      "Приём платежей не настроен: задайте PRODAMUS_SHOP_ID и PRODAMUS_SECRET в переменных окружения Render"
    );
  }

  const pack = CREDIT_PACKS[packageId];
  const amount = packAmount(packageId, currency);
  const intent = await beginPaymentCreation(userId, idempotencyKey, "credits", packageId, currency);
  if (!intent.started) return intent.result;

  let user;
  try {
    const result = await supabase
      .from("users")
      .select("id, email")
      .eq("id", userId)
      .single();
    if (result.error || !result.data) throw httpError(404, "Пользователь не найден");
    user = result.data;
  } catch (error) {
    await failPaymentCreation(userId, idempotencyKey, error);
    throw error;
  }

  const orderId = createPaymentOrderId(ORDER_PREFIX, packageId);
  let purchase;
  try {
    const result = await supabase
      .from("credit_purchases")
      .insert({
        user_id: String(userId),
        package_id: packageId,
        pack_title: pack.title,
        credits: pack.credits,
        status: "pending",
        provider_payment_id: orderId,
        amount,
        currency,
      })
      .select()
      .single();
    if (result.error || !result.data) throw result.error || new Error("credit purchase insert returned no row");
    purchase = result.data;
  } catch (error) {
    console.error("[credits-billing] не удалось создать покупку:", error.message, error.code || "");
    await failPaymentCreation(userId, idempotencyKey, error);
    throw httpError(
      500,
      "Не удалось создать покупку. Проверьте, что миграция 007 (db/migrations/007_credit_purchases.sql) применена."
    );
  }

  try {
    await attachPaymentCreationOrder(userId, idempotencyKey, orderId);
  } catch (error) {
    try {
      await denyUnsentPaymentRecord("credit_purchases", purchase.id);
    } catch (cleanupError) {
      console.error("[credits-billing] не удалось подтвердить отмену локальной записи без отправленного счёта:", {
        recordId: purchase.id,
        error: cleanupError && cleanupError.message,
      });
    }
    await failPaymentCreation(userId, idempotencyKey, error);
    console.error("[credits-billing] не удалось сохранить идентификатор заказа до обращения к провайдеру:", error.message);
    throw httpError(503, "Не удалось безопасно подготовить заказ. Счёт провайдеру не отправлялся; статус заказа требует проверки.");
  }

  const base = publicBase();
  let link;
  try {
    link = await prodamus.createPaymentLink({
      orderId,
      amount,
      currency,
      email: user.email,
      description: `PinPosy — пакет кредитов: ${pack.credits} кредитов (бессрочно)`,
      plan: packageId,
      urlNotification: base ? `${base}/billing/webhook` : undefined,
      urlSuccess: `${frontendBase()}/app?payment=success`,
    });
  } catch (error) {
    await markPaymentCreationUnknown(userId, idempotencyKey, error);
    console.error("[credits-billing] результат создания ссылки неопределён; повторный счёт заблокирован:", {
      purchaseId: purchase.id, orderId, error: error && error.message,
    });
    throw error;
  }

  const response = {
    ok: true,
    purchase_id: purchase.id,
    order_id: orderId,
    package_id: packageId,
    credits: pack.credits,
    amount,
    currency,
    payment_url: link.url,
    demo: prodamus.isDemo(),
  };
  try {
    await completePaymentCreation(userId, idempotencyKey, response);
  } catch (error) {
    await markPaymentCreationUnknown(userId, idempotencyKey, error);
    console.error("[credits-billing] checkout создан, но результат не удалось сохранить; повторный счёт заблокирован:", {
      purchaseId: purchase.id, orderId, error: error && error.message,
    });
    throw httpError(503, "Счёт создан, но не удалось сохранить ссылку. Не создавайте новый платёж; обратитесь в поддержку.");
  }
  return response;
}

async function handleCreditsWebhook(req, res, dependencies = {}) {
  const db = dependencies.supabase || supabase;
  const body = req.body || {};
  const check = prodamus.verifyWebhook(body, req.headers);

  if (!check.ok) {
    console.error(`[credits-billing] вебхук отклонён: ${check.reason}`);
    return res.status(403).json({ ok: false, error: `Подпись не принята: ${check.reason}` });
  }

  const orderId = String(body.order_id || "").trim();
  const status = String(body.payment_status || "").trim().toLowerCase();

  if (!orderId) {
    try {
      await persistWebhookException(db, {
        paymentKind: "credits", body, reason: "missing_order_id",
      });
    } catch (auditError) {
      console.error("[credits-billing] не удалось сохранить вебхук без order_id:", auditError.message);
      return res.status(500).json({ ok: false, error: "audit storage failed" });
    }
    console.error("[credits-billing] вебхук без order_id сохранён для сверки");
    return res.json({ ok: true, ignored: "no order_id" });
  }

  const { data: purchase, error } = await db
    .from("credit_purchases")
    .select("*")
    .eq("provider_payment_id", orderId)
    .maybeSingle();

  if (error) {
    console.error("[credits-billing] ошибка чтения credit_purchases:", error.message);
    return res.status(500).json({ ok: false, error: "db error" });
  }
  if (!purchase) {
    try {
      await persistWebhookException(db, {
        paymentKind: "credits", body, reason: "unknown_order_id",
      });
    } catch (auditError) {
      console.error("[credits-billing] не удалось сохранить неизвестный order_id:", auditError.message);
      return res.status(500).json({ ok: false, error: "audit storage failed" });
    }
    console.warn(`[credits-billing] неизвестный order_id сохранён для сверки: ${orderId}`);
    return res.json({ ok: true, ignored: "unknown order_id" });
  }

  const normalizedStatus = prodamus.normalizePaymentStatus(status);
  if (normalizedStatus !== "success") {
    if (!normalizedStatus) {
      try {
        await persistWebhookException(db, {
          paymentKind: "credits",
          body,
          expectedAmount: Number.isFinite(Number(purchase.amount))
            ? Number(purchase.amount)
            : null,
          reason: "unsupported_payment_status",
        });
      } catch (auditError) {
        console.error("[credits-billing] не удалось сохранить неизвестный статус:", auditError.message);
        return res.status(500).json({ ok: false, error: "audit storage failed" });
      }
      console.warn("[credits-billing] неизвестный статус Prodamus сохранён для сверки:", status || "(empty)");
      return res.json({ ok: true, ignored: "unsupported payment_status", review_required: true });
    }
    const mapped = normalizedStatus;
    const { error: statusError } = await db.from("credit_purchases")
      .update({ status: mapped }).eq("id", purchase.id)
      .is("balance_credited_at", null).neq("status", "success");
    if (statusError) return res.status(500).json({ ok: false, error: "db error" });
    return res.json({ ok: true, status: mapped });
  }

  const paymentAmount = prodamus.getWebhookPaymentAmount(body, purchase.currency || "rub");
  if (!paymentAmount.ok) {
    try {
      await persistWebhookException(db, {
        paymentKind: "credits", body,
        expectedAmount: Number.isFinite(Number(purchase.amount)) ? Number(purchase.amount) : null,
        reason: paymentAmount.reason,
      });
    } catch (auditError) {
      console.error("[credits-billing] не удалось сохранить несовпадение валюты/суммы:", auditError.message);
      return res.status(500).json({ ok: false, error: "audit storage failed" });
    }
    console.warn("[credits-billing] покупка отклонена для сверки:", orderId, paymentAmount.reason);
    return res.json({ ok: true, ignored: paymentAmount.reason, review_required: true });
  }

  const expected = Number(purchase.amount);
  const sum = paymentAmount.amount;
  if (!Number.isFinite(expected) || expected <= 0 || Math.abs(sum - expected) > 0.01) {
    try {
      await persistWebhookException(db, {
        paymentKind: "credits", body, expectedAmount: expected, reason: "amount_mismatch",
      });
    } catch (auditError) {
      console.error("[credits-billing] не удалось сохранить несовпадение суммы:", auditError.message);
      return res.status(500).json({ ok: false, error: "audit storage failed" });
    }
    console.error(`[credits-billing] сумма не совпадает для ${orderId}: webhook=${sum} ${paymentAmount.currency}, ожидали=${expected} ${purchase.currency || "rub"}; сохранено для сверки`);
    const { error: mismatchError } = await db.from("credit_purchases")
      .update({ status: "denied" }).eq("id", purchase.id)
      .is("balance_credited_at", null).neq("status", "success");
    if (mismatchError) return res.status(500).json({ ok: false, error: "db error" });
    return res.json({ ok: true, ignored: "amount mismatch", review_required: true });
  }

  // Validate every signed success callback, even after a prior credit, so a later
  // duplicate with an unexpected amount is still durably recorded for reconciliation.
  if (purchase.balance_credited_at) {
    return res.json({ ok: true, idempotent: true, credits: purchase.credits });
  }

  // Баланс, журнал и отметка покупки фиксируются в одной транзакции PostgreSQL.
  const paidAt = new Date().toISOString();
  const { data: newBalance, error: creditError } = await db.rpc("credit_paid_purchase", {
    p_purchase_id: purchase.id,
    p_paid_at: paidAt,
    p_description: `Пакет кредитов «${purchase.pack_title || purchase.package_id}» (+${purchase.credits}, не сгорают), заказ ${orderId}`,
  });
  if (creditError) {
    console.error("[credits-billing] атомарное зачисление не выполнено:", creditError.message);
    return res.status(500).json({ ok: false, error: "crediting failed" });
  }

  console.log(`[credits-billing] покупка ${orderId} обработана; баланс: ${newBalance}`);
  return res.json({ ok: true, status: "success", credits: purchase.credits, order_id: orderId });
}

/** История покупок кредитов пользователя (кабинет → «Тарифы» → «Кредиты») */
async function listUserCreditPurchases(userId, limit = 20) {
  const { data, error } = await supabase
    .from("credit_purchases")
    .select(
      "id, package_id, pack_title, credits, status, amount, currency, paid_at, balance_credited_at, created_at, provider_payment_id"
    )
    .eq("user_id", String(userId))
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw httpError(500, "Не удалось получить покупки — примените миграцию 007");
  }
  return data || [];
}

module.exports = {
  ORDER_PREFIX,
  createCreditsPayment,
  handleCreditsWebhook,
  listUserCreditPurchases,
};