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


/** Accept a review decision only when the API confirms this exact pin and state. */
export function requirePinStatusResponse(
  value: unknown,
  pinId: string,
  expectedStatus: 'approved' | 'rejected',
): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Сервер не подтвердил решение по пину.');
  }
  const row = value as Record<string, unknown>;
  if (row.id !== pinId || row.status !== expectedStatus) {
    throw new Error('Сервер не подтвердил решение по пину.');
  }
}
