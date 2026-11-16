const test = require("node:test");
require("./helpers/env");
const assert = require("node:assert/strict");

const { getStats, monthKey, fetchAllRows } = require("../admin");

function pagedDb(tables) {
  const ranges = [];
  return {
    ranges,
    from(table) {
      return {
        select(columns) {
          assert.ok(tables[table], `unexpected table: ${table}`);
          return {
            async range(start, end) {
              ranges.push({ table, columns, start, end });
              return { data: tables[table].slice(start, end + 1), error: null };
            },
          };
        },
      };
    },
  };
}

test("fetchAllRows reads beyond the Supabase response cap", async () => {
  const rows = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const db = pagedDb({ users: rows });

  const result = await fetchAllRows(db, "users", "id", 500);

  assert.equal(result.length, 1201);
  assert.deepEqual(db.ranges.map((r) => [r.start, r.end]), [
    [0, 499],
    [500, 999],
    [1000, 1499],
  ]);
});

test("fetchAllRows fails explicitly when the admin stats row ceiling is exceeded", async () => {
  const db = pagedDb({ users: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] });

  await assert.rejects(
    fetchAllRows(db, "users", "id", 2, 3),
    (error) => error && error.httpStatus === 413
  );
});

test("monthKey groups ISO timestamps by UTC month and ignores invalid dates", () => {
  assert.equal(monthKey("2026-03-01T00:30:00+03:00"), "2026-02");
  assert.equal(monthKey("not-a-date"), null);
});

test("getStats aggregates every page and skips malformed transaction values", async () => {
  const users = [
    { id: "u1", created_at: "2026-03-01T00:30:00+03:00", tariff_plan: "pro" },
    { id: "u2", created_at: "2026-03-15T12:00:00Z", tariff_plan: "none" },
    { id: "u3", created_at: "invalid", tariff_plan: "agency" },
  ];
  const transactions = [
    { amount: "100", type: "purchase", created_at: "2026-03-01T00:30:00+03:00" },
    { amount: "-25", type: "usage", created_at: "2026-03-02T12:00:00Z" },
    { amount: "not-a-number", type: "usage", created_at: "2026-03-02T12:00:00Z" },
    { amount: "0", type: "adjustment", created_at: "2026-03-02T12:00:00Z" },
  ];
  const db = pagedDb({ users, credit_transactions: transactions });

  const stats = await getStats(db);

  assert.equal(stats.totalUsers, 3);
  assert.deepEqual(stats.signupsByMonth, { "2026-02": 1, "2026-03": 1 });
  assert.deepEqual(stats.tariffPlanBreakdown, { pro: 1, none: 1, agency: 1 });
  assert.deepEqual(stats.creditsSoldByMonth, { "2026-02": 100 });
  assert.deepEqual(stats.creditsSpentByMonth, { "2026-03": 25 });
  assert.equal(db.ranges.length, 2);
});
