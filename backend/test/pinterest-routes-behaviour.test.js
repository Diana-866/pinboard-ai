"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");

/**
 * The Pinterest route layer (registerRoutes, ~560 lines) was executed by no test at all:
 * its existence was asserted by reading the source. Route handlers are where a validation
 * decision turns into a status code the customer sees, so they are worth running.
 *
 * These tests mount the real router on a real express app and talk to it over HTTP. Only the
 * I/O boundaries are doubled: Supabase, axios and the tariff lookup. Everything else — the
 * OAuth state signing, the browser-binding cookie, the account decoding, the error writer —
 * is the production code.
 */

process.env.PINTEREST_CLIENT_ID = "client-id";
process.env.PINTEREST_CLIENT_SECRET = "client-secret";
process.env.PINTEREST_REDIRECT_URI = "https://api.example.com/integrations/pinterest/callback";
process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
process.env.FRONTEND_URL = "https://app.example.com";

const supabasePath = require.resolve("../supabase");
const axiosPath = require.resolve("axios");
const tariffPath = require.resolve("../tariff");
const pinterestPath = require.resolve("../pinterest");
const rateLimitPath = require.resolve("../pinterestRateLimit");
const { encryptToken } = require("../pinterestTokenCrypto");
const { respondWithError } = require("../httpErrorResponse");
const { COOKIE_NAME, createBrowserBinding } = require("../pinterestOAuthBrowserBinding");

const USER_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ACCOUNT_ID = "8f2c1c8e-4a52-4a1f-9d43-1f0e4c3b7a11";
const SECOND_ACCOUNT_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function accountRow(overrides = {}) {
  return {
    id: ACCOUNT_ID,
    user_id: USER_ID,
    username: "pinposy",
    access_token: encryptToken("ptoken-1"),
    refresh_token: encryptToken("rtoken-1"),
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    pinterest_user_id: "pinterest-user-1",
    disconnected_at: null,
    refresh_state: "ready",
    updated_at: "2026-11-18T00:00:00.000Z",
    scopes: "pins:read,pins:write",
    ...overrides,
  };
}

function createDouble() {
  const state = {
    accounts: [accountRow()],
    accountError: null,
    user: { token_version: 0 },
    userError: null,
    pin: {
      id: "pin-1",
      board_id: "board-uuid",
      title: "Пин",
      description: "Описание",
      image_url: "https://cdn.example.com/pin.jpg",
      status: "approved",
      boards: { id: "board-uuid", projects: { id: "project-uuid", user_id: USER_ID, website_url: "https://shop.example.com" } },
    },
    rpc: {},
    rpcCalls: [],
    tariff: { active: true, plan: "pro" },
    axiosGet: {},
    tokenResponse: { access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, scope: "pins:read" },
    tokenStatus: 200,
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
        if (table === "users") return { data: state.userError ? null : state.user, error: state.userError };
        if (table === "pins") return { data: state.pin, error: null };
        if (table === "pinterest_accounts") {
          if (ops.some(([op]) => op === "update")) return { data: state.accounts[0] || null, error: null };
          const wanted = ops.filter(([op]) => op === "eq" && ops.some(([o]) => o === "eq")) .find(([op, column]) => column === "id");
          const rows = wanted ? state.accounts.filter((row) => row.id === wanted[2]) : state.accounts;
          return { data: rows[0] || null, error: state.accountError };
        }
        return { data: null, error: null };
      },
      then(resolve, reject) {
        if (table === "pinterest_accounts" && !ops.some(([op]) => op === "update")) {
          return Promise.resolve({ data: state.accountError ? null : state.accounts, error: state.accountError }).then(resolve, reject);
        }
        return Promise.resolve(self.maybeSingle()).then(resolve, reject);
      },
    };
    return self;
  }

  const supabase = {
    from(table) {
      if (!["users", "pinterest_accounts", "pins"].includes(table)) throw new Error(`unexpected table ${table}`);
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
    const url = String(config.url || "");
    const key = `${config.method || "get"} ${url.replace("https://api.pinterest.com/v5", "")}`;
    if (state.axiosGet[key]) return state.axiosGet[key];
    throw new Error(`unexpected axios call ${config.method} ${url}`);
  };
  axios.post = async (url) => {
    if (String(url).includes("oauth/token")) {
      if (state.tokenStatus !== 200) return { status: state.tokenStatus, data: { error: "invalid_grant" } };
      return { status: 200, data: state.tokenResponse };
    }
    throw new Error(`unexpected axios.post ${url}`);
  };

  return { state, supabase, axios };
}

