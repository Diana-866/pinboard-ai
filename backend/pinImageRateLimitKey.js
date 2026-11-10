const { ipKeyGenerator } = require("express-rate-limit");

function buildPinImageRateLimitKey(req) {
  if (req && req.userId) return `user:${String(req.userId)}`;
  const ip = req && req.ip;
  if (typeof ip !== "string" || !ip.trim()) {
    // Express normally supplies req.ip. Use a single conservative fallback
    // bucket rather than disabling the limiter when proxy metadata is absent.
    return "ip:unknown";
  }
  return `ip:${ipKeyGenerator(ip)}`;
}

module.exports = { buildPinImageRateLimitKey };
