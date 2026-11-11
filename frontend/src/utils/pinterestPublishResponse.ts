/**
 * A publish request is complete only when the API confirms the exact remote
 * Pinterest pin and destination board. A malformed 2xx is ambiguous: the
 * remote side effect may have happened, so the UI must not offer another POST.
 */
export function readConfirmedPinterestPublish(
  value: unknown,
  expectedBoardId: string,
): { pinId: string; boardId: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  const pinId = String(response.pinterest_pin_id ?? '').trim();
  const boardId = String(response.board_id ?? '').trim();
  if (response.ok !== true || !/^\d{1,32}$/.test(pinId) || !expectedBoardId || boardId !== expectedBoardId) {
    return null;
  }
  return { pinId, boardId };
}
