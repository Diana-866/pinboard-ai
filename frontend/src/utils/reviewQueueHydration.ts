export interface ReviewQueueItem {
  id: string;
}

export function mergeRestoredReviewQueue<T extends ReviewQueueItem>(
  serverRows: T[],
  currentRows: T[],
  locallyTouchedIds: Set<string>,
): T[] {
  const untouchedServerRows = serverRows.filter((row) => !locallyTouchedIds.has(row.id));
  const touchedCurrentRows = currentRows.filter((row) => locallyTouchedIds.has(row.id));
  const merged = new Map<string, T>();
  for (const row of untouchedServerRows) merged.set(row.id, row);
  for (const row of touchedCurrentRows) merged.set(row.id, row);
  return [...merged.values()];
}


export type ReviewQueueRestoreView = 'loading' | 'error' | 'ready';

export function getReviewQueueRestoreView(input: {
  isLoading: boolean;
  hasError: boolean;
  hasCurrentPin: boolean;
}): ReviewQueueRestoreView {
  // Keep an already available card usable during a background refresh.
  if (input.hasCurrentPin) return 'ready';
  if (input.isLoading) return 'loading';
  if (input.hasError) return 'error';
  return 'ready';
}


/** Reject malformed API payloads instead of treating them as a genuinely empty queue. */
export function requireReviewQueueRows<T extends ReviewQueueItem>(value: unknown): T[] {
  if (!Array.isArray(value)) {
    throw new TypeError('Review queue response must be an array');
  }
  for (const [index, row] of value.entries()) {
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      typeof (row as { id?: unknown }).id !== 'string' ||
      !(row as { id: string }).id.trim()
    ) {
      throw new TypeError(`Review queue row at index ${index} is malformed`);
    }
  }
  return value as T[];
}
