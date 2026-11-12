import type { PendingReviewPin } from '../components/review/ManualApprovalDesk';

/** Merge refreshed pin content without changing the persistent review-row identity. */
export function mergeReviewQueuePin(
  existing: PendingReviewPin | undefined,
  incoming: PendingReviewPin,
): PendingReviewPin {
  return existing ? { ...existing, ...incoming, id: existing.id } : incoming;
}

/** Replace an existing queue entry by pin identity, or append a new one. */
export function upsertReviewQueuePin(
  queue: PendingReviewPin[],
  incoming: PendingReviewPin,
): PendingReviewPin[] {
  const index = queue.findIndex((item) => item.pinId && item.pinId === incoming.pinId);
  if (index < 0) return [...queue, incoming];
  return queue.map((item, itemIndex) => itemIndex === index ? incoming : item);
}
