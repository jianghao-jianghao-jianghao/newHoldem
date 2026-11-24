import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeHeroBlockers,
  buildCanonical169Matrix,
  buildGtoSpotWorkbench,
  classifyEvLossGrade,
  computeBayesianPosterior,
  computeGeometricBetSizing,
  createFallbackPreflopDecision,
  inferRecommendedNodeLockPreset,
  normalizeMixTo100,
} from './gtoWorkbench';
import type { HandReviewHeroDecision, HandReviewReport } from './types';

function makeMockReport(): HandReviewReport {
  const decision: HandReviewHeroDecision = {
    step: 6,
    street: 'flop',
    actualActionType: 'raise',
    actualActionLabel: '下注 60',
    recommendedAction: 'raise',
    recommendedLabel: '持续下注 33% 池',
    verdict: 'inaccuracy',
    verdictLabel: '轻微偏差',
    evidence: {
      potBefore: 160,
      toCall: 0,
      potOddsPct: 0,
      mdfPct: 100,
      estimatedEquityPct: 62,
      preflopMix: null,
      betToPotPct: 38,
      spr: 4.5,
    },
    analysis: '翻牌面结构有利于主动加注方，小尺度持续下注可以高频施压。',
    suggestion: '保持 33% 池小尺度高频施压，保留大尺度给坚果极化分支。',
  };

  return {
    handNumber: 12,
    timestamp: Date.now(),
    outcome: 'win',
    wonByFold: true,
    netChips: 160,
    netBB: 8,
    pot: 220,
    smallBlind: 10,
    bigBlind: 20,
    heroId: 'hero-1',
    heroName: 'Hero',
    heroPosition: 'BTN',
    heroHoleCards: [
      { suit: 'spades', rank: 14 },
      { suit: 'hearts', rank: 12 },
    ],
    canonicalHand: 'AQo',
    heroFinalHandName: '高牌 A',
    communityCards: [
      { suit: 'spades', rank: 13 },
      { suit: 'spades', rank: 8 },
      { suit: 'diamonds', rank: 3 },
    ],
    showdownOpponents: [],
    headline: 'BTN 位利用坚果同花阻断持续施压逼弃对手',
    overallSummary: '整体翻后结构优势明显。',
    streets: [
      {
        street: 'flop',
        streetLabel: '翻牌圈',
        boardCards: [
          { suit: 'spades', rank: 13 },
          { suit: 'spades', rank: 8 },
          { suit: 'diamonds', rank: 3 },
        ],
        boardSummary: 'K♠ 8♠ 3♦',
        potStart: 160,
        potEnd: 220,
        events: [],
        heroDecisions: [decision],
      },
    ],
    strengthsFound: ['持续施压'],
    lessonsLearned: ['注意尺度'],
    teaching: {
      topic: '范围优势与小尺度 C-Bet',
      principle: '高张干燥面主动方拥有明显范围优势。',
      formulaOrRule: 'MDF = P / (P + B)',
      nextHandDrill: '继续留意坚果花色阻断牌。',
    },
  };
}

test('classifyEvLossGrade follows 5-tier GTO Wizard thresholds accurately', () => {
  assert.equal(classifyEvLossGrade(0.03, 10).grade, 'best');
  assert.equal(classifyEvLossGrade(0.05, 20).grade, 'best');
  assert.equal(classifyEvLossGrade(0.15, 10).grade, 'good'); // 1.5% pot
  assert.equal(classifyEvLossGrade(0.4, 10).grade, 'inaccuracy'); // 4.0% pot
  assert.equal(classifyEvLossGrade(0.9, 10).grade, 'mistake'); // 9.0% pot
  assert.equal(classifyEvLossGrade(1.8, 10).grade, 'blunder'); // 18.0% pot
});

