const supabase = require("./supabase");
const { httpError } = require("./validate");
const { asError } = require("./dbErrors");
const { readArrayQueryResult } = require("./fetchAllPages");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MATCH_QUERY_ROWS = 1000;
const MATCH_QUERY_LIMIT = MAX_MATCH_QUERY_ROWS + 1;

function parseLimit(value) {
  if (value === undefined || value === null || value === "") return 50;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw httpError(422, "limit должен быть целым числом от 1 до 100");
  }
  return parsed;
}

function safeErrorCode(value) {
  const code = String(value || "");
  return /^[a-zA-Z0-9_-]{1,64}$/.test(code) ? code : null;
}

function serializeRequest(row, now = Date.now()) {
  const updatedAt = new Date(row.updated_at).getTime();
  const ageMinutes = Number.isFinite(updatedAt)
    ? Math.max(0, Math.floor((now - updatedAt) / 60000))
    : null;
  return {
    id: row.id,
    provider_order_id: row.provider_order_id || null,
    user_id: row.user_id,
    request_kind: row.request_kind,
    status: row.status,
    error_code: safeErrorCode(row.error_code),
    created_at: row.created_at,
    updated_at: row.updated_at,
    age_minutes: ageMinutes,
    requires_provider_reconciliation: row.status === "unknown",
    stale_creation: row.status === "creating" && ageMinutes !== null && ageMinutes >= 2,
  };
}

async function listPaymentCreationRequests(query = {}, now = Date.now(), db = supabase) {
  const limit = parseLimit(query.limit);
  const fetchLimit = limit + 1;
  const requestResult = await db
    .from("payment_creation_requests")
    .select("id, provider_order_id, user_id, request_kind, status, error_code, created_at, updated_at")
    .in("status", ["unknown", "creating"])
    .order("updated_at", { ascending: true })
    .limit(fetchLimit);
  if (requestResult.error) throw asError(requestResult.error);

  const fetchedRequestRows = readArrayQueryResult(requestResult);
  const requestRows = fetchedRequestRows.slice(0, limit);
  const orderIds = [...new Set(requestRows.map((row) => row.provider_order_id).filter(Boolean))];
  let subscriptionRows = [];
  let creditPurchaseRows = [];

  if (orderIds.length > 0) {
    const [subscriptionsResult, creditsResult] = await Promise.all([
      db.from("subscriptions")
        .select("id, user_id, provider_payment_id, plan, status, amount, currency")
        .in("provider_payment_id", orderIds)
        .limit(MATCH_QUERY_LIMIT),
      db.from("credit_purchases")
        .select("id, user_id, provider_payment_id, package_id, status, amount, currency")
        .in("provider_payment_id", orderIds)
        .limit(MATCH_QUERY_LIMIT),
    ]);
    if (subscriptionsResult.error) throw asError(subscriptionsResult.error);
    if (creditsResult.error) throw asError(creditsResult.error);
    subscriptionRows = readArrayQueryResult(subscriptionsResult);
    creditPurchaseRows = readArrayQueryResult(creditsResult);
    // A capped lookup is not a complete reconciliation result. Fail closed rather than
    // letting an unseen duplicate provider order appear to be a unique local payment.
    if (subscriptionRows.length > MAX_MATCH_QUERY_ROWS ||
        creditPurchaseRows.length > MAX_MATCH_QUERY_ROWS) {
      throw httpError(502, "Слишком много совпадений для безопасной сверки. Требуется ручная проверка.");
    }
  }

  const paymentByOrderId = new Map();
  for (const row of subscriptionRows) {
    if (paymentByOrderId.has(row.provider_payment_id)) {
      throw new Error("provider order ID is linked to multiple local payment records");
    }
    paymentByOrderId.set(row.provider_payment_id, {
      local_payment_record_id: row.id,
      local_payment_status: row.status,
      product_id: row.plan,
      expected_amount: row.amount,
      currency: row.currency,
      local_user_id: row.user_id,
      matched_record_kind: "subscription",
    });
  }
  for (const row of creditPurchaseRows) {
    if (paymentByOrderId.has(row.provider_payment_id)) {
      throw new Error("provider order ID is linked to multiple local payment records");
    }
    paymentByOrderId.set(row.provider_payment_id, {
      local_payment_record_id: row.id,
      local_payment_status: row.status,
      product_id: row.package_id,
      expected_amount: row.amount,
      currency: row.currency,
      local_user_id: row.user_id,
      matched_record_kind: "credits",
    });
  }

  const items = requestRows.map((row) => {
    const serialized = serializeRequest(row, now);
    const payment = row.provider_order_id ? paymentByOrderId.get(row.provider_order_id) : null;
    if (!payment) return { ...serialized, local_payment_match: "missing" };
    if (payment.local_user_id !== row.user_id || payment.matched_record_kind !== row.request_kind) {
      return { ...serialized, local_payment_match: "identity_mismatch" };
    }
    const { local_user_id, matched_record_kind, ...safePayment } = payment;
    return { ...serialized, ...safePayment, local_payment_match: "matched" };
  });
  return {
    read_only: true,
    automatic_reconciliation: false,
    limit,
    truncated: fetchedRequestRows.length > limit,
    count: items.length,
    unknown_count: items.filter((item) => item.status === "unknown").length,
    creating_count: items.filter((item) => item.status === "creating").length,
    stale_creation_count: items.filter((item) => item.stale_creation).length,
    items,
    note: "Неопределённый исход нельзя сбрасывать или повторять автоматически. Сверьте заказ с Prodamus и историю вебхуков.",
  };
}

module.exports = { listPaymentCreationRequests, parseLimit, serializeRequest, safeErrorCode };
