import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionOpponentProfiler, NEUTRAL_EXPLOIT_PLAN } from './opponentProfiler';
import {
  addPlayerToTable,
  applyPlayerAction,
  createTableState,
  startNewHand,
} from '../src/shared/pokerEngine';

function playControlledHand(
  profiler: SessionOpponentProfiler,
  heroStyle: 'station' | 'nit' | 'maniac',
  handIdx: number
) {
  const table = createTableState('PROF_TEST', 10, 20, 2000);
  addPlayerToTable(table, { id: 'hero', name: 'Hero', chips: 2000 });
  addPlayerToTable(table, { id: 'bot1', name: '陈默', chips: 2000, isBot: true });
  table.handNumber = handIdx;
  startNewHand(table, () => 0.35 + (handIdx % 5) * 0.05, 1000 + handIdx * 100);

  const act = (actorId: string, action: { type: 'fold' | 'check' | 'call' | 'raise'; amount?: number }) => {
    profiler.observeAction(table, actorId, action);
    const res = applyPlayerAction(table, actorId, action, 1100 + handIdx * 100);
    assert.equal(res.ok, true, `Action failed: ${res.error}`);
  };

  if (heroStyle === 'station') {
    // Hero limps/calls everything passively to showdown
    act('hero', { type: 'call' });
    act('bot1', { type: 'raise', amount: 60 });
    act('hero', { type: 'call' });
    // Flop
    act('bot1', { type: 'raise', amount: 60 });
    act('hero', { type: 'call' });
    // Turn
    act('bot1', { type: 'raise', amount: 80 });
    act('hero', { type: 'call' });
    // River
    act('bot1', { type: 'raise', amount: 100 });
    act('hero', { type: 'call' });
  } else if (heroStyle === 'nit') {
    // Hero folds facing bot raise every single hand
    act('hero', { type: 'call' });
    act('bot1', { type: 'raise', amount: 60 });
    act('hero', { type: 'fold' });
  } else if (heroStyle === 'maniac') {
    // Hero raises preflop, overbets flop, turn, river
    act('hero', { type: 'raise', amount: 80 });
    act('bot1', { type: 'call' });
    // Flop
    act('bot1', { type: 'check' });
    act('hero', { type: 'raise', amount: 220 });
    act('bot1', { type: 'call' });
    // Turn
    act('bot1', { type: 'check' });
    act('hero', { type: 'raise', amount: 400 });
    act('bot1', { type: 'call' });
    // River
    act('bot1', { type: 'check' });
    act('hero', { type: 'raise', amount: 500 });
    act('bot1', { type: 'call' });
  }

  profiler.observeHandEnd(table);
}

test('SessionOpponentProfiler identifies calling_station and shifts exploit plan to thick value / low bluff', () => {
  const profiler = new SessionOpponentProfiler();
  for (let i = 0; i < 6; i++) {
    playControlledHand(profiler, 'station', i);
  }

  const read = profiler.getOpponentRead('hero');
  assert.equal(read.handsObserved, 6);
  assert.equal(read.archetype, 'calling_station');
  assert.ok(read.confidence >= 0.4);

  const plan = profiler.buildExploitPlan('hero');
  assert.equal(plan.targetArchetype, 'calling_station');
  assert.ok(plan.bluffFreqMult < 0.7, `Expected low bluff multiplier vs station, got ${plan.bluffFreqMult}`);
  assert.ok(plan.valueSizeMult > 1.05, `Expected larger value sizing vs station, got ${plan.valueSizeMult}`);
  assert.ok(plan.valueThresholdDelta < 0, `Expected thinner value bets vs station, got ${plan.valueThresholdDelta}`);
});

