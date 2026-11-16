export const MAX_AVATAR_FILE_SIZE_BYTES = 1024 * 1024;

const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export type AvatarFileValidationError = 'invalidType' | 'tooLarge';

export function validateAvatarFile(
  file: { type: string; size: number }
): AvatarFileValidationError | null {
  if (!ALLOWED_AVATAR_MIME_TYPES.has(String(file.type || '').toLowerCase()) ||
      !Number.isFinite(file.size) || file.size <= 0) {
    return 'invalidType';
  }
  if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) return 'tooLarge';
  return null;
}
