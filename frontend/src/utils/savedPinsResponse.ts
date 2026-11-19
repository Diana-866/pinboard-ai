import { getAppErrorMessage } from '../i18n/appErrorCopy';
/**
 * Validate saved-pin records before rendering them.
 * A malformed row must not become a broken card or be mistaken for an empty board.
 */
export function requireSavedPinsArray(value: unknown): any[] {
  if (!Array.isArray(value)) {
    throw new Error(getAppErrorMessage('savedPinsInvalidList'));
  }

  const seenIds = new Set<string>();
  for (const pin of value) {
    if (!pin || typeof pin !== 'object' || Array.isArray(pin)) {
      throw new Error(getAppErrorMessage('savedPinsInvalidRecord'));
    }
    if (typeof pin.id !== 'string' || !pin.id.trim()) {
      throw new Error(getAppErrorMessage('savedPinMissingId'));
    }
    if (seenIds.has(pin.id)) {
      throw new Error(getAppErrorMessage('savedPinDuplicateId'));
    }
    seenIds.add(pin.id);

    if (typeof pin.image_url !== 'string' || !pin.image_url.trim()) {
      throw new Error(getAppErrorMessage('savedPinMissingImage'));
    }
    let imageUrl: URL;
    try {
      imageUrl = new URL(pin.image_url);
    } catch {
      throw new Error(getAppErrorMessage('savedPinInvalidImage'));
    }
    if (imageUrl.protocol !== 'https:') {
      throw new Error(getAppErrorMessage('imageMustUseHttps'));
    }
  }

  return value;
}
