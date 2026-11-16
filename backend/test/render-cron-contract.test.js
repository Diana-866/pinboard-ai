"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const blueprintPath = path.join(__dirname, "..", "..", "render.yaml");
const blueprint = fs.readFileSync(blueprintPath, "utf8");

test("Render Blueprint defines exactly one isolated Pinterest one-shot cron service", () => {
  const services = [...blueprint.matchAll(/^  - type: cron$/gm)];
  assert.equal(services.length, 1, "avoid accidentally deploying duplicate publishers");
  assert.match(blueprint, /^    name: pinposy-pinterest-scheduler$/m);
  assert.match(blueprint, /^    runtime: node$/m);
  assert.match(blueprint, /^    rootDir: backend$/m);
  assert.match(blueprint, /^    schedule: "\* \* \* \* \*"$/m);
  assert.match(blueprint, /^    plan: 0\.5c-512mb$/m);
  assert.match(blueprint, /^    buildCommand: npm ci$/m);
  assert.match(blueprint, /^    startCommand: npm run cron:schedule$/m);
});

test("Render Blueprint injects the backend origin and keeps the scheduler secret out of Git", () => {
  assert.match(blueprint, /^      - key: PINPOSY_BACKEND_URL\n        value: https:\/\/pinboard-ai-backend\.onrender\.com$/m);
  assert.match(blueprint, /^      - key: PINPOSY_SCHEDULER_SECRET\n        sync: false$/m);
  assert.doesNotMatch(blueprint, /PINPOSY_SCHEDULER_SECRET\n\s+value:/);
});
