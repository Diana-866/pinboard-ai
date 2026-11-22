const test = require("node:test");
const assert = require("node:assert/strict");

const supabasePath = require.resolve("../supabase");
const adminPath = require.resolve("../admin");

let lookupResult = { data: { is_admin: true }, error: null };
const lookups = [];

const supabaseMock = {
  from(table) {
    assert.equal(table, "users");
    return {
      select(columns) {
        assert.equal(columns, "is_admin");
        return {
          eq(column, value) {
            lookups.push({ column, value });
            assert.equal(column, "id");
            return {
              async single() {
                return lookupResult;
              },
            };
          },
        };
      },
    };
  },
};

// Install the DB mock before loading admin.js (and its tariff dependency).
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: supabaseMock,
};
delete require.cache[adminPath];
const { requireAdmin } = require("../admin");

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("requireAdmin allows only the DB-authorized user and checks req.userId", async () => {
  lookupResult = { data: { is_admin: true }, error: null };
  lookups.length = 0;
  const req = { userId: "db-user-123" };
  const res = responseRecorder();
  let nextCalls = 0;

  await requireAdmin(req, res, () => { nextCalls += 1; });

  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, null);
  assert.deepEqual(lookups, [{ column: "id", value: "db-user-123" }]);
});

test("requireAdmin rejects a normal user even if the request carries an admin-looking field", async () => {
  lookupResult = { data: { is_admin: false }, error: null };
  const req = { userId: "ordinary-user", body: { is_admin: true, role: "admin" } };
  const res = responseRecorder();
  let nextCalls = 0;

  await requireAdmin(req, res, () => { nextCalls += 1; });

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Доступ запрещён" });
});

test("requireAdmin fails closed with a safe service error when the database is unavailable", async () => {
  lookupResult = { data: null, error: { code: "08006", message: "database unavailable" } };
  const req = { userId: "maybe-admin" };
  const res = responseRecorder();
  let nextCalls = 0;

  await requireAdmin(req, res, () => { nextCalls += 1; });

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: "Не удалось проверить административные права" });
});


test("requireAdmin treats missing users as forbidden and malformed DB success as unavailable", async () => {
  const req = { userId: "unknown-user" };
  const denied = responseRecorder();
  lookupResult = { data: null, error: { code: "PGRST116", message: "No rows" } };
  await requireAdmin(req, denied, () => {});
  assert.equal(denied.statusCode, 403);
  assert.deepEqual(denied.body, { error: "Доступ запрещён" });

  const malformed = responseRecorder();
  lookupResult = { data: null, error: null };
  await requireAdmin(req, malformed, () => {});
  assert.equal(malformed.statusCode, 503);
  assert.deepEqual(malformed.body, { error: "Не удалось проверить административные права" });
});
