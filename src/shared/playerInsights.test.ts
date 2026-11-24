import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlayerPersonaReport,
  createEmptyBehaviorStats,
  createEmptyPatternCounts,
  extractHandBehaviorDeltas,
  mergeBehaviorStats,
  sanitizeBehaviorStats,
} from './playerInsights';
import type { HandReplayRecord } from './types';

function makeSampleHandRecord(overrides?: Partial<HandReplayRecord>): HandReplayRecord {
  return {
    handNumber: 1,
    timestamp: 1700000000000,
    pot: 160,
    smallBlind: 10,
    bigBlind: 20,
    dealerSeatIndex: 0,
    smallBlindSeatIndex: 0,
    bigBlindSeatIndex: 1,
    communityCards: [
      { suit: 'spades', rank: 14 },
      { suit: 'hearts', rank: 9 },
      { suit: 'clubs', rank: 4 },
      { suit: 'diamonds', rank: 2 },
      { suit: 'spades', rank: 7 },
    ],
    players: [
      {
        id: 'hero',
        name: 'Hero',
        seatIndex: 0,
        holeCards: [
          { suit: 'spades', rank: 13 },
          { suit: 'hearts', rank: 14 },
        ],
        revealed: true,
        folded: false,
        allIn: false,
        chipsAfter: 2080,
        netChange: 80,
      },
      {
        id: 'villain',
        name: 'Villain',
        seatIndex: 1,
        holeCards: [
          { suit: 'clubs', rank: 9 },
          { suit: 'diamonds', rank: 10 },
        ],
        revealed: true,
        folded: false,
        allIn: false,
        chipsAfter: 1920,
        netChange: -80,
      },
    ],
    actions: [],
    potTimeline: [
      {
        step: 1,
        timestamp: 1700000000001,
        street: 'preflop',
        actorId: 'hero',
        actorName: 'Hero',
        actionType: 'blind',
        actionLabel: '小盲 10',
        amountAdded: 10,
        potAfter: 10,
      },
      {
        step: 2,
        timestamp: 1700000000002,
        street: 'preflop',
        actorId: 'villain',
        actorName: 'Villain',
        actionType: 'blind',
        actionLabel: '大盲 20',
        amountAdded: 20,
        potAfter: 30,
      },
      {
        step: 3,
        timestamp: 1700000000003,
        street: 'preflop',
        actorId: 'hero',
        actorName: 'Hero',
        actionType: 'raise',
        actionLabel: '加注至 50',
        amountAdded: 40,
        potAfter: 70,
      },
      {
        step: 4,
        timestamp: 1700000000004,
        street: 'preflop',
        actorId: 'villain',
        actorName: 'Villain',
        actionType: 'call',
        actionLabel: '跟注 30',
        amountAdded: 30,
        potAfter: 100,
      },
      {
        step: 5,
        timestamp: 1700000000005,
        street: 'flop',
        actorId: 'villain',
        actorName: 'Villain',
        actionType: 'check',
        actionLabel: '过牌',
        amountAdded: 0,
        potAfter: 100,
      },
      {
        step: 6,
        timestamp: 1700000000006,
        street: 'flop',
        actorId: 'hero',
        actorName: 'Hero',
        actionType: 'bet',
        actionLabel: '下注 30',
        amountAdded: 30,
        potAfter: 130,
      },
      {
        step: 7,
        timestamp: 1700000000007,
        street: 'flop',
        actorId: 'villain',
        actorName: 'Villain',
        actionType: 'call',
        actionLabel: '跟注 30',
        amountAdded: 30,
        potAfter: 160,
      },
    ],
    winners: [
      {
        playerId: 'hero',
        playerName: 'Hero',
        amount: 160,
        netChange: 80,
        handName: '一对',
        bestCards: [],
      },
    ],
    ...overrides,
  };
}

