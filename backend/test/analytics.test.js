"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  WINDOW_DAYS,
  getPublicationSummary,
  getPublicationSummaryOrUnavailable,
  normalizeCount,
} = require("../analytics");

/**
 * Analytics must never invent numbers. These tests pin the two properties that
 * matter: every query is scoped to the authenticated owner, and an unanswered or
 * malformed count fails instead of silently becoming zero.
 */

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-11-18T12:00:00.000Z");

function createDb({ counts = {}, rows = [], failTable = null, badCountTable = null } = {}) {
  const queries = [];
  function from(table) {
    const record = { table, filters: [], head: false, select: null, order: null, limit: null };
    queries.push(record);
    const builder = {
      select(columns, options) {
        record.select = columns;
        record.head = Boolean(options && options.head);
        return builder;
      },
      eq(column, value) {
        record.filters.push(["eq", column, value]);
        return builder;
      },
      gte(column, value) {
        record.filters.push(["gte", column, value]);
        return builder;
      },
      not(column, operator, value) {
        record.filters.push(["not", column, operator, value]);
        return builder;
      },
      order(column, options) {
        record.order = [column, options];
        return builder;
      },
      limit(count) {
        record.limit = count;
        return builder;
      },
      then(resolve, reject) {
        if (table === failTable) {
          return Promise.resolve({ data: null, count: null, error: { code: "XX000" } }).then(resolve, reject);
        }
        if (record.head) {
          const count = table === badCountTable ? null : (counts[table] || 0);
          return Promise.resolve({ data: null, count, error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: rows, count: null, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }
  return { queries, from };
}

test("summary reports only owned publication and schedule counts", async () => {
  const db = createDb({ counts: { pinterest_publications: 7, pin_schedules: 3 } });
  const summary = await getPublicationSummary(USER_ID, db, NOW);

  assert.equal(summary.range_days, WINDOW_DAYS);
  assert.equal(summary.publications.total, 7);
  assert.equal(summary.publications.window, 7);
  assert.equal(summary.schedules.scheduled_upcoming, 3);
  assert.equal(summary.schedules.publishing, 3);
  assert.equal(summary.schedules.failed_window, 3);
  assert.equal(summary.schedules.cancelled_window, 3);
  assert.deepEqual(summary.pinterest_metrics, { available: false, reason: "not_collected" });
  assert.equal(summary.last_published_at, null);
});

test("every query is scoped to the authenticated owner", async () => {
  const db = createDb({ counts: { pinterest_publications: 1, pin_schedules: 1 } });
  await getPublicationSummary(USER_ID, db, NOW);

  assert.ok(db.queries.length >= 7);
  for (const query of db.queries) {
    const ownerFilter = query.filters.some(
      ([operator, column, value]) => operator === "eq" && column === "user_id" && value === USER_ID
    );
    assert.ok(ownerFilter, `${query.table} query must be scoped to the owner`);
  }
});

test("the 30-day window is applied with an ISO timestamp", async () => {
  const db = createDb({ counts: { pinterest_publications: 1, pin_schedules: 1 } });
  await getPublicationSummary(USER_ID, db, NOW);

  const gteFilters = db.queries
    .flatMap((query) => query.filters)
    .filter(([operator]) => operator === "gte");
  assert.ok(gteFilters.length >= 4, "publications and schedule windows must be bounded");
  for (const [, column, value] of gteFilters) {
    assert.equal(typeof value, "string", `${column} boundary must be an ISO string`);
    assert.equal(new Date(value).toISOString(), value, `${column} boundary must be a UTC ISO timestamp`);
  }
  // Upcoming schedules are bounded by "now"; the reporting windows start in the past.
  const upcoming = gteFilters.find(([, column]) => column === "scheduled_at");
  assert.equal(upcoming[2], new Date(NOW).toISOString());
  for (const [, column, value] of gteFilters.filter(([, column]) => column !== "scheduled_at")) {
    assert.ok(Date.parse(value) < NOW, `${column} window must start in the past`);
  }
});

test("the last publication timestamp is read from one bounded row", async () => {
  const db = createDb({
    counts: { pinterest_publications: 4, pin_schedules: 0 },
    rows: [{ published_at: "2026-11-17T09:30:00.000+03:00" }],
  });
  const summary = await getPublicationSummary(USER_ID, db, NOW);

  assert.equal(summary.last_published_at, "2026-11-17T06:30:00.000Z");
  const lastQuery = db.queries[db.queries.length - 1];
  assert.equal(lastQuery.table, "pin_schedules");
  assert.equal(lastQuery.limit, 1);
  assert.deepEqual(lastQuery.order, ["published_at", { ascending: false }]);
});

test("a malformed last-publication row is ignored instead of reported", async () => {
  const db = createDb({
    counts: { pinterest_publications: 1, pin_schedules: 0 },
    rows: [{ published_at: "not-a-date" }, { published_at: "2026-11-01T00:00:00.000Z" }],
  });
  // Two rows violate the bounded contract and must fail closed.
  await assert.rejects(
    getPublicationSummary(USER_ID, db, NOW),
    (error) => error.code === "invalid_analytics_rows"
  );

  const single = createDb({
    counts: { pinterest_publications: 1, pin_schedules: 0 },
    rows: [{ published_at: "not-a-date" }],
  });
  assert.equal((await getPublicationSummary(USER_ID, single, NOW)).last_published_at, null);
});

test("counts fail closed when the response is not a non-negative integer", async () => {
  for (const value of [null, undefined, "5", 1.5, -1, Number.NaN, Infinity]) {
    assert.throws(() => normalizeCount(value, "test"), (error) => error.code === "invalid_analytics_count");
  }
  assert.equal(normalizeCount(0, "test"), 0);

  const db = createDb({ badCountTable: "pin_schedules" });
  await assert.rejects(
    getPublicationSummary(USER_ID, db, NOW),
    (error) => error.code === "invalid_analytics_count"
  );
});

test("a database failure is surfaced as 503 rather than empty analytics", async () => {
  const db = createDb({ failTable: "pinterest_publications" });
  await assert.rejects(
    getPublicationSummary(USER_ID, db, NOW),
    (error) => error.code === "XX000"
  );
  await assert.rejects(
    getPublicationSummaryOrUnavailable(USER_ID, db, NOW),
    (error) => error.httpStatus === 503 && /недоступна/.test(error.message)
  );
});

test("an empty owner id is rejected before any query runs", async () => {
  const db = createDb();
  await assert.rejects(
    getPublicationSummary("   ", db, NOW),
    (error) => error.code === "invalid_owner_id"
  );
  assert.equal(db.queries.length, 0);
});
