"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");

/**
 * День 4 плана: воркер удаления аккаунтов действительно запускается.
 *
 * Проверяется именно отдельная точка входа, а не фабрика: гейт включён — процесс стартует и не
 * падает от первого тика, гейт выключен — процесс честно отказывается работать с кодом 1.
 * База не нужна: Supabase здесь недостижим по имени, поэтому проверяется запуск, а не удаление.
 */
const ENTRY = path.join(__dirname, "..", "accountDeletionWorker.js");

function startWorker(env) {
  const child = spawn(process.execPath, [ENTRY], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "production",
      SUPABASE_URL: "https://worker-start.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "worker-start-key",
      JWT_SECRET: "pinposy-worker-start-secret-32+bytes",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  return { child, output: () => output };
}

test("without the explicit opt-in the standalone worker refuses to run", async () => {
  const { child, output } = startWorker({ ACCOUNT_DELETION_WORKER_ENABLED: "" });
  // Ожидание ограничено: если гейт перестанет работать, процесс продолжит жить, и тест обязан
  // сообщить об этом, а не висеть до общего таймаута прогона.
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve("did-not-exit");
    }, 10_000);
    child.once("exit", (value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
  assert.equal(code, 1, "the gate must not be bypassed by running the file directly");
  assert.match(output(), /ACCOUNT_DELETION_WORKER_ENABLED=true/);
});

test("with the opt-in the worker starts and survives its first ticks", async () => {
  const { child, output } = startWorker({ ACCOUNT_DELETION_WORKER_ENABLED: "true", ACCOUNT_DELETION_WORKER_INTERVAL_MS: "5000" });
  try {
    // Тик не должен ронять процесс: недостижимый Supabase — это ошибка шага, а не повод умереть.
    await new Promise((resolve) => setTimeout(resolve, 3500));
    assert.equal(child.exitCode, null, `worker exited early:\n${output()}`);
    assert.match(output(), /account_deletion_worker/, "the worker must say what it is doing");
    assert.doesNotMatch(output(), /process\.uncaught_exception/, "an unreachable database must not be fatal");
  } finally {
    child.kill("SIGKILL");
  }
});
