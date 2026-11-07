/**
 * A refresh is reconciled only when the stored row has left the uncertainty
 * fence and at least one credential differs from the pre-refresh snapshot.
 * updated_at alone is insufficient: starting a refresh updates it before the
 * provider request, even when no rotated credentials are ever committed.
 */
function isCommittedTokenRefresh(previous, current) {
  if (!previous || !current || current.refresh_state !== "ready") return false;
  return current.access_token !== previous.access_token ||
    current.refresh_token !== previous.refresh_token;
}

module.exports = { isCommittedTokenRefresh };
