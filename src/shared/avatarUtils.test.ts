import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAvatarInitial,
  isCustomAvatarDataUrl,
  MAX_CUSTOM_AVATAR_BYTES,
  sanitizeAvatar,
} from './avatarUtils';

test('sanitizeAvatar accepts preset IDs and valid bounded image data URLs', () => {
  assert.equal(sanitizeAvatar('default'), 'default');
  assert.equal(sanitizeAvatar('fox'), 'fox');
  assert.equal(sanitizeAvatar('crown'), 'crown');

  const validImg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/';
  assert.equal(sanitizeAvatar(validImg), validImg);
  assert.equal(isCustomAvatarDataUrl(validImg), true);
  assert.equal(isCustomAvatarDataUrl('fox'), false);
});

test('sanitizeAvatar rejects invalid, SVG/HTML, or oversized payloads', () => {
  assert.equal(sanitizeAvatar(''), 'default');
  assert.equal(sanitizeAvatar('unknown_preset'), 'default');
  assert.equal(sanitizeAvatar('https://evil.example/a.png'), 'default');
  assert.equal(sanitizeAvatar('data:image/svg+xml;base64,PHN2Zz4='), 'default');

  const tooBig = 'data:image/png;base64,' + 'A'.repeat(MAX_CUSTOM_AVATAR_BYTES + 10);
  assert.equal(sanitizeAvatar(tooBig), 'default');
});

test('getAvatarInitial handles Chinese and Latin names cleanly', () => {
  assert.equal(getAvatarInitial('林深'), '林');
  assert.equal(getAvatarInitial('  alex '), 'A');
  assert.equal(getAvatarInitial(''), 'V');
});
