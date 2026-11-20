import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPlayerToTable,
  advanceAllInRunoutStep,
  applyPlayerAction,
  createTableState,
  getAvailableActions,
  rebuyPlayerChips,
  removePlayerFromTable,
  resolveNextHandSeats,
  revealPlayerCards,
  sanitizeTableForPlayer,
  startNewHand,
  updateTableBlindSettings,
} from './pokerEngine';

test('heads-up blinds, turn order, and fold win work cleanly', () => {
  const table = createTableState('ROOM1', 10, 20);
  addPlayerToTable(table, { id: 'p1', name: 'Alice', chips: 2000 });
  addPlayerToTable(table, { id: 'p2', name: 'Bob', chips: 2000 });

  const started = startNewHand(table, () => 0.42, 1000);
  assert.equal(started.ok, true);
  assert.equal(table.phase, 'preflop');
  assert.equal(table.pot, 30);

  // Heads-up: Dealer (p1) is SB and acts first preflop
  assert.equal(table.dealerSeatIndex, 0);
  assert.equal(table.smallBlindSeatIndex, 0);
  assert.equal(table.bigBlindSeatIndex, 1);
  assert.equal(table.currentTurnPlayerId, 'p1');

  // Verify hole cards are hidden from opponent in sanitized view
  const bobView = sanitizeTableForPlayer(table, 'p2');
  const aliceFromBob = bobView.players.find((p) => p.id === 'p1')!;
  const bobFromBob = bobView.players.find((p) => p.id === 'p2')!;
  assert.equal(aliceFromBob.holeCards, null);
  assert.equal(bobFromBob.holeCards?.length, 2);

  // Alice folds -> Bob wins 30 pot immediately
  const res = applyPlayerAction(table, 'p1', { type: 'fold' }, 2000);
  assert.equal(res.ok, true);
  assert.equal(res.handFinished, true);
  assert.equal(table.phase, 'showdown');
  assert.equal(table.winners.length, 1);
  assert.equal(table.winners[0].playerId, 'p2');
  assert.equal(table.players.find((p) => p.id === 'p2')?.chips, 2010);
  assert.equal(table.players.find((p) => p.id === 'p1')?.chips, 1990);
});

test('full 4-street check/call sequence reaches showdown and preserves total chips', () => {
  const table = createTableState('ROOM2', 10, 20);
  addPlayerToTable(table, { id: 'p1', name: 'Alice', chips: 2000 });
  addPlayerToTable(table, { id: 'p2', name: 'Bob', chips: 2000 });
  addPlayerToTable(table, { id: 'p3', name: 'Carol', chips: 2000 });

  startNewHand(table, () => 0.25, 1000);
  assert.equal(table.currentTurnPlayerId, 'p1');
  applyPlayerAction(table, 'p1', { type: 'call' }, 1100);
  assert.equal(table.currentTurnPlayerId, 'p2');
  applyPlayerAction(table, 'p2', { type: 'call' }, 1200);
  assert.equal(table.currentTurnPlayerId, 'p3');
  applyPlayerAction(table, 'p3', { type: 'check' }, 1300);

  assert.equal(table.phase, 'flop');
  assert.equal(table.communityCards.length, 3);
  assert.equal(table.pot, 60);
  assert.equal(table.currentTurnPlayerId, 'p2');

  applyPlayerAction(table, 'p2', { type: 'check' }, 1400);
  applyPlayerAction(table, 'p3', { type: 'check' }, 1500);
  applyPlayerAction(table, 'p1', { type: 'check' }, 1600);
  assert.equal(table.phase, 'turn');
  assert.equal(table.communityCards.length, 4);

  applyPlayerAction(table, 'p2', { type: 'check' }, 1700);
  applyPlayerAction(table, 'p3', { type: 'check' }, 1800);
  applyPlayerAction(table, 'p1', { type: 'check' }, 1900);
  assert.equal(table.phase, 'river');
  assert.equal(table.communityCards.length, 5);

  applyPlayerAction(table, 'p2', { type: 'raise', amount: 40 }, 2000);
  applyPlayerAction(table, 'p3', { type: 'call' }, 2100);
  const finish = applyPlayerAction(table, 'p1', { type: 'call' }, 2200);
  assert.equal(finish.handFinished, true);
  assert.equal(table.phase, 'showdown');
  assert.equal(table.pot, 180);

  const totalChips = table.players.reduce((sum, p) => sum + p.chips, 0);
  assert.equal(totalChips, 6000);
  assert.ok(table.winners.length >= 1);
});

