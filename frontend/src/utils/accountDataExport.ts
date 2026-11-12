// Helpers for the self-service account data export and deletion request.
// Kept free of React so they can be unit-tested directly.

export interface AccountDeletionReceipt {
  requestId: string;
  state: string;
  alreadyRequested: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DELETION_STATES = new Set(['pending']);

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
 * Validate the complete API success contract. A malformed or contradictory
 * response must never make the UI claim that account deletion was accepted.
 */
export function parseDeletionReceipt(payload: unknown): AccountDeletionReceipt | null {
  if (!payload || typeof payload !== 'object') return null;
  const response = payload as { ok?: unknown; request?: unknown };
  if (response.ok !== true || !response.request || typeof response.request !== 'object') return null;

  const { requestId, state, alreadyRequested } = response.request as Record<string, unknown>;
  if (typeof requestId !== 'string' || !UUID_RE.test(requestId)) return null;
  if (typeof state !== 'string' || !DELETION_STATES.has(state)) return null;
  if (typeof alreadyRequested !== 'boolean') return null;

  return { requestId, state, alreadyRequested };
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
