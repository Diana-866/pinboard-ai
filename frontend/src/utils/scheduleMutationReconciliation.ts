export interface PersistedScheduleMutationExpectation {
  scheduleId: string;
  status: string;
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
    row.status === expected.status &&
    String(row.pinterest_board_id || '') === expected.pinterestBoardId &&
    String(row.pinterest_account_id || '') === expected.pinterestAccountId
  );
  return matches.length === 1 ? matches[0] : null;
}
