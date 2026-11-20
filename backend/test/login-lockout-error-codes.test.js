"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { scanBareServerErrors } = require("./helpers/bare-5xx-inventory");
const loginLockout = require("../loginLockout");

/**
 * Section 120. The admin lockout endpoints were the last place where a 5xx carried an instruction the
 * reader can act on. `respondWithError` replaces every 5xx body with the generic sentence and passes
 * only the machine code, so "migration 164 has not been applied" and "the database did not answer"
 * both arrived as "внутренняя ошибка сервера" - the operator could not tell a deployment mistake from
 * a transient fault.
 */
function missingFeature() {
  return Object.assign(new Error("could not find the function public.login_lock_state"), { code: "PGRST202" });
}

test("a missing migration is a coded refusal, not a generic server error", async () => {
  const db = { rpc: async () => ({ data: null, error: missingFeature() }) };
  for (const run of [
    () => loginLockout.adminState("a@b.co", db),
    () => loginLockout.adminReset("a@b.co", db),
  ]) {
    let caught = null;
    try {
      await run();
    } catch (error) {
      caught = error;
    }
    assert.ok(caught, "the operator must be refused");
    assert.equal(caught.httpStatus, 503);
    assert.equal(caught.details?.code, "login_lockout_migration_missing");
  }
});

test("a database that did not answer is a different code than a missing migration", async () => {
  const db = { rpc: async () => ({ data: null, error: Object.assign(new Error("timeout"), { code: "08006" }) }) };
  for (const run of [
    () => loginLockout.adminState("a@b.co", db),
    () => loginLockout.adminReset("a@b.co", db),
  ]) {
    let caught = null;
    try {
      await run();
    } catch (error) {
      caught = error;
    }
    assert.ok(caught);
    assert.equal(caught.details?.code, "login_lockout_unavailable");
  }
});

test("the customer login path keeps its own answer", async () => {
  // The customer cannot apply a migration and cannot read a stack trace: the login screen offers a
  // retry, so that refusal deliberately stays uncoded (exemption, with its reason, in the guard below).
  const db = { rpc: async () => ({ data: null, error: Object.assign(new Error("boom"), { code: "08006" }) }) };
  let caught = null;
  try {
    await loginLockout.lockState("a@b.co", db);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.equal(caught.httpStatus, 503);
  assert.equal(caught.details, undefined, "the login screen already says exactly this");
});

test("the remaining bare 5xx in the four auth-path modules are accounted for", () => {
  const MODULES = {
    "loginLockout.js": {
      "Сервис входа временно недоступен": "the customer cannot apply a migration; the login screen offers a retry, which is all this refusal means",
    },
    "auth.js": {
      "Не удалось проверить данные аккаунта": "a read of our own account row failed; the screen offers a retry and nothing else can be done",
      "Не удалось создать аккаунт": "signup could not be written; the client shows its own copy for a failed signup and no field is actionable",
      "Сервис авторизации временно недоступен": "the auth service did not answer; the only possible action is to try again later",
    },
    "email-verify.js": {
      "Сервис подтверждения email временно недоступен": "the verification service did not answer; the resend button remains and that is the whole remedy",
      "Не удалось подтвердить email": "our own write to the account row failed; the screen asks to try the link again",
    },
    "mail.js": {
      "Отправка писем временно недоступна": "mail transport refused; the outbox keeps the message and the resend path is already exposed",
      "Почтовый ящик временно недоступен": "the mailbox read failed; the operator UI refreshes and no decision is implied",
      "Ответы поддержки временно недоступны": "support replies could not be read; the operator refreshes, nothing is lost",
    },
  };
  let scanned = 0;
  let exempted = 0;
  for (const [file, exemptions] of Object.entries(MODULES)) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    const bare = scanBareServerErrors(source);
    scanned += bare.length;
    for (const args of bare) {
      const reasons = Object.entries(exemptions).filter(([fragment]) => args.includes(fragment));
      assert.equal(reasons.length, 1, `${file}: "${args.trim()}" needs exactly one written reason`);
      assert.ok(reasons[0][1].length > 30, `${file}: the reason must be a sentence`);
      exempted += 1;
    }
  }
  // A guard that scans nothing passes for the wrong reason; the floor is measured today.
  assert.ok(scanned >= 10, `expected at least 10 bare 5xx in these modules, found ${scanned}`);
  assert.equal(scanned, exempted);
});
