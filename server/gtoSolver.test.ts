import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateConcreteStrategyTo169,
  auditSessionGtoLeaks,
  buildTexasSolverScript,
  canonicalizeSuitIsomorphism,
  LruSolverCache,
  solveGtoSpotServer,
  solveNodeLockServer,
  validateSpotRequest,
} from './gtoSolver';
import { SessionOpponentProfiler } from './opponentProfiler';
import { generateHandReview } from './handReview';
import {
  addPlayerToTable,
  applyPlayerAction,
  createTableState,
  startNewHand,
} from '../src/shared/pokerEngine';
import type { Card } from '../src/shared/types';

test('canonicalizeSuitIsomorphism maps isomorphic boards (AsKs7d vs AhKh7c) to identical canonical keys', () => {
  const boardA: Card[] = [
    { suit: 'spades', rank: 14 },
    { suit: 'spades', rank: 13 },
    { suit: 'diamonds', rank: 7 },
  ];
  const holeA: Card[] = [
    { suit: 'spades', rank: 12 },
    { suit: 'diamonds', rank: 11 },
  ];

  const boardB: Card[] = [
    { suit: 'hearts', rank: 14 },
    { suit: 'hearts', rank: 13 },
    { suit: 'clubs', rank: 7 },
  ];
  const holeB: Card[] = [
    { suit: 'hearts', rank: 12 },
    { suit: 'clubs', rank: 11 },
  ];

  const isoA = canonicalizeSuitIsomorphism(boardA, holeA);
  const isoB = canonicalizeSuitIsomorphism(boardB, holeB);

  assert.equal(isoA.canonicalBoardKey, 'AsKs7h');
  assert.equal(isoB.canonicalBoardKey, 'AsKs7h');
  assert.deepEqual(isoA.canonicalBoard, isoB.canonicalBoard);
  assert.deepEqual(isoA.canonicalHoleCards, isoB.canonicalHoleCards);
});

test('validateSpotRequest rejects duplicate cards and insufficient community cards', () => {
  const dup = validateSpotRequest({
    handNumber: 1,
    decisionStep: 1,
    street: 'flop',
    heroPosition: 'BTN',
    heroHoleCards: [
      { suit: 'spades', rank: 14 },
      { suit: 'hearts', rank: 13 },
    ],
    communityCards: [
      { suit: 'spades', rank: 14 },
      { suit: 'diamonds', rank: 7 },
      { suit: 'clubs', rank: 2 },
    ],
    potBeforeChips: 100,
    toCallChips: 0,
    effectiveStackChips: 1000,
    bigBlind: 20,
    heroActualAction: 'check',
    heroActualLabel: '过牌',
  });
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.equal(dup.code, 'INVALID_SPOT_STATE');

  const shortBoard = validateSpotRequest({
    handNumber: 1,
    decisionStep: 1,
    street: 'turn',
    heroPosition: 'BTN',
    heroHoleCards: [
      { suit: 'spades', rank: 14 },
      { suit: 'hearts', rank: 13 },
    ],
    communityCards: [
      { suit: 'clubs', rank: 10 },
      { suit: 'diamonds', rank: 7 },
      { suit: 'hearts', rank: 2 },
    ],
    potBeforeChips: 100,
    toCallChips: 0,
    effectiveStackChips: 1000,
    bigBlind: 20,
    heroActualAction: 'check',
    heroActualLabel: '过牌',
  });
  assert.equal(shortBoard.ok, false);
});

test('solveGtoSpotServer produces consistent suit-isomorphic results, 169 normalized cells, and LRU cache hits', async () => {
  const cache = new LruSolverCache<any>(32);

  const reqA = {
    handNumber: 7,
    decisionStep: 3,
    street: 'flop' as const,
    heroPosition: 'BTN',
    heroHoleCards: [
      { suit: 'spades' as const, rank: 14 },
      { suit: 'hearts' as const, rank: 12 },
    ],
    communityCards: [
      { suit: 'spades' as const, rank: 13 },
      { suit: 'spades' as const, rank: 8 },
      { suit: 'diamonds' as const, rank: 3 },
    ],
    potBeforeChips: 180,
    toCallChips: 0,
    effectiveStackChips: 720,
    bigBlind: 20,
    heroActualAction: 'raise' as const,
    heroActualLabel: '下注 60',
  };

  const reqB = {
    ...reqA,
    handNumber: 8,
    heroHoleCards: [
      { suit: 'hearts' as const, rank: 14 },
      { suit: 'diamonds' as const, rank: 12 },
    ],
    communityCards: [
      { suit: 'hearts' as const, rank: 13 },
      { suit: 'hearts' as const, rank: 8 },
      { suit: 'clubs' as const, rank: 3 },
    ],
  };

  const resA = await solveGtoSpotServer(reqA, { cache });
  assert.equal(resA.ok, true);
  if (!resA.ok) return;
  assert.equal(resA.data.gtoMatrix.length, 169);
  assert.equal(resA.data.solverMeta.cacheHit, false);

  for (const cell of resA.data.gtoMatrix) {
    const sum = cell.mix.raise + cell.mix.call + cell.mix.check + cell.mix.fold;
    assert.equal(sum, 100, `Expected cell ${cell.hand} mix to sum to 100, got ${sum}`);
  }

  // Suit-isomorphic query hits the exact same canonical cache entry
  const resB = await solveGtoSpotServer(reqB, { cache });
  assert.equal(resB.ok, true);
  if (!resB.ok) return;
  assert.equal(resB.data.solverMeta.cacheHit, true);
  assert.equal(Math.abs(resA.data.evLossBB - resB.data.evLossBB) < 0.01, true);
});

