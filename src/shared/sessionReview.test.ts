import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionReviewSummary } from './sessionReview';
import type { DecisionVerdict, HandReviewReport } from './types';

function makeMockReport(overrides: {
  handNumber: number;
  netChips: number;
  bigBlind?: number;
  pot?: number;
  outcome?: 'win' | 'loss' | 'split';
  wonByFold?: boolean;
  canonicalHand?: string;
  heroPosition?: string;
  verdicts?: Array<{ street: 'preflop' | 'flop' | 'turn' | 'river'; verdict: DecisionVerdict }>;
  teachingTopic?: string;
  teachingTitle?: string;
}): HandReviewReport {
  const bb = overrides.bigBlind ?? 20;
  const netBB = Math.round((overrides.netChips / bb) * 10) / 10;
  const outcome =
    overrides.outcome ?? (overrides.netChips > 0 ? 'win' : overrides.netChips < 0 ? 'loss' : 'split');
  const verdicts = overrides.verdicts ?? [];

  const streetsMap = new Map<
    'preflop' | 'flop' | 'turn' | 'river',
    HandReviewReport['streets'][number]
  >();
  for (const [idx, v] of verdicts.entries()) {
    let sec = streetsMap.get(v.street);
    if (!sec) {
      sec = {
        street: v.street,
        streetLabel: v.street,
        boardCards: [],
        boardSummary: '',
        potStart: 0,
        potEnd: overrides.pot ?? 60,
        events: [],
        heroDecisions: [],
      };
      streetsMap.set(v.street, sec);
    }
    sec.heroDecisions.push({
      step: idx + 1,
      street: v.street,
      actualActionType: 'call',
      actualActionLabel: '跟注 20',
      recommendedAction: 'fold',
      recommendedLabel: '弃牌止损',
      verdict: v.verdict,
      verdictLabel: v.verdict,
      evidence: {
        potBefore: 40,
        toCall: 20,
        potOddsPct: 33,
        mdfPct: 67,
        estimatedEquityPct: 40,
        preflopMix: null,
        betToPotPct: 50,
        spr: 10,
      },
      analysis: 'test',
      suggestion: 'test',
    });
  }

  return {
    handNumber: overrides.handNumber,
    timestamp: 1700000000000 + overrides.handNumber * 1000,
    smallBlind: bb / 2,
    bigBlind: bb,
    pot: overrides.pot ?? 60,
    outcome,
    wonByFold: Boolean(overrides.wonByFold),
    netChips: overrides.netChips,
    netBB,
    heroId: 'hero-1',
    heroName: '测试牌手',
    heroPosition: overrides.heroPosition ?? 'BTN',
    heroHoleCards: null,
    canonicalHand: overrides.canonicalHand ?? 'AKs',
    heroFinalHandName: outcome === 'win' ? '顶对' : null,
    communityCards: [],
    showdownOpponents: [],
    headline: `第 ${overrides.handNumber} 局总结`,
    overallSummary: '测试总结',
    streets: [...streetsMap.values()],
    strengthsFound: [],
    lessonsLearned: [],
    teaching: {
      topic: overrides.teachingTitle ?? overrides.teachingTopic ?? '翻前起手牌纪律',
      principle: '原则',
      formulaOrRule: '公式',
      nextHandDrill: '收紧前位边缘牌入池范围',
    },
  };
}

test('buildSessionReviewSummary computes cumulative P&L series and session accuracy accurately', () => {
  const reports = [
    makeMockReport({
      handNumber: 1,
      netChips: 80,
      pot: 140,
      wonByFold: true,
      verdicts: [{ street: 'preflop', verdict: 'optimal' }],
    }),
    makeMockReport({
      handNumber: 2,
      netChips: -120,
      pot: 260,
      verdicts: [
        { street: 'preflop', verdict: 'acceptable' },
        { street: 'flop', verdict: 'mistake' },
      ],
    }),
    makeMockReport({
      handNumber: 3,
      netChips: 200,
      pot: 420,
      verdicts: [{ street: 'turn', verdict: 'optimal' }],
    }),
  ];

  const summary = buildSessionReviewSummary({
    reports,
    bookmarkedHandNumbers: [],
    vpipPct: 33,
    pfrPct: 22,
  });

  assert.equal(summary.totalHands, 3);
  assert.equal(summary.handsWon, 2);
  assert.equal(summary.winRatePct, 67);
  assert.equal(summary.netChips, 160);
  assert.equal(summary.netBB, 8);
  assert.equal(summary.biggestPot, 420);
  assert.equal(summary.totalDecisions, 4);
  assert.equal(summary.optimalDecisions, 2);
  assert.equal(summary.acceptableDecisions, 1);
  assert.equal(summary.mistakeDecisions, 1);
  assert.equal(summary.decisionAccuracyPct, 75);
  assert.deepEqual(
    summary.pnlSeries.map((p) => p.cumulativeChips),
    [80, -40, 160]
  );
  assert.deepEqual(
    summary.pnlSeries.map((p) => p.cumulativeBB),
    [4, -2, 8]
  );
});

