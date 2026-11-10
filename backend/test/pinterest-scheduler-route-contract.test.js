"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("Pinterest scheduler worker URL is registered by the backend router", () => {
  const worker = read("scheduleWorker.js");
  const index = read("index.js");
  const pinterest = read("pinterest.js");
  assert.match(worker, /\/internal\/pinterest\/schedule\/run/);
  assert.match(index, /require\(["']\.\/pinterest["']\)\.registerRoutes\(app/);
  assert.match(pinterest, /app\.post\(["']\/internal\/pinterest\/schedule\/run["']/);
});

test("internal scheduler route preserves auth, claim fencing, publish journal and heartbeat", () => {
  const pinterest = read("pinterest.js");
  assert.match(pinterest, /x-pinposy-scheduler-secret/);
  assert.match(pinterest, /crypto\.timingSafeEqual\(expected, provided\)/);
  assert.match(pinterest, /begin_pinterest_scheduler_run/);
  assert.match(pinterest, /complete_pinterest_scheduler_run/);
  assert.match(pinterest, /claim_due_pin_schedules/);
  assert.match(pinterest, /renew_pin_schedule_claim/);
  assert.match(pinterest, /await publishPin\(/);
  assert.match(pinterest, /scheduleId: schedule\.id/);
  assert.match(pinterest, /claimToken: schedule\.claim_token/);
});

test("scheduler heartbeat completion migration fences terminal and superseded runs", () => {
  const migration = read(path.join("..", "db", "migrations", "123_pinterest_scheduler_completion_fencing.sql"));
  assert.match(migration, /last_run_id = p_run_id/);
  assert.match(migration, /status = 'running'/);
});
