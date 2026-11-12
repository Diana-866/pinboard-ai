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

    if (pin.title != null && typeof pin.title !== 'string') {
      throw new Error('У сохранённого пина некорректный заголовок.');
    }
    if (pin.description != null && typeof pin.description !== 'string') {
      throw new Error('У сохранённого пина некорректное описание.');
    }
    if (pin.aspect_ratio != null &&
        !['2:3', '9:16', '3:4', '4:5', '1:1'].includes(pin.aspect_ratio)) {
      throw new Error('У сохранённого пина неподдерживаемый формат изображения.');
    }

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
