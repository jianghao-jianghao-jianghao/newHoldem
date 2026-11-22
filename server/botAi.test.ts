import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseBotAction,
  computePositionRatio,
  countStraightDrawCompletionRanks,
  evaluatePostflopStrength,
  evaluatePreflopStrength,
  resolveGtoPosition,
} from './botAi';
import {
  analyzeBoardTexture,
  computeGeometricBetFraction,
  computeMdf,
  computeOptimalBluffRatio,
  encodeCardInt,
  estimatePostflopEquity,
  evaluateBlockers,
  evaluateCardsFast,
  getGtoPreflopMix,
  toCanonicalHandKey,
} from './gtoRanges';
import { evaluateBestHand } from '../src/shared/handEvaluator';
import {
  addPlayerToTable,
  applyPlayerAction,
  createTableState,
  startNewHand,
} from '../src/shared/pokerEngine';
import type { Card, Rank, Suit } from '../src/shared/types';

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
  assert.ok(aks >= 0.8, `Expected AKs (${aks}) >= 0.80`);
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

test('computePositionRatio places UTG earliest (0), OOP blinds SB/BB low, CO/BTN late, and maps 6-max GTO positions', () => {
  const table = createTableState('BOT_POS', 10, 20, 2000);
  for (let i = 0; i < 6; i++) {
    addPlayerToTable(table, { id: `p${i}`, name: `P${i}`, chips: 2000, isBot: i > 0 });
  }
  startNewHand(table, () => 0.4, 1000);

  // Seat 0 = Dealer/BTN, Seat 1 = SB, Seat 2 = BB, Seat 3 = UTG, Seat 4 = HJ, Seat 5 = CO
  assert.equal(table.dealerSeatIndex, 0);
  assert.equal(table.smallBlindSeatIndex, 1);
  assert.equal(table.bigBlindSeatIndex, 2);
  assert.equal(table.currentTurnPlayerId, 'p3');

  assert.equal(resolveGtoPosition(table, 0), 'BTN');
  assert.equal(resolveGtoPosition(table, 1), 'SB');
  assert.equal(resolveGtoPosition(table, 2), 'BB');
  assert.equal(resolveGtoPosition(table, 3), 'UTG');
  assert.equal(resolveGtoPosition(table, 4), 'HJ');
  assert.equal(resolveGtoPosition(table, 5), 'CO');

  const utgRatio = computePositionRatio(table, 3);
  const sbRatio = computePositionRatio(table, 1);
  const bbRatio = computePositionRatio(table, 2);
  const coRatio = computePositionRatio(table, 5);
  const btnRatio = computePositionRatio(table, 0);

  assert.equal(utgRatio, 0);
  assert.ok(sbRatio < 0.3 && bbRatio < 0.3, `Expected OOP blinds low, got SB=${sbRatio}, BB=${bbRatio}`);
  assert.ok(coRatio >= 0.65, `Expected CO ratio (${coRatio}) >= 0.65`);
  assert.equal(btnRatio, 1);
});

test('GTO preflop matrix enforces position discipline (BTN opens much wider than UTG, 72o always folds)', () => {
  assert.equal(
    toCanonicalHandKey([
      { suit: 'spades', rank: 14 },
      { suit: 'spades', rank: 13 },
    ]),
    'AKs'
  );
  assert.equal(
    toCanonicalHandKey([
      { suit: 'hearts', rank: 7 },
      { suit: 'clubs', rank: 2 },
    ]),
    '72o'
  );

  const k8o: Card[] = [
    { suit: 'spades', rank: 13 },
    { suit: 'hearts', rank: 8 },
  ];
  const utgK8o = getGtoPreflopMix({
    holeCards: k8o,
    position: 'UTG',
    facingRaises: 0,
    facingBetBB: 1,
    effectiveStackBB: 100,
    isHeadsUp: false,
    canCheck: false,
  });
  const btnK8o = getGtoPreflopMix({
    holeCards: k8o,
    position: 'BTN',
    facingRaises: 0,
    facingBetBB: 1,
    effectiveStackBB: 100,
    isHeadsUp: false,
    canCheck: false,
  });
  assert.equal(utgK8o.raise, 0);
  assert.ok(btnK8o.raise >= 0.8, `Expected BTN to open K8o, got raise=${btnK8o.raise}`);

  // Short-stack Nash shove (< 10BB): BTN jams A7o
  const shortA7o = getGtoPreflopMix({
    holeCards: [
      { suit: 'spades', rank: 14 },
      { suit: 'clubs', rank: 7 },
    ],
    position: 'BTN',
    facingRaises: 0,
    facingBetBB: 1,
    effectiveStackBB: 8,
    isHeadsUp: false,
    canCheck: false,
  });
  assert.ok(shortA7o.raise >= 0.9, `Expected 8BB BTN Nash jam with A7o, got ${shortA7o.raise}`);
});

