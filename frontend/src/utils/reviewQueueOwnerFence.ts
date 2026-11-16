export interface ReviewQueueOwnerSnapshot {
  userId: string;
  generation: number;
}

/**
 * User IDs alone are not enough to fence async work: an A -> B -> A account
 * switch makes an old operation for A look current again. The generation is
 * incremented on every identity transition, including transitions to/from
 * the signed-out state.
 */
export function isReviewQueueOwnerCurrent(
  expected: ReviewQueueOwnerSnapshot,
  current: ReviewQueueOwnerSnapshot,
): boolean {
  return expected.userId.length > 0
    && expected.userId === current.userId
    && expected.generation === current.generation;
}

export interface ReviewQueueItemSnapshot {
  id: string;
  pinId: string;
}

/** A queued operation may update only the exact card and persisted pin it started for. */
export function isReviewQueueItemCurrent(
  expected: ReviewQueueItemSnapshot,
  current: ReviewQueueItemSnapshot | null,
): boolean {
  return Boolean(current && expected.id && expected.id === current.id && expected.pinId === current.pinId);
}

/** A batch may continue only while the exact persisted card remains queued. */
export function isReviewQueueItemPresent(
  expected: ReviewQueueItemSnapshot,
  queue: readonly { id: string; pinId?: string }[],
): boolean {
  return Boolean(expected.id && queue.some((item) => item.id === expected.id && (item.pinId || '') === expected.pinId));
}
