/**
 * Execute one Pinterest API request with account-scoped token recovery.
 * Kept separate from HTTP/database wiring so token retry semantics are testable.
 */
async function executeWithAccountToken(account, handler, refreshAccessToken, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  let currentAccount = account;
  let refreshed = false;
  let rateLimited = false;

  // Each recovery is allowed once. This also handles a 401 after the single
  // 429 retry without risking an unbounded request loop.
  while (true) {
    const result = await handler(currentAccount.access_token);
    if (result.status === 401 && !refreshed) {
      refreshed = true;
      currentAccount = await refreshAccessToken(currentAccount);
      continue;
    }
    if (result.status === 429 && !rateLimited) {
      rateLimited = true;
      await wait(2000);
      continue;
    }
    return result;
  }
}

module.exports = { executeWithAccountToken };
