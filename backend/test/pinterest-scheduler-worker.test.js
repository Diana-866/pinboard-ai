"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");

/**
 * The scheduler worker publishes a customer's pin at the time they chose, without anyone
 * watching. It was covered only by a static route-contract test: no branch of it had ever run,
 * and every decision in it - which schedule becomes "failed", which stays "unknown", what a
 * retry is allowed to assume - is invisible to the customer until it is wrong.
 *
 * The worker is mounted on a real express app and called over HTTP. publishPin and the schedule
 * policy helpers stay real; only Supabase, axios and the tariff lookup are doubled.
 */

process.env.PINTEREST_CLIENT_ID = "client-id";
process.env.PINTEREST_CLIENT_SECRET = "client-secret";
process.env.PINTEREST_REDIRECT_URI = "https://api.example.com/integrations/pinterest/callback";
process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
process.env.PINPOSY_SCHEDULER_SECRET = "s".repeat(40);

const supabasePath = require.resolve("../supabase");
const axiosPath = require.resolve("axios");
const tariffPath = require.resolve("../tariff");
const pinterestPath = require.resolve("../pinterest");
const rateLimitPath = require.resolve("../pinterestRateLimit");
const { encryptToken } = require("../pinterestTokenCrypto");
const { respondWithError } = require("../httpErrorResponse");

const USER_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ACCOUNT_ID = "8f2c1c8e-4a52-4a1f-9d43-1f0e4c3b7a11";
const PIN_ID = "7c1d9b52-9a48-4c1f-8f0a-9f2f5c6d1e33";
const SCHEDULE_ID = "5d0f8a3e-2b41-4c7d-9e6a-1c2b3d4e5f60";
const BOARD_ID = "999888777";
const CLAIM_TOKEN = "claim-token-1";
const REMOTE_PIN_ID = "1122334455";

function scheduleRow(overrides = {}) {
  return {
    id: SCHEDULE_ID,
    user_id: USER_ID,
    pin_id: PIN_ID,
    pinterest_account_id: ACCOUNT_ID,
    pinterest_board_id: BOARD_ID,
    claim_token: CLAIM_TOKEN,
    attempts: 1,
    destination_url: "https://shop.example.com/soup",
    ...overrides,
  };
}

function createDouble() {
  const state = {
    schedules: [],
    pin: {
      id: PIN_ID,
      board_id: "board-uuid",
      title: "Осенний рецепт",
      description: "Тыквенный суп",
      image_url: "https://cdn.example.com/pin.jpg",
      status: "approved",
      boards: { id: "board-uuid", projects: { id: "p", user_id: USER_ID, website_url: "https://shop.example.com" } },
    },
    account: {
      id: ACCOUNT_ID,
      user_id: USER_ID,
      username: "pinposy",
      access_token: encryptToken("ptoken-1"),
      refresh_token: encryptToken("rtoken-1"),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      disconnected_at: null,
      refresh_state: "ready",
      updated_at: "2026-11-18T00:00:00.000Z",
      pinterest_user_id: "pinterest-user-1",
    },
    attempt: null,
    ledger: null,
    rpc: {},
    rpcCalls: [],
    axiosCalls: [],
    axiosGet: {},
    postResponses: [],
    scheduleUpdates: [],
    scheduleUpdateResult: undefined,
    tariff: { active: true, plan: "pro" },
  };

  function builder(table) {
    const ops = [];
    const self = {
      select(columns) { ops.push(["select", columns]); return self; },
      update(values) { ops.push(["update", values]); return self; },
      eq(column, value) { ops.push(["eq", column, value]); return self; },
      is(column, value) { ops.push(["is", column, value]); return self; },
      not(column, operator, value) { ops.push(["not", column, operator, value]); return self; },
      order(column, options) { ops.push(["order", column, options]); return self; },
      limit(value) { ops.push(["limit", value]); return self; },
      async maybeSingle() {
        if (table === "pins") return { data: state.pin, error: null };
        if (table === "pinterest_accounts") return { data: state.account, error: null };
        if (table === "pinterest_publish_attempts") return { data: state.attempt, error: null };
        if (table === "pinterest_publications") return { data: state.ledger, error: null };
        if (table === "pin_schedules") {
          if (ops.some(([op]) => op === "update")) {
            state.scheduleUpdates.push(ops);
            if (state.scheduleUpdateResult !== undefined) return state.scheduleUpdateResult;
            return { data: { id: SCHEDULE_ID }, error: null };
          }
          return { data: null, error: null };
        }
        throw new Error(`unexpected table ${table}`);
      },
      then(resolve, reject) {
        if (table === "pinterest_accounts") {
          return Promise.resolve({ data: state.account ? [state.account] : [], error: null }).then(resolve, reject);
        }
        return Promise.resolve(self.maybeSingle()).then(resolve, reject);
      },
    };
    return self;
  }

  const supabase = {
    from(table) {
      const allowed = ["pins", "pinterest_accounts", "pinterest_publish_attempts", "pinterest_publications", "pin_schedules"];
      if (!allowed.includes(table)) throw new Error(`unexpected table ${table}`);
      return builder(table);
    },
    async rpc(name, params) {
      state.rpcCalls.push({ name, params });
      const handler = state.rpc[name];
      if (!handler) throw new Error(`unexpected rpc ${name}`);
      return handler(params);
    },
  };

  const axios = async (config) => {
    state.axiosCalls.push(config);
    const url = String(config.url || "");
    if (url.endsWith(`/boards/${BOARD_ID}`)) return { status: 200, data: { id: BOARD_ID } };
    if (url.endsWith("/pins")) {
      const scripted = state.postResponses.shift();
      if (!scripted) throw new Error("unexpected POST /pins");
      return scripted;
    }
    if (state.axiosGet[url]) return state.axiosGet[url];
    throw new Error(`unexpected axios call ${url}`);
  };
  axios.post = async () => { throw new Error("unexpected axios.post"); };

  return { state, supabase, axios };
}

