import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStreetPotTrend } from './potTrendUtils';
import type { PotTimelinePoint } from './types';

test('buildStreetPotTrend aggregates preflop, flop, turn, and river pot progression with checked plateaus', () => {
  const timeline: PotTimelinePoint[] = [
    {
      step: 1,
      street: 'preflop',
      actorId: 'p1',
      actorName: '林深',
      actionType: 'blind',
      actionLabel: '小盲 10',
      amountAdded: 10,
      potAfter: 10,
      timestamp: 1000,
    },
    {
      step: 2,
      street: 'preflop',
      actorId: 'p2',
      actorName: '陈默',
      actionType: 'blind',
      actionLabel: '大盲 20',
      amountAdded: 20,
      potAfter: 30,
      timestamp: 1001,
    },
    {
      step: 3,
      street: 'preflop',
      actorId: 'p1',
      actorName: '林深',
      actionType: 'raise',
      actionLabel: '加注至 60',
      amountAdded: 50,
      potAfter: 80,
      timestamp: 1002,
    },
    {
      step: 4,
      street: 'preflop',
      actorId: 'p2',
      actorName: '陈默',
      actionType: 'call',
      actionLabel: '跟注 40',
      amountAdded: 40,
      potAfter: 120,
      timestamp: 1003,
    },
    {
      step: 5,
      street: 'flop',
      actorId: 'p1',
      actorName: '林深',
      actionType: 'bet',
      actionLabel: '下注 80',
      amountAdded: 80,
      potAfter: 200,
      timestamp: 2000,
    },
    {
      step: 6,
      street: 'flop',
      actorId: 'p2',
      actorName: '陈默',
      actionType: 'call',
      actionLabel: '跟注 80',
      amountAdded: 80,
      potAfter: 280,
      timestamp: 2001,
    },
    // Turn was checked around (no pot timeline events in turn!)
    {
      step: 7,
      street: 'river',
      actorId: 'p1',
      actorName: '林深',
      actionType: 'allin',
      actionLabel: '全下 420',
      amountAdded: 420,
      potAfter: 700,
      timestamp: 4000,
    },
  ];

  const summary = buildStreetPotTrend({
    currentHandNumber: 3,
    currentPhase: 'river',
    currentPot: 700,
    currentCommunityCardCount: 5,
    currentPotTimeline: timeline,
    handHistory: [],
  });

  assert.equal(summary.handNumber, 3);
  assert.equal(summary.isLiveHand, true);
  assert.equal(summary.totalPot, 700);
  assert.equal(summary.peakStreetLabel, '河牌');
  assert.equal(summary.peakStreetAdded, 420);

  const [preflop, flop, turn, river] = summary.points;
  assert.equal(preflop.pot, 120);
  assert.equal(preflop.streetAdded, 120);
  assert.equal(flop.pot, 280);
  assert.equal(flop.streetAdded, 160);
  assert.equal(turn.pot, 280);
  assert.equal(turn.streetAdded, 0);
  assert.equal(turn.highlightAction, '全员让牌');
  assert.equal(river.pot, 700);
  assert.equal(river.isCurrent, true);
});

test('buildStreetPotTrend leaves future streets as null when still on flop', () => {
  const timeline: PotTimelinePoint[] = [
    {
      step: 1,
      street: 'preflop',
      actorId: 'p1',
      actorName: '林深',
      actionType: 'blind',
      actionLabel: '大盲 20',
      amountAdded: 20,
      potAfter: 30,
      timestamp: 1000,
    },
  ];

  const summary = buildStreetPotTrend({
    currentHandNumber: 1,
    currentPhase: 'flop',
    currentPot: 30,
    currentCommunityCardCount: 3,
    currentPotTimeline: timeline,
    handHistory: [],
  });

  assert.equal(summary.points[0].pot, 30);
  assert.equal(summary.points[1].pot, 30);
  assert.equal(summary.points[1].isCurrent, true);
  assert.equal(summary.points[2].pot, null);
  assert.equal(summary.points[2].streetAddedPlot, null);
  assert.equal(summary.points[3].pot, null);
  assert.equal(summary.points[3].streetAddedPlot, null);
});

test('buildStreetPotTrend nets out uncalled refund points so street pot matches contested table pot', () => {
  const timeline: PotTimelinePoint[] = [
    {
      step: 1,
      street: 'preflop',
      actorId: 'p1',
      actorName: '林深',
      actionType: 'blind',
      actionLabel: '小盲 10',
      amountAdded: 10,
      potAfter: 10,
      timestamp: 1000,
    },
    {
      step: 2,
      street: 'preflop',
      actorId: 'p2',
      actorName: '陈默',
      actionType: 'blind',
      actionLabel: '大盲 20',
      amountAdded: 20,
      potAfter: 30,
      timestamp: 1001,
    },
    {
      step: 3,
      street: 'preflop',
      actorId: 'p1',
      actorName: '林深',
      actionType: 'allin',
      actionLabel: '全下 2000',
      amountAdded: 1990,
      potAfter: 2020,
      timestamp: 1002,
    },
    {
      step: 4,
      street: 'preflop',
      actorId: 'p1',
      actorName: '林深',
      actionType: 'refund',
      actionLabel: '退还无人跟注筹码 1980',
      amountAdded: -1980,
      potAfter: 40,
      timestamp: 1003,
    },
  ];

  const summary = buildStreetPotTrend({
    currentHandNumber: 2,
    currentPhase: 'showdown',
    currentPot: 40,
    currentCommunityCardCount: 0,
    currentPotTimeline: timeline,
    handHistory: [],
  });

  assert.equal(summary.totalPot, 40);
  assert.equal(summary.points[0].pot, 40);
  assert.equal(summary.points[0].streetAdded, 40);
  assert.equal(summary.points[0].actionCount, 3);
});