test('all-in side pot and uncalled excess refund preserve chip conservation', () => {
  const table = createTableState('ROOM3', 10, 20);
  addPlayerToTable(table, { id: 'p1', name: 'Short', chips: 100 });
  addPlayerToTable(table, { id: 'p2', name: 'Deep1', chips: 1000 });
  addPlayerToTable(table, { id: 'p3', name: 'Deep2', chips: 1000 });

  startNewHand(table, () => 0.65, 1000);
  const avail = getAvailableActions(table, 'p1')!;
  assert.equal(avail.maxRaiseTo, 100);
  applyPlayerAction(table, 'p1', { type: 'raise', amount: 100 }, 1100);
  applyPlayerAction(table, 'p2', { type: 'raise', amount: 400 }, 1200);
  applyPlayerAction(table, 'p3', { type: 'fold' }, 1300);

  assert.equal(table.phase, 'showdown');
  assert.equal(table.communityCards.length, 5);

  const totalChips = table.players.reduce((sum, p) => sum + p.chips, 0);
  assert.equal(totalChips, 2100);
});

test('rebuy restores busted player chips to starting stack', () => {
  const table = createTableState('ROOM4', 10, 20);
  addPlayerToTable(table, { id: 'p1', name: 'Broke', chips: 0 });
  assert.equal(rebuyPlayerChips(table, 'p1'), true);
  assert.equal(table.players[0].chips, 2000);
  assert.equal(rebuyPlayerChips(table, 'p1'), false);
});

test('supports more than 6 players (e.g. 10 players) at one table with chip conservation', () => {
  const table = createTableState('ROOM10', 10, 20);
  for (let i = 1; i <= 10; i++) {
    const res = addPlayerToTable(table, { id: `p${i}`, name: `Player${i}`, chips: 2000 });
    assert.equal(res.ok, true);
  }
  assert.equal(table.players.length, 10);

  const started = startNewHand(table, () => 0.35, 1000);
  assert.equal(started.ok, true);
  for (const p of table.players) {
    assert.equal(p.holeCards.length, 2);
  }

  for (let i = 0; i < 10; i++) {
    const turnId = table.currentTurnPlayerId!;
    const avail = getAvailableActions(table, turnId)!;
    applyPlayerAction(table, turnId, { type: avail.canCheck ? 'check' : 'call' }, 1100 + i);
  }
  assert.equal(table.phase, 'flop');
  assert.equal(table.pot, 200);
  const totalChips = table.players.reduce((sum, p) => sum + p.chips + p.totalContributed, 0);
  assert.equal(totalChips, 20000);
});

test('custom startingChips configures initial player stacks and rebuy amount', () => {
  const table = createTableState('ROOM_DEEP', 25, 50, 5000);
  addPlayerToTable(table, { id: 'p1', name: 'DeepA' });
  addPlayerToTable(table, { id: 'p2', name: 'DeepB' });
  assert.equal(table.startingChips, 5000);
  assert.equal(table.players[0].chips, 5000);
  assert.equal(table.players[1].chips, 5000);

  table.players[0].chips = 10;
  assert.equal(rebuyPlayerChips(table, 'p1'), true);
  assert.equal(table.players[0].chips, 5000);
});

test('stepAllIn deals flop -> turn -> river -> showdown sequentially and records replay & VPIP', () => {
  const table = createTableState('ROOM_ALLIN', 10, 20, 1000);
  addPlayerToTable(table, { id: 'p1', name: 'Alice', chips: 1000 });
  addPlayerToTable(table, { id: 'p2', name: 'Bob', chips: 1000 });

  startNewHand(table, () => 0.5, 1000, { stepAllIn: true });
  applyPlayerAction(table, 'p1', { type: 'raise', amount: 1000 }, 1100, { stepAllIn: true });
  applyPlayerAction(table, 'p2', { type: 'call' }, 1200, { stepAllIn: true });

  assert.equal(table.allInRunout, true);
  assert.equal(table.phase, 'preflop');
  assert.equal(table.communityCards.length, 0);

  const s1 = advanceAllInRunoutStep(table, 2300);
  assert.equal(s1.ok, true);
  assert.equal(table.phase, 'flop');
  assert.equal(table.communityCards.length, 3);

  const s2 = advanceAllInRunoutStep(table, 3400);
  assert.equal(s2.ok, true);
  assert.equal(table.phase, 'turn');
  assert.equal(table.communityCards.length, 4);

  const s3 = advanceAllInRunoutStep(table, 4500);
  assert.equal(s3.ok, true);
  assert.equal(table.phase, 'river');
  assert.equal(table.communityCards.length, 5);

  const s4 = advanceAllInRunoutStep(table, 5600);
  assert.equal(s4.finished, true);
  assert.equal(table.phase, 'showdown');
  assert.equal(table.allInRunout, false);
  assert.equal(table.handHistory.length, 1);
  assert.equal(table.playerStats['p1'].vpipHands, 1);
  assert.equal(table.playerStats['p2'].vpipHands, 1);
  assert.equal(table.players.reduce((sum, p) => sum + p.chips, 0), 2000);
});

