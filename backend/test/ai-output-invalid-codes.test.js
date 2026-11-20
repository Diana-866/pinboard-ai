"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { scanBareServerErrors } = require("./helpers/bare-5xx-inventory");
const { parseAnalysisResponse, parseBoardIdeasResponse, parsePinIdeasResponse } = require("../textOutputValidation");
const { parseKeywordIdeasResponse } = require("../keywordIdeas");

/**
 * Section 119. `textOutputValidation.js` and `keywordIdeas.js` refuse unusable model output with a
 * 502 - a status that never carries its message. Those refusals reach three paying routes (/analyze,
 * /boards, /pins) and one (/keyword-ideas), and the person on the other side was told "internal server
 * error" without learning the one fact that matters: the attempt spent nothing.
 *
 * The guard is an inventory, not a reading: every 5xx in either module must be raised through
 * `invalidAiOutput`, which attaches `ai_output_invalid`, and the exemption list must stay empty -
 * there is no site here that should keep a bare 5xx.
 */
const MODULES = [
  { file: "textOutputValidation.js", floor: 16 },
  { file: "keywordIdeas.js", floor: 7 },
];

function readModule(file) {
  return fs.readFileSync(path.join(__dirname, "..", file), "utf8");
}

test("every refusal in the model-output modules carries the code, none is left bare", () => {
  for (const { file, floor } of MODULES) {
    const source = readModule(file);
    const bare = scanBareServerErrors(source);
    assert.deepEqual(bare, [], `${file}: no throw may build a 5xx itself, they all go through invalidAiOutput`);
    // And the helper really is the single place that builds it.
    assert.equal(
      (source.match(/const error = httpError\(502, message\);/g) || []).length,
      1,
      `${file}: invalidAiOutput must be the only builder`
    );

    const calls = (source.match(/throw invalidAiOutput\(/g) || []).length;
    assert.ok(calls >= floor, `${file}: expected at least ${floor} coded refusals, found ${calls}`);
    assert.match(source, /const AI_OUTPUT_INVALID = "ai_output_invalid";/, `${file}: the code must be named once`);
  }
});

test("the scanner really sees a bare 5xx, so a green run means something", () => {
  const sample = 'function f() {\n  throw httpError(502, "Нейросеть вернула пустой ответ");\n}\n';
  assert.equal(scanBareServerErrors(sample).length, 1);
  assert.equal(scanBareServerErrors('throw invalidAiOutput("x");\n').length, 0);
});

test("each module really refuses unusable output with that code", () => {
  const expectations = [
    [() => parseAnalysisResponse(""), "analysis of an empty answer"],
    [() => parseAnalysisResponse("не json"), "analysis of a non-JSON answer"],
    [() => parseBoardIdeasResponse(""), "board ideas from an empty answer"],
    [() => parseBoardIdeasResponse(JSON.stringify({ boards: [] })), "board ideas from an empty list"],
    [() => parsePinIdeasResponse(""), "pin ideas from an empty answer"],
    [() => parsePinIdeasResponse(JSON.stringify({ pins: [] })), "pin ideas from an empty list"],
    [() => parseKeywordIdeasResponse(""), "keyword ideas from an empty answer"],
    [() => parseKeywordIdeasResponse(JSON.stringify({ keywords: [] })), "keyword ideas from an empty list"],
  ];
  for (const [run, label] of expectations) {
    let caught = null;
    try {
      run();
    } catch (error) {
      caught = error;
    }
    assert.ok(caught, `${label} must be refused`);
    assert.equal(caught.httpStatus, 502, `${label} must stay a bad-gateway`);
    assert.equal(caught.details?.code, "ai_output_invalid", `${label} must carry the code`);
    assert.ok(caught.message && caught.message.length > 0, `${label} must keep a message for the log`);
  }
});
