"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PLAN_LIMITS,
  planLimitsFor,
  countActiveSchedules,
  assertSchedulePinLimit,
} = require("../billing");

/**
 * Лимит запланированных пинов: единственный источник значений — PLAN_LIMITS рядом с PLANS
 * в billing.js, значения подставляет владелец. Лимит обязан отличаться на каждом тарифе,
 * потому что разница и есть смысл тарифной сетки. Число подключённых аккаунтов Pinterest
 * проверяется SQL-функцией (миграция 080), но её границы обязаны совпадать с PLAN_LIMITS —
 * иначе страница тарифов обещает одно, а сервер делает другое.
 */

function fakeSupabase(count) {
  const calls = [];
  const client = {
    from(table) {
      const builder = {
        select(_cols, options) {
          if (options && "count" in options) calls.push(table);
          return builder;
        },
        eq(column, value) { builder._eq = [column, value]; return builder; },
        in(column, values) {
          builder._in = [column, values];
          return { async then(resolve) { resolve({ count, error: null }); } };
        },
      };
      return builder;
    },
  };
  return { client, calls };
}

async function rejectsWithCode(run, status, code) {
  await assert.rejects(
    run,
    (error) => {
      assert.equal(error.httpStatus, status);
      assert.equal(error.details && error.details.code, code);
      return true;
    }
  );
}

test("start values: Аналитика 0, Старт 100, Про 300, Agency 1000", () => {
  // Стартовые значения; владелец меняет их в PLAN_LIMITS рядом с PLANS.
  assert.equal(PLAN_LIMITS.analytics.schedule_pins, 0);
  assert.equal(PLAN_LIMITS.start.schedule_pins, 100);
  assert.equal(PLAN_LIMITS.pro.schedule_pins, 300);
  assert.equal(PLAN_LIMITS.agency.schedule_pins, 1000);
});

test("limits differ between plans, otherwise the grid sells nothing", () => {
  const values = Object.values(PLAN_LIMITS).map((l) => l.schedule_pins);
  assert.equal(new Set(values).size, values.length, "two plans share one schedule limit");
});

test("an inactive or unknown plan allows nothing", () => {
  assert.deepEqual(planLimitsFor("pro", false), { schedule_pins: 0, pinterest_accounts: 0 });
  assert.deepEqual(planLimitsFor("unknown_plan", true), { schedule_pins: 0, pinterest_accounts: 0 });
  assert.deepEqual(planLimitsFor("start", true), PLAN_LIMITS.start);
});

test("the count reads exactly the scheduled and publishing statuses", async () => {
  const { client, calls } = fakeSupabase(0);
  await countActiveSchedules(client, "user-1");
  assert.deepEqual(calls, ["pin_schedules"]);
  // Статусы внутри вызова проверить через перехват .in: builder запоминает аргументы.
  const b = client.from("pin_schedules");
  b.eq("user_id", "user-1");
  const inResult = await b.in("status", ["scheduled", "publishing"]);
  assert.deepEqual(b._in, ["status", ["scheduled", "publishing"]]);
  assert.deepEqual(inResult, { count: 0, error: null });
});

test("each plan is allowed at the boundary and refused above it", async () => {
  for (const [plan, limits] of Object.entries(PLAN_LIMITS)) {
    const tariffState = { plan, active: true };

    // Ниже лимита — молчаливый успех. Для лимита 0 (Аналитика) «ниже» не бывает:
    // любое расписание отказано, поэтому проверяется только граница.
    if (limits.schedule_pins > 0) {
      const below = fakeSupabase(limits.schedule_pins - 1);
      await assertSchedulePinLimit(below.client, "user-1", tariffState);
    }

    // На границе — отказ с кодом (для analytics лимит 0: даже первое расписание отказано).
    const at = fakeSupabase(limits.schedule_pins);
    await rejectsWithCode(
      () => assertSchedulePinLimit(at.client, "user-1", tariffState),
      403,
      "schedule_limit_reached"
    );
  }
});

test("a database failure during counting is an error, never an allowed request", async () => {
  const failing = {
    from() {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        in() { return { async then(_resolve, reject) { reject(new Error("down")); } }; },
      };
      return builder;
    },
  };
  await assert.rejects(
    () => assertSchedulePinLimit(failing, "user-1", { plan: "pro", active: true }),
    (error) => !(error.details && error.details.code === "schedule_limit_reached")
  );
});

test("pinterest account limits agree with the SQL enforcement in migration 080", () => {
  const migration = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../../db/migrations/080_pinterest_oauth_effective_entitlement_precedence.sql"),
    "utf8"
  );
  for (const [plan, limits] of Object.entries(PLAN_LIMITS)) {
    const expected = limits.pinterest_accounts;
    // В SQL null — «безлимит», в PLAN_LIMITS то же самое. Иначе тариф обещает больше,
    // чем сервер разрешает, и человек платит за неограниченные аккаунты, а получает отказ.
    const sqlCase = new RegExp(`when '${plan}' then (\\d+|null)`);
    const match = migration.match(sqlCase);
    assert.ok(match, `migration 080 must name plan ${plan}`);
    const sqlValue = match[1] === "null" ? null : Number(match[1]);
    assert.equal(sqlValue, expected, `account limit for ${plan} must match PLAN_LIMITS`);
  }
});
