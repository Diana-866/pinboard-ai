"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidScheduleWorkerResponse } = require("../scheduleResponse");

const emptyResponse = () => ({ ok: true, claimed: 0, published: 0, failed: 0, scheduled: 0, unknown: 0, results: [] });

test("accepts an empty queue and a valid one-item result", () => {
  assert.equal(isValidScheduleWorkerResponse(emptyResponse()), true);
  assert.equal(isValidScheduleWorkerResponse({
    ok: true, claimed: 1, published: 0, failed: 0, scheduled: 1, unknown: 0,
    results: [{ schedule_id: "schedule-1", status: "scheduled" }],
  }), true);
});

test("rejects missing identity, duplicate identity, contradictory counters and oversized batches", () => {
  for (const data of [
    { ...emptyResponse(), claimed: 1, results: [{ status: "published" }] },
    { ...emptyResponse(), claimed: 1, published: 1, results: [{ schedule_id: "x", status: "failed" }] },
    { ...emptyResponse(), claimed: 2, published: 2, results: [
      { schedule_id: "x", status: "published" }, { schedule_id: "y", status: "published" },
    ] },
    { ...emptyResponse(), claimed: 2, published: 2, results: [
      { schedule_id: "x", status: "published" }, { schedule_id: "x", status: "published" },
    ] },
  ]) assert.equal(isValidScheduleWorkerResponse(data), false);
});

test("rejects negative, unsafe and mismatched counters", () => {
  assert.equal(isValidScheduleWorkerResponse({ ...emptyResponse(), claimed: -1 }), false);
  assert.equal(isValidScheduleWorkerResponse({ ...emptyResponse(), claimed: Number.MAX_SAFE_INTEGER + 1 }), false);
  assert.equal(isValidScheduleWorkerResponse({
    ...emptyResponse(), claimed: 1, scheduled: 1,
    results: [{ schedule_id: "x", status: "published" }],
  }), false);
});
