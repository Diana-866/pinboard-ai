export type CurrentReviewEdits = {
  title: string;
  description: string;
  boardId: string;
  scheduledDate: string;
  scheduledTime: string;
};

type ReviewEditableFields = {
  title: string;
  description?: string;
  boardId: string;
  scheduledDate: string;
  scheduledTime: string;
};

export function applyCurrentReviewEdits<T extends ReviewEditableFields>(
  pin: T,
  index: number,
  edits: CurrentReviewEdits,
): T {
  if (index !== 0) return pin;
  return {
    ...pin,
    ...edits,
    boardId: edits.boardId || pin.boardId,
    scheduledDate: edits.scheduledDate || pin.scheduledDate,
    scheduledTime: edits.scheduledTime || pin.scheduledTime,
  } as T;
}
