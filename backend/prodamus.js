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

/** Демо-режим Prodamus: платежи виртуальные, реальные деньги не списываются */
function isDemo() {
  const v = String(process.env.PRODAMUS_DEMO || "").trim().toLowerCase();
  return v === "1" || v === "true";
}

/** Оффлайн-режим: без сети до Prodamus (локальные тесты, CI) — ссылка собирается locally */
function isOffline() {
  return String(process.env.PRODAMUS_OFFLINE || "").trim() === "1";
}

function baseUrl() {
  const configuredUrl = String(process.env.PRODAMUS_URL || "").trim();
  const shopId = String(process.env.PRODAMUS_SHOP_ID || "pinposy").trim();
  const value = configuredUrl || `https://${shopId}.payform.ru/`;
  return value.replace(/\/?$/, "/"); // всегда завершаем слэшем
}

/**
 * Каноническая строка параметров для подписи Prodamus:
 * ключи сортируются по алфавиту, вложенные объекты/массивы сериализуются в JSON,
 * параметры соединяются через `&` в виде key=value.
 */
function normalizeSignatureValue(value) {
  if (Array.isArray(value)) return value.map(normalizeSignatureValue);
  if (value && typeof value === "object") {
    const normalized = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeSignatureValue(value[key]);
    }
    return normalized;
  }
  return value === undefined || value === null ? "" : String(value);
}

function canonicalString(params) {
  const payload = Object.create(null);
  for (const key of Object.keys(params || {}).sort()) {
    if (key === "Sign" || key === "sign") continue;
    payload[key] = normalizeSignatureValue(params[key]);
  }
  // Prodamus требует рекурсивную сортировку ключей и экранирование символа "/".
  return JSON.stringify(payload).replace(/\//g, "\\/");
}

/**
 * Prodamus expects nested form fields (products[0][name]), not JSON.stringify
 * or URLSearchParams' default "[object Object]" conversion.
 * Signature calculation stays on the original nested payload.
 */
function appendFormField(form, key, value) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendFormField(form, `${key}[${index}]`, item));
    return;
  }
  if (value && typeof value === "object") {
    for (const childKey of Object.keys(value).sort()) {
      appendFormField(form, `${key}[${childKey}]`, value[childKey]);
    }
    return;
  }
  form.append(key, value === undefined || value === null ? "" : String(value));
}

function toFormEncoded(params) {
  const form = new URLSearchParams();
  for (const key of Object.keys(params || {}).sort()) {
    appendFormField(form, key, params[key]);
  }
  return form.toString();
}

/**
 * Подпись исходящего запроса: HMAC-SHA256 от canonical-строки, hex.
 * Prodamus ожидает её в параметре signature тела запроса; заголовок Sign
 * используется для обратных вебхуков.
 */
function signPayload(params) {
  const secret = process.env.PRODAMUS_SECRET;
  if (!secret) throw httpError(500, "PRODAMUS_SECRET не задан");
  return crypto
    .createHmac("sha256", secret)
    .update(canonicalString(params), "utf8")
    .digest("hex");
}

/** Сравнение подписей без утечки по времени (хешируем до фикс. длины) */
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a || "")).digest("hex");
  const hb = crypto.createHash("sha256").update(String(b || "")).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(ha), Buffer.from(hb));
}

/**
 * Проверка подписи входящего вебхука.
 * Подпись приходит в заголовке `Sign` (base64 или hex от HMAC-SHA256).
 * Возвращает { ok, reason }.
 */
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

function formatAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw httpError(422, "Некорректная сумма платежа");
  return n.toFixed(2);
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
  if (!orderId) throw httpError(500, "Не удалось создать платёж: нет order_id");
  const price = formatAmount(amount);

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
    sys: String(process.env.PRODAMUS_SYS || ""),
    ...(urlNotification ? { urlNotification } : {}),
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
    console.error("[prodamus] сеть недоступна:", e.message);
    throw httpError(502, "Платёжный сервис не отвечает — попробуйте позже");
  }

  const data = res.data && typeof res.data === "object" ? res.data : null;
  const url =
    (data && (data.link || data.url || (data.data && (data.data.link || data.data.url)))) ||
    (typeof res.data === "string" && /^https?:\/\//.test(res.data.trim()) ? res.data.trim() : null);

  if (!url) {
    console.error("[prodamus] ответ без ссылки:", res.status, JSON.stringify(res.data).slice(0, 500));
    throw httpError(
      502,
      "Prodamus не вернул ссылку на оплату. Проверьте PRODAMUS_SHOP_ID / PRODAMUS_SECRET / PRODAMUS_URL."
    );
  }

  // Never redirect a customer to an insecure or credential-bearing URL,
  // even if a malformed or compromised upstream response supplies one.
  let checkoutUrl;
  try {
    checkoutUrl = new URL(String(url));
  } catch {
    throw httpError(502, "Prodamus вернул некорректную ссылку на оплату");
  }
  if (
    checkoutUrl.protocol !== "https:" ||
    checkoutUrl.username ||
    checkoutUrl.password
  ) {
    throw httpError(502, "Prodamus вернул небезопасную ссылку на оплату");
  }

  return { url: checkoutUrl.toString(), payload: signedPayload, raw: data || res.data };
}

module.exports = {
  isConfigured,
  isDemo,
  isOffline,
  baseUrl,
  canonicalString,
  toFormEncoded,
  signPayload,
  safeEqual,
  normalizePaymentStatus,
  verifyWebhook,
  createPaymentLink,
};