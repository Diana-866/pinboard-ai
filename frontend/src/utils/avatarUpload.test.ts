import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_AVATAR_FILE_SIZE_BYTES, validateAvatarFile } from './avatarUpload';

test('accepts supported raster image formats within the size limit', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
    assert.equal(validateAvatarFile({ type, size: 1024 }), null);
    assert.equal(validateAvatarFile({ type, size: MAX_AVATAR_FILE_SIZE_BYTES }), null);
  }
});

test('rejects unsupported or empty files', () => {
  assert.equal(validateAvatarFile({ type: 'image/svg+xml', size: 1024 }), 'invalidType');
  assert.equal(validateAvatarFile({ type: 'application/pdf', size: 1024 }), 'invalidType');
  assert.equal(validateAvatarFile({ type: 'image/png', size: 0 }), 'invalidType');
  assert.equal(validateAvatarFile({ type: '', size: 1024 }), 'invalidType');
});

test('rejects images larger than one MiB', () => {
  assert.equal(
    validateAvatarFile({ type: 'image/jpeg', size: MAX_AVATAR_FILE_SIZE_BYTES + 1 }),
    'tooLarge'
  );
});
