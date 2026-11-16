"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "..", "db", "migrations", "141_atomic_pin_publication_status_fencing.sql"),
  "utf8"
);
const pinterest = fs.readFileSync(path.join(__dirname, "..", "pinterest.js"), "utf8");

test("pin rejection is fenced by a database trigger under the pin row lock", () => {
  assert.match(migration, /before update of status on public\.pins[\s\S]*?guard_pin_rejection_from_publication/);
  assert.match(migration, /new\.status = 'rejected'[\s\S]*?public\.pin_schedules[\s\S]*?public\.pinterest_publish_attempts[\s\S]*?public\.pinterest_publications/);
  assert.match(migration, /using errcode = '55000'/);
});

test("schedule insertion locks and verifies the owning approved pin", () => {
  assert.match(migration, /before insert on public\.pin_schedules[\s\S]*?guard_pin_schedule_insert_requires_approved_pin/);
  assert.match(migration, /for update of p[\s\S]*?v_owner_id is distinct from new\.user_id::text[\s\S]*?v_status is distinct from 'approved'/);
});

test("manual and scheduled publication reserve account then approved pin before publication attempt", () => {
  const begin = migration.slice(
    migration.indexOf("create or replace function public.begin_pinterest_publish_v2"),
    migration.indexOf("create or replace function public.begin_scheduled_pinterest_publish")
  );
  const scheduled = migration.slice(migration.indexOf("create or replace function public.begin_scheduled_pinterest_publish"));
  assert.ok(begin.indexOf("pinterest_accounts") < begin.indexOf("for update of p"));
  assert.ok(begin.indexOf("pinterest_accounts") < begin.indexOf("for update of p"));
  assert.match(begin, /v_pin_status is distinct from 'approved'[\s\S]*?pin_not_approved/);
  assert.ok(scheduled.indexOf("pinterest_accounts") < scheduled.indexOf("for update of p"));
  assert.ok(scheduled.indexOf("for update of p") < scheduled.indexOf("public\.pin_schedules"));
});

test("publication handler maps a database pin-status fence to HTTP 409", () => {
  assert.match(pinterest, /reservationStatus === "pin_not_approved"[\s\S]*?httpError\(409/);
});
