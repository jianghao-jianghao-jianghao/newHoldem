import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeRoomDeletion, secretsMatch, type RoomDeleteAuthSubject } from './roomAuth.ts';

function makeSubject(overrides: Partial<RoomDeleteAuthSubject> = {}): RoomDeleteAuthSubject {
  return {
    isDefault: false,
    roomId: 'ROOM99',
    hostId: 'host-1',
    hasAnyHumanPlayer: true,
    creatorId: 'host-1',
    creatorSecret: 'secret-host-1',
    seatSecrets: new Map([['host-1', 'secret-host-1']]),
    ...overrides,
  };
}

test('secretsMatch performs exact constant-time equality and rejects empty values', () => {
  assert.equal(secretsMatch('abc123', 'abc123'), true);
  assert.equal(secretsMatch('abc123', 'abc124'), false);
  assert.equal(secretsMatch('abc123', 'abc12'), false);
  assert.equal(secretsMatch('', ''), false);
  assert.equal(secretsMatch('abc', null), false);
});

test('authorizeRoomDeletion blocks deleting default CLUB01 room even with valid host secret', () => {
  const res = authorizeRoomDeletion(
    makeSubject({ isDefault: true, roomId: 'CLUB01' }),
    'host-1',
    'secret-host-1',
    true
  );
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
});

test('authorizeRoomDeletion rejects spoofed X-Player-Id without valid X-Seat-Secret', () => {
  const subject = makeSubject();

  const missingSecret = authorizeRoomDeletion(subject, 'host-1', null, true);
  assert.equal(missingSecret.ok, false);
  assert.equal(missingSecret.status, 403);

  const wrongSecret = authorizeRoomDeletion(subject, 'host-1', 'forged-secret', true);
  assert.equal(wrongSecret.ok, false);
  assert.equal(wrongSecret.status, 403);

  const nonHost = authorizeRoomDeletion(subject, 'guest-2', 'secret-host-1', true);
  assert.equal(nonHost.ok, false);
  assert.equal(nonHost.status, 403);
});

test('authorizeRoomDeletion requires stored host secret when requireSecretCheck is true', () => {
  const subject = makeSubject({ seatSecrets: new Map() });
  const res = authorizeRoomDeletion(subject, 'host-1', 'any-secret', true);
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
});

test('authorizeRoomDeletion allows authenticated host with matching X-Player-Id and X-Seat-Secret', () => {
  const subject = makeSubject();
  const res = authorizeRoomDeletion(subject, 'host-1', 'secret-host-1', true);
  assert.equal(res.ok, true);
});

test('authorizeRoomDeletion protects empty custom room bound to creator credentials', () => {
  const emptyBound = makeSubject({
    hostId: null,
    hasAnyHumanPlayer: false,
    creatorId: 'creator-A',
    creatorSecret: 'creator-secret-A',
    seatSecrets: new Map(),
  });

  assert.equal(authorizeRoomDeletion(emptyBound, 'attacker-B', 'creator-secret-A', true).ok, false);
  assert.equal(authorizeRoomDeletion(emptyBound, 'creator-A', 'wrong-secret', true).ok, false);
  assert.equal(authorizeRoomDeletion(emptyBound, 'creator-A', 'creator-secret-A', true).ok, true);
});
