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
  /** Account the loaded board list belongs to. A board list loaded for a
   *  previously selected account must never authorize a new destination. */
  boardsAccountId?: string | null,
): PinterestDestination | null {
  if (
    !Array.isArray(accounts) ||
    !Array.isArray(boards) ||
    typeof selectedAccountId !== 'string' ||
    !selectedAccountId ||
    selectedAccountId !== selectedAccountId.trim() ||
    typeof selectedBoardId !== 'string' ||
    !selectedBoardId ||
    selectedBoardId !== selectedBoardId.trim()
  ) return null;
  if (boardsAccountId != null && boardsAccountId !== selectedAccountId) return null;

  // Fail closed if a caller supplies ambiguous resource IDs. Selecting the
  // first match would make the scheduled destination depend on response order.
  const accountIds = new Set<string>();
  for (const item of accounts) {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id !== item.id.trim() || accountIds.has(item.id)) {
      return null;
    }
    accountIds.add(item.id);
  }

  const boardIds = new Set<string>();
  for (const item of boards) {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id !== item.id.trim() || boardIds.has(item.id)) {
      return null;
    }
    boardIds.add(item.id);
  }

  const account = accounts.find((item) => item.id === selectedAccountId);
  const board = boards.find((item) => item.id === selectedBoardId && typeof item.name === 'string' && item.name.trim().length > 0);
  if (!account || !board) return null;
  return { accountId: account.id, boardId: board.id, boardName: board.name.trim() };
}
