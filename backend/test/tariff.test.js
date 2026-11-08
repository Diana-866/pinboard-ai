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

test("manual tariff grants respect an explicitly configured expiry date", async () => {
  const expiredClient = makeClient({
    userResult: {
      data: { tariff_plan: "pro", tariff_period_end: "2020-01-01T00:00:00.000Z" },
      error: null,
    },
    subscriptionResult: { data: null, error: null },
  });
  assert.deepEqual(
    await getTariffState("user-1", expiredClient),
    { plan: "pro", active: false, periodEnd: "2020-01-01T00:00:00.000Z" }
  );

  const unlimitedClient = makeClient({
    userResult: { data: { tariff_plan: "pro", tariff_period_end: null }, error: null },
    subscriptionResult: { data: null, error: null },
  });
  assert.deepEqual(
    await getTariffState("user-1", unlimitedClient),
    { plan: "pro", active: true, periodEnd: null }
  );
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
    { column: "created_at", options: { ascending: false } },
    { column: "id", options: { ascending: false } },
  ]);
});

test("successful subscription is authoritative over stale denormalized user tariff fields", async () => {
  const client = makeClient({
    userResult: {
      data: { tariff_plan: "agency", tariff_period_end: null },
      error: null,
    },
    subscriptionResult: {
      data: {
        plan: "start",
        status: "success",
        period_end: "2020-01-01T00:00:00.000Z",
      },
      error: null,
    },
  });

  assert.deepEqual(
    await getTariffState("user-1", client),
    { plan: "start", active: false, periodEnd: "2020-01-01T00:00:00.000Z" }
  );
});

test("current successful subscription entitlement overrides a stale expired user cache", async () => {
  const futureEnd = new Date(Date.now() + 60_000).toISOString();
  const client = makeClient({
    userResult: {
      data: { tariff_plan: "none", tariff_period_end: "2020-01-01T00:00:00.000Z" },
      error: null,
    },
    subscriptionResult: {
      data: { plan: "pro", status: "success", period_end: futureEnd },
      error: null,
    },
  });

  assert.deepEqual(
    await getTariffState("user-1", client),
    { plan: "pro", active: true, periodEnd: futureEnd }
  );
});

test("no paid subscription and no manual plan is inactive when expiry is null", async () => {
  const client = makeClient({
    userResult: { data: { tariff_plan: "none", tariff_period_end: null }, error: null },
    subscriptionResult: { data: null, error: null },
  });

  assert.deepEqual(
    await getTariffState("user-1", client),
    { plan: "none", active: false, periodEnd: null }
  );
});
