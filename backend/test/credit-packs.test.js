"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CREDIT_PACKS,
  CURRENCIES,
  assertCatalogIntegrity,
  packCatalog,
  normalizePackId,
  packAmount,
} = require("../creditPacks");

/**
 * Пакеты кредитов — это деньги: цена и размер пакета берутся отсюда, а не из
 * запроса клиента. Тесты фиксируют (1) целостность каталога, (2) что клиент не
 * может влиять на сумму или размер, (3) что отсутствие цены падает закрыто, а не
 * превращается в бесплатный пакет.
 */

test("the shipped catalogue is internally consistent", () => {
  assert.doesNotThrow(() => assertCatalogIntegrity(CREDIT_PACKS, CURRENCIES));
  assert.deepEqual(Object.keys(CREDIT_PACKS), ["pack_100", "pack_500", "pack_1000"]);
  for (const [id, pack] of Object.entries(CREDIT_PACKS)) {
    assert.equal(id, `pack_${pack.credits}`, "the id must encode the credit count");
    assert.ok(Number.isInteger(pack.credits) && pack.credits > 0);
    for (const currency of CURRENCIES) {
      const amount = pack.amount[currency];
      assert.ok(Number.isInteger(amount) && amount > 0, `${id} must cost money in ${currency}`);
    }
  }
});

test("a larger pack never costs less per credit than a smaller one", () => {
  // A pricing table where the bigger pack is a worse deal is a support incident,
  // not a preference.
  const perCredit = packCatalog().map((pack) => pack.amount.rub / pack.credits);
  for (let index = 1; index < perCredit.length; index += 1) {
    assert.ok(
      perCredit[index] <= perCredit[index - 1],
      `pack at index ${index} is more expensive per credit than the previous one`
    );
  }
});

test("catalogue integrity rejects zero, fractional, duplicated and mislabelled prices", () => {
  const valid = () => ({
    pack_100: { credits: 100, amount: { rub: 190 }, title: "S" },
    pack_500: { credits: 500, amount: { rub: 790 }, title: "M" },
  });
  assert.doesNotThrow(() => assertCatalogIntegrity(valid(), ["rub"]));

  const zeroPrice = valid();
  zeroPrice.pack_100.amount.rub = 0;
  assert.throws(() => assertCatalogIntegrity(zeroPrice, ["rub"]), /amount\.rub/);

  const fractional = valid();
  fractional.pack_100.amount.rub = 190.5;
  assert.throws(() => assertCatalogIntegrity(fractional, ["rub"]), /amount\.rub/);

  const duplicate = valid();
  duplicate.pack_500.amount.rub = 190;
  assert.throws(() => assertCatalogIntegrity(duplicate, ["rub"]), /дублирующая цена/);

  const mislabelled = valid();
  mislabelled.pack_500.credits = 400;
  assert.throws(() => assertCatalogIntegrity(mislabelled, ["rub"]), /не совпадает с credits/);

  const missingCurrency = valid();
  delete missingCurrency.pack_100.amount.rub;
  assert.throws(() => assertCatalogIntegrity(missingCurrency, ["rub"]), /amount\.rub/);

  const badId = { "pack 100": { credits: 100, amount: { rub: 190 }, title: "S" } };
  assert.throws(() => assertCatalogIntegrity(badId, ["rub"]), /pack_<количество кредитов>/);
});

test("the public catalogue exposes prices as data, not as a single number", () => {
  const catalogue = packCatalog();
  assert.equal(catalogue.length, 3);
  for (const entry of catalogue) {
    assert.deepEqual(Object.keys(entry).sort(), ["amount", "credits", "id", "title"]);
    assert.deepEqual(Object.keys(entry.amount), CURRENCIES);
  }
  // Callers must not be able to mutate the shipped catalogue through the copy.
  catalogue[0].amount.rub = 1;
  assert.equal(CREDIT_PACKS.pack_100.amount.rub, 190);
});

test("normalizePackId normalizes real input and rejects everything else", () => {
  assert.equal(normalizePackId("pack_100"), "pack_100");
  assert.equal(normalizePackId("  PACK_500  "), "pack_500");
  assert.equal(normalizePackId("Pack_1000"), "pack_1000");

  assert.equal(normalizePackId("pack_999"), null);
  assert.equal(normalizePackId(""), null);
  assert.equal(normalizePackId("   "), null);
  assert.equal(normalizePackId(null), null);
  assert.equal(normalizePackId(undefined), null);
  assert.equal(normalizePackId(100), null, "a bare number is not a package id");
  // Prototype keys must never resolve to a catalogue entry.
  assert.equal(normalizePackId("__proto__"), null);
  assert.equal(normalizePackId("constructor"), null);
  assert.equal(normalizePackId("toString"), null);
  // A JSON array stringifies to the id, so it must be rejected by type first.
  assert.equal(normalizePackId(["pack_100"]), null);
  assert.equal(normalizePackId({ id: "pack_100" }), null);
});

test("packAmount returns the catalogue price and ignores anything client-shaped", () => {
  assert.equal(packAmount("pack_100", "rub"), 190);
  assert.equal(packAmount("pack_500", "rub"), 790);
  assert.equal(packAmount("pack_1000", "rub"), 1290);
});

test("packAmount fails closed on an unknown pack or currency", () => {
  assert.throws(() => packAmount("pack_999", "rub"), (error) => error.httpStatus === 422);
  assert.throws(() => packAmount("pack_100", "usd"), (error) => error.httpStatus === 422);
  assert.throws(() => packAmount("pack_100", ""), (error) => error.httpStatus === 422);
  assert.throws(() => packAmount("pack_100", undefined), (error) => error.httpStatus === 422);
  // Reading an inherited property must not resolve to a pack.
  assert.throws(() => packAmount("__proto__", "rub"), (error) => error.httpStatus === 422);
  assert.throws(() => packAmount("constructor", "rub"), (error) => error.httpStatus === 422);
});
