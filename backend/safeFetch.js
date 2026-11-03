const dns = require("node:dns").promises;
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const axios = require("axios");

function isBlockedIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) {
    const [a,b,c] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113);
  }
  if (family === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isBlockedIp(v.slice(7));
    // Permit only global unicast 2000::/3; deny ULA, link-local, loopback,
    // unspecified, multicast, and documentation range.
    if (!/^2[0-9a-f]{3}:/.test(v)) return true;
    if (v.startsWith("2001:") || v.startsWith("2002:") || v.startsWith("3fff:")) return true;
    return false;
  }
  return true;
}

async function resolvePublic(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Blocked hostname");
  }

  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error("Blocked IP address");
    return [{ address: host, family: net.isIP(host) }];
  }

  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some((r) => isBlockedIp(r.address))) {
    throw new Error("Hostname resolves to a non-public IP");
  }
  return records;
}

async function safeFetch(rawUrl, options = {}) {
  const maxRedirects = options.maxRedirects ?? 3;
  let current = new URL(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!["http:", "https:"].includes(current.protocol) ||
        current.username || current.password) {
      throw new Error("Only public HTTP(S) URLs without credentials are allowed");
    }

    const records = await resolvePublic(current.hostname);
    const selected = records[0];
    const lookup = (_hostname, _opts, callback) =>
      callback(null, selected.address, selected.family);
    const httpAgent = new http.Agent({ keepAlive: false, lookup });
    const httpsAgent = new https.Agent({ keepAlive: false, lookup });

    let response;
    try {
      response = await axios.get(current.toString(), {
        responseType: options.responseType || "arraybuffer",
        timeout: options.timeout ?? 12000,
        maxContentLength: options.maxBytes ?? 2 * 1024 * 1024,
        maxBodyLength: options.maxBytes ?? 2 * 1024 * 1024,
        maxRedirects: 0,
        validateStatus: () => true,
        headers: options.headers || {},
        httpAgent,
        httpsAgent,
        proxy: false,
      });
    } finally {
      httpAgent.destroy();
      httpsAgent.destroy();
    }

    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.location;
      if (!location || hop === maxRedirects) throw new Error("Too many or invalid redirects");
      current = new URL(location, current);
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      const error = new Error("Remote server returned HTTP " + response.status);
      error.status = response.status;
      throw error;
    }
    return response;
  }
  throw new Error("Too many redirects");
}

module.exports = { safeFetch, isBlockedIp, resolvePublic };