test('extractHandBehaviorDeltas accurately extracts VPIP, PFR, C-Bet, WTSD, W$SD, and netBB', () => {
  const record = makeSampleHandRecord();
  const deltas = extractHandBehaviorDeltas(record);

  assert.ok(deltas.hero);
  assert.equal(deltas.hero.handsPlayed, 1);
  assert.equal(deltas.hero.vpipHands, 1);
  assert.equal(deltas.hero.pfrHands, 1);
  assert.equal(deltas.hero.limpHands, 0);
  assert.equal(deltas.hero.sawFlopHands, 1);
  assert.equal(deltas.hero.cbetOpps, 1);
  assert.equal(deltas.hero.cbetCount, 1);
  assert.equal(deltas.hero.wtsdHands, 1);
  assert.equal(deltas.hero.wonAtShowdownHands, 1);
  assert.equal(deltas.hero.totalNetBB, 4);

  assert.ok(deltas.villain);
  assert.equal(deltas.villain.vpipHands, 1);
  assert.equal(deltas.villain.pfrHands, 0);
  assert.equal(deltas.villain.postflopCalls, 1);
  assert.equal(deltas.villain.wtsdHands, 1);
  assert.equal(deltas.villain.wonAtShowdownHands, 0);
  assert.equal(deltas.villain.totalNetBB, -4);
});

test('mergeBehaviorStats aggregates review verdicts, exposed session patterns, and caps recentSnapshots', () => {
  let stats = createEmptyBehaviorStats();
  for (let i = 1; i <= 15; i++) {
    const counts = createEmptyPatternCounts();
    counts.calling_station = i % 2 === 0 ? 1 : 0;
    stats = mergeBehaviorStats(stats, {
      handsPlayed: 1,
      vpipHands: 1,
      pfrHands: i % 3 === 0 ? 1 : 0,
      reviewOptimalDecisions: 2,
      reviewMistakes: 1,
      patternExposureCounts: counts,
      recentSnapshots: [
        {
          handNumber: i,
          timestamp: 1000 + i,
          netBB: i % 2 === 0 ? 3 : -2,
          detectedPattern: i % 2 === 0 ? 'calling_station' : 'balanced',
          optimalCount: 2,
          mistakeCount: 1,
        },
      ],
    });
  }

  assert.equal(stats.handsPlayed, 15);
  assert.equal(stats.reviewOptimalDecisions, 30);
  assert.equal(stats.reviewMistakes, 15);
  assert.equal(stats.patternExposureCounts.calling_station, 7);
  assert.ok(stats.recentSnapshots.length <= 12);
  assert.equal(stats.recentSnapshots[stats.recentSnapshots.length - 1].handNumber, 15);

  const sanitized = sanitizeBehaviorStats(stats);
  assert.equal(sanitized.handsPlayed, 15);
  assert.equal(sanitized.patternExposureCounts.calling_station, 7);
});

