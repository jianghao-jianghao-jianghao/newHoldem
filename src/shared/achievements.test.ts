import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyHandToAchievementStats,
  createEmptyAchievementStats,
  formatAchievementDate,
  mergeAchievementDates,
  resolveEquippedAchievement,
  sanitizeAchievementDates,
  sanitizeAchievementIds,
  sanitizeEquippedAchievement,
  type AchievementId,
} from './achievements';

test('unlocks win streak achievements at 3 and 5 consecutive wins and resets on loss', () => {
  let stats = createEmptyAchievementStats();
  let unlocked: AchievementId[] = [];

  for (let i = 0; i < 3; i++) {
    const res = applyHandToAchievementStats(stats, unlocked, {
      won: true,
      potWon: 80,
      netChips: 40,
      wasAllIn: false,
      wonByFold: false,
      handCategory: 1,
      currentChips: 2100,
      startingChips: 2000,
      bigBlind: 20,
    });
    stats = res.nextStats;
    unlocked = res.unlocked;
  }
  assert.equal(stats.currentWinStreak, 3);
  assert.ok(unlocked.includes('first_blood'));
  assert.ok(unlocked.includes('streak_3'));
  assert.ok(!unlocked.includes('streak_5'));

  // 2 more wins -> streak 5
  for (let i = 0; i < 2; i++) {
    const res = applyHandToAchievementStats(stats, unlocked, {
      won: true,
      potWon: 80,
      netChips: 40,
      wasAllIn: false,
      wonByFold: false,
      handCategory: 2,
      currentChips: 2200,
      startingChips: 2000,
      bigBlind: 20,
    });
    stats = res.nextStats;
    unlocked = res.unlocked;
  }
  assert.ok(unlocked.includes('streak_5'));

  // Loss resets currentWinStreak but keeps already unlocked medals
  const loss = applyHandToAchievementStats(stats, unlocked, {
    won: false,
    potWon: 0,
    netChips: -40,
    wasAllIn: false,
    wonByFold: false,
    currentChips: 2160,
    startingChips: 2000,
    bigBlind: 20,
  });
  assert.equal(loss.nextStats.currentWinStreak, 0);
  assert.equal(loss.nextStats.maxWinStreak, 5);
  assert.ok(loss.unlocked.includes('streak_5'));
});

test('unlocks all-in jackpot, mega pot, hand mastery, and chip doubler medals', () => {
  const res = applyHandToAchievementStats(undefined, undefined, {
    won: true,
    potWon: 2400,
    netChips: 1200,
    wasAllIn: true,
    wonByFold: false,
    handCategory: 7, // Four of a Kind
    currentChips: 4200,
    startingChips: 2000,
    bigBlind: 20,
  });

  assert.ok(res.newlyUnlocked.includes('allin_winner'));
  assert.ok(res.newlyUnlocked.includes('allin_jackpot'));
  assert.ok(res.newlyUnlocked.includes('mega_pot'));
  assert.ok(res.newlyUnlocked.includes('trips_master'));
  assert.ok(res.newlyUnlocked.includes('flush_full'));
  assert.ok(res.newlyUnlocked.includes('royal_legend'));
  assert.ok(res.newlyUnlocked.includes('chip_doubler'));

  // Repeating identical hand does not re-emit already unlocked achievements
  const repeat = applyHandToAchievementStats(res.nextStats, res.unlocked, {
    won: true,
    potWon: 2400,
    netChips: 1200,
    wasAllIn: true,
    wonByFold: false,
    handCategory: 7,
    currentChips: 5400,
    startingChips: 2000,
    bigBlind: 20,
  });
  assert.equal(repeat.newlyUnlocked.length, 1); // Only club_tycoon via netChips >= 2000!
  assert.equal(repeat.newlyUnlocked[0], 'club_tycoon');
});

test('unlocks bluff_king after 3 fold wins', () => {
  let stats = createEmptyAchievementStats();
  let unlocked: AchievementId[] = [];
  for (let i = 0; i < 3; i++) {
    const r = applyHandToAchievementStats(stats, unlocked, {
      won: true,
      potWon: 60,
      netChips: 30,
      wasAllIn: false,
      wonByFold: true,
      currentChips: 2060,
      startingChips: 2000,
      bigBlind: 20,
    });
    stats = r.nextStats;
    unlocked = r.unlocked;
  }
  assert.ok(unlocked.includes('bluff_king'));
});