async function startWorker(configure) {
  const double = createDouble();
  const { state } = double;

  state.rpc.begin_pinterest_scheduler_run = async () => ({ data: true, error: null });
  state.rpc.reconcile_confirmed_pinterest_schedule_successes = async () => ({ data: null, error: null });
  state.rpc.claim_due_pin_schedules = async () => ({ data: state.schedules, error: null });
  state.rpc.renew_pin_schedule_claim = async () => ({ data: true, error: null });
  state.rpc.complete_pinterest_scheduler_run = async () => ({ data: true, error: null });
  state.rpc.begin_scheduled_pinterest_publish = async () => ({ data: { status: "started" }, error: null });
  state.rpc.complete_pinterest_publish_v2 = async () => ({ data: null, error: null });
  state.rpc.fail_pinterest_publish_v2 = async () => ({ data: null, error: null });
  state.rpc.record_pinterest_publish_unknown_v2 = async () => ({ data: true, error: null });

  // Defaults first, then the scenario: a configure() that ran earlier was silently overwritten
  // by these defaults, which made three tests pass against the wrong double.
  if (typeof configure === "function") configure(state);

  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: double.supabase };
  require.cache[axiosPath] = { id: axiosPath, filename: axiosPath, loaded: true, exports: double.axios };
  const realTariff = require("../tariff");
  require.cache[tariffPath] = {
    id: tariffPath,
    filename: tariffPath,
    loaded: true,
    exports: { ...realTariff, getTariffState: async () => state.tariff },
  };
  delete require.cache[pinterestPath];
  delete require.cache[rateLimitPath];

  const express = require("express");
  const pinterest = require("../pinterest");
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.userId = USER_ID; next(); });
  pinterest.registerRoutes(app, {
    requireAuth: (req, res, next) => next(),
    requireTariff: () => (req, res, next) => next(),
    handleError: (res, error) => respondWithError(res, error),
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    state,
    pinterest,
    base: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      server.closeAllConnections?.();
      server.close();
      await once(server, "close");
    },
  };
}

async function runWorker(worker) {
  const response = await fetch(`${worker.base}/internal/pinterest/schedule/run`, {
    method: "POST",
    headers: { "x-pinposy-scheduler-secret": process.env.PINPOSY_SCHEDULER_SECRET },
  });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
}

function completedRuns(state) {
  return state.rpcCalls.filter((call) => call.name === "complete_pinterest_scheduler_run");
}

test("an empty queue is a successful run with zeros, not a failure", async () => {
  const worker = await startWorker();
  try {
    const { status, body } = await runWorker(worker);
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, claimed: 0, published: 0, failed: 0, scheduled: 0, unknown: 0, results: [] });
    const completes = completedRuns(worker.state);
    assert.equal(completes.length, 1);
    assert.equal(completes[0].params.p_status, "succeeded");
    assert.equal(completes[0].params.p_claimed, 0);
  } finally {
    await worker.close();
  }
});

test("a malformed claim batch is a failed run, never an empty queue", async () => {
  for (const malformed of [null, undefined, {}, "[]", [{ id: SCHEDULE_ID }]]) {
    const worker = await startWorker((state) => {
      state.schedules = [];
      state.rpc.claim_due_pin_schedules = async () => ({ data: malformed, error: null });
    });
    try {
      const { status, body } = await runWorker(worker);
      assert.equal(status, 500, `claim ${JSON.stringify(malformed)}`);
      assert.deepEqual(body, { error: "Pinterest schedule worker failed" });
      const completes = completedRuns(worker.state);
      assert.equal(completes.length, 1, `claim ${JSON.stringify(malformed)}`);
      assert.equal(completes[0].params.p_status, "failed", "an unreadable claim must be recorded as a failed run");
      assert.deepEqual(worker.state.axiosCalls, [], "nothing may be published from an unreadable claim");
    } finally {
      await worker.close();
    }
  }
});

