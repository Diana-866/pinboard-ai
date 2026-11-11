export function isTerminalSubscriptionPaymentStatus(status: unknown): boolean {
  return status === 'success' ||
    status === 'canceled' ||
    status === 'denied' ||
    status === 'expired';
}

export function isTerminalCreditPurchaseStatus(status: unknown): boolean {
  return status === 'success' ||
    status === 'canceled' ||
    status === 'denied';
}
