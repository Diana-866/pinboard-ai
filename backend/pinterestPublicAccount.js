function isPinterestReauthRequired(account, now = Date.now()) {
  if (!account) return false;
  // An uncertain refresh may have consumed a rotating refresh token. Only a
  // fresh OAuth authorization can safely recover that state.
  if (account.refresh_state === "uncertain") return true;
  if (!account.expires_at) return false;

  const expiresAt = new Date(account.expires_at).getTime();
  const accessTokenExpired = !Number.isFinite(expiresAt) || expiresAt < now;
  // Access-token expiry is normally recoverable with the stored refresh token.
  // Ask for OAuth again only when the access token is unusable AND no refresh
  // credential exists to renew it.
  return accessTokenExpired && !account.refresh_token;
}

function toPublicPinterestAccount(account, now = Date.now()) {
  return {
    id: account.id,
    pinterest_user_id: account.pinterest_user_id,
    username: account.username,
    expires_at: account.expires_at,
    needs_reauth: isPinterestReauthRequired(account, now),
  };
}

function toDisconnectedPinterestAccount(account) {
  return {
    id: account.id,
    username: account.username,
  };
}

module.exports = { toPublicPinterestAccount, toDisconnectedPinterestAccount, isPinterestReauthRequired };