test('buildSessionReviewSummary promotes bookmarked hands first and deduplicates curated turning points', () => {
  const reports = [
    makeMockReport({ handNumber: 1, netChips: -20, pot: 40, verdicts: [{ street: 'preflop', verdict: 'acceptable' }] }),
    makeMockReport({ handNumber: 2, netChips: 40, pot: 80, verdicts: [{ street: 'preflop', verdict: 'optimal' }] }),
    makeMockReport({
      handNumber: 3,
      netChips: -180,
      pot: 380,
      verdicts: [
        { street: 'flop', verdict: 'mistake' },
        { street: 'turn', verdict: 'mistake' },
      ],
    }),
    makeMockReport({ handNumber: 4, netChips: 260, pot: 520, verdicts: [{ street: 'river', verdict: 'optimal' }] }),
    makeMockReport({ handNumber: 5, netChips: 10, pot: 30, verdicts: [{ street: 'preflop', verdict: 'optimal' }] }),
  ];

  const summary = buildSessionReviewSummary({
    reports,
    bookmarkedHandNumbers: [2, 5],
  });

  // Bookmarked hands (5, 2) must appear first (newest bookmarked first), with no duplicates
  assert.equal(summary.bookmarkedCount, 2);
  assert.equal(summary.keyHands[0].handNumber, 5);
  assert.equal(summary.keyHands[0].isBookmarked, true);
  assert.ok(summary.keyHands[0].reasons.includes('bookmarked'));
  assert.equal(summary.keyHands[1].handNumber, 2);
  assert.equal(summary.keyHands[1].isBookmarked, true);

  // Hand #3 should be curated as biggest_mistake + biggest_loss (merged into one card)
  const hand3 = summary.keyHands.find((h) => h.handNumber === 3);
  assert.ok(hand3);
  assert.ok(hand3.reasons.includes('biggest_mistake'));
  assert.ok(hand3.reasons.includes('biggest_loss'));

  // Hand #4 should be curated as biggest_pot + biggest_win
  const hand4 = summary.keyHands.find((h) => h.handNumber === 4);
  assert.ok(hand4);
  assert.ok(hand4.reasons.includes('biggest_pot'));
  assert.ok(hand4.reasons.includes('biggest_win'));

  // No duplicate handNumbers in keyHands
  const uniqueKeyNumbers = new Set(summary.keyHands.map((h) => h.handNumber));
  assert.equal(uniqueKeyNumbers.size, summary.keyHands.length);
  assert.equal(summary.defaultSelectedHandNumber, 5);
});

test('buildSessionReviewSummary detects repeated street mistakes and handles empty input gracefully', () => {
  const empty = buildSessionReviewSummary({ reports: [] });
  assert.equal(empty.totalHands, 0);
  assert.equal(empty.defaultSelectedHandNumber, null);
  assert.equal(empty.decisionAccuracyPct, null);

  const repeated = buildSessionReviewSummary({
    reports: [
      makeMockReport({
        handNumber: 1,
        netChips: -40,
        verdicts: [{ street: 'preflop', verdict: 'mistake' }],
        teachingTopic: 'preflop_position',
        teachingTitle: '翻前位置纪律',
      }),
      makeMockReport({
        handNumber: 2,
        netChips: -60,
        verdicts: [{ street: 'preflop', verdict: 'mistake' }],
        teachingTopic: 'preflop_position',
        teachingTitle: '翻前位置纪律',
      }),
    ],
  });

  assert.ok(repeated.sessionLeaks.some((l) => l.includes('翻前累计出现 2 次关键失误')));
  assert.ok(repeated.sessionLeaks.some((l) => l.includes('翻前位置纪律')));
});