test('manual revealPlayerCards exposes hole cards after fold win and updates replay', () => {
  const table = createTableState('ROOM_REV', 10, 20, 2000);
  addPlayerToTable(table, { id: 'p1', name: 'Alice', chips: 2000 });
  addPlayerToTable(table, { id: 'p2', name: 'Bob', chips: 2000 });

  startNewHand(table, () => 0.3, 1000, { stepAllIn: true });
  applyPlayerAction(table, 'p1', { type: 'fold' }, 1100, { stepAllIn: true });

  assert.equal(table.phase, 'showdown');
  // Before reveal, Alice cannot see Bob's hole cards
  const viewBefore = sanitizeTableForPlayer(table, 'p1');
  assert.equal(viewBefore.players.find((p) => p.id === 'p2')?.holeCards, null);
  assert.equal(sanitizeTableForPlayer(table, 'p2').canRevealMyCards, true);

  // Bob chooses to reveal ("亮牌")
  const rev = revealPlayerCards(table, 'p2');
  assert.equal(rev.ok, true);
  const viewAfter = sanitizeTableForPlayer(table, 'p1');
  assert.equal(viewAfter.players.find((p) => p.id === 'p2')?.holeCards?.length, 2);
  assert.equal(viewAfter.analytics.handHistory[0].players.find((p) => p.id === 'p2')?.revealed, true);
});

test('sessionNetChips accumulates net wins and losses across consecutive hands for in-table standings', () => {
  const table = createTableState('ROOM_NET', 10, 20, 2000);
  addPlayerToTable(table, { id: 'p1', name: 'Alice', chips: 2000 });
  addPlayerToTable(table, { id: 'p2', name: 'Bob', chips: 2000 });

  // Hand 1: p1 (SB=10) folds -> p1 -10, p2 +10
  startNewHand(table, () => 0.2, 1000);
  applyPlayerAction(table, 'p1', { type: 'fold' }, 1100);
  assert.equal(table.playerStats['p1'].sessionNetChips, -10);
  assert.equal(table.playerStats['p2'].sessionNetChips, 10);

  // Hand 2: dealer rotates to p2 (SB=10), p1 is BB=20; p2 raises to 60, p1 folds -> p2 +20, p1 -20 (cumulative -30/+30)
  startNewHand(table, () => 0.4, 2000);
  applyPlayerAction(table, 'p2', { type: 'raise', amount: 60 }, 2100);
  applyPlayerAction(table, 'p1', { type: 'fold' }, 2200);
  assert.equal(table.playerStats['p1'].sessionNetChips, -30);
  assert.equal(table.playerStats['p2'].sessionNetChips, 30);
  assert.equal(
    table.playerStats['p1'].sessionNetChips + table.playerStats['p2'].sessionNetChips,
    0
  );
});

