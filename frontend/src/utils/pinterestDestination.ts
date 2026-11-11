export interface PinterestDestinationAccount {
  id: string;
}

export interface PinterestDestinationBoard {
  id: string;
  name: string;
}

export interface PinterestDestination {
  accountId: string;
  boardId: string;
  boardName: string;
}

/** Resolve a destination only from the currently loaded account and its boards. */
export function resolvePinterestDestination(
  accounts: readonly PinterestDestinationAccount[],
  boards: readonly PinterestDestinationBoard[],
  selectedAccountId: string,
  selectedBoardId: string,
): PinterestDestination | null {
  if (!selectedAccountId || !selectedBoardId) return null;
  const account = accounts.find((item) => item.id === selectedAccountId);
  const board = boards.find((item) => item.id === selectedBoardId && item.name.trim().length > 0);
  if (!account || !board) return null;
  return { accountId: account.id, boardId: board.id, boardName: board.name };
}
