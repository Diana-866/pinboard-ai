export function buildPinterestPinUrl(value: unknown): string | undefined {
  const pinId = String(value ?? "").trim();
  // Pinterest pin IDs are numeric. Reject arbitrary strings so API data cannot
  // inject a path, query, or external host into the outbound link.
  if (!/^\\d{1,32}$/.test(pinId)) return undefined;
  return `https://www.pinterest.com/pin/${pinId}/`;
}
