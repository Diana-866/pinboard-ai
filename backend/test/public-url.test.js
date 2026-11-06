const test = require("node:test");
const assert = require("node:assert/strict");
const { isPrivateIp, createPinnedLookup } = require("../publicUrl");

test("blocks private, loopback, link-local, CGNAT and reserved IPv4 ranges", () => {
  for (const ip of [
    "0.1.2.3", "10.0.0.1", "100.64.0.1", "127.0.0.1",
    "169.254.169.254", "172.16.0.1", "192.0.0.1", "192.0.2.1",
    "192.88.99.1", "192.168.1.1", "198.18.0.1", "198.51.100.1",
    "203.0.113.1", "224.0.0.1", "240.0.0.1",
  ]) assert.equal(isPrivateIp(ip), true, ip);
});

test("does not overblock ordinary public IPv4 addresses", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "192.0.1.1", "192.88.1.1", "198.20.0.1"]) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});

test("blocks non-global and documentation IPv6 ranges", () => {
  for (const ip of ["::", "::1", "fc00::1", "fd00::1", "fe80::1", "ff02::1", "2001:db8::1", "2001:10::1"]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ["2001:4860:4860::8888", "2606:4700:4700::1111"]) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});

test("blocks IPv4-mapped IPv6 addresses when their embedded IPv4 is private", () => {
  assert.equal(isPrivateIp("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateIp("::ffff:08080808"), false);
});

test("pinned lookup returns only previously validated addresses", async () => {
  const lookup = createPinnedLookup("Example.COM.", [
    { address: "8.8.4.4", family: 4 },
    { address: "2001:4860:4860::8888", family: 6 },
  ]);

  const ipv4 = await new Promise((resolve, reject) => {
    lookup("example.com", { family: 4 }, (error, address, family) => {
      if (error) return reject(error);
      resolve({ address, family });
    });
  });
  assert.deepEqual(ipv4, { address: "8.8.4.4", family: 4 });

  const all = await new Promise((resolve, reject) => {
    lookup("EXAMPLE.com", { all: true }, (error, addresses) => {
      if (error) return reject(error);
      resolve(addresses);
    });
  });
  assert.equal(all.length, 2);
  assert.deepEqual(all.map((entry) => entry.address), ["8.8.4.4", "2001:4860:4860::8888"]);
});

test("pinned lookup refuses an unexpected hostname or unvalidated address family", async () => {
  const lookup = createPinnedLookup("example.com", [{ address: "8.8.8.8", family: 4 }]);
  const mismatch = await new Promise((resolve) => lookup("attacker.example", {}, (error) => resolve(error)));
  assert.equal(mismatch.code, "ENOTFOUND");
  const noFamily = await new Promise((resolve) => lookup("example.com", { family: 6 }, (error) => resolve(error)));
  assert.equal(noFamily.code, "ENOTFOUND");
});
