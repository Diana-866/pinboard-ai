const { logError } = require("./safeLogger");
// Работа с Prodamus (платёжная форма payform): подпись ссылок, проверка вебхуков.
// Документация:
//   ссылки:  https://help.prodamus.ru/help_documentations_pf1/payform/tekhnicheskaya-dokumentaciya/sozdanie-platezhnoy-ssylki
//   вебхук:  https://help.prodamus.ru/help_documentations_pf1/payform/tekhnicheskaya-dokumentaciya/webhook-ob-oplate
//
// ВАЖНО: файл восстановлен (в архиве версия была повреждена — дублированный блок
// `const provided` и отсутствовавшие функции-хелперы). Поведение сохранено,
// подпись: HMAC-SHA256(canonical-строка, secret), hex в поле signature запроса.

const crypto = require("crypto");
const axios = require("axios");
const { httpError } = require("./validate");

function isConfigured() {
  return !!(process.env.PRODAMUS_SHOP_ID && process.env.PRODAMUS_SECRET);
}

/**
 * Simulated payment modes must never be used by a production deployment.
 * This covers provider demo_mode links and locally fabricated offline checkout
 * URLs; neither represents a confirmed real-money payment.
 */
function isDemoWebhookBlocked() {
  const production = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  return production && (isDemo() || isOffline());
}

function verifyWebhook(body, headers) {
  // Используем отдельный ключ уведомлений, если он настроен.
  const secret =
    process.env.PRODAMUS_SECRET_WEBHOOK || process.env.PRODAMUS_SECRET;

  if (!secret) {
    return { ok: false, reason: "PRODAMUS_SECRET не задан" };
  }

  const provided =
    (headers && (headers.sign || headers.Sign)) ||
    (headers && headers["x-sign"]) ||
    "";
  if (!provided) return { ok: false, reason: "нет заголовка Sign" };

  const payload = { ...(body || {}) };
  // Сам заголовок в подпись не входит
  delete payload.Sign;
  delete payload.sign;

  const canonical = canonicalString(payload);
  const expectedB64 = crypto
    .createHmac("sha256", secret)
    .update(canonical, "utf8")
    .digest("base64");
  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(canonical, "utf8")
    .digest("hex");

  if (safeEqual(expectedB64, provided) || safeEqual(expectedHex, provided)) {
    return { ok: true };
  }

  // Резервный вариант: некоторые интеграции подписывают «плоский» payload,
  // где вложенные массивы уже сериализованы в строки. Пробуем ещё раз.
  const flat = {};
  Object.keys(payload).forEach((k) => {
    const v = payload[k];
    flat[k] = typeof v === "object" && v !== null ? JSON.stringify(v) : v;
  });
  const expectedFlat = crypto
    .createHmac("sha256", secret)
    .update(canonicalString(flat), "utf8")
    .digest("base64");
  if (safeEqual(expectedFlat, provided)) return { ok: true };

  return { ok: false, reason: "подпись не совпадает" };
}

/** Map only documented final Prodamus webhook states. Unknown/in-progress
 * states must not downgrade a pending order to denied. */
function normalizePaymentStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "success") return "success";
  if (value === "order_canceled") return "canceled";
  if (value === "order_denied") return "denied";
  return null;
}

/**
 * Read the amount and currency from a signed Prodamus webhook.
 * The generic Prodamus webhook example documents "sum"; integration
 * guidance for foreign-currency payments additionally identifies
 * "currency" + "currency_sum" as the payment-currency amount pair.
 * Require that pair for foreign-currency orders rather than guessing.
 */
function getWebhookPaymentAmount(body, expectedCurrency = "rub") {
  const expected = String(expectedCurrency || "rub").trim().toLowerCase();
  const rawCurrency = body && body.currency;
  const hasCurrency = rawCurrency != null && String(rawCurrency).trim() !== "";
  const receivedCurrency = hasCurrency ? String(rawCurrency).trim().toLowerCase() : null;

  if (!["rub", "usd", "eur", "kzt"].includes(expected)) {
    return { ok: false, reason: "unsupported_expected_currency" };
  }
  if (hasCurrency && receivedCurrency !== expected) {
    return { ok: false, reason: "currency_mismatch", receivedCurrency };
  }
  // Older RUB callbacks may omit currency fields. Never apply that fallback
  // to foreign-currency orders: currency_sum and currency are mandatory there.
  if (!hasCurrency && expected !== "rub") {
    return { ok: false, reason: "currency_missing" };
  }

  const currencyAmount = body && body.currency_sum;
  const rawAmount = currencyAmount != null && String(currencyAmount).trim() !== ""
    ? currencyAmount
    : expected === "rub" ? body && body.sum : null;
  const amount = rawAmount == null || String(rawAmount).trim() === ""
    ? NaN
    : Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "amount_missing", receivedCurrency };
  }

  return {
    ok: true,
    amount,
    currency: receivedCurrency || expected,
    amountField: currencyAmount != null && String(currencyAmount).trim() !== "" ? "currency_sum" : "sum",
  };
}

function formatAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw httpError(422, "Некорректная сумма платежа");
  return n.toFixed(2);
}

/** Accept only secure, syntactically valid checkout URLs without embedded credentials. */
function validateCheckoutUrl(raw) {
  let checkoutUrl;
  try {
    checkoutUrl = new URL(String(raw));
  } catch {
    throw httpError(502, "Prodamus вернул некорректную ссылку на оплату");
  }
  const configuredHost = new URL(baseUrl()).hostname.toLowerCase();
  const checkoutHost = checkoutUrl.hostname.toLowerCase();
  const isProviderHost =
    checkoutHost === configuredHost ||
    checkoutHost === "payform.ru" ||
    checkoutHost.endsWith(".payform.ru");

  if (
    checkoutUrl.protocol !== "https:" ||
    checkoutUrl.username ||
    checkoutUrl.password ||
    !isProviderHost
  ) {
    throw httpError(502, "Prodamus вернул небезопасную ссылку на оплату");
  }
  return checkoutUrl.toString();
}

/**
 * Создание платёжной ссылки: POST на платёжную форму с do=link.
 * Ответ Prodamus — JSON с ссылкой; формат разбираем терпимо (link/url/data.link),
 * потому что в разных версиях API поле называется по-разному.
 */
async function createPaymentLink({
  orderId,
  amount,
  currency = "rub",
  email,
  description,
  plan,
  urlNotification,
  urlSuccess,
}) {
  if (isDemoWebhookBlocked()) {
    throw httpError(503, "Тестовый режим оплаты отключён в production. Настройте реальные платежи Prodamus.");
  }
  if (!orderId) throw httpError(500, "Не удалось создать платёж: нет order_id");
  const price = formatAmount(amount);
  const sys = String(process.env.PRODAMUS_SYS || "").trim();

  const payload = {
    do: "link",
    order_id: String(orderId),
    customer_email: email || "",
    currency: String(currency || "rub").toLowerCase(),
    callbackType: "json",
    products: [
      {
        name: String(description || "Подписка PinPosy").slice(0, 250),
        price,
        quantity: "1",
        sku: String(plan || ""),
      },
    ],
    // SYS is a required Prodamus request parameter. For a self-written
    // integration the documentation explicitly allows an empty value.
    sys,
    // Prodamus may require an issued integration code (SYS) for a per-request
    // notification URL. Without SYS, use the webhook URL configured in the
    // payment-form settings instead of sending an ineffective override.
    ...(sys && urlNotification ? { urlNotification } : {}),
    ...(urlSuccess ? { urlSuccess } : {}),
    ...(isDemo() ? { demo_mode: "1" } : {}),
  };

  const signature = signPayload(payload);
  const signedPayload = { ...payload, signature };

  // Оффлайн-режим: собираем ссылку сами (локальные тесты, нет сети до Prodamus).
  if (isOffline()) {
    const qs = toFormEncoded(signedPayload);
    return {
      url: `${baseUrl()}?${qs.toString()}`,
      payload: signedPayload,
      raw: { offline: true },
    };
  }

  let res;
  try {
    res = await axios.post(baseUrl(), toFormEncoded(signedPayload), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      timeout: 20000,
      validateStatus: () => true,
    });
  } catch (e) {
    logError("prodamus.event_002");
    throw httpError(502, "Платёжный сервис не отвечает — попробуйте позже");
  }

  // A non-2xx provider response is not a successful checkout, even if an
  // intermediary or error payload happens to contain a URL-shaped field.
  const status = Number(res && res.status);
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    logError("prodamus.event_001");
    throw httpError(502, "Prodamus не подтвердил создание платёжной ссылки. Попробуйте позже.");
  }

  const data = res.data && typeof res.data === "object" ? res.data : null;
  const url =
    (data && (data.link || data.url || (data.data && (data.data.link || data.data.url)))) ||
    (typeof res.data === "string" && /^https?:\/\//.test(res.data.trim()) ? res.data.trim() : null);

  if (!url) {
    logError("prodamus.event_001");
    throw httpError(
      502,
      "Prodamus не вернул ссылку на оплату. Проверьте PRODAMUS_SHOP_ID / PRODAMUS_SECRET / PRODAMUS_URL."
    );
  }

  // Never redirect a customer to an insecure or credential-bearing URL,
  // even if a malformed or compromised upstream response supplies one.
  return { url: validateCheckoutUrl(url), payload: signedPayload, raw: data || res.data };
}

module.exports = {
  isDemoWebhookBlocked,
  isConfigured,
  isDemo,
  isOffline,
  baseUrl,
  canonicalString,
  toFormEncoded,
  signPayload,
  safeEqual,
  normalizePaymentStatus,
  getWebhookPaymentAmount,
  validateCheckoutUrl,
  verifyWebhook,
  createPaymentLink,
};