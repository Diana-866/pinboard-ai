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
const pinterestReadLimiter = userLimiter(60 * 1000, 10);
const pinterestPublishLimiter = userLimiter(60 * 1000, 5);
const pinterestScheduleLimiter = userLimiter(60 * 1000, 10);
const pinterestOAuthStartLimiter = userLimiter(15 * 60 * 1000, 5);

// OAuth callback and the secret-protected worker have no authenticated user;
// express-rate-limit's default IP key (including IPv6 handling) is retained.
const pinterestOAuthCallbackLimiter = rateLimit({
  ...defaults,
  windowMs: 15 * 60 * 1000,
  limit: 10,
});
const pinterestWorkerLimiter = rateLimit({
  ...defaults,
  windowMs: 60 * 1000,
  limit: 6,
});

module.exports = {
  pinterestUserKey,
  limits: {
    read: { windowMs: 60 * 1000, limit: 10 },
    publish: { windowMs: 60 * 1000, limit: 5 },
    schedule: { windowMs: 60 * 1000, limit: 10 },
    oauthStart: { windowMs: 15 * 60 * 1000, limit: 5 },
    oauthCallback: { windowMs: 15 * 60 * 1000, limit: 10 },
    worker: { windowMs: 60 * 1000, limit: 6 },
  },
  pinterestReadLimiter,
  pinterestPublishLimiter,
  pinterestScheduleLimiter,
  pinterestOAuthStartLimiter,
  pinterestOAuthCallbackLimiter,
  pinterestWorkerLimiter,
};