let activeUser = USER_ID;

async function startApp(configure) {
  const double = createDouble();
  if (typeof configure === "function") configure(double.state);

  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: double.supabase };
  require.cache[axiosPath] = { id: axiosPath, filename: axiosPath, loaded: true, exports: double.axios };
  // The real tariff module is replaced only at its I/O boundary: plan normalization and the
  // account-limit table stay the production ones.
  const realTariff = require("../tariff");
  require.cache[tariffPath] = {
    id: tariffPath,
    filename: tariffPath,
    loaded: true,
    exports: { ...realTariff, getTariffState: async () => double.state.tariff },
  };
  delete require.cache[pinterestPath];
  delete require.cache[rateLimitPath];

  const express = require("express");
  const pinterest = require("../pinterest");
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.userId = activeUser; next(); });
  pinterest.registerRoutes(app, {
    requireAuth: (req, res, next) => next(),
    requireTariff: () => (req, res, next) => next(),
    handleError: (res, error) => respondWithError(res, error),
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    state: double.state,
    pinterest,
    base,
    close: async () => {
      server.closeAllConnections?.();
      server.close();
      await once(server, "close");
    },
  };
}

async function getJson(app, path, init) {
  const response = await fetch(`${app.base}${path}`, { redirect: "manual", ...init });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body, headers: response.headers };
}

activeUser = USER_ID;

test("status is reported without tokens, and a plan without a limit says so", async () => {
  const app = await startApp();
  try {
    const { status, body } = await getJson(app, "/integrations/pinterest/status");
    assert.equal(status, 200);
    assert.equal(body.configured, true);
    assert.equal(body.connected, true);
    assert.equal(body.account_count, 1);
    assert.equal(body.account_limit, 10, "pro allows ten accounts");
    assert.equal(body.username, "pinposy");
    assert.equal(body.needs_reauth, false);
    // The whole point of this route: it must never hand a token back.
    assert.doesNotMatch(JSON.stringify(body), /ptoken-1|rtoken-1|access_token/);
  } finally {
    await app.close();
  }
});

test("an inactive tariff reports a zero account limit instead of the plan's allowance", async () => {
  const app = await startApp((state) => { state.tariff = { active: false, plan: "pro" }; });
  try {
    const { body } = await getJson(app, "/integrations/pinterest/status");
    assert.equal(body.connected, true);
    assert.equal(body.account_limit, 0, "a lapsed subscription must not keep its allowance");
  } finally {
    await app.close();
  }
});

test("an unconfigured deployment answers instead of failing", async () => {
  const originalId = process.env.PINTEREST_CLIENT_ID;
  delete process.env.PINTEREST_CLIENT_ID;
  const app = await startApp();
  try {
    const { status, body } = await getJson(app, "/integrations/pinterest/status");
    assert.equal(status, 200);
    assert.deepEqual(body, { configured: false, connected: false });
  } finally {
    process.env.PINTEREST_CLIENT_ID = originalId;
    await app.close();
  }
});

