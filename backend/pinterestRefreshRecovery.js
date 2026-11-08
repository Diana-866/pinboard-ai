/**
 * A refresh is reconciled only when the stored row has left the uncertainty
 * fence and at least one credential differs from the pre-refresh snapshot.
 * updated_at alone is insufficient: starting a refresh updates it before the
 * provider request, even when no rotated credentials are ever committed.
 */
function isCommittedTokenRefresh(previous, current) {
  if (!previous || !current || current.refresh_state !== "ready") return false;
  // Pinterest refresh rotation must replace the complete credential pair.
  // An OAuth reconnect may update access_token while preserving an omitted
  // refresh_token; that is valid reconnect state, not proof this refresh
  // request committed its own rotated response.
  return current.access_token !== previous.access_token &&
    current.refresh_token !== previous.refresh_token;
}

/**
 * The uncertainty fence is used both while a refresh request is in flight and
 * after an ambiguous failure. A live lease distinguishes the former from the
 * latter; malformed or expired timestamps are never treated as active.
 */
function hasActiveRefreshLease(lease, now = Date.now()) {
  if (!lease || typeof lease.lease_until !== "string") return false;
  const leaseUntil = Date.parse(lease.lease_until);
  return Number.isFinite(leaseUntil) && leaseUntil > now;
}

/**
 * A 429 is an explicit rate-limit rejection, not an ambiguous transport
 * outcome. The caller may safely clear the pre-request uncertainty fence and
 * retry later; 5xx and network failures must remain fenced.
 */
function isExplicitRefreshRateLimit(status) {
  return Number(status) === 429;
}

module.exports = { isCommittedTokenRefresh, hasActiveRefreshLease, isExplicitRefreshRateLimit };