test('6-max UTG opens with raise (never limps/folds) holding KK, QQ, or AKs', () => {
  const hands: Array<
    [{ suit: 'spades'; rank: 13 | 12 | 14 }, { suit: 'hearts' | 'spades'; rank: 13 | 12 }]
  > = [
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
  const table = createTableState('BOT_72O', 10, 20, 2000);
  addPlayerToTable(table, { id: 'human', name: 'Hero', chips: 2000 });
  addPlayerToTable(table, { id: 'bot1', name: '陈默', chips: 2000, isBot: true });

  startNewHand(table, () => 0.4, 1000);
  const bot = table.players.find((p) => p.id === 'bot1')!;
  bot.holeCards = [
    { suit: 'clubs', rank: 7 },
    { suit: 'diamonds', rank: 2 },
  ];

  applyPlayerAction(table, 'human', { type: 'raise', amount: 2000 }, 1100);
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
  addPlayerToTable(table, { id: 'bot1', name: '林澈', chips: 2000, isBot: true });

  startNewHand(table, () => 0.4, 1000);
  const bot = table.players.find((p) => p.id === 'bot1')!;
  bot.holeCards = [
    { suit: 'spades', rank: 11 },
    { suit: 'hearts', rank: 11 },
  ];

  applyPlayerAction(table, 'human', { type: 'raise', amount: 60 }, 1050);
  applyPlayerAction(table, 'bot1', { type: 'raise', amount: 140 }, 1100);
  applyPlayerAction(table, 'human', { type: 'raise', amount: 260 }, 1150);
  applyPlayerAction(table, 'bot1', { type: 'raise', amount: 420 }, 1200);
  applyPlayerAction(table, 'human', { type: 'raise', amount: 600 }, 1250);

  const decision = chooseBotAction(table, 'bot1', () => 0.1);
  assert.notEqual(decision.type, 'raise');
});

test('evaluateCardsFast is 100% order-equivalent to evaluateBestHand across 1,500 random 7-card matchups', () => {
  const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
  const ranks: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }

  let seed = 0x12345678;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let trial = 0; trial < 1500; trial++) {
    // Draw 9 cards: 5 board + 2 handA + 2 handB
    for (let i = 0; i < 9; i++) {
      const j = i + Math.floor(rand() * (52 - i));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }
    const board = deck.slice(0, 5);
    const handA = [...deck.slice(5, 7), ...board];
    const handB = [...deck.slice(7, 9), ...board];

    const slowA = evaluateBestHand(handA).score;
    const slowB = evaluateBestHand(handB).score;
    const fastA = evaluateCardsFast(handA.map(encodeCardInt), 7);
    const fastB = evaluateCardsFast(handB.map(encodeCardInt), 7);

    const slowCmp = Math.sign(slowA - slowB);
    const fastCmp = Math.sign(fastA - fastB);
    assert.equal(fastCmp, slowCmp, `Mismatch on trial ${trial}: slow=${slowCmp}, fast=${fastCmp}`);
  }
});

