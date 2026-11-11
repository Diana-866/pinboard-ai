/** Network/server failures after a remote publish POST may hide a successful side effect. */
export function isAmbiguousPinterestPublishStatus(status: unknown): boolean {
  const value = Number(status);
  return value === 0 || value === 409 || value >= 500;
}
