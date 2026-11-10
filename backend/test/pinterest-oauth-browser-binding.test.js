const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COOKIE_NAME,
  createBrowserBinding,
  readCookie,
  matchesBrowserBinding,
  serializeBindingCookie,
  clearBindingCookie,
} = require("../pinterestOAuthBrowserBinding");

test("browser binding is random, hashed and accepted only with the matching browser secret", () => {
  const first = createBrowserBinding();
  const second = createBrowserBinding();
  assert.notEqual(first.secret, second.secret);
  assert.match(first.hash, /^[a-f0-9]{64}$/);
  assert.equal(matchesBrowserBinding(first.secret, first.hash), true);
  assert.equal(matchesBrowserBinding(second.secret, first.hash), false);
  assert.equal(matchesBrowserBinding(first.secret, second.hash), false);
  assert.equal(matchesBrowserBinding("", first.hash), false);
});

test("binding cookie is HttpOnly, Secure, host-only and usable on Pinterest top-level GET callback", () => {
  const { secret } = createBrowserBinding();
  const header = serializeBindingCookie(secret);
  assert.match(header, new RegExp("^" + COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "="));
  assert.match(header, /; Path=\//);
  assert.match(header, /; HttpOnly/);
  assert.match(header, /; Secure/);
  assert.match(header, /; SameSite=Lax/);
  assert.equal(readCookie(header, COOKIE_NAME), secret);
  assert.match(clearBindingCookie(), /Max-Age=0/);
});

test("cookie parser handles unrelated cookies and ignores malformed percent encoding", () => {
  assert.equal(readCookie("theme=dark; other=1; " + COOKIE_NAME + "=abc"), "abc");
  assert.equal(readCookie(COOKIE_NAME + "=%E0%A4%A"), null);
});
