import test from 'node:test';
import assert from 'node:assert/strict';
import { generateHandReview } from './handReview';
import { SessionOpponentProfiler } from './opponentProfiler';
import {
  addPlayerToTable,
  applyPlayerAction,
  createTableState,
  startNewHand,
} from '../src/shared/pokerEngine';

test('generateHandReview produces objective street evidence, verdicts, lessons, teaching, and profiler linkage', () => {
  const profiler = new SessionOpponentProfiler();
  const table = createTableState('REV_TEST', 10, 20, 2000);
  addPlayerToTable(table, { id: 'hero', name: '林深', chips: 2000 });
  addPlayerToTable(table, { id: 'bot1', name: '陈默', chips: 2000, isBot: true });

  const act = (actorId: string, action: { type: 'fold' | 'check' | 'call' | 'raise'; amount?: number }) => {
    profiler.observeAction(table, actorId, action);
    const res = applyPlayerAction(table, actorId, action, Date.now());
    assert.equal(res.ok, true, `Action failed: ${res.error}`);
  };

  // Play 3 hands so profiler builds live session reads on both Hero and Bot
  for (let h = 0; h < 3; h++) {
    startNewHand(table, () => 0.4 + h * 0.05, 1000 + h * 200);
    const hero = table.players.find((p) => p.id === 'hero')!;
    const bot = table.players.find((p) => p.id === 'bot1')!;

    if (h < 2) {
      // Establish a calling-station read on hero in this session
      const firstId = table.currentTurnPlayerId!;
      const secondId = firstId === 'hero' ? 'bot1' : 'hero';
      if (firstId === 'hero') {
        act('hero', { type: 'call' });
        act('bot1', { type: 'raise', amount: 60 });
        act('hero', { type: 'call' });
      } else {
        act('bot1', { type: 'raise', amount: 60 });
        act('hero', { type: 'call' });
      }
      // Flop bet + call
      const flopFirst = table.currentTurnPlayerId!;
      const flopSecond = flopFirst === 'hero' ? 'bot1' : 'hero';
      if (flopFirst === 'bot1') {
        act('bot1', { type: 'raise', amount: 60 });
        act('hero', { type: 'call' });
      } else {
        act('hero', { type: 'check' });
        act('bot1', { type: 'raise', amount: 60 });
        act('hero', { type: 'call' });
      }
      // Turn & river check down
      for (let st = 0; st < 2; st++) {
        if (table.phase === 'showdown') break;
        const a = table.currentTurnPlayerId!;
        const b = a === 'hero' ? 'bot1' : 'hero';
        act(a, { type: 'check' });
        act(b, { type: 'check' });
      }
      profiler.observeHandEnd(table);
    } else {
      // Hand 3: Hero holds AA, raises preflop, bets top set on flop, wins showdown
      hero.holeCards = [
        { suit: 'spades', rank: 14 },
        { suit: 'hearts', rank: 14 },
      ];
      bot.holeCards = [
        { suit: 'clubs', rank: 13 },
        { suit: 'diamonds', rank: 12 },
      ];
      const first = table.currentTurnPlayerId!;
      if (first === 'hero') {
        act('hero', { type: 'raise', amount: 60 });
        act('bot1', { type: 'call' });
      } else {
        act('bot1', { type: 'call' });
        act('hero', { type: 'raise', amount: 60 });
        act('bot1', { type: 'call' });
      }
      table.communityCards = [
        { suit: 'diamonds', rank: 14 },
        { suit: 'clubs', rank: 8 },
        { suit: 'hearts', rank: 3 },
      ];
      const flopActor = table.currentTurnPlayerId!;
      if (flopActor === 'hero') {
        act('hero', { type: 'raise', amount: 80 });
        act('bot1', { type: 'call' });
      } else {
        act('bot1', { type: 'check' });
        act('hero', { type: 'raise', amount: 80 });
        act('bot1', { type: 'call' });
      }
      // Turn & river check/bet to showdown
      const turnActor = table.currentTurnPlayerId!;
      if (turnActor === 'bot1') {
        act('bot1', { type: 'check' });
        act('hero', { type: 'raise', amount: 140 });
        act('bot1', { type: 'call' });
      } else {
        act('hero', { type: 'raise', amount: 140 });
        act('bot1', { type: 'call' });
      }
      if (table.phase === 'river') {
        const r1 = table.currentTurnPlayerId!;
        const r2 = r1 === 'hero' ? 'bot1' : 'hero';
        act(r1, { type: 'check' });
        act(r2, { type: 'check' });
      }
      profiler.observeHandEnd(table);
    }
  }

  assert.equal(table.phase, 'showdown');
  const latestRecord = table.handHistory[table.handHistory.length - 1];
  assert.ok(latestRecord);

  const report = generateHandReview({
    record: latestRecord,
    heroId: 'hero',
    startingChips: table.startingChips,
    profiler,
  });

  assert.ok(report);
  assert.equal(report.outcome, 'win');
  assert.equal(report.canonicalHand, 'AA');
  assert.ok(report.streets.length >= 2);
  assert.ok(report.streets[0].heroDecisions.length >= 1);
  assert.ok(report.streets[0].heroDecisions[0].evidence.preflopMix !== null);
  assert.ok(report.strengthsFound.length >= 1);
  assert.ok(report.lessonsLearned.length >= 1);
  assert.ok(report.teaching.topic.length > 0 && report.teaching.formulaOrRule.length > 0);
  assert.ok(report.sessionProfileContext);
  assert.ok(report.sessionProfileContext.heroTableImage !== null);
  assert.ok(report.sessionProfileContext.opponentReads.length >= 1);
});

