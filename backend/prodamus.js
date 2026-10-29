// Клиент Prodamus (prodamus.ru): платёжные ссылки + проверка подписи вебхука.
// Документация: https://help.prodamus.ru/help_documentations_pf1/payform/tekhnicheskaya-dokumentaciya
//
// Переменные окружения:
//   PRODAMUS_SHOP_ID — логин магазина в Prodamus (например pinposy). Из него собирается
//                      адрес https://<PRODAMUS_SHOP_ID>.payform.ru/, если PRODAMUS_URL пуст.
//   PRODAMUS_SECRET  — «секретный ключ» со страницы настроек платёжной формы.
//   PRODAMUS_URL     — базовый адрес платёжной формы (по умолчанию https://<shop>.payform.ru/).
//   PRODAMUS_SYS     — опционально: идентификатор интеграции, выдаёт поддержка Prodamus.
//   PRODAMUS_DEMO    — 1 → каждый платёж создаётся с demo_mode=1 (демо-режим Prodamus).
//   PRODAMUS_OFFLINE — 1 → НЕ ходить в сеть, собирать ссылку локально. Только для локальных
//                      тестов и для проверки вебхука в песочнице (см. docs/payments-prodamus.md).

const crypto = require("crypto");
const axios = require("axios");
const { httpError } = require("./validate");

function shopId() {
  return String(process.env.PRODAMUS_SHOP_ID || "").trim();
}

function baseUrl() {
  const raw = String(process.env.PRODAMUS_URL || "").trim();
  const url = raw || (shopId() ? `https://${shopId()}.payform.ru/` : "");
  if (!url) {
    throw httpError(503, "Prodamus не настроен: задайте PRODAMUS_SHOP_ID и PRODAMUS_SECRET");
  }
  return url.endsWith("/") ? url : `${url}/`;
}

function isConfigured() {
  return !!(shopId() && process.env.PRODAMUS_SECRET);
}

function isDemo() {
  return String(process.env.PRODAMUS_DEMO || "") === "1";
}

function isOffline() {
  return String(process.env.PRODAMUS_OFFLINE || "") === "1";
}

/**
 * Рекурсивная нормализация payload по документации Prodamus:
 *  «возьмите содержимое запроса и приведите все значения к строкам,
 *   отсортируйте всё по ключам в алфавитном порядке, в том числе вглубь,
 *   переведите массив в json-строку, в json-строке экранируйте /»
 */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        const v = value[key];
        if (v === undefined) return; // undefined не попадает в json_encode у PHP
        out[key] = canonicalize(v);
      });
    return out;
  }
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "1" : "";
  return String(value);
}

/**
 * Каноническая строка для подписи.
 * Prodamus подписывает json_encode(...) из PHP, а json_encode по умолчанию
 * экранирует слэши как "\/" — повторяем это поведение, чтобы подпись совпала.
 * Отключить экранирование можно PRODAMUS_SIGN_PHP_ESCAPE=0 (для нестандартных шлюзов).
 */
function canonicalString(payload) {
  const json = JSON.stringify(canonicalize(payload));
  return String(process.env.PRODAMUS_SIGN_PHP_ESCAPE || "1") === "0"
    ? json
    : json.replace(/\//g, "\\/");
}

function signPayload(payload) {
  const secret = process.env.PRODAMUS_SECRET;
  if (!secret) throw httpError(503, "Prodamus не настроен: задайте PRODAMUS_SECRET");
  return crypto
    .createHmac("sha256", secret)
    .update(canonicalString(payload), "utf8")
    .digest("base64");
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Проверка подписи входящего вебхука.
 * Подпись приходит в заголовке `Sign` и считается по тем же правилам, что и для REST API.
 * Возвращает { ok, reason }.
 */

function verifyWebhook(body, headers) {
  // Отдельный секрет для уведомлений об оплате, если он настроен.
  const secret =
    process.env.PRODAMUS_SECRET_WEBHOOK || process.env.PRODAMUS_SECRET;

  if (!secret) {
    return { ok: false, reason: "PRODAMUS_SECRET не задан" };
  }

  if (!secret) {
    // Без секрета проверить нельзя. В продакшене это фатально, но не роняем сервер:
    // в лог попадает явная ошибка, вебхук отклоняется (см. handleWebhook).
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

  const expected = signPayload(payload);
  if (safeEqual(expected, provided)) return { ok: true };

  // Резервный вариант: некоторые интеграции подписывают «плоский» payload,
  // где вложенные массивы уже сериализованы в строки. Пробуем ещё раз.
  const flat = {};
  Object.keys(payload).forEach((k) => {
    const v = payload[k];
    flat[k] = typeof v === "object" && v !== null ? JSON.stringify(v) : v;
  });
  const expectedFlat = signPayload(flat);
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
  verifyWebhook,
  createPaymentLink,
};
