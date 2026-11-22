import assert from 'node:assert/strict';
import test from 'node:test';
import { EmailAuthStore } from './authStore';
import { HoldemDatabase } from './db';
import { evaluateGtoSpot } from './gtoCoach';
import { computeNormalizedPointsDelta, LeaderboardStore } from './leaderboard';
import { SlidingWindowRateLimiter } from './rateLimiter';
import {
  addPlayerToTable,
  applyPlayerAction,
  computeSidePots,
  createTableState,
  removePlayerFromTable,
  startNewHand,
} from '../src/shared/pokerEngine';

test('SQLite EmailAuthStore persists accounts, revokes tokens on logout, and blocks client stat spoofing', async () => {
  const db = new HoldemDatabase({ dbPath: ':memory:' });
  try {
    const store = new EmailAuthStore({
      database: db,
      sessionSecret: 'test-sqlite-session-secret-0123456789',
      emailSender: async () => ({ delivered: false, mode: 'preview' }),
    });

    const t0 = 1_750_000_000_000;
    const req = await store.requestOtp('gto@velvet.club', t0);
    assert.equal(req.ok, true);

    const verified = store.verifyOtp(
      'gto@velvet.club',
      req.previewCode!,
      { displayName: '牌桌高手', avatar: 'crown' },
      t0 + 1000
    );
    assert.equal(verified.ok, true);
    const token = verified.token!;
    const uid = verified.profile!.uid;

    // Attempt to spoof 99,999,999 points via syncMatchOutcome -> MUST be ignored
    const afterSpoof = store.syncMatchOutcome(
      uid,
      {
        playerName: '牌桌高手',
        points: 99_999_999,
        netChips: 99_999_999,
        handsPlayed: 500,
        handsWon: 500,
        bestHandName: '皇家同花顺',
        bestHandScore: 99_999_999,
        updatedAt: t0 + 2000,
        achievements: ['royal_flush', 'mega_pot'],
      },
      'spade',
      t0 + 2000
    );
    assert.equal(afterSpoof?.points, 1000);
    assert.equal(afterSpoof?.handsPlayed, 0);
    assert.deepEqual(afterSpoof?.achievements, []);
    assert.equal(afterSpoof?.avatar, 'spade');

    // Authoritative server-side recording DOES update stats & persists to SQLite
    const authUpdate = store.recordAuthoritativeHandOutcome(
      uid,
      {
        netChips: 400,
        normalizedPointsDelta: 220,
        won: true,
        potWon: 800,
        wasAllIn: true,
        handName: '同花',
        handScore: 5 * Math.pow(15, 5),
        handCategory: 5,
        currentChips: 2400,
        startingChips: 2000,
        bigBlind: 20,
      },
      t0 + 3000
    );
    assert.equal(authUpdate?.profile.points, 1220);
    assert.equal(authUpdate?.profile.handsWon, 1);
    assert.ok(authUpdate?.profile.achievements.includes('first_blood'));

    // Reload a fresh EmailAuthStore instance against the same SQLite DB to verify persistence
    const reloaded = new EmailAuthStore({
      database: db,
      sessionSecret: 'test-sqlite-session-secret-0123456789',
    });
    const sessionBeforeLogout = reloaded.verifySessionToken(token, t0 + 5000);
    assert.equal(sessionBeforeLogout?.points, 1220);
    assert.equal(sessionBeforeLogout?.handsWon, 1);

    // Revoke token on logout -> token must immediately become invalid
    assert.equal(reloaded.revokeSessionToken(token, t0 + 6000), true);
    assert.equal(reloaded.verifySessionToken(token, t0 + 6001), null);
  } finally {
    db.close();
  }
});

