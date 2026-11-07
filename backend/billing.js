// Биллинг: подписки через Prodamus (счёт по ссылке + вебхук об оплате).
// Таблица: subscriptions (db/migrations/006_subscriptions.sql)
// Документация Prodamus:
//   ссылки:  https://help.prodamus.ru/help_documentations_pf1/payform/tekhnicheskaya-dokumentaciya/sozdanie-platezhnoy-ssylki
//   вебхук:  https://help.prodamus.ru/help_documentations_pf1/payform/tekhnicheskaya-dokumentaciya/webhook-ob-oplate

const supabase = require("./supabase");
const mail = require("./mail");
const { getEmailCopy, getPlanTitle, getLocale } = require("./email-locales");
const prodamus = require("./prodamus");
const { persistWebhookException } = require("./billingWebhookAudit");
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

async function dispatchPendingSubscriptionEmails(limit = 10) {
  if (!mail.transactionalMailConfigured()) {
    return { skipped: true, reason: "smtp_not_configured", processed: 0 };
  }

  const { data: rows, error } = await supabase.rpc("claim_email_outbox", {
    p_limit: Math.max(1, Math.min(Number(limit) || 10, 50)),
  });
  if (error) throw error;

  let sent = 0;
  let failed = 0;
  for (const row of rows || []) {
    try {
      if (row.template_key !== "subscription_activated") {
        const templateError = new Error("Unsupported outbox template");
        templateError.code = "unsupported_template";
        throw templateError;
      }

      const payload = row.payload || {};
      const language = row.locale || "en";
      const copy = getEmailCopy(language);
      const paidPlanTitle = getPlanTitle(payload.paid_plan, language);
      const currentPlanTitle = getPlanTitle(payload.current_plan, language);
      const periodEnd = new Date(payload.period_end);
      if (!Number.isFinite(periodEnd.getTime())) {
        const payloadError = new Error("Invalid outbox period_end");
        payloadError.code = "invalid_payload";
        throw payloadError;
      }
      const until = new Intl.DateTimeFormat(getLocale(language), {
        day: "2-digit", month: "long", year: "numeric", timeZone: "UTC",
      }).format(periodEnd);
      const amount = `${Number(payload.amount).toFixed(2)} ${String(payload.currency || "rub").toUpperCase()}`;
      const subject = copy.activatedSubject.replace("{plan}", paidPlanTitle);
      const body = copy.activatedBody
        .replace("{plan}", paidPlanTitle)
        .replace("{currentPlan}", currentPlanTitle);

      await mail.sendMail({
        to: row.recipient_email,
        subject,
        messageId: `<pinposy-subscription-${row.subscription_id}@pinposy.com>`,
        text: [
          copy.hello, "", body, "",
          `${copy.amount}: ${amount}`,
          `${copy.payment}: ${payload.payment_reference || row.subscription_id}`,
          `${copy.validUntil}: ${until} (30 days)`,
          "", copy.next, "", copy.manage, copy.help, "", copy.team,
        ].join("\n"),
      });

      const { data: marked, error: markError } = await supabase.rpc("mark_email_outbox_sent", {
        p_id: row.id,
        p_claim_token: row.claim_token,
      });
      if (markError) throw markError;
      if (!marked) {
        console.warn("[billing] email outbox lease expired before sent acknowledgement:", row.id);
      } else {
        sent += 1;
      }
    } catch (sendError) {
      failed += 1;
      const rawCode = String(sendError && (sendError.code || sendError.name) || "smtp_error");
      const errorCode = /^[A-Za-z0-9_-]{1,80}$/.test(rawCode) ? rawCode : "smtp_error";
      const { error: retryError } = await supabase.rpc("retry_email_outbox", {
        p_id: row.id,
        p_claim_token: row.claim_token,
        p_error_code: errorCode,
      });
      if (retryError) {
        console.error("[billing] email outbox retry state could not be saved:", retryError.message);
      }
      console.error("[billing] queued subscription email failed:", row.id, errorCode);
    }
  }

  return { skipped: false, processed: (rows || []).length, sent, failed };
}

/**
 * POST /billing/webhook — уведомление Prodamus об оплате.
 * Формат: application/x-www-form-urlencoded, подпись в заголовке `Sign`.
 * Отвечаем 200 на всё, что успешно обработали или осознанно проигнорировали:
 * иначе Prodamus будет ретраить запрос.
 */
