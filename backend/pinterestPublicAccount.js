function isPinterestReauthRequired(account, now = Date.now()) {
  if (!account) return false;
  if (account.refresh_state === "uncertain") return true;
  if (!account.expires_at) return false;
  const expiresAt = new Date(account.expires_at).getTime();
  // A malformed persisted expiry must never be presented as a healthy token.
  return !Number.isFinite(expiresAt) || expiresAt < now;
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