test('SQLite LeaderboardStore normalizes bot-practice farming and separates ranked vs practice entries', () => {
  const db = new HoldemDatabase({ dbPath: ':memory:' });
  try {
    const lb = new LeaderboardStore({ database: db });

    // High-stake bot farming (10,000 BB room, winning 200,000 chips vs bot) should be heavily capped/normalized
    const botFarmDelta = computeNormalizedPointsDelta({
      netChips: 200_000,
      bigBlind: 10_000,
      won: true,
      isPracticeWithBots: true,
    });
    const humanWinDelta = computeNormalizedPointsDelta({
      netChips: 400,
      bigBlind: 20,
      won: true,
      isPracticeWithBots: false,
    });
    // Both won 20 BB, so human ranked win must yield strictly more points than bot practice
    assert.ok(
      humanWinDelta > botFarmDelta,
      `Expected human 20BB win (${humanWinDelta}) > bot 20BB win (${botFarmDelta})`
    );
    assert.ok(botFarmDelta <= 100, `Bot farm 20BB delta (${botFarmDelta}) must stay bounded`);

    lb.runBatch(() => {
      lb.recordHandOutcome({
        playerName: '真人冠军',
        uid: 'u_ranked_1',
        isPracticeWithBots: false,
        netChips: 1600,
        won: true,
        bigBlind: 20,
      });
      lb.recordHandOutcome({
        playerName: '陪练玩家',
        uid: 'u_practice_1',
        isPracticeWithBots: true,
        netChips: 1600,
        won: true,
        bigBlind: 20,
      });
    });

    const ranked = lb.getRankedList(30, 'ranked');
    const practice = lb.getRankedList(30, 'practice');
    assert.ok(ranked.some((e) => e.playerName === '真人冠军'));
    assert.ok(!ranked.some((e) => e.playerName === '陪练玩家'));
    assert.ok(practice.some((e) => e.playerName === '陪练玩家'));

    // Verify persistence across reload
    const lb2 = new LeaderboardStore({ database: db });
    assert.ok(lb2.getRankedList(30, 'ranked').some((e) => e.playerName === '真人冠军'));
  } finally {
    db.close();
  }
});

test('SlidingWindowRateLimiter enforces window cap and releases after expiry', () => {
  const limiter = new SlidingWindowRateLimiter({ maxRequests: 3, windowMs: 10_000 });
  const t0 = 1_000_000;

  assert.equal(limiter.consume('1.2.3.4', t0).allowed, true);
  assert.equal(limiter.consume('1.2.3.4', t0 + 1000).allowed, true);
  assert.equal(limiter.consume('1.2.3.4', t0 + 2000).allowed, true);

  const blocked = limiter.consume('1.2.3.4', t0 + 3000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 7);

  // Different IP is unaffected
  assert.equal(limiter.consume('5.6.7.8', t0 + 3000).allowed, true);

  // After window expires, IP is allowed again
  assert.equal(limiter.consume('1.2.3.4', t0 + 11_000).allowed, true);
});

test('computeSidePots itemizes main pot and side pot accurately for multiway all-ins', () => {
  const table = createTableState('SIDE_POTS', 10, 20, 2000);
  addPlayerToTable(table, { id: 'short', name: 'Short', chips: 100 });
  addPlayerToTable(table, { id: 'mid', name: 'Mid', chips: 300 });
  addPlayerToTable(table, { id: 'deep', name: 'Deep', chips: 600 });

  startNewHand(table, () => 0.4, 1000);
  // Short jams 100, Mid jams 300, Deep calls 300 -> Main pot = 300 (3 players), Side pot = 400 (mid + deep)
  while (table.phase === 'preflop' && table.currentTurnPlayerId) {
    const actor = table.players.find((p) => p.id === table.currentTurnPlayerId)!;
    if (actor.id === 'short') {
      applyPlayerAction(table, 'short', { type: 'raise', amount: 100 }, 1100, { stepAllIn: true });
    } else if (actor.id === 'mid') {
      applyPlayerAction(table, 'mid', { type: 'raise', amount: 300 }, 1200, { stepAllIn: true });
    } else {
      applyPlayerAction(table, 'deep', { type: 'call' }, 1300, { stepAllIn: true });
    }
  }

  const pots = computeSidePots(table);
  assert.equal(pots.length, 2);
  assert.equal(pots[0].isMain, true);
  assert.equal(pots[0].amount, 300);
  assert.equal(pots[0].eligiblePlayerIds.length, 3);
  assert.equal(pots[1].isMain, false);
  assert.equal(pots[1].amount, 400);
  assert.equal(pots[1].eligiblePlayerIds.length, 2);
});

