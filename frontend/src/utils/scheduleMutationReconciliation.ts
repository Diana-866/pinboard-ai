export interface PersistedScheduleMutationExpectation {
  scheduleId: string;
  statuses: readonly string[];
  pinterestBoardId: string;
  pinterestAccountId: string;
}

/**
 * Confirms a schedule mutation only when the authenticated schedule listing
 * contains exactly one row with the complete expected persisted identity/state.
 * A malformed, missing, or ambiguous response is deliberately not success.
 */
export function findPersistedScheduleMutation(
  rows: unknown,
  expected: PersistedScheduleMutationExpectation,
): Record<string, any> | null {
  if (!Array.isArray(rows)) return null;
  const matches = rows.filter((row): row is Record<string, any> =>
    !!row &&
    typeof row === 'object' &&
    !Array.isArray(row) &&
    String(row.id || '') === expected.scheduleId &&
    expected.statuses.includes(String(row.status || '')) &&
    String(row.pinterest_board_id || '') === expected.pinterestBoardId &&
    String(row.pinterest_account_id || '') === expected.pinterestAccountId
  );
  return matches.length === 1 ? matches[0] : null;
}


/**
 * GET /schedule excludes cancelled rows. Treat absence as confirmation only
 * when the complete response is a structurally valid list of identifiable rows.
 */
export function isScheduleAbsentFromActiveList(
  rows: unknown,
  scheduleId: string,
): boolean {
  if (!Array.isArray(rows)) return false;
  for (const row of rows) {
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      typeof row.id !== 'string' ||
      row.id.trim().length === 0 ||
      typeof row.pin_id !== 'string' ||
      row.pin_id.trim().length === 0 ||
      typeof row.status !== 'string' ||
      row.status.trim().length === 0 ||
      typeof row.scheduled_at !== 'string' ||
      !Number.isFinite(Date.parse(row.scheduled_at)) ||
      !Object.prototype.hasOwnProperty.call(row, 'pinterest_board_id') ||
      (row.pinterest_board_id !== null && typeof row.pinterest_board_id !== 'string') ||
      !Object.prototype.hasOwnProperty.call(row, 'pinterest_account_id') ||
      (row.pinterest_account_id !== null && typeof row.pinterest_account_id !== 'string')
    ) {
      return false;
    }
  }
  return !rows.some((row) => row.id === scheduleId);
}


export interface PersistedScheduleRequestExpectation {
  pinId: string;
  scheduledAt: string;
  pinterestBoardId: string;
  pinterestAccountId?: string;
  statuses: readonly string[];
}

/**
 * Reconciles a lost schedule-creation response against one exact active row.
 * A loose pin-ID match is not enough: time, destination and state must agree.
 */
export function findPersistedScheduleRequest(
  rows: unknown,
  expected: PersistedScheduleRequestExpectation,
): Record<string, any> | null {
  if (!Array.isArray(rows)) return null;
  const expectedTime = Date.parse(expected.scheduledAt);
  if (!Number.isFinite(expectedTime)) return null;

  const matches = rows.filter((row): row is Record<string, any> =>
    !!row &&
    typeof row === 'object' &&
    !Array.isArray(row) &&
    typeof row.id === 'string' &&
    row.id.trim().length > 0 &&
    String(row.pin_id || '') === expected.pinId &&
    Number.isFinite(Date.parse(row.scheduled_at)) &&
    Date.parse(row.scheduled_at) === expectedTime &&
    String(row.pinterest_board_id || '') === expected.pinterestBoardId &&
    (!expected.pinterestAccountId ||
      String(row.pinterest_account_id || '') === expected.pinterestAccountId) &&
    expected.statuses.includes(String(row.status || ''))
  );
  return matches.length === 1 ? matches[0] : null;
}
