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
const { httpError, validateEnum } = require("./validate");
const { CREDIT_PACKS, normalizePackId, packAmount } = require("./creditPacks");
const { adjustBalance } = require("./credits");

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
async function createCreditsPayment(userId, body) {
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

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, email")
    .eq("id", userId)
    .single();
  if (userError || !user) throw httpError(404, "Пользователь не найден");

  const pack = CREDIT_PACKS[packageId];
  const amount = packAmount(packageId, currency); // сумма из серверного каталога
  const orderId = `${ORDER_PREFIX}-${packageId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. Пишем покупку как pending: источник правды и ключ идемпотентности.
  const { data: purchase, error: insertError } = await supabase
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

  if (insertError) {
    console.error(
      "[credits-billing] не удалось создать покупку:",
      insertError.message,
      insertError.code || ""
    );
    throw httpError(
      500,
      "Не удалось создать покупку. Проверьте, что миграция 007 (db/migrations/007_credit_purchases.sql) применена."
    );
  }

  // 2. Просим у Prodamus ссылку на оплату
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
      urlReturn: `${frontendBase()}/app?payment=success`,
    });
  } catch (e) {
    // Ссылка не создана — помечаем строку, чтобы не копить «вечные pending»
    await supabase
      .from("credit_purchases")
      .update({ status: "denied" })
      .eq("id", purchase.id)
      .then(() => {}, () => {});
    throw e;
  }

  return {
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
}

/**
 * POST /billing/webhook(-credits) — уведомление Prodamus об оплате пакета.
 * Формат и проверка подписи — те же, что у подписок (billing.handleWebhook).
 *
 * Идемпотентность: зачисление баланса выполняется только при переходе
 * статуса pending → success (условный UPDATE с проверкой старого статуса).
 * Повторный вебхук по уже оплаченному заказу ничего не зачисляет.
 */
async function handleCreditsWebhook(req, res) {
  const body = req.body || {};
  const check = prodamus.verifyWebhook(body, req.headers);

  if (!check.ok) {
    console.error(`[credits-billing] вебхук отклонён: ${check.reason}`);
    return res.status(403).json({ ok: false, error: `Подпись не принята: ${check.reason}` });
  }

  const orderId = String(body.order_id || "").trim();
  const status = String(body.payment_status || "").trim().toLowerCase();
  const sum = body.sum != null ? Number(body.sum) : null;

  if (!orderId) {
    console.error("[credits-billing] вебхук без order_id");
    return res.json({ ok: true, ignored: "no order_id" });
  }

  const { data: purchase, error } = await supabase
    .from("credit_purchases")
    .select("*")
    .eq("provider_payment_id", orderId)
    .maybeSingle();

  if (error) {
    console.error("[credits-billing] ошибка чтения credit_purchases:", error.message);
    return res.status(500).json({ ok: false, error: "db error" });
  }
  if (!purchase) {
    console.warn(`[credits-billing] неизвестный order_id: ${orderId}`);
    return res.json({ ok: true, ignored: "unknown order_id" });
  }

  // Идемпотентность: повторный success по уже зачисленной покупке ничего не меняет
  if (purchase.status === "success" && status === "success") {
    return res.json({ ok: true, idempotent: true, credits: purchase.credits });
  }

  if (status !== "success") {
    const mapped = status === "order_canceled" ? "canceled" : "denied";
    await supabase.from("credit_purchases").update({ status: mapped }).eq("id", purchase.id);
    console.warn(
      `[credits-billing] платёж ${orderId}: ${status} (${body.payment_status_description || ""})`
    );
    return res.json({ ok: true, status: mapped });
  }

  // Проверка суммы: вебхук с другой суммой фиксируем, но не зачисляем молча
  const expected = Number(purchase.amount);
  if (sum != null && Number.isFinite(sum) && Math.abs(sum - expected) > 0.01) {
    console.error(
      `[credits-billing] сумма не совпадает для ${orderId}: webhook=${sum}, ожидали=${expected}`
    );
    await supabase.from("credit_purchases").update({ status: "denied" }).eq("id", purchase.id);
    return res.json({ ok: true, ignored: "amount mismatch" });
  }

  // Критическая секция: помечаем оплаченной ТОЛЬКО из pending.
  // Условный UPDATE возвращает изменённые строки: 0 — значит, зачисление уже
  // выполнено (или статус изменён) — второй раз баланс не трогаем.
  const paidAt = new Date().toISOString();
  const { data: activated, error: activateError } = await supabase
    .from("credit_purchases")
    .update({ status: "success", paid_at: paidAt })
    .eq("id", purchase.id)
    // Разрешённые исходные статусы: pending (обычный случай) и denied
    // (например, повтор вебхука с правильной суммой после расхождения сумм).
    // 'success' источником быть не может — поэтому двойного зачисления не бывает.
    .in("status", ["pending", "denied"])
    .select();

  if (activateError) {
    console.error("[credits-billing] не удалось пометить покупку оплаченной:", activateError.message);
    return res.status(500).json({ ok: false, error: "db error" });
  }
  if (!activated || activated.length === 0) {
    // Кто-то уже провёл этот заказ (параллельный/повторный вебхук) — ничего не начисляем
    console.log(`[credits-billing] ${orderId}: статус уже изменён, зачисление пропущено`);
    return res.json({ ok: true, idempotent: true, credits: purchase.credits });
  }

  // Зачисляем «вечные» кредиты на баланс (transaction: credit_transactions type=topup)
  try {
    const newBalance = await adjustBalance(
      purchase.user_id,
      purchase.credits,
      "topup",
      `Пакет кредитов «${purchase.pack_title || purchase.package_id}» (+${purchase.credits}, не сгорают), заказ ${orderId}`
    );
    console.log(
      `[credits-billing] +${purchase.credits} кредитов зачислено пользователю ${purchase.user_id}, баланс: ${newBalance}`
    );
  } catch (e) {
    // Кредиты не зачислены — откатываем статус, чтобы Prodamus повторил вебхук
    console.error("[credits-billing] не удалось зачислить кредиты:", e && e.message);
    await supabase
      .from("credit_purchases")
      .update({ status: "pending", paid_at: null })
      .eq("id", purchase.id)
      .then(() => {}, () => {});
    return res.status(500).json({ ok: false, error: "balance update failed" });
  }

  const { error: creditedError } = await supabase
    .from("credit_purchases")
    .update({ balance_credited_at: paidAt })
    .eq("id", purchase.id);
  if (creditedError) {
    // Кредиты уже зачислены, отметка вторична — не ломаем вебхук
    console.error("[credits-billing] не удалось записать balance_credited_at:", creditedError.message);
  }

  return res.json({
    ok: true,
    status: "success",
    credits: purchase.credits,
    order_id: orderId,
  });
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