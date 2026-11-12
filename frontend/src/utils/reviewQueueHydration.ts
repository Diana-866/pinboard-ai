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

export function isReviewQueuePayload(
  value: unknown,
): value is Array<ReviewQueueItem & { title: string; description: string }> {
  return Array.isArray(value) && value.every((row) =>
    row !== null && typeof row === 'object' &&
    typeof (row as { id?: unknown }).id === 'string' &&
    (row as { id: string }).id.trim().length > 0 &&
    typeof (row as { title?: unknown }).title === 'string' &&
    (row as { title: string }).title.trim().length > 0 &&
    typeof (row as { description?: unknown }).description === 'string'
  );
}