test('computeGeometricBetSizing matches (1 + 2f)^k = 1 + 2*SPR exact identity', () => {
  // For SPR = 4 and k = 2 streets: (1 + 2f)^2 = 9 => 1 + 2f = 3 => f = 1.0 (100% pot)
  const twoStreets = computeGeometricBetSizing(4, 2);
  assert.equal(twoStreets.betPotPct, 100);
  assert.equal(twoStreets.streetsRemaining, 2);

  // For SPR = 13 and k = 3 streets: (1 + 2f)^3 = 27 => 1 + 2f = 3 => f = 1.0 (100% pot)
  const threeStreets = computeGeometricBetSizing(13, 3);
  assert.equal(threeStreets.betPotPct, 100);

  // Single street SPR = 0.75 => f = 75% pot
  const river = computeGeometricBetSizing(0.75, 1);
  assert.equal(river.betPotPct, 75);
});

test('computeBayesianPosterior shrinks small samples toward GTO prior and grows monotonically with n', () => {
  const smallSample = computeBayesianPosterior(42, 70, 4, 16);
  const mediumSample = computeBayesianPosterior(42, 70, 16, 16);
  const largeSample = computeBayesianPosterior(42, 70, 64, 16);

  // Small sample must stay close to prior (42%) rather than trusting 70% blindly
  assert.ok(smallSample.posteriorPct < 50);
  assert.equal(mediumSample.confidenceWeight, 0.5);
  assert.equal(mediumSample.posteriorPct, 56);
  assert.ok(largeSample.posteriorPct > mediumSample.posteriorPct);
  assert.ok(largeSample.confidenceWeight > mediumSample.confidenceWeight);
});

test('analyzeHeroBlockers detects nut flush blocker and top-rank blocker accurately', () => {
  const blockers = analyzeHeroBlockers(
    [
      { suit: 'spades', rank: 14 },
      { suit: 'hearts', rank: 13 },
    ],
    [
      { suit: 'spades', rank: 13 },
      { suit: 'spades', rank: 9 },
      { suit: 'spades', rank: 4 },
    ],
    'flop'
  );

  assert.ok(blockers.some((b) => b.id === 'nut-flush-blocker' && b.impact === 'positive'));
  assert.ok(blockers.some((b) => b.id === 'top-pair-set-blocker' && b.impact === 'positive'));
});

test('buildCanonical169Matrix generates 169 valid cells with 100% probability conservation and directional Node-Lock shifts', () => {
  const gtoCells = buildCanonical169Matrix({
    street: 'flop',
    heroPosition: 'BTN',
    heroCanonicalHand: 'AQo',
    facingBet: false,
    potBB: 8,
    potOddsPct: 0,
    rangeAdvantagePct: 6,
    visibleBoard: [
      { suit: 'spades', rank: 13 },
      { suit: 'spades', rank: 8 },
      { suit: 'diamonds', rank: 3 },
    ],
  });

  assert.equal(gtoCells.length, 169);
  for (const cell of gtoCells) {
    const sum = cell.mix.raise + cell.mix.call + cell.mix.check + cell.mix.fold;
    assert.equal(sum, 100, `Mix for ${cell.hand} must sum to 100, got ${sum}`);
  }
  const heroCell = gtoCells.find((c) => c.isHeroHand);
  assert.equal(heroCell?.hand, 'AQo');

  // Node-Lock Over-Fold must increase average bet/raise frequency across range
  const overFoldCells = buildCanonical169Matrix({
    street: 'flop',
    heroPosition: 'BTN',
    heroCanonicalHand: 'AQo',
    facingBet: false,
    potBB: 8,
    potOddsPct: 0,
    rangeAdvantagePct: 6,
    visibleBoard: [
      { suit: 'spades', rank: 13 },
      { suit: 'spades', rank: 8 },
      { suit: 'diamonds', rank: 3 },
    ],
    nodeLockShift: {
      presetId: 'over_fold',
      confidenceWeight: 0.7,
      deviationIntensity: 0.85,
    },
  });

  const avgGtoRaise = gtoCells.reduce((s, c) => s + c.mix.raise, 0) / 169;
  const avgOverFoldRaise = overFoldCells.reduce((s, c) => s + c.mix.raise, 0) / 169;
  assert.ok(
    avgOverFoldRaise > avgGtoRaise,
    `Over-Fold Node-Lock should increase aggression (${avgOverFoldRaise} vs ${avgGtoRaise})`
  );

  // Calling Station must reduce pure-bluff aggression on weak hands (e.g. 72o)
  const stationCells = buildCanonical169Matrix({
    street: 'flop',
    heroPosition: 'BTN',
    heroCanonicalHand: 'AQo',
    facingBet: false,
    potBB: 8,
    potOddsPct: 0,
    rangeAdvantagePct: 6,
    visibleBoard: [
      { suit: 'spades', rank: 13 },
      { suit: 'spades', rank: 8 },
      { suit: 'diamonds', rank: 3 },
    ],
    nodeLockShift: {
      presetId: 'calling_station',
      confidenceWeight: 0.8,
      deviationIntensity: 0.9,
    },
  });

  const weakGto = gtoCells.find((c) => c.hand === '72o')!;
  const weakStation = stationCells.find((c) => c.hand === '72o')!;
  assert.ok(weakStation.mix.raise <= weakGto.mix.raise);
});