test("the connect link returns a signed state and a browser binding, and never a token", async () => {
  const app = await startApp((state) => {
    state.rpc.begin_pinterest_oauth_attempt = async () => ({ data: 7, error: null });
  });
  try {
    const { status, body } = await getJson(app, "/integrations/pinterest/link", { method: "POST" });
    assert.equal(status, 200);
    assert.match(body.start_url, /^https:\/\/api\.example\.com\/integrations\/pinterest\/start$/);
    assert.equal(typeof body.state, "string");
    assert.equal(typeof body.browser_binding_secret, "string");
    assert.match(body.browser_binding_secret, /^[A-Za-z0-9_-]{40,50}$/);
    const claims = app.pinterest.readStateClaims
      ? app.pinterest.readStateClaims(body.state)
      : null;
    // The raw binding secret must not travel inside the state itself.
    assert.doesNotMatch(body.state, new RegExp(body.browser_binding_secret));
    if (claims) assert.doesNotMatch(JSON.stringify(claims), new RegExp(body.browser_binding_secret));
    assert.doesNotMatch(JSON.stringify(body), /access_token|refresh_token/);
  } finally {
    await app.close();
  }
});

test("a missing user row is refused when starting a connection", async () => {
  const app = await startApp((state) => { state.user = null; });
  try {
    const { status, body } = await getJson(app, "/integrations/pinterest/link", { method: "POST" });
    assert.equal(status, 401);
    assert.equal(body.error, "Не авторизован");
    assert.deepEqual(app.state.rpcCalls, [], "no attempt may be registered for a user that does not exist");
  } finally {
    await app.close();
  }
});

test("an OAuth attempt that the database refuses is a retryable 503, not a broken state", async () => {
  const app = await startApp((state) => {
    state.rpc.begin_pinterest_oauth_attempt = async () => ({ data: null, error: null });
  });
  try {
    const { status, body } = await getJson(app, "/integrations/pinterest/link", { method: "POST" });
    assert.equal(status, 503);
    assert.equal(body.code, "pinterest_unavailable");
  } finally {
    await app.close();
  }
});

test("the start step refuses a binding that is not the one it signed, and sets the cookie when it is", async () => {
  const app = await startApp((state) => {
    state.rpc.begin_pinterest_oauth_attempt = async () => ({ data: 7, error: null });
  });
  try {
    const link = await getJson(app, "/integrations/pinterest/link", { method: "POST" });
    const form = (values) => ({
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values).toString(),
    });

    const refused = await fetch(`${app.base}/integrations/pinterest/start`, {
      redirect: "manual",
      ...form({ state: link.body.state, browser_binding_secret: "A".repeat(43) }),
    });
    assert.equal(refused.status, 400);
    const refusedText = await refused.text();
    assert.match(refusedText, /could not be started/);
    assert.match(refusedText, /Return to PinPosy/);
    assert.equal(refused.headers.get("set-cookie"), null, "a rejected binding must not plant a cookie");

    const accepted = await fetch(`${app.base}/integrations/pinterest/start`, {
      redirect: "manual",
      ...form({ state: link.body.state, browser_binding_secret: link.body.browser_binding_secret }),
    });
    assert.equal(accepted.status, 302);
    const location = new URL(accepted.headers.get("location"));
    assert.equal(location.origin + location.pathname, "https://www.pinterest.com/oauth/");
    assert.equal(location.searchParams.get("client_id"), "client-id");
    assert.equal(location.searchParams.get("redirect_uri"), process.env.PINTEREST_REDIRECT_URI);
    assert.equal(location.searchParams.get("state"), link.body.state);
    assert.match(location.searchParams.get("scope"), /pins:read/);
    const cookie = accepted.headers.get("set-cookie");
    assert.match(cookie, new RegExp(`^${COOKIE_NAME}=`));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
  } finally {
    await app.close();
  }
});