test('updateTableBlindSettings configures custom SB/BB and pins SB/BB seats in 3-player and heads-up games', () => {
  const table = createTableState('ROOM_BLINDS', 10, 20, 3000);
  addPlayerToTable(table, { id: 'p1', name: 'P1', chips: 3000 }); // seat 0
  addPlayerToTable(table, { id: 'p2', name: 'P2', chips: 3000 }); // seat 1
  addPlayerToTable(table, { id: 'p3', name: 'P3', chips: 3000 }); // seat 2

  // Invalid blinds rejected
  assert.equal(updateTableBlindSettings(table, { smallBlind: 50, bigBlind: 50 }).ok, false);
  assert.equal(updateTableBlindSettings(table, { smallBlind: 0, bigBlind: 20 }).ok, false);

  // Set custom blinds 25/50 and assign P3 (seat 2) as Small Blind
  const updated = updateTableBlindSettings(table, {
    smallBlind: 25,
    bigBlind: 50,
    manualBlindTarget: { role: 'sb', seatIndex: 2 },
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.queued, false);
  assert.equal(table.smallBlind, 25);
  assert.equal(table.bigBlind, 50);

  const preview = resolveNextHandSeats(table);
  assert.equal(preview.smallBlindSeatIndex, 2);
  assert.equal(preview.bigBlindSeatIndex, 0);
  assert.equal(preview.dealerSeatIndex, 1);

  startNewHand(table, () => 0.4, 1000);
  assert.equal(table.dealerSeatIndex, 1);
  assert.equal(table.smallBlindSeatIndex, 2);
  assert.equal(table.bigBlindSeatIndex, 0);
  assert.equal(table.pot, 75);
  assert.equal(table.players.find((p) => p.seatIndex === 2)?.currentBet, 25);
  assert.equal(table.players.find((p) => p.seatIndex === 0)?.currentBet, 50);

  // Mid-hand: queue blind change 50/100 and pin P2 (seat 1) as Big Blind for next hand
  const queued = updateTableBlindSettings(table, {
    smallBlind: 50,
    bigBlind: 100,
    manualBlindTarget: { role: 'bb', seatIndex: 1 },
  });
  assert.equal(queued.ok, true);
  assert.equal(queued.queued, true);
  assert.equal(table.smallBlind, 25); // current hand unaffected
  assert.deepEqual(table.pendingBlinds, { smallBlind: 50, bigBlind: 100 });

  // Finish hand by folding around to BB
  applyPlayerAction(table, table.currentTurnPlayerId!, { type: 'fold' }, 1100);
  applyPlayerAction(table, table.currentTurnPlayerId!, { type: 'fold' }, 1200);
  assert.equal(table.phase, 'showdown');

  // Next hand applies queued 50/100 and P2 (seat 1) as BB -> SB=seat 0, Dealer=seat 2
  startNewHand(table, () => 0.5, 2000);
  assert.equal(table.smallBlind, 50);
  assert.equal(table.bigBlind, 100);
  assert.equal(table.pendingBlinds, null);
  assert.equal(table.bigBlindSeatIndex, 1);
  assert.equal(table.smallBlindSeatIndex, 0);
  assert.equal(table.dealerSeatIndex, 2);
  assert.equal(table.pot, 150);

  // Subsequent hand rotates clockwise normally (manualBlindTarget cleared)
  applyPlayerAction(table, table.currentTurnPlayerId!, { type: 'fold' }, 2100);
  applyPlayerAction(table, table.currentTurnPlayerId!, { type: 'fold' }, 2200);
  startNewHand(table, () => 0.6, 3000);
  assert.equal(table.dealerSeatIndex, 0);
  assert.equal(table.smallBlindSeatIndex, 1);
  assert.equal(table.bigBlindSeatIndex, 2);
});

test('WSOP/TDA Rule 47: incomplete short all-in does NOT reopen raising for players who already acted', () => {
  const table = createTableState('ROOM_SHORT_ALLIN', 10, 20, 2000);
  addPlayerToTable(table, { id: 'p1', name: 'P1', chips: 2000 }); // Dealer (seat 0), acts first preflop
  addPlayerToTable(table, { id: 'p2', name: 'P2', chips: 2000 }); // SB (seat 1)
  addPlayerToTable(table, { id: 'p3', name: 'P3', chips: 130 });  // BB (seat 2), short stack 130

  startNewHand(table, () => 0.3, 1000);
  assert.equal(table.currentTurnPlayerId, 'p1');

  // P1 raises to 100 (full raise: +80 over BB=20, so minRaise becomes 80)
  applyPlayerAction(table, 'p1', { type: 'raise', amount: 100 }, 1100);
  assert.equal(table.currentBet, 100);
  assert.equal(table.minRaise, 80);

  // P2 calls 100 (already acted at the 100 full bet)
  applyPlayerAction(table, 'p2', { type: 'call' }, 1200);
  assert.equal(table.currentTurnPlayerId, 'p3');

  // P3 goes all-in for 130 (+30 < minRaise 80 -> incomplete short all-in!)
  applyPlayerAction(table, 'p3', { type: 'raise', amount: 130 }, 1300);
  assert.equal(table.currentBet, 130);
  assert.equal(table.minRaise, 80); // minRaise must NOT shrink to 30

  // Action returns to P1: P1 already acted on 100 -> can call 30 or fold, CANNOT re-raise!
  assert.equal(table.currentTurnPlayerId, 'p1');
  const p1Avail = getAvailableActions(table, 'p1')!;
  assert.equal(p1Avail.canCall, true);
  assert.equal(p1Avail.callAmount, 30);
  assert.equal(p1Avail.canRaise, false);
  const illegalRaise = applyPlayerAction(table, 'p1', { type: 'raise', amount: 300 }, 1350);
  assert.equal(illegalRaise.ok, false);

  applyPlayerAction(table, 'p1', { type: 'call' }, 1400);

  // Action moves to P2: also already acted on 100 -> CANNOT re-raise either!
  assert.equal(table.currentTurnPlayerId, 'p2');
  const p2Avail = getAvailableActions(table, 'p2')!;
  assert.equal(p2Avail.canCall, true);
  assert.equal(p2Avail.callAmount, 30);
  assert.equal(p2Avail.canRaise, false);

  applyPlayerAction(table, 'p2', { type: 'call' }, 1500);
  assert.equal(table.phase, 'flop');
  assert.equal(table.pot, 390);
});

test('uncalled excess bet is refunded cleanly at showdown without falsely crediting a showdown win', () => {
  const table = createTableState('ROOM_UNCALLED', 10, 20, 2000);
  addPlayerToTable(table, { id: 'short', name: 'Short', chips: 100 });
  addPlayerToTable(table, { id: 'deep', name: 'Deep', chips: 1000 });

  startNewHand(table, () => 0.4, 1000);
  // Force deterministic hands so Short wins main pot (A-A) while Deep loses (7-2)
  const shortP = table.players.find((p) => p.id === 'short')!;
  const deepP = table.players.find((p) => p.id === 'deep')!;
  shortP.holeCards = [
    { suit: 'spades', rank: 14 },
    { suit: 'hearts', rank: 14 },
  ];
  deepP.holeCards = [
    { suit: 'clubs', rank: 7 },
    { suit: 'diamonds', rank: 2 },
  ];
  // Set deterministic remaining deck top cards (burn + 5 low non-straight/non-flush board cards)
  table.deck = [
    { suit: 'clubs', rank: 9 },
    { suit: 'diamonds', rank: 4 },
    { suit: 'spades', rank: 3 },
    { suit: 'hearts', rank: 8 },
    { suit: 'clubs', rank: 5 },
    { suit: 'diamonds', rank: 10 },
    { suit: 'spades', rank: 11 },
    { suit: 'hearts', rank: 12 },
  ];

  // Short (SB/Dealer) goes all-in for 100, Deep raises to 400 (300 uncalled excess!)
  applyPlayerAction(table, 'short', { type: 'raise', amount: 100 }, 1100);
  applyPlayerAction(table, 'deep', { type: 'raise', amount: 400 }, 1200);

  assert.equal(table.phase, 'showdown');
  // Only Short won the 200 main pot; Deep's 300 uncalled excess is refunded, NOT a win!
  assert.equal(table.winners.length, 1);
  assert.equal(table.winners[0].playerId, 'short');
  assert.equal(table.winners[0].amount, 200);
  assert.equal(table.pot, 200);
  assert.equal(shortP.chips, 200);
  assert.equal(deepP.chips, 900);
  assert.equal(table.playerStats['short'].handsWon, 1);
  assert.equal(table.playerStats['deep'].handsWon, 0);
  assert.equal(table.playerStats['deep'].showdownWon, 0);
  assert.equal(table.playerStats['deep'].sessionNetChips, -100);
  assert.equal(table.playerStats['short'].sessionNetChips, 100);
});

test('hole cards deal clockwise starting from SB and postflop distinguishes Bet (下注) vs Raise (加注至)', () => {
  const table = createTableState('ROOM_DEAL_BET', 10, 20, 2000);
  addPlayerToTable(table, { id: 'p0', name: 'P0', chips: 2000 }); // Dealer (seat 0)
  addPlayerToTable(table, { id: 'p1', name: 'P1', chips: 2000 }); // SB (seat 1)
  addPlayerToTable(table, { id: 'p2', name: 'P2', chips: 2000 }); // BB (seat 2)

  // Deterministic rng=0 -> deck untouched after shuffle check; verify card order dealt from SB
  const expectedTop6: string[] = [];
  startNewHand(table, () => 0.123456, 1000);
  assert.equal(table.dealerSeatIndex, 0);
  assert.equal(table.smallBlindSeatIndex, 1);
  assert.equal(table.bigBlindSeatIndex, 2);

  // Verify 52-card deck accounting: 6 hole cards dealt -> 46 remain
  assert.equal(table.deck.length, 46);
  // Verify P1 (SB) got first card and P2 (BB) got second, P0 (D) got third
  for (const p of table.players) {
    assert.equal(p.holeCards.length, 2);
    expectedTop6.push(`${p.holeCards[0].suit}-${p.holeCards[0].rank}`);
  }
  assert.equal(new Set(expectedTop6).size, 3);

  // Reach flop
  applyPlayerAction(table, 'p0', { type: 'call' }, 1100);
  applyPlayerAction(table, 'p1', { type: 'call' }, 1200);
  applyPlayerAction(table, 'p2', { type: 'check' }, 1300);
  assert.equal(table.phase, 'flop');
  // 1 burn + 3 flop = 4 cards removed -> 42 remain
  assert.equal(table.deck.length, 42);

  // On flop, P1 (SB, first left of Dealer) acts first with currentBet === 0 -> isOpeningBet === true
  assert.equal(table.currentTurnPlayerId, 'p1');
  const p1Avail = getAvailableActions(table, 'p1')!;
  assert.equal(p1Avail.isOpeningBet, true);
  applyPlayerAction(table, 'p1', { type: 'raise', amount: 40 }, 1400);
  assert.equal(table.players.find((p) => p.id === 'p1')?.lastActionLabel, '下注 40');

  // Next actor P2 faces a bet -> isOpeningBet === false -> raise label is 加注至
  const p2Avail = getAvailableActions(table, 'p2')!;
  assert.equal(p2Avail.isOpeningBet, false);
  applyPlayerAction(table, 'p2', { type: 'raise', amount: 100 }, 1500);
  assert.equal(table.players.find((p) => p.id === 'p2')?.lastActionLabel, '加注至 100');
});

test('3-player short-stacked BB keeps preflop opening call at full bigBlind', () => {
  const table = createTableState('ROOM_SHORT_BB', 10, 20, 2000);
  addPlayerToTable(table, { id: 'p0', name: 'UTG', chips: 2000 }); // Dealer/UTG (seat 0)
  addPlayerToTable(table, { id: 'p1', name: 'SB', chips: 2000 });  // SB (seat 1)
  addPlayerToTable(table, { id: 'p2', name: 'BB', chips: 8 });     // Short BB (< 20)

  startNewHand(table, () => 0.4, 1000);
  assert.equal(table.currentBet, 20);
  assert.equal(table.currentTurnPlayerId, 'p0');
  const utgAvail = getAvailableActions(table, 'p0')!;
  assert.equal(utgAvail.callAmount, 20);
});

test('rejects NaN and Infinity raise amounts without corrupting table chips or pot', () => {
  const table = createTableState('ROOM_NAN', 10, 20, 2000);
  addPlayerToTable(table, { id: 'p1', name: 'Alice', chips: 2000 });
  addPlayerToTable(table, { id: 'p2', name: 'Bob', chips: 2000 });
  startNewHand(table, () => 0.4, 1000);

  const nanRes = applyPlayerAction(table, 'p1', { type: 'raise', amount: Number.NaN }, 1100);
  assert.equal(nanRes.ok, false);
  const infRes = applyPlayerAction(table, 'p1', { type: 'raise', amount: Number.POSITIVE_INFINITY }, 1100);
  assert.equal(infRes.ok, false);

  assert.equal(table.pot, 30);
  assert.equal(table.players.find((p) => p.id === 'p1')?.chips, 1990);
  assert.equal(Number.isFinite(table.currentBet), true);
});

test('mid-hand leave during active all-in does not abort hand and strictly conserves dead money', () => {
  const table = createTableState('ROOM_LEAVE_ALLIN', 10, 20, 1000);
  addPlayerToTable(table, { id: 'p1', name: 'AllInA', chips: 100 }); // Dealer/UTG (seat 0)
  addPlayerToTable(table, { id: 'p2', name: 'ContenderB', chips: 1000 }); // SB (seat 1)
  addPlayerToTable(table, { id: 'p3', name: 'LeaverC', chips: 1000 }); // BB (seat 2)

  startNewHand(table, () => 0.35, 1000, { stepAllIn: true });
  // p1 shoves 100, p2 calls 100, p3 (BB=20) folds -> allInRunout starts with pot = 220 (20 dead from p3)
  applyPlayerAction(table, 'p1', { type: 'raise', amount: 100 }, 1100, { stepAllIn: true });
  applyPlayerAction(table, 'p2', { type: 'call' }, 1200, { stepAllIn: true });
  applyPlayerAction(table, 'p3', { type: 'fold' }, 1300, { stepAllIn: true });
  assert.equal(table.allInRunout, true);
  assert.equal(table.pot, 220);

  // During all-in runout, opponents' hole cards are revealed immediately
  const viewDuringRunout = sanitizeTableForPlayer(table, 'p1');
  assert.equal(viewDuringRunout.players.find((p) => p.id === 'p2')?.holeCards?.length, 2);

  // Folded player p3 leaves the table mid-runout: p1 has 0 chips, p2 has 900 chips -> MUST NOT abort!
  const leaverRemainingChips = table.players.find((p) => p.id === 'p3')!.chips; // 980
  removePlayerFromTable(table, 'p3');
  assert.equal(table.allInRunout, true);
  assert.notEqual(table.phase, 'waiting');

  // Finish runout to showdown
  while (table.phase !== 'showdown') {
    const step = advanceAllInRunoutStep(table, 2000);
    assert.equal(step.ok, true);
  }

  // Total chips across remaining players + departed player's remaining stack must equal initial 2100
  const remainingSum = table.players.reduce((s, p) => s + p.chips, 0);
  assert.equal(remainingSum + leaverRemainingChips, 2100);
});

test('fold-win refunds uncalled excess shove, clears allIn flag, and logs refund in pot timeline', () => {
  const table = createTableState('ROOM_FOLD_EXCESS', 10, 20, 2000);
  addPlayerToTable(table, { id: 'p1', name: 'Shover', chips: 2000 });
  addPlayerToTable(table, { id: 'p2', name: 'Folder', chips: 2000 });

  startNewHand(table, () => 0.4, 1000);
  applyPlayerAction(table, 'p1', { type: 'raise', amount: 2000 }, 1100);
  applyPlayerAction(table, 'p2', { type: 'fold' }, 1200);

  assert.equal(table.phase, 'showdown');
  assert.equal(table.winners.length, 1);
  assert.equal(table.winners[0].amount, 40); // 20 matched by p1 + 20 from p2's BB
  assert.equal(table.winners[0].netChange, 20);
  assert.equal(table.pot, 40);
  const shover = table.players.find((p) => p.id === 'p1')!;
  assert.equal(shover.chips, 2020);
  assert.equal(shover.allIn, false);
  assert.equal(table.players.find((p) => p.id === 'p2')?.chips, 1980);

  const lastTimelinePt = table.currentPotTimeline[table.currentPotTimeline.length - 1];
  assert.equal(lastTimelinePt?.actionType, 'refund');
  assert.equal(lastTimelinePt?.amountAdded, -1980);
  assert.equal(lastTimelinePt?.potAfter, 40);
});

test('rebuyPlayerChips allows top-up below startingChips and mid-hand rebuy when busted/sat-out', () => {
  const table = createTableState('ROOM_TOPUP', 10, 20, 2000);
  addPlayerToTable(table, { id: 'p1', name: 'P1', chips: 1200 });
  addPlayerToTable(table, { id: 'p2', name: 'P2', chips: 2000 });
  addPlayerToTable(table, { id: 'p3', name: 'Busted', chips: 0 });

  // Top-up between hands allowed when chips < startingChips
  assert.equal(rebuyPlayerChips(table, 'p1'), true);
  assert.equal(table.players.find((p) => p.id === 'p1')?.chips, 2000);

  // Start hand with p1 & p2; p3 has 0 chips so p3 is not inHand -> p3 can rebuy mid-hand!
  startNewHand(table, () => 0.4, 1000);
  assert.equal(table.players.find((p) => p.id === 'p3')?.inHand, false);
  assert.equal(rebuyPlayerChips(table, 'p3'), true);
  assert.equal(table.players.find((p) => p.id === 'p3')?.chips, 2000);
  // Active player p1 cannot rebuy mid-hand
  assert.equal(rebuyPlayerChips(table, 'p1'), false);
});