test('SessionOpponentProfiler identifies overfolder_nit and shifts exploit plan to higher steal & bluff frequency', () => {
  const profiler = new SessionOpponentProfiler();
  for (let i = 0; i < 6; i++) {
    playControlledHand(profiler, 'nit', i);
  }

  const read = profiler.getOpponentRead('hero');
  assert.equal(read.handsObserved, 6);
  assert.equal(read.archetype, 'overfolder_nit');

  const plan = profiler.buildExploitPlan('hero');
  assert.equal(plan.targetArchetype, 'overfolder_nit');
  assert.ok(plan.bluffFreqMult > 1.1, `Expected increased bluffs vs nit, got ${plan.bluffFreqMult}`);
  assert.ok(plan.preflopOpenDelta > 0.03, `Expected wider steals vs nit, got ${plan.preflopOpenDelta}`);
});

test('SessionOpponentProfiler identifies maniac_bluffer and shifts exploit plan to wider hero-calls and trapping', () => {
  const profiler = new SessionOpponentProfiler();
  for (let i = 0; i < 6; i++) {
    playControlledHand(profiler, 'maniac', i);
  }

  const read = profiler.getOpponentRead('hero');
  assert.equal(read.handsObserved, 6);
  assert.equal(read.archetype, 'maniac_bluffer');

  const plan = profiler.buildExploitPlan('hero');
  assert.equal(plan.targetArchetype, 'maniac_bluffer');
  assert.ok(plan.callRequiredEquityDelta < -0.02, `Expected wider call threshold vs maniac, got ${plan.callRequiredEquityDelta}`);
  assert.ok(plan.trapSlowplayBonus > 0.08, `Expected slowplay trapping vs maniac, got ${plan.trapSlowplayBonus}`);
});

test('SessionOpponentProfiler stays strictly session-scoped via resetPlayer and clearAll', () => {
  const profiler = new SessionOpponentProfiler();
  for (let i = 0; i < 5; i++) {
    playControlledHand(profiler, 'station', i);
  }
  assert.equal(profiler.getOpponentRead('hero').archetype, 'calling_station');

  profiler.resetPlayer('hero');
  const afterReset = profiler.getOpponentRead('hero');
  assert.equal(afterReset.handsObserved, 0);
  assert.equal(afterReset.archetype, 'unknown');
  assert.deepEqual(profiler.buildExploitPlan('hero'), NEUTRAL_EXPLOIT_PLAN);

  // Bot stats still exist until clearAll
  assert.ok(profiler.getOpponentRead('bot1').handsObserved > 0);
  profiler.clearAll();
  assert.equal(profiler.getOpponentRead('bot1').handsObserved, 0);
});

test('SessionOpponentProfiler applies Beta-Binomial Bayesian posterior shrinkage and RNR safety margin', () => {
  const profiler = new SessionOpponentProfiler();
  for (let i = 0; i < 4; i++) {
    playControlledHand(profiler, 'nit', i);
  }
  const read4 = profiler.getOpponentRead('hero');
  const plan4 = profiler.buildExploitPlan('hero');

  // With only 4 hands, Beta-Binomial shrinkage keeps posterior strictly between GTO prior (0.42) and raw (1.0)
  assert.ok(
    read4.posterior.foldToBetPosterior > 0.45 && read4.posterior.foldToBetPosterior < 0.85,
    `Expected shrunk foldToBet posterior on 4 hands, got ${read4.posterior.foldToBetPosterior}`
  );
  assert.ok(read4.rnrSafetyLambda >= 0.72 && read4.rnrSafetyLambda <= 0.95);
  assert.ok(plan4.rnrWeight > 0 && plan4.rnrWeight <= plan4.confidence);
  assert.ok(read4.leakTags.length >= 1);

  for (let i = 4; i < 14; i++) {
    playControlledHand(profiler, 'nit', i);
  }
  const read14 = profiler.getOpponentRead('hero');
  const plan14 = profiler.buildExploitPlan('hero');
  assert.ok(
    read14.posterior.foldToBetPosterior > read4.posterior.foldToBetPosterior,
    'More observed fold hands should move Bayesian posterior higher'
  );
  assert.ok(
    plan14.rnrWeight > plan4.rnrWeight,
    'More observed hands should increase RNR exploit weight'
  );
});