test("the callback always lands back in the app with a verdict and never leaks a token", async () => {
  const cases = [
    {
      label: "access denied at Pinterest",
      state: null,
      expected: "denied",
      prepare: (state) => {
        state.axiosGet["GET /user_account"] = { status: 200, data: { id: "pinterest-user-1", username: "pinposy" } };
      },
    },
    {
      label: "no code and no error",
      state: null,
      expected: "error",
      prepare: (state) => {
        state.axiosGet["GET /user_account"] = { status: 200, data: { id: "pinterest-user-1", username: "pinposy" } };
      },
    },
    {
      label: "plan no longer active",
      state: null,
      expected: "plan_required",
      prepare: (state) => {
        state.tariff = { active: false, plan: "none" };
        state.axiosGet["GET /user_account"] = { status: 200, data: { id: "pinterest-user-1", username: "pinposy" } };
      },
    },
    {
      label: "account limit reached",
      state: null,
      expected: "limit",
      prepare: (state) => {
        state.axiosGet["GET /user_account"] = { status: 200, data: { id: "pinterest-user-1", username: "pinposy" } };
        state.rpc.commit_pinterest_oauth_attempt_v2 = async () => ({ data: { ok: false, reason: "account_limit_reached" }, error: null });
      },
    },
    {
      label: "stale attempt",
      state: null,
      expected: "error",
      prepare: (state) => {
        state.axiosGet["GET /user_account"] = { status: 200, data: { id: "pinterest-user-1", username: "pinposy" } };
        state.rpc.commit_pinterest_oauth_attempt_v2 = async () => ({ data: { ok: false, reason: "attempt_superseded" }, error: null });
      },
    },
    {
      label: "successful connection",
      state: null,
      expected: "connected",
      prepare: (state) => {
        state.rpc.commit_pinterest_oauth_attempt_v2 = async () => ({ data: { ok: true }, error: null });
        state.axiosGet["GET /user_account"] = { status: 200, data: { id: "pinterest-user-1", username: "pinposy" } };
      },
    },
  ];

  for (const scenario of cases) {
    const app = await startApp((state) => {
      state.rpc.begin_pinterest_oauth_attempt = async () => ({ data: 7, error: null });
      scenario.prepare(state);
    });
    try {
      const link = await getJson(app, "/integrations/pinterest/link", { method: "POST" });
      const binding = link.body.browser_binding_secret;
      const state = link.body.state;
      const extra = scenario.label === "access denied at Pinterest"
        ? "&error=access_denied"
        : scenario.label === "no code and no error" ? "" : "&code=auth-code-1";

      const response = await fetch(
        `${app.base}/integrations/pinterest/callback?state=${encodeURIComponent(state)}${extra}`,
        { redirect: "manual", headers: { cookie: `${COOKIE_NAME}=${binding}` } }
      );
      assert.equal(response.status, 302, scenario.label);
      const location = response.headers.get("location");
      assert.match(location, new RegExp(`pinterest=${scenario.expected}$`), `${scenario.label}: ${location}`);
      assert.doesNotMatch(location, /new-access|new-refresh|access_token|refresh_token/, scenario.label);
      const cookie = response.headers.get("set-cookie");
      assert.match(cookie, /Max-Age=0/, `${scenario.label}: the one-time binding must be cleared`);
    } finally {
      await app.close();
    }
  }
});

test("a callback completed in another browser is refused and no token is exchanged", async () => {
  // Everything after the binding check is configured to succeed, so the only thing that can
  // stop this callback is the missing browser proof. Without that, the test would pass on a
  // later failure and the check itself would stay unverified.
  const app = await startApp((state) => {
    state.rpc.begin_pinterest_oauth_attempt = async () => ({ data: 7, error: null });
    state.rpc.commit_pinterest_oauth_attempt_v2 = async () => ({ data: { ok: true }, error: null });
    state.axiosGet["GET /user_account"] = { status: 200, data: { id: "pinterest-user-1", username: "pinposy" } };
  });
  try {
    const link = await getJson(app, "/integrations/pinterest/link", { method: "POST" });
    const response = await fetch(
      `${app.base}/integrations/pinterest/callback?state=${encodeURIComponent(link.body.state)}&code=auth-code-1`,
      { redirect: "manual" }
    );
    assert.equal(response.status, 302);
    assert.match(response.headers.get("location"), /pinterest=error$/);
    assert.equal(app.state.tokenStatus, 200);
    assert.deepEqual(
      app.state.rpcCalls.filter((call) => call.name === "commit_pinterest_oauth_attempt_v2"),
      [],
      "a callback without the browser proof must not store credentials"
    );
  } finally {
    await app.close();
  }
});

