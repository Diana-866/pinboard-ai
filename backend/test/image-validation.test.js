const test = require("node:test");
const assert = require("node:assert/strict");
const { detectImageType, validateImageBuffer } = require("../imageValidation");

const samples = [
  ["image/png", Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])],
  ["image/jpeg", Buffer.from([0xff,0xd8,0xff,0xe0])],
  ["image/webp", Buffer.from("RIFF0000WEBP", "ascii")],
  ["image/gif", Buffer.from("GIF89a", "ascii")],
];

for (const [mime, bytes] of samples) {
  test(`accepts matching ${mime} signature`, () => {
    assert.equal(validateImageBuffer(bytes, mime).mime, mime);
  });
}

test("rejects SVG even when the client labels it as an image", () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(detectImageType(svg), null);
  assert.throws(() => validateImageBuffer(svg, "image/svg+xml"));
  assert.throws(() => validateImageBuffer(svg, "image/png"));
});

test("rejects arbitrary content disguised as a raster image", () => {
  assert.throws(() => validateImageBuffer(Buffer.from("<html>not an image</html>"), "image/jpeg"));
});

test("rejects MIME/signature mismatches", () => {
  const png = samples[0][1];
  assert.throws(() => validateImageBuffer(png, "image/jpeg"));
});

test("detects valid raster content when upstream omits Content-Type", () => {
  assert.equal(validateImageBuffer(samples[0][1], "").mime, "image/png");
});