test('inferRecommendedNodeLockPreset maps opponent room stats cleanly', () => {
  const overFoldRead = inferRecommendedNodeLockPreset({
    heroTableImage: null,
    exploitativeNotes: [],
    opponentReads: [
      {
        playerId: 'bot-1',
        playerName: '谨慎对手',
        handsObserved: 20,
        archetypeLabel: '紧弱',
        vpipPct: 22,
        pfrPct: 16,
        foldToBetPct: 68,
        aggressionFactor: 1.4,
        exploitativeAdvice: '高频持续下注',
      },
    ],
  });
  assert.equal(overFoldRead.presetId, 'over_fold');
  assert.equal(overFoldRead.targetOpponent?.playerName, '谨慎对手');

  const stationRead = inferRecommendedNodeLockPreset({
    heroTableImage: null,
    exploitativeNotes: [],
    opponentReads: [
      {
        playerId: 'bot-2',
        playerName: '爱跟注',
        handsObserved: 18,
        archetypeLabel: '松被动',
        vpipPct: 52,
        pfrPct: 12,
        foldToBetPct: 24,
        aggressionFactor: 0.8,
        exploitativeAdvice: '减少纯诈唬',
      },
    ],
  });
  assert.equal(stationRead.presetId, 'calling_station');
});

test('buildGtoSpotWorkbench builds complete GTO + Exploit payload and respects backendOverride', () => {
  const report = makeMockReport();
  const decision = report.streets[0].heroDecisions[0];
  const wb = buildGtoSpotWorkbench({ report, decision, nodeLockPreset: 'over_fold' });

  assert.equal(wb.gtoMatrix.length, 169);
  assert.equal(wb.exploit?.exploitMatrix.length, 169);
  assert.equal(wb.heroCanonicalHand, 'AQo');
  assert.ok(wb.blockers.some((b) => b.id === 'nut-flush-blocker'));
  assert.ok((wb.exploit?.evGainBB ?? 0) > 0);

  // Passthrough verification for Claude's future backend
  const fakeBackend = { ...wb, source: 'texassolver' as const };
  const overridden = buildGtoSpotWorkbench({
    report,
    decision,
    backendOverride: fakeBackend,
  });
  assert.equal(overridden.source, 'texassolver');
});

test('normalizeMixTo100 always sums to exactly 100', () => {
  const m = normalizeMixTo100({ raise: 33.33, call: 33.33, check: 0, fold: 33.33 });
  assert.equal(m.raise + m.call + m.check + m.fold, 100);
});

test('createFallbackPreflopDecision synthesizes valid preflop workbench for quick-fold hands', () => {
  const report = makeMockReport();
  const fallback = createFallbackPreflopDecision({ ...report, streets: [], outcome: 'loss' });
  const wb = buildGtoSpotWorkbench({ report, decision: fallback.decision });
  assert.equal(wb.gtoMatrix.length, 169);
  assert.equal(wb.street, 'preflop');
  assert.ok(wb.exploit && wb.exploit.exploitMatrix.length === 169);
});