test('preserves and sanitizes achievement unlock dates without overwriting earlier timestamps', () => {
  const t1 = Date.UTC(2026, 10, 10, 12, 0, 0);
  const t2 = Date.UTC(2026, 10, 20, 8, 30, 0);

  const ids = sanitizeAchievementIds(['first_blood', 'invalid_id', 'royal_legend', 'first_blood']);
  assert.deepEqual(ids, ['royal_legend', 'first_blood']);

  const cleanDates = sanitizeAchievementDates({
    first_blood: t1,
    bogus: 12345,
    streak_3: -5,
  });
  assert.deepEqual(cleanDates, { first_blood: t1 });

  const merged = mergeAchievementDates(cleanDates, ids, ['royal_legend'], t2);
  assert.equal(merged.first_blood, t1);
  assert.equal(merged.royal_legend, t2);
  assert.match(formatAchievementDate(t1), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(formatAchievementDate(undefined), '早期解锁');
});

test('unlocks witty & tactical poker achievements (7-2 offsuit, AA rockets/cracked, air hero, ninja, bad beat, tuition, whale)', () => {
  // 1. 7-2 offsuit win + preflop steal + short stack ninja (< 10BB) + split pot
  const sevenTwoWin = applyHandToAchievementStats(undefined, undefined, {
    won: true,
    potWon: 360,
    netChips: 180,
    wasAllIn: false,
    wonByFold: true,
    communityCardsCount: 0,
    holeCards: [
      { rank: 7, suit: 'spades' },
      { rank: 2, suit: 'hearts' },
    ],
    startingHandChips: 140, // < 10 * 20 BB
    wasSplitPot: true,
    currentChips: 500,
    startingChips: 2000,
    bigBlind: 20,
  });
  assert.ok(sevenTwoWin.newlyUnlocked.includes('seven_two_legend'));
  assert.ok(sevenTwoWin.newlyUnlocked.includes('preflop_bandit'));
  assert.ok(sevenTwoWin.newlyUnlocked.includes('short_stack_ninja'));
  assert.ok(sevenTwoWin.newlyUnlocked.includes('split_peace'));

  // Suited 7-2 should NOT unlock 7-2 offsuit legend
  const suited72 = applyHandToAchievementStats(undefined, undefined, {
    won: true,
    potWon: 80,
    netChips: 40,
    wasAllIn: false,
    wonByFold: false,
    holeCards: [
      { rank: 7, suit: 'hearts' },
      { rank: 2, suit: 'hearts' },
    ],
    currentChips: 2040,
    startingChips: 2000,
    bigBlind: 20,
  });
  assert.ok(!suited72.unlocked.includes('seven_two_legend'));

  // 2. High card showdown win + Pocket Aces win + Chip Whale (4x startingChips)
  const airAndRockets = applyHandToAchievementStats(undefined, undefined, {
    won: true,
    potWon: 400,
    netChips: 200,
    wasAllIn: false,
    wonByFold: false,
    reachedShowdown: true,
    handCategory: 0, // High Card
    holeCards: [
      { rank: 14, suit: 'spades' },
      { rank: 14, suit: 'diamonds' },
    ],
    currentChips: 8200, // >= 4 * 2000
    startingChips: 2000,
    bigBlind: 20,
  });
  assert.ok(airAndRockets.newlyUnlocked.includes('high_card_hero'));
  assert.ok(airAndRockets.newlyUnlocked.includes('pocket_rockets'));
  assert.ok(airAndRockets.newlyUnlocked.includes('chip_whale'));

  // 3. Aces cracked + Bad Beat survivor (lost at showdown with Trips) + Tuition Paid (0 chips)
  const tragicLoss = applyHandToAchievementStats(undefined, undefined, {
    won: false,
    potWon: 0,
    netChips: -2000,
    wasAllIn: true,
    wonByFold: false,
    reachedShowdown: true,
    handCategory: 3, // Three of a Kind
    holeCards: [
      { rank: 14, suit: 'clubs' },
      { rank: 14, suit: 'hearts' },
    ],
    currentChips: 0,
    startingChips: 2000,
    bigBlind: 20,
  });
  assert.ok(tragicLoss.newlyUnlocked.includes('aces_cracked'));
  assert.ok(tragicLoss.newlyUnlocked.includes('bad_beat_survivor'));
  assert.ok(tragicLoss.newlyUnlocked.includes('tuition_paid'));

  // 4. Big Blind Guardian (3 BB wins) & Iron Regular (25 hands played)
  let stats = createEmptyAchievementStats();
  let unlocked: AchievementId[] = [];
  for (let i = 0; i < 25; i++) {
    const r = applyHandToAchievementStats(stats, unlocked, {
      won: i < 3,
      potWon: i < 3 ? 60 : 0,
      netChips: i < 3 ? 30 : -10,
      wasAllIn: false,
      wonByFold: false,
      isBigBlind: i < 3,
      currentChips: 2000,
      startingChips: 2000,
      bigBlind: 20,
    });
    stats = r.nextStats;
    unlocked = r.unlocked;
  }
  assert.ok(unlocked.includes('blind_guardian'));
  assert.ok(unlocked.includes('iron_regular'));
});

test('unlocks 3 consecutive showdown wins (showdown_streak_3) and resets on showdown loss', () => {
  let stats = createEmptyAchievementStats();
  let unlocked: AchievementId[] = [];

  // 2 showdown wins
  for (let i = 0; i < 2; i++) {
    const r = applyHandToAchievementStats(stats, unlocked, {
      won: true,
      potWon: 120,
      netChips: 60,
      wasAllIn: false,
      wonByFold: false,
      reachedShowdown: true,
      handCategory: 2,
      currentChips: 2120,
      startingChips: 2000,
      bigBlind: 20,
    });
    stats = r.nextStats;
    unlocked = r.unlocked;
  }
  assert.equal(stats.currentShowdownWinStreak, 2);
  assert.ok(!unlocked.includes('showdown_streak_3'));

  // A fold win does NOT count as a showdown win
  const foldWin = applyHandToAchievementStats(stats, unlocked, {
    won: true,
    potWon: 40,
    netChips: 20,
    wasAllIn: false,
    wonByFold: true,
    reachedShowdown: false,
    currentChips: 2140,
    startingChips: 2000,
    bigBlind: 20,
  });
  stats = foldWin.nextStats;
  unlocked = foldWin.unlocked;
  assert.equal(stats.currentShowdownWinStreak, 2);
  assert.ok(!unlocked.includes('showdown_streak_3'));

  // Losing a showdown resets currentShowdownWinStreak to 0
  const showdownLoss = applyHandToAchievementStats(stats, unlocked, {
    won: false,
    potWon: 0,
    netChips: -60,
    wasAllIn: false,
    wonByFold: false,
    reachedShowdown: true,
    handCategory: 1,
    currentChips: 2080,
    startingChips: 2000,
    bigBlind: 20,
  });
  stats = showdownLoss.nextStats;
  unlocked = showdownLoss.unlocked;
  assert.equal(stats.currentShowdownWinStreak, 0);

  // Now 3 consecutive showdown wins unlock showdown_streak_3
  let thirdWinUnlocked: AchievementId[] = [];
  for (let i = 0; i < 3; i++) {
    const r = applyHandToAchievementStats(stats, unlocked, {
      won: true,
      potWon: 140,
      netChips: 70,
      wasAllIn: false,
      wonByFold: false,
      reachedShowdown: true,
      handCategory: 2,
      currentChips: 2290,
      startingChips: 2000,
      bigBlind: 20,
    });
    stats = r.nextStats;
    unlocked = r.unlocked;
    thirdWinUnlocked = r.newlyUnlocked;
  }
  assert.equal(stats.currentShowdownWinStreak, 3);
  assert.ok(unlocked.includes('showdown_streak_3'));
  assert.ok(thirdWinUnlocked.includes('showdown_streak_3'));
});

test('unlocks iconic starting hand achievements (10-2 Doyle, AK Big Slick, KK Cowboys, 88 Snowmen, suited connector)', () => {
  const doyle = applyHandToAchievementStats(undefined, undefined, {
    won: true,
    potWon: 200,
    netChips: 100,
    wasAllIn: false,
    wonByFold: false,
    reachedShowdown: true,
    holeCards: [
      { rank: 10, suit: 'spades' },
      { rank: 2, suit: 'hearts' },
    ],
    currentChips: 2100,
    startingChips: 2000,
    bigBlind: 20,
  });
  assert.ok(doyle.newlyUnlocked.includes('doyle_brunson'));
  assert.ok(!doyle.unlocked.includes('suited_connector_art'));

  const akSuited = applyHandToAchievementStats(undefined, undefined, {
    won: true,
    potWon: 240,
    netChips: 120,
    wasAllIn: false,
    wonByFold: false,
    reachedShowdown: true,
    holeCards: [
      { rank: 14, suit: 'spades' },
      { rank: 13, suit: 'spades' },
    ],
    currentChips: 2120,
    startingChips: 2000,
    bigBlind: 20,
  });
  assert.ok(akSuited.newlyUnlocked.includes('big_slick_win'));
  assert.ok(akSuited.newlyUnlocked.includes('suited_connector_art'));

  const kk = applyHandToAchievementStats(undefined, undefined, {
    won: true,
    potWon: 180,
    netChips: 90,
    wasAllIn: false,
    wonByFold: true,
    holeCards: [
      { rank: 13, suit: 'hearts' },
      { rank: 13, suit: 'diamonds' },
    ],
    currentChips: 2090,
    startingChips: 2000,
    bigBlind: 20,
  });
  assert.ok(kk.newlyUnlocked.includes('cowboys_win'));

  const snowmen = applyHandToAchievementStats(undefined, undefined, {
    won: true,
    potWon: 160,
    netChips: 80,
    wasAllIn: false,
    wonByFold: false,
    reachedShowdown: true,
    holeCards: [
      { rank: 8, suit: 'clubs' },
      { rank: 8, suit: 'spades' },
    ],
    currentChips: 2080,
    startingChips: 2000,
    bigBlind: 20,
  });
  assert.ok(snowmen.newlyUnlocked.includes('snowmen_win'));

  // Offsuit connector should NOT unlock suited_connector_art
  const offsuitConnector = applyHandToAchievementStats(undefined, undefined, {
    won: true,
    potWon: 120,
    netChips: 60,
    wasAllIn: false,
    wonByFold: false,
    reachedShowdown: true,
    holeCards: [
      { rank: 9, suit: 'clubs' },
      { rank: 10, suit: 'diamonds' },
    ],
    currentChips: 2060,
    startingChips: 2000,
    bigBlind: 20,
  });
  assert.ok(!offsuitConnector.unlocked.includes('suited_connector_art'));
});

test('sanitizeEquippedAchievement and resolveEquippedAchievement enforce single equipped medal rules', () => {
  assert.equal(sanitizeEquippedAchievement('none'), 'none');
  assert.equal(sanitizeEquippedAchievement('allin_winner'), 'allin_winner');
  assert.equal(sanitizeEquippedAchievement('not_a_real_medal'), undefined);
  assert.equal(sanitizeEquippedAchievement(null), undefined);

  // Explicit unlocked medal wins over higher-priority unlocked medal
  assert.equal(
    resolveEquippedAchievement('first_blood', ['royal_legend', 'first_blood']),
    'first_blood'
  );

  // Explicit 'none' returns null even when unlocked medals exist
  assert.equal(
    resolveEquippedAchievement('none', ['royal_legend', 'first_blood']),
    null
  );

  // Undefined or not-yet-unlocked preference falls back to highest-priority unlocked medal
  assert.equal(
    resolveEquippedAchievement(undefined, ['first_blood', 'royal_legend']),
    'royal_legend'
  );
  assert.equal(
    resolveEquippedAchievement('mega_pot', ['first_blood', 'streak_3']),
    'streak_3'
  );

  // Empty unlocked list always resolves to null
  assert.equal(resolveEquippedAchievement('first_blood', []), null);
  assert.equal(resolveEquippedAchievement(undefined, []), null);
});



