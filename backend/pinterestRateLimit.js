const rateLimit = require("express-rate-limit");

// Authenticated Pinterest routes are keyed by account identity rather than IP:
// many customers can legitimately share an office/mobile carrier IP.
function pinterestUserKey(req) {
  return `user:${String(req.userId || "missing")}`;
}

const defaults = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много запросов к Pinterest. Попробуйте позже." },
};

function userLimiter(windowMs, limit) {
  return rateLimit({
    ...defaults,
    windowMs,
    limit,
    keyGenerator: pinterestUserKey,
  });
}

// These are intentionally separate buckets so board browsing cannot consume
// the publication/OAuth budget. The default MemoryStore is process-local;
// use a shared store if the backend is later scaled across multiple instances.
//
// Section 128: the numbers live in one table and the limiters are built from it. They used to be
// written twice - once as `userLimiter(60 * 1000, 10)` and once in the exported `limits` map that the
// tests assert - so changing one copy left the other silently disagreeing with it, and the tests would
// have kept passing while production allowed twice the traffic.
const LIMITS = Object.freeze({
  read: { windowMs: 60 * 1000, limit: 10 },
  publish: { windowMs: 60 * 1000, limit: 5 },
  schedule: { windowMs: 60 * 1000, limit: 10 },
  account: { windowMs: 60 * 1000, limit: 5 },
  oauthStart: { windowMs: 15 * 60 * 1000, limit: 5 },
  oauthCallback: { windowMs: 15 * 60 * 1000, limit: 10 },
  worker: { windowMs: 60 * 1000, limit: 6 },
});

function fromTable(key) {
  const entry = LIMITS[key];
  if (!entry) throw new Error(`Unknown Pinterest rate-limit bucket: ${key}`);
  return userLimiter(entry.windowMs, entry.limit);
}

const pinterestReadLimiter = fromTable("read");
const pinterestPublishLimiter = fromTable("publish");
const pinterestScheduleLimiter = fromTable("schedule");
const pinterestAccountLimiter = fromTable("account");
const pinterestOAuthStartLimiter = fromTable("oauthStart");

// OAuth callback and the secret-protected worker have no authenticated user;
// express-rate-limit's default IP key (including IPv6 handling) is retained.
const pinterestOAuthCallbackLimiter = rateLimit({
  ...defaults,
  windowMs: LIMITS.oauthCallback.windowMs,
  limit: LIMITS.oauthCallback.limit,
});
const pinterestWorkerLimiter = rateLimit({
  ...defaults,
  windowMs: LIMITS.worker.windowMs,
  limit: LIMITS.worker.limit,
});

module.exports = {
  pinterestUserKey,
  limits: LIMITS,
  pinterestReadLimiter,
  pinterestPublishLimiter,
  pinterestScheduleLimiter,
  pinterestAccountLimiter,
  pinterestOAuthStartLimiter,
  pinterestOAuthCallbackLimiter,
  pinterestWorkerLimiter,
};
