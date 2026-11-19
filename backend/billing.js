const { logError, logWarning } = require("./safeLogger");
// Биллинг: подписки через Prodamus (счёт по ссылке + вебхук об оплате).
// Таблица: subscriptions (db/migrations/006_subscriptions.sql)
// Документация Prodamus:
//   ссылки:  https://help.prodamus.ru/help_documentations_pf1/payform/tekhnicheskaya-dokumentaciya/sozdanie-platezhnoy-ssylki
//   вебхук:  https://help.prodamus.ru/help_documentations_pf1/payform/tekhnicheskaya-dokumentaciya/webhook-ob-oplate

const supabase = require("./supabase");
const mail = require("./mail");
const { getEmailCopy, getPlanTitle, getLocale } = require("./email-locales");
const prodamus = require("./prodamus");
const { createPaymentOrderId } = require("./paymentOrderId");
const { beginPaymentCreation, attachPaymentCreationOrder, denyUnsentPaymentRecord, completePaymentCreation, settlePaymentCreationRequest, markPaymentCreationUnknown, failPaymentCreation, handlePaymentProviderFailure } = require("./paymentCreationIdempotency");
const { persistWebhookException } = require("./billingWebhookAudit");
const { persistProviderReceipt, setProviderDecision } = require("./paymentProviderReceipts");
const { httpError, validateEnum } = require("./validate");
const { paymentLinkNotSaved, paymentOrderPreparationFailed } = require("./paymentErrors");
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
async function createPayment(userId, body, idempotencyKey) {
  const plan = normalizePlan(body && body.plan);
  // Own property only: PLANS is an object literal, so `!PLANS[plan]` also accepted every member
  // of Object.prototype. `plan: "constructor"` then produced `amount = undefined`, the order row
  // fell back to the column default 0, and the provider's refusal parked the customer's request
  // as unknown - a dead end for a plan that does not exist.
  if (!Object.prototype.hasOwnProperty.call(PLANS, plan)) {
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

  const amount = PLANS[plan][currency];
  const notificationBase = publicBase();
  const notificationUrl = notificationBase ? notificationBase + "/billing/webhook" : undefined;
  if (String(process.env.PRODAMUS_SYS || "").trim() && notificationUrl) {
    // Validate configuration before reserving an idempotency key or creating a local order.
    prodamus.validateWebhookNotificationUrl(notificationUrl);
  }
  const intent = await beginPaymentCreation(userId, idempotencyKey, "subscription", plan, currency);
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

  const orderId = createPaymentOrderId("pp", plan);
  let sub;
  try {
    const result = await supabase
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
    if (result.error || !result.data) throw result.error || new Error("subscription insert returned no row");
    sub = result.data;
  } catch (error) {
    logError("billing.event_001");
    await failPaymentCreation(userId, idempotencyKey, error);
    throw httpError(
      500,
      "Не удалось создать платёж. Проверьте, что миграция 006 (db/migrations/006_subscriptions.sql) применена."
    );
  }

  try {
    await attachPaymentCreationOrder(userId, idempotencyKey, orderId);
  } catch (error) {
    let cleanupConfirmed = false;
    try {
      await denyUnsentPaymentRecord("subscriptions", sub.id);
      cleanupConfirmed = true;
    } catch (cleanupError) {
      logError("billing.event_002");
      // Keep this request in the admin reconciliation queue if local cleanup failed.
      await markPaymentCreationUnknown(userId, idempotencyKey, cleanupError);
    }
    if (cleanupConfirmed) {
      await failPaymentCreation(userId, idempotencyKey, error);
    }
    logError("billing.event_003");
    throw paymentOrderPreparationFailed();
  }

  let link;
  try {
    link = await prodamus.createPaymentLink({
      orderId,
      amount,
      currency,
      email: user.email,
      description: `PinPosy — тариф «${PLANS[plan].title}», 30 дней`,
      plan,
      urlNotification: notificationUrl,
      urlSuccess: `${frontendBase()}/app?payment=success`,
    });
  } catch (error) {
    await handlePaymentProviderFailure(userId, idempotencyKey, "subscriptions", sub.id, error);
    logError("billing.event_004");
    throw error;
  }

  const response = {
    ok: true,
    subscription_id: sub.id,
    order_id: orderId,
    plan,
    amount,
    currency,
    payment_url: link.url,
    demo: prodamus.isDemo(),
  };
  try {
    await completePaymentCreation(userId, idempotencyKey, response);
  } catch (error) {
    await markPaymentCreationUnknown(userId, idempotencyKey, error);
    logError("billing.event_005");
    throw paymentLinkNotSaved();
  }
  return response;
}

function isValidEmailOutboxClaimRows(rows, limit = 10) {
  if (!Array.isArray(rows) || !Number.isSafeInteger(limit) || limit < 1 || limit > 50 || rows.length > limit) return false;
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    if (typeof row.id !== "string" || !row.id.trim() ||
        typeof row.claim_token !== "string" || !row.claim_token.trim() ||
        typeof row.subscription_id !== "string" || !row.subscription_id.trim() ||
        typeof row.recipient_email !== "string" || !row.recipient_email.trim() ||
        typeof row.template_key !== "string" || !row.template_key.trim() ||
        !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return false;
    if (ids.has(row.id)) return false;
    ids.add(row.id);
  }
  return true;
}

async function dispatchPendingSubscriptionEmails(limit = 10, dependencies = {}) {
  const db = dependencies.supabase || supabase;
  const mailer = dependencies.mail || mail;
  if (!mailer.transactionalMailConfigured()) {
    return { skipped: true, reason: "smtp_not_configured", processed: 0 };
  }

  const claimLimit = Math.max(1, Math.min(Math.trunc(Number(limit) || 10), 50));
  const { data: rows, error } = await db.rpc("claim_email_outbox", {
    p_limit: claimLimit,
  });
  if (error) throw error;
  // A valid empty claim is []; null or malformed RPC data must not look like an idle queue.
  // Validate the entire batch before sending any email.
  if (!isValidEmailOutboxClaimRows(rows, claimLimit)) {
    throw new Error("Email outbox claim RPC returned an invalid batch");
  }

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
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
      // new Date(null) and new Date(0) are the epoch and perfectly finite, so a missing period end
      // used to render as "access valid until 01 January 1970" in a paying customer's email.
      if (!Number.isFinite(periodEnd.getTime()) || periodEnd.getTime() <= 0) {
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

      await mailer.sendMail({
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

      const { data: marked, error: markError } = await db.rpc("mark_email_outbox_sent", {
        p_id: row.id,
        p_claim_token: row.claim_token,
      });
      if (markError) throw markError;
      if (!marked) {
        logWarning("billing.event_006");
      } else {
        sent += 1;
      }
    } catch (sendError) {
      failed += 1;
      const rawCode = String(sendError && (sendError.code || sendError.name) || "smtp_error");
      const errorCode = /^[A-Za-z0-9_-]{1,80}$/.test(rawCode) ? rawCode : "smtp_error";
      const { error: retryError } = await db.rpc("retry_email_outbox", {
        p_id: row.id,
        p_claim_token: row.claim_token,
        p_error_code: errorCode,
      });
      if (retryError) {
        logError("billing.event_007");
      }
      logError("billing.event_008");
    }
  }

  return { skipped: false, processed: rows.length, sent, failed };
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
    logError("billing.event_009");
    return res.status(403).json({ ok: false, error: `Подпись не принята: ${check.reason}` });
  }

  // A verified provider fact must be durable before order lookup or entitlement work.
  let receiptId;
  try {
    const receipt = await persistProviderReceipt(db, { paymentKind: "subscription", body });
    receiptId = receipt.receiptId;
  } catch (receiptError) {
    logError("billing.event_025");
    return res.status(500).json({ ok: false, error: "receipt storage failed" });
  }

  if (prodamus.isDemoWebhookBlocked()) {
    // A demo payment form on a production deployment must never activate a plan.
    logError("billing.event_010");
    return res.status(503).json({ ok: false, error: "demo payments are disabled in production" });
  }

  const orderId = String(body.order_id || "").trim();
  const status = String(body.payment_status || "").trim().toLowerCase();

  if (!orderId) {
    try {
      await persistWebhookException(db, {
        paymentKind: "subscription", body, reason: "missing_order_id",
      });
      await setProviderDecision(db, { receiptId, decision: "unmatched", reasonCode: "missing_order_id" });
    } catch (auditError) {
      logError("billing.event_010");
      return res.status(500).json({ ok: false, error: "audit storage failed" });
    }
    logError("billing.event_011");
    return res.json({ ok: true, ignored: "no order_id" });
  }

  const { data: sub, error } = await db
    .from("subscriptions")
    .select("*")
    .eq("provider_payment_id", orderId)
    .maybeSingle();

  if (error) {
    logError("billing.event_012");
    return res.status(500).json({ ok: false, error: "db error" });
  }
  if (!sub) {
    try {
      await persistWebhookException(db, {
        paymentKind: "subscription", body, reason: "unknown_order_id",
      });
      await setProviderDecision(db, { receiptId, decision: "unmatched", reasonCode: "unknown_order_id" });
    } catch (auditError) {
      logError("billing.event_013");
      return res.status(500).json({ ok: false, error: "audit storage failed" });
    }
    logWarning("billing.event_014");
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
        await setProviderDecision(db, { receiptId, decision: "pending_review", reasonCode: "unsupported_payment_status" });
      } catch (auditError) {
        logError("billing.event_015");
        return res.status(500).json({ ok: false, error: "audit storage failed" });
      }
      logWarning("billing.event_016");
      return res.json({ ok: true, ignored: "unsupported payment_status", review_required: true });
    }
    const mapped = normalizedStatus;
    try {
      await setProviderDecision(db, {
        receiptId, decision: "ignored_non_success", reasonCode: "provider_payment_not_success",
        paymentKind: "subscription", paymentId: sub.id, userId: sub.user_id,
      });
    } catch (decisionError) {
      logError("billing.event_028");
      return res.status(500).json({ ok: false, error: "decision storage failed" });
    }
    const { error: statusError } = await db.from("subscriptions")
      .update({ status: mapped }).eq("id", sub.id).neq("status", "success");
    if (statusError) return res.status(500).json({ ok: false, error: "db error" });
    logWarning("billing.event_017");
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
      await setProviderDecision(db, {
        receiptId, decision: "rejected_mismatch", reasonCode: "invalid_payment_amount",
        paymentKind: "subscription", paymentId: sub.id, userId: sub.user_id,
      });
      
    } catch (auditError) {
      logError("billing.event_018");
      return res.status(500).json({ ok: false, error: "audit storage failed" });
    }
    logWarning("billing.event_019");
    return res.json({ ok: true, ignored: paymentAmount.reason, review_required: true });
  }

  const expected = Number(sub.amount);
  const sum = paymentAmount.amount;
  if (!Number.isFinite(expected) || expected <= 0 || Math.abs(sum - expected) > 0.01) {
    try {
      await persistWebhookException(db, {
        paymentKind: "subscription", body, expectedAmount: expected, reason: "amount_mismatch",
      });
      await setProviderDecision(db, {
        receiptId, decision: "rejected_mismatch", reasonCode: "amount_mismatch",
        paymentKind: "subscription", paymentId: sub.id, userId: sub.user_id,
      });
    } catch (auditError) {
      logError("billing.event_020");
      return res.status(500).json({ ok: false, error: "audit storage failed" });
    }
    logError("billing.event_021");
    const { error: mismatchError } = await db.from("subscriptions")
      .update({ status: "denied" }).eq("id", sub.id).neq("status", "success");
    if (mismatchError) return res.status(500).json({ ok: false, error: "db error" });
    return res.json({ ok: true, ignored: "amount mismatch", review_required: true });
  }

  // Подписка, период и тариф пользователя активируются одной транзакцией PostgreSQL.
  const { data: activation, error: activationError } = await db.rpc("activate_paid_subscription_with_receipt", {
    p_subscription_id: sub.id,
    p_paid_at: new Date().toISOString(),
    p_receipt_id: receiptId,
  });
  if (activationError || !activation) {
    if (activationError && /not active|account lifecycle/i.test(String(activationError.message || ""))) {
      try {
        await setProviderDecision(db, {
          receiptId, decision: "withheld_account_lifecycle", reasonCode: "account_not_active",
          paymentKind: "subscription", paymentId: sub.id, userId: sub.user_id,
        });
      } catch (decisionError) {
        logError("billing.event_026");
        return res.status(500).json({ ok: false, error: "decision storage failed" });
      }
    }
    logError("billing.event_022");
    return res.status(500).json({ ok: false, error: "activation failed" });
  }

  if (activation.decision === "withheld_account_lifecycle" ||
      activation.decision === "rejected_mismatch") {
    return res.json({
      ok: true,
      status: "success",
      decision: activation.decision,
      review_required: true,
    });
  }
  if (activation.decision !== "granted") {
    logError("billing.event_027");
    return res.status(500).json({ ok: false, error: "invalid fulfillment decision" });
  }

  // Close the matching checkout idempotency record only after the atomic
  // subscription activation has committed. A missing record is a legacy order.
  try {
    await settlePaymentCreationRequest(orderId, "subscription", sub.id, db);
  } catch (settlementError) {
    logError("billing.event_023");
    return res.status(500).json({ ok: false, error: "payment reconciliation failed" });
  }

  // Also drain older pending events on duplicate callbacks: a previous process may
  // have committed activation and stopped before SMTP delivery.
  await dispatchEmails(10).catch((e) => {
    logError("billing.event_024");
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


const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Puts one dead transactional email back into the queue (migration 165).
 *
 * The outbox retries with backoff and then marks a row dead; until now that was the end of the line,
 * so a paying customer whose activation email died was simply never told. This is the operator's only
 * supported way back, and it is deliberately narrow: one row, chosen by id, only from 'dead'.
 *
 * The database decides what is requeueable and reports why it refused; this layer must not turn a
 * refusal into a success, because the operator would then believe an email is on its way.
 */
async function requeueEmailOutbox(id, dependencies = {}) {
  const db = dependencies.supabase || supabase;
  const rowId = typeof id === "string" ? id.trim() : "";
  if (!UUID_PATTERN.test(rowId)) {
    throw httpError(422, "Укажите корректный идентификатор письма");
  }

  const { data, error } = await db.rpc("requeue_email_outbox", { p_id: rowId });
  if (error) {
    // A deployment where migration 165 has not run yet must say so: the operator is asking for a
    // recovery action, and a generic failure would be indistinguishable from a real one.
    const missing = error.code === "PGRST202" || error.code === "42883"
      || /could not find the function|does not exist/i.test(String(error.message || ""));
    if (missing) {
      logError("billing.event_029");
      throw httpError(503, "Переотправка писем недоступна: примените миграцию 165");
    }
    logError("billing.event_030");
    throw httpError(503, "Не удалось поставить письмо в очередь — попробуйте позже");
  }

  const result = data && typeof data === "object" ? data : {};
  if (result.requeued !== true) {
    const reason = typeof result.reason === "string" ? result.reason : "unknown";
    // Every refusal is a conflict with the current state, not a client mistake in the request.
    const refusal = httpError(409, `Письмо не поставлено в очередь (${reason})`);
    refusal.details = {
      code: "email_not_requeueable",
      reason,
      status: typeof result.status === "string" ? result.status : null,
    };
    throw refusal;
  }

  return {
    requeued: true,
    previous_attempts: Number.isSafeInteger(result.previous_attempts) ? result.previous_attempts : null,
    template_key: typeof result.template_key === "string" ? result.template_key : null,
  };
}

async function getEmailOutboxHealth(limit = 20, dependencies = {}) {
  const db = dependencies.supabase || supabase;
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const now = new Date().toISOString();

  async function countStatus(status) {
    let query = db.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", status);
    const result = await query;
    if (result.error) throw result.error;
    return Number(result.count) || 0;
  }

  const [pending, duePending, sending, dead, staleSending, oldestPendingResult, oldestDuePendingResult, deadRowsResult] = await Promise.all([
    countStatus("pending"),
    db.from("email_outbox")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lte("next_attempt_at", now),
    countStatus("sending"),
    countStatus("dead"),
    db.from("email_outbox")
      .select("id", { count: "exact", head: true })
      .eq("status", "sending")
      .lt("locked_until", now),
    db.from("email_outbox")
      .select("created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1),
    db.from("email_outbox")
      .select("next_attempt_at")
      .eq("status", "pending")
      .lte("next_attempt_at", now)
      .order("next_attempt_at", { ascending: true })
      .limit(1),
    db.from("email_outbox")
      .select("id, attempts, max_attempts, last_error_code, created_at, updated_at")
      .eq("status", "dead")
      .order("updated_at", { ascending: false })
      .limit(safeLimit),
  ]);

  if (duePending.error) throw duePending.error;
  if (staleSending.error) throw staleSending.error;
  if (oldestPendingResult.error) throw oldestPendingResult.error;
  if (oldestDuePendingResult.error) throw oldestDuePendingResult.error;
  if (deadRowsResult.error) throw deadRowsResult.error;

  const oldestPendingAt = oldestPendingResult.data && oldestPendingResult.data[0]
    ? oldestPendingResult.data[0].created_at
    : null;
  const oldestDuePendingAt = oldestDuePendingResult.data && oldestDuePendingResult.data[0]
    ? oldestDuePendingResult.data[0].next_attempt_at
    : null;

  return {
    generated_at: now,
    counts: {
      pending,
      due_pending: Number(duePending.count) || 0,
      sending,
      stale_sending: Number(staleSending.count) || 0,
      dead,
    },
    oldest_pending_at: oldestPendingAt,
    oldest_pending_age_seconds: oldestPendingAt
      ? Math.max(0, Math.floor((Date.now() - new Date(oldestPendingAt).getTime()) / 1000))
      : null,
    oldest_due_pending_at: oldestDuePendingAt,
    oldest_due_pending_age_seconds: oldestDuePendingAt
      ? Math.max(0, Math.floor((Date.now() - new Date(oldestDuePendingAt).getTime()) / 1000))
      : null,
    dead_items: (deadRowsResult.data || []).map((row) => ({
      id: row.id,
      attempts: row.attempts,
      max_attempts: row.max_attempts,
      last_error_code: row.last_error_code,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
  };
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
function normalizeAdminSubscriptionLimit(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return 100;
  return Math.min(500, Math.max(1, parsed));
}

async function listAllSubscriptions(limit = 100) {
  const safeLimit = normalizeAdminSubscriptionLimit(limit);
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, user_id, plan, status, amount, currency, period_start, period_end, created_at, provider_payment_id")
    .order("created_at", { ascending: false })
    .limit(safeLimit);
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
  normalizeAdminSubscriptionLimit,
  dispatchPendingSubscriptionEmails,
  isValidEmailOutboxClaimRows,
  getEmailOutboxHealth,
  requeueEmailOutbox,
};
