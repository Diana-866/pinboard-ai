const dns = require("node:dns").promises;
const net = require("node:net");

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    return (
      p[0] === 0 ||
      p[0] === 10 ||
      p[0] === 127 ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && (
        (p[1] === 0 && (p[2] === 0 || p[2] === 2)) ||
        (p[1] === 88 && p[2] === 99) ||
        p[1] === 168
      )) ||
      (p[0] === 198 && (p[1] === 18 || p[1] === 19 || (p[1] === 51 && p[2] === 100))) ||
      (p[0] === 203 && p[1] === 0 && p[2] === 113) ||
      p[0] >= 224
    );
  }

  const value = String(ip).toLowerCase();
  if (value.startsWith("::ffff:")) {
    const mapped = value.slice(7);
    if (net.isIPv4(mapped)) return isPrivateIp(mapped);
    if (/^[0-9a-f]{8}$/.test(mapped)) {
      const n = Number.parseInt(mapped, 16);
      return isPrivateIp([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."));
    }
  }
  if (!net.isIPv6(value)) return true;

  const first = Number.parseInt(value.split(":")[0] || "0", 16);
  // Permit only global-unicast 2000::/3, then exclude documentation and special-use space.
  if ((first & 0xe000) !== 0x2000) return true;
  const segments = value.split(":");
  const second = Number.parseInt(segments[1] || "0", 16);
  if (first === 0x2001 && second <= 0x01ff) return true; // IETF special-purpose 2001::/23
  if (first === 0x2002 || (first === 0x3fff && second <= 0x0fff)) return true; // 6to4 and documentation
  if (value.startsWith("2001:db8:") || value === "2001:db8") return true;
  if (value.startsWith("2001:10:")) return true;
  return false;
}

function httpError(status, message) {
  const error = new Error(message);
  error.httpStatus = status;
  return error;
}

function normalizeHost(hostname) {
  return String(hostname || "").replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

async function resolvePublicAddresses(hostname) {
  const host = normalizeHost(hostname);
  if (!host || host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host.endsWith(".internal")) {
    throw httpError(422, "Этот адрес недоступен для анализа");
  }

  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw httpError(502, "Не удалось найти сайт — проверьте адрес");
  }

  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw httpError(422, "Этот адрес недоступен для анализа");
  }
  return addresses;
}

function createPinnedLookup(expectedHostname, addresses) {
  const expected = normalizeHost(expectedHostname);
  const pinned = addresses.map(({ address, family }) => ({ address, family }));
  return (hostname, options, callback) => {
    if (normalizeHost(hostname) !== expected) {
      const error = new Error("DNS lookup host did not match validated host");
      error.code = "ENOTFOUND";
      callback(error);
      return;
    }
    const family = typeof options === "number" ? options : Number(options && options.family) || 0;
    const candidates = family ? pinned.filter((entry) => entry.family === family) : pinned;
    if (!candidates.length) {
      const error = new Error("No validated address for requested IP family");
      error.code = "ENOTFOUND";
      callback(error);
      return;
    }
    if (options && typeof options === "object" && options.all) {
      callback(null, candidates);
      return;
    }
    callback(null, candidates[0].address, candidates[0].family);
  };
}

/**
 * Refuse a website address that can never be analysed, without a DNS lookup.
 *
 * `resolvePublicAddresses` answers the same question but needs the network, and it is used where the site is
 * actually fetched. The write paths (project creation and the onboarding wizard) should not accept an
 * address the analyser will always reject: a customer who saves http://192.168.1.5 or http://localhost gets a
 * project that fails every analysis with "this address is unavailable" and no way to understand why.
 *
 * Only literal hosts are checked here; an ordinary domain is accepted as written and still validated by
 * assertPublicUrl before any request is made.
 */
function assertPublicWebsiteAddress(rawUrl, name = "Адрес сайта") {
  const url = new URL(rawUrl);
  const host = normalizeHost(url.hostname);
  if (!host) throw httpError(422, `${name}: укажите адрес`);
  const literalPrivate = net.isIP(host) ? isPrivateIp(host) : false;
  if (literalPrivate || host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host.endsWith(".internal")) {
    throw httpError(422, `${name}: укажите публичный адрес сайта, а не локальный или служебный`);
  }
  return url.toString();
}

async function assertPublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw httpError(422, "Некорректный URL сайта");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw httpError(422, "Сайт должен начинаться с http:// или https://");
  }
  if (url.username || url.password) throw httpError(422, "URL сайта не должен содержать логин или пароль");
  if (/\s/.test(rawUrl)) throw httpError(422, "Некорректный URL сайта");

  const host = normalizeHost(url.hostname);
  const addresses = await resolvePublicAddresses(host);
  return { url: url.toString(), host, addresses };
}

module.exports = { isPrivateIp, resolvePublicAddresses, createPinnedLookup, assertPublicUrl, assertPublicWebsiteAddress };
