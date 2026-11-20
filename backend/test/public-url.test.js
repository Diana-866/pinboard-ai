const test = require("node:test");
const assert = require("node:assert/strict");
const { isPrivateIp, createPinnedLookup, assertPublicUrl, resolvePublicAddresses, assertPublicWebsiteAddress } = require("../publicUrl");

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
  for (const ip of ["::", "::1", "fc00::1", "fd00::1", "fe80::1", "ff02::1", "2001:db8::1", "2001:10::1", "2002::1", "3fff::1"]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ["2001:4860:4860::8888", "2606:4700:4700::1111", "2001:200::1", "3fff:1000::1"]) {
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

test("rejects URLs that embed credentials before attempting DNS resolution", async () => {
  await assert.rejects(
    assertPublicUrl("https://user:password@example.com/path"),
    (error) => error.httpStatus === 422
  );
});

// ─── Дополнение (§59): пути, которые не выполнялись ни разу ───────────────────
// Оригинальные тесты выше проверяли классификацию адресов и привязанный lookup, но
// resolvePublicAddresses (единственная функция, которая вообще обращается к DNS) и успешный
// путь assertPublicUrl не выполнялись ни разу, а литералы адресов в URL не проверялись вовсе.

test("an address literal in the URL is resolved to itself and then refused", async () => {
  // Real getaddrinfo parses literals without asking DNS, so the stub does the same. That is what
  // makes "[::1]" and the decimal form of 127.0.0.1 dangerous: the hostname check alone never sees
  // an internal address.
  const net = require("node:net");
  const dns = require("node:dns");
  const original = dns.promises.lookup;
  const seen = [];
  dns.promises.lookup = async (host) => {
    seen.push(host);
    const family = net.isIP(host);
    if (family) return [{ address: host, family }];
    if (/^[0-9]+$/.test(host)) return [{ address: "127.0.0.1", family: 4 }];
    return [{ address: "93.184.216.34", family: 4 }];
  };
  try {
    await resolvePublicAddresses("example.test.");
    for (const literal of ["LOCALHOST.", "[::1]", "192.168.1.1", "10.0.0.1", "169.254.169.254", "2130706433"]) {
      await assert.rejects(() => resolvePublicAddresses(literal), (error) => error.httpStatus === 422,
        `${literal} must be refused`);
    }
    for (const raw of ["http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/", "http://0.0.0.0/"]) {
      await assert.rejects(() => assertPublicUrl(raw), (error) => error.httpStatus === 422, `${raw} must be refused`);
    }
  } finally {
    dns.promises.lookup = original;
  }
  assert.equal(seen[0], "example.test", "the trailing dot must be removed before lookup");
  assert.ok(seen.includes("2130706433"), "the decimal form is a hostname until it resolves to loopback");
});

test("internal host names are refused before DNS is consulted", async () => {
  const dns = require("node:dns");
  const original = dns.promises.lookup;
  let lookups = 0;
  dns.promises.lookup = async () => { lookups += 1; return [{ address: "8.8.8.8", family: 4 }]; };
  try {
    for (const host of ["localhost", "api.localhost", "printer.local", "metadata.internal", "", null]) {
      await assert.rejects(() => resolvePublicAddresses(host), (error) => error.httpStatus === 422,
        `${JSON.stringify(host)} must be refused`);
    }
    assert.equal(lookups, 0, "internal names must never reach DNS");
  } finally {
    dns.promises.lookup = original;
  }
});

test("one internal address in a mixed answer refuses the whole host, and DNS failure is a 502", async () => {
  const dns = require("node:dns");
  const original = dns.promises.lookup;
  try {
    dns.promises.lookup = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ];
    await assert.rejects(() => resolvePublicAddresses("example.test"), (error) => error.httpStatus === 422,
      "a mixed answer must not be sampled with the first address");

    dns.promises.lookup = async () => [];
    await assert.rejects(() => resolvePublicAddresses("example.test"), (error) => error.httpStatus === 422);

    dns.promises.lookup = async () => { throw new Error("ENOTFOUND"); };
    await assert.rejects(() => resolvePublicAddresses("example.test"),
      (error) => error.httpStatus === 502 && /Не удалось найти сайт/.test(error.message));
  } finally {
    dns.promises.lookup = original;
  }
});

test("exotic IPv6 forms of internal addresses are refused and public global unicast is not", () => {
  for (const ip of ["::ffff:7f00:1", "64:ff9b::7f00:1", "::ffff:10.0.0.1", "not-an-ip", "", "1.2.3", "example.com"]) {
    assert.equal(isPrivateIp(ip), true, `${JSON.stringify(ip)} must be treated as unreachable`);
  }
  for (const ip of ["2a00:1450:4001:80f::200e", "::ffff:8.8.8.8"]) {
    assert.equal(isPrivateIp(ip), false, `${ip} is public and must be allowed`);
  }
});

test("the edges of every blocked IPv4 range are classified on the correct side", () => {
  for (const ip of ["172.16.0.0", "172.31.255.255", "100.64.0.0", "100.127.255.255", "0.0.0.0", "255.255.255.255"]) {
    assert.equal(isPrivateIp(ip), true, `${ip} must be blocked`);
  }
  for (const ip of ["172.15.255.255", "172.32.0.0", "100.63.255.255", "100.128.0.0", "93.184.216.34"]) {
    assert.equal(isPrivateIp(ip), false, `${ip} must be allowed`);
  }
});

test("only plain http(s) URLs are analysed, and an accepted URL is returned normalised", async () => {
  const dns = require("node:dns");
  const original = dns.promises.lookup;
  dns.promises.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  try {
    for (const raw of [
      "ftp://example.test/file",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "https://example.test/a b",
      "not a url",
      "",
    ]) {
      await assert.rejects(() => assertPublicUrl(raw), (error) => error.httpStatus === 422,
        `${JSON.stringify(raw)} must be refused`);
    }

    const accepted = await assertPublicUrl("https://Example.TEST/path?q=1");
    assert.equal(accepted.host, "example.test");
    assert.equal(accepted.url, "https://example.test/path?q=1", "the analysed URL is the normalised one");
    assert.equal(accepted.addresses.length, 1);
  } finally {
    dns.promises.lookup = original;
  }
});

test("a website address that can never be analysed is refused at write time", () => {
  for (const url of [
    "http://127.0.0.1:8080/",
    "http://localhost/",
    "http://app.localhost/",
    "http://printer.local/",
    "http://intranet.internal/",
    "http://192.168.1.5/",
    "http://10.0.0.1/",
    "http://172.16.4.4/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://0.0.0.0/",
  ]) {
    assert.throws(
      () => assertPublicWebsiteAddress(url),
      (error) => error.httpStatus === 422 && /публичный адрес/.test(error.message),
      `address ${url} must be refused`
    );
  }
});

test("an ordinary public address passes the write-time check unchanged", () => {
  assert.equal(assertPublicWebsiteAddress("https://example.com/"), "https://example.com/");
  assert.equal(assertPublicWebsiteAddress("https://shop.blumen.de/katalog"), "https://shop.blumen.de/katalog");
  // A domain is accepted as written: only assertPublicUrl resolves it, right before the request.
  assert.equal(assertPublicWebsiteAddress("https://does-not-exist.invalid/"), "https://does-not-exist.invalid/");
});
