import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseBotAction, evaluatePreflopStrength } from './botAi';
import {
  addPlayerToTable,
  applyPlayerAction,
  createTableState,
  startNewHand,
} from '../src/shared/pokerEngine';

test('evaluatePreflopStrength orders premium hands well above weak offsuit rags', () => {
  const aa = evaluatePreflopStrength([
    { suit: 'spades', rank: 14 },
    { suit: 'hearts', rank: 14 },
  ]);
  const aks = evaluatePreflopStrength([
    { suit: 'spades', rank: 14 },
    { suit: 'spades', rank: 13 },
  ]);
  const rags = evaluatePreflopStrength([
    { suit: 'clubs', rank: 7 },
    { suit: 'diamonds', rank: 2 },
  ]);

  assert.ok(aa > aks, `Expected AA (${aa}) > AKs (${aks})`);
  assert.ok(aks > rags + 0.35, `Expected AKs (${aks}) >> 72o (${rags})`);
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

test('bot calls or raises with pocket Aces facing a preflop shove', () => {
  const table = createTableState('BOT_AA', 10, 20, 2000);
  addPlayerToTable(table, { id: 'human', name: 'Hero', chips: 2000 });
  addPlayerToTable(table, { id: 'bot1', name: '林澈', chips: 2000, isBot: true });

  startNewHand(table, () => 0.4, 1000);
  const bot = table.players.find((p) => p.id === 'bot1')!;
  bot.holeCards = [
    { suit: 'spades', rank: 14 },
    { suit: 'hearts', rank: 14 },
  ];

  applyPlayerAction(table, 'human', { type: 'raise', amount: 2000 }, 1100);
  const decision = chooseBotAction(table, 'bot1', () => 0.5);
  assert.equal(decision.type, 'call');
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
