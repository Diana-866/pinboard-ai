// Helpers for the self-service account data export and deletion request.
// Kept free of React so they can be unit-tested directly.

export interface AccountDeletionReceipt {
  requestId: string;
  state: string;
  alreadyRequested: boolean;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** A stable, collision-resistant download name: pinposy-export-<date>-<time>-<id>.json */
export function buildAccountExportFilename(userId: string, now: Date): string {
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const shortId = String(userId || '').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'account';
  return `pinposy-export-${date}-${time}-${shortId}.json`;
}

/**
 * Validate a deletion receipt. The UI must not report success on a malformed
 * or partial response — a false success would tell the user their account is
 * being removed when no request was actually accepted.
 */
export function parseDeletionReceipt(payload: unknown): AccountDeletionReceipt | null {
  if (!payload || typeof payload !== 'object') return null;
  const request = (payload as { request?: unknown }).request;
  if (!request || typeof request !== 'object') return null;
  const { requestId, state, alreadyRequested } = request as Record<string, unknown>;
  if (typeof requestId !== 'string' || !requestId) return null;
  if (typeof state !== 'string' || !state) return null;
  return { requestId, state, alreadyRequested: Boolean(alreadyRequested) };
}

/** Trigger a browser download of an in-memory JSON document. */
export function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
