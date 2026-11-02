/**
 * Проверка потока покупки пакетов кредитов без сети и без реального Supabase.
 * Запуск: node test/credits-flow.js
 *
 * Что проверяется (критерий задачи):
 *  1. POST /billing/credits создаёт pending-покупку и возвращает ссылку Prodamus
 *     (сумма — из серверного каталога creditPacks.js, не от клиента).
 *  2. Вебхук с корректной подписью переводит покупку в success, баланс растёт
 *     на размер пакета, в credit_transactions появляется запись topup.
 *  3. Повторный вебхук идемпотентен: баланс НЕ удваивается.
 *  4. Вебхук с плохой подписью отклоняется; баланс не меняется.
 *  5. Вебхук с чужой суммой не зачисляет кредиты.
 */

process.env.PRODAMUS_SHOP_ID = "pinposy";
process.env.PRODAMUS_SECRET = "test_secret_key_for_local_run";
process.env.PRODAMUS_OFFLINE = "1";
process.env.FRONTEND_URL = "https://pinposy.com";
process.env.PUBLIC_BACKEND_URL = "https://api.pinposy.com";

const path = require("path");
const assert = require("assert");

// ---- Мини-фейк Supabase: таблицы users / credit_purchases / credit_transactions ----
const db = { users: [], credit_purchases: [], credit_transactions: [] };
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

function table(name) {
  const state = { filters: {}, op: null, payload: null, selecting: false };
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
      state.selecting = true;
      return api;
    },
    eq(col, val) {
      state.filters[col] = val;
      return api;
    },
    in(col, values) {
      state.filters[col] = { __in: values };
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
  return Object.entries(filters).every(([k, v]) =>
    v && typeof v === "object" && Array.isArray(v.__in)
      ? v.__in.map(String).includes(String(row[k]))
      : String(row[k]) === String(v)
  );
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

// users.credits_balance обслуживается через RPC adjust_credits_balance — эмулируем
const fakeClient = {
  from: (name) => table(name),
  rpc: async (fn, { p_user_id, p_amount }) => {
    if (fn !== "adjust_credits_balance") throw new Error("unknown rpc: " + fn);
    const user = db.users.find((u) => String(u.id) === String(p_user_id));
    if (!user) throw new Error("user not found");
    user.credits_balance = (user.credits_balance || 0) + Number(p_amount);
    return { data: user.credits_balance, error: null };
  },
};
const supabasePath = require.resolve(path.join(__dirname, "..", "backend", "supabase.js"));
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: fakeClient,
};

// пользователь, который «купит» пакет
db.users.push({
  id: "user-1",
  email: "customer@example.com",
  credits_balance: 0,
});

const creditsBilling = require("../backend/creditsBilling");
const creditPacks = require("../backend/creditPacks");
const prodamus = require("../backend/prodamus");