async function handleWebhook(req, res, dependencies = {}) {
  const db = dependencies.supabase || supabase;
  const dispatchEmails = dependencies.dispatchPendingSubscriptionEmails || dispatchPendingSubscriptionEmails;
  const body = req.body || {};
  const check = prodamus.verifyWebhook(body, req.headers);

  if (!check.ok) {
    console.error(`[billing] вебхук отклонён: ${check.reason}`);
    return res.status(403).json({ ok: false, error: `Подпись не принята: ${check.reason}` });
  }

  const orderId = String(body.order_id || "").trim();
  const status = String(body.payment_status || "").trim().toLowerCase();

  if (!orderId) {
    try {
      await persistWebhookException(db, {
        paymentKind: "subscription", body, reason: "missing_order_id",
      });
    } catch (auditError) {
      console.error("[billing] не удалось сохранить вебхук без order_id:", auditError.message);
      return res.status(500).json({ ok: false, error: "audit storage failed" });
    }
    console.error("[billing] вебхук без order_id сохранён для сверки");
    return res.json({ ok: true, ignored: "no order_id" });
  }

  const { data: sub, error } = await db
    .from("subscriptions")
    .select("*")
    .eq("provider_payment_id", orderId)
    .maybeSingle();

  if (error) {
    console.error("[billing] ошибка чтения subscriptions:", error.message);
    return res.status(500).json({ ok: false, error: "db error" });
  }
  if (!sub) {
    try {
      await persistWebhookException(db, {
        paymentKind: "subscription", body, reason: "unknown_order_id",
      });
    } catch (auditError) {
      console.error("[billing] не удалось сохранить неизвестный order_id:", auditError.message);
      return res.status(500).json({ ok: false, error: "audit storage failed" });
    }
    console.warn(`[billing] неизвестный order_id сохранён для сверки: ${orderId}`);
    return res.json({ ok: true, ignored: "unknown order_id" });
  }

  const normalizedStatus = prodamus.normalizePaymentStatus(status);
  if (normalizedStatus !== "success") {
    if (!normalizedStatus) {
      try {
        await persistWebhookException(db, {
          paymentKind: "subscription",
          body,
          expectedAmount: Number.isFinite(Number(sub.amount))
            ? Number(sub.amount)
            : null,
          reason: "unsupported_payment_status",
        });
      } catch (auditError) {
        console.error("[billing] не удалось сохранить неизвестный статус:", auditError.message);
        return res.status(500).json({ ok: false, error: "audit storage failed" });
      }
      console.warn("[billing] неизвестный статус Prodamus сохранён для сверки:", status || "(empty)");
      return res.json({ ok: true, ignored: "unsupported payment_status", review_required: true });
    }
    const mapped = normalizedStatus;
    const { error: statusError } = await db.from("subscriptions")
      .update({ status: mapped }).eq("id", sub.id).neq("status", "success");
    if (statusError) return res.status(500).json({ ok: false, error: "db error" });
    console.warn(`[billing] платёж ${orderId}: ${status} (${body.payment_status_description || ""})`);
    return res.json({ ok: true, status: mapped });
  }

  const paymentAmount = prodamus.getWebhookPaymentAmount(body, sub.currency || "rub");
  if (!paymentAmount.ok) {
    try {
      await persistWebhookException(db, {
        paymentKind: "subscription", body,
        expectedAmount: Number.isFinite(Number(sub.amount)) ? Number(sub.amount) : null,
        reason: paymentAmount.reason,
      });
    } catch (auditError) {
      console.error("[billing] не удалось сохранить несовпадение валюты/суммы:", auditError.message);
      return res.status(500).json({ ok: false, error: "audit storage failed" });
    }
    console.warn("[billing] платёж отклонён для сверки:", orderId, paymentAmount.reason);
    return res.json({ ok: true, ignored: paymentAmount.reason, review_required: true });
  }

  const expected = Number(sub.amount);
  const sum = paymentAmount.amount;
  if (!Number.isFinite(expected) || expected <= 0 || Math.abs(sum - expected) > 0.01) {
    try {
      await persistWebhookException(db, {
        paymentKind: "subscription", body, expectedAmount: expected, reason: "amount_mismatch",
      });
    } catch (auditError) {
      console.error("[billing] не удалось сохранить несовпадение суммы:", auditError.message);
      return res.status(500).json({ ok: false, error: "audit storage failed" });
    }
    console.error(`[billing] сумма не совпадает для ${orderId}: webhook=${sum} ${paymentAmount.currency}, ожидали=${expected} ${sub.currency || "rub"}; сохранено для сверки`);
    const { error: mismatchError } = await db.from("subscriptions")
      .update({ status: "denied" }).eq("id", sub.id).neq("status", "success");
    if (mismatchError) return res.status(500).json({ ok: false, error: "db error" });
    return res.json({ ok: true, ignored: "amount mismatch", review_required: true });
  }

  // Подписка, период и тариф пользователя активируются одной транзакцией PostgreSQL.
  const { data: activation, error: activationError } = await db.rpc("activate_paid_subscription", {
    p_subscription_id: sub.id,
    p_paid_at: new Date().toISOString(),
  });
  if (activationError || !activation) {
    console.error("[billing] атомарная активация не выполнена:", activationError && activationError.message);
    return res.status(500).json({ ok: false, error: "activation failed" });
  }

  // Also drain older pending events on duplicate callbacks: a previous process may
  // have committed activation and stopped before SMTP delivery.
  await dispatchEmails(10).catch((e) => {
    console.error("[billing] email outbox dispatch failed:", e && e.message);
  });

  return res.json({
    ok: true,
    status: "success",
    plan: activation.current_plan || activation.plan,
    paid_plan: activation.plan,
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
  dispatchPendingSubscriptionEmails,
};
