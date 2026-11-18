"use strict";

const test = require("node:test");
// admin.js imports the shared Supabase client at module load. The helper only
// supplies inert placeholder configuration; this test never makes a network
// request.
require("./helpers/env");
const assert = require("node:assert/strict");

const { fetchAllRows } = require("../admin");

function createPagedClient(tableRows) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        select(columns) {
          const query = { table, columns, ordered: false };
          return {
            order(column, options) {
              query.ordered = true;
              query.order = [column, options];
              return this;
            },
            range(from, to) {
              calls.push({ table, columns, from, to, ordered: query.ordered, order: query.order });
              return Promise.resolve({
                data: (tableRows[table] || []).slice(from, to + 1),
                error: null,
              });
            },
          };
        },
      };
    },
  };
}

test("admin statistics pagination orders users and credit transactions by unique id", async () => {
  const rows = {
    users: Array.from({ length: 5 }, (_, id) => ({ id: `user-${id}` })),
    credit_transactions: Array.from({ length: 5 }, (_, id) => ({ id: `transaction-${id}` })),
  };
  const client = createPagedClient(rows);

  for (const table of ["users", "credit_transactions"]) {
    const result = await fetchAllRows(client, table, "id", 2, 10);
    assert.deepEqual(result, rows[table]);
  }

  assert.equal(client.calls.length, 6);
  for (const call of client.calls) {
    assert.equal(call.ordered, true, `${call.table} page ${call.from} must be ordered before range`);
    assert.deepEqual(call.order, ["id", { ascending: true }]);
  }
  assert.deepEqual(
    client.calls.filter((call) => call.table === "users").map((call) => [call.from, call.to]),
    [[0, 1], [2, 3], [4, 5]]
  );
  assert.deepEqual(
    client.calls.filter((call) => call.table === "credit_transactions").map((call) => [call.from, call.to]),
    [[0, 1], [2, 3], [4, 5]]
  );
});
