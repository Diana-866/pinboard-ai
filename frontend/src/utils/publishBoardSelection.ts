export interface PublishBoardOption {
  id: string;
}

/**
 * A board passed by a caller is an explicit destination: never silently publish
 * to a different board if it does not belong to the selected Pinterest account.
 */
export function resolvePublishBoardId(
  boards: readonly PublishBoardOption[],
  requestedBoardId?: string,
): string {
  if (requestedBoardId) {
    return boards.some((board) => board.id === requestedBoardId) ? requestedBoardId : '';
  }
  return boards[0]?.id || '';
}
