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
  // The claim RPC takes arguments, so the call ends with an options object, not ")".
  const claim = pinterest.indexOf('supabase.rpc("claim_due_pin_schedules"');
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

  const boundedRecovery = read(path.join("..", "db", "migrations", "126_pinterest_reconcile_only_schedulable_known_remote_ids.sql"));
  assert.match(boundedRecovery, /exists \([\s\S]*?public\.pinterest_accounts[\s\S]*?public\.pin_schedules/);
  assert.match(boundedRecovery, /s\.pinterest_board_id = a\.pinterest_board_id/);
  assert.match(boundedRecovery, /s\.status in \('publishing','unknown'\)/);
  assert.match(boundedRecovery, /limit 50/);
});

test("schedule API paginates the full calendar and chunks retry metadata lookups", () => {
  const index = read("index.js");
  const routeStart = index.indexOf('app.get("/schedule", requireAuth');
  const routeEnd = index.indexOf('app.post("/schedule/:id/reconcile-account"', routeStart);
  assert.notEqual(routeStart, -1, "authenticated schedule route exists");
  assert.ok(routeEnd > routeStart, "schedule route has a bounded source section");
  const route = index.slice(routeStart, routeEnd);
  assert.match(route, /const pageSize = 500/);
  assert.match(route, /\.range\(offset, offset \+ pageSize - 1\)/);
  assert.match(route, /\.order\("scheduled_at", \{ ascending: true \}\)[\s\S]*\.order\("id", \{ ascending: true \}\)/);
  assert.match(route, /if \(batch\.length < pageSize\) break/);
  assert.match(route, /chunksOf\(pinIds\)/);
  assert.match(route, /chunksOf\(accountIds\)/);
  assert.match(route, /flatMap\(\(result\) => result\.data \|\| \[\]\)/);
  assert.match(route, /attemptsByPinAndAccount/);
  assert.match(route, /attemptsByExactDestination/);
  assert.match(route, /publicationKeys/);
  assert.match(route, /activeScheduleKeys/);
  assert.doesNotMatch(route, /attempts\.find|publications\.some|rows\.some/);
});


test("schedule creation persists and reconciles the resolved project destination URL", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  const start = source.indexOf('app.post("/pins/:id/schedule"');
  assert.notEqual(start, -1, "pin schedule route must exist");
  const end = source.indexOf('app.post("/schedule/:id/change-board"', start);
  assert.notEqual(end, -1, "pin schedule route boundary must exist");
  const route = source.slice(start, end);

  assert.ok(route.includes("const snapshotDestinationUrl = destinationUrl || snapshotPin.boards?.projects?.website_url || null"));
  assert.ok(route.includes("destination_url: snapshotDestinationUrl"));
  assert.ok(route.includes('String(existing.destination_url || "") === String(snapshotDestinationUrl || "")'));
});


test("overlapping external scheduler wakeups return a successful busy response", () => {
  const pinterest = read("pinterest.js");
  const start = pinterest.indexOf('app.post("/internal/pinterest/schedule/run"');
  const end = pinterest.indexOf('logInfo("pinterest.event_029")', start);
  assert.notEqual(start, -1, "internal scheduler route exists");
  const route = pinterest.slice(start, end);
  assert.match(route, /if (monitorStartError) throw monitorStartError/);
  assert.match(route, /if \(monitorStarted !== true\)[\s\S]*?ok: true,[\s\S]*?busy: true,[\s\S]*?return res\.json/);
  assert.match(route, /schedulerMonitorStarted = true/);
});


test("schedule cancellation never overwrites a worker claim and safely handles lost responses", () => {
  const source = read("index.js");
  const start = source.indexOf('app.post("/schedule/:id/cancel"');
  const end = source.indexOf("// --- Кредиты ---", start);
  assert.notEqual(start, -1, "schedule cancellation route exists");
  assert.ok(end > start, "schedule cancellation route has a bounded source section");
  const route = source.slice(start, end);
  const updateStart = route.indexOf('.from("pin_schedules")');
  const conditionalStatus = route.indexOf('.eq("status", "scheduled")', updateStart);
  assert.ok(updateStart >= 0 && conditionalStatus > updateStart,
    "cancellation must be a conditional update from scheduled state only");
  assert.match(route.slice(updateStart, conditionalStatus), /\.eq\("user_id", String\(req\.userId\)\)/);
  assert.match(route, /current\.status === "cancelled"[\s\S]*?return res\.json/);
  assert.match(route, /current\.status === "publishing"[\s\S]*?не может быть отменена/);
  assert.match(route, /current\.status === "published"[\s\S]*?не может быть отменена/);
});

test("exact schedule retries reconcile the committed row before live Pinterest board preflight", () => {
  const source = read("index.js");
  const routeStart = source.indexOf('app.post("/pins/:id/schedule"');
  const routeEnd = source.indexOf('app.post("/schedule/:id/change-board"', routeStart);
  assert.notEqual(routeStart, -1, "pin schedule route must exist");
  assert.ok(routeEnd > routeStart, "pin schedule route boundary must exist");
  const route = source.slice(routeStart, routeEnd);
  const existingLookup = route.indexOf('.from("pin_schedules")');
  const exactMatch = route.indexOf("isSamePinScheduleRequest(existingSchedule, scheduleIdentity)");
  const boardPreflight = route.indexOf("await pinterest.verifyPinterestBoard");
  assert.ok(existingLookup >= 0 && exactMatch > existingLookup, "the server must load and compare the persisted request");
  assert.match(route, /\.eq\("scheduled_at", scheduledAt\)/);
  assert.match(route, /\.eq\("timezone", timezone\)/);
  assert.match(route, /\.eq\("pinterest_board_id", pinterestBoardId\)/);
  assert.match(route, /\.eq\("pinterest_account_id", selectedAccount\.id\)/);
  assert.match(route, /existingScheduleQuery\.eq\("destination_url", snapshotDestinationUrl\)/);
  assert.match(route, /existingScheduleQuery\.is\("destination_url", null\)/);
  assert.match(route, /\.limit\(1\)\s*\.maybeSingle\(\)/);
  assert.ok(boardPreflight > exactMatch, "an exact retry must return before another Pinterest API request");
  assert.match(route.slice(exactMatch, boardPreflight), /return res\.status\(200\)\.json\(sanitizeScheduleForClient\(existingSchedule\)\)/);
});
