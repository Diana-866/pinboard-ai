/**
 * Roll back an optimistic aspect-ratio change only if the pin still displays
 * the value from the failed request. This protects any newer UI choice.
 */
export function rollbackPinAspectRatioIfUnchanged<T extends { id: string; aspectRatio: string }>(
  pins: T[],
  pinId: string,
  attemptedRatio: string,
  previousRatio: string,
): T[] {
  return pins.map((pin) =>
    pin.id === pinId && pin.aspectRatio === attemptedRatio
      ? { ...pin, aspectRatio: previousRatio }
      : pin
  );
}
