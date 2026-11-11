const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const {
  buildAccountExport,
  requestAccountDeletion,
  mapDeletionRpcError,
  pickColumns,
} = require("../accountLifecycle");

const USER_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

// Minimal in-memory Supabase double: only the query chains accountLifecycle
// actually builds (select/eq/in/limit/maybeSingle) plus rpc().
function fakeDb(tables, { rpcResult } = {}) {
  const rpcCalls = [];
  const db = {
    rpcCalls,
    from(table) {
      const filters = [];
      let limit = null;
      const resolve = () => {
        if (!(table in tables)) {
          return Promise.resolve({
            data: null,
            error: { message: `relation "public.${table}" does not exist`, code: "42P01" },
          });
        }
        let rows = tables[table].slice();
        for (const [column, value, op] of filters) {
          rows = op === "in"
            ? rows.filter((row) => value.includes(row[column]))
            : rows.filter((row) => String(row[column]) === String(value));
        }
        if (limit !== null) rows = rows.slice(0, limit);
        return Promise.resolve({ data: rows, error: null });
      };
      const builder = {
        select() { return builder; },
        eq(column, value) { filters.push([column, value, "eq"]); return builder; },
        in(column, value) { filters.push([column, value, "in"]); return builder; },
        limit(value) { limit = value; return builder; },
        maybeSingle() { return resolve().then((rows) => ({ data: rows.data[0] ?? null, error: rows.error })); },
        then(onFulfilled, onRejected) { return resolve().then(onFulfilled, onRejected); },
      };
      return builder;
    },
    rpc(name, params) {
      rpcCalls.push({ name, params });
      return Promise.resolve(rpcResult || { data: null, error: { message: `function ${name} does not exist` } });
    },
  };
  return db;
}

test("pickColumns keeps only allowlisted fields", () => {
  const row = { id: "1", email: "a@b.c", password_hash: "secret", access_token: "tok" };
  assert.deepEqual(pickColumns(row, ["id", "email"]), { id: "1", email: "a@b.c" });
});

test("account export never leaks credentials and follows the ownership graph", async () => {
  const db = fakeDb({
    users: [{
      id: USER_ID,
      email: "user@example.com",
      name: "Ann",
      password_hash: "hashed-secret",
      token_version: 7,
      is_admin: false,
      account_status: "active",
    }],
    projects: [{ id: "p1", user_id: USER_ID, website_url: "https://example.com" }],
    boards: [{ id: "b1", project_id: "p1", title: "Board" }, { id: "b2", project_id: "other", title: "Nope" }],
    pins: [{ id: "pin1", board_id: "b1", title: "Pin" }, { id: "pin2", board_id: "b2", title: "Nope" }],
    credit_transactions: [{ id: "t1", user_id: USER_ID, amount: 100 }],
    subscriptions: [{ id: "s1", user_id: USER_ID, plan: "pro" }],
    credit_purchases: [{ id: "c1", user_id: USER_ID, credits: 100 }],
    pinterest_accounts: [{
      id: "pa1",
      user_id: USER_ID,
      username: "ann",
      access_token: "ACCESS-SECRET",
      refresh_token: "REFRESH-SECRET",
    }],
    pinterest_publications: [{ id: "pub1", user_id: USER_ID, pinterest_pin_id: "remote" }],
    pin_schedules: [{ id: "sc1", user_id: USER_ID, status: "scheduled" }],
    pin_review_queue: [{ id: "rq1", user_id: USER_ID, payload: { title: "Draft" } }],
  });

  const exported = await buildAccountExport(USER_ID, db);

  assert.equal(exported.account.email, "user@example.com");
  assert.equal("password_hash" in exported.account, false);
  assert.equal("token_version" in exported.account, false);
  assert.equal("is_admin" in exported.account, false);

  // Ownership graph: only the user's own project/board/pin.
  assert.deepEqual(exported.projects.map((p) => p.id), ["p1"]);
  assert.deepEqual(exported.boards.map((b) => b.id), ["b1"]);
  assert.deepEqual(exported.pins.map((p) => p.id), ["pin1"]);

  // Pinterest credentials are stripped, identity is kept.
  assert.equal(exported.pinterestAccounts.length, 1);
  assert.equal(exported.pinterestAccounts[0].username, "ann");
  assert.equal("access_token" in exported.pinterestAccounts[0], false);
  assert.equal("refresh_token" in exported.pinterestAccounts[0], false);
  assert.equal(JSON.stringify(exported).includes("ACCESS-SECRET"), false);
  assert.equal(JSON.stringify(exported).includes("REFRESH-SECRET"), false);

  assert.deepEqual(exported.degradedSections, []);
  assert.equal(exported.formatVersion, 1);
});

test("account export reports unreadable sections instead of failing outright", async () => {
  const db = fakeDb({ users: [{ id: USER_ID, email: "user@example.com" }] });

  const exported = await buildAccountExport(USER_ID, db);

  assert.equal(exported.account.email, "user@example.com");
  for (const section of ["projects", "creditTransactions", "reviewQueue"]) {
    assert.ok(exported.degradedSections.includes(section), section);
  }
});

test("account export rejects a non-uuid user id", async () => {
  await assert.rejects(
    () => buildAccountExport("not-a-uuid", fakeDb({})),
    (error) => error.httpStatus === 422
  );
});

test("deletion request rejects a wrong password with 403 and never calls the RPC", async () => {
  const db = fakeDb({
    users: [{ id: USER_ID, password_hash: bcrypt.hashSync("correct-horse-battery", 10), token_version: 12 }],
  });

  await assert.rejects(
    () => requestAccountDeletion({ userId: USER_ID, password: "wrong-password" }, db),
    (error) => error.httpStatus === 403
  );
  assert.equal(db.rpcCalls.length, 0);
});

test("deletion request accepts a correct password and returns the receipt", async () => {
  const db = fakeDb(
    { users: [{ id: USER_ID, password_hash: bcrypt.hashSync("correct-horse-battery", 10), token_version: 12 }] },
    {
      rpcResult: {
        data: {
          requestId: "req-1",
          state: "pending",
          requestedAt: "2026-11-12T00:00:00Z",
          alreadyRequested: false,
        },
        error: null,
      },
    }
  );

  const result = await requestAccountDeletion(
    { userId: USER_ID, password: "correct-horse-battery" },
    db
  );

  assert.deepEqual(db.rpcCalls, [{
    name: "request_account_deletion",
    params: { p_user_id: USER_ID, p_confirmation_method: "password_reauth", p_expected_token_version: 12 },
  }]);
  assert.equal(result.ok, true);
  assert.equal(result.request.requestId, "req-1");
  assert.equal(result.request.alreadyRequested, false);
});

test("deletion RPC errors map to stable HTTP statuses", () => {
  assert.equal(mapDeletionRpcError({ message: "user not found" }).httpStatus, 404);
  assert.equal(mapDeletionRpcError({ message: "account already deleted" }).httpStatus, 409);
  assert.equal(mapDeletionRpcError({ message: "reauthentication expired" }).httpStatus, 409);
  assert.equal(mapDeletionRpcError({ message: "account is not active" }).httpStatus, 409);
  assert.equal(
    mapDeletionRpcError({ message: "Could not find the function public.request_account_deletion" }).httpStatus,
    503
  );
  assert.equal(mapDeletionRpcError({ message: "connection reset" }).httpStatus, 503);
});
