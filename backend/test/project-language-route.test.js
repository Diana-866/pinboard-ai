const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("project creation normalizes the requested language before persistence", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(
    source,
    /const language = resolveProjectLanguage\(optionalString\(req\.body && req\.body\.language, \{ max: 10 \}\)\)/
  );
  assert.match(source, /\.insert\(\{ user_id: req\.userId, website_url, niche, language, goal, tone \}\)/);
});
