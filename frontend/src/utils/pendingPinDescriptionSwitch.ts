export interface PendingPinDescriptionIdentity {
  boardId: string;
  pinId: string;
}

/** A shared editor debounce must flush when focus moves to another pin context. */
export function shouldFlushPendingPinDescription(
  pending: PendingPinDescriptionIdentity,
  nextBoardId: string,
  nextPinId: string,
): boolean {
  return pending.boardId !== nextBoardId || pending.pinId !== nextPinId;
}
