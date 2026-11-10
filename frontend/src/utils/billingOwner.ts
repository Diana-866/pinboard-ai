export function isCurrentBillingOwner(
  requestOwnerId: string | undefined,
  currentOwnerId: string | undefined
): boolean {
  return Boolean(requestOwnerId) && requestOwnerId === currentOwnerId;
}
