/**
 * Queue writes per pin so rapid edits cannot reach the API out of order.
 * A failed write does not poison later saves, and an older completion cannot
 * remove a newer promise from the queue.
 */
export function enqueuePinSave<T>(
  pending: Map<string, Promise<unknown>>,
  pinId: string,
  save: () => Promise<T>,
): Promise<T> {
  const previous = pending.get(pinId) || Promise.resolve();
  const request = previous.catch(() => undefined).then(save);
  pending.set(pinId, request);

  const cleanup = () => {
    if (pending.get(pinId) === request) pending.delete(pinId);
  };
  // Handle both outcomes without creating an unobserved rejected promise.
  void request.then(cleanup, cleanup);
  return request;
}