function fakeReq(body, sign) {
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
  console.log("== 0. каталог пакетов ==");
  const catalog = creditPacks.packCatalog();
  console.log(" ", JSON.stringify(catalog));
  assert.equal(catalog.length, 3);
  assert.deepEqual(
    catalog.map((p) => [p.credits, p.amount.rub]),
    [[100, 190], [500, 790], [1000, 1290]]
  );

  console.log("== 1. createCreditsPayment (pack_500) ==");
  const created = await creditsBilling.createCreditsPayment("user-1", { package_id: "pack_500" });
  console.log("  payment_url:", created.payment_url.slice(0, 90) + "…");
  console.log("  order_id:   ", created.order_id, "| credits:", created.credits, "| amount:", created.amount, created.currency);
  assert.equal(db.credit_purchases.length, 1);
  assert.equal(db.credit_purchases[0].status, "pending");
  assert.equal(db.credit_purchases[0].package_id, "pack_500");
  assert.equal(db.credit_purchases[0].credits, 500);
  assert.equal(Number(db.credit_purchases[0].amount), 790);
  assert.ok(created.order_id.startsWith("ppc-"), "order_id с префиксом ppc-");
  assert.ok(created.payment_url.startsWith("https://pinposy.payform.ru/"));

  console.log("== 2. сумма от клиента игнорируется ==");
  const created2 = await creditsBilling.createCreditsPayment("user-1", {
    package_id: "pack_100",
    amount: 1, // злоумышленник пытается купить дешевле
  });
  assert.equal(created2.amount, 190, "сумма из каталога, не от клиента");
  assert.equal(created2.credits, 100);

  console.log("== 3. вебхук: success → кредиты зачислены ==");
  const payload = {
    order_id: created.order_id,
    payment_status: "success",
    payment_status_description: "Оплачено",
    sum: "790.00",
    currency: "rub",
    customer_email: "customer@example.com",
  };
  const sign = prodamus.signPayload(payload);
  const res = fakeRes();
  await creditsBilling.handleCreditsWebhook(fakeReq(payload, sign), res);
  console.log("  ответ:", res.statusCode, JSON.stringify(res.body));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "success");
  assert.equal(db.credit_purchases[0].status, "success");
  assert.ok(db.credit_purchases[0].paid_at, "paid_at записан");
  assert.ok(db.credit_purchases[0].balance_credited_at, "balance_credited_at записан");
  assert.equal(db.users[0].credits_balance, 500, "баланс вырос на 500");
  assert.equal(db.credit_transactions.length, 1, "одна транзакция");
  assert.equal(db.credit_transactions[0].type, "topup");
  assert.equal(db.credit_transactions[0].amount, 500);
  console.log("  баланс:", db.users[0].credits_balance, "| транзакция:", JSON.stringify(db.credit_transactions[0]));

  console.log("== 4. повторный вебхук идемпотентен (баланс НЕ удваивается) ==");
  const res2 = fakeRes();
  await creditsBilling.handleCreditsWebhook(fakeReq(payload, sign), res2);
  console.log("  ответ:", res2.statusCode, JSON.stringify(res2.body));
  assert.equal(res2.body.idempotent, true);
  assert.equal(db.users[0].credits_balance, 500, "баланс не изменился");
  assert.equal(db.credit_transactions.length, 1, "вторая транзакция не создана");

  console.log("== 5. плохая подпись отклоняется ==");
  const res3 = fakeRes();
  await creditsBilling.handleCreditsWebhook(fakeReq(payload, "ZmFrZQ=="), res3);
  console.log("  ответ:", res3.statusCode, JSON.stringify(res3.body));
  assert.equal(res3.statusCode, 403);
  assert.equal(db.users[0].credits_balance, 500);

  console.log("== 6. чужая сумма не зачисляется ==");
  const created3 = await creditsBilling.createCreditsPayment("user-1", { package_id: "pack_1000" });
  const payload3 = {
    order_id: created3.order_id,
    payment_status: "success",
    sum: "10.00", // оплатили 10 ₽ вместо 1290 ₽
    currency: "rub",
  };
  const res4 = fakeRes();
  await creditsBilling.handleCreditsWebhook(fakeReq(payload3, prodamus.signPayload(payload3)), res4);
  console.log("  ответ:", res4.statusCode, JSON.stringify(res4.body));
  assert.equal(res4.body.ignored, "amount mismatch");
  assert.equal(db.credit_purchases[2].status, "denied");
  assert.equal(db.users[0].credits_balance, 500, "кредиты не зачислены");

  console.log("== 7. правильный повтор после сбоя зачисляет один раз ==");
  const payload3ok = { ...payload3, sum: "1290.00" };
  const res5 = fakeRes();
  await creditsBilling.handleCreditsWebhook(fakeReq(payload3ok, prodamus.signPayload(payload3ok)), res5);
  assert.equal(res5.body.status, "success");
  assert.equal(db.users[0].credits_balance, 1500, "500 + 1000");
  const res6 = fakeRes();
  await creditsBilling.handleCreditsWebhook(fakeReq(payload3ok, prodamus.signPayload(payload3ok)), res6);
  assert.equal(res6.body.idempotent, true);
  assert.equal(db.users[0].credits_balance, 1500, "повтор не удвоил");

  console.log("== 8. отмена платежа ==");
  const created4 = await creditsBilling.createCreditsPayment("user-1", { package_id: "pack_100" });
  const payload4 = {
    order_id: created4.order_id,
    payment_status: "order_canceled",
  };
  const res7 = fakeRes();
  await creditsBilling.handleCreditsWebhook(fakeReq(payload4, prodamus.signPayload(payload4)), res7);
  assert.equal(res7.body.status, "canceled");
  assert.equal(db.credit_purchases[3].status, "canceled");
  assert.equal(db.users[0].credits_balance, 1500);

  console.log("\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ ✓");
}

main().catch((e) => {
  console.error("\n❌ ПРОВЕРКА ПРОВАЛЕНА:", e.message);
  process.exit(1);
});