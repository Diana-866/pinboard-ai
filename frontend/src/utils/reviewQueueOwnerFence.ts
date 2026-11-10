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
