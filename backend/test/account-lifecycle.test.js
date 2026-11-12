const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const {
  buildAccountExport,
  requestAccountDeletion,
  mapDeletionRpcError,
  pickColumns,
  sanitizeReviewQueuePayload,
} = require("../accountLifecycle");

const USER_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

// Minimal in-memory Supabase double: only the query chains accountLifecycle
// actually builds (select/eq/in/limit/maybeSingle) plus rpc().
function fakeDb(tables, { rpcResult, nullPageTable } = {}) {
  const rpcCalls = [];
  const db = {
    rpcCalls,
    from(table) {
      const filters = [];
      let limit = null;
      let offset = 0;
      let rangeLimit = null;
      let orderBy = null;
      let orderAscending = true;
      let selectedColumns = null;
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
            : op === "gt"
              ? rows.filter((row) => String(row[column]) > String(value))
              : rows.filter((row) => String(row[column]) === String(value));
        }
        if (orderBy) rows.sort((a, b) => String(a[orderBy]).localeCompare(String(b[orderBy])) * (orderAscending ? 1 : -1));
        if (rangeLimit !== null) rows = rows.slice(offset, offset + rangeLimit);
        else if (limit !== null) rows = rows.slice(0, limit);
        if (selectedColumns && selectedColumns !== "*") {
          const columns = selectedColumns.split(",").map((column) => column.trim());
          rows = rows.map((row) => Object.fromEntries(
            columns.filter((column) => Object.prototype.hasOwnProperty.call(row, column))
              .map((column) => [column, row[column]])
          ));
        }
        if (table === nullPageTable) return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: rows, error: null });
      };
      const builder = {
        select(columns = "*") { selectedColumns = columns; return builder; },
        eq(column, value) { filters.push([column, value, "eq"]); return builder; },
        in(column, value) { filters.push([column, value, "in"]); return builder; },
        gt(column, value) { filters.push([column, value, "gt"]); return builder; },
        order(column, options = {}) { orderBy = column; orderAscending = options.ascending !== false; return builder; },
        limit(value) { limit = value; return builder; },
        range(from, to) { offset = from; rangeLimit = to - from + 1; return builder; },
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

test("review queue export preserves user content but strips arbitrary payload fields", () => {
  const payload = {
    id: "review-1",
    title: "Spring ideas",
    description: "A user-authored description",
    imageUrl: "https://cdn.example.com/pin.png",
    destinationUrl: "https://example.com",
    access_token: "SECRET-TOKEN",
    refresh_token: "SECRET-REFRESH",
    provider_response: { payment_secret: "SECRET-PAYMENT" },
    internal_error: "private stack trace",
  };

  const exported = sanitizeReviewQueuePayload(payload);
  assert.equal(exported.title, "Spring ideas");
  assert.equal(exported.description, "A user-authored description");
  assert.equal(exported.imageUrl, "https://cdn.example.com/pin.png");
  assert.equal(exported.destinationUrl, "https://example.com");
  assert.equal(JSON.stringify(exported).includes("SECRET"), false);
  assert.equal("provider_response" in exported, false);
  assert.equal("internal_error" in exported, false);
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
    projects: [{ id: "p1", user_id: USER_ID, website_url: "https://example.com", internal_notes: "DO-NOT-EXPORT" }],
    boards: [{ id: "b1", project_id: "p1", title: "Board", moderation_secret: "DO-NOT-EXPORT" }, { id: "b2", project_id: "other", title: "Nope" }],
    pins: [{ id: "pin1", board_id: "b1", title: "Pin", provider_payload: "DO-NOT-EXPORT" }, { id: "pin2", board_id: "b2", title: "Nope" }],
    credit_transactions: [{ id: "t1", user_id: USER_ID, amount: 100, provider_payload: "DO-NOT-EXPORT" }],
    subscriptions: [{ id: "s1", user_id: USER_ID, plan: "pro", provider_payment_id: "DO-NOT-EXPORT" }],
    credit_purchases: [{ id: "c1", user_id: USER_ID, credits: 100, balance_credited_at: "DO-NOT-EXPORT" }],
    pinterest_accounts: [{
      id: "pa1",
      user_id: USER_ID,
      username: "ann",
      access_token: "ACCESS-SECRET",
      refresh_token: "REFRESH-SECRET",
    }],
    pinterest_publications: [{ id: "pub1", user_id: USER_ID, pinterest_pin_id: "remote", provider_response: "DO-NOT-EXPORT" }],
    pin_schedules: [{ id: "sc1", user_id: USER_ID, status: "scheduled", attempts: 99, last_error: "DO-NOT-EXPORT" }],
    pin_review_queue: [{ id: "rq1", user_id: USER_ID, payload: { title: "Draft" }, private_internal: "DO-NOT-EXPORT" }],
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
  assert.equal(JSON.stringify(exported).includes("DO-NOT-EXPORT"), false);
  assert.equal("provider_payment_id" in exported.subscriptions[0], false);
  assert.equal("balance_credited_at" in exported.creditPurchases[0], false);
  assert.equal("attempts" in exported.pinSchedules[0], false);
  assert.equal("last_error" in exported.pinSchedules[0], false);

  assert.deepEqual(exported.degradedSections, []);
  assert.equal(exported.formatVersion, 1);
});


test("account export paginates sections beyond the PostgREST default row cap", async () => {
  const transactions = Array.from({ length: 1005 }, (_, index) => ({
    id: `tx-${String(index + 1).padStart(4, "0")}`, user_id: USER_ID, amount: index + 1,
  })).reverse();
  const db = fakeDb({
    users: [{ id: USER_ID, email: "user@example.com" }],
    projects: [],
    credit_transactions: transactions,
    subscriptions: [],
    credit_purchases: [],
    pinterest_accounts: [],
    pinterest_publications: [],
    pin_schedules: [],
    pin_review_queue: [],
  });

  const exported = await buildAccountExport(USER_ID, db);
  assert.equal(exported.creditTransactions.length, 1005);
  assert.equal(exported.creditTransactions[0].id, "tx-0001");
  assert.equal(exported.creditTransactions[1004].id, "tx-1005");
  assert.deepEqual(exported.degradedSections, []);
});

test("account export chunks large project and board ownership filters", async () => {
  const projects = Array.from({ length: 205 }, (_, index) => ({
    id: `project-${String(index + 1).padStart(3, "0")}`, user_id: USER_ID,
  }));
  const boards = projects.map((project, index) => ({
    id: `board-${String(index + 1).padStart(3, "0")}`, project_id: project.id,
  }));
  const pins = boards.map((board, index) => ({
    id: `pin-${String(index + 1).padStart(3, "0")}`, board_id: board.id,
  }));
  const db = fakeDb({
    users: [{ id: USER_ID, email: "user@example.com" }],
    projects,
    boards,
    pins,
    credit_transactions: [],
    subscriptions: [],
    credit_purchases: [],
    pinterest_accounts: [],
    pinterest_publications: [],
    pin_schedules: [],
    pin_review_queue: [],
  });

  const exported = await buildAccountExport(USER_ID, db);
  assert.equal(exported.projects.length, 205);
  assert.equal(exported.boards.length, 205);
  assert.equal(exported.pins.length, 205);
  assert.deepEqual(exported.degradedSections, []);
});

test("account export reports unreadable sections instead of failing outright", async () => {
  const db = fakeDb({ users: [{ id: USER_ID, email: "user@example.com" }] });

  const exported = await buildAccountExport(USER_ID, db);

  assert.equal(exported.account.email, "user@example.com");
  for (const section of ["projects", "boards", "pins", "creditTransactions", "reviewQueue"]) {
    assert.ok(exported.degradedSections.includes(section), section);
  }
});

test("account export does not report dependent tables empty when parent read fails", async () => {
  const db = fakeDb({ users: [{ id: USER_ID, email: "user@example.com" }] });
  const exported = await buildAccountExport(USER_ID, db);

  assert.deepEqual(exported.projects, []);
  assert.deepEqual(exported.boards, []);
  assert.deepEqual(exported.pins, []);
  assert.ok(exported.degradedSections.includes("projects"));
  assert.ok(exported.degradedSections.includes("boards"));
  assert.ok(exported.degradedSections.includes("pins"));
});

test("account export marks a null data page as degraded instead of treating it as empty", async () => {
  const db = fakeDb({
    users: [{ id: USER_ID, email: "user@example.com" }],
    projects: [],
    credit_transactions: [{ id: "tx1", user_id: USER_ID, amount: 10 }],
    subscriptions: [],
    credit_purchases: [],
    pinterest_accounts: [],
    pinterest_publications: [],
    pin_schedules: [],
    pin_review_queue: [],
  }, { nullPageTable: "credit_transactions" });

  const exported = await buildAccountExport(USER_ID, db);
  assert.deepEqual(exported.creditTransactions, []);
  assert.ok(exported.degradedSections.includes("creditTransactions"));
});

test("account export returns 404 when the account row does not exist", async () => {
  const db = fakeDb({ users: [] });
  await assert.rejects(
    () => buildAccountExport(USER_ID, db),
    (error) => error.httpStatus === 404
  );
});

test("account export returns 503 when the account row cannot be read", async () => {
  const db = fakeDb({});
  await assert.rejects(
    () => buildAccountExport(USER_ID, db),
    (error) => error.httpStatus === 503
  );
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
