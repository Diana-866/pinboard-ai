// Helpers for the self-service account data export and deletion request.
// Kept free of React so they can be unit-tested directly.

/** Only a complete, explicitly healthy server response may be downloaded. */
export function isCompleteAccountExport(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as { formatVersion?: unknown; degradedSections?: unknown };
  return candidate.formatVersion === 1 &&
    Array.isArray(candidate.degradedSections) &&
    candidate.degradedSections.length === 0;
}

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
  const response = payload as { ok?: unknown; request?: unknown };
  if (response.ok !== true || !response.request || typeof response.request !== 'object') return null;
  const { requestId, state, alreadyRequested } = response.request as Record<string, unknown>;
  if (typeof requestId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return null;
  if (state !== 'pending' && state !== 'completed') return null;
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
