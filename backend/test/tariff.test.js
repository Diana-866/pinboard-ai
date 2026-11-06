const test = require("node:test");
const assert = require("node:assert/strict");

// Supabase client construction needs a syntactically valid URL even though
// these tests inject a fully mocked client and never make network requests.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "test-anon-key";

const { getTariffState } = require("../tariff");

function makeClient({ userResult, subscriptionResult, orderCalls = [] }) {
  function query(result) {
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      order(column, options) {
        orderCalls.push({ column, options });
        return builder;
      },
      limit() { return builder; },
      async single() { return result; },
      async maybeSingle() { return result; },
    };
    return builder;
  }

  return {
    from(table) {
      if (table === "users") return query(userResult);
      if (table === "subscriptions") return query(subscriptionResult);
      throw new Error("Unexpected table: " + table);
    },
  };
}

test("subscription lookup errors fail closed instead of treating the user as manually subscribed", async () => {
  const lookupError = new Error("subscriptions unavailable");
  const client = makeClient({
    userResult: { data: { tariff_plan: "pro", tariff_period_end: null }, error: null },
    subscriptionResult: { data: null, error: lookupError },
  });

  await assert.rejects(getTariffState("user-1", client), lookupError);
});

test("successful subscription selection has deterministic null and tie ordering", async () => {
  const orderCalls = [];
  const client = makeClient({
    userResult: { data: { tariff_plan: "start", tariff_period_end: null }, error: null },
    subscriptionResult: { data: null, error: null },
    orderCalls,
  });

  const state = await getTariffState("user-1", client);
  assert.deepEqual(state, { plan: "start", active: true, periodEnd: null });
  assert.deepEqual(orderCalls, [
    { column: "period_end", options: { ascending: false, nullsFirst: false } },
    { column: "created_at", options: { ascending: false } },
    { column: "id", options: { ascending: false } },
  ]);
});
