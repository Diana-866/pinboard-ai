/**
 * Проверка биллинга без сети и без реального Supabase.
 * Запуск: node test/billing-flow.js
 *
 * Что проверяется (критерий задачи):
 *  1. POST /billing/create-payment создаёт pending-строку и возвращает ссылку Prodamus.
 *  2. Вебхук с корректной подписью (HMAC-SHA256 по канонической JSON-строке)
 *     переводит строку в success и ставит users.tariff_plan + tariff_period_end (+30 дней).
 *  3. Повторный вебхук идемпотентен, вебхук с плохой подписью отклоняется.
 */

process.env.PRODAMUS_SHOP_ID = "pinposy";
process.env.PRODAMUS_SECRET = "test_secret_key_for_local_run";
process.env.PRODAMUS_OFFLINE = "1";
process.env.FRONTEND_URL = "https://pinposy.com";
process.env.PUBLIC_BACKEND_URL = "https://api.pinposy.com";

const path = require("path");
const assert = require("assert");

// ---- Мини-фейк Supabase: только те цепочки вызовов, что использует billing/tariff ----
const db = { users: [], subscriptions: [] };
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

function table(name) {
  const state = { filters: {}, op: null, payload: null };
  const api = {
    insert(row) {
      state.op = "insert";
      state.payload = Array.isArray(row) ? row[0] : row;
      return api;
    },
    update(patch) {
      state.op = "update";
      state.payload = patch;
      return api;
    },
    select() {
      return api;
    },
    eq(col, val) {
      state.filters[col] = val;
      return api;
    },
    order() {
      return api;
    },
    limit() {
      return api;
    },
    maybeSingle() {
      return api.single();
    },
    single() {
      return Promise.resolve(exec(name, state, true));
    },
    then(resolve, reject) {
      return Promise.resolve(exec(name, state, false)).then(resolve, reject);
    },
  };
  return api;
}

function matches(row, filters) {
  return Object.entries(filters).every(([k, v]) => String(row[k]) === String(v));
}

function exec(name, state, single) {
  const rows = db[name];
  if (state.op === "insert") {
    const row = {
      id: uuid(),
      created_at: new Date().toISOString(),
      ...state.payload,
    };
    rows.push(row);
    return { data: single ? row : [row], error: null };
  }
  if (state.op === "update") {
    const hit = rows.filter((r) => matches(r, state.filters));
    hit.forEach((r) => Object.assign(r, state.payload));
    return { data: single ? hit[0] || null : hit, error: null };
  }
  const hit = rows.filter((r) => matches(r, state.filters));
  if (single) return { data: hit[0] || null, error: hit[0] ? null : { message: "not found" } };
  return { data: hit, error: null };
}

const fakeClient = {
  from: (name) => table(name),
  rpc: async (fn, args) => {
    if (fn !== "activate_paid_subscription") {
      return { data: null, error: { message: "unknown rpc: " + fn } };
    }
    const sub = db.subscriptions.find((row) => row.id === args.p_subscription_id);
    if (!sub) return { data: null, error: { message: "subscription not found" } };
    const user = db.users.find((row) => row.id === sub.user_id);
    if (!user) return { data: null, error: { message: "subscription user not found" } };

    const already = sub.status === "success" && !!sub.period_end;
    let start;
    let end;
    if (already) {
      end = sub.period_end;
      start = sub.period_start || new Date(new Date(end).getTime() - 30 * 86400000).toISOString();
    } else {
      start = new Date(Math.max(
        new Date(args.p_paid_at).getTime(),
        user.tariff_period_end ? new Date(user.tariff_period_end).getTime() : 0
      )).toISOString();
      end = new Date(new Date(start).getTime() + 30 * 86400000).toISOString();
      sub.status = "success";
      sub.period_start = start;
      sub.period_end = end;
    }
    if (!user.tariff_period_end || new Date(user.tariff_period_end) <= new Date(end)) {
      user.tariff_plan = sub.plan;
      user.tariff_period_end = end;
    }
    return { data: {
      subscription_id: sub.id, plan: sub.plan, period_start: start,
      period_end: end, email: user.email, already_activated: already
    }, error: null };
  }
};
const supabasePath = require.resolve(path.join(__dirname, "..", "backend", "supabase.js"));
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: fakeClient,
};

// пользователь, который «оплатит»
db.users.push({
  id: "user-1",
  email: "customer@example.com",
  tariff_plan: "none",
  tariff_period_end: null,
});

const billing = require("../backend/billing");
const prodamus = require("../backend/prodamus");