test("a rejected code at the provider is not stored and lands on the error verdict", async () => {
  const app = await startApp((state) => {
    state.rpc.begin_pinterest_oauth_attempt = async () => ({ data: 7, error: null });
    state.tokenStatus = 400;
  });
  try {
    const link = await getJson(app, "/integrations/pinterest/link", { method: "POST" });
    const response = await fetch(
      `${app.base}/integrations/pinterest/callback?state=${encodeURIComponent(link.body.state)}&code=bad-code`,
      { redirect: "manual", headers: { cookie: `${COOKIE_NAME}=${link.body.browser_binding_secret}` } }
    );
    assert.equal(response.status, 302);
    assert.match(response.headers.get("location"), /pinterest=error$/);
    assert.deepEqual(app.state.rpcCalls.filter((call) => call.name === "commit_pinterest_oauth_attempt_v2"), []);
  } finally {
    await app.close();
  }
});

test("disconnect refuses an ambiguous request instead of guessing which account to remove", async () => {
  const app = await startApp((state) => {
    state.accounts = [accountRow(), accountRow({ id: SECOND_ACCOUNT_ID, username: "second" })];
    state.rpc.disconnect_pinterest_account_v2 = async () => ({ data: true, error: null });
  });
  try {
    const ambiguous = await getJson(app, "/integrations/pinterest/disconnect", { method: "POST" });
    assert.equal(ambiguous.status, 422);
    assert.match(ambiguous.body.error, /Укажите Pinterest-аккаунт/);
    assert.deepEqual(app.state.rpcCalls, [], "nothing may be disconnected without a chosen account");

    const unknown = await getJson(app, "/integrations/pinterest/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account_id: "00000000-0000-4000-8000-000000000000" }),
    });
    assert.equal(unknown.status, 404);
    assert.deepEqual(app.state.rpcCalls, []);
  } finally {
    await app.close();
  }
});

test("disconnect reports an unconfirmed removal as a 503, not as done", async () => {
  const app = await startApp((state) => {
    state.rpc.disconnect_pinterest_account_v2 = async () => ({ data: false, error: null });
  });
  try {
    const { status, body } = await getJson(app, "/integrations/pinterest/disconnect", { method: "POST" });
    assert.equal(status, 503);
    // The error writer deliberately keeps server-side text inside the server on >=500.
    assert.equal(body.error, "Внутренняя ошибка сервера, попробуйте позже");
    assert.doesNotMatch(JSON.stringify(body), /disconnect_pinterest_account_v2|Pinterest/);
  } finally {
    await app.close();
  }
});

test("disconnect answers with the accounts that actually remain", async () => {
  let calls = 0;
  const app = await startApp((state) => {
    state.rpc.disconnect_pinterest_account_v2 = async () => {
      calls += 1;
      state.accounts = [];
      return { data: true, error: null };
    };
  });
  try {
    const { status, body } = await getJson(app, "/integrations/pinterest/disconnect", { method: "POST" });
    assert.equal(status, 200);
    assert.equal(calls, 1);
    assert.equal(body.ok, true);
    assert.equal(body.connected, false, "the answer is read after the removal, not assumed");
    assert.deepEqual(body.accounts, []);
  } finally {
    await app.close();
  }
});

