"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizePinterestSchedulerHealth } = require("../pinterestSchedulerHealth");

test("scheduler health distinguishes never-seen, fresh and stale runs", () => {
  const now = Date.parse("2026-11-11T12:00:00.000Z");
  assert.equal(summarizePinterestSchedulerHealth(null, now).status, "not_seen");
  const fresh = summarizePinterestSchedulerHealth({
    status: "succeeded",
    last_started_at: "2026-11-11T11:59:30.000Z",
    last_completed_at: "2026-11-11T11:59:31.000Z",
    claimed: 1, published: 1, failed: 0, scheduled: 0, unknown: 0,
  }, now);
  assert.equal(fresh.status, "healthy");
  assert.equal(fresh.counts.published, 1);
  const stale = summarizePinterestSchedulerHealth({
    status: "running", last_started_at: "2026-11-11T11:55:00.000Z",
  }, now);
  assert.equal(stale.status, "stale");
});

test("scheduler health reports a recent failed run without exposing arbitrary data", () => {
  const health = summarizePinterestSchedulerHealth({
    status: "failed", last_started_at: "2026-11-11T11:59:30.000Z",
    last_completed_at: "2026-11-11T11:59:31.000Z",
    last_error_code: "worker_run_failed", claimed: 0,
    secret: "must-not-appear",
  }, Date.parse("2026-11-11T12:00:00.000Z"));
  assert.equal(health.status, "failed");
  assert.equal(JSON.stringify(health).includes("must-not-appear"), false);
  assert.equal("secret" in health, false);
});