test('GTO math helpers (MDF, optimal bluff ratio, geometric sizing, blockers, Monte Carlo equity) are accurate', () => {
  // Half-pot bet -> MDF = 1 / 1.5 = 66.7%; river optimal bluff ratio = 0.5 / 2 = 25%
  assert.ok(Math.abs(computeMdf(100, 50) - 2 / 3) < 1e-6);
  assert.ok(Math.abs(computeOptimalBluffRatio(50, 100) - 0.25) < 1e-6);
  // Pot-sized river bet -> optimal bluff ratio = 1 / 3 = 33.3%
  assert.ok(Math.abs(computeOptimalBluffRatio(100, 100) - 1 / 3) < 1e-6);

  // Geometric bet sizing: pot=100, stack=300, 2 streets -> exact 100% pot per street (100 -> 300 -> 900 -> stack=0)
  // Wait: pot=100, bet 100 called -> pot=300, remaining stack=200 -> need ~73.2% pot:
  // ((100 + 600)/100)^(1/2) - 1) / 2 = (sqrt(7) - 1) / 2 ≈ 0.8229
  const geo = computeGeometricBetFraction(100, 300, 2);
  assert.ok(Math.abs(geo - (Math.sqrt(7) - 1) / 2) < 1e-4);

  // Board texture + nut flush blocker detection
  const monotoneFlop: Card[] = [
    { suit: 'spades', rank: 13 },
    { suit: 'spades', rank: 9 },
    { suit: 'spades', rank: 4 },
  ];
  const tex = analyzeBoardTexture(monotoneFlop);
  assert.equal(tex.isMonotone, true);
  assert.equal(tex.flushSuit, 'spades');

  const blockers = evaluateBlockers(
    [
      { suit: 'spades', rank: 14 },
      { suit: 'hearts', rank: 6 },
    ],
    monotoneFlop,
    tex
  );
  assert.equal(blockers.hasNutFlushBlocker, true);
  assert.ok(blockers.bluffScore >= 0.65);

  // Monte Carlo equity: Flopped nut flush >> air on dry board
  const nutFlushEq = estimatePostflopEquity({
    holeCards: [
      { suit: 'spades', rank: 14 },
      { suit: 'spades', rank: 12 },
    ],
    board: monotoneFlop,
    opponentCount: 1,
    iterations: 200,
    rng: (() => {
      let s = 42;
      return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
      };
    })(),
  });
  assert.ok(nutFlushEq > 0.85, `Expected nut flush equity > 0.85, got ${nutFlushEq}`);
});

test('postflop GTO bot value-bets nuts on river and folds pure air facing large river bet', () => {
  const table = createTableState('BOT_POSTFLOP_RIVER', 10, 20, 2000);
  addPlayerToTable(table, { id: 'human', name: 'Hero', chips: 2000 });
  addPlayerToTable(table, { id: 'bot1', name: '陈默', chips: 2000, isBot: true });

  startNewHand(table, () => 0.4, 1000);
  // Check down to river
  applyPlayerAction(table, 'human', { type: 'call' }, 1050);
  applyPlayerAction(table, 'bot1', { type: 'check' }, 1100);
  // Flop
  applyPlayerAction(table, 'bot1', { type: 'check' }, 1150);
  applyPlayerAction(table, 'human', { type: 'check' }, 1200);
  // Turn
  applyPlayerAction(table, 'bot1', { type: 'check' }, 1250);
  applyPlayerAction(table, 'human', { type: 'check' }, 1300);

  assert.equal(table.phase, 'river');
  table.communityCards = [
    { suit: 'spades', rank: 13 },
    { suit: 'spades', rank: 10 },
    { suit: 'spades', rank: 5 },
    { suit: 'hearts', rank: 2 },
    { suit: 'diamonds', rank: 7 },
  ];

  // Bot holding Ace-high nut flush checks first -> must value bet!
  const bot = table.players.find((p) => p.id === 'bot1')!;
  bot.holeCards = [
    { suit: 'spades', rank: 14 },
    { suit: 'spades', rank: 9 },
  ];
  const valueAct = chooseBotAction(table, 'bot1', () => 0.5);
  assert.equal(valueAct.type, 'raise');

  // Now test pure air facing a big river bet: bot checks, human bets 200 into 40 pot
  bot.holeCards = [
    { suit: 'clubs', rank: 4 },
    { suit: 'diamonds', rank: 3 },
  ];
  applyPlayerAction(table, 'bot1', { type: 'check' }, 1350);
  applyPlayerAction(table, 'human', { type: 'raise', amount: 200 }, 1400);
  const foldAct = chooseBotAction(table, 'bot1', () => 0.5);
  assert.equal(foldAct.type, 'fold');
});
