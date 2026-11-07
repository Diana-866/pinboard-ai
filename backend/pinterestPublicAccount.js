function toPublicPinterestAccount(account, now = Date.now()) {
  return {
    id: account.id,
    pinterest_user_id: account.pinterest_user_id,
    username: account.username,
    expires_at: account.expires_at,
    needs_reauth: account.refresh_state === "uncertain" ||
      !!(account.expires_at && new Date(account.expires_at).getTime() < now),
  };
}

function toDisconnectedPinterestAccount(account) {
  return {
    id: account.id,
    username: account.username,
  };
}

module.exports = { toPublicPinterestAccount, toDisconnectedPinterestAccount };