test('solveNodeLockServer applies Bayesian Dirichlet-Beta shrinkage and RNR safety margin accurately', async () => {
  const spotRequest = {
    handNumber: 10,
    decisionStep: 4,
    street: 'flop' as const,
    heroPosition: 'BTN',
    heroHoleCards: [
      { suit: 'spades' as const, rank: 14 },
      { suit: 'hearts' as const, rank: 12 },
    ],
    communityCards: [
      { suit: 'spades' as const, rank: 13 },
      { suit: 'diamonds' as const, rank: 8 },
      { suit: 'clubs' as const, rank: 3 },
    ],
    potBeforeChips: 160,
    toCallChips: 0,
    effectiveStackChips: 800,
    bigBlind: 20,
    heroActualAction: 'raise' as const,
    heroActualLabel: '下注 55',
  };

  const smallSample = await solveNodeLockServer({
    spotRequest,
    presetId: 'over_fold',
    targetPlayerName: '紧缩对手',
    observedDeviationPct: 26,
    sampleHands: 4,
    priorStrengthKappa: 16,
  });
  const largeSample = await solveNodeLockServer({
    spotRequest,
    presetId: 'over_fold',
    targetPlayerName: '紧缩对手',
    observedDeviationPct: 26,
    sampleHands: 40,
    priorStrengthKappa: 16,
  });

  assert.equal(smallSample.ok, true);
  assert.equal(largeSample.ok, true);
  assert.ok(smallSample.exploit && largeSample.exploit);
  assert.ok(
    largeSample.exploit!.bayesianRead.confidenceWeight >
      smallSample.exploit!.bayesianRead.confidenceWeight,
    'Larger sample should yield higher Bayesian confidence weight'
  );
  assert.ok(
    largeSample.exploit!.bayesianRead.posteriorPct > smallSample.exploit!.bayesianRead.posteriorPct,
    'Larger sample over-fold observation should pull posterior further from GTO prior'
  );
  assert.equal(largeSample.exploit!.exploitMatrix.length, 169);
});

test('buildTexasSolverScript sanitizes cards and aggregateConcreteStrategyTo169 normalizes frequencies', async () => {
  const script = buildTexasSolverScript({
    potBB: 12.5,
    effectiveStackBB: 87.5,
    canonicalBoard: [
      { suit: 'spades', rank: 14 },
      { suit: 'hearts', rank: 13 },
      { suit: 'diamonds', rank: 7 },
    ],
    geometricPct: 62,
    outputPath: '/tmp/out.json',
  });
  assert.ok(script && script.includes('set_board As,Kh,7d') && script.includes('set_dump_rounds 1'));

  const baseRes = await solveGtoSpotServer({
    handNumber: 1,
    decisionStep: 1,
    street: 'preflop',
    heroPosition: 'BTN',
    heroHoleCards: [
      { suit: 'spades', rank: 14 },
      { suit: 'hearts', rank: 14 },
    ],
    communityCards: [],
    potBeforeChips: 30,
    toCallChips: 0,
    effectiveStackChips: 2000,
    bigBlind: 20,
    heroActualAction: 'raise',
    heroActualLabel: '加注 50',
  });
  assert.equal(baseRes.ok, true);
  if (!baseRes.ok) return;

  const aggregated = aggregateConcreteStrategyTo169(
    baseRes.data.gtoMatrix,
    ['CHECK', 'BET 33', 'BET 75'],
    { AsAh: [0.2, 0.5, 0.3], AdAc: [0.1, 0.6, 0.3] }
  );
  const aa = aggregated.find((c) => c.hand === 'AA');
  assert.ok(aa);
  assert.equal(aa!.mix.raise + aa!.mix.check + aa!.mix.call + aa!.mix.fold, 100);
  assert.ok(aa!.mix.raise >= 80);
});

test('auditSessionGtoLeaks summarizes EV loss grades and street breakdown from hand reviews', () => {
  const profiler = new SessionOpponentProfiler();
  const table = createTableState('AUDIT_TEST', 10, 20, 2000);
  addPlayerToTable(table, { id: 'hero', name: 'Hero', chips: 2000 });
  addPlayerToTable(table, { id: 'bot1', name: '陈默', chips: 2000, isBot: true });
  startNewHand(table, () => 0.42, 1000);

  profiler.observeAction(table, 'hero', { type: 'raise', amount: 60 });
  applyPlayerAction(table, 'hero', { type: 'raise', amount: 60 }, 1010);
  profiler.observeAction(table, 'bot1', { type: 'call' });
  applyPlayerAction(table, 'bot1', { type: 'call' }, 1020);
  profiler.observeAction(table, 'bot1', { type: 'check' });
  applyPlayerAction(table, 'bot1', { type: 'check' }, 1030);
  profiler.observeAction(table, 'hero', { type: 'raise', amount: 60 });
  applyPlayerAction(table, 'hero', { type: 'raise', amount: 60 }, 1040);
  profiler.observeAction(table, 'bot1', { type: 'fold' });
  applyPlayerAction(table, 'bot1', { type: 'fold' }, 1050);
  profiler.observeHandEnd(table);

  assert.ok(table.handHistory.length >= 1);
  const report = generateHandReview({
    record: table.handHistory[0],
    heroId: 'hero',
    startingChips: 2000,
    profiler,
  });
  assert.ok(report);

  const audit = auditSessionGtoLeaks([report!]);
  assert.equal(audit.ok, true);
  assert.equal(audit.handsAudited, 1);
  assert.ok(audit.decisionsAudited >= 1);
  assert.ok(audit.totalEvLossBB >= 0);
});
