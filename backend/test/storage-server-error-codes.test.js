"use strict";

/**
 * Section 113. The image storage module is the third place where a 5xx could hide a message the
 * customer needed, and it hid the worst kind: "the image is already stored, do not send it again".
 * Behind a 5xx that sentence disappears, and the customer does exactly the thing it forbids.
 *
 * Two of the eight bare 5xx in this module therefore carry a code now. The rest are exempted with a
 * reason: bucket configuration, our own failed writes and the provider download, where a retry is
 * safe and nothing else can be said honestly.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { scanBareServerErrors, classifyModule, findStaleExemptions } = require("./helpers/bare-5xx-inventory");

const EXEMPT = {
  "Не удалось проверить настройки хранилища изображений":
    "Bucket configuration: an operator problem, and the customer can only retry or report it.",
  "Не удалось создать бакет изображений":
    "Same class: the deployment has no usable bucket, and the provider's own words stay in the log.",
  "Настройки бакета pin-images не соответствуют требованиям приложения":
    "A deployment invariant refused at startup of the upload path; nothing to instruct the customer to do.",
  "Не удалось сохранить изображение":
    "Our write to Storage failed. The customer may safely upload again, and the provider text is ours to read in the log.",
  "Не удалось получить ссылку на изображение":
    "An upload that returned no public URL is our bug; the customer has nothing to fix and the retry is safe.",
  "Не удалось безопасно получить изображение от провайдера":
    "The provider's file could not be fetched; the customer can only retry the generation.",
};

test("every bare 5xx in the image storage module is coded or exempted with a reason", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "storage.js"), "utf8");
  const { uncoded, unclassified, total } = classifyModule(source, EXEMPT);

  // A scanner that finds nothing proves nothing; the module has these sites today.
  assert.ok(total >= 6, `the scanner must see the storage 5xx sites, saw ${total}`);
  assert.deepEqual(
    unclassified.map((args) => args.slice(0, 70)),
    [],
    "a storage 5xx the customer can act on must carry a code instead of a message nobody sees"
  );
  assert.deepEqual(findStaleExemptions(uncoded, EXEMPT), [], "a stale exemption must be deleted");
});

test("the refusals that tell the customer the image is already safe carry the code", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "storage.js"), "utf8").replace(/\r\n/g, "\n");
  assert.match(source, /imageAlreadyStoredError\("Изображение уже сохранено/);
  assert.match(source, /imageAlreadyStoredError\("Не удалось проверить ранее сохранённое изображение/);
  assert.equal((source.match(/imageAlreadyStoredError\(/g) || []).length, 3, "definition plus two call sites");
});

test("the shared scanner distinguishes a bare 5xx from a coded one and from a 4xx", () => {
  const synthetic = [
    'throw httpError(503, "Не удалось сохранить изображение");',
    'throw imageAlreadyStoredError("Изображение уже сохранено");',
    'throw httpError(422, "не 5xx, не считается");',
    'throw httpError(500, "сообщение с точкой с запятой; и продолжением");',
  ].join("\n") + "\n";
  const found = scanBareServerErrors(synthetic);
  assert.equal(found.length, 2, "only the two bare 5xx count");
  assert.ok(found.some((args) => args.includes("точкой с запятой")));
});