function fakeReq(body, sign) {
  // подпись приходит ТОЛЬКО в заголовке Sign, в теле её нет
  return { body: { ...body }, headers: { sign } };
}
function fakeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

async function main() {
  console.log("== 1. create-payment ==");
  const created = await billing.createPayment("user-1", { plan: "start", currency: "rub" });
  console.log("  payment_url:", created.payment_url.slice(0, 90) + "…");
  console.log("  order_id:  ", created.order_id, "| amount:", created.amount, created.currency);
  assert.equal(db.subscriptions.length, 1);
  assert.equal(db.subscriptions[0].status, "pending");
  assert.equal(db.subscriptions[0].plan, "start");
  assert.equal(Number(db.subscriptions[0].amount), 1990);
  assert.ok(created.payment_url.startsWith("https://pinposy.payform.ru/"));

  console.log("== 2. подпись по документации Prodamus ==");
  const payload = {
    order_id: created.order_id,
    payment_status: "success",
    payment_status_description: "Оплачено",
    sum: "1990.00",
    currency: "rub",
    customer_email: "customer@example.com",
  };
  const sign = prodamus.signPayload(payload);
  const canon = prodamus.canonicalString(payload);
  console.log("  canonical:", canon.slice(0, 110) + "…");
  assert.deepEqual(Object.keys(JSON.parse(canon)), Object.keys(payload).sort(), "ключи отсортированы");
  console.log("  Sign:      ", sign);
  assert.ok(/^[A-Za-z0-9+/=]{40,}$/.test(sign), "base64 от HMAC-SHA256");

  console.log("== 3. вебхук: success → тариф активирован ==");
  const res = fakeRes();
  await billing.handleWebhook(fakeReq(payload, sign), res);
  console.log("  ответ:", res.statusCode, JSON.stringify(res.body));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "success");
  assert.equal(db.subscriptions[0].status, "success");
  assert.equal(db.users[0].tariff_plan, "start");
  const days = (new Date(db.users[0].tariff_period_end) - new Date()) / 86400000;
  console.log("  tariff_period_end:", db.users[0].tariff_period_end, `(~${days.toFixed(2)} дней)`);
  assert.ok(days > 29.9 && days < 30.1, "период = 30 дней");

  console.log("== 4. повторный вебхук идемпотентен ==");
  const res2 = fakeRes();
  await billing.handleWebhook(fakeReq(payload, sign), res2);
  console.log("  ответ:", res2.statusCode, JSON.stringify(res2.body));
  assert.equal(res2.body.idempotent, true);
  assert.equal(db.subscriptions.length, 1, "вторая строка не создана");

  console.log("== 5. плохая подпись отклоняется ==");
  const res3 = fakeRes();
  await billing.handleWebhook(fakeReq(payload, "ZmFrZQ=="), res3);
  console.log("  ответ:", res3.statusCode, JSON.stringify(res3.body));
  assert.equal(res3.statusCode, 403);

  console.log("== 6. requireTariff: аналитика не открывает генерацию ==");
  const { requireTariff } = require("../backend/tariff");
  db.users[0].tariff_plan = "analytics";
  db.subscriptions[0].plan = "analytics";
  const guard = requireTariff(["standard", "pro"]);
  const res4 = fakeRes();
  await guard({ userId: "user-1" }, res4, () => {
    throw new Error("next() не должен вызываться");
  });
  console.log("  ответ:", res4.statusCode, res4.body.code, "|", res4.body.error);
  assert.equal(res4.statusCode, 403);

  console.log("== 7. requireTariff: 'standard' → алиас 'pro' ==");
  db.users[0].tariff_plan = "standard";
  db.subscriptions[0].plan = "pro";
  let passed = false;
  await guard({ userId: "user-1" }, fakeRes(), () => {
    passed = true;
  });
  assert.equal(passed, true, "аlias standard должен открывать доступ");

  console.log("== 8. истёкший период закрывает доступ ==");
  const expired = new Date(Date.now() - 86400000).toISOString();
  db.users[0].tariff_plan = "pro";
  db.users[0].tariff_period_end = expired;
  db.subscriptions[0].plan = "pro";
  db.subscriptions[0].period_end = expired;
  let passed2 = false;
  const res5 = fakeRes();
  await guard({ userId: "user-1" }, res5, () => {
    passed2 = true;
  });
  assert.equal(passed2, false);
  console.log("  ответ:", res5.statusCode, res5.body.code);

  console.log("\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ ✓");
}

main().catch((e) => {
  console.error("\n❌ ПРОВЕРКА ПРОВАЛЕНА:", e.message);
  process.exit(1);
});