test('generateHandReview flags poor preflop call with 72o facing large raise as mistake or inaccuracy', () => {
  const table = createTableState('REV_MISTAKE', 10, 20, 2000);
  addPlayerToTable(table, { id: 'hero', name: 'Hero', chips: 2000 });
  addPlayerToTable(table, { id: 'bot1', name: '陈默', chips: 2000, isBot: true });
  startNewHand(table, () => 0.4, 1000);

  const hero = table.players.find((p) => p.id === 'hero')!;
  const bot = table.players.find((p) => p.id === 'bot1')!;
  hero.holeCards = [
    { suit: 'clubs', rank: 7 },
    { suit: 'diamonds', rank: 2 },
  ];
  bot.holeCards = [
    { suit: 'spades', rank: 14 },
    { suit: 'hearts', rank: 13 },
  ];

  // Hero limps 72o, bot raises big to 140, hero calls, then folds on flop
  applyPlayerAction(table, 'hero', { type: 'call' }, 1050);
  applyPlayerAction(table, 'bot1', { type: 'raise', amount: 140 }, 1100);
  applyPlayerAction(table, 'hero', { type: 'call' }, 1150);
  applyPlayerAction(table, 'bot1', { type: 'raise', amount: 200 }, 1200);
  applyPlayerAction(table, 'hero', { type: 'fold' }, 1250);

  const latestRecord = table.handHistory[table.handHistory.length - 1];
  const report = generateHandReview({
    record: latestRecord,
    heroId: 'hero',
    startingChips: 2000,
  });

  assert.ok(report);
  assert.equal(report.outcome, 'loss');
  assert.equal(report.canonicalHand, '72o');
  const preflopDecisions = report.streets[0].heroDecisions;
  assert.ok(
    preflopDecisions.some((d) => d.verdict === 'mistake' || d.verdict === 'inaccuracy'),
    `Expected mistake/inaccuracy for calling large raise with 72o, got ${preflopDecisions.map((d) => d.verdict).join(',')}`
  );
  assert.ok(report.lessonsLearned.length >= 1);
  assert.ok(report.teaching.topic.length > 0);
});
