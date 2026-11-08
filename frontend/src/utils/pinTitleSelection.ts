/**
 * Keeps the latest title choice available to async actions such as scheduling,
 * even before React has committed the state update from a successful PATCH.
 */
export function rememberPinTitleSelection(
  selections: Map<string, string>,
  pinId: string,
  title: string,
): string | undefined {
  const previous = selections.get(pinId);
  selections.set(pinId, title);
  return previous;
}

export function resolvePinTitleSelection(
  selections: Map<string, string>,
  pinId: string,
  fallbackTitle: string,
): string {
  return selections.get(pinId) ?? fallbackTitle;
}

/**
 * Roll back a failed request only if it is still the newest choice. A slower
 * failed request must not overwrite a more recent title selected by the user.
 */
export function restorePinTitleSelectionIfCurrent(
  selections: Map<string, string>,
  pinId: string,
  failedTitle: string,
  previousTitle: string | undefined,
): boolean {
  if (selections.get(pinId) !== failedTitle) return false;
  if (previousTitle === undefined) selections.delete(pinId);
  else selections.set(pinId, previousTitle);
  return true;
}
