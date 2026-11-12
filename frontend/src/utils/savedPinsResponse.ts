/**
 * Validate saved-pin records before rendering them.
 * A malformed row must not become a broken card or be mistaken for an empty board.
 */
export function requireSavedPinsArray(value: unknown): any[] {
  if (!Array.isArray(value)) {
    throw new Error('Сервер вернул некорректный список сохранённых пинов.');
  }

  const seenIds = new Set<string>();
  for (const pin of value) {
    if (!pin || typeof pin !== 'object' || Array.isArray(pin)) {
      throw new Error('Сервер вернул некорректную запись сохранённого пина.');
    }
    if (typeof pin.id !== 'string' || !pin.id.trim() || pin.id !== pin.id.trim()) {
      throw new Error('У сохранённого пина отсутствует или некорректен идентификатор.');
    }
    if (seenIds.has(pin.id)) {
      throw new Error('Сервер вернул повторяющийся идентификатор сохранённого пина.');
    }
    seenIds.add(pin.id);

    if (typeof pin.image_url !== 'string' || !pin.image_url.trim()) {
      throw new Error('У сохранённого пина отсутствует постоянная ссылка на изображение.');
    }
    let imageUrl: URL;
    try {
      imageUrl = new URL(pin.image_url);
    } catch {
      throw new Error('Сервер вернул некорректную ссылку на изображение сохранённого пина.');
    }
    if (imageUrl.protocol !== 'https:' || !imageUrl.hostname || imageUrl.username || imageUrl.password) {
      throw new Error('Ссылка на сохранённое изображение должна быть безопасной HTTPS-ссылкой.');
    }
  }

  return value;
}
