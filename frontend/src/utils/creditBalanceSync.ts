/**
 * The credit-purchase history endpoint also returns the authoritative account
 * balance. A successful webhook may have credited a purchase before the user
 * returns from checkout, so there may be no pending order left to trigger polling.
 */
export function shouldRefreshCreditBalance(
  serverBalance: unknown,
  profileBalance: unknown,
): boolean {
  if (serverBalance === null || serverBalance === undefined || serverBalance === '') {
    return false;
  }
  const server = Number(serverBalance);
  const profile = Number(profileBalance ?? 0);
  return Number.isFinite(server) && Number.isFinite(profile) && server !== profile;
}
