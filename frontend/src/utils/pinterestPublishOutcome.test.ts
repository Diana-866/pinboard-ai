import test from "node:test";
import assert from "node:assert/strict";
import { isAmbiguousPinterestPublishStatus } from "./pinterestPublishOutcome";

test("fences publish retries when the remote outcome may be unknown", () => {
  for (const status of [0, 409, 500, 502, 503, 504]) {
    assert.equal(isAmbiguousPinterestPublishStatus(status), true);
  }
});

test("keeps definite client validation errors actionable", () => {
  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(isAmbiguousPinterestPublishStatus(status), false);
  }
});

test("a reconciliation code fences the retry even on a status that looks actionable", () => {
  // Section 109 gave the customer one sentence: "do not publish again". If the interface answers
  // that sentence with a working retry button, the sentence was decoration.
  assert.equal(isAmbiguousPinterestPublishStatus(422, "publication_reconciliation_required"), true);
  assert.equal(isAmbiguousPinterestPublishStatus(400, "pin_already_scheduled"), true);
  assert.equal(isAmbiguousPinterestPublishStatus(200, "publication_reconciliation_required"), true);
});

test("a code that names something the customer must fix keeps the action available", () => {
  for (const code of ["board_selection_required", "pin_image_missing", "pinterest_publication_rejected"]) {
    assert.equal(isAmbiguousPinterestPublishStatus(422, code), false, code);
  }
  // An unknown or missing code changes nothing: the status rule still applies.
  assert.equal(isAmbiguousPinterestPublishStatus(422, undefined), false);
  assert.equal(isAmbiguousPinterestPublishStatus(422, null), false);
  assert.equal(isAmbiguousPinterestPublishStatus(422, 42), false);
  assert.equal(isAmbiguousPinterestPublishStatus(502, "some_future_code"), true);
});
