"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Section 150. The repository ships `.env.example`, `docs/USER_ACTIONS.md` tells the owner to create
 * `backend/.env`, and `backend/.gitignore` keeps that file out of Git - but nothing ever read it.
 *
 * `npm start` runs `node index.js`, no dotenv dependency is installed, and the file was therefore
 * decorative: every value the owner filled in was ignored, the process crashed on the first missing
 * variable, and the fatal handler printed only `{"level":"fatal","event":"process.uncaught_exception"}`
 * with no reason. The owner hit this twice before the cause was visible.
 *
 * Node 22 reads the file itself with `--env-file-if-exists`, which keeps a fresh clone working (no file
 * means no failure) and does not add a dependency. This guard keeps the flag on every entrypoint that
 * runs the real service, because a silent regression here is invisible until a deployment fails.
 */

const SCRIPT = path.join(__dirname, "..", "package.json");

/** Every script that starts a long-lived process and therefore needs the environment. */
const RUNTIME_SCRIPTS = ["start", "worker", "worker:account-deletion", "cron:schedule"];

function scripts() {
  return JSON.parse(fs.readFileSync(SCRIPT, "utf8")).scripts || {};
}

test("every runtime entrypoint loads .env itself", () => {
  const missing = RUNTIME_SCRIPTS.filter((name) => {
    const command = scripts()[name];
    if (typeof command !== "string" || command.trim() === "") return true;
    return !/--env-file(-if-exists)?=\.env/.test(command);
  });
  assert.deepEqual(missing, [],
    `these scripts would ignore backend/.env:\n${missing.join("\n")}`);
});

test("the test script deliberately does not read .env", () => {
  // Набор тестов задаёт окружение сам; чтение боевого .env смешало бы тесты с настоящими ключами.
  assert.doesNotMatch(scripts().test || "", /--env-file/);
});

test("the flag tolerates a missing file, so a fresh clone still starts", () => {
  for (const name of RUNTIME_SCRIPTS) {
    assert.match(scripts()[name], /--env-file-if-exists=\.env/,
      `${name} must not fail when backend/.env is absent`);
  }
});
