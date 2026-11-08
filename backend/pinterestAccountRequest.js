/**
 * Execute one Pinterest API request with account-scoped token recovery.
 * Kept separate from HTTP/database wiring so token retry semantics are testable.
 */
const DEFAULT_RATE_LIMIT_WAIT_MS = 2000;
const MAX_RATE_LIMIT_WAIT_MS = 60000;

function getPinterestRetryDelayMs(value, now = Date.now()) {
  if (value === null || value === undefined || value === "") return DEFAULT_RATE_LIMIT_WAIT_MS;
  const raw = String(value).trim();
  let delay;
  if (/^\\d+(?:\\.\\d+)?$/.test(raw)) {
    delay = Number(raw) * 1000;
  } else {
    const retryAt = Date.parse(raw);
    delay = Number.isFinite(retryAt) ? retryAt - now : DEFAULT_RATE_LIMIT_WAIT_MS;
  }
  if (!Number.isFinite(delay)) return DEFAULT_RATE_LIMIT_WAIT_MS;
  return Math.max(0, Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.ceil(delay)));
}

async function executeWithAccountToken(
  account,
  handler,
  refreshAccessToken,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  { retryRateLimit = true } = {}
) {
  let currentAccount = account;
  let refreshed = false;
  let rateLimited = false;

  // Each recovery is allowed once. Callers performing non-idempotent writes
  // disable 429 replay so a provider response can never create a duplicate.
  while (true) {
    const result = await handler(currentAccount.access_token);
    if (result.status === 401 && !refreshed) {
      refreshed = true;
      currentAccount = await refreshAccessToken(currentAccount);
      continue;
    }
    if (result.status === 429 && retryRateLimit && !rateLimited) {
      rateLimited = true;
      const delay = Number(result.retryAfterMs);
      await wait(Number.isFinite(delay) && delay >= 0
        ? Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.ceil(delay))
        : DEFAULT_RATE_LIMIT_WAIT_MS);
      continue;
    }
    return result;
  }
}

module.exports = { executeWithAccountToken, getPinterestRetryDelayMs };
