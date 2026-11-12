"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CREDIT_PACKS,
  CURRENCIES,
  packCatalog,
  normalizePackId,
  packAmount,
} = require("../creditPacks");

test("credit pack catalog exposes the published RUB offers exactly", () => {
  assert.deepEqual(packCatalog(), [
    {
      id: "pack_100",
      title: "Пакет S — 100 кредитов",
      credits: 100,
      amount: { rub: 190 },
    },
    {
      id: "pack_500",
      title: "Пакет M — 500 кредитов",
      credits: 500,
      amount: { rub: 790 },
    },
    {
      id: "pack_1000",
      title: "Пакет L — 1000 кредитов",
      credits: 1000,
      amount: { rub: 1290 },
    },
  ]);
});

test("credit pack catalog is the only source of purchasable credit quantities and prices", () => {
  assert.deepEqual(Object.keys(CREDIT_PACKS).sort(), ["pack_100", "pack_1000", "pack_500"]);
  assert.deepEqual(CURRENCIES, ["rub"]);
  for (const [id, pack] of Object.entries(CREDIT_PACKS)) {
    assert.equal(packAmount(id, "rub"), pack.rub);
    assert.ok(Number.isInteger(pack.credits) && pack.credits > 0);
    assert.ok(Number.isFinite(pack.rub) && pack.rub > 0);
  }
});

test("pack IDs are normalized but arbitrary client-supplied IDs are rejected", () => {
  assert.equal(normalizePackId(" PACK_100 "), "pack_100");
  assert.equal(normalizePackId("Pack_500"), "pack_500");
  assert.equal(normalizePackId("pack_100000"), null);
  assert.equal(normalizePackId(""), null);
  assert.equal(normalizePackId(null), null);
});

test("credit packs reject unsupported currencies and unknown package IDs", () => {
  assert.throws(() => packAmount("missing", "rub"), (error) => error.httpStatus === 422);
  assert.throws(() => packAmount("pack_100", "usd"), (error) => error.httpStatus === 422);
});
