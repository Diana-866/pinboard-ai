export function isMatchingCreditPurchaseOrder(
  expectedOrderId: string | null | undefined,
  settledOrderId: string | null | undefined,
): boolean {
  return Boolean(expectedOrderId && settledOrderId && expectedOrderId === settledOrderId);
}
