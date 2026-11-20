"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Payment failures are the one class of error where the customer must understand the exact
 * situation, because the wrong reaction costs money: "the invoice exists but you have no link"
 * invites a second payment. These failures were Russian-only.
 *
 * The provider paths are exercised directly against a stubbed axios. The two order-preparation
 * paths sit behind a large amount of state, so they are pinned at the source: each message must
 * be raised through the helper that attaches the code, so a future edit cannot quietly drop it
 * and leave the customer with a Russian sentence on the checkout screen.
 */

const axiosPath = require.resolve("axios");
const realAxios = require("axios");

const OFFLINE_KEYS = ["PRODAMUS_OFFLINE", "PRODAMUS_DEMO"];

function withProviderEnv() {
  process.env.PRODAMUS_URL = process.env.PRODAMUS_URL || "https://pay.example.com";
  process.env.PRODAMUS_SECRET = process.env.PRODAMUS_SECRET || "test-secret";
  process.env.PRODAMUS_SYS = process.env.PRODAMUS_SYS || "test-sys";
  for (const key of OFFLINE_KEYS) delete process.env[key];
}

function loadProdamus(post) {
  withProviderEnv();
  require.cache[axiosPath] = {
    id: axiosPath,
    filename: axiosPath,
    loaded: true,
    exports: { post },
  };
  delete require.cache[require.resolve("../prodamus")];
  return require("../prodamus");
}

test.after(() => {
  require.cache[axiosPath] = { id: axiosPath, filename: axiosPath, loaded: true, exports: realAxios };
  delete require.cache[require.resolve("../prodamus")];
});

test("a provider that cannot be reached is reported with a code the client localizes", async () => {
  const prodamus = loadProdamus(async () => {
    const error = new Error("connect ETIMEDOUT");
    error.code = "ETIMEDOUT";
    throw error;
  });

  await assert.rejects(
    () => prodamus.createPaymentLink({ orderId: "pp_pro_1", amount: 1000, email: "a@example.com", plan: "pro" }),
    (thrown) => {
      assert.equal(thrown.httpStatus, 502);
      assert.deepEqual(thrown.details, { code: "payment_provider_unavailable" });
      return true;
    }
  );
});

test("an unconfirmed invoice is reported with the same code, and stays ambiguous internally", async () => {
  // A 5xx or a redirect from the provider is not proof that the invoice was not created, so the
  // error keeps the internal marker while the customer sees one category.
  for (const [status, expectedRejected] of [[500, false], [302, false], [400, true]]) {
    const prodamus = loadProdamus(async () => ({ status, data: {} }));

    await assert.rejects(
      () => prodamus.createPaymentLink({ orderId: "pp_pro_2", amount: 1000, email: "a@example.com", plan: "pro" }),
      (thrown) => {
        assert.equal(thrown.httpStatus, 502);
        assert.equal(thrown.details.code, "payment_provider_unavailable");
        assert.equal(Boolean(thrown.providerRejected), expectedRejected, `provider status ${status}`);
        return true;
      }
    );
  }
});

const CODES = {
  payment_provider_unavailable: [502],
  payment_link_not_saved: [503],
  payment_order_preparation_failed: [503],
};

test("the helpers attach the documented code and the documented status", () => {
  const {
    paymentProviderUnavailable,
    paymentLinkNotSaved,
    paymentOrderPreparationFailed,
  } = require("../paymentErrors");

  const built = {
    payment_provider_unavailable: paymentProviderUnavailable(),
    payment_link_not_saved: paymentLinkNotSaved(),
    payment_order_preparation_failed: paymentOrderPreparationFailed(),
  };
  for (const [code, [status]] of Object.entries(CODES)) {
    const error = built[code];
    assert.equal(error.details.code, code);
    assert.equal(error.httpStatus, status);
    // The Russian text stays: logs and the owner read it.
    assert.ok(error.message.trim().length > 10);
  }
});

test("every order-preparation failure is raised through the helper that attaches its code", () => {
  const backend = path.join(__dirname, "..");
  for (const file of ["billing.js", "creditsBilling.js"]) {
    const source = fs.readFileSync(path.join(backend, file), "utf8");

    // The old shape: a bare httpError without a code. Both messages must not come back.
    assert.doesNotMatch(
      source,
      /httpError\(503, "Счёт создан, но не удалось сохранить ссылку/,
      `${file} must raise the unsaved-link failure through paymentLinkNotSaved()`
    );
    assert.doesNotMatch(
      source,
      /httpError\(503, "Не удалось безопасно подготовить заказ/,
      `${file} must raise the unprepared-order failure through paymentOrderPreparationFailed()`
    );
    assert.match(source, /paymentLinkNotSaved\(\)/, `${file} must keep the unsaved-link code`);
    assert.match(source, /paymentOrderPreparationFailed\(\)/, `${file} must keep the unprepared-order code`);
  }
});

test("the provider failures keep their codes instead of a bare httpError", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "prodamus.js"), "utf8");
  assert.doesNotMatch(source, /httpError\(502, "Платёжный сервис не отвечает/);
  assert.doesNotMatch(source, /httpError\(502, "Prodamus не подтвердил создание счёта/);
  assert.match(source, /paymentProviderUnavailable\(/);
});

test("the provider client never hides the two money facts behind a bare 5xx", async () => {
  // Section 114. `prodamus.js` is the last module on the checkout path, and it raised six bare 5xx
  // for "this deployment has no payment configuration" and three for "the provider gave us no usable
  // link". The customer read "внутренняя ошибка сервера" and had no idea whether money had moved.
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "..", "prodamus.js"), "utf8").replace(/\r\n/g, "\n");
  const bare = [...source.matchAll(/throw\s+httpError\(([\s\S]*?)\);\n/g)]
    .filter((match) => {
      const status = Number(match[1].split(",")[0]);
      return Number.isInteger(status) && status >= 500;
    });
  assert.deepEqual(bare.map((match) => match[1].slice(0, 50)), [], "no bare 5xx may remain in the provider client");

  // A missing configuration means "payments are off here", not "our bug": the customer must be told
  // nothing was charged, and the deployment detail stays in the log.
  assert.match(source, /throw paymentsNotConfigured\("PRODAMUS_SECRET не задан"\)/);
  // A provider that answers without a usable link leaves no invoice behind.
  assert.match(source, /"payment_not_started"/);
  assert.ok(
    (source.match(/"payment_not_started"/g) || []).length >= 3,
    "every invoice-less failure must name the money fact"
  );
  // A count alone cannot say *which* failure kept the code: these three block the checkout, and each
  // one must still name the money fact in the same call. The list has a floor of its own, so an empty
  // list cannot make this check pass by checking nothing.
  const blockingRefusals = [
    "некорректную ссылку на оплату",
    "небезопасную ссылку на оплату",
    "не вернул ссылку на оплату",
  ];
  assert.ok(blockingRefusals.length >= 3, "the list of blocking refusals must not shrink silently");
  const carrying = blockingRefusals.filter((message) => {
    const at = source.indexOf(message);
    return at > 0 && /"payment_not_started"/.test(source.slice(at, at + 220));
  });
  assert.deepEqual(blockingRefusals.filter((message) => !carrying.includes(message)), [], "a blocking refusal lost the money fact");
});
