"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidScheduleWorkerResponse } = require("../scheduleResponse");

const emptyResponse = () => ({
  ok: true,
  claimed: 0,
  published: 0,
  failed: 0,
  scheduled: 0,
  unknown: 0,
  results: [],
});

test("scheduler response accepts an empty queue", () => {
  assert.equal(isValidScheduleWorkerResponse(emptyResponse()), true);
});

test("scheduler response accepts one identified scheduled result", () => {
  assert.equal(isValidScheduleWorkerResponse({
    ok: true,
    claimed: 1,
    published: 0,
    failed: 0,
    scheduled: 1,
    unknown: 0,
    results: [{ schedule_id: "schedule-1", status: "scheduled" }],
  }), true);
});

test("scheduler response rejects missing identity and accepts one identified result", () => {
  const missingId = {
    ...emptyResponse(),
    claimed: 1,
    results: [{ status: "published" }],
  };
  assert.equal(isValidScheduleWorkerResponse(missingId), false);

  const identifiedResult = {
    ...emptyResponse(),
    claimed: 1,
    published: 1,
    results: [
      { schedule_id: "schedule-1", status: "published" },
    ],
  };
  assert.equal(isValidScheduleWorkerResponse(identifiedResult), true);
});

test("scheduler response rejects contradictory counters and unsupported batch sizes", () => {
  assert.equal(isValidScheduleWorkerResponse({
    ...emptyResponse(),
    claimed: 1,
    published: 1,
    results: [{ schedule_id: "schedule-1", status: "failed" }],
  }), false);

  assert.equal(isValidScheduleWorkerResponse({
    ...emptyResponse(),
    claimed: 2,
    published: 2,
    results: [
      { schedule_id: "schedule-1", status: "published" },
      { schedule_id: "schedule-2", status: "published" },
    ],
  }), false);
});

test("scheduler response rejects unsafe and negative counters", () => {
  assert.equal(isValidScheduleWorkerResponse({
    ...emptyResponse(),
    claimed: -1,
  }), false);
  assert.equal(isValidScheduleWorkerResponse({
    ...emptyResponse(),
    claimed: Number.MAX_SAFE_INTEGER + 1,
  }), false);
});

test("scheduler response rejects oversized result lists and count mismatches", () => {
  const oversized = {
    ok: true,
    claimed: 1,
    published: 1,
    failed: 0,
    scheduled: 0,
    unknown: 0,
    results: [
      { schedule_id: "schedule-1", status: "published" },
      { schedule_id: "schedule-1", status: "published" },
    ],
  };
  assert.equal(isValidScheduleWorkerResponse(oversized), false);

  const wrongCount = {
    ok: true,
    claimed: 1,
    published: 0,
    failed: 0,
    scheduled: 1,
    unknown: 0,
    results: [{ schedule_id: "schedule-1", status: "published" }],
  };
  assert.equal(isValidScheduleWorkerResponse(wrongCount), false);
});
