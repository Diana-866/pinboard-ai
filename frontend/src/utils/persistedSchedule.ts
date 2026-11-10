/**
 * Validate the complete schedule list before replacing the last known-good
 * calendar state. A malformed row must not make persisted publications vanish.
 */
export function validatePersistedScheduleRows(value: unknown): Record<string, any>[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid schedule response: expected an array');
  }

  return value.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Invalid schedule response: row ${index + 1} is not an object`);
    }

    const item = row as Record<string, unknown>;
    if (typeof item.id !== 'string' || !item.id.trim()) {
      throw new Error(`Invalid schedule response: row ${index + 1} has no schedule ID`);
    }
    if (typeof item.pin_id !== 'string' || !item.pin_id.trim()) {
      throw new Error(`Invalid schedule response: row ${index + 1} has no pin ID`);
    }
    if (typeof item.status !== 'string' || !item.status.trim()) {
      throw new Error(`Invalid schedule response: row ${index + 1} has no status`);
    }
    if (typeof item.scheduled_at !== 'string' || !item.scheduled_at.trim() ||
        !Number.isFinite(Date.parse(item.scheduled_at))) {
      throw new Error(`Invalid schedule response: row ${index + 1} has an invalid scheduled time`);
    }

    return item as Record<string, any>;
  });
}
