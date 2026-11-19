import { getAppErrorMessage } from '../i18n/appErrorCopy';
/**
 * Validate a successful generation response before the UI forgets its
 * idempotency key. A 2xx response with incomplete pin data must remain
 * recoverable instead of being rendered as a broken/empty result.
 */
export function requireGeneratedPinsArray(value: unknown): any[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) {
    throw new Error(getAppErrorMessage('generationInvalidResult'));
  }

  const seenIds = new Set<string>();
  for (const pin of value) {
    if (!pin || typeof pin !== 'object' || Array.isArray(pin)) {
      throw new Error(getAppErrorMessage('generationIncompletePin'));
    }
    if (typeof pin.id !== 'string' || !pin.id.trim() || pin.id !== pin.id.trim()) {
      throw new Error(getAppErrorMessage('generationPinMissingId'));
    }
    if (seenIds.has(pin.id)) {
      throw new Error(getAppErrorMessage('generationDuplicateId'));
    }
    seenIds.add(pin.id);
    if (typeof pin.image_url !== 'string' || !pin.image_url.trim()) {
      throw new Error(getAppErrorMessage('generationMissingImage'));
    }

    let imageUrl: URL;
    try {
      imageUrl = new URL(pin.image_url);
    } catch {
      throw new Error(getAppErrorMessage('generationInvalidImage'));
    }
    if (imageUrl.protocol !== 'https:' || !imageUrl.hostname || imageUrl.username || imageUrl.password) {
      throw new Error(getAppErrorMessage('generationUnsafeImage'));
    }
  }

  return value;
}
