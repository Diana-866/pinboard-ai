const test = require("node:test");
const assert = require("node:assert/strict");
const { isBlockedIp, resolvePublic } = require("../safeFetch");

test("blocks private, loopback, link-local and reserved IPv4 ranges", () => {
  for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "192.0.0.8", "192.0.2.1", "198.51.100.1", "203.0.113.1", "224.0.0.1"]) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
});

test("allows ordinary public IPv4 and global-unicast IPv6", () => {
  assert.equal(isBlockedIp("1.1.1.1"), false);
  assert.equal(isBlockedIp("8.8.8.8"), false);
  assert.equal(isBlockedIp("2001:4860:4860::8888"), false);
});

test("blocks local and special-use IPv6 ranges", () => {
  for (const ip of ["::", "::1", "fc00::1", "fd12::1", "fe80::1", "ff02::1", "2001:db8::1", "2002::1", "3fff::1", "::ffff:127.0.0.1"]) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
});

test("resolvePublic rejects private literal addresses and accepts public literals", async () => {
  await assert.rejects(resolvePublic("127.0.0.1"));
  await assert.rejects(resolvePublic("169.254.169.254"));
  const result = await resolvePublic("8.8.8.8");
  assert.deepEqual(result, [{ address: "8.8.8.8", family: 4 }]);
});