test('buildPlayerPersonaReport classifies TAG, Calling Station, Nit, and empty newcomer with linked diagnostics', () => {
  const emptyReport = buildPlayerPersonaReport(null);
  assert.equal(emptyReport.archetype.id, 'newcomer');
  assert.equal(emptyReport.maturity, 'empty');
  assert.equal(emptyReport.handsPlayed, 0);
  assert.equal(emptyReport.strengths.length, 0);

  // TAG profile
  const tagCounts = createEmptyPatternCounts();
  tagCounts.balanced = 12;
  tagCounts.cbet_spammer = 3;
  const tagStats = mergeBehaviorStats(createEmptyBehaviorStats(), {
    handsPlayed: 45,
    vpipHands: 11, // 24%
    pfrHands: 9, // 20%
    limpHands: 1,
    threeBetOpps: 10,
    threeBetCount: 1,
    foldToBetOpps: 16,
    foldToBetCount: 8,
    sawFlopHands: 14,
    cbetOpps: 9,
    cbetCount: 6,
    postflopBetsRaises: 14,
    postflopCalls: 6,
    wtsdHands: 5,
    wonAtShowdownHands: 3,
    earlyPosHands: 15,
    earlyPosVpip: 2,
    latePosHands: 15,
    latePosVpip: 6,
    totalNetBB: 32,
    reviewOptimalDecisions: 28,
    reviewAcceptableDecisions: 10,
    reviewInaccuracies: 4,
    reviewMistakes: 2,
    patternExposureCounts: tagCounts,
  });
  const tagReport = buildPlayerPersonaReport(tagStats);
  assert.equal(tagReport.archetype.id, 'tag');
  assert.equal(tagReport.maturity, 'solid');
  assert.ok(tagReport.reviewAccuracyPct !== null && tagReport.reviewAccuracyPct >= 75);
  assert.ok(tagReport.exposedPatterns.some((e) => e.pattern === 'cbet_spammer'));

  // Calling Station profile
  const stationCounts = createEmptyPatternCounts();
  stationCounts.calling_station = 8;
  const stationStats = mergeBehaviorStats(createEmptyBehaviorStats(), {
    handsPlayed: 30,
    vpipHands: 19, // 63%
    pfrHands: 3, // 10%
    limpHands: 11,
    foldToBetOpps: 20,
    foldToBetCount: 4, // 20% fold to bet
    sawFlopHands: 18,
    postflopBetsRaises: 3,
    postflopCalls: 22,
    wtsdHands: 12,
    wonAtShowdownHands: 4,
    totalNetBB: -48,
    reviewOptimalDecisions: 6,
    reviewMistakes: 10,
    patternExposureCounts: stationCounts,
  });
  const stationReport = buildPlayerPersonaReport(stationStats);
  assert.equal(stationReport.archetype.id, 'calling_station');
  assert.ok(stationReport.badHabits.length > 0);
  assert.ok(stationReport.exposedPatterns[0]?.pattern === 'calling_station');

  // Nit profile
  const nitStats = mergeBehaviorStats(createEmptyBehaviorStats(), {
    handsPlayed: 32,
    vpipHands: 4, // 12.5%
    pfrHands: 3,
    foldToBetOpps: 15,
    foldToBetCount: 12, // 80%
    sawFlopHands: 5,
    postflopBetsRaises: 4,
    postflopCalls: 2,
    totalNetBB: -5,
  });
  const nitReport = buildPlayerPersonaReport(nitStats);
  assert.equal(nitReport.archetype.id, 'nit');

  // Verify Agg% and 6-axis radar profiles distinguish archetypes cleanly
  assert.equal(tagReport.metrics.aggPct, 70); // 14 / (14 + 6)
  assert.equal(stationReport.metrics.aggPct, 12); // 3 / (3 + 22)
  assert.equal(tagReport.radarAxes.length, 6);
  assert.equal(emptyReport.radarAxes.length, 6);
  assert.ok(emptyReport.radarAxes.every((ax) => ax.score === 0));

  const tagAggAxis = tagReport.radarAxes.find((a) => a.key === 'aggPct')!;
  const stationAggAxis = stationReport.radarAxes.find((a) => a.key === 'aggPct')!;
  const stationVpipAxis = stationReport.radarAxes.find((a) => a.key === 'vpip')!;
  const nitVpipAxis = nitReport.radarAxes.find((a) => a.key === 'vpip')!;
  const tagDiscAxis = tagReport.radarAxes.find((a) => a.key === 'discipline')!;
  const stationDiscAxis = stationReport.radarAxes.find((a) => a.key === 'discipline')!;

  assert.ok(tagAggAxis.score > stationAggAxis.score + 40);
  assert.ok(stationVpipAxis.score > nitVpipAxis.score + 40);
  assert.ok(tagDiscAxis.score > stationDiscAxis.score + 20);
  assert.ok(
    tagReport.radarAxes.every((ax) => ax.score >= 0 && ax.score <= 100 && ax.benchmark > 0)
  );
});

