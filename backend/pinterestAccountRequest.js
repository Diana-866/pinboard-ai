/**
 * Execute one Pinterest API request with account-scoped token recovery.
 * Kept separate from HTTP/database wiring so token retry semantics are testable.
 */
async function executeWithAccountToken(account, handler, refreshAccessToken, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  let currentAccount = account;
  let result = await handler(currentAccount.access_token);

  if (result.status === 401) {
    currentAccount = await refreshAccessToken(currentAccount);
    result = await handler(currentAccount.access_token);
  }
  if (result.status === 429) {
    await wait(2000);
    result = await handler(currentAccount.access_token);
  }
  return result;
}

module.exports = { executeWithAccountToken };
