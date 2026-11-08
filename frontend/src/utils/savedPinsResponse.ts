/**
 * Validate the saved-pins API payload before rendering it.
 * An unexpected response must be shown as a load error, never as an empty board.
 */
export function requireSavedPinsArray(value: unknown): any[] {
  if (!Array.isArray(value)) {
    throw new Error('Сервер вернул некорректный список сохранённых пинов.');
  }
  return value;
}
