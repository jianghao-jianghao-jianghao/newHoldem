import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseBotAction,
  computePositionRatio,
  countStraightDrawCompletionRanks,
  evaluatePostflopStrength,
  evaluatePreflopStrength,
} from './botAi';
import {
  addPlayerToTable,
  applyPlayerAction,
  createTableState,
  startNewHand,
} from '../src/shared/pokerEngine';
import type { Card } from '../src/shared/types';

test('evaluatePreflopStrength orders premium hands well above weak offsuit rags', () => {
  const aa = evaluatePreflopStrength([
    { suit: 'spades', rank: 14 },
    { suit: 'hearts', rank: 14 },
  ]);
  const kk = evaluatePreflopStrength([
    { suit: 'spades', rank: 13 },
    { suit: 'hearts', rank: 13 },
  ]);
  const qq = evaluatePreflopStrength([
    { suit: 'spades', rank: 12 },
    { suit: 'hearts', rank: 12 },
  ]);
  const aks = evaluatePreflopStrength([
    { suit: 'spades', rank: 14 },
    { suit: 'spades', rank: 13 },
  ]);
  const rags = evaluatePreflopStrength([
    { suit: 'clubs', rank: 7 },
    { suit: 'diamonds', rank: 2 },
  ]);

  assert.ok(aa > kk && kk > qq, `Expected AA (${aa}) > KK (${kk}) > QQ (${qq})`);
  assert.ok(aks >= 0.80, `Expected AKs (${aks}) >= 0.80`);
  assert.ok(aks > rags + 0.5, `Expected AKs (${aks}) >> 72o (${rags})`);
});

test('evaluatePostflopStrength recognizes top pair with overcard kicker (AQ on Q-8-4) decisively above middle pair', () => {
  const board: Card[] = [
    { suit: 'hearts', rank: 12 },
    { suit: 'clubs', rank: 8 },
    { suit: 'diamonds', rank: 4 },
  ];
  const topPairAceKicker = evaluatePostflopStrength(
    [
      { suit: 'spades', rank: 14 },
      { suit: 'diamonds', rank: 12 },
    ],
    board
  );
  const middlePair = evaluatePostflopStrength(
    [
      { suit: 'spades', rank: 11 },
      { suit: 'hearts', rank: 8 },
    ],
    board
  );

  assert.ok(
    topPairAceKicker >= 0.72,
    `Expected AQ on Q-8-4 to score >= 0.72, got ${topPairAceKicker}`
  );
  assert.ok(
    topPairAceKicker - middlePair >= 0.18,
    `Expected Top Pair Ace kicker (${topPairAceKicker}) >> Middle Pair (${middlePair})`
  );
});

test('countStraightDrawCompletionRanks distinguishes 4-out AKQJ/A234 gutshots from 8-out OESD', () => {
  // AKQJ -> only a Ten (1 rank = 4 outs) completes the straight
  const broadwayTop = countStraightDrawCompletionRanks(
    [
      { suit: 'spades', rank: 14 },
      { suit: 'hearts', rank: 13 },
    ],
    [
      { suit: 'clubs', rank: 12 },
      { suit: 'diamonds', rank: 11 },
      { suit: 'spades', rank: 2 },
    ]
  );
  assert.equal(broadwayTop, 1);

  // A234 -> only a Five (1 rank = 4 outs) completes the wheel straight
  const wheelDraw = countStraightDrawCompletionRanks(
    [
      { suit: 'spades', rank: 14 },
      { suit: 'hearts', rank: 2 },
    ],
    [
      { suit: 'clubs', rank: 3 },
      { suit: 'diamonds', rank: 4 },
      { suit: 'spades', rank: 9 },
    ]
  );
  assert.equal(wheelDraw, 1);

  // JT98 -> both Q and 7 (2 ranks = 8 outs) complete the straight
  const oesd = countStraightDrawCompletionRanks(
    [
      { suit: 'spades', rank: 11 },
      { suit: 'hearts', rank: 10 },
    ],
    [
      { suit: 'clubs', rank: 9 },
      { suit: 'diamonds', rank: 8 },
      { suit: 'spades', rank: 2 },
    ]
  );
  assert.equal(oesd, 2);
});

test('computePositionRatio places UTG earliest (~0) and BTN/BB latest in 6-max preflop', () => {
  const table = createTableState('BOT_POS', 10, 20, 2000);
  for (let i = 0; i < 6; i++) {
    addPlayerToTable(table, { id: `p${i}`, name: `P${i}`, chips: 2000, isBot: i > 0 });
  }
  startNewHand(table, () => 0.4, 1000);

  // Seat 0 = Dealer/BTN, Seat 1 = SB, Seat 2 = BB, Seat 3 = UTG
  assert.equal(table.dealerSeatIndex, 0);
  assert.equal(table.bigBlindSeatIndex, 2);
  assert.equal(table.currentTurnPlayerId, 'p3');

  const utgRatio = computePositionRatio(table, 3);
  const btnRatio = computePositionRatio(table, 0);
  const bbRatio = computePositionRatio(table, 2);

  assert.equal(utgRatio, 0);
  assert.ok(btnRatio >= 0.6, `Expected BTN ratio (${btnRatio}) >= 0.6`);
  assert.equal(bbRatio, 1);
});