test("a run whose start the monitor did not confirm never claims work", async () => {
  const worker = await startWorker((state) => {
    state.rpc.begin_pinterest_scheduler_run = async () => ({ data: false, error: null });
  });
  try {
    const { status } = await runWorker(worker);
    assert.equal(status, 500);
    assert.deepEqual(
      worker.state.rpcCalls.filter((call) => call.name === "claim_due_pin_schedules"),
      [],
      "without a confirmed run start, work must not be claimed"
    );
    assert.deepEqual(completedRuns(worker.state), [], "a run that never started must not be completed");
  } finally {
    await worker.close();
  }
});

test("a schedule whose owner's plan lapsed fails without touching Pinterest", async () => {
  const worker = await startWorker((state) => {
    state.schedules = [scheduleRow()];
    state.tariff = { active: false, plan: "none" };
  });
  try {
    const { status, body } = await runWorker(worker);
    assert.equal(status, 200);
    assert.equal(body.claimed, 1);
    assert.equal(body.failed, 1);
    assert.equal(body.results[0].status, "failed");
    assert.deepEqual(worker.state.axiosCalls, [], "an expired subscription must stop before Pinterest");

    const [, values] = worker.state.scheduleUpdates[0].find(([op]) => op === "update");
    assert.equal(values.status, "failed");
    assert.equal(values.next_attempt_at, null, "an entitlement failure is not retried on a timer");
    assert.equal(values.claim_token, null, "the claim must be released");
    assert.match(values.last_error, /активная подписка/);
  } finally {
    await worker.close();
  }
});

test("a due schedule is published once and reported as published", async () => {
  const worker = await startWorker((state) => {
    state.schedules = [scheduleRow()];
    state.postResponses.push({ status: 201, data: { id: REMOTE_PIN_ID } });
  });
  try {
    const { status, body } = await runWorker(worker);
    assert.equal(status, 200);
    assert.equal(body.published, 1);
    assert.deepEqual(body.results, [{ schedule_id: SCHEDULE_ID, status: "published" }]);
    assert.equal(
      worker.state.axiosCalls.filter((call) => String(call.url).endsWith("/pins")).length,
      1,
      "a single due schedule means a single pin"
    );
    assert.deepEqual(
      worker.state.scheduleUpdates,
      [],
      "the completion RPC already finalized the schedule; a second update with a consumed claim would fail"
    );
    const completes = completedRuns(worker.state);
    assert.equal(completes[0].params.p_published, 1);
    assert.equal(completes[0].params.p_status, "succeeded");
  } finally {
    await worker.close();
  }
});

test("a schedule whose claim was taken over leaves the row unfinished instead of claiming a verdict", async () => {
  const worker = await startWorker((state) => {
    state.schedules = [scheduleRow()];
    state.postResponses.push({ status: 201, data: { id: REMOTE_PIN_ID } });
    // The heartbeat sees the claim gone immediately before the POST fence.
    state.rpc.renew_pin_schedule_claim = async () => ({ data: false, error: null });
    // A competitor finalized it, so this worker's conditional update matches nothing.
    state.scheduleUpdateResult = { data: null, error: null };
  });
  try {
    const { status, body } = await runWorker(worker);
    assert.equal(status, 200);
    assert.equal(body.unknown, 1);
    assert.equal(body.results[0].status, "unknown");
    assert.deepEqual(
      worker.state.axiosCalls.filter((call) => String(call.url).endsWith("/pins")),
      [],
      "a lost claim must abort before the remote publish"
    );
  } finally {
    await worker.close();
  }
});

test("an unknown attempt that already has a remote id is completed instead of left unknown", async () => {
  const worker = await startWorker((state) => {
    state.schedules = [scheduleRow()];
    // The previous run reached Pinterest but lost its local commit.
    state.attempt = {
      user_id: USER_ID,
      pin_id: PIN_ID,
      pinterest_account_id: ACCOUNT_ID,
      pinterest_board_id: BOARD_ID,
      status: "unknown",
      pinterest_pin_id: REMOTE_PIN_ID,
      retry_safe: false,
    };
    state.rpc.begin_scheduled_pinterest_publish = async () => ({ data: { status: "unknown" }, error: null });
    // The completion RPC answers with the durable publication; anything less is not a recovery.
    state.rpc.complete_pinterest_publish_v2 = async () => ({
      data: { status: "published", pinterest_pin_id: REMOTE_PIN_ID, pinterest_board_id: BOARD_ID },
      error: null,
    });
  });
  try {
    const { body } = await runWorker(worker);
    assert.equal(body.published, 1);
    const completion = worker.state.rpcCalls.filter((call) => call.name === "complete_pinterest_publish_v2")[0];
    assert.equal(completion.params.p_pinterest_pin_id, REMOTE_PIN_ID);
    assert.equal(completion.params.p_pinterest_board_id, BOARD_ID);
  } finally {
    await worker.close();
  }
});

