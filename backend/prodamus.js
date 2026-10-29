
/**
 * Проверка подписи входящего вебхука.
 * Подпись приходит в заголовке `Sign`.
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
