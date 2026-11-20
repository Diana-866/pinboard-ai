"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Section 123. Two files have to agree about how long a publication claim lives, and nothing checked
 * it: the worker renews its claim on a timer in `pinterest.js`, and SQL decides that a claim is
 * abandoned once `updated_at` is older than the recovery window. If the window ever becomes shorter
 * than a few renewal periods, a healthy worker is declared stale mid-publication, a second worker
 * claims the row and publishes the same pin again - the duplicate the claim tokens exist to prevent.
 * The SQL race suite would not notice: it never runs the Node worker.
 */
const ROOT = path.join(__dirname, "..", "..");
const MIGRATIONS = path.join(ROOT, "db", "migrations");

/** The renewal period the scheduler worker states for its own heartbeat, in milliseconds. */
function readHeartbeatIntervalMs(source) {
  const text = String(source).replace(/\r\n/g, "\n");
  const match = /createScheduleClaimHeartbeat\(\{[\s\S]{0,200}?intervalMs:\s*([\d_]+)(?:\s*\*\s*([\d_]+))?/.exec(text);
  if (!match) return null;
  const toNumber = (value) => Number(String(value).replace(/_/g, ""));
  // A product is read too: the interval may legitimately be written as `10 * 60_000`, and a reader
  // that quietly stopped at the first factor would compare 10 ms against a 20-minute window.
  return match[2] ? toNumber(match[1]) * toNumber(match[2]) : toNumber(match[1]);
}

/**
 * The recovery window, read from the newest migration that states one. Later migrations replace
 * earlier function bodies, so the highest-numbered statement is the one that runs in production.
 */
function readStaleWindowMs(files) {
  let latest = null;
  for (const { name, source } of files) {
    const text = String(source).replace(/\r\n/g, "\n");
    for (const match of text.matchAll(/updated_at < clock_timestamp\(\) - interval '(\d+) minutes'/g)) {
      latest = { name, minutes: Number(match[1]) };
    }
  }
  return latest;
}

function migrations() {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, source: fs.readFileSync(path.join(MIGRATIONS, name), "utf8") }));
}

test("the worker renews its claim many times inside the window SQL allows", () => {
  const heartbeatMs = readHeartbeatIntervalMs(fs.readFileSync(path.join(ROOT, "backend", "pinterest.js"), "utf8"));
  assert.ok(heartbeatMs && heartbeatMs > 0, "the scheduler worker must state its heartbeat interval");

  const window = readStaleWindowMs(migrations());
  assert.ok(window, "a migration must state how old a publishing claim has to be before recovery");
  assert.ok(window.minutes > 0, `nonsense recovery window in ${window.name}`);

  const windowMs = window.minutes * 60_000;
  assert.ok(
    heartbeatMs * 3 <= windowMs,
    `a ${heartbeatMs / 1000}s heartbeat inside a ${window.minutes}-minute recovery window (${window.name}) ` +
      "leaves no margin: one delayed tick would let recovery claim a healthy publication"
  );
});

test("the readers work on the shapes they are meant to read", () => {
  // A guard that silently reads null would pass every assertion above.
  const sample = "const stop = createScheduleClaimHeartbeat({\n  intervalMs: 75_000,\n  renew: async () => true,\n});";
  assert.equal(readHeartbeatIntervalMs(sample), 75_000);
  assert.equal(readHeartbeatIntervalMs("createScheduleClaimHeartbeat({ intervalMs: 10 * 60_000 })"), 600_000);
  assert.equal(readHeartbeatIntervalMs("createScheduleClaimHeartbeat({ renew })"), null);

  const sql = [
    { name: "001_a.sql", source: "and updated_at < clock_timestamp() - interval '20 minutes';" },
    { name: "002_b.sql", source: "and updated_at < clock_timestamp() - interval '5 minutes';" },
  ];
  assert.deepEqual(readStaleWindowMs(sql), { name: "002_b.sql", minutes: 5 });
  assert.equal(readStaleWindowMs([{ name: "001_a.sql", source: "select 1;" }]), null);
});
