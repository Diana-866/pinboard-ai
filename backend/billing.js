// Биллинг: подписки через Prodamus (счёт по ссылке + вебхук об оплате).
// Таблица: subscriptions (db/migrations/006_subscriptions.sql)
// Документация Prodamus:
//   ссылки:  https://help.prodamus.ru/help_documentations_pf1/payform/tekhnicheskaya-dokumentaciya/sozdanie-platezhnoy-ssylki
//   вебхук:  https://help.prodamus.ru/help_documentations_pf1/payform/tekhnicheskaya-dokumentaciya/webhook-ob-oplate

const supabase = require("./supabase");
const mail = require("./mail");
const prodamus = require("./prodamus");
const { httpError, validateEnum } = require("./validate");
const { normalizePlan } = require("./tariff");

// Каталог тарифов: цены те же, что на лендинге и в PricingView.
const PLANS = {
  analytics: { rub: 990, usd: 11.9, title: "Аналитика" },
  start: { rub: 1990, usd: 24.0, title: "Старт" },
  pro: { rub: 4990, usd: 60.1, title: "Про" },
  agency: { rub: 12990, usd: 156.5, title: "Agency" },
};

const PERIOD_DAYS = 30;

function planCatalog() {
  return Object.entries(PLANS).map(([id, p]) => ({
    id,
    title: p.title,
    amount: { rub: p.rub, usd: p.usd },
  }));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function publicBase() {
  // Публичный адрес бэкенда на Render — нужен для urlNotification (вебхук обратно к нам)
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
 * POST /billing/create-payment  { plan, currency }
 * Создаёт запись платежа в статусе pending и возвращает ссылку на оплату Prodamus.
 */
async function createPayment(userId, body) {
  const plan = normalizePlan(body && body.plan);
  if (!PLANS[plan]) {
    throw httpError(422, "plan: допустимые значения — analytics, start, pro, agency");
  }
  const currency = validateEnum(
    body && body.currency,
    ["rub", "usd"],
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

  const amount = PLANS[plan][currency];
  const orderId = `pp-${plan}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. Пишем платёж как pending: это наш источник правды и ключ идемпотентности.
  const { data: sub, error: insertError } = await supabase
    .from("subscriptions")
    .insert({
      user_id: String(userId),
      plan,
      status: "pending",
      provider_payment_id: orderId,
      amount,
      currency,
    })
    .select()
    .single();

  if (insertError) {
    console.error("[billing] не удалось создать платёж:", insertError.message, insertError.code || "");
    throw httpError(
      500,
      "Не удалось создать платёж. Проверьте, что миграция 006 (db/migrations/006_subscriptions.sql) применена."
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
      description: `PinPosy — тариф «${PLANS[plan].title}», 30 дней`,
      plan,
      urlNotification: base ? `${base}/billing/webhook` : undefined,
      urlSuccess: `${frontendBase()}/app?payment=success`,
    });
  } catch (e) {
    // Платёж не выставлен — помечаем строку, чтобы не мусорить в админке «вечными pending»
    await supabase
      .from("subscriptions")
      .update({ status: "denied" })
      .eq("id", sub.id)
      .then(() => {}, () => {});
    throw e;
  }

  return {
    ok: true,
    subscription_id: sub.id,
    order_id: orderId,
    plan,
    amount,
    currency,
    payment_url: link.url,
    demo: prodamus.isDemo(),
  };
}

async function sendTariffActivatedEmail(user, sub, periodEnd) {
  const planTitle = PLANS[sub.plan] ? PLANS[sub.plan].title : sub.plan;
  const until = new Date(periodEnd).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const amount = `${Number(sub.amount).toFixed(2)} ${String(sub.currency || "rub").toUpperCase()}`;

  await mail.sendMail(
    {
      to: user.email,
      subject: `PinPosy — тариф «${planTitle}» активирован`,
      text:
        `Здравствуйте!\n\n` +
        `Оплата получена, тариф «${planTitle}» активирован.\n\n` +
        `Сумма: ${amount}\n` +
        `Номер платежа: ${sub.provider_payment_id}\n` +
        `Тариф действует до: ${until} (30 дней)\n\n` +
        `Что дальше: войдите в кабинет https://pinposy.com/app — замочки на генерации, досках ` +
        `и планировщике сняты, кредиты тарифа уже на балансе.\n\n` +
        `Продлить или сменить тариф можно в разделе «Тарифы». Если оплата не отобразилась в течение ` +
        `10 минут — ответьте на это письмо, мы проверим платёж вручную.\n\n` +
        `— команда PinPosy`,
    },
    { needThrow: false }
  );
}

/**
 * POST /billing/webhook — уведомление Prodamus об оплате.
 * Формат: application/x-www-form-urlencoded, подпись в заголовке `Sign`.
 * Отвечаем 200 на всё, что успешно обработали или осознанно проигнорировали:
 * иначе Prodamus будет ретраить запрос.
 */
async function handleWebhook(req, res) {
  const body = req.body || {};
  const check = prodamus.verifyWebhook(body, req.headers);

  if (!check.ok) {
    console.error(`[billing] вебхук отклонён: ${check.reason}`);
    return res.status(403).json({ ok: false, error: `Подпись не принята: ${check.reason}` });
  }

  const orderId = String(body.order_id || "").trim();
  const status = String(body.payment_status || "").trim().toLowerCase();
  const sum = body.sum != null ? Number(body.sum) : null;

  if (!orderId) {
    console.error("[billing] вебхук без order_id");
    return res.json({ ok: true, ignored: "no order_id" });
  }

  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("provider_payment_id", orderId)
    .maybeSingle();

  if (error) {
    console.error("[billing] ошибка чтения subscriptions:", error.message);
    return res.status(500).json({ ok: false, error: "db error" });
  }
  if (!sub) {
    // Чужой/неизвестный заказ: повтор запроса не поможет, поэтому 200 + лог.
    console.warn(`[billing] неизвестный order_id: ${orderId}`);
    return res.json({ ok: true, ignored: "unknown order_id" });
  }

  if (status !== "success") {
    if (status !== "order_canceled" && status !== "order_denied") {
      console.warn("[billing] неизвестный статус Prodamus:", status || "(empty)");
      return res.json({ ok: true, ignored: "unsupported payment_status" });
    }
    const mapped = status === "order_canceled" ? "canceled" : "denied";
    const { error: statusError } = await supabase.from("subscriptions")
      .update({ status: mapped }).eq("id", sub.id).neq("status", "success");
    if (statusError) return res.status(500).json({ ok: false, error: "db error" });
    console.warn(`[billing] платёж ${orderId}: ${status} (${body.payment_status_description || ""})`);
    return res.json({ ok: true, status: mapped });
  }

  const expected = Number(sub.amount);
  if (sum == null || !Number.isFinite(sum) || Math.abs(sum - expected) > 0.01) {
    console.error(`[billing] сумма не совпадает для ${orderId}: webhook=${body.sum}, ожидали=${expected}`);
    const { error: mismatchError } = await supabase.from("subscriptions")
      .update({ status: "denied" }).eq("id", sub.id).neq("status", "success");
    if (mismatchError) return res.status(500).json({ ok: false, error: "db error" });
    return res.json({ ok: true, ignored: "amount mismatch" });
  }

  // Подписка, период и тариф пользователя активируются одной транзакцией PostgreSQL.
  const { data: activation, error: activationError } = await supabase.rpc("activate_paid_subscription", {
    p_subscription_id: sub.id,
    p_paid_at: new Date().toISOString(),
  });
  if (activationError || !activation) {
    console.error("[billing] атомарная активация не выполнена:", activationError && activationError.message);
    return res.status(500).json({ ok: false, error: "activation failed" });
  }

  if (!activation.already_activated) {
    sendTariffActivatedEmail(
      { email: activation.email }, { ...sub, amount: sum }, activation.period_end
    ).catch((e) => console.error("[billing] письмо о тарифе не отправлено:", e && e.message));
  }

  return res.json({
    ok: true,
    status: "success",
    plan: activation.plan,
    period_end: activation.period_end,
    idempotent: activation.already_activated,
  });
}

// Список подписок пользователя (для кабинета)
async function listUserSubscriptions(userId, limit = 20) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, plan, status, amount, currency, period_start, period_end, created_at, provider_payment_id")
    .eq("user_id", String(userId))
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw httpError(500, "Не удалось получить подписки — примените миграцию 006");
  return data || [];
}

// Список подписок для админки: подписки + email пользователей одним проходом
async function listAllSubscriptions(limit = 100) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, user_id, plan, status, amount, currency, period_start, period_end, created_at, provider_payment_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw httpError(500, "Не удалось получить подписки — примените миграцию 006");

  const rows = data || [];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  let emails = {};
  if (ids.length > 0) {
    const { data: users } = await supabase.from("users").select("id, email").in("id", ids);
    (users || []).forEach((u) => {
      emails[String(u.id)] = u.email;
    });
  }

  const totals = rows.reduce(
    (acc, r) => {
      if (r.status === "success") {
        acc.paidCount += 1;
        acc.paidAmount += Number(r.amount) || 0;
      }
      if (r.status === "pending") acc.pendingCount += 1;
      return acc;
    },
    { paidCount: 0, paidAmount: 0, pendingCount: 0 }
  );

  return {
    totals,
    subscriptions: rows.map((r) => ({ ...r, email: emails[String(r.user_id)] || null })),
  };
}

module.exports = {
  PLANS,
  planCatalog,
  createPayment,
  handleWebhook,
  listUserSubscriptions,
  listAllSubscriptions,
};