test('passive fold via removePlayerFromTable advances directly into stepped all-in runout when <2 able-to-act remain', () => {
  const table = createTableState('PASSIVE_ALLIN', 10, 20, 2000);
  addPlayerToTable(table, { id: 'p1', name: 'P1', chips: 100 });
  addPlayerToTable(table, { id: 'p2', name: 'P2', chips: 500 });
  addPlayerToTable(table, { id: 'p3', name: 'P3', chips: 500 });

  startNewHand(table, () => 0.4, 1000);
  // p1 (seat 0, BTN) jams 100, p2 calls 100, p3 calls 100 -> advances to flop
  applyPlayerAction(table, 'p1', { type: 'raise', amount: 100 }, 1100, { stepAllIn: true });
  applyPlayerAction(table, 'p2', { type: 'call' }, 1200, { stepAllIn: true });
  applyPlayerAction(table, 'p3', { type: 'call' }, 1300, { stepAllIn: true });
  assert.equal(table.phase, 'flop');
  // p2 acts first on flop; p2 checks -> now p3's turn. If p2 leaves? Wait: if p3 (non-turn? no, p2 already acted)
  // Let's have p2 check (so p2.actedThisRound = true, currentBet = 0), now it's p3's turn -> p3 leaves!
  applyPlayerAction(table, 'p2', { type: 'check' }, 1400, { stepAllIn: true });
  assert.equal(table.currentTurnPlayerId, 'p3');
  removePlayerFromTable(table, 'p3');
  // Because removePlayerFromTable now passes { stepAllIn: true }, hand enters stepped allInRunout instead of skipping straight to showdown
  assert.equal(table.allInRunout, true);
  assert.equal(table.phase, 'flop');
});

test('SQLite hand_history persists replays, redacts unrevealed hole cards, and passes ping()', () => {
  const db = new HoldemDatabase({ dbPath: ':memory:' });
  try {
    assert.equal(db.ping(), true);
    db.recordHandHistory('CLUB01', {
      handNumber: 7,
      timestamp: 1_750_000_000_000,
      smallBlind: 10,
      bigBlind: 20,
      pot: 460,
      communityCards: [
        { suit: 'spades', rank: 14 },
        { suit: 'hearts', rank: 12 },
        { suit: 'clubs', rank: 7 },
        { suit: 'diamonds', rank: 3 },
        { suit: 'spades', rank: 2 },
      ],
      winners: [],
      players: [
        {
          id: 'p1',
          name: 'Hero',
          seatIndex: 0,
          chipsAfter: 2230,
          netChange: 230,
          folded: false,
          allIn: false,
          revealed: true,
          holeCards: [
            { suit: 'spades', rank: 14 },
            { suit: 'diamonds', rank: 13 },
          ],
        },
        {
          id: 'p2',
          name: 'Folder',
          seatIndex: 1,
          chipsAfter: 1770,
          netChange: -230,
          folded: true,
          allIn: false,
          revealed: false,
          holeCards: [
            { suit: 'clubs', rank: 9 },
            { suit: 'hearts', rank: 8 },
          ],
        },
      ],
      actions: [],
      potTimeline: [],
    });

    const rows = db.getRoomHandHistory('CLUB01', 10);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].handNumber, 7);
    assert.equal(rows[0].pot, 460);
    assert.ok(rows[0].players[0].holeCards !== null);
    assert.equal(rows[0].players[1].holeCards, null); // Unrevealed folded cards redacted
  } finally {
    db.close();
  }
});

test('evaluateGtoSpot validates duplicate cards and produces accurate preflop & postflop GTO advice', () => {
  const dup = evaluateGtoSpot({
    holeCards: [
      { suit: 'spades', rank: 14 },
      { suit: 'spades', rank: 14 },
    ],
  });
  assert.equal(dup.ok, false);

  const pre = evaluateGtoSpot({
    holeCards: [
      { suit: 'spades', rank: 14 },
      { suit: 'spades', rank: 13 },
    ],
    position: 'UTG',
    pot: 30,
    toCall: 20,
    effectiveStack: 2000,
    bigBlind: 20,
    opponents: 5,
    facingRaises: 0,
  });
  assert.equal(pre.ok, true);
  if (pre.ok) {
    assert.equal(pre.canonicalHand, 'AKs');
    assert.equal(pre.recommendedAction, 'raise');
  }

  const post = evaluateGtoSpot({
    holeCards: [
      { suit: 'spades', rank: 14 },
      { suit: 'spades', rank: 12 },
    ],
    communityCards: [
      { suit: 'spades', rank: 13 },
      { suit: 'spades', rank: 9 },
      { suit: 'spades', rank: 4 },
    ],
    position: 'BTN',
    pot: 120,
    toCall: 0,
    effectiveStack: 1800,
    bigBlind: 20,
    opponents: 1,
  });
  assert.equal(post.ok, true);
  if (post.ok) {
    assert.equal(post.street, 'flop');
    assert.ok((post.equity ?? 0) > 0.85);
    assert.equal(post.recommendedAction, 'raise');
  }
});
