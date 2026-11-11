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
