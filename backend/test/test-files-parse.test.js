"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

/**
 * Тестовый файл с синтаксической ошибкой не падает «громко»: он целиком исключается из прогона,
 * а отчёт показывает лишь одну строку сбоя. Так `admin-payment-creation-requests.test.js` потерял
 * все 14 проверок админ-платежей из-за лишней скобки в стрелочной функции — и никто этого не видел,
 * потому что счётчик файлов при этом не менялся.
 *
 * Здесь каждый файл проверяется `node --check`: это миллисекунды и никакой базы.
 */
const TEST_DIR = __dirname;

function testFiles() {
  return fs
    .readdirSync(TEST_DIR)
    .filter((name) => /\.test\.(js|cjs|mjs)$/.test(name))
    .sort()
    .map((name) => path.join(TEST_DIR, name));
}

test("the scan sees the whole test directory", () => {
  const files = testFiles();
  assert.ok(files.length > 100, `expected the test files, found ${files.length}`);
});

test("every test file parses", () => {
  const broken = [];
  for (const file of testFiles()) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0) {
      const reason = (result.stderr || String(result.error || ""))
        .split(String.fromCharCode(10))
        .filter((line) => line.trim().length > 0)
        .slice(0, 2)
        .join(" / ");
      broken.push(`${path.basename(file)}: ${reason}`);
    }
  }
  assert.deepEqual(broken, [], `test files that cannot even be parsed:\n${broken.join(String.fromCharCode(10))}`);
});
