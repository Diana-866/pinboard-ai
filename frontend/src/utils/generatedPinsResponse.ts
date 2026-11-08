/**
 * Validate a successful generation response before the UI forgets its
 * idempotency key. A 2xx response with incomplete pin data must remain
 * recoverable instead of being rendered as a broken/empty result.
 */
export function requireGeneratedPinsArray(value: unknown): any[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) {
    throw new Error('Сервер вернул некорректный результат генерации. Повторите проверку сохранённых результатов.');
  }

  for (const pin of value) {
    if (!pin || typeof pin !== 'object' || Array.isArray(pin)) {
      throw new Error('Сервер вернул неполные данные пина. Ключ восстановления сохранён.');
    }
    if (typeof pin.id !== 'string' || !pin.id.trim()) {
      throw new Error('У сохранённого пина отсутствует идентификатор. Ключ восстановления сохранён.');
    }
    if (typeof pin.image_url !== 'string' || !pin.image_url.trim()) {
      throw new Error('У сохранённого пина отсутствует постоянная ссылка на изображение. Ключ восстановления сохранён.');
    }

    let imageUrl: URL;
    try {
      imageUrl = new URL(pin.image_url);
    } catch {
      throw new Error('Сервер вернул некорректную ссылку на изображение. Ключ восстановления сохранён.');
    }
    if (imageUrl.protocol !== 'https:') {
      throw new Error('Ссылка на сохранённое изображение должна использовать HTTPS. Ключ восстановления сохранён.');
    }
  }

  return value;
}
