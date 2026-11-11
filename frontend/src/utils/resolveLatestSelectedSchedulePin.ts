/**
 * Prefer the newest server-hydrated row for an open calendar detail modal.
 * If the row is temporarily absent during a partial refresh, retain the
 * selected snapshot rather than closing the user's detail view.
 */
export function resolveLatestSelectedSchedulePin<T extends { id: string }>(
  selected: T | null,
  rows: T[],
): T | null {
  if (!selected) return null;
  return rows.find((row) => row.id === selected.id) || selected;
}