test("boards are returned as a flat list and a provider refusal is a 502 with the message", async () => {
  const app = await startApp((state) => {
    state.axiosGet["GET /boards?page_size=250"] = {
      status: 200,
      data: { items: [{ id: 111, name: "Рецепты", pin_count: 4 }, { id: "222", name: "Идеи", pin_count: null }] },
    };
  });
  try {
    const { status, body } = await getJson(app, "/integrations/pinterest/boards");
    assert.equal(status, 200);
    assert.deepEqual(body.boards, [
      { id: "111", name: "Рецепты", pin_count: 4 },
      { id: "222", name: "Идеи", pin_count: null },
    ]);
  } finally {
    await app.close();
  }

  const failing = await startApp((state) => {
    state.axiosGet["GET /boards?page_size=250"] = { status: 403, data: { message: "scope missing" } };
  });
  try {
    const { status, body } = await getJson(failing, "/integrations/pinterest/boards");
    assert.equal(status, 502);
    assert.equal(body.error, "Внутренняя ошибка сервера, попробуйте позже");
    assert.doesNotMatch(JSON.stringify(body), /scope missing/, "provider text must not cross on a 502");
  } finally {
    await failing.close();
  }
});

test("publishing forwards both body spellings of the board and the chosen account", async () => {
  // The route adds no validation of its own, which is only safe if it forwards exactly what
  // the customer sent. A silent rename here would publish to the wrong board.
  for (const field of ["board_id", "pinterest_board_id"]) {
    const seen = [];
    const app = await startApp((state) => {
      state.axiosGet["GET /boards/999888777"] = { status: 200, data: { id: "999888777" } };
      state.axiosGet["POST /pins"] = { status: 201, data: { id: "remote-1" } };
      state.rpc.begin_pinterest_publish_v2 = async (params) => {
        seen.push(params);
        return { data: { status: "started" }, error: null };
      };
      state.rpc.complete_pinterest_publish_v2 = async () => ({ data: null, error: null });
    });
    try {
      const response = await getJson(app, "/pins/pin-1/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [field]: "999888777", account_id: ACCOUNT_ID }),
      });
      assert.equal(response.status, 200, `${field}: ${JSON.stringify(response.body)}`);
      assert.equal(response.body.ok, true);
      assert.equal(seen.length, 1);
      assert.equal(seen[0].p_pinterest_board_id, "999888777", `field ${field} must reach the reservation`);
      assert.equal(seen[0].p_pinterest_account_id, ACCOUNT_ID);
      assert.equal(seen[0].p_pin_id, "pin-1");
    } finally {
      await app.close();
    }
  }
});

test("publishing without a board forwards the absence instead of inventing one", async () => {
  const app = await startApp((state) => {
    state.rpc.begin_pinterest_publish_v2 = async () => { throw new Error("must not reserve without a board"); };
  });
  try {
    const response = await getJson(app, "/pins/pin-1/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 422);
    assert.equal(response.body.error, "board_id обязателен: выберите доску Pinterest");
    assert.deepEqual(app.state.rpcCalls, []);
  } finally {
    await app.close();
  }
});

test("the scheduler route refuses a short or missing secret, including the documented minimum", async () => {
  const original = process.env.PINPOSY_SCHEDULER_SECRET;
  try {
    for (const secret of [undefined, "", "short-secret", "x".repeat(31)]) {
      if (secret === undefined) delete process.env.PINPOSY_SCHEDULER_SECRET;
      else process.env.PINPOSY_SCHEDULER_SECRET = secret;

      const app = await startApp();
      try {
        const noHeader = await getJson(app, "/internal/pinterest/schedule/run", { method: "POST" });
        assert.equal(noHeader.status, 401, `no header, secret ${JSON.stringify(secret)}`);
        const sameValue = await getJson(app, "/internal/pinterest/schedule/run", {
          method: "POST",
          headers: { "x-pinposy-scheduler-secret": String(secret || "") },
        });
        assert.equal(sameValue.status, 401, `matching short secret ${JSON.stringify(secret)} must still be refused`);
        assert.deepEqual(app.state.rpcCalls, [], "a rejected caller must not start a scheduler run");
      } finally {
        await app.close();
      }
    }
  } finally {
    if (original === undefined) delete process.env.PINPOSY_SCHEDULER_SECRET;
    else process.env.PINPOSY_SCHEDULER_SECRET = original;
  }
});