test("a completion that answers with a different publication does not count as recovered", async () => {
  // The completion RPC is not trusted by status alone: if it reports another pin or another
  // board, marking this schedule published would attach a stranger's pin to the customer's board.
  const cases = [
    [{ status: "published", pinterest_pin_id: "999", pinterest_board_id: BOARD_ID }, "another pin"],
    [{ status: "published", pinterest_pin_id: REMOTE_PIN_ID, pinterest_board_id: "111" }, "another board"],
    [{ status: "processing", pinterest_pin_id: REMOTE_PIN_ID, pinterest_board_id: BOARD_ID }, "not yet published"],
  ];

  for (const [answer, label] of cases) {
    const worker = await startWorker((state) => {
      state.schedules = [scheduleRow()];
      state.attempt = {
        user_id: USER_ID,
        pin_id: PIN_ID,
        pinterest_account_id: ACCOUNT_ID,
        pinterest_board_id: BOARD_ID,
        status: "unknown",
        pinterest_pin_id: REMOTE_PIN_ID,
        retry_safe: false,
      };
      state.rpc.begin_scheduled_pinterest_publish = async () => ({ data: { status: "unknown" }, error: null });
      state.rpc.complete_pinterest_publish_v2 = async () => ({ data: answer, error: null });
    });
    try {
      const { body } = await runWorker(worker);
      assert.equal(body.published, 0, `${label} must not be reported as published`);
      assert.equal(body.results[0].status, "unknown", label);
      assert.deepEqual(
        worker.state.axiosCalls.filter((call) => String(call.url).endsWith("/pins")),
        [],
        `${label}: the pin must not be created again while the outcome is unconfirmed`
      );
    } finally {
      await worker.close();
    }
  }
});

test("a completion that is lost in transport but confirmed by the ledger counts as recovered", async () => {
  const worker = await startWorker((state) => {
    state.schedules = [scheduleRow()];
    state.attempt = {
      user_id: USER_ID,
      pin_id: PIN_ID,
      pinterest_account_id: ACCOUNT_ID,
      pinterest_board_id: BOARD_ID,
      status: "unknown",
      pinterest_pin_id: REMOTE_PIN_ID,
      retry_safe: false,
    };
    state.rpc.begin_scheduled_pinterest_publish = async () => ({ data: { status: "unknown" }, error: null });
    state.rpc.complete_pinterest_publish_v2 = async () => ({ data: null, error: { message: "connection lost" } });
    state.ledger = {
      user_id: USER_ID,
      pin_id: PIN_ID,
      pinterest_account_id: ACCOUNT_ID,
      pinterest_board_id: BOARD_ID,
      pinterest_pin_id: REMOTE_PIN_ID,
    };
  });
  try {
    const { body } = await runWorker(worker);
    assert.equal(body.published, 1);
    assert.deepEqual(body.results, [{ schedule_id: SCHEDULE_ID, status: "published", recovered: true }]);
  } finally {
    await worker.close();
  }
});

test("a provider rejection with no evidence of a pin becomes a retryable schedule", async () => {
  const worker = await startWorker((state) => {
    state.schedules = [scheduleRow()];
    // 502 from the provider with no journal row: safe to try again later.
    state.postResponses.push({ status: 400, data: { message: "bad media" } });
    state.attempt = null;
  });
  try {
    const { body } = await runWorker(worker);
    assert.equal(body.scheduled, 1, `expected a retry, got ${JSON.stringify(body.results)}`);
    const [, values] = worker.state.scheduleUpdates[0].find(([op]) => op === "update");
    assert.equal(values.status, "scheduled");
    assert.ok(values.next_attempt_at, "a retry needs a time");
    assert.equal(values.pinterest_pin_id, null);
  } finally {
    await worker.close();
  }
});

test("a published run whose monitor did not confirm is not reported as success", async () => {
  const worker = await startWorker((state) => {
    state.schedules = [scheduleRow()];
    state.postResponses.push({ status: 201, data: { id: REMOTE_PIN_ID } });
    state.rpc.complete_pinterest_scheduler_run = async () => ({ data: false, error: null });
  });
  try {
    const { status, body } = await runWorker(worker);
    assert.equal(status, 500);
    assert.deepEqual(body, { error: "Pinterest schedule worker failed" });
    assert.equal(
      worker.state.axiosCalls.filter((call) => String(call.url).endsWith("/pins")).length,
      1,
      "the publication itself happened exactly once"
    );
  } finally {
    await worker.close();
  }
});
