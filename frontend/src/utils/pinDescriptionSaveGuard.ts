export function isCurrentPinDescriptionSave(input: {
  revision: number;
  currentRevision: number;
  boardId: string;
  currentBoardId: string;
}): boolean {
  return input.revision === input.currentRevision && input.boardId === input.currentBoardId;
}
