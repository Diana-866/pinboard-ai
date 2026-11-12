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
