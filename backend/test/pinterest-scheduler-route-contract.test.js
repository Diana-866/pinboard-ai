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
  const reconciliation = pinterest.indexOf('supabase.rpc("reconcile_confirmed_pinterest_schedule_successes")');
  const claim = pinterest.indexOf('supabase.rpc("claim_due_pin_schedules")');
  assert.notEqual(reconciliation, -1, "every worker tick must reconcile known remote successes");
  assert.ok(reconciliation < claim, "reconciliation must run before claiming new schedules");
  assert.match(pinterest, /await publishPin\(/);
  assert.match(pinterest, /scheduleId: schedule\.id/);
  assert.match(pinterest, /claimToken: schedule\.claim_token/);
});

test("scheduler heartbeat completion migration fences terminal and superseded runs", () => {
  const migration = read(path.join("..", "db", "migrations", "123_pinterest_scheduler_completion_fencing.sql"));
  assert.match(migration, /last_run_id = p_run_id/);
  assert.match(migration, /status = 'running'/);
});

test("scheduler recovers a durable remote Pinterest ID without repeating the remote POST", () => {
  const pinterest = read("pinterest.js");
  const recovery = pinterest.indexOf("attempt.status === \"unknown\"");
  const completion = pinterest.indexOf('supabase.rpc("complete_pinterest_publish_v2"', recovery);
  const ledgerCheck = pinterest.indexOf("matchesConfirmedPublicationLedger(ledgerLookup.data", completion);
  const retryPost = pinterest.indexOf('callPinterest("POST", "/pins"', recovery);
  assert.notEqual(recovery, -1, "unknown attempts with a known remote ID are recovered");
  assert.ok(completion > recovery, "recovery uses the atomic publication completion RPC");
  assert.ok(ledgerCheck > completion, "lost completion responses require exact ledger confirmation");
  assert.ok(retryPost === -1 || retryPost < recovery, "recovery path must not issue another Pinterest POST");
});

test("database reconciliation recovers known remote IDs and rejects identity conflicts", () => {
  const migration = read(path.join("..", "db", "migrations", "125_pinterest_recover_known_remote_publication_ids.sql"));
  assert.match(migration, /status = 'unknown'[\s\S]*?pinterest_pin_id[\s\S]*?pinterest_board_id/);
  assert.match(migration, /v_attempt\.pinterest_pin_id is not null[\s\S]*?is distinct from trim\(p_pinterest_pin_id\)/);
  assert.match(migration, /pinterest_pin_id is not null[\s\S]*?is distinct from trim\(p_pinterest_pin_id\)/);
  assert.match(migration, /complete_pinterest_publish_v2\(/);
});
