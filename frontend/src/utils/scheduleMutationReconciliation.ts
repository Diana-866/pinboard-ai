function isValidPersistedScheduleRow(row: unknown): row is Record<string, any> {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const candidate = row as Record<string, any>;
  return typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.pin_id === 'string' &&
    candidate.pin_id.trim().length > 0 &&
    typeof candidate.status === 'string' &&
    candidate.status.trim().length > 0 &&
    typeof candidate.scheduled_at === 'string' &&
    Number.isFinite(Date.parse(candidate.scheduled_at)) &&
    Object.prototype.hasOwnProperty.call(candidate, 'pinterest_board_id') &&
    (candidate.pinterest_board_id === null || typeof candidate.pinterest_board_id === 'string') &&
    Object.prototype.hasOwnProperty.call(candidate, 'pinterest_account_id') &&
    (candidate.pinterest_account_id === null || typeof candidate.pinterest_account_id === 'string');
}

function isValidPersistedScheduleList(rows: unknown): rows is Record<string, any>[] {
  return Array.isArray(rows) && rows.every(isValidPersistedScheduleRow);
}

export interface PersistedScheduleMutationExpectation {
  scheduleId: string;
  statuses: readonly string[];
  pinterestBoardId: string;
  pinterestAccountId: string;
}

/**
 * Validates a single mutation response before the UI treats it as persisted.
 * Requiring the full schedule shape prevents malformed 2xx responses from
 * corrupting the calendar's local state.
 */
export function isPersistedScheduleMutationResponse(
  row: unknown,
  expected: PersistedScheduleMutationExpectation,
): row is Record<string, any> {
  return isValidPersistedScheduleRow(row) &&
    row.id === expected.scheduleId &&
    expected.statuses.includes(row.status) &&
    String(row.pinterest_board_id || '') === expected.pinterestBoardId &&
    String(row.pinterest_account_id || '') === expected.pinterestAccountId;
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
  if (!isValidPersistedScheduleList(rows)) return null;
  const matches = rows.filter((row): row is Record<string, any> =>
    isPersistedScheduleMutationResponse(row, expected)
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
  if (!isValidPersistedScheduleList(rows)) return false;
  return !rows.some((row) => row.id === scheduleId);
}



/** A cancellation 2xx is accepted only when it identifies the exact row as cancelled. */
export function isPersistedScheduleCancellationResponse(
  row: unknown,
  scheduleId: string,
): row is Record<string, any> {
  return isValidPersistedScheduleRow(row) &&
    row.id === scheduleId &&
    row.status === 'cancelled';
}

export interface PersistedScheduleRequestExpectation {
  pinId: string;
  scheduledAt: string;
  pinterestBoardId: string;
  pinterestAccountId?: string;
  timezone?: string;
  destinationUrl?: string | null;
  statuses: readonly string[];
}

/**
 * Reconciles a lost schedule-creation response against one exact active row.
 * A loose pin-ID match is not enough: time, destination (when known), timezone
 * and state must agree.
 */
export function findPersistedScheduleRequest(
  rows: unknown,
  expected: PersistedScheduleRequestExpectation,
): Record<string, any> | null {
  if (!isValidPersistedScheduleList(rows)) return null;
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
    (expected.timezone === undefined || String(row.timezone || '') === expected.timezone) &&
    (!Object.prototype.hasOwnProperty.call(expected, 'destinationUrl') ||
      String(row.destination_url || '') === String(expected.destinationUrl || '')) &&
    expected.statuses.includes(String(row.status || ''))
  );
  return matches.length === 1 ? matches[0] : null;
}
