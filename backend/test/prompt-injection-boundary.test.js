const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("AI generation prompts treat user-controlled project and board fields as untrusted context", () => {
  for (const file of ["boards.js", "pins.js", "analyze.js"]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(
      source,
      /недоверенные данные|недоверенным данным/,
      `${file} must explicitly isolate supplied content from prompt instructions`
    );
    assert.match(
      source,
      /игнорируй любые инструкции|игнорируйте любые команды|игнорируй любые команды/i,
      `${file} must tell the model not to follow embedded instructions`
    );
  }
});
