import assert from 'node:assert/strict';
import test from 'node:test';
import { EmailAuthStore } from './authStore';

test('requests 6-digit email OTP, enforces cooldown, and signs in cleanly', async () => {
  const store = new EmailAuthStore({
    disableDiskPersistence: true,
    sessionSecret: 'test-session-secret-0123456789abcdef',
    emailSender: async () => ({ delivered: false, mode: 'preview' }),
  });

  const t0 = 1_700_000_000_000;
  const badReq = await store.requestOtp('not-an-email', t0);
  assert.equal(badReq.ok, false);

  const req1 = await store.requestOtp('Player@Example.com', t0);
  assert.equal(req1.ok, true);
  assert.equal(req1.deliveryMode, 'preview');
  assert.match(req1.previewCode ?? '', /^\d{6}$/);

  const spamReq = await store.requestOtp('player@example.com', t0 + 10_000);
  assert.equal(spamReq.ok, false);
  assert.ok((spamReq.retryAfterSec ?? 0) > 0);

  const verified = store.verifyOtp(
    'player@example.com',
    req1.previewCode!,
    { displayName: '林深', avatar: 'spade' },
    t0 + 5_000
  );
  assert.equal(verified.ok, true);
  assert.ok(verified.token);
  assert.equal(verified.profile?.email, 'player@example.com');
  assert.equal(verified.profile?.displayName, '林深');
  assert.equal(verified.profile?.avatar, 'spade');

  const sessionProfile = store.verifySessionToken(verified.token, t0 + 60_000);
  assert.equal(sessionProfile?.uid, verified.profile?.uid);

  const tampered = store.verifySessionToken(`${verified.token}x`, t0 + 60_000);
  assert.equal(tampered, null);
});

test('locks out OTP after 5 wrong guesses and rejects expired codes', async () => {
  const store = new EmailAuthStore({
    disableDiskPersistence: true,
    sessionSecret: 'test-session-secret-0123456789abcdef',
    emailSender: async () => ({ delivered: false, mode: 'preview' }),
  });

  const t0 = 1_700_000_000_000;
  const req = await store.requestOtp('alice@club.dev', t0);
  assert.equal(req.ok, true);
  const wrongCode = req.previewCode === '000000' ? '111111' : '000000';

  for (let i = 0; i < 4; i++) {
    const attempt = store.verifyOtp('alice@club.dev', wrongCode, undefined, t0 + 1000);
    assert.equal(attempt.ok, false);
  }
  const fifth = store.verifyOtp('alice@club.dev', wrongCode, undefined, t0 + 1000);
  assert.equal(fifth.ok, false);

  // Even the real code should now be invalidated
  const afterLock = store.verifyOtp('alice@club.dev', req.previewCode!, undefined, t0 + 1500);
  assert.equal(afterLock.ok, false);

  // Expiry check after cooldown
  const req2 = await store.requestOtp('alice@club.dev', t0 + 65_000);
  assert.equal(req2.ok, true);
  const expired = store.verifyOtp('alice@club.dev', req2.previewCode!, undefined, t0 + 65_000 + 11 * 60_000);
  assert.equal(expired.ok, false);
});