test('6-max UTG opens with raise (never limps/folds) holding KK, QQ, or AKs', () => {
  const hands: Array<[{ suit: 'spades'; rank: 13 | 12 | 14 }, { suit: 'hearts' | 'spades'; rank: 13 | 12 }]> = [
    [
      { suit: 'spades', rank: 13 },
      { suit: 'hearts', rank: 13 },
    ],
    [
      { suit: 'spades', rank: 12 },
      { suit: 'hearts', rank: 12 },
    ],
    [
      { suit: 'spades', rank: 14 },
      { suit: 'spades', rank: 13 },
    ],
  ];

  for (const holeCards of hands) {
    const table = createTableState('BOT_6MAX_OPEN', 10, 20, 2000);
    for (let i = 0; i < 6; i++) {
      addPlayerToTable(table, { id: `bot_${i}`, name: `Bot${i}`, chips: 2000, isBot: true });
    }
    startNewHand(table, () => 0.4, 1000);
    const utgId = table.currentTurnPlayerId!;
    const utg = table.players.find((p) => p.id === utgId)!;
    utg.holeCards = holeCards;

    const decision = chooseBotAction(table, utgId, () => 0.5);
    assert.equal(
      decision.type,
      'raise',
      `Expected 6-max UTG to open-raise with ${holeCards[0].rank}-${holeCards[1].rank}, got ${decision.type}`
    );
  }
});

test('bot folds weak 72o facing a full-stack preflop shove', () => {
  const table = createTableState('BOT_SHOVE', 10, 20, 2000);
  addPlayerToTable(table, { id: 'human', name: 'Hero', chips: 2000 });
  addPlayerToTable(table, { id: 'bot1', name: '陈默', chips: 2000, isBot: true });

  startNewHand(table, () => 0.4, 1000);
  const bot = table.players.find((p) => p.id === 'bot1')!;
  bot.holeCards = [
    { suit: 'clubs', rank: 7 },
    { suit: 'diamonds', rank: 2 },
  ];

  // Hero shoves 2000 preflop
  applyPlayerAction(table, 'human', { type: 'raise', amount: 2000 }, 1100);
  assert.equal(table.currentTurnPlayerId, 'bot1');

  const decision = chooseBotAction(table, 'bot1', () => 0.5);
  assert.equal(decision.type, 'fold');
});

test('bot calls facing a preflop shove with AA, KK, QQ, and AKs', () => {
  const premiums = [
    [
      { suit: 'spades' as const, rank: 14 as const },
      { suit: 'hearts' as const, rank: 14 as const },
    ],
    [
      { suit: 'spades' as const, rank: 13 as const },
      { suit: 'hearts' as const, rank: 13 as const },
    ],
    [
      { suit: 'spades' as const, rank: 12 as const },
      { suit: 'hearts' as const, rank: 12 as const },
    ],
    [
      { suit: 'spades' as const, rank: 14 as const },
      { suit: 'spades' as const, rank: 13 as const },
    ],
  ];

  for (const holeCards of premiums) {
    const table = createTableState('BOT_PREMIUM_CALL', 10, 20, 2000);
    addPlayerToTable(table, { id: 'human', name: 'Hero', chips: 2000 });
    addPlayerToTable(table, { id: 'bot1', name: '林澈', chips: 2000, isBot: true });

    startNewHand(table, () => 0.4, 1000);
    const bot = table.players.find((p) => p.id === 'bot1')!;
    bot.holeCards = holeCards;

    applyPlayerAction(table, 'human', { type: 'raise', amount: 2000 }, 1100);
    const decision = chooseBotAction(table, 'bot1', () => 0.5);
    assert.equal(
      decision.type,
      'call',
      `Expected bot to call shove with ${holeCards[0].rank}-${holeCards[1].rank}, got ${decision.type}`
    );
  }
});

test('bot stops re-raising mediocre hands when street raise cap is reached', () => {
  const table = createTableState('BOT_CAP', 10, 20, 2000);
  addPlayerToTable(table, { id: 'human', name: 'Hero', chips: 2000 });
  addPlayerToTable(table, { id: 'bot1', name: '周屿', chips: 2000, isBot: true });

  startNewHand(table, () => 0.4, 1000);
  const bot = table.players.find((p) => p.id === 'bot1')!;
  bot.holeCards = [
    { suit: 'spades', rank: 10 },
    { suit: 'hearts', rank: 10 },
  ];

  // Simulate 3 raises already occurring preflop
  applyPlayerAction(table, 'human', { type: 'raise', amount: 60 }, 1100);
  applyPlayerAction(table, 'bot1', { type: 'raise', amount: 140 }, 1200);
  applyPlayerAction(table, 'human', { type: 'raise', amount: 300 }, 1300);

  const decision = chooseBotAction(table, 'bot1', () => 0.1);
  assert.notEqual(decision.type, 'raise');
});

