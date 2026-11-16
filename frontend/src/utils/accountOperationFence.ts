/**
 * A delayed account operation may update UI only while both its owner and
 * request generation still match the active account component state.
 */
export function isAccountOperationCurrent(
  currentOwnerId: string | null | undefined,
  requestOwnerId: string | null | undefined,
  currentRequestId: number,
  requestId: number,
): boolean {
  return typeof requestOwnerId === 'string' &&
    requestOwnerId.length > 0 &&
    currentOwnerId === requestOwnerId &&
    Number.isSafeInteger(requestId) &&
    requestId > 0 &&
    currentRequestId === requestId;
}
