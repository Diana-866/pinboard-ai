"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");

// Pinterest credential refresh is the most dangerous write path in the product: the
// provider rotates the refresh token on every call, so replaying the old one logs the
// customer out, and committing a refreshed pair into a row that a reconnect replaced
// would overwrite newer credentials. None of that was covered by a test.
//
// The module talks to Supabase and axios directly, so both are replaced through the
// require cache before pinterest.js is loaded.
const supabasePath = require.resolve("../supabase");
const axiosPath = require.resolve("axios");
const pinterestPath = require.resolve("../pinterest");

process.env.PINTEREST_CLIENT_ID = "client-id";
process.env.PINTEREST_CLIENT_SECRET = "client-secret";
process.env.PINTEREST_REDIRECT_URI = "https://app.example.com/api/pinterest/callback";
process.env.PINTEREST_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

const { encryptToken, decryptToken } = require("../pinterestTokenCrypto");

const USER_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ACCOUNT_ID = "8f2c1c8e-4a52-4a1f-9d43-1f0e4c3b7a11";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function createSupabaseDouble() {
  const state = {
    account: null,
    accountReads: 0,
    updates: [],
    updateResults: [],
    rpcCalls: [],
    rpcResults: {},
    activeLeaseRow: null,
    activeLeaseError: null,
  };

  function query(kind) {
    const ops = [];
    const builder = {
      select(columns) { ops.push(["select", columns]); return builder; },
      update(values) { ops.push(["update", values]); return builder; },
      eq(column, value) { ops.push(["eq", column, value]); return builder; },
      is(column, value) { ops.push(["is", column, value]); return builder; },
      not(column, operator, value) { ops.push(["not", column, operator, value]); return builder; },
      gt(column, value) { ops.push(["gt", column, value]); return builder; },
      order(column, options) { ops.push(["order", column, options]); return builder; },
      limit(value) { ops.push(["limit", value]); return builder; },
      async maybeSingle() {
        if (ops.some(([op]) => op === "update")) {
          state.updates.push(ops);
          const scripted = state.updateResults.shift();
          if (scripted === undefined) {
            return { data: { updated_at: "2026-11-18T00:00:01.000Z", id: ACCOUNT_ID }, error: null };
          }
          return scripted;
        }
        if (kind === "lease") return { data: state.activeLeaseRow, error: state.activeLeaseError };
        state.accountReads += 1;
        return { data: state.account, error: null };
      },
      then(resolve, reject) {
        if (kind === "lease") {
          return Promise.resolve({ data: state.activeLeaseRow, error: state.activeLeaseError }).then(resolve, reject);
        }
        state.accountReads += 1;
        return Promise.resolve({ data: state.account ? [state.account] : [], error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    state,
    client: {
      from(table) {
        if (table === "pinterest_accounts") return query("accounts");
        if (table === "pinterest_account_refresh_leases") return query("lease");
        throw new Error(`unexpected table ${table}`);
      },
      async rpc(name, args) {
        state.rpcCalls.push({ name, args });
        const scripted = state.rpcResults[name];
        if (typeof scripted === "function") return scripted(args);
        if (scripted !== undefined) return scripted;
        if (name === "acquire_pinterest_account_refresh_lease") return { data: true, error: null };
        if (name === "release_pinterest_account_refresh_lease") return { data: true, error: null };
        if (name === "commit_pinterest_account_token_refresh") return { data: true, error: null };
        return { data: null, error: null };
      },
    },
  };
}

const db = createSupabaseDouble();
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: db.client,
};

const axiosCalls = [];
let axiosResponder = () => ({ status: 200, data: {} });
const axiosDouble = async () => ({ status: 200, data: {} });
axiosDouble.post = async (url, body, config) => {
  axiosCalls.push({ url, body, config });
  return axiosResponder({ url, body, config });
};
require.cache[axiosPath] = {
  id: axiosPath,
  filename: axiosPath,
  loaded: true,
  exports: axiosDouble,
};

delete require.cache[pinterestPath];
const { refreshAccessToken, resolveAccount } = require("../pinterest");

function accountRow(overrides = {}) {
  return {
    id: ACCOUNT_ID,
    user_id: USER_ID,
    access_token: encryptToken("old-access"),
    refresh_token: encryptToken("old-refresh"),
    refresh_state: "ready",
    scopes: "boards:read",
    updated_at: "2026-11-18T00:00:00.000Z",
    disconnected_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Load the double, then read the account the way production code does. The caller
 *  snapshot must be the decoded record (plaintext tokens), because refreshAccessToken
 *  compares it with the row it re-reads, which getAccount also decodes. */
async function reset({ account, acquire = true } = {}) {
  const row = account || accountRow();
  db.state.account = row;
  db.state.accountReads = 0;
  db.state.updates = [];
  db.state.updateResults = [];
  db.state.rpcCalls = [];
  db.state.rpcResults = {
    acquire_pinterest_account_refresh_lease: { data: acquire, error: null },
  };
  db.state.activeLeaseRow = null;
  db.state.activeLeaseError = null;
  axiosCalls.length = 0;
  axiosResponder = () => ({
    status: 200,
    data: { access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 },
  });
  return resolveAccount(USER_ID, ACCOUNT_ID);
}

function rpcNames() {
  return db.state.rpcCalls.map((call) => call.name);
}

test("a refresh that sees a newer row from another instance does not call Pinterest", async () => {
  const snapshot = await reset({ acquire: false });
  // The lease holder already committed: the stored pair differs from the snapshot.
  db.state.account = accountRow({
    access_token: encryptToken("rotated-access"),
    refresh_token: encryptToken("rotated-refresh"),
  });

  const current = await refreshAccessToken(snapshot);

  assert.equal(current.access_token, "rotated-access");
  assert.equal(axiosCalls.length, 0);
  assert.equal(rpcNames().includes("commit_pinterest_account_token_refresh"), false);
});

test("a lease holder that already committed is not disturbed, but the lease is released", async () => {
  const snapshot = await reset({ acquire: true });
  db.state.account = accountRow({
    access_token: encryptToken("someone-else"),
    refresh_token: encryptToken("someone-else-r"),
  });

  const current = await refreshAccessToken(snapshot);

  // The re-read after acquiring the lease wins over the caller's stale snapshot.
  assert.equal(current.access_token, "someone-else");
  assert.equal(axiosCalls.length, 0);
  assert.deepEqual(rpcNames(), [
    "acquire_pinterest_account_refresh_lease",
    "release_pinterest_account_refresh_lease",
  ]);
});

test("an uncertain account cannot be refreshed without a live lease", async () => {
  const snapshot = await reset({ acquire: false });
  db.state.account = accountRow({ refresh_state: "uncertain" });
  db.state.activeLeaseRow = null;

  await assert.rejects(
    () => refreshAccessToken(snapshot),
    (error) => error.httpStatus === 409
  );
  assert.equal(axiosCalls.length, 0);
});

test("the uncertainty fence is written before Pinterest is contacted", async () => {
  const snapshot = await reset();
  await refreshAccessToken(snapshot);

  const fence = db.state.updates[0];
  assert.ok(fence, "the uncertainty fence must be written");
  const values = fence.find(([op]) => op === "update")[1];
  assert.equal(values.refresh_state, "uncertain");
  // Optimistic concurrency: fenced on the row version and the ready state.
  assert.ok(fence.some(([op, column, value]) => op === "eq" && column === "updated_at" && value === "2026-11-18T00:00:00.000Z"));
  assert.ok(fence.some(([op, column, value]) => op === "eq" && column === "refresh_state" && value === "ready"));
  assert.equal(axiosCalls.length, 1, "Pinterest must be called once");
});

test("a failed fence write stops the refresh before any provider call", async () => {
  const snapshot = await reset();
  db.state.updateResults = [{ data: null, error: null }];

  await assert.rejects(
    () => refreshAccessToken(snapshot),
    (error) => error.httpStatus === 503
  );
  assert.equal(axiosCalls.length, 0);
  assert.equal(rpcNames().includes("commit_pinterest_account_token_refresh"), false);
});

test("a transport failure keeps the uncertainty fence and never replays the refresh token", async () => {
  const snapshot = await reset();
  axiosResponder = () => { throw new Error("socket hang up"); };

  await assert.rejects(
    () => refreshAccessToken(snapshot),
    (error) => error.httpStatus === 409
  );
  // Only the fence write happened; there is no restore because the outcome is unknown.
  assert.equal(db.state.updates.length, 1);
  assert.equal(rpcNames().includes("commit_pinterest_account_token_refresh"), false);
  assert.ok(rpcNames().includes("release_pinterest_account_refresh_lease"));
});

test("a rate limit releases the fence so the user can retry later", async () => {
  const snapshot = await reset();
  axiosResponder = () => ({ status: 429, data: {} });

  await assert.rejects(
    () => refreshAccessToken(snapshot),
    (error) => error.httpStatus === 503
  );
  const restore = db.state.updates[1];
  assert.ok(restore, "the fence must be restored after an explicit 429");
  const values = restore.find(([op]) => op === "update")[1];
  assert.equal(values.refresh_state, "ready");
  assert.equal(rpcNames().includes("commit_pinterest_account_token_refresh"), false);
});

test("a 5xx from Pinterest keeps the fence because the outcome is ambiguous", async () => {
  const snapshot = await reset();
  axiosResponder = () => ({ status: 500, data: {} });

  await assert.rejects(
    () => refreshAccessToken(snapshot),
    (error) => error.httpStatus === 409
  );
  assert.equal(db.state.updates.length, 1, "no restore on an ambiguous failure");
});

test("a 2xx without a rotated refresh token is refused instead of committed", async () => {
  const snapshot = await reset();
  // Pinterest rotated the pair; a response missing the refresh token must not be
  // committed, otherwise the old (already invalid) refresh token would be kept.
  axiosResponder = () => ({ status: 200, data: { access_token: "new-access", expires_in: 3600 } });

  await assert.rejects(
    () => refreshAccessToken(snapshot),
    (error) => error.httpStatus === 409
  );
  assert.equal(rpcNames().includes("commit_pinterest_account_token_refresh"), false);
});

test("a 2xx without a usable expiry is refused", async () => {
  const snapshot = await reset();
  axiosResponder = () => ({ status: 200, data: { access_token: "a", refresh_token: "b", expires_in: 0 } });

  await assert.rejects(
    () => refreshAccessToken(snapshot),
    (error) => error.httpStatus === 409
  );
  assert.equal(rpcNames().includes("commit_pinterest_account_token_refresh"), false);
});

test("a successful refresh commits an encrypted pair, never plaintext", async () => {
  const snapshot = await reset();

  await refreshAccessToken(snapshot);

  const commit = db.state.rpcCalls.find((call) => call.name === "commit_pinterest_account_token_refresh");
  assert.ok(commit, "the refresh must be committed through the fenced RPC");
  assert.match(commit.args.p_access_token, /^enc:v1:/);
  assert.match(commit.args.p_refresh_token, /^enc:v1:/);
  assert.ok(!commit.args.p_access_token.includes("new-access"));
  assert.ok(!commit.args.p_refresh_token.includes("new-refresh"));
  assert.match(commit.args.p_lease_id, UUID_RE);
  assert.equal(commit.args.p_expected_updated_at, "2026-11-18T00:00:01.000Z");
  // The request body carried the current refresh token, not a stored ciphertext.
  assert.match(String(axiosCalls[0].body), /refresh_token=old-refresh/);
});

test("a failed commit is retried with the same response, never with another provider call", async () => {
  const snapshot = await reset();
  let attempts = 0;
  db.state.rpcResults.commit_pinterest_account_token_refresh = () => {
    attempts += 1;
    if (attempts === 1) return { data: null, error: { message: "connection reset" } };
    return { data: true, error: null };
  };

  await refreshAccessToken(snapshot);

  const commits = db.state.rpcCalls.filter((call) => call.name === "commit_pinterest_account_token_refresh");
  assert.equal(commits.length, 2);
  assert.equal(decryptToken(commits[0].args.p_access_token), decryptToken(commits[1].args.p_access_token));
  assert.equal(decryptToken(commits[0].args.p_refresh_token), decryptToken(commits[1].args.p_refresh_token));
  assert.equal(decryptToken(commits[1].args.p_access_token), "new-access");
  assert.equal(axiosCalls.length, 1, "Pinterest must be called exactly once");
});

test("a lost commit race is reported as retryable rather than silently accepted", async () => {
  const snapshot = await reset();
  db.state.rpcResults.commit_pinterest_account_token_refresh = { data: false, error: null };
  // The stored row is unchanged: the reconnect or lease winner did not commit ours.

  await assert.rejects(
    () => refreshAccessToken(snapshot),
    (error) => error.httpStatus === 503
  );
});

test("the lease is released even when the provider call throws", async () => {
  const snapshot = await reset();
  axiosResponder = () => { throw new Error("boom"); };

  await assert.rejects(() => refreshAccessToken(snapshot));
  const released = db.state.rpcCalls.filter((call) => call.name === "release_pinterest_account_refresh_lease");
  assert.equal(released.length, 1);
});

test("a stored account is returned with decrypted credentials", async () => {
  await reset();
  const account = await resolveAccount(USER_ID, ACCOUNT_ID);
  assert.equal(account.access_token, "old-access");
  assert.equal(account.refresh_token, "old-refresh");
});

// ---------------------------------------------------------------------------
// The branch where another instance holds the refresh lease.
//
// This is the only place that decides whether we are allowed to contact Pinterest at all.
// Calling with the old refresh token while another instance is rotating it would log the
// customer out (the provider invalidates the pair on every refresh), so the code waits for
// the other instance's committed result instead. The wait used real timers and a real
// clock, which made every case here untestable; it now accepts injected timing.
// ---------------------------------------------------------------------------

function movieClock() {
  let current = Date.parse("2026-11-18T00:00:00.000Z");
  return {
    now: () => current,
    advance: (ms) => { current += ms; },
    sleep: async (ms) => { current += ms; },
    onSleep: null,
  };
}

function timingWith(clock, overrides = {}) {
  return {
    now: clock.now,
    sleep: async (ms) => {
      clock.advance(ms);
      if (clock.onSleep) clock.onSleep(ms);
    },
    maxWaitMs: 1000,
    pollMs: 250,
    ...overrides,
  };
}

test("a lease held elsewhere is waited out and the rotated pair is used without calling Pinterest", async () => {
  const snapshot = await reset({ acquire: false });
  const clock = movieClock();
  // The other instance commits on the second poll. Nothing here talks to Pinterest.
  clock.onSleep = (() => {
    let polls = 0;
    return () => {
      polls += 1;
      if (polls === 2) {
        db.state.account = accountRow({
          access_token: encryptToken("rotated-access"),
          refresh_token: encryptToken("rotated-refresh"),
        });
      }
    };
  })();

  const current = await refreshAccessToken(snapshot, timingWith(clock));

  assert.equal(current.access_token, "rotated-access");
  assert.equal(current.refresh_token, "rotated-refresh");
  assert.equal(axiosCalls.length, 0, "a concurrent rotation must never be duplicated");
  assert.equal(rpcNames().includes("commit_pinterest_account_token_refresh"), false);
});

test("a live lease on an uncertain row is waited out, then reported as still running", async () => {
  const snapshot = await reset({ acquire: false });
  db.state.account = accountRow({ refresh_state: "uncertain" });
  db.state.activeLeaseRow = { lease_until: "2026-11-18T00:10:00.000Z" };
  const clock = movieClock();

  await assert.rejects(
    () => refreshAccessToken(snapshot, timingWith(clock)),
    (error) => error.httpStatus === 503 && /уже выполняется/.test(error.message)
  );
  assert.equal(axiosCalls.length, 0);
  // The budget really was consumed in polls of the configured size.
  assert.ok(clock.now() >= Date.parse("2026-11-18T00:00:01.000Z"));
});

test("an uncertain row with no live lease asks for a reconnect instead of waiting", async () => {
  const snapshot = await reset({ acquire: false });
  db.state.account = accountRow({ refresh_state: "uncertain" });
  db.state.activeLeaseRow = null;
  const clock = movieClock();

  await assert.rejects(
    () => refreshAccessToken(snapshot, timingWith(clock)),
    (error) => error.httpStatus === 409 && /Подключите аккаунт заново/.test(error.message)
  );
  assert.equal(axiosCalls.length, 0);
});

test("an unreadable lease state fails closed rather than guessing", async () => {
  const snapshot = await reset({ acquire: false });
  db.state.account = accountRow({ refresh_state: "uncertain" });
  db.state.activeLeaseError = { code: "08006", message: "connection failure" };
  const clock = movieClock();

  await assert.rejects(
    () => refreshAccessToken(snapshot, timingWith(clock)),
    (error) => error.httpStatus === 503 && /Не удалось проверить состояние/.test(error.message)
  );
  assert.equal(axiosCalls.length, 0);
});

test("an account disconnected while waiting stops the wait immediately", async () => {
  const snapshot = await reset({ acquire: false });
  const clock = movieClock();
  clock.onSleep = () => { db.state.account = null; };

  await assert.rejects(
    () => refreshAccessToken(snapshot, timingWith(clock)),
    (error) => error.httpStatus === 409 && /Pinterest отключён/.test(error.message)
  );
  assert.equal(axiosCalls.length, 0);
});

test("an already rotated pair in the row is used without waiting the full budget", async () => {
  const snapshot = await reset({ acquire: false });
  db.state.account = accountRow({
    access_token: encryptToken("fresh-access"),
    refresh_token: encryptToken("fresh-refresh"),
  });
  const clock = movieClock();

  const current = await refreshAccessToken(snapshot, timingWith(clock));

  assert.equal(current.access_token, "fresh-access");
  assert.equal(axiosCalls.length, 0);
  // One poll at most: the row already proves the rotation finished.
  assert.ok(clock.now() < Date.parse("2026-11-18T00:00:01.000Z"));
});
