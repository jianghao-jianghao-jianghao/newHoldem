import assert from 'node:assert/strict';
import test from 'node:test';
import { getHandOverviewStats, PHASE_STAGE_LABELS } from './tableOverview';
import type { ClientPlayerView } from './types';

function makePlayer(
  id: string,
  overrides: Partial<ClientPlayerView> = {}
): ClientPlayerView {
  return {
    id,
    name: id,
    avatar: 'default',
    seatIndex: 0,
    chips: 1000,
    currentBet: 0,
    totalContributed: 0,
    folded: false,
    allIn: false,
    inHand: true,
    isBot: false,
    connected: true,
    cardCount: 2,
    holeCards: null,
    ...overrides,
  };
}

test('getHandOverviewStats reports seated count in waiting phase', () => {
  const stats = getHandOverviewStats({
    phase: 'waiting',
    pot: 0,
    players: [makePlayer('a', { inHand: false }), makePlayer('b', { inHand: false })],
  });
  assert.equal(stats.pot, 0);
  assert.equal(stats.remainingPlayers, 2);
  assert.equal(stats.totalPlayers, 2);
  assert.equal(stats.phaseLabel, '等待开局');
  assert.equal(stats.isActiveHand, false);
});

test('getHandOverviewStats excludes folded and sitting-out players during active streets', () => {
  const stats = getHandOverviewStats({
    phase: 'flop',
    pot: 240,
    players: [
      makePlayer('a', { inHand: true, folded: false }),
      makePlayer('b', { inHand: true, folded: true }),
      makePlayer('c', { inHand: true, folded: false }),
      makePlayer('d', { inHand: false, folded: false }),
    ],
  });
  assert.equal(stats.pot, 240);
  assert.equal(stats.remainingPlayers, 2);
  assert.equal(stats.totalPlayers, 4);
  assert.equal(stats.phaseLabel, '翻牌后');
  assert.equal(stats.isActiveHand, true);
});

test('PHASE_STAGE_LABELS maps preflop, flop, turn, river cleanly', () => {
  assert.equal(PHASE_STAGE_LABELS.preflop, '翻牌前');
  assert.equal(PHASE_STAGE_LABELS.flop, '翻牌后');
  assert.equal(PHASE_STAGE_LABELS.turn, '转牌');
  assert.equal(PHASE_STAGE_LABELS.river, '河牌');
  assert.equal(PHASE_STAGE_LABELS.showdown, '摊牌结算');
});
