"use strict";

// tariff.js imports the shared Supabase client at load time; the helper supplies inert
// configuration. These tests inject a fully mocked client and never make network requests.
require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");


/**
 * The tariff guard is the product's paywall. getTariffState (the decision) was covered, but the
 * middleware that spends that decision was not: nothing prevented it from letting a request
 * through, from answering a status the client cannot interpret, or from failing open when the
 * database is unreachable. A paywall that fails open is worse than no paywall, so every branch
 * is asserted together with whether `next` ran.
 */

const USER_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function makeClient({ user, subscription }) {
  function query(result) {
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      async single() { return result; },
      async maybeSingle() { return result; },
    };
    return builder;
  }
  return {
    from(table) {
      if (table === "users") return query(user);
      if (table === "subscriptions") return query(subscription);
      throw new Error("Unexpected table: " + table);
    },
  };
}

// The guard reads the shared client, so the shared client is replaced for the test run.
const supabasePath = require.resolve("../supabase");
const realSupabase = require("../supabase");
const tariffPath = require.resolve("../tariff");

function useClient(client) {
  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: client,
  };
  delete require.cache[tariffPath];
  return require("../tariff");
}

test.after(() => {
  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: realSupabase,
  };
  delete require.cache[tariffPath];
});

function runGuard(guard, { userId = USER_ID } = {}) {
  const req = { userId };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let nextCalled = false;
  return guard(req, res, () => { nextCalled = true; })
    .then(() => ({ req, res, nextCalled }));
}

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

test("an expired plan is refused with a code the client can localize", async () => {
  const { requireTariff: guard } = useClient(makeClient({
    user: { data: { tariff_plan: "pro", tariff_period_end: PAST }, error: null },
    subscription: { data: { plan: "pro", status: "success", period_end: PAST }, error: null },
  }));

  const { res, nextCalled, req } = await runGuard(guard());

  assert.equal(nextCalled, false, "an inactive plan must never reach the route");
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "tariff_required");
  assert.equal(res.body.upgrade_url, "/pricing", "the client needs a place to send the customer");
  assert.equal(res.body.current_plan, "pro");
  assert.deepEqual(res.body.required_plans, ["start", "pro", "agency"]);
  assert.equal(req.tariff, undefined, "a refused request must not carry tariff state");
});

test("an active plan that does not include generation is refused as insufficient", async () => {
  const { requireTariff: guard } = useClient(makeClient({
    user: { data: { tariff_plan: "analytics", tariff_period_end: FUTURE }, error: null },
    subscription: { data: null, error: null },
  }));

  const { res, nextCalled } = await runGuard(guard());

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "tariff_insufficient");
  assert.equal(res.body.current_plan, "analytics");
  // The two refusals must be distinguishable: "expired" and "wrong plan" need different actions.
  assert.notEqual(res.body.code, "tariff_required");
});

test("a plan that includes generation passes and carries its state forward", async () => {
  const { requireTariff: guard } = useClient(makeClient({
    user: { data: { tariff_plan: "start", tariff_period_end: FUTURE }, error: null },
    subscription: { data: null, error: null },
  }));

  const { res, nextCalled, req } = await runGuard(guard());

  assert.equal(nextCalled, true, "an allowed request must reach the route");
  assert.equal(res.statusCode, null, "an allowed request must not write a response");
  assert.equal(req.tariff.plan, "start");
  assert.equal(req.tariff.active, true);
});

test("the legacy plan name is accepted wherever its replacement is", async () => {
  const { requireTariff: guard } = useClient(makeClient({
    user: { data: { tariff_plan: "standard", tariff_period_end: FUTURE }, error: null },
    subscription: { data: null, error: null },
  }));

  const { nextCalled } = await runGuard(guard(["pro"]));

  assert.equal(nextCalled, true, "a stored 'standard' row must keep working as 'pro'");
});

test("a route may narrow the guard to one plan", async () => {
  const { requireTariff: guard } = useClient(makeClient({
    user: { data: { tariff_plan: "start", tariff_period_end: FUTURE }, error: null },
    subscription: { data: null, error: null },
  }));

  const { res, nextCalled } = await runGuard(guard(["agency"]));

  assert.equal(nextCalled, false);
  assert.equal(res.body.code, "tariff_insufficient");
  assert.deepEqual(res.body.required_plans, ["agency"]);
});

test("a database failure fails closed and never exposes the raw error", async () => {
  const { requireTariff: guard } = useClient(makeClient({
    user: { data: null, error: { code: "08006", message: "connection failure to db-host" } },
    subscription: { data: null, error: null },
  }));

  const { res, nextCalled } = await runGuard(guard());

  assert.equal(nextCalled, false, "an unreadable tariff must never grant access");
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /db-host|08006|connection failure/);
});

test("a subscription lookup failure also fails closed", async () => {
  const { requireTariff: guard } = useClient(makeClient({
    user: { data: { tariff_plan: "pro", tariff_period_end: FUTURE }, error: null },
    subscription: { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } },
  }));

  const { res, nextCalled } = await runGuard(guard());

  assert.equal(nextCalled, false, "a slow subscription lookup must not grant access");
  assert.equal(res.statusCode, 500);
});
