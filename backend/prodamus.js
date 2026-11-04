// Работа с Prodamus (платёжная форма payform): подпись ссылок, проверка вебхуков.
// Документация:
//   ссылки:  https://help.prodamus.ru/help_documentations_pf1/payform/tekhnicheskaya-dokumentaciya/sozdanie-platezhnoy-ssylki
//   вебхук:  https://help.prodamus.ru/help_documentations_pf1/payform/tekhnicheskaya-dokumentaciya/webhook-ob-oplate
//
// ВАЖНО: файл восстановлен (в архиве версия была повреждена — дублированный блок
// `const provided` и отсутствовавшие функции-хелперы). Поведение сохранено,
// подпись: HMAC-SHA256(canonical-строка, secret) в base64 — так её ждёт test/billing-flow.js.

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
  return (
    String(process.env.PRODAMUS_URL || "https://pinposy.payform.ru/")
      .trim()
      .replace(/\/?$/, "/") // всегда завершаем слэшем
  );
}

/**
 * Каноническая строка параметров для подписи Prodamus:
 * ключи сортируются по алфавиту, вложенные объекты/массивы сериализуются в JSON,
 * параметры соединяются через `&` в виде key=value.
 */
function normalizeSignatureValue(value) {
  if (Array.isArray(value)) return value.map(normalizeSignatureValue);
  if (value && typeof value === "object") {
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeSignatureValue(value[key]);
    }
    return normalized;
  }
  return value === undefined || value === null ? "" : String(value);
}

function canonicalString(params) {
  const payload = {};
  for (const key of Object.keys(params || {}).sort()) {
    if (key === "Sign" || key === "sign") continue;
    payload[key] = normalizeSignatureValue(params[key]);
  }
  // Prodamus требует рекурсивную сортировку ключей и экранирование символа "/".
  return JSON.stringify(payload).replace(/\//g, "\\/");
}

/**
 * Подпись payload: HMAC-SHA256 от canonical-строки секретом магазина, в base64.
 * Используется и для создания ссылок (заголовок Sign исходящего запроса),
 * и в тестах — для имитации вебхука.
 */
function signPayload(params) {
  const secret = process.env.PRODAMUS_SECRET;
  if (!secret) throw httpError(500, "PRODAMUS_SECRET не задан");
  return crypto
    .createHmac("sha256", secret)
    .update(canonicalString(params), "utf8")
    .digest("base64");
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
  urlReturn,
}) {
  if (!orderId) throw httpError(500, "Не удалось создать платёж: нет order_id");
  const price = formatAmount(amount);

  const payload = {
    do: "link",
    order_id: String(orderId),
    customer_email: email || "",
    currency: String(currency || "rub").toLowerCase(),
    products: [
      {
        name: String(description || "Подписка PinPosy").slice(0, 250),
        price,
        quantity: "1",
        sku: String(plan || ""),
      },
    ],
    ...(process.env.PRODAMUS_SYS ? { sys: process.env.PRODAMUS_SYS } : {}),
    ...(urlNotification ? { urlNotification } : {}),
    ...(urlReturn ? { urlReturn } : {}),
    ...(isDemo() ? { demo_mode: "1" } : {}),
  };

  const signature = signPayload(payload);

  // Оффлайн-режим: собираем ссылку сами (локальные тесты, нет сети до Prodamus).
  if (isOffline()) {
    const qs = new URLSearchParams({
      do: "link",
      order_id: payload.order_id,
      products: JSON.stringify(payload.products),
      customer_email: payload.customer_email,
      currency: payload.currency,
      ...(payload.demo_mode ? { demo_mode: "1" } : {}),
    });
    return {
      url: `${baseUrl()}?${qs.toString()}`,
      payload,
      raw: { offline: true },
    };
  }

  let res;
  try {
    res = await axios.post(baseUrl(), new URLSearchParams(payload).toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Sign: signature,
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
  return { url, payload, raw: data || res.data };
}

module.exports = {
  isConfigured,
  isDemo,
  isOffline,
  baseUrl,
  canonicalString,
  signPayload,
  safeEqual,
  verifyWebhook,
  createPaymentLink,
};